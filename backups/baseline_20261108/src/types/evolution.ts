/**
 * BITGET FAST AUTO-TRADING ENGINE — EVOLUTION & INDEPENDENT VALIDATOR TYPES
 * Defines quantitative gates, backtesting models, Champion/Challenger contracts,
 * and the 8-point mandatory audit report.
 */

export interface ValidationCriteria {
  minProfitFactor: number;       // e.g. 1.40
  minWinRatePct: number;          // e.g. 60.0%
  maxDrawdownPct: number;         // e.g. 10.0%
  minSampleSize: number;          // e.g. 20 trades
  maxOverfittingRatio: number;    // In-Sample PF / Out-of-Sample PF <= 1.35
  minAverageTradeNetUsdt: number; // e.g. 0.05 USDT after all Bitget fees
}

export interface BacktestSimulationTrade {
  tradeId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  marginUsdt: number;
  leverage: number;
  grossPnL: number;
  openFee: number;
  exitFee: number;
  fundingCost: number;
  slippageCost: number;
  netPnL: number;
  roePct: number;
  durationMinutes: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'NET_ZERO_EXIT' | 'TIMEOUT';
  windowType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE';
  timestamp: number;
}

export interface SplitMetrics {
  tradesCount: number;
  winRatePct: number;
  profitFactor: number;
  netProfitUsdt: number;
  maxDrawdownPct: number;
  expectancyUsdt: number;
  avgDurationMin: number;
}

export interface BacktestSimulationResult {
  symbolTested: string;
  totalCandlesEvaluated: number;
  totalTrades: number;
  winRatePct: number;
  profitFactor: number;
  grossProfitUsdt: number;
  grossLossUsdt: number;
  netProfitUsdt: number;
  totalFrictionsPaidUsdt: number; // Maker 0.02% + Taker 0.06% + Funding + Slippage
  maxDrawdownPct: number;
  sharpeRatio: number;
  inSampleMetrics: SplitMetrics;
  outOfSampleMetrics: SplitMetrics;
  overfittingRatio: number;       // IS PF / OOS PF
  isRobust: boolean;
  passedCriteria: boolean;
  rejectionReasons: string[];
  tradesSample: BacktestSimulationTrade[];
}

export interface MandatoryAuditReport {
  reportId: string;
  generatedAt: number;
  challengerId: string;
  challengerVersion: string;
  championVersion: string;

  // 1. Vấn đề phát hiện (Identified Issues)
  issuesIdentified: string[];

  // 2. Thuật toán cũ và mới (Old vs New Algorithms)
  algorithmComparison: {
    domain: string;
    oldAlgorithm: string;
    newAlgorithm: string;
    vibeImprovement: string;
  }[];

  // 3. Các thay đổi trong từng bot (Bot Modifications)
  botModifications: {
    bot1: string; // Scanner: SMC Liquidity Pools & Order Flow
    bot2: string; // Analyst: MTF FVG, MSS, BOS, VWAP Deviations
    bot3: string; // Signal: Net Probability & Expectancy Model
    bot4: string; // Execution: Micro-second Trailing Stop & Breakeven Guard
    bot5: string; // Learning: Gemini AI Grounding & OOS Challenger Generator
  };

  // 4. Kết quả backtest và OOS (Backtest & Out-Of-Sample Results)
  backtestResults: BacktestSimulationResult;

  // 5. Kết quả kiểm định độc lập (Independent Validator Verdict)
  independentVerdict: {
    status: 'ACCEPT' | 'REJECT';
    auditor: string; // "IndependentValidator Engine v3.0"
    isIndependentAuditPassed: boolean;
    verificationSignature: string;
    timestamp: number;
    notes: string;
  };

  // 6. So sánh Champion vs Challenger (Champion / Challenger Head-to-Head)
  championVsChallenger: {
    championMetrics: {
      version: string;
      winRatePct: number;
      profitFactor: number;
      maxDrawdownPct: number;
      netProfitUsdt: number;
    };
    challengerMetrics: {
      version: string;
      winRatePct: number;
      profitFactor: number;
      maxDrawdownPct: number;
      netProfitUsdt: number;
    };
    deltaProfitFactor: number;
    deltaWinRatePct: number;
    deltaNetProfitPct: number;
    isChallengerSuperior: boolean;
  };

  // 7. Kết quả Paper Trading (Live Shadow Forward-Testing)
  paperTradingShadow: {
    shadowTradesExecuted: number;
    shadowWinRatePct: number;
    shadowNetProfitUsdt: number;
    realMarketDataFeed: string; // "Bitget USDT-M Futures WebSocket & REST"
    simulatedCapitalUsdt: number;
  };

  // 8. Rủi ro còn lại và quyết định (Residual Risks & Final Decision)
  residualRisksAndDecision: {
    identifiedRisks: string[];
    mitigations: string[];
    finalDecision: 'ACCEPT' | 'REJECT';
    decisionReason: string;
  };
}

export interface ChallengerModel {
  id: string;
  version: string;
  name: string;
  status:
    | 'RESEARCHING'
    | 'BACKTESTING'
    | 'VALIDATING'
    | 'APPROVED_PAPER'
    | 'PROMOTED_CHAMPION'
    | 'REJECTED'
    | 'ROLLED_BACK';
  createdAt: number;
  promotedAt?: number;
  parameters: {
    rsiLongMin: number;
    rsiLongMax: number;
    rsiShortMin: number;
    rsiShortMax: number;
    minConfidenceScore: number;
    minAtrRatio: number;
    adxTrendThreshold: number;
    maxAllowedSpreadBps: number;
    trailingStopAtrMultiplier: number;
    netProfitThresholdUsdt: number;
    smcLiquidityThresholdPct: number;
    fvgMinimumGapBps: number;
  };
  vibeInnovations: string[];
  auditReport?: MandatoryAuditReport;
}

export interface RollbackSnapshot {
  rollbackId: string;
  timestamp: number;
  fromVersion: string;
  toVersion: string;
  triggerReason: string;
  backupFile: string;
  metricsBeforeRollback: {
    walletBalance: number;
    openPositionsCount: number;
    winRatePct: number;
    profitFactor: number;
  };
}
