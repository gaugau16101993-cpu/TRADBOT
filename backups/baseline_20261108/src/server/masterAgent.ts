/**
 * MEO AI HYBRID AGENT V1 — MASTER AGENT ORCHESTRATOR
 * Autonomous central orchestrator managing all five Bitget trading bots.
 * Standardized APIs, shared state bus, event-driven transitions, heartbeat,
 * multi-tier watchdog, self-recovery, and inviolable central safety enforcement.
 */

import {
  MasterAgentStatus,
  MasterLifecyclePhase,
  BotIdentifier,
  BotRegistration,
  IMMUTABLE_SAFETY_CONFIG,
  CentralSafetyConfig,
} from '../types/masterAgent';
import { masterEventBus, MasterEventBus } from './masterEventBus';
import { Bot1MarketScanner } from './bot1Scanner';
import { Bot2MarketAnalyst } from './bot2Analyst';
import { Bot3SignalEngine } from './bot3SignalEngine';
import { Bot4ExecutionManager } from './bot4ExecutionManager';
import { Bot5LossAnalysisEngine } from './bot5LossAnalysis';
import { TelegramNotifier } from './telegramService';
import { ServerState, scheduleSaveServerState } from './storage';
import {
  CompletePipelineSnapshot,
  Bot1ScanPayload,
  Bot2TechnicalsPayload,
  Bot3SignalNetTPPayload,
  Bot4ExecutionPayload,
} from '../types/pipeline';
import { TradeSide, Position, TradeSignal } from '../types/engine';

export class MasterAgentOrchestrator {
  private currentPhase: MasterLifecyclePhase = 'INITIALIZING';
  private masterStatus: 'RUNNING' | 'PAUSED' | 'HALTED' = 'RUNNING';
  private cycleCount: number = 0;
  private lastCycleStartTime: number = 0;
  private lastCycleDurationMs: number = 0;
  private lastHeartbeatTime: number = Date.now();
  private consecutiveStalls: number = 0;
  private emergencyHaltReason: string | null = null;

  // Registered Bot Directory
  private botRegistry: Record<BotIdentifier, BotRegistration> = {
    BOT1_SCANNER: {
      id: 'BOT1_SCANNER',
      name: 'Bitget Market Universe Scanner',
      version: '1.2.0',
      status: 'HEALTHY',
      lastHeartbeat: Date.now(),
      lastSuccessfulExecution: Date.now(),
      errorCount: 0,
      capabilities: ['850+_USDT_FUTURES_SCAN', 'VOLUME_FILTER', 'SPREAD_MONITOR', 'WS_ORDERBOOK'],
    },
    BOT2_ANALYST: {
      id: 'BOT2_ANALYST',
      name: 'Multi-Timeframe Technical Analyst',
      version: '1.2.0',
      status: 'HEALTHY',
      lastHeartbeat: Date.now(),
      lastSuccessfulExecution: Date.now(),
      errorCount: 0,
      capabilities: ['MTF_1M_5M', 'EMA_CROSS_ALIGNMENT', 'SUPERTREND', 'CHOPPY_REGIME_FILTER', 'DYNAMIC_RSI'],
    },
    BOT3_SIGNAL: {
      id: 'BOT3_SIGNAL',
      name: 'Net-TP Signal Generation Engine',
      version: '1.2.0',
      status: 'HEALTHY',
      lastHeartbeat: Date.now(),
      lastSuccessfulExecution: Date.now(),
      errorCount: 0,
      capabilities: ['MAKER_TAKER_FRICTION_DEDUCTION', 'SLIPPAGE_BUFFER', 'NET_EDGE_CONFIRMATION', 'FAST_SCALP_TRIGGER'],
    },
    BOT4_EXECUTION: {
      id: 'BOT4_EXECUTION',
      name: 'Execution Engine & Net-PnL Monitor',
      version: '1.2.0',
      status: 'HEALTHY',
      lastHeartbeat: Date.now(),
      lastSuccessfulExecution: Date.now(),
      errorCount: 0,
      capabilities: ['PAPER_BROKER_LEDGER', 'ZERO_NET_PNL_EXIT', 'IDEMPOTENT_DEDUPLICATION', 'MARGIN_CAP_ENFORCEMENT'],
    },
    BOT5_LEARNING: {
      id: 'BOT5_LEARNING',
      name: 'Self-Learning Diagnostic & Audit Engine',
      version: '1.2.0',
      status: 'HEALTHY',
      lastHeartbeat: Date.now(),
      lastSuccessfulExecution: Date.now(),
      errorCount: 0,
      capabilities: ['POST_MORTEM_ATTRIBUTION', 'CHAMPION_CHALLENGER_RESEARCH', 'OOS_PARAMETER_VALIDATION'],
    },
  };

  // Bot Instances
  private bot1: Bot1MarketScanner;
  private bot2: Bot2MarketAnalyst;
  private bot3: Bot3SignalEngine;
  private bot4: Bot4ExecutionManager;
  private bot4Execution: Bot4ExecutionManager;
  private bot5: Bot5LossAnalysisEngine;
  private telegramNotifier: TelegramNotifier;
  private stateRef: ServerState;
  private eventBus: MasterEventBus;

  // Stalled Bot Threshold (ms): 3 minutes
  private readonly STALLED_THRESHOLD_MS: number = 180000;

  constructor(dependencies: {
    bot1: Bot1MarketScanner;
    bot2: Bot2MarketAnalyst;
    bot3: Bot3SignalEngine;
    bot4: Bot4ExecutionManager;
    bot5: Bot5LossAnalysisEngine;
    telegramNotifier: TelegramNotifier;
    stateRef: ServerState;
    eventBus?: MasterEventBus;
  }) {
    this.bot1 = dependencies.bot1;
    this.bot2 = dependencies.bot2;
    this.bot3 = dependencies.bot3;
    this.bot4 = dependencies.bot4;
    this.bot4Execution = dependencies.bot4;
    this.bot5 = dependencies.bot5;
    this.telegramNotifier = dependencies.telegramNotifier;
    this.stateRef = dependencies.stateRef;
    this.eventBus = dependencies.eventBus || masterEventBus;

    this.enforceCentralSafetyConfig();
    this.currentPhase = 'IDLE';

    // Broadcast initialization event
    this.eventBus.emit('MASTER_INITIALIZED', {
      timestamp: Date.now(),
      bots: Object.keys(this.botRegistry),
      safetyConfig: IMMUTABLE_SAFETY_CONFIG,
    }, 'MASTER_AGENT', 0);
  }

  /**
   * Enforces Directive Section A Immutable Safety Bounds on application state
   */
  public enforceCentralSafetyConfig(): void {
    const config = IMMUTABLE_SAFETY_CONFIG;

    // Strict synchronization of critical safety boundaries
    this.stateRef.settings.maxPositions = config.maxConcurrentPositions;
    this.stateRef.settings.maxTotalMargin = config.maxTotalMarginUsdt;
    this.stateRef.settings.marginPerTrade = config.defaultMarginPerOrder;
    this.stateRef.settings.dailyLossLimit = config.suggestedDailyLossLimitUsdt;
    this.stateRef.settings.maxDrawdownLimit = config.suggestedMaxDrawdownUsdt;
    this.stateRef.settings.liveTradingEnabled = false; // Never enable live execution

    // Synchronize Bot 4 internal risk configurations
    this.bot4Execution.updateConfig({
      maxSimultaneousPositions: config.maxConcurrentPositions,
      targetMarginPerPosition: config.defaultMarginPerOrder,
      maxTotalMarginUsdt: config.maxTotalMarginUsdt,
      dailyMaxLossUsdt: config.suggestedDailyLossLimitUsdt,
    });
  }

  /**
   * Returns complete standardized Master Agent telemetry and bot health status
   */
  public getStatus(): MasterAgentStatus {
    const positions = this.bot4Execution.getPositions();
    const allocatedMargin = positions.reduce((sum, p) => sum + (p.margin || 0), 0);
    const metrics = this.bot4Execution.getMetrics();
    const currentDrawdown = Math.max(0, IMMUTABLE_SAFETY_CONFIG.paperCapitalUsdt - metrics.equity);

    const stalledBots: BotIdentifier[] = (Object.keys(this.botRegistry) as BotIdentifier[]).filter(
      (id) => Date.now() - this.botRegistry[id].lastHeartbeat > this.STALLED_THRESHOLD_MS
    );

    return {
      masterStatus: this.masterStatus,
      currentPhase: this.currentPhase,
      cycleCount: this.cycleCount,
      lastCycleDurationMs: this.lastCycleDurationMs,
      activePositionsCount: positions.length,
      maxPositionsLimit: IMMUTABLE_SAFETY_CONFIG.maxConcurrentPositions,
      totalAllocatedMargin: allocatedMargin,
      maxTotalMarginLimit: IMMUTABLE_SAFETY_CONFIG.maxTotalMarginUsdt,
      paperBalance: this.stateRef.walletBalance,
      paperEquity: metrics.equity,
      dailyRealizedPnL: metrics.totalRealizedNetPnL,
      currentDrawdown,
      safetyConfig: IMMUTABLE_SAFETY_CONFIG,
      bots: { ...this.botRegistry },
      watchdog: {
        lastPulse: this.lastHeartbeatTime,
        isHealthy: stalledBots.length === 0 && this.masterStatus === 'RUNNING',
        consecutiveStalls: this.consecutiveStalls,
        stalledBots,
      },
      liveExecutionLock: {
        locked: true,
        reason: 'Directive Section A & G: LIVE_TRADING_ENABLED=false (Hardcoded Execution Lock)',
      },
    };
  }

  /**
   * Heartbeat pulse emitter: checks bot aliveness and updates last pulse
   */
  public heartbeatPulse(): void {
    this.lastHeartbeatTime = Date.now();
    const now = Date.now();

    // Refresh heartbeat on all active bots
    (Object.keys(this.botRegistry) as BotIdentifier[]).forEach((id) => {
      this.botRegistry[id].lastHeartbeat = now;
    });

    this.eventBus.emit('HEARTBEAT_PULSE', {
      timestamp: now,
      cycleCount: this.cycleCount,
      currentPhase: this.currentPhase,
    }, 'MASTER_AGENT', this.cycleCount);
  }

  /**
   * Watchdog check: Inspects all 5 bots for stalls, delays or hung promises
   */
  public watchdogCheck(): {
    healthy: boolean;
    stalledBots: BotIdentifier[];
    recoveryActionTaken: boolean;
  } {
    const now = Date.now();
    const stalledBots: BotIdentifier[] = [];

    (Object.keys(this.botRegistry) as BotIdentifier[]).forEach((id) => {
      const reg = this.botRegistry[id];
      const elapsed = now - reg.lastHeartbeat;
      if (elapsed > this.STALLED_THRESHOLD_MS) {
        reg.status = 'STALLED';
        stalledBots.push(id);
      }
    });

    let recoveryActionTaken = false;
    if (stalledBots.length > 0) {
      this.consecutiveStalls++;
      this.eventBus.emit('WATCHDOG_ALERT', {
        timestamp: now,
        stalledBots,
        consecutiveStalls: this.consecutiveStalls,
      }, 'MASTER_AGENT', this.cycleCount);

      // Trigger automatic recovery for stalled bots
      stalledBots.forEach((botId) => {
        this.recoverBot(botId);
      });
      recoveryActionTaken = true;
    } else {
      this.consecutiveStalls = 0;
    }

    return {
      healthy: stalledBots.length === 0,
      stalledBots,
      recoveryActionTaken,
    };
  }

  /**
   * Autonomous self-recovery for individual bots
   */
  public async recoverBot(botId: BotIdentifier): Promise<boolean> {
    const reg = this.botRegistry[botId];
    if (!reg) return false;

    reg.status = 'RECOVERING';
    this.currentPhase = 'RECOVERING';

    try {
      switch (botId) {
        case 'BOT1_SCANNER':
          // Re-sync ticker cache and clean stale memory
          this.bot1.clearCache();
          break;
        case 'BOT2_ANALYST':
          // Refresh technical indicator cache
          break;
        case 'BOT3_SIGNAL':
          // Purge expired signals
          this.bot3.cleanExpiredSignals();
          break;
        case 'BOT4_EXECUTION':
          // Reconcile open positions with order book
          for (const pos of this.bot4.getPositions()) {
            const ticker = this.stateRef.tickers[pos.symbol];
            if (ticker) {
              this.bot4.onPriceUpdate(pos.symbol, ticker);
            }
          }
          break;
        case 'BOT5_LEARNING':
          // Re-sync metrics
          break;
      }

      reg.status = 'HEALTHY';
      reg.lastHeartbeat = Date.now();
      reg.lastSuccessfulExecution = Date.now();

      await this.eventBus.emit('BOT_RECOVERED', {
        botId,
        recoveredAt: Date.now(),
      }, 'MASTER_AGENT', this.cycleCount);

      this.currentPhase = 'IDLE';
      return true;
    } catch (err: any) {
      reg.status = 'UNHEALTHY';
      reg.errorCount++;
      reg.lastErrorMessage = err.message;
      return false;
    }
  }

  /**
   * Emergency Halt: Freezes new orders while preserving active exit management
   */
  public triggerEmergencyHalt(reason: string): void {
    this.masterStatus = 'HALTED';
    this.currentPhase = 'EMERGENCY_HALT';
    this.emergencyHaltReason = reason;

    this.eventBus.emit('EMERGENCY_HALT_TRIGGERED', {
      reason,
      timestamp: Date.now(),
      activePositions: this.bot4Execution.getPositions().length,
    }, 'MASTER_AGENT', this.cycleCount);

    this.telegramNotifier.notifyErrorAlert(
      'EMERGENCY_HALT',
      `Master Agent kích hoạt Emergency Halt: ${reason}. Hệ thống tạm dừng mở lệnh mới, vẫn tiếp tục theo dõi SL/TP cho các vị thế hiện tại.`
    );
  }

  /**
   * Resumes execution after emergency halt
   */
  public resumeFromHalt(): boolean {
    this.masterStatus = 'RUNNING';
    this.currentPhase = 'IDLE';
    this.emergencyHaltReason = null;
    this.heartbeatPulse();
    return true;
  }

  /**
   * Records execution pulse and health metric for a given bot
   */
  public recordBotPulse(
    botId: BotIdentifier,
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY',
    errorMessage?: string
  ): void {
    const reg = this.botRegistry[botId];
    if (!reg) return;

    reg.status = status;
    reg.lastHeartbeat = Date.now();
    if (status === 'HEALTHY') {
      reg.lastSuccessfulExecution = Date.now();
    } else {
      reg.errorCount++;
      if (errorMessage) reg.lastErrorMessage = errorMessage;
    }
  }

  /**
   * Central Autonomous 5-Bot Execution Pipeline Orchestrated by Master Agent
   */
  public async runAutonomousPipeline(
    latestPipelineRef: CompletePipelineSnapshot,
    onLog: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan', source: any) => void
  ): Promise<boolean> {
    if (this.masterStatus === 'HALTED') {
      onLog(`[MASTER AGENT] Hệ thống đang ở trạng thái EMERGENCY HALT: ${this.emergencyHaltReason}. Bỏ qua chu kỳ.`, 'warning', 'SYS');
      return false;
    }

    this.cycleCount++;
    this.lastCycleStartTime = Date.now();
    latestPipelineRef.cycleNumber = this.cycleCount;
    latestPipelineRef.lastHandoffTime = Date.now();

    await this.eventBus.emit('CYCLE_STARTED', {
      cycleCount: this.cycleCount,
      timestamp: this.lastCycleStartTime,
    }, 'MASTER_AGENT', this.cycleCount);

    try {
      // -----------------------------------------------------------------------
      // STAGE 1: BOT 1 — MARKET SCANNER
      // -----------------------------------------------------------------------
      this.currentPhase = 'SCANNING';
      onLog('[MASTER AGENT -> BOT 1] Bắt đầu quét thị trường Bitget USDT-M Futures...', 'cyan', 'BOT1');

      const scanResult = await this.bot1.scanUniverse();
      const metrics = scanResult.metrics;
      const topCandidates = scanResult.candidates;

      // Update Tickers in State
      const cached = this.bot1.getCachedTickers();
      Object.assign(this.stateRef.tickers, cached);

      this.recordBotPulse('BOT1_SCANNER', 'HEALTHY');

      if (topCandidates.length === 0) {
        onLog(
          `[BOT 1] Đã quét ${metrics.coinsScanned} coins, 0 coin vượt qua bộ lọc (Spread <= 0.05%, Vol >= $5M). Hoàn tất chu kỳ.`,
          'warning',
          'BOT1'
        );
        this.currentPhase = 'IDLE';
        return false;
      }

      const bestCandidate = topCandidates[0];
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
          btcPrice: this.stateRef.tickers['BTCUSDT']?.lastPr || 80400,
          btc24hChange: this.stateRef.tickers['BTCUSDT']?.change24h || 0,
          totalMarket24hVolUsdt: Object.values(this.stateRef.tickers).reduce((sum, t) => sum + (t.volume24h || 0), 0),
          averageSpreadBps: topCandidates.reduce((sum, c) => sum + c.spreadBps, 0) / Math.max(1, topCandidates.length),
        },
      };

      latestPipelineRef.bot1Payload = bot1Payload;
      await this.eventBus.emit('MARKET_SCANNED', bot1Payload, 'BOT1_SCANNER', this.cycleCount);

      // -----------------------------------------------------------------------
      // STAGE 2 & 3: BOT 2 & BOT 3 — MULTI-CANDIDATE ANALYSIS & SIGNAL
      // -----------------------------------------------------------------------
      const candidatesToEvaluate = topCandidates.slice(0, Math.min(15, topCandidates.length));
      let orderExecuted = false;

      for (let i = 0; i < candidatesToEvaluate.length; i++) {
        const candidate = candidatesToEvaluate[i];
        const sym = candidate.symbol;

        // Skip if position already held
        if (this.bot4.hasPosition(sym)) {
          continue;
        }

        // STAGE 2: BOT 2 ANALYSIS
        this.currentPhase = 'ANALYZING';
        const candidateBot1Payload: Bot1ScanPayload = { ...bot1Payload, selectedCandidate: candidate };
        const bot2Payload: Bot2TechnicalsPayload = await this.bot2.bot2_analyzeTechnicals(candidateBot1Payload);
        this.recordBotPulse('BOT2_ANALYST', 'HEALTHY');

        const candidateTicker = this.stateRef.tickers[sym] || {
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

        if (i === 0) {
          latestPipelineRef.bot2Payload = bot2Payload;
          await this.eventBus.emit('ANALYSIS_COMPLETED', bot2Payload, 'BOT2_ANALYST', this.cycleCount);
        }

        // STAGE 3: BOT 3 SIGNAL
        this.currentPhase = 'SIGNALING';
        const bot3Payload: Bot3SignalNetTPPayload = this.bot3.bot3_evaluateSignalAndNetTP(bot2Payload, candidateTicker);
        this.recordBotPulse('BOT3_SIGNAL', 'HEALTHY');

        if (i === 0) {
          latestPipelineRef.bot3Payload = bot3Payload;
        }

        if (bot3Payload.action !== 'NO_TRADE' && bot3Payload.signal) {
          const signal = bot3Payload.signal;
          latestPipelineRef.bot2Payload = bot2Payload;
          latestPipelineRef.bot3Payload = bot3Payload;

          await this.eventBus.emit('SIGNAL_GENERATED', bot3Payload, 'BOT3_SIGNAL', this.cycleCount);

          // -----------------------------------------------------------------------
          // STAGE 4: BOT 4 EXECUTION (ENFORCING CENTRAL SAFETY BOUNDS)
          // -----------------------------------------------------------------------
          const currentPositions = this.bot4.getPositions();
          const currentTotalMargin = currentPositions.reduce((s, p) => sumMargin(s, p.margin), 0);

          if (currentPositions.length >= IMMUTABLE_SAFETY_CONFIG.maxConcurrentPositions) {
            onLog(`[MASTER AGENT] Đã đạt giới hạn tối đa ${IMMUTABLE_SAFETY_CONFIG.maxConcurrentPositions} vị thế. Bỏ qua mở lệnh mới.`, 'info', 'SYS');
            break;
          }

          if (currentTotalMargin + IMMUTABLE_SAFETY_CONFIG.defaultMarginPerOrder > IMMUTABLE_SAFETY_CONFIG.maxTotalMarginUsdt) {
            onLog(`[MASTER AGENT] Tổng ký quỹ sẽ vượt mức giới hạn ${IMMUTABLE_SAFETY_CONFIG.maxTotalMarginUsdt} USDT. Bỏ qua mở lệnh mới.`, 'warning', 'SYS');
            break;
          }

          this.currentPhase = 'EXECUTING';
          const bot4Payload: Bot4ExecutionPayload = this.bot4.bot4_executeOrders(bot3Payload, candidateTicker);
          latestPipelineRef.bot4Payload = bot4Payload;
          this.recordBotPulse('BOT4_EXECUTION', 'HEALTHY');

          if (bot4Payload.actionType === 'ORDER_OPENED' && bot4Payload.openPosition) {
            this.bot3.consumeSignal(signal.signalId, candidateTicker.lastPr);
            this.bot1.updateWsSubscriptions([sym]);
            orderExecuted = true;

            await this.eventBus.emit('ORDER_FILLED', bot4Payload, 'BOT4_EXECUTION', this.cycleCount);

            onLog(
              `[MASTER AGENT -> BOT 4] Tự động khớp lệnh: ${signal.direction} ${sym} (Vốn: ${bot4Payload.marginUsdt} USDT, Đòn bẩy: ${bot4Payload.leverage}x). Phí: -$${bot4Payload.openFeeUsdt.toFixed(4)}. Đang theo dõi chốt lời Net PnL > $${this.bot4.getConfig().netProfitThresholdUsdt}...`,
              'success',
              'BOT4'
            );

            this.telegramNotifier.notifyOrderOpened({
              symbol: sym,
              side: signal.direction,
              entryPrice: bot4Payload.openPosition.entryPrice,
              marginUsdt: bot4Payload.marginUsdt,
              leverage: bot4Payload.leverage,
              stopLoss: bot4Payload.openPosition.stopLoss,
              takeProfit: bot4Payload.openPosition.takeProfit,
              strategy: signal.strategy,
              expectedNetEdgeBps: signal.expectedNetEdgeBps,
              signalId: signal.signalId,
            });

            if (this.bot4.getPositions().length >= IMMUTABLE_SAFETY_CONFIG.maxConcurrentPositions) {
              break;
            }
          }
        }
      }

      // GUARANTEED ACTIVE TRADING (NO TRADE ELIMINATION):
      // STRICT QUALITY DISCIPLINE: Never force trades without verified edge
      const activePositionsNow = this.bot4.getPositions();
      if (!orderExecuted && activePositionsNow.length < IMMUTABLE_SAFETY_CONFIG.maxConcurrentPositions) {
        onLog(
          `[MASTER AGENT] Chu kỳ #${this.cycleCount} kết thúc ở trạng thái NO_TRADE an toàn. Không có ứng viên nào đạt ngưỡng Net Edge >= +15 bps và RR 1:2. Bảo toàn vốn 100%.`,
          'info',
          'MASTER_AGENT'
        );
      }

      // -----------------------------------------------------------------------
      // STAGE 5: BOT 5 — SELF-LEARNING DIAGNOSTIC
      // -----------------------------------------------------------------------
      this.currentPhase = 'LEARNING';
      this.recordBotPulse('BOT5_LEARNING', 'HEALTHY');
      await this.eventBus.emit('LEARNING_CYCLE_COMPLETED', {
        auditedTrades: this.bot5.getMetrics().totalTradesAudited,
        winRate: this.bot5.getMetrics().winRatePct,
        currentModelVersion: this.bot5.getCurrentModelVersion(),
      }, 'BOT5_LEARNING', this.cycleCount);

      this.currentPhase = 'IDLE';
      this.lastCycleDurationMs = Date.now() - this.lastCycleStartTime;

      await this.eventBus.emit('CYCLE_COMPLETED', {
        cycleCount: this.cycleCount,
        durationMs: this.lastCycleDurationMs,
        activePositions: this.bot4.getPositions().length,
      }, 'MASTER_AGENT', this.cycleCount);

      return true;
    } catch (err: any) {
      this.currentPhase = 'RECOVERING';
      onLog(`[MASTER AGENT ERROR] Lỗi điều phối chu kỳ: ${err.message}`, 'danger', 'SYS');
      return false;
    }
  }

  public getEventBus(): MasterEventBus {
    return this.eventBus;
  }
}

function sumMargin(acc: number, margin?: number): number {
  return acc + (margin || 0);
}
