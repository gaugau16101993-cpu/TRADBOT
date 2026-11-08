export * from './execution';

export interface TickerData {
  symbol: string;
  lastPr: number;
  bidPr: number;
  askPr: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  updatedAt: number;
  fundingRate?: number;
  spread?: number;
  spreadPercent?: number;
  bidSz?: number;
  askSz?: number;
  usdtVolume24h?: number;
}

export type TradeSide = 'LONG' | 'SHORT';

export interface Position {
  id: string;
  botId: number;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  margin: number;
  leverage: number;
  openFee: number;
  openTime: number;
  status: 'OPEN' | 'CLOSING';
  grossPnL: number;
  currentCosts: number;
  netPnL: number;
  roe: number;
  peakNetPnL: number;
  mtfScore?: number;
  stopLoss?: number;
  takeProfit?: number;
  signalId?: string;
  riskRewardRatio?: number;
}

export interface ClosedTrade {
  id: string;
  time: number;
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  margin: number;
  leverage: number;
  amount: number;
  grossPnL: number;
  costs: number;
  netPnL: number;
  roe: number;
  durationSeconds: number;
  reason: 'TAKE_PROFIT' | 'NET_PNL_POSITIVE_TRIGGER' | 'MANUAL_CLOSE' | 'STOP_LOSS' | 'TRAILING_TP';
  botId: number;
  stopLoss?: number;
  takeProfit?: number;
  openFee?: number;
  exitFee?: number;
  slippageBps?: number;
  strategy?: string;
  signalId?: string;
}

export interface EngineSettings {
  startingBalance: number;
  marginPerTrade: number;
  maxLeverage: number;
  maxPositions: number;
  makerFee: number;
  takerFee: number;
  slippagePct: number;
  netPnLThreshold: number; // e.g. 0.0001 (auto close as soon as net PnL is > threshold)
  stopLossPct: number; // e.g. -5% of margin
  cycleIntervalSeconds: number;
  soundEnabled: boolean;
  autoTradingEnabled: boolean; // Autonomous order entry when Bot 3 approves signal
  autoCloseEnabled: boolean; // Autonomous exit on Net TP / Take Profit price / Trailing Stop
  bot5AutoApproveOOS?: boolean; // Automatically apply proposal only when OOS validation passes
  bot5MinSampleSize?: number; // Minimum closed trades before OOS parameter tuning (default 5)
  bypassCapitalProtection?: boolean; // When true: Unrestricted Opportunity Finder (No conservative capital protection blocking signals/orders)

  // Central Safety Limits (Directive Section A)
  maxTotalMargin?: number; // 6.0 USDT
  dailyLossLimit?: number; // 2.0 USDT
  maxDrawdownLimit?: number; // 5.0 USDT
  liveTradingEnabled?: boolean; // Locked to false

  // 24/7 Cloud Background & Telegram Alerts Settings
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramNotifyOnOpen?: boolean;
  telegramNotifyOnClose?: boolean;
  telegramNotifyOnError?: boolean;
  telegramNotifyHeartbeat?: boolean;
  telegramHeartbeatIntervalMinutes?: number;
}

export interface BackgroundWorkerHealth {
  status: 'RUNNING' | 'STOPPED';
  uptimeSeconds: number;
  uptimeFormatted: string;
  serverStartTime: number;
  lastCycleTimestamp: number;
  lastCycleLatencyMs: number;
  totalCyclesCompleted: number;
  isWorkerAlive: boolean;
  consecutiveErrors: number;
  autoRestartCount: number;
  websocketStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  dbStatus: 'PERSISTED' | 'SAVING' | 'ERROR';
  lastDbSaveTimestamp: number;
  telegramStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  lastTelegramSentTimestamp?: number;
  memoryUsageMb: number;
  activePositionsCount: number;
  walletBalance: number;
  platform: string;
}

export type BotFilter = 'ALL' | 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4' | 'BOT5' | 'SYS';

export interface LogMessage {
  id: string;
  time: string;
  source: BotFilter;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple';
}

export interface CandleData {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVolume: number;
  quoteVolume: number;
  isComplete: boolean;
  time?: number;
  volume?: number;
}

export interface QualifiedCandidate {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
  spreadPercent: number;
  spreadBps: number;
  volume24hUsdt: number;
  fundingRate: number;
  volatility24h: number;
  change24h: number;
  scalpScore: number;
  lastUpdateTime: number;
  candles1m?: CandleData[];
  orderFlowImbalance?: number;
  liquidityPoolScore?: number;
  smcStructure?: 'BULLISH_MSS' | 'BEARISH_MSS' | 'NEUTRAL';
  fvgGapBps?: number;
}

export interface ScannerMetrics {
  scanLatencyMs: number;
  dataFreshnessMs: number;
  apiErrors: number;
  lastApiErrorTime?: number;
  lastApiErrorMessage?: string;
  wsStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  wsUptimeMs: number;
  wsMessagesCount: number;
  coinsScanned: number;
  coinsPassed: number;
  coinsRejected: number;
  rejectionBreakdown: {
    LOW_VOLUME: number;
    WIDE_SPREAD: number;
    LOW_VOLATILITY: number;
    STALE_DATA: number;
    NON_NORMAL_STATUS: number;
    INVALID_DEPTH: number;
  };
  topCandidates: QualifiedCandidate[];
  lastCompletedScanTime: number;
}

// Bot 2 Advanced Market Analyst Types
export type MarketRegime =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'ABNORMAL_MARKET';

export type AnalysisBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface IndicatorValues {
  ema9: number;
  ema21: number;
  ema50: number;
  ema200?: number;
  rsi14: number;
  adx14: number;
  plusDI: number;
  minusDI: number;
  atr14: number;
  atrPercent: number;
  volumeSma20: number;
  rvol: number;
}

export interface SMCSignals {
  liquiditySweep: {
    detected: boolean;
    side?: 'BULLISH' | 'BEARISH';
    level?: number;
    timestamp?: number;
  };
  bos: {
    detected: boolean;
    side?: 'BULLISH' | 'BEARISH';
    level?: number;
  };
  choch: {
    detected: boolean;
    side?: 'BULLISH' | 'BEARISH';
    level?: number;
  };
  orderBlock: {
    detected: boolean;
    side?: 'BULLISH' | 'BEARISH';
    low?: number;
    high?: number;
  };
  fvg: {
    detected: boolean;
    side?: 'BULLISH' | 'BEARISH';
    top?: number;
    bottom?: number;
  };
  swingHigh?: number;
  swingLow?: number;
}

export interface TimeframeAnalysis {
  timeframe: '1m' | '5m' | '15m' | '1H' | '4H';
  candleCount: number;
  indicators: IndicatorValues;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  regime: MarketRegime;
  smc: SMCSignals;
  isProvisional: boolean;
  lastClose: number;
  lastTs: number;
}

export interface CostEstimates {
  spreadBps: number;
  roundTripTakerFeeBps: number;
  estSlippageBps: number;
  totalCostBps: number;
  fundingRate8h: number;
  breakEvenMoveDollars: number;
  breakEvenMovePercent: number;
}

export interface MarketAnalysisResult {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  overallRegime: MarketRegime;
  bias: AnalysisBias;
  confidenceScore: number; // 0 - 100, strictly calibrated
  macroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // 4H & 1H
  intermediateTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // 15m
  microTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // 5m & 1m
  conflict: {
    detected: boolean;
    description?: string;
  };
  timeframes: Partial<Record<'1m' | '5m' | '15m' | '1H' | '4H', TimeframeAnalysis>>;
  costs: CostEstimates;
  reasons: string[];
  isProvisional: boolean;
  analysisLatencyMs: number;
}

export type SignalStatus = 'NEW' | 'CONFIRMED' | 'INVALIDATED' | 'EXPIRED' | 'CONSUMED';

export type SignalStrategy =
  | 'TREND_PULLBACK_MOMENTUM'
  | 'SMC_SWEEP_REVERSAL'
  | 'REGIME_BREAKOUT_RVOL'
  | 'RANGE_FADE_MEAN_REVERSION'
  | 'FAST_SCALP_MOMENTUM'
  | 'MICRO_ORDERFLOW_EXPANSION';

export type SignalAction = 'LONG' | 'SHORT' | 'NO_TRADE';

export interface SignalAuditEvent {
  timestamp: number;
  fromStatus: SignalStatus;
  toStatus: SignalStatus;
  reason: string;
  marketPriceAtEvent: number;
}

export interface TradeSignal {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strategy: SignalStrategy;
  version: string;
  createdAt: number;
  expiresAt: number;
  status: SignalStatus;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
  grossRewardBps: number;
  grossRiskBps: number;
  totalFrictionBps: number;
  expectedNetEdgeBps: number;
  confidenceScore: number;
  fillProbability: number;
  rankScore: number;
  frictionBreakdown: {
    roundTripTakerFeeBps: number;
    spreadBps: number;
    estSlippageBps: number;
    estFundingCostBps: number;
    totalFrictionBps: number;
  };
  triggerTimeframe: '1m' | '5m' | '15m';
  confirmationReason: string;
  isRepainted: false; // Anti-repainting contract: confirmed signals cannot be modified without audit
  auditTrail: SignalAuditEvent[];
  [key: string]: any;
}

export interface SignalEvaluationResult {
  symbol: string;
  action: SignalAction;
  signal?: TradeSignal;
  rejectionReason?: string;
  timestamp: number;
  filtersEvaluated: {
    staleDataPassed: boolean;
    spreadCheckPassed: boolean;
    entryDistancePassed: boolean;
    regimeSuitabilityPassed: boolean;
    mtfConflictPassed: boolean;
    unclosedCandlePassed: boolean;
    rrRatioPassed: boolean;
    netEdgePassed: boolean;
    timeFilterPassed?: boolean;
    volatilityThresholdPassed?: boolean;
  };
  metrics: {
    spreadBps: number;
    expectedNetEdgeBps: number;
    riskRewardRatio: number;
    confidenceScore: number;
    dataAgeSeconds: number;
    utcHour?: number;
    isNightWindow?: boolean;
    atrPercent?: number;
    requiredAtrPercent?: number;
  };
}

export interface BacktestTrade {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT';
  grossPnLPct: number;
  frictionPct: number;
  netPnLPct: number;
  durationBars: number;
}

export interface BacktestReport {
  symbol: string;
  sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE' | 'COMBINED';
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number; // percentage (0-100)
  profitFactor: number;
  netExpectancyBps: number; // average net basis points per trade
  totalNetReturnPct: number;
  maxDrawdownPct: number;
  avgWinPct: number;
  avgLossPct: number;
  totalFeesBps: number;
  timeframe: string;
  periodBars: number;
}

export interface BotState {
  bot1: {
    status: string;
    scannedCount: number;
    lastScanTime: number;
    topCandidate: string;
    metrics?: ScannerMetrics;
  };
  bot2: {
    status: string;
    analyzedCoin: string;
    mtfScore: number;
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    analysis?: MarketAnalysisResult;
  };
  bot3: {
    status: string;
    signalActive: boolean;
    lastSignal: string;
    confidence: number;
    activeSignals?: TradeSignal[];
    recentSignalsHistory?: TradeSignal[];
    lastEvaluations?: SignalEvaluationResult[];
    performance?: {
      signalsGeneratedToday: number;
      signalsConfirmedToday: number;
      signalsRejectedToday: number;
      avgExpectedNetEdgeBps: number;
      avgRiskRewardRatio: number;
    };
  };
  bot4: {
    status: string;
    rule: string;
    executedToday: number;
    winRate: number;
    equity?: number;
    allocatedMargin?: number;
    realizedNetPnL?: number;
    feesPaid?: number;
    killSwitchActive?: boolean;
    metrics?: any;
  };
  bot5: {
    status: string;
    totalEvaluated: number;
    netProfit: number;
    feeDrag: number;
    modelVersion?: string;
    pendingProposalsCount?: number;
    oosStatus?: string;
    metrics?: any;
  };
}
