import { TradeSide } from './engine';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET';
export type OrderRole = 'OPEN' | 'CLOSE' | 'STOP_LOSS' | 'TAKE_PROFIT';
export type OrderStatus =
  | 'PENDING_NEW'
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface PaperOrder {
  orderId: string;
  clientOrderId: string;
  idempotencyKey: string;
  signalId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  role: OrderRole;
  price: number;
  requestedAmount: number;
  filledAmount: number;
  avgFillPrice: number;
  feePaid: number;
  slippageBps: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  rejectReason?: string;
  latencyMs: number;
}

export interface ManagedPosition {
  id: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  margin: number;
  leverage: number;
  openFee: number;
  estExitFee: number;
  accruedFunding: number;
  grossPnL: number;
  currentCosts: number;
  netPnL: number;
  roe: number;
  peakNetPnL: number;
  stopLoss: number;
  takeProfit?: number;
  trailingStopActive: boolean;
  trailingHighWaterMark: number;
  trailingCallbackBps: number;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  closingInProgress: boolean;
  signalId?: string;
  openTime: number;
  closeTime?: number;
}

export type LedgerEntryType =
  | 'INITIAL_CAPITAL'
  | 'MARGIN_ALLOCATION'
  | 'MARGIN_RELEASE'
  | 'TAKER_FEE_ENTRY'
  | 'TAKER_FEE_EXIT'
  | 'FUNDING_DRAG'
  | 'REALIZED_GROSS_PNL'
  | 'EMERGENCY_LIQUIDATION'
  | 'MANUAL_DEPOSIT';

export interface DoubleEntryLedgerRecord {
  entryId: string;
  timestamp: number;
  type: LedgerEntryType;
  symbol?: string;
  orderId?: string;
  positionId?: string;
  debit: number; // Cash reduction
  credit: number; // Cash addition
  cashBalanceAfter: number;
  description: string;
}

export interface Bot4ExecutionConfig {
  initialEquity: number; // Default 10.0 USDT
  targetMarginPerPosition: number; // Target 2.0 USDT per trade
  maxLeverage: number; // 5x (2 USDT margin => 10 USDT notional)
  maxSimultaneousPositions: number; // 2 positions max (4 USDT total margin)
  maxTotalMarginUsdt: number; // 4.0 USDT max total margin, reserving 6.0 USDT
  makerFeeRate: number; // 0.0002 (0.02%)
  takerFeeRate: number; // 0.0006 (0.06%)
  baseSlippageBps: number; // 3 bps
  netProfitThresholdUsdt: number; // Strictly positive net profit threshold (0.0001 USDT)
  dailyMaxLossUsdt: number; // 2.0 USDT max daily loss
  maxDrawdownPct: number; // 25% max equity drawdown
  enableTrailingStop: boolean;
  trailingActivationNetUsdt: number; // 0.04 USDT net gain to activate trailing
  trailingCallbackBps: number; // 25 bps callback from peak
  maxDataAgeSeconds: number; // 60s
  maxSpreadBps: number; // 6 bps
  partialFillProbability: number; // 0.00 - 0.10 realistic partial fill probability
  simulateRejectionRate: number; // for edge test scenarios
  autoCloseEnabled?: boolean; // Autonomous Net-TP and TP exit
}

export interface Bot4ExecutionMetrics {
  equity: number;
  walletBalance: number;
  allocatedMargin: number;
  marginUtilizationPct: number;
  openPositionsCount: number;
  ordersSubmittedCount: number;
  ordersFilledCount: number;
  ordersPartiallyFilledCount: number;
  ordersRejectedCount: number;
  duplicatesBlockedCount: number;
  duplicateClosesBlockedCount: number;
  totalRealizedNetPnL: number;
  totalGrossPnL: number;
  totalFeesPaid: number;
  totalFundingPaid: number;
  totalSlippageBpsAvg: number;
  avgExecutionLatencyMs: number;
  dailyLossRecorded: number;
  peakEquity: number;
  maxDrawdownObservedPct: number;
  isKillSwitchActive: boolean;
  killSwitchReason?: string;
  isDataReliabilityHalted: boolean;
  lastHeartbeatTime: number;
  lastAuditResult: {
    isReconciled: boolean;
    discrepancyUsdt: number;
    ledgerEntriesCount: number;
  };
}
