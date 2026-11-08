/**
 * TRADINGAGENTS MULTI-AGENT ARCHITECTURE — TYPES & CONTRACTS
 * Implements the multi-tiered collaborative financial trading agents from
 * Tauric Research / TradingAgents (Analyst Team, Bull vs Bear Debate, Research Manager, Trader Agent).
 */

export type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H';

// ============================================================================
// 1. ANALYST TEAM ROLES (6 Specialized AI Roles)
// ============================================================================

export interface TechnicalAnalystReport {
  role: 'TECHNICAL_ANALYST';
  ema9: number;
  ema21: number;
  ema50: number;
  ema200?: number;
  emaCross: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ALIGNED_BULL' | 'ALIGNED_BEAR' | 'NEUTRAL';
  rsi14: number;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    trend: 'BULLISH_EXPANSION' | 'BEARISH_EXPANSION' | 'CONVERGING';
  };
  adx14: number;
  isTrending: boolean;
  atr14: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0 - 100
  keyInsights: string[];
}

export interface OrderBlockData {
  type: 'BULLISH_OB' | 'BEARISH_OB';
  high: number;
  low: number;
  mitigated: boolean;
  strength: number; // 0 - 100
  timeframe: Timeframe;
}

export interface FairValueGapData {
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  top: number;
  bottom: number;
  midpoint: number;
  sizePercent: number;
  filled: boolean;
  timeframe: Timeframe;
}

export interface MarketStructureReport {
  role: 'MARKET_STRUCTURE_ANALYST';
  bos: {
    detected: boolean;
    type?: 'BULLISH_BOS' | 'BEARISH_BOS';
    level?: number;
  };
  choch: {
    detected: boolean;
    type?: 'BULLISH_CHOCH' | 'BEARISH_CHOCH';
    level?: number;
  };
  liquiditySweep: {
    detected: boolean;
    side?: 'BUY_SIDE' | 'SELL_SIDE';
    level?: number;
    rejected: boolean;
  };
  orderBlocks: OrderBlockData[];
  primaryOrderBlock?: OrderBlockData;
  fairValueGaps: FairValueGapData[];
  primaryFVG?: FairValueGapData;
  volumeImbalance: {
    detected: boolean;
    level?: number;
  };
  swingHigh: number;
  swingLow: number;
  structureBias: 'BULLISH' | 'BEARISH' | 'RANGING';
  confidence: number;
  keyInsights: string[];
}

export interface VolumeAnalystReport {
  role: 'VOLUME_ANALYST';
  rvol: number; // Relative Volume vs 20-period SMA
  isHighVolume: boolean;
  buyingVolumePercent: number; // Estimated based on delta/wick analysis
  sellingVolumePercent: number;
  volumeTrend: 'ACCUMULATION' | 'DISTRIBUTION' | 'EXHAUSTION' | 'FLAT';
  volumeConfirmation: boolean;
  confidence: number;
  keyInsights: string[];
}

export interface MomentumAnalystReport {
  role: 'MOMENTUM_ANALYST';
  rsiSlope: number; // Delta over last 3 candles
  macdVelocity: number; // Histogram delta over last 3 candles
  roc10: number; // Rate of Change (10-period)
  momentumState: 'STRONG_BULL' | 'STRONG_BEAR' | 'BULL_DIV' | 'BEAR_DIV' | 'NEUTRAL';
  divergenceDetected: boolean;
  divergenceType?: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE';
  confidence: number;
  keyInsights: string[];
}

export interface VolatilityAnalystReport {
  role: 'VOLATILITY_ANALYST';
  atrPercent: number; // ATR / Price
  atrPercentile20: number; // Normalized percentile
  bollingerBandwidth: number;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_RELEASE' | 'EXPANSION';
  volatilityRegime: 'EXPANSION' | 'COMPRESSION' | 'NORMAL';
  isSafeToExecute: boolean; // False if wild abnormal spikes
  confidence: number;
  keyInsights: string[];
}

export interface SentimentAnalystReport {
  role: 'SENTIMENT_ANALYST';
  fundingRate8h: number; // Bitget USDT-M funding rate
  fundingBias: 'EXTREME_LONG_CROWDED' | 'EXTREME_SHORT_CROWDED' | 'NORMAL';
  change24h: number;
  sentimentScore: number; // 0 (Extreme Fear / Short) to 100 (Extreme Greed / Long)
  crowdTrapRisk: 'HIGH_LONG_TRAP_RISK' | 'HIGH_SHORT_TRAP_RISK' | 'LOW';
  confidence: number;
  keyInsights: string[];
}

export interface MultiAgentAnalystSynthesis {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  timeframesEvaluated: Timeframe[];
  macroBiasH1: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  macroConfirmationH4: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  setupStructureM15: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  executionTimingM5: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isMultiTimeframeAligned: boolean;
  specialists: {
    technical: TechnicalAnalystReport;
    marketStructure: MarketStructureReport;
    volume: VolumeAnalystReport;
    momentum: MomentumAnalystReport;
    volatility: VolatilityAnalystReport;
    sentiment: SentimentAnalystReport;
  };
  overallAnalystScore: number; // -100 (Extremely Bearish) to +100 (Extremely Bullish)
  dataIntegrityPassed: boolean;
  rejectionReason?: string;
}

// ============================================================================
// 2. RESEARCH TEAM (BULL VS BEAR DEBATE & RESEARCH MANAGER)
// ============================================================================

export interface BullAgentArgument {
  role: 'BULL_AGENT';
  thesis: string;
  structuralPoints: string[];
  indicatorPoints: string[];
  volumePoints: string[];
  upsideLiquidityTarget: number;
  invalidationLevel: number;
  convictionScore: number; // 0 - 100
  proposedRiskReward: number;
}

export interface BearAgentArgument {
  role: 'BEAR_AGENT';
  thesis: string;
  structuralPoints: string[];
  indicatorPoints: string[];
  riskAndTrapPoints: string[];
  downsideLiquidityTarget: number;
  invalidationLevel: number;
  convictionScore: number; // 0 - 100
  proposedRiskReward: number;
}

export interface ResearchManagerAudit {
  role: 'RESEARCH_MANAGER';
  factCheckPassed: boolean;
  hallucinationPenalties: string[];
  conflictsIdentified: string[];
  bullScoreAdjusted: number;
  bearScoreAdjusted: number;
  consensusMargin: number; // bullScoreAdjusted - bearScoreAdjusted
  debateVerdict: 'BULL_CONVICTION' | 'BEAR_CONVICTION' | 'DEADLOCK_NO_TRADE' | 'UNRELIABLE_DATA';
  summaryRationale: string;
}

export interface TraderAgentDecision {
  role: 'TRADER_AGENT';
  finalAction: 'LONG' | 'SHORT' | 'NO_TRADE';
  finalConvictionScore: number; // 0 - 100
  executionStrategy: string;
  recommendedEntry: number;
  recommendedSL: number;
  recommendedTP: number;
  riskRewardRatio: number;
  expectedNetEdgeBps: number;
  tradingThesis: string;
}

export interface TradingAgentsDebateSession {
  sessionId: string;
  symbol: string;
  timestamp: number;
  analystsSynthesis: MultiAgentAnalystSynthesis;
  bullArgument: BullAgentArgument;
  bearArgument: BearAgentArgument;
  researchManagerAudit: ResearchManagerAudit;
  traderDecision: TraderAgentDecision;
  executionOutcome?: 'DISPATCHED_TO_BOT4' | 'SUPPRESSED_AS_NO_TRADE';
}
