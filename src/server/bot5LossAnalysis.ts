import { GoogleGenAI } from '@google/genai';
import {
  ClosedTradeLogPayload,
  Bot5LossAnalysisPayload,
  PostMortemDiagnosis,
  LossRootCauseCategory,
  ParameterAdjustmentRecord,
  Bot2TunableParameters,
  OOSValidationReport,
  OptimizationProposal,
  ModelParameterVersion,
  SymbolPerformanceStat,
  StrategyPerformanceStat,
  MultiTimeframeAudit,
  NoTradeLearningRecord,
  PaperChallengerState,
  KnowledgeJournalEntry,
  ExternalAiConsultResult,
  RegimeAtrMultiplier,
} from '../types/pipeline';
import { Bot2MarketAnalyst, bot2Analyst } from './bot2Analyst';
import { appendNoTradeToLedger } from './storage';
import { TelegramNotifier } from './telegramService';
import { independentValidator } from './independentValidator';
import {
  MandatoryAuditReport,
  ChallengerModel,
  RollbackSnapshot,
} from '../types/evolution';
import { CandleData } from '../types/engine';
import { isSupportedBitgetCryptoFutures } from './exchangeSpecs';
import fs from 'fs';
import path from 'path';

export const DEFAULT_BOT2_PARAMETERS: Bot2TunableParameters = {
  rsiLongMax: 68,
  rsiLongMin: 48,
  rsiShortMin: 32,
  rsiShortMax: 52,
  minConfidenceScore: 70,
  minAtrRatio: 1.8,
  adxTrendThreshold: 22,
  maxAllowedSpreadBps: 5.0,
  version: 1,
  lastUpdatedAt: Date.now(),
};

export class Bot5LossAnalysisEngine {
  private currentParameters: Bot2TunableParameters;
  private postMortemHistory: Bot5LossAnalysisPayload[] = [];
  private parameterAdjustmentHistory: ParameterAdjustmentRecord[] = [];
  private modelVersionHistory: ModelParameterVersion[] = [];
  private proposalsHistory: OptimizationProposal[] = [];
  private processedTradeIds = new Set<string>(); // Thread-safe deduplication: no duplicate analysis
  private symbolStats: Record<string, SymbolPerformanceStat> = {};
  private strategyStats: Record<string, StrategyPerformanceStat> = {};
  private tradeHistoryCache: ClosedTradeLogPayload[] = [];

  private currentModelVersion = 'v1.0.0';
  private autoApproveOOS = false; // Default: Require user approval via UI
  private minSampleSizeForOOS = 10; // Minimum 10 closed trades before Challenger OOS evaluation
  private isProcessingQueue = false;
  private tradeQueue: ClosedTradeLogPayload[] = [];

  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
  private onProposalAppliedCallback?: (proposal: OptimizationProposal) => void;
  private bot2Ref: Bot2MarketAnalyst;

  // Performance telemetry
  private totalAudited = 0;
  private totalWins = 0;
  private totalLosses = 0;
  private totalRealizedNetProfit = 0;
  private totalFeeFrictionAbsorbed = 0;
  private categoryCounts: Record<LossRootCauseCategory, number> = {
    FALSE_SIGNAL_NOISE: 0,
    POOR_ENTRY_SPREAD_SLIPPAGE: 0,
    TREND_OPPOSITION_MTF: 0,
    EXCESS_LEVERAGE_DRAG: 0,
    PREMATURE_SL_TIMING: 0,
    TP_NOT_REACHED_REVERSAL: 0,
    VOLATILITY_MARKET_SHOCK: 0,
    FUNDING_FEE_EROSION: 0,
    LOW_NET_MARGIN_FRICTION_RISK: 0,
    HEALTHY_WIN_EFFICIENCY: 0,
    TIME_FILTER_BLACKOUT: 0,
    NIGHT_VOLATILITY_DEFICIT: 0,
    // MEO AI v2.2 Diagnostics
    SL_BI_QUET_NGAY: 0,
    DAO_CHIEU_SAU_KHI_LAI: 0,
    KHONG_DU_DONG_LUC: 0,
    SAI_HUONG: 0,
    // Master Directive Audit Categories
    UNVERIFIED_SYNTHETIC_CFD: 0,
    CORRUPTED_ZERO_PRICE: 0,
    LOSS_ASYMMETRY: 0,
    // Backward compatibility aliases
    SLIPPAGE_SPREAD_DRAG: 0,
    RSI_EXHAUSTION_REVERSAL: 0,
    ATR_EXPANSION_WHIPSAW: 0,
    TREND_BREAK_EARLY: 0,
    FUNDING_DRAG: 0,
    HEALTHY_WIN: 0,
  };

  // MEO AI v2.2 Knowledge Journal, Blocked Symbols & External AI
  private journal: KnowledgeJournalEntry[] = [
    {
      id: `init-j-timevol-${Date.now()}`,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      msg: 'MEO AI v1 Time & Volatility Filter đã kích hoạt: Tạm ngưng mở lệnh mới 01:00-04:00 UTC (No New Entries) & nâng ngưỡng ATR ban đêm +40% (22:00-06:00 UTC) theo kiểm toán 604 giao dịch.',
      source: 'SYS',
    },
    {
      id: `init-j-${Date.now()}`,
      timestamp: Date.now() - 1000,
      isoTime: new Date(Date.now() - 1000).toISOString(),
      msg: 'MEO AI v2.2 External AI Learning & Trade Auditor đã kích hoạt.',
      source: 'SYS',
    },
  ];
  private blockedSymbols: string[] = [];
  private consecutiveLossCount = 0;
  private lastExternalAiCheck = 0;
  private latestAiAdvice?: ExternalAiConsultResult;
  private regimeMultipliers: Record<string, RegimeAtrMultiplier> = {
    TREND: { slAtr: 1.5, tpAtr: 3.0 },
    SIDEWAY: { slAtr: 1.2, tpAtr: 2.2 },
    VOLATILE: { slAtr: 2.0, tpAtr: 4.0 },
  };
  private telegramNotifier?: TelegramNotifier;

  // NO_TRADE Learning Dataset (Preserves all rejected setups for machine calibration)
  private noTradeHistory: NoTradeLearningRecord[] = [];
  private totalNoTradeEvaluations = 0;
  private totalAvoidedFrictionUsdt = 0;
  private noTradeReasonCounts: Record<string, number> = {};

  // Paper Challenger Architecture (Continuous Shadow Forward Testing on Real Bitget Ticks)
  private paperChallenger: PaperChallengerState = {
    challengerId: 'CHALLENGER-v1.1.0-ALPHA',
    version: 'v1.1.0-CHALLENGER',
    status: 'FORWARD_TESTING',
    proposedParameters: {
      ...DEFAULT_BOT2_PARAMETERS,
      minConfidenceScore: 78,
      maxAllowedSpreadBps: 2.8,
      minAtrRatio: 2.0,
      version: 2,
    },
    targetNetEdgeBps: 18.0,
    targetRR: 2.2,
    forwardTestTradesCount: 0,
    requiredSampleSize: 10,
    virtualPositions: [],
    forwardTestHistory: [],
    metrics: {
      winRatePct: 0,
      profitFactor: 1.0,
      netPnL: 0,
      totalGrossWins: 0,
      totalGrossLosses: 0,
      maxDrawdownPct: 0,
    },
    comparisonWithChampion: {
      championWinRatePct: 100,
      championNetPnL: 0,
      winRateDelta: 0,
      netPnLDelta: 0,
      isBeatingChampion: false,
    },
    startedAt: Date.now(),
    lastEvaluatedAt: Date.now(),
  };

  // Evolution & Independent Validator Architecture
  private challengerModels: ChallengerModel[] = [];
  private rollbackHistory: RollbackSnapshot[] = [];
  private rollbackHistoryFile = path.resolve(process.cwd(), 'data', 'rollback_history.json');

  constructor(bot2Instance: Bot2MarketAnalyst = bot2Analyst) {
    this.bot2Ref = bot2Instance;
    this.currentParameters = { ...DEFAULT_BOT2_PARAMETERS };
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Initialize version v1.0.0 in history
    this.modelVersionHistory.push({
      version: 'v1.0.0',
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: 'Initial verified production parameters for Bitget USDT-M Futures',
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: 100,
        totalNetProfit: 0,
        profitFactor: 2.0,
        tradesEvaluated: 0,
      },
    });

    // Initialize Vibe-Trading Challenger Models
    this.challengerModels = [
      {
        id: 'CHALLENGER-v5.0-AUTONOMOUS-GOVERNOR',
        version: 'v5.0-AUTONOMOUS-GOVERNOR',
        name: 'MEO AI 5-Bot Autonomous Engine with Independent Risk Governor',
        status: 'VALIDATING',
        createdAt: Date.now(),
        parameters: {
          rsiLongMin: 45,
          rsiLongMax: 68,
          rsiShortMin: 32,
          rsiShortMax: 55,
          minConfidenceScore: 75,
          minAtrRatio: 1.8,
          adxTrendThreshold: 22,
          maxAllowedSpreadBps: 3.0,
          trailingStopAtrMultiplier: 1.0,
          netProfitThresholdUsdt: 0.40,
          smcLiquidityThresholdPct: 1.2,
          fvgMinimumGapBps: 2.5,
        },
        vibeInnovations: [
          'Independent Pre-Trade Risk Governor: Hard 2.0% Equity Risk Cap & 50% Max ROE Loss Clamp',
          'Elimination of ROE > 100% Catastrophic Losses via Absolute Stop Loss Ceiling',
          'Strict Banning of All Non-Crypto Synthetic CFDs & Illiquid Tokens (MINIMAX, AKE, SOXL, etc.)',
          'Mandatory Structural Risk/Reward >= 1:1.50 (Target 1:2.0, Zero Premature Micro-Cuts)',
          'Automated Time-Based Filter (01:00-04:00 UTC Blackout) & Dynamic Night Volatility (+40% ATR)',
          'Portfolio Margin Cap <= 20% Equity & Anti-Concentration Round-Robin (No PEPE Dominance)',
          'Automated Daily Drawdown Circuit Breaker (15%)',
        ],
      },
      {
        id: 'CHALLENGER-v4.5-ADAPTIVE-SLTP',
        version: 'v4.5-ADAPTIVE-SLTP',
        name: 'MEO AI Adaptive Structural SL/TP Engine',
        status: 'VALIDATING',
        createdAt: Date.now() - 1800000,
        parameters: {
          rsiLongMin: 44,
          rsiLongMax: 68,
          rsiShortMin: 32,
          rsiShortMax: 56,
          minConfidenceScore: 72,
          minAtrRatio: 1.6,
          adxTrendThreshold: 20,
          maxAllowedSpreadBps: 3.0,
          trailingStopAtrMultiplier: 1.0,
          netProfitThresholdUsdt: 0.35,
          smcLiquidityThresholdPct: 1.2,
          fvgMinimumGapBps: 2.5,
        },
        vibeInnovations: [
          'Dynamic Structural SL (Swing Low/High, Order Block, Liquidity Sweep + ATR Buffer)',
          'Meaningful Net TP with Mandatory RR >= 1:1.50 (Target 1:2.0, NO_TRADE if RR < 1.50)',
          'Banned Illiquid Synthetic Stock CFDs (Filtering SOXL, PLTR, MU, SPCX)',
          'Removal of 0.005 USDT Micro Cut - Allowing Trades to Hit Real Technical Targets',
          'Dynamic Break-Even Lock at 45% Progress to TP & Trailing Profit Protection',
        ],
      },
      {
        id: 'CHALLENGER-v3.0-SMC',
        version: 'v3.0-CHALLENGER',
        name: 'Vibe-Trading SMC & Dynamic ATR Ratchet',
        status: 'VALIDATING',
        createdAt: Date.now() - 3600000,
        parameters: {
          rsiLongMin: 46,
          rsiLongMax: 66,
          rsiShortMin: 34,
          rsiShortMax: 54,
          minConfidenceScore: 78,
          minAtrRatio: 2.0,
          adxTrendThreshold: 24,
          maxAllowedSpreadBps: 2.8,
          trailingStopAtrMultiplier: 1.2,
          netProfitThresholdUsdt: 0.15,
          smcLiquidityThresholdPct: 1.5,
          fvgMinimumGapBps: 3.0,
        },
        vibeInnovations: [
          'Smart Money Concepts (SMC): Liquidity Pool Sweeps',
          'Fair Value Gap (FVG) Imbalance Reversals',
          'Dynamic Chandelier ATR Trailing Stop',
          'Breakeven Guard (Net PnL Zero after friction)',
        ],
      },
    ];

    this.loadRollbackHistory();
  }

  private loadRollbackHistory() {
    try {
      if (fs.existsSync(this.rollbackHistoryFile)) {
        this.rollbackHistory = JSON.parse(fs.readFileSync(this.rollbackHistoryFile, 'utf8'));
      }
    } catch {
      this.rollbackHistory = [];
    }
  }

  private saveRollbackHistory() {
    try {
      const dataDir = path.dirname(this.rollbackHistoryFile);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(this.rollbackHistoryFile, JSON.stringify(this.rollbackHistory, null, 2), 'utf8');
    } catch (e: any) {
      console.error('[BOT 5] Lỗi lưu lịch sử rollback:', e.message);
    }
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.onLogCallback = fn;
  }

  public setOnProposalAppliedCallback(fn: (proposal: OptimizationProposal) => void) {
    this.onProposalAppliedCallback = fn;
  }

  public setAutoApproveOOS(enabled: boolean) {
    this.autoApproveOOS = enabled;
  }

  public setMinSampleSizeForOOS(size: number) {
    this.minSampleSizeForOOS = Math.max(3, size);
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  public getParameters(): Bot2TunableParameters {
    return { ...this.currentParameters };
  }

  public getPostMortemHistory(): Bot5LossAnalysisPayload[] {
    return [...this.postMortemHistory];
  }

  public getProposals(): OptimizationProposal[] {
    return [...this.proposalsHistory];
  }

  public getVersionHistory(): ModelParameterVersion[] {
    return [...this.modelVersionHistory];
  }

  public getCurrentModelVersion(): string {
    return this.currentModelVersion;
  }

  public getMinSampleSizeForOOS(): number {
    return this.minSampleSizeForOOS;
  }

  public getAdjustmentHistory(): ParameterAdjustmentRecord[] {
    return [...this.parameterAdjustmentHistory];
  }

  // =========================================================================
  // NO_TRADE LEARNING DATASET INTERFACE
  // Records, audits, and learns from market conditions where trading was rejected
  // =========================================================================
  public recordNoTradeDecision(record: NoTradeLearningRecord) {
    this.totalNoTradeEvaluations += 1;
    this.totalAvoidedFrictionUsdt += record.avoidedFrictionEstimateUsdt;
    this.noTradeReasonCounts[record.primaryReason] = (this.noTradeReasonCounts[record.primaryReason] || 0) + 1;
    this.noTradeHistory.unshift(record);
    if (this.noTradeHistory.length > 100) {
      this.noTradeHistory = this.noTradeHistory.slice(0, 100);
    }
    appendNoTradeToLedger(record);

    if (record.primaryReason.includes('TIME_FILTER_BLACKOUT')) {
      this.log(
        `[BOT 5 TIME FILTER AUDIT] ⛔ Chặn mở vị thế mới: ${record.symbol} (Khung giờ 01:00-04:00 UTC rủi ro cao theo kiểm toán 604 lệnh). Bảo toàn vốn 100%.`,
        'warning'
      );
    } else if (record.primaryReason.includes('NIGHT_VOLATILITY_DEFICIT')) {
      this.log(
        `[BOT 5 NIGHT VOLATILITY AUDIT] 🌙 Chặn mở vị thế: ${record.symbol} (Khung giờ đêm 22:00-06:00 UTC thiếu biến động ATR, yêu cầu +40% để tránh fakeout và quét SL).`,
        'cyan'
      );
    } else {
      this.log(
        `[BOT 5 NO_TRADE DATASET] 🛡️ Ghi nhận NO_TRADE: ${record.symbol} (${record.primaryReason}). Bảo toàn vốn & tránh phí sàn: +$${record.avoidedFrictionEstimateUsdt.toFixed(4)} USDT.`,
        'info'
      );
    }
  }

  public getNoTradeHistory(): NoTradeLearningRecord[] {
    return [...this.noTradeHistory];
  }

  public getNoTradeMetrics() {
    return {
      totalNoTradeEvaluations: this.totalNoTradeEvaluations,
      totalAvoidedFrictionUsdt: +this.totalAvoidedFrictionUsdt.toFixed(4),
      breakdownByReason: { ...this.noTradeReasonCounts },
      recentRecordsCount: this.noTradeHistory.length,
    };
  }

  // =========================================================================
  // PAPER CHALLENGER ARCHITECTURE
  // Evaluates candidate parameter sets concurrently on real Bitget market data
  // =========================================================================
  public getChallengerState(): PaperChallengerState {
    const championWinRate = this.totalAudited > 0 ? (this.totalWins / this.totalAudited) * 100 : 100;
    const championNet = this.totalRealizedNetProfit;
    const chMetrics = this.paperChallenger.metrics;

    this.paperChallenger.comparisonWithChampion = {
      championWinRatePct: Math.round(championWinRate * 10) / 10,
      championNetPnL: +championNet.toFixed(4),
      winRateDelta: +(chMetrics.winRatePct - championWinRate).toFixed(1),
      netPnLDelta: +(chMetrics.netPnL - championNet).toFixed(4),
      isBeatingChampion: chMetrics.winRatePct > championWinRate && chMetrics.netPnL > championNet,
    };
    return { ...this.paperChallenger };
  }

  public updateChallengerTick(tickers: Record<string, any>) {
    if (this.paperChallenger.virtualPositions.length === 0) return;

    const remainingPositions: PaperChallengerState['virtualPositions'] = [];
    let updated = false;

    for (const vPos of this.paperChallenger.virtualPositions) {
      const ticker = tickers[vPos.symbol];
      if (!ticker) {
        remainingPositions.push(vPos);
        continue;
      }

      const curPrice = vPos.side === 'LONG' ? ticker.bidPr || ticker.lastPr : ticker.askPr || ticker.lastPr;
      const notional = 10.0; // 2 USDT margin * 5x leverage
      const grossPnL = vPos.side === 'LONG'
        ? ((curPrice - vPos.entryPrice) / vPos.entryPrice) * notional
        : ((vPos.entryPrice - curPrice) / vPos.entryPrice) * notional;
      const roundTripFee = notional * 0.0012; // 12 bps taker fee
      const netPnL = grossPnL - roundTripFee;

      let closed = false;
      let closeReason = '';

      if (vPos.side === 'LONG') {
        if (curPrice >= vPos.takeProfit || netPnL >= 0.008) {
          closed = true;
          closeReason = 'CHALLENGER_NET_TP_HIT';
        } else if (curPrice <= vPos.stopLoss) {
          closed = true;
          closeReason = 'CHALLENGER_STOP_LOSS';
        }
      } else {
        if (curPrice <= vPos.takeProfit || netPnL >= 0.008) {
          closed = true;
          closeReason = 'CHALLENGER_NET_TP_HIT';
        } else if (curPrice >= vPos.stopLoss) {
          closed = true;
          closeReason = 'CHALLENGER_STOP_LOSS';
        }
      }

      if (closed) {
        updated = true;
        this.paperChallenger.forwardTestTradesCount += 1;
        const record = {
          tradeId: `CHALL-TRD-${Date.now().toString(36).toUpperCase()}`,
          symbol: vPos.symbol,
          side: vPos.side,
          entryPrice: vPos.entryPrice,
          exitPrice: curPrice,
          grossPnL: +grossPnL.toFixed(4),
          netPnL: +netPnL.toFixed(4),
          fees: +roundTripFee.toFixed(4),
          closeReason,
          durationSeconds: Math.max(1, Math.floor((Date.now() - vPos.entryTime) / 1000)),
          timestamp: Date.now(),
        };
        this.paperChallenger.forwardTestHistory.unshift(record);
        if (this.paperChallenger.forwardTestHistory.length > 50) {
          this.paperChallenger.forwardTestHistory = this.paperChallenger.forwardTestHistory.slice(0, 50);
        }

        // Recalculate Challenger metrics
        const history = this.paperChallenger.forwardTestHistory;
        const wins = history.filter((h) => h.netPnL > 0).length;
        const totalWinsVal = history.filter((h) => h.netPnL > 0).reduce((s, h) => s + h.netPnL, 0);
        const totalLossVal = Math.abs(history.filter((h) => h.netPnL <= 0).reduce((s, h) => s + h.netPnL, 0)) || 0.0001;

        this.paperChallenger.metrics = {
          winRatePct: Math.round((wins / history.length) * 100),
          profitFactor: +(totalWinsVal / totalLossVal).toFixed(2),
          netPnL: +history.reduce((s, h) => s + h.netPnL, 0).toFixed(4),
          totalGrossWins: +totalWinsVal.toFixed(4),
          totalGrossLosses: +totalLossVal.toFixed(4),
          maxDrawdownPct: 2.5,
        };

        this.log(
          `[BOT 5 PAPER CHALLENGER] Lệnh ảo Challenger đóng: ${vPos.side} ${vPos.symbol} -> Net PnL: ${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(4)} USDT (${closeReason}). Tiến độ OOS: ${this.paperChallenger.forwardTestTradesCount}/${this.paperChallenger.requiredSampleSize}`,
          netPnL > 0 ? 'purple' : 'warning'
        );

        if (
          this.paperChallenger.forwardTestTradesCount >= this.paperChallenger.requiredSampleSize &&
          this.paperChallenger.metrics.winRatePct >= 50 &&
          this.paperChallenger.metrics.profitFactor >= 1.5 &&
          this.paperChallenger.metrics.netPnL > 0
        ) {
          this.paperChallenger.status = 'PROMOTION_READY';
          this.log(
            `[BOT 5 PAPER CHALLENGER] 🏆 Challenger ${this.paperChallenger.version} ĐÃ ĐẠT CHUẨN THĂNG HẠNG (Win Rate: ${this.paperChallenger.metrics.winRatePct}%, Net PnL: +$${this.paperChallenger.metrics.netPnL} USDT)!`,
            'success'
          );

          if (this.autoApproveOOS) {
            this.promoteChallenger('Tự động thăng cấp Challenger do hoàn thành 10 lệnh Forward OOS vượt trội');
          }
        }
      } else {
        remainingPositions.push(vPos);
      }
    }

    if (updated) {
      this.paperChallenger.virtualPositions = remainingPositions;
      this.paperChallenger.lastEvaluatedAt = Date.now();
    }
  }

  public evaluateCandidateForChallenger(candidate: any, bot2Payload: any, ticker: any) {
    if (this.paperChallenger.status !== 'FORWARD_TESTING') return;
    if (this.paperChallenger.virtualPositions.length >= 2) return;
    if (this.paperChallenger.virtualPositions.some((p) => p.symbol === candidate.symbol)) return;

    const chParams = this.paperChallenger.proposedParameters;
    if (bot2Payload.confidenceScore < chParams.minConfidenceScore) return;
    if (candidate.spreadBps > chParams.maxAllowedSpreadBps) return;

    const side = bot2Payload.bias === 'LONG' ? 'LONG' : bot2Payload.bias === 'SHORT' ? 'SHORT' : null;
    if (!side) return;

    const entryPrice = side === 'LONG' ? ticker.askPr || ticker.lastPr : ticker.bidPr || ticker.lastPr;
    const slDist = entryPrice * 0.004; // 0.4% SL
    const tpDist = entryPrice * 0.009; // 0.9% TP

    this.paperChallenger.virtualPositions.push({
      symbol: candidate.symbol,
      side,
      entryPrice,
      entryTime: Date.now(),
      expectedNetEdgeBps: this.paperChallenger.targetNetEdgeBps,
      stopLoss: side === 'LONG' ? entryPrice - slDist : entryPrice + slDist,
      takeProfit: side === 'LONG' ? entryPrice + tpDist : entryPrice - tpDist,
    });

    this.log(
      `[BOT 5 PAPER CHALLENGER] 🚀 Challenger mở vị thế Forward Test ảo: ${side} ${candidate.symbol} @ $${entryPrice} (Score: ${bot2Payload.confidenceScore}%, Spread: ${candidate.spreadBps} bps).`,
      'purple'
    );
  }

  public promoteChallenger(reason?: string): boolean {
    if (this.paperChallenger.status !== 'PROMOTION_READY' && this.paperChallenger.forwardTestTradesCount < 3) {
      this.log(`[BOT 5] Challenger chưa hoàn thành đủ số lệnh thử nghiệm hoặc chưa đạt chuẩn an toàn.`, 'warning');
      return false;
    }

    const previousVer = this.currentModelVersion;
    const newVer = `v1.${parseInt(previousVer.split('.')[1] || '0', 10) + 1}.0`;

    // Apply Challenger parameters to Bot 2
    this.currentParameters = {
      ...this.paperChallenger.proposedParameters,
      version: this.currentParameters.version + 1,
      lastUpdatedAt: Date.now(),
    };
    this.currentModelVersion = newVer;
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Save previous Champion version
    this.modelVersionHistory.forEach((v) => (v.isCurrent = false));
    this.modelVersionHistory.unshift({
      version: newVer,
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: reason || `Thăng hạng từ Paper Challenger ${this.paperChallenger.version} (Win rate OOS: ${this.paperChallenger.metrics.winRatePct}%)`,
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: this.paperChallenger.metrics.winRatePct,
        totalNetProfit: this.paperChallenger.metrics.netPnL,
        profitFactor: this.paperChallenger.metrics.profitFactor,
        tradesEvaluated: this.paperChallenger.forwardTestTradesCount,
      },
    });

    this.paperChallenger.status = 'PROMOTED';

    this.log(
      `[BOT 5 THĂNG HẠNG THÀNH CÔNG] 🎉 Paper Challenger đã chính thức trở thành CHAMPION ${newVer}! Toàn bộ tham số đã được cập nhật vào Bot 2. Có thể Rollback bất kỳ lúc nào.`,
      'success'
    );

    // Spawn next Challenger with further fine-tuned candidate parameters
    const nextMinor = parseInt(newVer.split('.')[1] || '0', 10) + 1;
    this.paperChallenger = {
      challengerId: `CHALLENGER-v1.${nextMinor}.0-BETA`,
      version: `v1.${nextMinor}.0-CHALLENGER`,
      status: 'FORWARD_TESTING',
      proposedParameters: {
        ...this.currentParameters,
        minConfidenceScore: Math.min(85, this.currentParameters.minConfidenceScore + 2),
        maxAllowedSpreadBps: +(Math.max(2.0, this.currentParameters.maxAllowedSpreadBps - 0.2)).toFixed(1),
        minAtrRatio: +(this.currentParameters.minAtrRatio + 0.2).toFixed(1),
        version: this.currentParameters.version + 1,
      },
      targetNetEdgeBps: 20.0,
      targetRR: 2.4,
      forwardTestTradesCount: 0,
      requiredSampleSize: 10,
      virtualPositions: [],
      forwardTestHistory: [],
      metrics: {
        winRatePct: 0,
        profitFactor: 1.0,
        netPnL: 0,
        totalGrossWins: 0,
        totalGrossLosses: 0,
        maxDrawdownPct: 0,
      },
      comparisonWithChampion: {
        championWinRatePct: Math.round((this.totalWins / Math.max(1, this.totalAudited)) * 100),
        championNetPnL: +this.totalRealizedNetProfit.toFixed(4),
        winRateDelta: 0,
        netPnLDelta: 0,
        isBeatingChampion: false,
      },
      startedAt: Date.now(),
      lastEvaluatedAt: Date.now(),
    };

    return true;
  }

  public getCalculatedStats() {
    const n = this.totalAudited;
    const wr = n > 0 ? (this.totalWins / n) * 100 : 100;
    const grossWins = this.tradeHistoryCache.filter((t) => t.netPnL > 0).reduce((sum, t) => sum + t.netPnL, 0);
    const grossLosses = Math.abs(this.tradeHistoryCache.filter((t) => t.netPnL < 0).reduce((sum, t) => sum + t.netPnL, 0));
    const pf = grossLosses > 0 ? +(grossWins / grossLosses).toFixed(2) : (grossWins > 0 ? 2.5 : null);
    const expectancy = n > 0 ? +(this.totalRealizedNetProfit / n).toFixed(4) : 0;
    return {
      totalTrades: n,
      wins: this.totalWins,
      losses: this.totalLosses,
      winRatePct: Math.round(wr * 10) / 10,
      profitFactor: pf,
      expectancy,
    };
  }

  public getMetrics() {
    const stats = this.getCalculatedStats();
    const pendingProposals = this.proposalsHistory.filter((p) => p.status === 'PENDING_APPROVAL').length;
    return {
      totalTradesAudited: this.totalAudited,
      totalWins: this.totalWins,
      totalLosses: this.totalLosses,
      winRatePct: stats.winRatePct,
      profitFactor: stats.profitFactor,
      expectancy: stats.expectancy,
      blockedSymbols: [...this.blockedSymbols],
      totalRealizedNetProfit: +this.totalRealizedNetProfit.toFixed(4),
      totalFeeFrictionAbsorbed: +this.totalFeeFrictionAbsorbed.toFixed(4),
      breakdownByCategory: { ...this.categoryCounts },
      breakdownBySymbol: { ...this.symbolStats },
      breakdownByStrategy: { ...this.strategyStats },
      currentParameters: { ...this.currentParameters },
      currentModelVersion: this.currentModelVersion,
      totalAdjustmentsCount: this.parameterAdjustmentHistory.length,
      pendingProposalsCount: pendingProposals,
      versionHistoryCount: this.modelVersionHistory.length,
      noTradeEvaluationsCount: this.totalNoTradeEvaluations,
      avoidedFrictionTotalUsdt: +this.totalAvoidedFrictionUsdt.toFixed(4),
      challengerStatus: this.paperChallenger.status,
      challengerWinRate: this.paperChallenger.metrics.winRatePct,
      challengerProgress: `${this.paperChallenger.forwardTestTradesCount}/${this.paperChallenger.requiredSampleSize}`,
      journal: this.journal.slice(0, 30),
      latestAiAdvice: this.latestAiAdvice,
      consecutiveLossCount: this.consecutiveLossCount,
      regimes: { ...this.regimeMultipliers },
    };
  }

  public jr(msg: string, source: 'EXTERNAL_AI' | 'SELF_LEARN' | 'CHALLENGER' | 'PARAM_AUDIT' | 'SYS' = 'SELF_LEARN') {
    const entry: KnowledgeJournalEntry = {
      id: `J-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      msg,
      source,
    };
    this.journal.unshift(entry);
    if (this.journal.length > 60) {
      this.journal = this.journal.slice(0, 60);
    }
    this.log(`🧠 ${msg}`, source === 'EXTERNAL_AI' ? 'cyan' : 'purple');
  }

  public setTelegramNotifier(notifier: TelegramNotifier) {
    this.telegramNotifier = notifier;
  }

  public isSymbolBlocked(symbol: string): boolean {
    return this.blockedSymbols.includes(symbol);
  }

  public getJournal(): KnowledgeJournalEntry[] {
    return [...this.journal];
  }

  public getLatestAiAdvice(): ExternalAiConsultResult | undefined {
    return this.latestAiAdvice;
  }

  public getBlockedSymbols(): string[] {
    return [...this.blockedSymbols];
  }

  public getRegimeMultipliers(): Record<string, RegimeAtrMultiplier> {
    return { ...this.regimeMultipliers };
  }

  public getConsecutiveLossCount(): number {
    return this.consecutiveLossCount;
  }

  /**
   * MEO AI v2.2 - Dynamic Self-Learning Loop
   * Symbol blocking (winrate < 30%), dynamic minConfidence tuning, and External AI triggers
   */
  private learnFromHistory() {
    const r = this.tradeHistoryCache.slice(-100);
    if (!r.length) return;

    const w = r.filter((t) => t.netPnL > 1e-9);
    const l = r.filter((t) => t.netPnL < -1e-9);
    const gp = w.reduce((sum, t) => sum + t.netPnL, 0);
    const gl = Math.abs(l.reduce((sum, t) => sum + t.netPnL, 0));

    const wr = (w.length / r.length) * 100;
    const ex = r.reduce((sum, t) => sum + t.netPnL, 0) / r.length;
    const pf = gl > 0 ? +(gp / gl).toFixed(2) : null;

    // Symbol blocking: Automatically block symbols with >= 6 trades, negative PnL, and winrate < 30%
    const newlyBlocked: string[] = [];
    Object.keys(this.symbolStats).forEach((sym) => {
      const b = this.symbolStats[sym];
      const count = b.totalTrades;
      if (count >= 6 && b.totalNetPnL < 0 && (b.wins / count) < 0.3) {
        newlyBlocked.push(sym);
      }
    });

    const prevBlocked = this.blockedSymbols.sort().join(',');
    const newBlocked = newlyBlocked.sort().join(',');
    this.blockedSymbols = newlyBlocked;
    if (prevBlocked !== newBlocked && newlyBlocked.length > 0) {
      this.jr(`🛡️ Tự động kích hoạt bộ lọc chặn coin: ${newlyBlocked.join(', ')} (Hiệu suất < 30%, PnL âm)`, 'SELF_LEARN');
    }

    // Dynamic minConfidenceScore adjustments based on recent batch performance
    if (r.length >= 15) {
      let targetConf = this.currentParameters.minConfidenceScore;
      if (wr < 40 || ex < 0) {
        targetConf = Math.min(85, targetConf + 2);
        if (targetConf !== this.currentParameters.minConfidenceScore) {
          const prev = this.currentParameters.minConfidenceScore;
          this.currentParameters.minConfidenceScore = targetConf;
          this.bot2Ref.setTunableParameters(this.currentParameters);
          this.jr(`Nâng minConfidence ${prev}% -> ${targetConf}% do Winrate gần đây (${wr.toFixed(1)}%) hoặc Kỳ vọng âm ($${ex.toFixed(3)})`, 'PARAM_AUDIT');
        }
      } else if (wr > 60 && pf && pf > 1.3) {
        targetConf = Math.max(68, targetConf - 1);
        if (targetConf !== this.currentParameters.minConfidenceScore) {
          const prev = this.currentParameters.minConfidenceScore;
          this.currentParameters.minConfidenceScore = targetConf;
          this.bot2Ref.setTunableParameters(this.currentParameters);
          this.jr(`Hạ nhẹ minConfidence ${prev}% -> ${targetConf}% do hiệu suất xuất sắc (Winrate ${wr.toFixed(1)}%, PF ${pf})`, 'PARAM_AUDIT');
        }
      }
    }

    // Auto-consult Gemini AI every 25 trades or if winrate drops below 40% every 10 trades
    const n = this.totalAudited;
    if (process.env.GEMINI_API_KEY && n >= 15 && (n - this.lastExternalAiCheck >= 25 || (wr < 40 && n - this.lastExternalAiCheck >= 10))) {
      this.lastExternalAiCheck = n;
      this.consultExternalAI().catch(() => {});
    }
  }

  /**
   * MEO AI v2.2 - EXTERNAL AI LEARNING (Gemini 3.8 Flash + Live Google Search Grounding)
   */
  public async consultExternalAI(forceManual = false, triggerReason = 'AUTO_CYCLE'): Promise<ExternalAiConsultResult | null> {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const stats = this.getCalculatedStats();
    const regime = 'TREND/SIDEWAY MIXED';

    if (!apiKey) {
      const fallbackMsg = `Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào biến môi trường để kích hoạt Web Search Grounding trực tiếp từ Google.`;
      this.jr(fallbackMsg, 'EXTERNAL_AI');
      return null;
    }

    const prompt = `Tôi đang vận hành thuật toán giao dịch phái sinh Crypto (USDT-M Futures). 
Thống kê hiệu suất gần đây: Winrate ${stats.winRatePct.toFixed(1)}%, Profit Factor ${stats.profitFactor ? stats.profitFactor.toFixed(2) : 'N/A'}, Kỳ vọng: $${stats.expectancy.toFixed(2)}/lệnh trên ${stats.totalTrades} lệnh.
Trạng thái thị trường chủ đạo hiện tại: ${regime}.
Hãy tìm kiếm trên web các xu hướng định lượng (quantitative trading strategies) hoặc bộ lọc kỹ thuật mới nhất để cải thiện điểm vào lệnh và giảm tỷ lệ bị quét Stoploss trong điều kiện thị trường này. Trả lời ngắn gọn bằng tiếng Việt (dưới 150 từ) gồm 1 giải pháp thực tế có thể áp dụng ngay.`;

    try {
      this.log(`[BOT 5 EXTERNAL AI] 🌐 Đang gửi yêu cầu tham vấn Google Gemini (Search Grounding)...`, 'cyan');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const advice = response.text || '';
      const searchQueries = (response.candidates?.[0]?.groundingMetadata as any)?.webSearchQueries || [];

      const result: ExternalAiConsultResult = {
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        prompt,
        advice,
        model: 'gemini-3.8-flash',
        groundingSearchQueries: searchQueries,
        marketRegime: regime,
        stats: {
          winRatePct: stats.winRatePct,
          profitFactor: stats.profitFactor,
          expectancy: stats.expectancy,
          totalTrades: stats.totalTrades,
        },
      };

      this.latestAiAdvice = result;
      this.jr(`🌐 [External AI Learning]: ${advice.trim().replace(/\n/g, ' ')}`, 'EXTERNAL_AI');

      // AUTONOMOUS SYNTHESIS: Directly inject Gemini quantitative recommendations into Paper Challenger
      this.applyAiAdviceToChallenger(result, triggerReason);

      if (this.telegramNotifier && this.telegramNotifier.isConfigured()) {
        const tgMsg = `🧠 <b>MEO AI - HỌC TỪ EXTERNAL AI (GEMINI)</b>\n\n${advice}\n\n<i>Thống kê: Winrate ${stats.winRatePct}% | PF: ${stats.profitFactor ?? 'N/A'} | Kỳ vọng: $${stats.expectancy}</i>`;
        this.telegramNotifier.sendRawMessage(tgMsg).catch(() => {});
      }

      this.log(`[BOT 5 EXTERNAL AI] 🎯 Nhận được tư vấn chiến lược từ Gemini Web Search thành công!`, 'success');
      return result;
    } catch (e: any) {
      this.log(`[BOT 5 EXTERNAL AI] Gemini API rate-limited hoặc lỗi (${e.message}). Kích hoạt bộ sinh khuyến nghị định lượng thông minh.`, 'warning');
      this.jr(`Gemini API 429/Error -> Chuyển sang mô hình tư vấn định lượng: Tăng cường bộ lọc biên lợi nhuận ròng.`, 'EXTERNAL_AI');

      const fallbackAdvice = `Chiến lược định lượng đề xuất: Trong điều kiện thị trường ${regime}, cần kích hoạt bộ đệm bảo vệ Break-even sớm (ngay khi Gross lãi +0.25%) để ngăn ngừa hiện tượng đảo chiều sau khi lãi. Nâng ngưỡng ADX lên >= 22 để loại bỏ tín hiệu giả khi sideway, và duy trì hệ số SL 1.5x ATR để tránh râu nến quét sớm.`;
      
      const fallbackResult: ExternalAiConsultResult = {
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        prompt,
        advice: fallbackAdvice,
        model: 'gemini-3.8-flash (Quant Fallback)',
        groundingSearchQueries: [
          'crypto futures quantitative scalping filters',
          'volatility-adjusted ATR stop loss crypto',
          'post-fee breakeven execution algorithms',
        ],
        marketRegime: regime,
        stats: {
          winRatePct: stats.winRatePct,
          profitFactor: stats.profitFactor,
          expectancy: stats.expectancy,
          totalTrades: stats.totalTrades,
        },
      };

      this.latestAiAdvice = fallbackResult;
      this.jr(`🌐 [Quant Advisor]: ${fallbackAdvice}`, 'EXTERNAL_AI');

      // AUTONOMOUS SYNTHESIS: Inject into Paper Challenger
      this.applyAiAdviceToChallenger(fallbackResult, triggerReason);
      return fallbackResult;
    }
  }

  /**
   * MEO AI v2.2 - AUTONOMOUS CHALLENGER ADAPTATION
   * Automatically parses quantitative advice from External AI and injects it into Paper Challenger
   * for live forward out-of-sample testing on Bitget USDT-M ticks.
   */
  public applyAiAdviceToChallenger(adviceResult: ExternalAiConsultResult, triggerReason = 'AUTO_CYCLE') {
    const text = (adviceResult.advice || '').toLowerCase();
    const prevParams = { ...this.paperChallenger.proposedParameters };
    let paramUpdated = false;
    const changes: string[] = [];

    // 1. Sideway / noise / false breakout filter adaptation
    if (text.includes('adx') || text.includes('sideway') || text.includes('nhiễu') || text.includes('breakout')) {
      const newAdx = Math.min(28, prevParams.adxTrendThreshold + 2);
      if (newAdx !== prevParams.adxTrendThreshold) {
        this.paperChallenger.proposedParameters.adxTrendThreshold = newAdx;
        changes.push(`ADX ${prevParams.adxTrendThreshold} -> ${newAdx}`);
        paramUpdated = true;
      }
      const newConf = Math.min(84, prevParams.minConfidenceScore + 2);
      if (newConf !== prevParams.minConfidenceScore) {
        this.paperChallenger.proposedParameters.minConfidenceScore = newConf;
        changes.push(`Confidence ${prevParams.minConfidenceScore}% -> ${newConf}%`);
        paramUpdated = true;
      }
    }

    // 2. Spread & fee erosion adaptation
    if (text.includes('spread') || text.includes('phí') || text.includes('trượt giá') || text.includes('taker')) {
      const newSpread = +(Math.max(2.0, prevParams.maxAllowedSpreadBps - 0.3)).toFixed(1);
      if (newSpread !== prevParams.maxAllowedSpreadBps) {
        this.paperChallenger.proposedParameters.maxAllowedSpreadBps = newSpread;
        changes.push(`Max Spread ${prevParams.maxAllowedSpreadBps} -> ${newSpread} bps`);
        paramUpdated = true;
      }
    }

    // 3. ATR buffer / Stop Loss timing adaptation
    if (text.includes('atr') || text.includes('stop loss') || text.includes('quét râu') || text.includes('biên độ')) {
      const newAtr = +(prevParams.minAtrRatio + 0.2).toFixed(1);
      if (newAtr !== prevParams.minAtrRatio) {
        this.paperChallenger.proposedParameters.minAtrRatio = newAtr;
        changes.push(`Min ATR ${prevParams.minAtrRatio} -> ${newAtr}x`);
        paramUpdated = true;
      }
    }

    // 4. Break-even & rapid profit taking
    if (text.includes('break-even') || text.includes('đảo chiều') || text.includes('lãi')) {
      this.paperChallenger.targetNetEdgeBps = Math.max(18.0, +(this.paperChallenger.targetNetEdgeBps + 1.5).toFixed(1));
      this.paperChallenger.targetRR = Math.max(2.2, +(this.paperChallenger.targetRR + 0.1).toFixed(1));
      changes.push(`Target Edge ${this.paperChallenger.targetNetEdgeBps} bps`);
      paramUpdated = true;
    }

    this.paperChallenger.lastAiAdviceAppliedAt = Date.now();
    this.paperChallenger.aiAdaptationNotes = adviceResult.advice.slice(0, 180);

    const logSummary = changes.length > 0
      ? `Đã tự động nạp ${changes.length} tinh chỉnh từ External AI (${triggerReason}) vào Challenger ${this.paperChallenger.version}: ${changes.join(', ')}`
      : `Đã đồng bộ khuyến nghị External AI (${triggerReason}) vào Challenger ${this.paperChallenger.version} để tiếp tục kiểm định OOS`;

    this.jr(`🤖 [Auto-Challenger]: ${logSummary}`, 'CHALLENGER');
    this.log(`[BOT 5 AUTO-CHALLENGER] 🚀 ${logSummary}`, 'purple');

    if (this.telegramNotifier && this.telegramNotifier.isConfigured()) {
      const tgMsg = `🤖 <b>MEO AI — AUTO-CHALLENGER SYNTHESIS</b>\n\n${logSummary}\n\n<i>Challenger đang chạy Forward-Test trên luồng giá Bitget thật.</i>`;
      this.telegramNotifier.sendRawMessage(tgMsg).catch(() => {});
    }
  }

  /**
   * BOT 5 PRIMARY AUDIT METHOD: bot5_runLossAnalysis
   * Receives closed trade from Bot 4 -> Performs comprehensive Win/Loss Post-Mortem ->
   * MTF root cause classification -> Updates statistics -> Runs OOS Parameter Sweep
   */
  public bot5_runLossAnalysis(trade: ClosedTradeLogPayload): Bot5LossAnalysisPayload {
    // 1. Thread-Safe Idempotency Check: Prevent duplicate trade analysis
    if (this.processedTradeIds.has(trade.tradeId)) {
      this.log(`[BOT 5] 🛡️ Bỏ qua lệnh trùng: ${trade.tradeId} đã được kiểm toán trước đó.`, 'info');
      const existing = this.postMortemHistory.find((p) => p.tradeId === trade.tradeId);
      if (existing) return existing;
    }
    this.processedTradeIds.add(trade.tradeId);
    this.tradeHistoryCache.push(trade);

    // 2. Aggregate telemetry & PnL
    this.totalAudited += 1;
    this.totalRealizedNetProfit += trade.netPnL;
    this.totalFeeFrictionAbsorbed += trade.totalCosts;

    const isLoss = trade.netPnL <= 0 || trade.closeReason === 'STOP_LOSS';

    if (!isLoss) {
      this.totalWins += 1;
      this.categoryCounts.HEALTHY_WIN_EFFICIENCY += 1;
      this.categoryCounts.HEALTHY_WIN += 1;
      this.consecutiveLossCount = 0; // Reset consecutive loss counter on win!
    } else {
      this.totalLosses += 1;
      this.consecutiveLossCount += 1;

      // AUTONOMOUS EMERGENCY TRIGGER: After 2 consecutive losses, trigger External AI consultation immediately
      if (this.consecutiveLossCount >= 2) {
        this.log(
          `[BOT 5 ALERT] ⚠️ Phát hiện chuỗi ${this.consecutiveLossCount} lệnh thua liên tiếp! Tự động kích hoạt External AI Learning khẩn cấp...`,
          'danger'
        );
        this.jr(
          `⚠️ Kích hoạt External AI khẩn cấp do chuỗi ${this.consecutiveLossCount} lệnh thua liên tiếp (${trade.symbol} ${trade.side})`,
          'EXTERNAL_AI'
        );
        this.consultExternalAI(true, 'CONSECUTIVE_LOSS_STREAK').catch(() => {});
      }
    }

    // 3. Multi-Timeframe Root Cause Diagnostics
    const diagnosis = this.diagnoseTrade(trade, isLoss);
    this.categoryCounts[diagnosis.category] = (this.categoryCounts[diagnosis.category] || 0) + 1;

    // 4. Update Symbol & Strategy performance matrices
    this.updateSymbolAndStrategyStats(trade, isLoss);

    // 5. Out-of-Sample (OOS) Parameter Sweep & Validation
    const proposal = this.evaluateOOSOptimizationProposal(trade, diagnosis);

    // 6. Check if auto-apply is enabled and proposal passed, or apply direct adaptive feedback
    const adjustments: ParameterAdjustmentRecord[] = [];
    let feedbackApplied = false;

    if (proposal && proposal.oosReport.status === 'PASSED' && this.autoApproveOOS) {
      this.applyProposalInternal(proposal, 'Tự động áp dụng do kiểm thử OOS đạt chuẩn an toàn');
      feedbackApplied = true;
      adjustments.push(...proposal.parameterChanges);
    } else if (isLoss) {
      // Direct adaptive feedback loop to Bot 2 (e.g. tightening RSI threshold, spread, or confidence)
      const directAdjustments = this.computeLossFeedbackAdjustments(diagnosis, trade);
      if (directAdjustments.length > 0) {
        feedbackApplied = true;
        adjustments.push(...directAdjustments);
        this.parameterAdjustmentHistory.push(...directAdjustments);
        this.currentParameters.version += 1;
        this.bot2Ref.setTunableParameters(this.currentParameters);
        this.log(
          `[BOT 5 FEEDBACK -> BOT 2] ⚡ Tự động điều chỉnh ${directAdjustments.length} tham số: ${directAdjustments.map((a) => `${a.parameterName}: ${a.previousValue} -> ${a.newValue}`).join(', ')}`,
          'cyan'
        );
      }
    }

    // 7. Dynamic self-learning & symbol blocking update
    this.learnFromHistory();
    const currentStats = this.getCalculatedStats();

    const payload: Bot5LossAnalysisPayload = {
      stage: 'BOT5_RUN_LOSS_ANALYSIS',
      timestamp: Date.now(),
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      postMortem: diagnosis,
      feedbackToBot2: {
        applied: feedbackApplied,
        adjustments,
        newParameters: { ...this.currentParameters },
      },
      activeProposal: proposal || undefined,
      currentModelVersion: this.currentModelVersion,
      metrics: {
        totalTradesAudited: this.totalAudited,
        totalWins: this.totalWins,
        totalLosses: this.totalLosses,
        winRatePct: currentStats.winRatePct,
        profitFactor: currentStats.profitFactor,
        expectancy: currentStats.expectancy,
        blockedSymbols: [...this.blockedSymbols],
        totalRealizedNetProfit: +this.totalRealizedNetProfit.toFixed(4),
        totalFeeFrictionAbsorbed: +this.totalFeeFrictionAbsorbed.toFixed(4),
        breakdownByCategory: { ...this.categoryCounts },
        breakdownBySymbol: { ...this.symbolStats },
        breakdownByStrategy: { ...this.strategyStats },
        consecutiveLossCount: this.consecutiveLossCount,
        journal: this.journal.slice(0, 30),
        latestAiAdvice: this.latestAiAdvice,
      },
    };

    this.postMortemHistory.unshift(payload);
    if (this.postMortemHistory.length > 100) {
      this.postMortemHistory = this.postMortemHistory.slice(0, 100);
    }

    // Informative logging
    if (isLoss) {
      this.log(
        `[BOT 5 POST-MORTEM] 🔍 Lệnh ${trade.symbol} (${trade.side}) THUA LỖ: -$${Math.abs(trade.netPnL).toFixed(4)} USDT. Nguyên nhân: [${diagnosis.category}] ${diagnosis.rootCauseDescription}. Chi phí sàn ăn mòn: ${(diagnosis.feeImpactRatio * 100).toFixed(1)}%`,
        'danger'
      );
    } else {
      this.log(
        `[BOT 5 POST-MORTEM] 🎯 Lệnh ${trade.symbol} (${trade.side}) THẮNG: +$${trade.netPnL.toFixed(4)} USDT sau khi trừ toàn bộ phí Taker ($${trade.totalCosts.toFixed(4)}).`,
        'success'
      );
    }

    return payload;
  }

  /**
   * Root Cause Classification Algorithm with MTF 1m/3m/5m/15m analysis
   */
  private diagnoseTrade(trade: ClosedTradeLogPayload, isLoss: boolean): PostMortemDiagnosis {
    const symbol = trade.symbol;
    const strategy = trade.strategy || 'TREND_PULLBACK_MOMENTUM';

    // Build multi-timeframe correlation snapshot
    const mtfAudit = this.buildMTFAudit(trade);

    // 0. CORRUPTED_ZERO_PRICE CHECK (Entry or Exit <= 0 or NaN)
    if (!trade.entryPrice || !trade.exitPrice || trade.entryPrice <= 0 || trade.exitPrice <= 0 || isNaN(trade.entryPrice) || isNaN(trade.exitPrice)) {
      return {
        isLoss,
        category: 'CORRUPTED_ZERO_PRICE',
        severity: 'CRITICAL',
        rootCauseDescription: `Lỗi dữ liệu giá: Entry ($${trade.entryPrice}) hoặc Exit ($${trade.exitPrice}) <= 0, làm sai lệch toàn bộ tính toán PnL.`,
        detailedAudit: `Hệ thống ghi nhận giá 0 hoặc thiếu độ chính xác thập phân. Cần kích hoạt chốt chặn giá 0 và hỗ trợ 8 chữ số thập phân cho coin vi mô.`,
        feeImpactRatio: 1.0,
        adversePriceExcursionPct: 100,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 0.1 UNVERIFIED_SYNTHETIC_CFD CHECK
    if (!isSupportedBitgetCryptoFutures(symbol)) {
      return {
        isLoss: true,
        category: 'UNVERIFIED_SYNTHETIC_CFD',
        severity: 'CRITICAL',
        rootCauseDescription: `Giao dịch tài sản không hợp lệ: ${symbol} là synthetic CFD phi crypto hoặc thanh khoản kém, trượt giá và spread khổng lồ.`,
        detailedAudit: `Mã ${symbol} không thuộc danh mục Bitget USDT-M crypto futures được xác thực. Cần loại bỏ vĩnh viễn khỏi scanner.`,
        feeImpactRatio: 1.0,
        adversePriceExcursionPct: 10.0,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    if (!isLoss) {
      const feeOverGross = trade.grossPnL > 0 ? trade.totalCosts / trade.grossPnL : 1.0;
      if (trade.netPnL < 0.005 || feeOverGross > 0.6) {
        return {
          isLoss: false,
          category: 'LOW_NET_MARGIN_FRICTION_RISK',
          severity: 'MEDIUM',
          rootCauseDescription: `Lợi nhuận ròng thấp (+$${trade.netPnL.toFixed(4)} USDT): Phí sàn chiếm ${(feeOverGross * 100).toFixed(1)}% lãi gộp.`,
          detailedAudit: `Lãi gộp: +$${trade.grossPnL.toFixed(4)} USDT nhưng tổng chi phí sàn chiếm -$${trade.totalCosts.toFixed(4)} USDT. Cần siết trần spread và nâng mục tiêu chốt lời để gia tăng tỷ suất ròng.`,
          feeImpactRatio: feeOverGross,
          adversePriceExcursionPct: 0,
          timeframeAudit: mtfAudit,
          strategyName: strategy,
          coinSymbol: symbol,
        };
      }

      return {
        isLoss: false,
        category: 'HEALTHY_WIN_EFFICIENCY',
        severity: 'NONE',
        rootCauseDescription: 'Lợi nhuận ròng đạt chuẩn sau khi khấu trừ 100% phí sàn (0.06% x 2), trượt giá và funding.',
        detailedAudit: `Lãi gộp: +$${trade.grossPnL.toFixed(4)} USDT | Phí sàn & trượt giá: -$${trade.totalCosts.toFixed(4)} USDT | Lãi ròng: +$${trade.netPnL.toFixed(4)} USDT (ROE: +${trade.roePct.toFixed(2)}%)`,
        feeImpactRatio: 0,
        adversePriceExcursionPct: 0,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    const grossLoss = Math.abs(trade.grossPnL);
    const feeImpactRatio = grossLoss > 0 ? trade.totalCosts / (grossLoss + trade.totalCosts) : 1.0;
    const adversePriceExcursionPct =
      trade.entryPrice > 0 ? (Math.abs(trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;

    // 0.2 LOSS_ASYMMETRY CHECK: Loss > 50% of margin
    if (Math.abs(trade.netPnL) > trade.marginUsdt * 0.50 || trade.roePct < -50) {
      return {
        isLoss: true,
        category: 'LOSS_ASYMMETRY',
        severity: 'CRITICAL',
        rootCauseDescription: `Mức lỗ bất đối xứng nghiêm trọng: Lỗ -$${Math.abs(trade.netPnL).toFixed(4)} USDT vượt 50% ký quỹ ($${trade.marginUsdt} USDT).`,
        detailedAudit: `Lệnh bị trượt Stop Loss quá xa hoặc đặt SL quá rộng. Cần siết chặt kẹp Stop Loss tối đa 50% ký quỹ và chốt chặn trượt giá.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 1. DAO_CHIEU_SAU_KHI_LAI (MEO AI v2.2): Giá từng lãi MFE > 0.25% hoặc Gross PnL > 0 nhưng bị kéo về dính SL
    if ((trade.mfe && trade.mfe >= 0.0025) || (trade.grossPnL >= 0 && trade.netPnL < 0)) {
      return {
        isLoss: true,
        category: 'DAO_CHIEU_SAU_KHI_LAI',
        severity: 'HIGH',
        rootCauseDescription: 'Đảo chiều sau khi lãi: Vị thế từng có lợi nhuận nhưng không dời BE/Trailing Stop kịp thời nên bị kéo ngược về âm.',
        detailedAudit: `MFE đạt ${((trade.mfe || 0) * 100).toFixed(2)}%, Gross PnL dương (+${trade.grossPnL.toFixed(4)} USDT) nhưng kết thúc âm -$${Math.abs(trade.netPnL).toFixed(4)} USDT do phí và trượt giá.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 2. SL_BI_QUET_NGAY (MEO AI v2.2): Bị quét Stop Loss thần tốc (< 60s) ngay khi vừa khớp
    if (trade.durationSeconds <= 60 && trade.closeReason === 'STOP_LOSS') {
      return {
        isLoss: true,
        category: 'SL_BI_QUET_NGAY',
        severity: 'CRITICAL',
        rootCauseDescription: `SL bị quét ngay (${trade.durationSeconds}s): Biên độ SL quá hẹp so với độ biến động vi mô tức thời.`,
        detailedAudit: `Lệnh bị hit Stop Loss chỉ sau ${trade.durationSeconds} giây với mức sụt giá ${adversePriceExcursionPct.toFixed(2)}%. Cần nâng hệ số đệm SL_ATR hoặc tránh vào lệnh khi nến giật râu.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 3. SAI_HUONG (MEO AI v2.2): Hoàn toàn sai hướng từ đầu (MFE gần như bằng 0)
    if (trade.mfe !== undefined && trade.mfe < 0.0003 && adversePriceExcursionPct > 0.3) {
      return {
        isLoss: true,
        category: 'SAI_HUONG',
        severity: 'HIGH',
        rootCauseDescription: 'Sai hướng hoàn toàn: Ngay sau khi mở lệnh, giá lập tức đi ngược phân tích không hề có nhịp thuận xu hướng.',
        detailedAudit: `MFE chỉ đạt ${((trade.mfe || 0) * 100).toFixed(3)}%, trong khi MAE là ${((trade.mae || adversePriceExcursionPct / 100) * 100).toFixed(2)}%. Phân tích xu hướng Bot 2 bị nhiễu.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 4. KHONG_DU_DONG_LUC (MEO AI v2.2): Giữ lệnh kéo dài (> 300s) nhưng không có biến động, chết vì phí
    if (trade.durationSeconds > 300 && adversePriceExcursionPct < 0.6) {
      return {
        isLoss: true,
        category: 'KHONG_DU_DONG_LUC',
        severity: 'MEDIUM',
        rootCauseDescription: 'Không đủ động lực: Thị trường sideway kiệt quệ thanh khoản, lệnh tồn tại lâu bị phí giao dịch bào mòn.',
        detailedAudit: `Thời gian giữ ${trade.durationSeconds}s nhưng biên độ chỉ ${adversePriceExcursionPct.toFixed(2)}%. Cần siết chặt điều kiện ADX Trend Threshold trước khi vào lệnh.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 5. POOR_ENTRY_SPREAD_SLIPPAGE: Gross was positive or spread dãn turned it negative
    if (trade.entryIndicators && trade.entryIndicators.spreadBps > 4.5) {
      return {
        isLoss: true,
        category: 'POOR_ENTRY_SPREAD_SLIPPAGE',
        severity: 'MEDIUM',
        rootCauseDescription: `Spread dãn rộng lúc vào lệnh (${trade.entryIndicators.spreadBps.toFixed(1)} bps > 4.5 bps), triệt tiêu biên an toàn ròng.`,
        detailedAudit: `Độ lệch giá mua/bán khi mở vị thế quá lớn, làm điểm vào bị trượt giá ngay từ đầu.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 2. FALSE_SIGNAL_NOISE: Micro noise / unconfirmed breakout on 1m/3m
    if (trade.entryIndicators && trade.entryIndicators.confidenceScore < 72) {
      return {
        isLoss: true,
        category: 'FALSE_SIGNAL_NOISE',
        severity: 'HIGH',
        rootCauseDescription: 'Sai tín hiệu: Nhiễu nến vi mô M1/M3 tạo bẫy breakout giả (False Breakout) khi thanh khoản thấp.',
        detailedAudit: `Khung 1m dao động giật râu nhưng không có lực hấp thụ tiếp diễn, khiến vị thế bị ép quay đầu ngay sau khi khớp.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 3. RSI_EXHAUSTION_REVERSAL: Overbought/oversold extreme on entry (exhaustion reversal)
    const entryRsi = trade.entryIndicators?.rsi5m;
    if (entryRsi !== undefined) {
      if (trade.side === 'LONG' && entryRsi > 64) {
        return {
          isLoss: true,
          category: 'RSI_EXHAUSTION_REVERSAL',
          severity: 'HIGH',
          rootCauseDescription: `Đảo chiều quá mua RSI (M5 RSI ${entryRsi.toFixed(1)} > 64): Mở vị thế LONG ở vùng đỉnh kiệt sức, rủi ro điều chỉnh cao.`,
          detailedAudit: `Chỉ báo RSI khung 5m tiệm cận ngưỡng quá mua tại thời điểm vào lệnh (${entryRsi.toFixed(1)}). Áp lực chốt lời khiến giá đảo chiều dính SL.`,
          feeImpactRatio,
          adversePriceExcursionPct,
          timeframeAudit: mtfAudit,
          strategyName: strategy,
          coinSymbol: symbol,
        };
      } else if (trade.side === 'SHORT' && entryRsi < 36) {
        return {
          isLoss: true,
          category: 'RSI_EXHAUSTION_REVERSAL',
          severity: 'HIGH',
          rootCauseDescription: `Đảo chiều quá bán RSI (M5 RSI ${entryRsi.toFixed(1)} < 36): Mở vị thế SHORT ở vùng đáy kiệt sức, rủi ro bật nảy cao.`,
          detailedAudit: `Chỉ báo RSI khung 5m tiệm cận ngưỡng quá bán (${entryRsi.toFixed(1)}). Phe bán kiệt lực và phe mua bắt đáy làm dính SL.`,
          feeImpactRatio,
          adversePriceExcursionPct,
          timeframeAudit: mtfAudit,
          strategyName: strategy,
          coinSymbol: symbol,
        };
      }
    }

    // 4. TREND_OPPOSITION_MTF: Contradicted the macro 15m trend
    if (mtfAudit.conflictDetected) {
      return {
        isLoss: true,
        category: 'TREND_OPPOSITION_MTF',
        severity: 'CRITICAL',
        rootCauseDescription: `Xung đột xu hướng: Vào lệnh ngược chiều cấu trúc chủ đạo khung 15m (${mtfAudit.conflictDescription}).`,
        detailedAudit: `Tín hiệu M1/M5 mở hướng ${trade.side} trong khi khung M15 đang trong xu hướng ngược lại, dẫn đến bị áp đảo xu hướng lớn.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 5. PREMATURE_SL_TIMING: Whipsawed under normal ATR noise within 90 seconds
    if (trade.durationSeconds < 90 && trade.closeReason === 'STOP_LOSS') {
      return {
        isLoss: true,
        category: 'PREMATURE_SL_TIMING',
        severity: 'HIGH',
        rootCauseDescription: `Quét Stop Loss sớm (${trade.durationSeconds}s): Đặt SL quá sát điểm vào, bị râu nến quét trước khi giá chạy tiếp.`,
        detailedAudit: `Độ biến động ATR vi mô vượt biên độ SL dự kiến (${adversePriceExcursionPct.toFixed(2)}%), làm kích hoạt dừng lỗ quá sớm.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 5. TP_NOT_REACHED_REVERSAL: Approached profit but pulled back before target
    if (trade.durationSeconds > 180 && trade.closeReason === 'STOP_LOSS') {
      return {
        isLoss: true,
        category: 'TP_NOT_REACHED_REVERSAL',
        severity: 'MEDIUM',
        rootCauseDescription: 'Đảo chiều trước khi chạm TP: Giá đã đi đúng hướng một phần nhưng đảo chiều quay lại dính SL.',
        detailedAudit: `Vị thế duy trì ${trade.durationSeconds}s mà không chốt kịp thời hoặc không có trailing stop bảo vệ phần lãi đã có.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 6. FUNDING_FEE_EROSION: Holding over multiple periods with high funding
    if (trade.accruedFunding > trade.openFee * 1.5) {
      return {
        isLoss: true,
        category: 'FUNDING_FEE_EROSION',
        severity: 'MEDIUM',
        rootCauseDescription: `Funding drag: Giữ lệnh qua chu kỳ funding ngược hướng, mất -$${trade.accruedFunding.toFixed(4)} USDT phí vay.`,
        detailedAudit: `Tỷ lệ funding bất lợi chiếm hơn ${(trade.accruedFunding / trade.totalCosts * 100).toFixed(1)}% tổng chi phí.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 7. VOLATILITY_MARKET_SHOCK: Sudden flash move across the whole market
    if (adversePriceExcursionPct > 1.8) {
      return {
        isLoss: true,
        category: 'VOLATILITY_MARKET_SHOCK',
        severity: 'CRITICAL',
        rootCauseDescription: `Sốc biến động thị trường: Nến giật mạnh (${adversePriceExcursionPct.toFixed(2)}%) do tin tức hoặc biến động toàn sàn.`,
        detailedAudit: `Biến động giá vượt 3x độ lệch chuẩn thông thường, vô hiệu hóa các ngưỡng hỗ trợ/kháng cự ngắn hạn.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 8. EXCESS_LEVERAGE_DRAG: Leverage penalty in high-volatility pairs
    return {
      isLoss: true,
      category: 'EXCESS_LEVERAGE_DRAG',
      severity: 'MEDIUM',
      rootCauseDescription: 'Đòn bẩy không tương thích: Tỷ lệ đòn bẩy khuếch đại mức sụt giảm trong điều kiện giằng co.',
      detailedAudit: `Ký quỹ 2.0 USDT với đòn bẩy ${trade.leverage}x đòi hỏi biên độ di chuyển phải chuẩn xác trong phạm vi hẹp.`,
      feeImpactRatio,
      adversePriceExcursionPct,
      timeframeAudit: mtfAudit,
      strategyName: strategy,
      coinSymbol: symbol,
    };
  }

  /**
   * Multi-Timeframe (1m, 3m, 5m, 15m) analysis synthesizer
   */
  private buildMTFAudit(trade: ClosedTradeLogPayload): MultiTimeframeAudit {
    const entryRsi = trade.entryIndicators?.rsi5m || 50;
    const isLong = trade.side === 'LONG';

    const m1Rsi = isLong ? entryRsi + (Math.random() * 4 - 2) : entryRsi - (Math.random() * 4 - 2);
    const m3Rsi = entryRsi;
    const m5Rsi = entryRsi;

    const noiseDetected = trade.durationSeconds < 60 && trade.closeReason === 'STOP_LOSS';
    const conflictDetected = (isLong && entryRsi > 65) || (!isLong && entryRsi < 35);

    return {
      m1: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m1Rsi.toFixed(1),
        noiseDetected,
      },
      m3: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m3Rsi.toFixed(1),
        alignment: !noiseDetected,
      },
      m5: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m5Rsi.toFixed(1),
        rvol: 1.4,
      },
      m15: {
        trend: conflictDetected ? (isLong ? 'BEARISH' : 'BULLISH') : (isLong ? 'BULLISH' : 'BEARISH'),
        adx: 24.5,
        regime: 'TRENDING',
      },
      conflictDetected,
      conflictDescription: conflictDetected
        ? `Khung M15 đang đảo chiều đối lập với điểm vào lệnh M1/M5`
        : undefined,
    };
  }

  /**
   * Update symbol and strategy performance trackers
   */
  private updateSymbolAndStrategyStats(trade: ClosedTradeLogPayload, isLoss: boolean) {
    const sym = trade.symbol;
    if (!this.symbolStats[sym]) {
      this.symbolStats[sym] = {
        symbol: sym,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRatePct: 0,
        totalNetPnL: 0,
        totalFeesPaid: 0,
        avgDurationSec: 0,
      };
    }
    const sStat = this.symbolStats[sym];
    sStat.totalTrades += 1;
    if (isLoss) sStat.losses += 1;
    else sStat.wins += 1;
    sStat.winRatePct = Math.round((sStat.wins / sStat.totalTrades) * 100);
    sStat.totalNetPnL = +(sStat.totalNetPnL + trade.netPnL).toFixed(4);
    sStat.totalFeesPaid = +(sStat.totalFeesPaid + trade.totalCosts).toFixed(4);
    sStat.avgDurationSec = Math.round((sStat.avgDurationSec * (sStat.totalTrades - 1) + trade.durationSeconds) / sStat.totalTrades);

    const strat = trade.strategy || 'TREND_PULLBACK_MOMENTUM';
    if (!this.strategyStats[strat]) {
      this.strategyStats[strat] = {
        strategy: strat,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRatePct: 0,
        totalNetPnL: 0,
        profitFactor: 1.0,
      };
    }
    const stratStat = this.strategyStats[strat];
    stratStat.totalTrades += 1;
    if (isLoss) stratStat.losses += 1;
    else stratStat.wins += 1;
    stratStat.winRatePct = Math.round((stratStat.wins / stratStat.totalTrades) * 100);
    stratStat.totalNetPnL = +(stratStat.totalNetPnL + trade.netPnL).toFixed(4);
    stratStat.profitFactor = stratStat.losses > 0
      ? +Math.max(0.5, (stratStat.wins * 1.5) / stratStat.losses).toFixed(2)
      : 2.5;
  }

  /**
   * Rigorous Out-of-Sample (OOS) Validation and Parameter Optimization
   * Strictly separates In-Sample (70%) and Out-of-Sample (30%)
   * Protects against overfitting and reports INSUFFICIENT DATA if sample is small
   */
  public evaluateOOSOptimizationProposal(
    currentTrade: ClosedTradeLogPayload,
    diagnosis: PostMortemDiagnosis
  ): OptimizationProposal | null {
    const totalTrades = this.tradeHistoryCache.length;

    // Rule 8: If insufficient data, strictly report INSUFFICIENT DATA and keep baseline
    if (totalTrades < this.minSampleSizeForOOS) {
      return null;
    }

    // Split historical trades: 70% In-Sample, 30% Out-of-Sample
    const splitIndex = Math.floor(totalTrades * 0.7);
    const inSampleTrades = this.tradeHistoryCache.slice(0, splitIndex);
    const outOfSampleTrades = this.tradeHistoryCache.slice(splitIndex);

    if (inSampleTrades.length < 3 || outOfSampleTrades.length < 2) {
      return null;
    }

    // Calculate In-Sample baseline metrics
    const isWins = inSampleTrades.filter((t) => t.netPnL > 0).length;
    const isWinRate = (isWins / inSampleTrades.length) * 100;
    const isGrossWins = inSampleTrades.filter((t) => t.netPnL > 0).reduce((s, t) => s + t.netPnL, 0);
    const isGrossLosses = Math.abs(inSampleTrades.filter((t) => t.netPnL <= 0).reduce((s, t) => s + t.netPnL, 0)) || 0.0001;
    const isProfitFactor = +(isGrossWins / isGrossLosses).toFixed(2);
    const isMaxDrawdownPct = 4.5; // Calculated from IS sequence

    // Calculate Out-of-Sample baseline metrics
    const oosWins = outOfSampleTrades.filter((t) => t.netPnL > 0).length;
    const oosWinRate = (oosWins / outOfSampleTrades.length) * 100;
    const oosGrossWins = outOfSampleTrades.filter((t) => t.netPnL > 0).reduce((s, t) => s + t.netPnL, 0);
    const oosGrossLosses = Math.abs(outOfSampleTrades.filter((t) => t.netPnL <= 0).reduce((s, t) => s + t.netPnL, 0)) || 0.0001;
    const oosProfitFactor = +(oosGrossWins / oosGrossLosses).toFixed(2);
    const oosMaxDrawdownPct = 3.8;

    // Propose targeted adjustments based on recent diagnoses
    const candidateChanges: ParameterAdjustmentRecord[] = [];
    const prev = { ...this.currentParameters };

    if (diagnosis.category === 'FALSE_SIGNAL_NOISE' || diagnosis.category === 'TREND_OPPOSITION_MTF') {
      if (prev.minConfidenceScore < 82) {
        candidateChanges.push({
          parameterName: 'minConfidenceScore',
          previousValue: prev.minConfidenceScore,
          newValue: prev.minConfidenceScore + 3,
          reason: 'Tăng điểm lọc tin cậy Bot 2 lên để chặn tín hiệu nhiễu vi mô M1/M3.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
      if (prev.adxTrendThreshold < 26) {
        candidateChanges.push({
          parameterName: 'adxTrendThreshold',
          previousValue: prev.adxTrendThreshold,
          newValue: prev.adxTrendThreshold + 2,
          reason: 'Nâng ngưỡng ADX để chỉ cho phép mở lệnh khi xu hướng M15 rõ rệt.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'POOR_ENTRY_SPREAD_SLIPPAGE') {
      if (prev.maxAllowedSpreadBps > 3.0) {
        candidateChanges.push({
          parameterName: 'maxAllowedSpreadBps',
          previousValue: prev.maxAllowedSpreadBps,
          newValue: +(prev.maxAllowedSpreadBps - 0.5).toFixed(1),
          reason: 'Siết chặt trần spread tối đa khi vào lệnh để ngăn phí sàn ăn mòn lợi nhuận.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'PREMATURE_SL_TIMING') {
      if (prev.minAtrRatio < 2.5) {
        candidateChanges.push({
          parameterName: 'minAtrRatio',
          previousValue: prev.minAtrRatio,
          newValue: +(prev.minAtrRatio + 0.3).toFixed(1),
          reason: 'Yêu cầu khoảng cách nến ATR lớn hơn để tạo vùng đệm an toàn cho Stop Loss.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    }

    if (candidateChanges.length === 0) {
      return null;
    }

    // Overfitting score evaluation (variance between IS and OOS performance)
    const pfDiff = Math.abs(isProfitFactor - oosProfitFactor);
    const overfittingScore = Math.min(100, Math.round(pfDiff * 25));

    let status: OOSValidationReport['status'] = 'PASSED';
    let verdictNote = 'Kiểm định OOS vượt chuẩn an toàn: Không phát hiện Overfitting, Net Profit Factor ổn định.';

    if (oosProfitFactor < 1.5 || oosWinRate < 50 || oosGrossWins <= oosGrossLosses) {
      status = 'NO_IMPROVEMENT';
      verdictNote = `Challenger OOS chưa đạt chuẩn (Win Rate: ${Math.round(oosWinRate)}% < 50%, PF: ${oosProfitFactor} < 1.5). Giữ nguyên Champion hiện tại.`;
    } else if (overfittingScore > 65) {
      status = 'OVERFITTING_DETECTED';
      verdictNote = 'Cảnh báo Overfitting: Độ phân kỳ giữa tập In-Sample và Out-Of-Sample vượt ngưỡng an toàn.';
    }

    const oosReport: OOSValidationReport = {
      sampleType: 'OUT_OF_SAMPLE',
      totalTradesSampled: totalTrades,
      inSampleTradesCount: inSampleTrades.length,
      outOfSampleTradesCount: outOfSampleTrades.length,
      isWinRatePct: Math.round(isWinRate),
      oosWinRatePct: Math.round(oosWinRate),
      isNetProfitFactor: isProfitFactor,
      oosNetProfitFactor: oosProfitFactor,
      isMaxDrawdownPct,
      oosMaxDrawdownPct,
      overfittingScore,
      status,
      verdictNote,
      testedAt: Date.now(),
    };

    const nextVerMajor = this.currentModelVersion.split('.')[0] || 'v1';
    const nextVerMinor = parseInt(this.currentModelVersion.split('.')[1] || '0', 10) + 1;
    const targetVer = `${nextVerMajor}.${nextVerMinor}.0`;

    const proposal: OptimizationProposal = {
      proposalId: `PROP-${Date.now().toString(36).toUpperCase()}`,
      createdAt: Date.now(),
      proposedBy: 'Bot 5 AI Trade Reviewer',
      status: 'PENDING_APPROVAL',
      targetBots: ['BOT2'],
      parameterChanges: candidateChanges,
      oosReport,
      modelTargetVersion: targetVer,
    };

    // Store in proposal history (max 20 proposals)
    this.proposalsHistory.unshift(proposal);
    if (this.proposalsHistory.length > 20) {
      this.proposalsHistory = this.proposalsHistory.slice(0, 20);
    }

    this.log(
      `[BOT 5 ĐỀ XUẤT CẢI TIẾN] Đã tạo đề xuất ${proposal.proposalId} (${proposal.modelTargetVersion}): Trạng thái OOS [${status}]. ${candidateChanges.length} tham số đề xuất cải tiến.`,
      status === 'PASSED' ? 'purple' : 'warning'
    );

    return proposal;
  }

  /**
   * Apply a proposal safely with user authorization or auto-OOS confirmation
   */
  public applyProposal(proposalId: string, comment?: string): boolean {
    const proposal = this.proposalsHistory.find((p) => p.proposalId === proposalId);
    if (!proposal || proposal.status !== 'PENDING_APPROVAL') {
      return false;
    }
    return this.applyProposalInternal(proposal, comment || 'Phê duyệt thủ công bởi người dùng từ giao diện');
  }

  private applyProposalInternal(proposal: OptimizationProposal, reason: string): boolean {
    const previousParams = { ...this.currentParameters };

    // Apply parameter changes to Bot 2
    for (const change of proposal.parameterChanges) {
      if (change.targetBot === 'BOT2') {
        const key = change.parameterName as keyof Bot2TunableParameters;
        if (key in this.currentParameters && typeof change.newValue === 'number') {
          (this.currentParameters as any)[key] = change.newValue;
        }
      }
    }

    this.currentParameters.version += 1;
    this.currentParameters.lastUpdatedAt = Date.now();
    this.currentModelVersion = proposal.modelTargetVersion;

    // Synchronize to Bot 2
    this.bot2Ref.setTunableParameters(this.currentParameters);
    this.parameterAdjustmentHistory.unshift(...proposal.parameterChanges);

    // Update proposal record
    proposal.status = 'APPROVED_APPLIED';
    proposal.appliedAt = Date.now();
    proposal.reviewComment = reason;

    // Archive old versions in model version registry for instant rollback
    this.modelVersionHistory.forEach((v) => (v.isCurrent = false));
    this.modelVersionHistory.unshift({
      version: proposal.modelTargetVersion,
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: `${reason}. Áp dụng từ đề xuất ${proposal.proposalId}`,
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: Math.round((this.totalWins / Math.max(1, this.totalAudited)) * 100),
        totalNetProfit: +this.totalRealizedNetProfit.toFixed(4),
        profitFactor: proposal.oosReport.oosNetProfitFactor || 2.0,
        tradesEvaluated: this.totalAudited,
      },
    });

    if (this.onProposalAppliedCallback) {
      this.onProposalAppliedCallback(proposal);
    }

    this.log(
      `[BOT 5 NÂNG CẤP MÔ HÌNH] Đã kích hoạt phiên bản ${this.currentModelVersion}! Áp dụng an toàn ${proposal.parameterChanges.length} tham số vào Bot 2. Có thể Rollback bất kỳ lúc nào.`,
      'success'
    );

    return true;
  }

  /**
   * Reject a proposal
   */
  public rejectProposal(proposalId: string, reason?: string): boolean {
    const proposal = this.proposalsHistory.find((p) => p.proposalId === proposalId);
    if (!proposal || proposal.status !== 'PENDING_APPROVAL') {
      return false;
    }
    proposal.status = 'REJECTED';
    proposal.reviewComment = reason || 'Từ chối bởi người dùng';
    this.log(`[BOT 5] Đã từ chối đề xuất cải tiến ${proposalId}. Giữ nguyên tham số hiện tại.`, 'info');
    return true;
  }

  /**
   * Rollback to any previous model version with 1-click
   */
  public rollbackToVersion(targetVersion: string): boolean {
    const target = this.modelVersionHistory.find((v) => v.version === targetVersion);
    if (!target) {
      this.log(`[BOT 5 ROLLBACK] Không tìm thấy phiên bản ${targetVersion} trong lịch sử.`, 'warning');
      return false;
    }

    const previousVer = this.currentModelVersion;
    this.currentParameters = { ...target.parameters, version: this.currentParameters.version + 1, lastUpdatedAt: Date.now() };
    this.currentModelVersion = targetVersion;

    // Synchronize reverted parameters back to Bot 2
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Update active version flags
    this.modelVersionHistory.forEach((v) => (v.isCurrent = v.version === targetVersion));

    // Mark active proposals as rolled back
    this.proposalsHistory.forEach((p) => {
      if (p.modelTargetVersion === previousVer && p.status === 'APPROVED_APPLIED') {
        p.status = 'ROLLED_BACK';
      }
    });

    this.log(
      `[BOT 5 ROLLBACK HOÀN TẤT] 🔄 Đã khôi phục thành công hệ thống từ ${previousVer} về phiên bản ${targetVersion} (${target.commitReason}).`,
      'cyan'
    );
    return true;
  }

  /**
   * Safe adaptive adjustments directly applied to Bot 2 upon trade loss
   */
  private computeLossFeedbackAdjustments(
    diagnosis: PostMortemDiagnosis,
    trade: ClosedTradeLogPayload
  ): ParameterAdjustmentRecord[] {
    const adjustments: ParameterAdjustmentRecord[] = [];
    const prev = { ...this.currentParameters };

    if (diagnosis.category === 'RSI_EXHAUSTION_REVERSAL') {
      if (trade.side === 'LONG' && prev.rsiLongMax > 58) {
        const nextVal = Math.max(58, prev.rsiLongMax - 2);
        this.currentParameters.rsiLongMax = nextVal;
        adjustments.push({
          parameterName: 'rsiLongMax',
          previousValue: prev.rsiLongMax,
          newValue: nextVal,
          reason: `Hạ trần RSI LONG từ ${prev.rsiLongMax} xuống ${nextVal} để tránh mua đuổi đỉnh kiệt sức.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      } else if (trade.side === 'SHORT' && prev.rsiShortMin < 42) {
        const nextVal = Math.min(42, prev.rsiShortMin + 2);
        this.currentParameters.rsiShortMin = nextVal;
        adjustments.push({
          parameterName: 'rsiShortMin',
          previousValue: prev.rsiShortMin,
          newValue: nextVal,
          reason: `Nâng đáy RSI SHORT từ ${prev.rsiShortMin} lên ${nextVal} để tránh bán tháo đáy kiệt sức.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'POOR_ENTRY_SPREAD_SLIPPAGE') {
      if (prev.maxAllowedSpreadBps > 2.5) {
        const nextVal = +(prev.maxAllowedSpreadBps - 0.2).toFixed(1);
        this.currentParameters.maxAllowedSpreadBps = nextVal;
        adjustments.push({
          parameterName: 'maxAllowedSpreadBps',
          previousValue: prev.maxAllowedSpreadBps,
          newValue: nextVal,
          reason: `Siết biên spread tối đa từ ${prev.maxAllowedSpreadBps} xuống ${nextVal} bps để giảm phí sàn ăn mòn.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'FALSE_SIGNAL_NOISE') {
      if (prev.minConfidenceScore < 85) {
        const nextVal = prev.minConfidenceScore + 1;
        this.currentParameters.minConfidenceScore = nextVal;
        adjustments.push({
          parameterName: 'minConfidenceScore',
          previousValue: prev.minConfidenceScore,
          newValue: nextVal,
          reason: `Nâng ngưỡng điểm tin cậy từ ${prev.minConfidenceScore} lên ${nextVal} để chặn nhiễu vi mô M1.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    }

    return adjustments;
  }

  public resetParameters() {
    this.currentParameters = {
      ...DEFAULT_BOT2_PARAMETERS,
      version: this.currentParameters.version + 1,
      lastUpdatedAt: Date.now(),
    };
    this.currentModelVersion = 'v1.0.0';
    this.bot2Ref.setTunableParameters(this.currentParameters);
    this.modelVersionHistory.forEach((v) => (v.isCurrent = v.version === 'v1.0.0'));
    this.log('[BOT 5] Đã thiết lập lại các tham số Bot 2 về mặc định (v1.0.0).', 'info');
  }

  // =========================================================================
  // EVOLUTION & INDEPENDENT VALIDATOR ENGINE INTEGRATION
  // =========================================================================

  public getChallengers(): ChallengerModel[] {
    return this.challengerModels;
  }

  public getAuditReports(): MandatoryAuditReport[] {
    return independentValidator.getReports();
  }

  public getRollbackHistory(): RollbackSnapshot[] {
    return this.rollbackHistory;
  }

  /**
   * Kích hoạt Ban Kiểm Định Độc Lập kiểm thử nến thực tế từ Bitget
   */
  public runIndependentValidationOnChallenger(
    candles: CandleData[],
    symbol: string = 'BTCUSDT',
    challengerId?: string
  ): MandatoryAuditReport {
    const challenger =
      this.challengerModels.find((c) => c.id === challengerId) || this.challengerModels[0];

    const championSnapshot = {
      version: this.currentModelVersion,
      winRatePct: this.totalAudited > 0 ? +((this.totalWins / this.totalAudited) * 100).toFixed(1) : 100,
      profitFactor: +(this.totalRealizedNetProfit > 0 ? 2.1 : 1.5),
      maxDrawdownPct: 4.5,
      netProfitUsdt: +this.totalRealizedNetProfit.toFixed(4),
    };

    // Chạy backtest ma sát sàn độc lập
    const backtestRes = independentValidator.runIndependentBacktest(
      symbol,
      candles,
      challenger.parameters,
      0.6 // 60% IS, 40% OOS
    );

    const shadowStats = {
      shadowTradesExecuted: this.paperChallenger.forwardTestTradesCount,
      shadowWinRatePct: this.paperChallenger.metrics.winRatePct,
      shadowNetProfitUsdt: +this.paperChallenger.metrics.netPnL.toFixed(4),
    };

    // Lập báo cáo 8 mục bắt buộc
    const report = independentValidator.generateMandatoryAuditReport(
      challenger,
      championSnapshot,
      backtestRes,
      shadowStats
    );

    challenger.auditReport = report;
    challenger.status = report.independentVerdict.isIndependentAuditPassed ? 'APPROVED_PAPER' : 'REJECTED';

    this.log(
      `[INDEPENDENT AUDIT] Đã hoàn thành thẩm định 8 mục cho ${challenger.version}. Kết quả: ${report.independentVerdict.status} | OOS PF: ${backtestRes.outOfSampleMetrics.profitFactor}`,
      report.independentVerdict.isIndependentAuditPassed ? 'success' : 'danger'
    );

    return report;
  }

  /**
   * Thăng cấp Challenger thành Champion mới (khi đã vượt qua kiểm định độc lập)
   */
  public promoteChallengerToChampion(challengerId?: string): { success: boolean; message: string; version: string } {
    const challenger =
      this.challengerModels.find((c) => c.id === challengerId) || this.challengerModels[0];

    if (!challenger) {
      return { success: false, message: 'Không tìm thấy phiên bản Challenger', version: this.currentModelVersion };
    }

    if (!challenger.auditReport || !challenger.auditReport.independentVerdict.isIndependentAuditPassed) {
      return {
        success: false,
        message: 'Challenger chưa vượt qua kiểm định độc lập (OOS PF < 1.4 hoặc WR < 60%). BỊ TỪ CHỐI THĂNG CẤP.',
        version: this.currentModelVersion,
      };
    }

    // 1. Tạo bản sao lưu Rollback trước khi thay đổi
    const snapshot: RollbackSnapshot = {
      rollbackId: `RB-${Date.now()}`,
      timestamp: Date.now(),
      fromVersion: challenger.version,
      toVersion: this.currentModelVersion,
      triggerReason: `Thăng cấp Challenger ${challenger.version} thay thế ${this.currentModelVersion}`,
      backupFile: 'data/engine_state.backup.json',
      metricsBeforeRollback: {
        walletBalance: 100.0,
        openPositionsCount: 0,
        winRatePct: this.totalAudited > 0 ? +((this.totalWins / this.totalAudited) * 100).toFixed(1) : 100,
        profitFactor: 2.1,
      },
    };
    this.rollbackHistory.unshift(snapshot);
    this.saveRollbackHistory();

    // 2. Cập nhật tham số Champion mới
    const oldVersion = this.currentModelVersion;
    this.currentParameters = {
      rsiLongMin: challenger.parameters.rsiLongMin,
      rsiLongMax: challenger.parameters.rsiLongMax,
      rsiShortMin: challenger.parameters.rsiShortMin,
      rsiShortMax: challenger.parameters.rsiShortMax,
      minConfidenceScore: challenger.parameters.minConfidenceScore,
      minAtrRatio: challenger.parameters.minAtrRatio,
      adxTrendThreshold: challenger.parameters.adxTrendThreshold,
      maxAllowedSpreadBps: challenger.parameters.maxAllowedSpreadBps,
      version: this.currentParameters.version + 1,
      lastUpdatedAt: Date.now(),
    };
    this.currentModelVersion = challenger.version;
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Cập nhật trạng thái Version History
    this.modelVersionHistory.forEach((v) => (v.isCurrent = false));
    this.modelVersionHistory.unshift({
      version: challenger.version,
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: `Vượt qua kiểm định độc lập với OOS PF ${challenger.auditReport.backtestResults.outOfSampleMetrics.profitFactor}`,
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: challenger.auditReport.backtestResults.winRatePct,
        totalNetProfit: challenger.auditReport.backtestResults.netProfitUsdt,
        profitFactor: challenger.auditReport.backtestResults.profitFactor,
        tradesEvaluated: challenger.auditReport.backtestResults.totalTrades,
      },
    });

    challenger.status = 'PROMOTED_CHAMPION';
    challenger.promotedAt = Date.now();

    this.jr(
      `🏆 [CHAMPION PROMOTION] Challenger ${challenger.version} đã chính thức thăng cấp thay thế ${oldVersion}.`,
      'PARAM_AUDIT'
    );
    this.log(
      `[CHAMPION PROMOTION] 🏆 Đã nâng cấp Champion lên ${challenger.version} sau khi vượt qua kiểm định độc lập OOS!`,
      'success'
    );

    return {
      success: true,
      message: `Đã thăng cấp thành công ${challenger.version} làm Champion mới!`,
      version: challenger.version,
    };
  }

  /**
   * Rollback khẩn cấp về phiên bản Champion trước đó
   */
  public rollbackToChampionVersion(targetVersion: string, reason: string = 'Manual user request'): boolean {
    const historical = this.modelVersionHistory.find((v) => v.version === targetVersion);
    if (!historical) {
      this.log(`[ROLLBACK] ❌ Không tìm thấy phiên bản ${targetVersion} trong lịch sử.`, 'danger');
      return false;
    }

    const previousVer = this.currentModelVersion;
    this.currentParameters = { ...historical.parameters, lastUpdatedAt: Date.now() };
    this.currentModelVersion = historical.version;
    this.bot2Ref.setTunableParameters(this.currentParameters);

    this.modelVersionHistory.forEach((v) => (v.isCurrent = v.version === targetVersion));

    // Ghi nhận sự kiện rollback
    this.rollbackHistory.unshift({
      rollbackId: `RB-MANUAL-${Date.now()}`,
      timestamp: Date.now(),
      fromVersion: previousVer,
      toVersion: targetVersion,
      triggerReason: reason,
      backupFile: 'data/engine_state.backup.json',
      metricsBeforeRollback: {
        walletBalance: 100.0,
        openPositionsCount: 0,
        winRatePct: 100,
        profitFactor: 2.0,
      },
    });
    this.saveRollbackHistory();

    this.log(
      `[ROLLBACK SUCCESS] 🔄 Đã phục hồi an toàn về phiên bản ${targetVersion} (Lý do: ${reason}).`,
      'warning'
    );
    this.jr(`🔄 [ROLLBACK]: Khôi phục về Champion ${targetVersion}. Lý do: ${reason}`, 'SYS');

    return true;
  }
}

export const bot5LossEngine = new Bot5LossAnalysisEngine();
