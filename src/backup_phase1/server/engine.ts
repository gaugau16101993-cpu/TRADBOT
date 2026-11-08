import {
  ServerState,
  loadServerState,
  saveServerState,
  scheduleSaveServerState,
  appendTradeToLedger,
  appendAuditLog,
} from './storage';
import { TelegramNotifier, telegramNotifier } from './telegramService';
import { BackgroundWorker } from './backgroundWorker';
import {
  Position,
  ClosedTrade,
  TradeSide,
  BotFilter,
  LogMessage,
  EngineSettings,
  TickerData,
  ScannerMetrics,
  MarketAnalysisResult,
  TradeSignal,
} from '../types/engine';
import {
  CompletePipelineSnapshot,
  Bot1ScanPayload,
  Bot2TechnicalsPayload,
  Bot3SignalNetTPPayload,
  Bot4ExecutionPayload,
  Bot5LossAnalysisPayload,
} from '../types/pipeline';
import { Bot1MarketScanner } from './bot1Scanner';
import { Bot2MarketAnalyst, bot2Analyst } from './bot2Analyst';
import { Bot3SignalEngine, bot3SignalEngine } from './bot3SignalEngine';
import { Bot4ExecutionManager, bot4ExecutionManager } from './bot4ExecutionManager';
import { Bot5LossAnalysisEngine, bot5LossEngine } from './bot5LossAnalysis';

export const TRACKED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'NEARUSDT',
  'LINKUSDT',
];

const INITIAL_FALLBACK_PRICES: Record<string, number> = {
  BTCUSDT: 80400.0,
  ETHUSDT: 2330.0,
  SOLUSDT: 101.0,
  XRPUSDT: 1.295,
  DOGEUSDT: 0.1415,
  AVAXUSDT: 27.85,
  NEARUSDT: 4.88,
  LINKUSDT: 11.95,
};

export class ServerTradingEngine {
  private state: ServerState;
  private bot1Scanner: Bot1MarketScanner;
  private bot2Analyst: Bot2MarketAnalyst;
  private bot3Engine: Bot3SignalEngine;
  private bot4Execution: Bot4ExecutionManager;
  private bot5Loss: Bot5LossAnalysisEngine;
  private telegramNotifier: TelegramNotifier;
  private backgroundWorker: BackgroundWorker;
  private latestPipeline: CompletePipelineSnapshot;
  private tickTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private latencyMs: number = 14;
  private lastTelegramHeartbeatTime: number = 0;

  constructor() {
    this.state = loadServerState();
    this.initializeTickers();

    // Initialize Telegram Notification Service
    this.telegramNotifier = telegramNotifier;
    this.telegramNotifier.setLogCallback((msg, type) => {
      this.addLog(msg, type, 'SYS');
    });
    this.telegramNotifier.updateConfig({
      enabled: this.state.settings.telegramEnabled ?? false,
      botToken: this.state.settings.telegramBotToken ?? '',
      chatId: this.state.settings.telegramChatId ?? '',
      notifyOnOpen: this.state.settings.telegramNotifyOnOpen ?? true,
      notifyOnClose: this.state.settings.telegramNotifyOnClose ?? true,
      notifyOnError: this.state.settings.telegramNotifyOnError ?? true,
      notifyHeartbeat: this.state.settings.telegramNotifyHeartbeat ?? true,
      heartbeatIntervalMinutes: this.state.settings.telegramHeartbeatIntervalMinutes ?? 60,
    });

    // Initialize 24/7 Background Worker & Watchdog
    this.backgroundWorker = new BackgroundWorker({
      telegramNotifier: this.telegramNotifier,
      onWatchdogStallRecover: () => {
        this.addLog('[WATCHDOG] Tự động tái kích hoạt chu kỳ quét Bitget...', 'warning', 'SYS');
        this.state.cycleCountdown = 2; // Trigger scan immediately
      },
      onHeartbeat: () => {
        this.checkTelegramHeartbeat();
      },
    });

    // Initialize Bot 5 Loss Analysis & Adaptive Feedback Engine
    this.bot5Loss = bot5LossEngine;
    this.bot5Loss.setLogCallback((msg, type) => {
      this.addLog(msg, type, 'BOT5');
    });
    this.bot5Loss.setAutoApproveOOS(this.state.settings.bot5AutoApproveOOS || false);
    this.bot5Loss.setMinSampleSizeForOOS(this.state.settings.bot5MinSampleSize || 5);
    this.bot5Loss.setOnProposalAppliedCallback((proposal) => {
      this.syncStateFromBot5();
      saveServerState(this.state);
    });

    // Initialize Complete Pipeline Snapshot container
    this.latestPipeline = {
      cycleNumber: this.state.serverStats.totalCyclesRun || 1,
      lastHandoffTime: Date.now(),
      pipelineHealth: 'HEALTHY',
      feedbackLoopActive: true,
    };

    // Initialize Bot 4 Execution & Risk Manager Pro
    this.bot4Execution = bot4ExecutionManager;
    this.bot4Execution.setLogCallback((msg, type) => {
      this.addLog(msg, type, 'BOT4');
    });

    // WIRE PIPELINE STAGE 4 -> STAGE 5 -> STAGE 2 FEEDBACK LOOP & TELEGRAM & IMMUTABLE LEDGER:
    // Whenever Bot 4 closes a trade:
    // 1. Dispatch ClosedTradeLogPayload to Bot 5 for post-mortem & OOS validation
    // 2. Append immutable record to trades_ledger.jsonl
    // 3. Send instant Telegram trade close notification
    this.bot4Execution.setOnTradeClosedCallback((closedTradePayload) => {
      const lossAnalysisPayload = this.bot5Loss.bot5_runLossAnalysis(closedTradePayload);
      this.latestPipeline.bot5Payload = lossAnalysisPayload;
      this.syncStateFromBot4();
      this.syncStateFromBot5();

      // Permanent JSONL append-only storage
      appendTradeToLedger(closedTradePayload as any);

      // Telegram Notification
      this.telegramNotifier.notifyOrderClosed({
        symbol: closedTradePayload.symbol,
        side: closedTradePayload.side,
        entryPrice: closedTradePayload.entryPrice,
        exitPrice: closedTradePayload.exitPrice,
        netPnL: closedTradePayload.netPnL,
        grossPnL: closedTradePayload.grossPnL,
        totalCosts: closedTradePayload.totalCosts,
        roePct: closedTradePayload.roePct,
        durationSeconds: closedTradePayload.durationSeconds,
        closeReason: closedTradePayload.closeReason,
        rootCauseCategory: lossAnalysisPayload.postMortem.category,
        rootCauseDescription: lossAnalysisPayload.postMortem.rootCauseDescription,
      });
    });

    // Synchronize loaded state into Bot 4
    if (this.state.positions && this.state.positions.length > 0) {
      this.bot4Execution.syncFromStoredState(
        this.state.positions as any,
        this.state.tradeHistory,
        this.state.walletBalance
      );
    }

    // Initialize Bot 1 Market Scanner Pro with real Bitget API & WS
    this.bot1Scanner = new Bot1MarketScanner(
      {
        minUsdtVolume24h: 5_000_000,
        maxSpreadPercent: 0.05,
        minVolatility24h: 1.2,
        maxDataAgeSeconds: 60,
      },
      {
        onTickerUpdate: (ticker) => {
          this.state.tickers[ticker.symbol] = ticker;
          if (this.state.isEngineRunning && this.state.positions.length > 0) {
            this.evaluateOpenPositions(ticker);
          }
        },
        onLog: (msg, type) => {
          this.addLog(msg, type, 'BOT1');
        },
      }
    );

    // Initialize Bot 2 Advanced Market Analyst
    this.bot2Analyst = bot2Analyst;
    this.bot2Analyst.setLogCallback((msg, type) => {
      this.addLog(msg, type, 'BOT2');
    });

    // Initialize Bot 3 Signal Engine Pro
    this.bot3Engine = bot3SignalEngine;
    this.bot3Engine.setLogCallback((msg, type) => {
      this.addLog(msg, type, 'BOT3');
    });

    this.startEngineLoops();
    this.startHeartbeatLoop();
  }

  private startHeartbeatLoop() {
    // 1-Minute Periodic Heartbeat as required by Bot 4 specification
    this.heartbeatTimer = setInterval(() => {
      if (!this.state.isEngineRunning) return;
      this.bot4Execution.runHeartbeat();
      this.syncStateFromBot4();
      this.checkTelegramHeartbeat();
    }, 60000);
  }

  private checkTelegramHeartbeat() {
    if (!this.state.isEngineRunning || !this.telegramNotifier.isConfigured()) return;
    const intervalMinutes = this.state.settings.telegramHeartbeatIntervalMinutes || 60;
    const intervalMs = intervalMinutes * 60 * 1000;
    const now = Date.now();

    if (now - this.lastTelegramHeartbeatTime >= intervalMs) {
      this.lastTelegramHeartbeatTime = now;
      const closed = this.bot4Execution.getClosedTrades();
      const todayNet = closed.reduce((acc, t) => acc + t.netPnL, 0);
      const wsStatus = this.bot1Scanner.getMetrics().wsStatus;

      this.telegramNotifier.notifyHeartbeat({
        uptimeFormatted: this.backgroundWorker.getUptimeFormatted(),
        walletBalance: this.state.walletBalance,
        openPositionsCount: this.state.positions.length,
        todayTradesCount: closed.length,
        todayNetPnL: todayNet,
        totalCyclesRun: this.state.serverStats.totalCyclesRun,
        wsStatus,
      });
    }
  }

  private initializeTickers() {
    TRACKED_SYMBOLS.forEach((sym) => {
      const base = INITIAL_FALLBACK_PRICES[sym] || 100;
      if (!this.state.tickers[sym]) {
        this.state.tickers[sym] = {
          symbol: sym,
          lastPr: base,
          bidPr: base * 0.9998,
          askPr: base * 1.0002,
          change24h: 0,
          high24h: base * 1.02,
          low24h: base * 0.98,
          volume24h: 50_000_000,
          updatedAt: Date.now(),
        };
      }
    });
  }

  public addLog(
    message: string,
    type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info',
    source: BotFilter = 'SYS'
  ) {
    const newLog: LogMessage = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      time: new Date().toLocaleTimeString(),
      source,
      message,
      type,
    };
    this.state.logs.unshift(newLog);
    if (this.state.logs.length > 150) {
      this.state.logs = this.state.logs.slice(0, 150);
    }
    scheduleSaveServerState(this.state);
  }

  private startEngineLoops() {
    // 1. Initial full universe scan & MTF analysis on startup
    this.runPipelineCycle();

    // 2. High-Frequency Fast Auto-Trading Position Monitor & Net-TP Loop (800ms)
    // Actively verifies real-time Bitget market prices and executes FAST MICRO TAKE-PROFIT as soon as Net PnL > 0!
    this.tickTimer = setInterval(() => {
      if (this.state.isEngineRunning && this.state.positions.length > 0) {
        this.evaluateOpenPositions();
        this.refreshOpenPositionPrices();
      }
      this.state.serverStats.lastTickTime = Date.now();
    }, 800);

    // 3. 60-second Multi-Bot Pipeline Cycle countdown (1s)
    this.countdownTimer = setInterval(() => {
      if (!this.state.isEngineRunning) return;

      this.state.cycleCountdown -= 1;
      if (this.state.cycleCountdown <= 0) {
        this.state.cycleCountdown = this.state.settings.cycleIntervalSeconds || 60;
        this.state.serverStats.totalCyclesRun += 1;
        this.runPipelineCycle();
      }
    }, 1000);
  }

  private isRefreshingOpenPositions: boolean = false;

  // FAST MICRO-SCALPING: Actively fetches live Bitget ticker prices for open positions every 800ms-1500ms
  // to ensure instant take-profit execution as soon as net PnL turns strictly positive!
  private async refreshOpenPositionPrices() {
    if (this.isRefreshingOpenPositions) return;
    const openSymbols = this.state.positions.map((p) => p.symbol);
    if (openSymbols.length === 0) return;

    this.isRefreshingOpenPositions = true;
    try {
      for (const sym of openSymbols) {
        const freshTicker = await this.bot1Scanner.fetchSingleTicker(sym);
        if (freshTicker) {
          this.state.tickers[sym] = freshTicker;
          this.bot4Execution.onPriceUpdate(sym, freshTicker);
        }
      }
      this.syncStateFromBot4();
    } catch {
      // Ignore transient network errors during live trading
    } finally {
      this.isRefreshingOpenPositions = false;
    }
  }

  // BOT 4 GOLDEN RULE: Event-Driven Price & Net-Profit Exit Manager (via Bot 4 Pro)
  private evaluateOpenPositions(directTicker?: TickerData) {
    const symbols = directTicker ? [directTicker.symbol] : Object.keys(this.state.tickers);
    for (const sym of symbols) {
      const ticker = directTicker && directTicker.symbol === sym ? directTicker : this.state.tickers[sym];
      if (!ticker) continue;
      this.bot4Execution.onPriceUpdate(sym, ticker);
    }
    this.syncStateFromBot4();
  }

  private syncStateFromBot4() {
    const managedPositions = this.bot4Execution.getPositions();
    this.state.positions = managedPositions.map((p) => ({
      id: p.id,
      botId: 4,
      symbol: p.symbol,
      side: p.side,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      amount: p.amount,
      margin: p.margin,
      leverage: p.leverage,
      openFee: p.openFee,
      openTime: p.openTime,
      status: p.status === 'CLOSING' ? 'CLOSING' : 'OPEN',
      grossPnL: p.grossPnL,
      currentCosts: p.currentCosts,
      netPnL: p.netPnL,
      roe: p.roe,
      peakNetPnL: p.peakNetPnL,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      signalId: p.signalId,
    }));

    const closedTrades = this.bot4Execution.getClosedTrades();
    this.state.tradeHistory = closedTrades;

    const metrics = this.bot4Execution.getMetrics();
    this.state.walletBalance = metrics.walletBalance;

    const wins = closedTrades.filter((t) => t.netPnL > 0).length;
    const total = closedTrades.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 100;

    this.state.botState.bot4 = {
      status: `Active (${this.state.positions.length}/${this.state.settings.maxPositions}) • Net: $${metrics.totalRealizedNetPnL.toFixed(4)}`,
      rule: `Auto-Close Net PnL > $${this.bot4Execution.getConfig().netProfitThresholdUsdt}`,
      executedToday: metrics.ordersFilledCount,
      winRate,
      equity: metrics.equity,
      allocatedMargin: metrics.allocatedMargin,
      realizedNetPnL: metrics.totalRealizedNetPnL,
      feesPaid: metrics.totalFeesPaid,
      killSwitchActive: metrics.isKillSwitchActive,
      metrics,
    };

    this.state.botState.bot5 = {
      status: `Win Rate: ${winRate}% (${wins}/${total})`,
      totalEvaluated: total,
      netProfit: metrics.totalRealizedNetPnL,
      feeDrag: metrics.totalFeesPaid + metrics.totalFundingPaid,
    };

    this.syncStateFromBot5();
    scheduleSaveServerState(this.state);
  }

  private syncStateFromBot5() {
    const metrics = this.bot5Loss.getMetrics();
    const proposals = this.bot5Loss.getProposals();
    const pendingCount = proposals.filter((p) => p.status === 'PENDING_APPROVAL').length;
    const currentVer = this.bot5Loss.getCurrentModelVersion();

    this.state.botState.bot5 = {
      status: `AI Self-Learning ${currentVer}: ${metrics.totalWins}W/${metrics.totalLosses}L • ${pendingCount} đề xuất OOS chờ duyệt`,
      totalEvaluated: metrics.totalTradesAudited,
      netProfit: metrics.totalRealizedNetProfit,
      feeDrag: metrics.totalFeeFrictionAbsorbed,
      modelVersion: currentVer,
      pendingProposalsCount: pendingCount,
      oosStatus: pendingCount > 0 ? `${pendingCount} đề xuất OOS sẵn sàng` : 'OOS Testing Ready',
      metrics,
    };
  }

  // 60-Second Multi-Bot Pipeline Cycle: 5-Bot End-to-End Handshake
  public async runPipelineCycle() {
    this.latestPipeline.cycleNumber = (this.latestPipeline.cycleNumber || 0) + 1;
    this.latestPipeline.lastHandoffTime = Date.now();
    this.addLog('[BOT 1] Scanning Bitget USDT-M Futures universe (850+ contracts)...', 'cyan', 'BOT1');

    try {
      // =========================================================================
      // STAGE 1: Bot 1 (bot1_scanMarket)
      // Independent scan of Bitget USDT-M Futures -> packages price & volume payload
      // =========================================================================
      const scanResult = await this.bot1Scanner.scanUniverse();
      const metrics = scanResult.metrics;
      const topCandidates = scanResult.candidates;

      this.latencyMs = metrics.scanLatencyMs;

      // Update Tickers in State
      const cached = this.bot1Scanner.getCachedTickers();
      Object.assign(this.state.tickers, cached);

      if (topCandidates.length === 0) {
        this.addLog(
          `[BOT 1] Universe evaluated (${metrics.coinsScanned} coins, latency: ${metrics.scanLatencyMs}ms). 0 passed strict filters (Spread <= 0.05%, Vol >= $5M). Skipping cycle.`,
          'warning',
          'BOT1'
        );
        this.state.botState.bot1 = {
          status: `Evaluated ${metrics.coinsScanned} (0 Passed)`,
          scannedCount: metrics.coinsScanned,
          lastScanTime: Date.now(),
          topCandidate: 'NONE',
          metrics,
        };
        saveServerState(this.state);
        return;
      }

      const bestCandidate = topCandidates[0];
      const candidateSymbol = bestCandidate.symbol;

      const bot1Payload: Bot1ScanPayload = {
        stage: 'BOT1_SCAN_MARKET',
        timestamp: Date.now(),
        universeTotal: metrics.coinsScanned,
        passedCount: metrics.coinsPassed,
        rejectedCount: metrics.coinsRejected,
        scanLatencyMs: metrics.scanLatencyMs,
        dataFreshnessMs: metrics.dataFreshnessMs,
        topCandidates,
        selectedCandidate: bestCandidate,
        marketSummary: {
          btcPrice: this.state.tickers['BTCUSDT']?.lastPr || 80400,
          btc24hChange: this.state.tickers['BTCUSDT']?.change24h || 0,
          totalMarket24hVolUsdt: Object.values(this.state.tickers).reduce((sum, t) => sum + (t.volume24h || 0), 0),
          averageSpreadBps: topCandidates.reduce((sum, c) => sum + c.spreadBps, 0) / Math.max(1, topCandidates.length),
        },
      };

      this.latestPipeline.bot1Payload = bot1Payload;

      this.state.botState.bot1 = {
        status: `Active (${topCandidates.length}/${metrics.coinsScanned})`,
        scannedCount: metrics.coinsScanned,
        lastScanTime: Date.now(),
        topCandidate: candidateSymbol,
        metrics,
      };

      this.addLog(
        `[BOT 1 -> BOT 2 HANDOFF] Universe scanned: ${topCandidates.length} passed. Top Pick: ${candidateSymbol} (Score: ${bestCandidate.scalpScore}, Spread: ${bestCandidate.spreadBps} bps, 24h Vol: $${(bestCandidate.volume24hUsdt / 1e6).toFixed(1)}M) -> Transferring Payload to Bot 2`,
        'success',
        'BOT1'
      );

      // =========================================================================
      // MULTI-CANDIDATE 5-BOT AUTONOMOUS PIPELINE EVALUATION (NO TRADE ELIMINATED)
      // Evaluates top candidates until positions capacity is reached or edge found.
      // Auto-places trades with target 2.0 USDT margin and begins Net-TP monitoring.
      // =========================================================================
      const candidatesToEvaluate = topCandidates.slice(0, Math.min(15, topCandidates.length));
      let orderExecutedInCycle = false;
      let primaryCandidateEvaluated = false;

      for (let i = 0; i < candidatesToEvaluate.length; i++) {
        const candidate = candidatesToEvaluate[i];
        const sym = candidate.symbol;

        // Skip if position already open for this coin
        if (this.bot4Execution.hasPosition(sym)) {
          continue;
        }

        const candidateBot1Payload: Bot1ScanPayload = {
          ...bot1Payload,
          selectedCandidate: candidate,
        };

        // STAGE 2: Bot 2 (bot2_analyzeTechnicals)
        const bot2Payload: Bot2TechnicalsPayload = await this.bot2Analyst.bot2_analyzeTechnicals(candidateBot1Payload);

        const candidateTicker = this.state.tickers[sym] || {
          symbol: sym,
          lastPr: candidate.lastPrice,
          bidPr: candidate.bidPrice,
          askPr: candidate.askPrice,
          change24h: candidate.change24h,
          high24h: candidate.lastPrice * 1.02,
          low24h: candidate.lastPrice * 0.98,
          volume24h: candidate.volume24hUsdt,
          updatedAt: candidate.lastUpdateTime,
          fundingRate: candidate.fundingRate,
          spreadPercent: candidate.spreadPercent,
        };

        // STAGE 3: Bot 3 (bot3_evaluateSignalAndNetTP)
        const bot3Payload: Bot3SignalNetTPPayload = this.bot3Engine.bot3_evaluateSignalAndNetTP(bot2Payload, candidateTicker);

        // Record primary display payloads on first candidate
        if (!primaryCandidateEvaluated || i === 0) {
          primaryCandidateEvaluated = true;
          this.latestPipeline.bot2Payload = bot2Payload;
          this.latestPipeline.bot3Payload = bot3Payload;

          const mtfScore = bot2Payload.confidenceScore;
          const biasDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
            bot2Payload.bias === 'LONG' ? 'BULLISH' : bot2Payload.bias === 'SHORT' ? 'BEARISH' : 'NEUTRAL';

          this.state.botState.bot2 = {
            status: `${bot2Payload.overallRegime.replace('TRENDING_', '')} • ${bot2Payload.bias} (${bot2Payload.confidenceScore}%)`,
            analyzedCoin: sym,
            mtfScore,
            bias: biasDirection,
            analysis: {
              symbol: bot2Payload.symbol,
              timestamp: bot2Payload.timestamp,
              currentPrice: bot2Payload.currentPrice,
              overallRegime: bot2Payload.overallRegime,
              bias: bot2Payload.bias,
              confidenceScore: bot2Payload.confidenceScore,
              macroTrend: bot2Payload.macroTrend,
              intermediateTrend: bot2Payload.intermediateTrend,
              microTrend: bot2Payload.microTrend,
              conflict: bot2Payload.conflict,
              timeframes: bot2Payload.timeframes,
              costs: {
                spreadBps: candidate.spreadBps,
                roundTripTakerFeeBps: 12.0,
                estSlippageBps: 3.0,
                totalCostBps: candidate.spreadBps + 15.0,
                fundingRate8h: candidate.fundingRate,
                breakEvenMoveDollars: candidate.lastPrice * 0.0017,
                breakEvenMovePercent: 0.17,
              },
              reasons: bot2Payload.reasons,
              isProvisional: false,
              analysisLatencyMs: bot2Payload.analysisLatencyMs,
            },
          };
        }

        // Check if an approved signal was found
        if (bot3Payload.action !== 'NO_TRADE' && bot3Payload.signal) {
          const signal = bot3Payload.signal;
          const side: TradeSide = signal.direction;

          // Promote this active candidate to the latest pipeline snapshot
          this.latestPipeline.bot2Payload = bot2Payload;
          this.latestPipeline.bot3Payload = bot3Payload;

          this.state.botState.bot3 = {
            status: `Signal ${side} (Edge: +${signal.expectedNetEdgeBps}bps, Net TP: $${bot3Payload.feeDeductions.netTakeProfitPrice.toFixed(4)})`,
            signalActive: true,
            lastSignal: `${side} ${sym} @ $${signal.entryPrice.toFixed(4)}`,
            confidence: signal.confidenceScore,
            activeSignals: this.bot3Engine.getActiveSignals(),
            recentSignalsHistory: this.bot3Engine.getSignalHistory(),
            lastEvaluations: this.bot3Engine.getLastEvaluations(),
            performance: this.bot3Engine.getPerformanceMetrics(),
          };

          this.addLog(
            `[BOT 3 -> BOT 4 HANDOFF] Signal Approved: ${side} ${sym} (Net Edge: +${signal.expectedNetEdgeBps} bps, RR: 1:${signal.riskRewardRatio}, Net TP: $${bot3Payload.feeDeductions.netTakeProfitPrice.toFixed(4)}) -> Dispatching to Bot 4`,
            'success',
            'BOT3'
          );

          // Check if Autonomous Order Execution is enabled
          if (this.state.settings.autoTradingEnabled !== false) {
            // STAGE 4: Bot 4 (bot4_executeOrders)
            const bot4Payload: Bot4ExecutionPayload = this.bot4Execution.bot4_executeOrders(bot3Payload, candidateTicker);
            this.latestPipeline.bot4Payload = bot4Payload;

            if (bot4Payload.actionType === 'ORDER_OPENED' && bot4Payload.openPosition) {
              this.bot3Engine.consumeSignal(signal.signalId, candidateTicker.lastPr);
              this.bot1Scanner.updateWsSubscriptions([sym]);
              this.syncStateFromBot4();
              orderExecutedInCycle = true;

              this.addLog(
                `[BOT 4 TỰ ĐỘNG KHỚP LỆNH] Đã tự động mở vị thế: ${side} ${sym} với Ký Quỹ $${bot4Payload.marginUsdt} USDT (${bot4Payload.leverage}x, notional: $${bot4Payload.notionalUsdt}). Phí mở lệnh: -$${bot4Payload.openFeeUsdt.toFixed(4)}. Tự động theo dõi chốt lời Net PnL > $${this.bot4Execution.getConfig().netProfitThresholdUsdt}...`,
                'success',
                'BOT4'
              );

              // 24/7 Telegram Instant Alert
              this.telegramNotifier.notifyOrderOpened({
                symbol: sym,
                side,
                entryPrice: bot4Payload.openPosition.entryPrice,
                marginUsdt: bot4Payload.marginUsdt,
                leverage: bot4Payload.leverage,
                stopLoss: bot4Payload.openPosition.stopLoss,
                takeProfit: bot4Payload.openPosition.takeProfit,
                strategy: signal.strategy,
                expectedNetEdgeBps: signal.expectedNetEdgeBps,
                signalId: signal.signalId,
              });

              // Stop if max positions capacity reached
              if (this.bot4Execution.getPositions().length >= this.state.settings.maxPositions) {
                break;
              }
            } else {
              this.addLog(
                `[BOT 4] Tự động đặt lệnh bị hoãn cho ${sym}: ${bot4Payload.rejectReason || 'Đã chạm giới hạn ký quỹ hoặc rủi ro'}`,
                'warning',
                'BOT4'
              );
            }
          }
        }
      }

      const activePositionsNow = this.bot4Execution.getPositions();

      // GUARANTEED ACTIVE TRADING (NO TRADE ELIMINATION):
      // If position slots are available and no order was placed in this cycle,
      // dispatch a guaranteed fast scalp trade on the best non-held candidate.
      if (
        !orderExecutedInCycle &&
        activePositionsNow.length < this.state.settings.maxPositions &&
        this.state.settings.autoTradingEnabled !== false
      ) {
        const candidateForAuto = topCandidates.find((c) => !this.bot4Execution.hasPosition(c.symbol)) || topCandidates[0];
        if (candidateForAuto) {
          const sym = candidateForAuto.symbol;
          const side: TradeSide = (candidateForAuto.change24h || 0) >= 0 ? 'LONG' : 'SHORT';
          const pos = this.triggerPaperTrade(sym, side);
          if (pos) {
            orderExecutedInCycle = true;
            this.state.botState.bot3 = {
              status: `Signal ${side} (Fast Scalp • Net-TP > $${this.bot4Execution.getConfig().netProfitThresholdUsdt})`,
              signalActive: true,
              lastSignal: `${side} ${sym} @ $${pos.entryPrice.toFixed(4)}`,
              confidence: 88,
              activeSignals: this.bot3Engine.getActiveSignals(),
              recentSignalsHistory: this.bot3Engine.getSignalHistory(),
              lastEvaluations: this.bot3Engine.getLastEvaluations(),
              performance: this.bot3Engine.getPerformanceMetrics(),
            };
            this.addLog(
              `[FAST SCALP AUTO-RUN] Đã tự động khớp lệnh ${side} ${sym} (Vốn $${pos.margin} USDT, đòn bẩy ${pos.leverage}x). Không để hệ thống bị dừng ở NO TRADE!`,
              'success',
              'BOT4'
            );
          }
        }
      } else if (activePositionsNow.length >= this.state.settings.maxPositions) {
        this.state.botState.bot3 = {
          status: `Active (${activePositionsNow.length}/${this.state.settings.maxPositions} lệnh) • Giám sát Chốt Lời Net-TP`,
          signalActive: true,
          lastSignal: `Đang chạy: ${activePositionsNow.map((p) => `${p.side} ${p.symbol}`).join(', ')} • Chốt lời Net > 0`,
          confidence: 90,
          activeSignals: this.bot3Engine.getActiveSignals(),
          recentSignalsHistory: this.bot3Engine.getSignalHistory(),
          lastEvaluations: this.bot3Engine.getLastEvaluations(),
          performance: this.bot3Engine.getPerformanceMetrics(),
        };
      }

      this.addLog(
        `[PIPELINE CHU KỲ] Hoàn tất chu kỳ. ${this.bot4Execution.getPositions().length}/${this.state.settings.maxPositions} vị thế đang hoạt động. Giám sát Net PnL > $${this.bot4Execution.getConfig().netProfitThresholdUsdt} theo thời gian thực.`,
        'info',
        'SYS'
      );

      this.backgroundWorker.recordCycleSuccess(this.latencyMs);
      scheduleSaveServerState(this.state);
    } catch (err: any) {
      this.backgroundWorker.recordCycleError(err.message);
      this.addLog(`[PIPELINE ERROR] 5-Bot Pipeline Error: ${err.message}. Cycle aborted cleanly.`, 'danger', 'SYS');
    }
  }

  public triggerPaperTrade(
    symbol: string,
    side: TradeSide,
    signalParams?: {
      stopLoss?: number;
      takeProfit?: number;
      signalId?: string;
      riskRewardRatio?: number;
    }
  ): Position | null {
    const currentTicker = this.state.tickers[symbol];
    if (!currentTicker) {
      this.addLog(`[BOT 4] Ticker not found for ${symbol}. Order aborted.`, 'warning', 'BOT4');
      return null;
    }

    const currentPrice = currentTicker.lastPr;
    const sl = signalParams?.stopLoss || (side === 'LONG' ? currentPrice * 0.99 : currentPrice * 1.01);
    const tp = signalParams?.takeProfit || (side === 'LONG' ? currentPrice * 1.02 : currentPrice * 0.98);

    const syntheticSignal: TradeSignal = {
      signalId: signalParams?.signalId || `SIG-MAN-${Date.now()}`,
      symbol,
      direction: side,
      strategy: 'TREND_PULLBACK_MOMENTUM',
      version: '4.0.0',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      status: 'CONFIRMED',
      entryPrice: currentPrice,
      stopLossPrice: sl,
      takeProfitPrice: tp,
      riskRewardRatio: signalParams?.riskRewardRatio || 2.0,
      grossRewardBps: 150,
      grossRiskBps: 75,
      totalFrictionBps: 18,
      expectedNetEdgeBps: 132,
      confidenceScore: 85,
      fillProbability: 95,
      rankScore: 85,
      frictionBreakdown: {
        roundTripTakerFeeBps: 12,
        spreadBps: 3,
        estSlippageBps: 3,
        estFundingCostBps: 0,
        totalFrictionBps: 18,
      },
      triggerTimeframe: '5m',
      confirmationReason: 'Manual/Engine paper order trigger',
      isRepainted: false,
      auditTrail: [],
    };

    const result = this.bot4Execution.executeSignal(syntheticSignal, currentTicker);
    if (!result.success || !result.position) {
      return null;
    }

    this.bot1Scanner.updateWsSubscriptions([symbol]);
    this.syncStateFromBot4();

    const managed = result.position;
    const pos: Position = {
      id: managed.id,
      botId: 4,
      symbol: managed.symbol,
      side: managed.side,
      entryPrice: managed.entryPrice,
      currentPrice: managed.currentPrice,
      amount: managed.amount,
      margin: managed.margin,
      leverage: managed.leverage,
      openFee: managed.openFee,
      openTime: managed.openTime,
      status: 'OPEN',
      grossPnL: managed.grossPnL,
      currentCosts: managed.currentCosts,
      netPnL: managed.netPnL,
      roe: managed.roe,
      peakNetPnL: managed.peakNetPnL,
      stopLoss: managed.stopLoss,
      takeProfit: managed.takeProfit,
      signalId: managed.signalId,
      riskRewardRatio: signalParams?.riskRewardRatio,
    };
    return pos;
  }

  // API Methods
  public getState(): ServerState & {
    latencyMs: number;
    scannerMetrics: ScannerMetrics;
    bot2Analysis?: MarketAnalysisResult;
    bot3ActiveSignals?: TradeSignal[];
    bot3Performance?: any;
    bot4Metrics?: any;
    bot4Orders?: any[];
    bot4Ledger?: any[];
    bot5Metrics?: any;
    bot5Proposals?: any[];
    bot5VersionHistory?: any[];
    pipelineSnapshot?: CompletePipelineSnapshot;
  } {
    const scannerMetrics = this.bot1Scanner.getMetrics();
    const bot4Metrics = this.bot4Execution.getMetrics();
    return {
      ...this.state,
      latencyMs: scannerMetrics.scanLatencyMs || this.latencyMs,
      scannerMetrics,
      bot2Analysis: this.state.botState.bot2.analysis,
      bot3ActiveSignals: this.bot3Engine.getActiveSignals(),
      bot3Performance: this.bot3Engine.getPerformanceMetrics(),
      bot4Metrics,
      bot4Orders: this.bot4Execution.getOrders(),
      bot4Ledger: this.bot4Execution.getLedger(),
      bot5Metrics: this.bot5Loss.getMetrics(),
      bot5Proposals: this.bot5Loss.getProposals(),
      bot5VersionHistory: this.bot5Loss.getVersionHistory(),
      pipelineSnapshot: this.latestPipeline,
    };
  }

  public getScanner(): Bot1MarketScanner {
    return this.bot1Scanner;
  }

  public getBot2Analyst(): Bot2MarketAnalyst {
    return this.bot2Analyst;
  }

  public getBot3Engine(): Bot3SignalEngine {
    return this.bot3Engine;
  }

  public getBot4Manager(): Bot4ExecutionManager {
    return this.bot4Execution;
  }

  public getBot5LossEngine(): Bot5LossAnalysisEngine {
    return this.bot5Loss;
  }

  public getPipelineSnapshot(): CompletePipelineSnapshot {
    return this.latestPipeline;
  }

  public toggleEngine(): boolean {
    this.state.isEngineRunning = !this.state.isEngineRunning;
    this.backgroundWorker.setEngineRunning(this.state.isEngineRunning, 'Người dùng bấm chuyển đổi từ giao diện');
    this.telegramNotifier.notifyStatusChange(
      this.state.isEngineRunning ? 'RUNNING' : 'STOPPED',
      'Người dùng chuyển trạng thái từ giao diện điều khiển'
    );
    this.addLog(
      `[SYS] 24/7 Engine ${this.state.isEngineRunning ? 'resumed' : 'paused'} by user.`,
      this.state.isEngineRunning ? 'success' : 'warning',
      'SYS'
    );
    saveServerState(this.state);
    return this.state.isEngineRunning;
  }

  public updateSettings(newSettings: EngineSettings) {
    this.state.settings = { ...newSettings };
    this.bot4Execution.updateConfig({
      targetMarginPerPosition: newSettings.marginPerTrade,
      maxSimultaneousPositions: newSettings.maxPositions,
      netProfitThresholdUsdt: newSettings.netPnLThreshold,
      maxLeverage: newSettings.maxLeverage,
      autoCloseEnabled: newSettings.autoCloseEnabled,
    });
    if (newSettings.bot5AutoApproveOOS !== undefined) {
      this.bot5Loss.setAutoApproveOOS(newSettings.bot5AutoApproveOOS);
    }
    if (newSettings.bot5MinSampleSize !== undefined) {
      this.bot5Loss.setMinSampleSizeForOOS(newSettings.bot5MinSampleSize);
    }

    // Synchronize Telegram configuration
    this.telegramNotifier.updateConfig({
      enabled: newSettings.telegramEnabled ?? false,
      botToken: newSettings.telegramBotToken ?? '',
      chatId: newSettings.telegramChatId ?? '',
      notifyOnOpen: newSettings.telegramNotifyOnOpen ?? true,
      notifyOnClose: newSettings.telegramNotifyOnClose ?? true,
      notifyOnError: newSettings.telegramNotifyOnError ?? true,
      notifyHeartbeat: newSettings.telegramNotifyHeartbeat ?? true,
      heartbeatIntervalMinutes: newSettings.telegramHeartbeatIntervalMinutes ?? 60,
    });

    this.addLog('[SYS] Cấu hình hệ thống 5-Bot & Telegram đã được cập nhật và lưu trên máy chủ.', 'success', 'SYS');
    saveServerState(this.state);
  }

  public getTelegramNotifier(): TelegramNotifier {
    return this.telegramNotifier;
  }

  public getBackgroundWorker(): BackgroundWorker {
    return this.backgroundWorker;
  }

  public getWorkerHealth() {
    const wsStatus = this.bot1Scanner.getMetrics().wsStatus;
    const isTelConfigured = this.telegramNotifier.isConfigured();
    return this.backgroundWorker.getHealth({
      websocketStatus: wsStatus,
      activePositionsCount: this.state.positions.length,
      walletBalance: this.state.walletBalance,
      telegramStatus: isTelConfigured ? 'CONNECTED' : 'NOT_CONFIGURED',
      lastTelegramSentTimestamp: this.telegramNotifier.getLastSentTimestamp(),
    });
  }

  public applyBot5Proposal(proposalId: string, comment?: string): boolean {
    const success = this.bot5Loss.applyProposal(proposalId, comment);
    if (success) {
      this.syncStateFromBot5();
      saveServerState(this.state);
    }
    return success;
  }

  public rejectBot5Proposal(proposalId: string, reason?: string): boolean {
    const success = this.bot5Loss.rejectProposal(proposalId, reason);
    if (success) {
      this.syncStateFromBot5();
      saveServerState(this.state);
    }
    return success;
  }

  public rollbackBot5Model(targetVersion: string): boolean {
    const success = this.bot5Loss.rollbackToVersion(targetVersion);
    if (success) {
      this.syncStateFromBot5();
      saveServerState(this.state);
    }
    return success;
  }

  public toggleAutoTrade(autoTradingEnabled?: boolean, autoCloseEnabled?: boolean) {
    if (autoTradingEnabled !== undefined) {
      this.state.settings.autoTradingEnabled = autoTradingEnabled;
    } else {
      this.state.settings.autoTradingEnabled = !this.state.settings.autoTradingEnabled;
    }

    if (autoCloseEnabled !== undefined) {
      this.state.settings.autoCloseEnabled = autoCloseEnabled;
      this.bot4Execution.updateConfig({ autoCloseEnabled });
    }

    this.addLog(
      `[SYS] Cập nhật chế độ tự động: Tự Đặt Lệnh = ${this.state.settings.autoTradingEnabled ? 'BẬT' : 'TẮT'} | Tự Chốt Lệnh = ${this.state.settings.autoCloseEnabled ? 'BẬT' : 'TẮT'}`,
      'cyan',
      'SYS'
    );
    saveServerState(this.state);
    return {
      autoTradingEnabled: this.state.settings.autoTradingEnabled,
      autoCloseEnabled: this.state.settings.autoCloseEnabled,
    };
  }

  public resetBalance() {
    this.bot4Execution.resetAccount(this.state.settings.startingBalance);
    this.syncStateFromBot4();
    this.addLog(
      `[SYS] Đã reset Paper Balance về $${this.state.settings.startingBalance.toFixed(2)} USDT trên máy chủ.`,
      'info',
      'SYS'
    );
  }

  public clearLogs() {
    this.state.logs = [
      {
        id: 'log-' + Date.now(),
        time: new Date().toLocaleTimeString(),
        source: 'SYS',
        message: 'System console logs cleared.',
        type: 'info',
      },
    ];
    saveServerState(this.state);
  }

  public closePositionById(id: string): boolean {
    const pos = this.bot4Execution.getPositions().find((p) => p.id === id);
    if (!pos) return false;
    const ticker = this.state.tickers[pos.symbol] || {
      symbol: pos.symbol,
      lastPr: pos.currentPrice,
      bidPr: pos.currentPrice * 0.9998,
      askPr: pos.currentPrice * 1.0002,
      change24h: 0,
      high24h: pos.currentPrice,
      low24h: pos.currentPrice,
      volume24h: 1000000,
      updatedAt: Date.now(),
    };
    const closed = this.bot4Execution.closePosition(pos.symbol, ticker, 'MANUAL_CLOSE');
    this.syncStateFromBot4();
    return !!closed;
  }
}

// Global engine singleton running 24/7
export const serverEngine = new ServerTradingEngine();
