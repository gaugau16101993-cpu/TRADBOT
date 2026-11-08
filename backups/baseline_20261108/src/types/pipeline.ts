import {
  TickerData,
  QualifiedCandidate,
  MarketRegime,
  AnalysisBias,
  TimeframeAnalysis,
  TradeSignal,
  SignalAction,
  Position,
  ClosedTrade,
} from './engine';
import { PaperOrder, ManagedPosition } from './execution';

/**
 * TUNABLE PARAMETERS FOR BOT 2 (Dynamically adapted by Bot 5 feedback)
 */
export interface Bot2TunableParameters {
  rsiLongMax: number; // e.g. 68 (lowered if entering too late into exhaustion)
  rsiLongMin: number; // e.g. 48
  rsiShortMin: number; // e.g. 32 (raised if entering into oversold exhaustion)
  rsiShortMax: number; // e.g. 52
  minConfidenceScore: number; // e.g. 70 (raised if choppy market causes losses)
  minAtrRatio: number; // e.g. 1.8 (raised if small candle range relative to fees)
  adxTrendThreshold: number; // e.g. 22 (raised if weak trend whipsaws)
  maxAllowedSpreadBps: number; // e.g. 5.0 (tightened if slippage/spread caused losses)
  version: number;
  lastUpdatedAt: number;
}

/**
 * 1. BOT 1 (bot1_scanMarket) PAYLOAD
 * Scans Bitget USDT-M Futures -> packages real-time price & volume data
 */
export interface Bot1ScanPayload {
  stage: 'BOT1_SCAN_MARKET';
  timestamp: number;
  universeTotal: number;
  passedCount: number;
  rejectedCount: number;
  scanLatencyMs: number;
  dataFreshnessMs: number;
  topCandidates: QualifiedCandidate[];
  selectedCandidate: QualifiedCandidate;
  marketSummary: {
    btcPrice: number;
    btc24hChange: number;
    totalMarket24hVolUsdt: number;
    averageSpreadBps: number;
  };
}

/**
 * 2. BOT 2 (bot2_analyzeTechnicals) PAYLOAD
 * Receives Bot 1 payload -> computes MTF indicators (EMA, RSI, ATR, Trend, SMC)
 */
export interface Bot2TechnicalsPayload {
  stage: 'BOT2_ANALYZE_TECHNICALS';
  timestamp: number;
  symbol: string;
  currentPrice: number;
  overallRegime: MarketRegime;
  bias: AnalysisBias;
  confidenceScore: number; // 0 - 100
  macroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // H4/H1
  intermediateTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // M15
  microTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // M5/M1
  timeframes: {
    '1m'?: TimeframeAnalysis;
    '5m'?: TimeframeAnalysis;
    '15m'?: TimeframeAnalysis;
    '1H'?: TimeframeAnalysis;
    '4H'?: TimeframeAnalysis;
  };
  conflict: {
    detected: boolean;
    description?: string;
  };
  reasons: string[];
  activeParameters: Bot2TunableParameters;
  analysisLatencyMs: number;
  tradingAgentsAnalysts?: any;
}

/**
 * 3. BOT 3 (bot3_evaluateSignalAndNetTP) PAYLOAD
 * Receives Bot 2 payload -> evaluates signal score, deducts 0.06% Taker fee x2,
 * slippage, and funding to calculate strictly positive Net Take-Profit
 */
export interface Bot3SignalNetTPPayload {
  stage: 'BOT3_EVALUATE_SIGNAL_AND_NET_TP';
  timestamp: number;
  symbol: string;
  action: SignalAction; // 'LONG' | 'SHORT' | 'NO_TRADE'
  rejectionReason?: string;
  signal?: TradeSignal;
  tradingAgentsDebate?: any;
  feeDeductions: {
    takerFeeRatePerLeg: number; // 0.0006 (0.06% per leg)
    roundTripTakerFeeBps: number; // 12.0 bps (0.12%)
    estSlippageBps: number; // 3.0 to 5.0 bps
    estFundingCostBps: number; // funding rate converted to bps
    spreadBps: number;
    totalFrictionBps: number; // sum of all frictions
    breakEvenMoveDollars: number;
    breakEvenMovePercent: number;
    expectedNetEdgeBps: number;
    netTakeProfitPrice: number; // Exit price where net profit is guaranteed positive after all costs
    netStopLossPrice: number;
    riskRewardRatio: number;
  };
  gatesPassed: {
    staleData: boolean;
    spreadCheck: boolean;
    entryDistance: boolean;
    regimeSuitability: boolean;
    mtfConflict: boolean;
    unclosedCandle: boolean;
    rrRatio: boolean;
    netEdge: boolean;
  };
}

/**
 * 4. BOT 4 (bot4_executeOrders) PAYLOAD & CLOSED TRADE LOG
 * Receives Bot 3 signal -> safety check & execution with strictly 2 USDT margin ->
 * monitors net PnL in real-time -> auto-closes -> sends closed trade log to Bot 5
 */
export interface Bot4ExecutionPayload {
  stage: 'BOT4_EXECUTE_ORDERS';
  timestamp: number;
  actionType: 'ORDER_OPENED' | 'ORDER_BLOCKED' | 'POSITION_EVALUATED' | 'POSITION_CLOSED';
  symbol: string;
  orderId?: string;
  positionId?: string;
  marginUsdt: number; // Strictly 2.0 USDT
  leverage: number; // Configured leverage (e.g. 5x or 10x)
  notionalUsdt: number; // margin * leverage
  openFeeUsdt: number; // 0.06% taker fee
  rejectReason?: string;
  openPosition?: ManagedPosition;
  closedTradeLog?: ClosedTradeLogPayload;
}

export interface ClosedTradeLogPayload {
  tradeId: string;
  signalId?: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategy?: string;
  triggerTimeframe?: '1m' | '3m' | '5m' | '15m';
  entryPrice: number;
  exitPrice: number;
  marginUsdt: number; // 2.0 USDT
  leverage: number;
  notionalUsdt: number;
  entryTime: number;
  exitTime: number;
  durationSeconds: number;
  grossPnL: number;
  openFee: number; // 0.06%
  exitFee: number; // 0.06%
  accruedFunding: number;
  totalCosts: number;
  netPnL: number; // Realized Net PnL after all costs
  roePct: number;
  closeReason: 'TAKE_PROFIT' | 'NET_PNL_POSITIVE_TRIGGER' | 'STOP_LOSS' | 'MANUAL_CLOSE' | 'TRAILING_TP';
  mfe?: number; // Maximum Favorable Excursion (highest floating profit ratio)
  mae?: number; // Maximum Adverse Excursion (deepest drawdown ratio)
  entryIndicators?: {
    rsi5m: number;
    atr1m: number;
    spreadBps: number;
    confidenceScore: number;
  };
}

/**
 * 5. BOT 5 (bot5_runLossAnalysis) PAYLOAD & AI SELF-LEARNING ENGINE
 * Analyzes win/loss trades, classifies root causes across 1m/3m/5m/15m,
 * tests parameters on Out-of-Sample (OOS) data, manages proposal approval & model rollback
 */
export type LossRootCauseCategory =
  | 'FALSE_SIGNAL_NOISE'           // Sai tín hiệu do nhiễu micro (1m/3m false breakout)
  | 'POOR_ENTRY_SPREAD_SLIPPAGE'   // Điểm vào xấu, trượt giá hoặc spread giãn rộng
  | 'TREND_OPPOSITION_MTF'         // Ngược xu hướng chủ đạo khung lớn (5m/15m)
  | 'EXCESS_LEVERAGE_DRAG'         // Đòn bẩy không phù hợp với biến động thị trường
  | 'PREMATURE_SL_TIMING'          // Đặt SL quá hẹp bị quét râu nến (ATR expansion)
  | 'TP_NOT_REACHED_REVERSAL'      // Đảo chiều trước khi kịp chạm mục tiêu chốt lời
  | 'VOLATILITY_MARKET_SHOCK'      // Biến động giật giũ bất thường của thị trường
  | 'FUNDING_FEE_EROSION'          // Chi phí funding và phí Taker bào mòn biên lãi
  | 'LOW_NET_MARGIN_FRICTION_RISK' // Lãi gộp danh nghĩa nhưng biên lãi ròng quá mỏng (<0.005 USDT), rủi ro cao
  | 'HEALTHY_WIN_EFFICIENCY'       // Lệnh thắng chuẩn xác, đạt biên lãi ròng mục tiêu
  | 'TIME_FILTER_BLACKOUT'         // Vào lệnh trong khung giờ rủi ro 01:00-04:00 UTC
  | 'NIGHT_VOLATILITY_DEFICIT'     // Khung giờ đêm 22:00-06:00 UTC thiếu biến động ATR
  // MEO AI v2.2 Diagnostics & Aliases
  | 'SL_BI_QUET_NGAY'              // SL bị quét ngay trong vòng 5 phút (Micro whipsaw)
  | 'DAO_CHIEU_SAU_KHI_LAI'        // Đảo chiều sau khi đã có lãi lớn (MFE >= 0.8 nhưng không trailing)
  | 'KHONG_DU_DONG_LUC'            // Hết giờ/chôn vốn, không đủ động lực bứt phá
  | 'SAI_HUONG'                    // Đánh ngược xu hướng kỹ thuật
  | 'SLIPPAGE_SPREAD_DRAG'
  | 'RSI_EXHAUSTION_REVERSAL'
  | 'ATR_EXPANSION_WHIPSAW'
  | 'TREND_BREAK_EARLY'
  | 'FUNDING_DRAG'
  | 'HEALTHY_WIN';

export interface MultiTimeframeAudit {
  m1: { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; rsi: number; noiseDetected: boolean };
  m3: { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; rsi: number; alignment: boolean };
  m5: { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; rsi: number; rvol: number };
  m15: { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; adx: number; regime: string };
  conflictDetected: boolean;
  conflictDescription?: string;
}

export interface PostMortemDiagnosis {
  isLoss: boolean;
  category: LossRootCauseCategory;
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rootCauseDescription: string;
  detailedAudit: string;
  feeImpactRatio: number; // totalCosts / grossLoss
  adversePriceExcursionPct: number;
  timeframeAudit?: MultiTimeframeAudit;
  strategyName: string;
  coinSymbol: string;
}

export interface ParameterAdjustmentRecord {
  parameterName: keyof Bot2TunableParameters | string;
  previousValue: number;
  newValue: number;
  reason: string;
  timestamp: number;
  targetBot: 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4';
}

export interface OOSValidationReport {
  sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE' | 'COMBINED';
  totalTradesSampled: number;
  inSampleTradesCount: number;
  outOfSampleTradesCount: number;
  isWinRatePct: number;
  oosWinRatePct: number;
  isNetProfitFactor: number;
  oosNetProfitFactor: number;
  isMaxDrawdownPct: number;
  oosMaxDrawdownPct: number;
  overfittingScore: number; // 0-100 (lower is better, <30 means very stable OOS)
  status: 'PASSED' | 'OVERFITTING_DETECTED' | 'INSUFFICIENT_DATA' | 'NO_IMPROVEMENT';
  verdictNote: string;
  testedAt: number;
}

export interface OptimizationProposal {
  proposalId: string;
  createdAt: number;
  proposedBy: string;
  status: 'PENDING_APPROVAL' | 'APPROVED_APPLIED' | 'REJECTED' | 'ROLLED_BACK';
  targetBots: ('BOT1' | 'BOT2' | 'BOT3' | 'BOT4')[];
  parameterChanges: ParameterAdjustmentRecord[];
  oosReport: OOSValidationReport;
  modelTargetVersion: string;
  appliedAt?: number;
  reviewComment?: string;
}

export interface ModelParameterVersion {
  version: string;
  createdAt: number;
  parameters: Bot2TunableParameters;
  bot3Settings?: {
    minExpectedNetEdgeBps: number;
    minRiskRewardRatio: number;
  };
  bot1Settings?: {
    maxSpreadPercent: number;
    minVolatility24h: number;
  };
  commitReason: string;
  isCurrent: boolean;
  performanceSnapshot: {
    winRatePct: number;
    totalNetProfit: number;
    profitFactor: number;
    tradesEvaluated: number;
  };
}

export interface SymbolPerformanceStat {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalNetPnL: number;
  totalFeesPaid: number;
  avgDurationSec: number;
}

export interface StrategyPerformanceStat {
  strategy: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalNetPnL: number;
  profitFactor: number;
}

export interface Bot5LossAnalysisPayload {
  stage: 'BOT5_RUN_LOSS_ANALYSIS';
  timestamp: number;
  tradeId: string;
  symbol: string;
  postMortem: PostMortemDiagnosis;
  feedbackToBot2: {
    applied: boolean;
    adjustments: ParameterAdjustmentRecord[];
    newParameters: Bot2TunableParameters;
  };
  activeProposal?: OptimizationProposal;
  currentModelVersion: string;
  metrics: {
    totalTradesAudited: number;
    totalWins: number;
    totalLosses: number;
    winRatePct: number;
    profitFactor: number | null;
    expectancy: number; // Lợi nhuận trung bình mỗi lệnh (USDT)
    blockedSymbols: string[]; // Danh sách coin bị chặn do winrate < 30% và lỗ âm
    totalRealizedNetProfit: number;
    totalFeeFrictionAbsorbed: number;
    consecutiveLossCount?: number;
    nextAiConsultCountdownSeconds?: number;
    breakdownByCategory: Record<LossRootCauseCategory, number>;
    breakdownBySymbol: Record<string, SymbolPerformanceStat>;
    breakdownByStrategy: Record<string, StrategyPerformanceStat>;
    journal: KnowledgeJournalEntry[];
    latestAiAdvice?: ExternalAiConsultResult;
  };
}

export interface KnowledgeJournalEntry {
  id: string;
  timestamp: number;
  isoTime: string;
  msg: string;
  source: 'EXTERNAL_AI' | 'SELF_LEARN' | 'CHALLENGER' | 'PARAM_AUDIT' | 'SYS';
}

export interface ExternalAiConsultResult {
  timestamp: number;
  isoTime: string;
  prompt: string;
  advice: string;
  model: string;
  groundingSearchQueries?: string[];
  marketRegime: string;
  stats: {
    winRatePct: number;
    profitFactor: number | null;
    expectancy: number;
    totalTrades: number;
  };
}

export interface RegimeAtrMultiplier {
  slAtr: number;
  tpAtr: number;
}

/**
 * Complete snapshot of the 5-bot data transfer pipeline at any given moment
 */
export interface CompletePipelineSnapshot {
  cycleNumber: number;
  lastHandoffTime: number;
  bot1Payload?: Bot1ScanPayload;
  bot2Payload?: Bot2TechnicalsPayload;
  bot3Payload?: Bot3SignalNetTPPayload;
  bot4Payload?: Bot4ExecutionPayload;
  bot5Payload?: Bot5LossAnalysisPayload;
  pipelineHealth: 'HEALTHY' | 'WARNING' | 'ERROR';
  feedbackLoopActive: boolean;
}

/**
 * NO_TRADE LEARNING DATASET RECORD
 * Preserves rejected market setups for autonomous model calibration and filter learning
 */
export interface NoTradeLearningRecord {
  id: string;
  timestamp: number;
  symbol: string;
  primaryReason: string;
  detailedAudit: string;
  currentPrice: number;
  spreadBps: number;
  expectedNetEdgeBps: number;
  minNetEdgeRequiredBps: number;
  riskRewardRatio: number;
  minRRRequired: number;
  confidenceScore: number;
  rsi5m: number;
  adx15m: number;
  marketRegime: string;
  bias: string;
  avoidedFrictionEstimateUsdt: number;
}

/**
 * PAPER CHALLENGER STATE & CHAMPION VS CHALLENGER COMPARISON
 * Concurrently evaluates candidate parameter sets on real Bitget market ticks
 */
export interface PaperChallengerState {
  challengerId: string;
  version: string;
  status: 'RESEARCHING' | 'FORWARD_TESTING' | 'PROMOTION_READY' | 'REJECTED' | 'PROMOTED';
  proposedParameters: Bot2TunableParameters;
  targetNetEdgeBps: number;
  targetRR: number;
  forwardTestTradesCount: number;
  requiredSampleSize: number; // 10
  virtualPositions: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    entryTime: number;
    expectedNetEdgeBps: number;
    stopLoss: number;
    takeProfit: number;
  }[];
  forwardTestHistory: {
    tradeId: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    grossPnL: number;
    netPnL: number;
    fees: number;
    closeReason: string;
    durationSeconds: number;
    timestamp: number;
  }[];
  metrics: {
    winRatePct: number;
    profitFactor: number;
    netPnL: number;
    totalGrossWins: number;
    totalGrossLosses: number;
    maxDrawdownPct: number;
  };
  comparisonWithChampion: {
    championWinRatePct: number;
    championNetPnL: number;
    winRateDelta: number;
    netPnLDelta: number;
    isBeatingChampion: boolean;
  };
  startedAt: number;
  lastEvaluatedAt: number;
  lastAiAdviceAppliedAt?: number;
  aiAdaptationNotes?: string;
}

