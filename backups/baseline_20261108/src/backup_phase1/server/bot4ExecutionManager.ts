import {
  PaperOrder,
  ManagedPosition,
  DoubleEntryLedgerRecord,
  Bot4ExecutionConfig,
  Bot4ExecutionMetrics,
  OrderSide,
  OrderRole,
  OrderStatus,
} from '../types/execution';
import { TradeSide, TickerData, ClosedTrade, TradeSignal } from '../types/engine';
import { getContractSpec, roundToLotSize, roundToTickSize } from './exchangeSpecs';
import {
  ClosedTradeLogPayload,
  Bot4ExecutionPayload,
  Bot3SignalNetTPPayload,
} from '../types/pipeline';

export class Bot4ExecutionManager {
  private config: Bot4ExecutionConfig;
  private walletBalance: number;
  private equity: number;
  private peakEquity: number;
  private positions: Map<string, ManagedPosition> = new Map();
  private orders: Map<string, PaperOrder> = new Map();
  private orderHistory: PaperOrder[] = [];
  private ledger: DoubleEntryLedgerRecord[] = [];
  private closedTrades: ClosedTrade[] = [];
  private idempotencyKeys: Map<string, number> = new Map(); // key -> timestamp
  private isKillSwitchActive: boolean = false;
  private killSwitchReason?: string;
  private isDataReliabilityHalted: boolean = false;
  private dailyRealizedLoss: number = 0;
  private dailyLossResetDay: number = new Date().getUTCDate();
  private lastHeartbeatTime: number = Date.now();

  // Metrics counters
  private ordersSubmittedCount: number = 0;
  private ordersFilledCount: number = 0;
  private ordersPartiallyFilledCount: number = 0;
  private ordersRejectedCount: number = 0;
  private duplicatesBlockedCount: number = 0;
  private duplicateClosesBlockedCount: number = 0;
  private totalRealizedNetPnL: number = 0;
  private totalGrossPnL: number = 0;
  private totalFeesPaid: number = 0;
  private totalFundingPaid: number = 0;
  private totalSlippageBpsSum: number = 0;
  private latencyHistory: number[] = [];

  private logCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
  private onTradeClosedCallback?: (tradePayload: ClosedTradeLogPayload) => void;

  public setOnTradeClosedCallback(fn: (tradePayload: ClosedTradeLogPayload) => void) {
    this.onTradeClosedCallback = fn;
  }

  constructor(customConfig?: Partial<Bot4ExecutionConfig>, initialBalance: number = 10.0) {
    this.config = {
      initialEquity: 10.0,
      targetMarginPerPosition: 2.0,
      maxLeverage: 5,
      maxSimultaneousPositions: 2,
      maxTotalMarginUsdt: 4.0,
      makerFeeRate: 0.0002, // 0.02%
      takerFeeRate: 0.0006, // 0.06%
      baseSlippageBps: 3.0, // 3 bps
      netProfitThresholdUsdt: 0.0001, // strictly > 0 net PnL after all costs
      dailyMaxLossUsdt: 2.0, // 20% of 10 USDT
      maxDrawdownPct: 25.0, // 25% max equity drawdown
      enableTrailingStop: true,
      trailingActivationNetUsdt: 0.04, // +$0.04 activates trailing
      trailingCallbackBps: 25.0, // 25 bps callback from high water mark
      maxDataAgeSeconds: 60,
      maxSpreadBps: 6.0,
      partialFillProbability: 0.0,
      simulateRejectionRate: 0.0,
      autoCloseEnabled: true,
      ...customConfig,
    };

    this.walletBalance = initialBalance;
    this.equity = initialBalance;
    this.peakEquity = initialBalance;

    // Record initial capital in double-entry ledger
    this.recordLedgerEntry({
      type: 'INITIAL_CAPITAL',
      debit: 0,
      credit: initialBalance,
      description: `Initial Paper Trading Capital provisioned ($${initialBalance.toFixed(4)} USDT)`,
    });
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.logCallback = fn;
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.logCallback) {
      this.logCallback(msg, type);
    }
  }

  public getConfig(): Bot4ExecutionConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<Bot4ExecutionConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.log(`[BOT 4] Configuration updated: Target Margin $${this.config.targetMarginPerPosition}, Max Pos: ${this.config.maxSimultaneousPositions}`, 'info');
  }

  public hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  // --- PRE-TRADE VALIDATION PIPELINE ---
  public validateSignalForExecution(
    signal: TradeSignal,
    ticker: TickerData
  ): { isValid: boolean; reason?: string; spec?: any } {
    // 1. Kill Switch & Emergency Stop check
    if (this.isKillSwitchActive) {
      return { isValid: false, reason: `EMERGENCY_KILL_SWITCH_ACTIVE: ${this.killSwitchReason || 'System halted'}` };
    }

    // 2. Data Reliability check (Staleness & Spread)
    const now = Date.now();
    const dataAgeSec = (now - ticker.updatedAt) / 1000;
    if (dataAgeSec > this.config.maxDataAgeSeconds) {
      this.isDataReliabilityHalted = true;
      return { isValid: false, reason: `DATA_STALE: Ticker data is ${dataAgeSec.toFixed(1)}s old (max ${this.config.maxDataAgeSeconds}s)` };
    }

    const spreadBps = ticker.spreadPercent ? ticker.spreadPercent * 100 : ((ticker.askPr - ticker.bidPr) / ticker.lastPr) * 10000;
    if (spreadBps > this.config.maxSpreadBps) {
      this.isDataReliabilityHalted = true;
      return { isValid: false, reason: `SPREAD_EXCEEDED: Spread ${spreadBps.toFixed(2)} bps exceeds max ${this.config.maxSpreadBps} bps` };
    }
    this.isDataReliabilityHalted = false;

    // 3. Daily Loss & Max Drawdown check
    this.checkAndResetDailyLoss();
    if (this.dailyRealizedLoss >= this.config.dailyMaxLossUsdt) {
      this.triggerKillSwitch(`DAILY_LOSS_LIMIT_EXCEEDED: Loss -$${this.dailyRealizedLoss.toFixed(4)} >= $${this.config.dailyMaxLossUsdt}`);
      return { isValid: false, reason: 'DAILY_LOSS_LIMIT_REACHED' };
    }

    const currentDrawdownPct = this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0;
    if (currentDrawdownPct >= this.config.maxDrawdownPct) {
      this.triggerKillSwitch(`MAX_DRAWDOWN_EXCEEDED: Drawdown ${currentDrawdownPct.toFixed(1)}% >= ${this.config.maxDrawdownPct}%`);
      return { isValid: false, reason: 'MAX_DRAWDOWN_LIMIT_REACHED' };
    }

    // 4. Concurrent Position and Margin Allocation Capacity
    if (this.positions.size >= this.config.maxSimultaneousPositions) {
      return { isValid: false, reason: `CAPACITY_FULL: Current positions ${this.positions.size} >= max ${this.config.maxSimultaneousPositions}` };
    }

    if (this.positions.has(signal.symbol)) {
      return { isValid: false, reason: `POSITION_ALREADY_OPEN: Active position for ${signal.symbol} already exists` };
    }

    // Check total allocated margin cap
    const currentAllocatedMargin = Array.from(this.positions.values()).reduce((sum, p) => sum + p.margin, 0);
    const requiredMargin = this.config.targetMarginPerPosition;
    if (currentAllocatedMargin + requiredMargin > this.config.maxTotalMarginUsdt) {
      return {
        isValid: false,
        reason: `MARGIN_CAP_REACHED: Total margin ${currentAllocatedMargin.toFixed(2)} + ${requiredMargin.toFixed(2)} exceeds cap $${this.config.maxTotalMarginUsdt}`,
      };
    }

    if (this.walletBalance < requiredMargin) {
      return {
        isValid: false,
        reason: `INSUFFICIENT_FREE_MARGIN: Free cash $${this.walletBalance.toFixed(4)} < required $${requiredMargin.toFixed(2)}`,
      };
    }

    // 5. Symbol Contract Specifications (Min size, lot size, min notional)
    const spec = getContractSpec(signal.symbol);
    const leverage = Math.min(this.config.maxLeverage, spec.maxLeverage);
    const notional = requiredMargin * leverage;

    if (notional < spec.minNotional) {
      return {
        isValid: false,
        reason: `NOTIONAL_BELOW_MIN: Position notional $${notional.toFixed(2)} < exchange min $${spec.minNotional}`,
      };
    }

    const rawAmount = notional / signal.entryPrice;
    const roundedAmount = roundToLotSize(rawAmount, spec.lotSize);
    if (roundedAmount < spec.minSize) {
      return {
        isValid: false,
        reason: `AMOUNT_BELOW_MIN: Sized amount ${roundedAmount} < exchange minSize ${spec.minSize}`,
      };
    }

    return { isValid: true, spec };
  }

  // --- EXECUTE TRADE SIGNAL ---
  public executeSignal(
    signal: TradeSignal,
    ticker: TickerData,
    customIdempotencyKey?: string
  ): { success: boolean; position?: ManagedPosition; order?: PaperOrder; rejectReason?: string } {
    this.ordersSubmittedCount++;

    // 1. Kill Switch Check (Immediate Halt)
    if (this.isKillSwitchActive) {
      this.ordersRejectedCount++;
      const reason = `EMERGENCY_KILL_SWITCH_ACTIVE: ${this.killSwitchReason || 'System halted'}`;
      this.log(`[BOT 4] ❌ Order rejected: ${reason}`, 'warning');
      return { success: false, rejectReason: reason };
    }

    // 2. Idempotency Key Generation & Anti-Duplicate Check
    const idempKey = customIdempotencyKey || `IDEMP-${signal.signalId || signal.symbol}-${signal.direction}-${signal.strategy}`;
    if (this.idempotencyKeys.has(idempKey)) {
      this.duplicatesBlockedCount++;
      const reason = `DUPLICATE_ORDER_SUPPRESSED: Idempotency key ${idempKey} already processed.`;
      this.log(`[BOT 4] 🛡️ ${reason}`, 'warning');
      return { success: false, rejectReason: reason };
    }

    // Pre-trade validation pipeline
    const validation = this.validateSignalForExecution(signal, ticker);
    if (!validation.isValid) {
      this.ordersRejectedCount++;
      this.log(`[BOT 4] ❌ Order rejected for ${signal.symbol}: ${validation.reason}`, 'warning');
      return { success: false, rejectReason: validation.reason };
    }

    // Record Idempotency Key
    this.idempotencyKeys.set(idempKey, Date.now());

    // Prepare Order Details
    const spec = validation.spec || getContractSpec(signal.symbol);
    const leverage = Math.min(this.config.maxLeverage, spec.maxLeverage);
    const margin = this.config.targetMarginPerPosition;
    const notional = margin * leverage;
    const orderSide: OrderSide = signal.direction === 'LONG' ? 'BUY' : 'SELL';

    const rawAmount = notional / signal.entryPrice;
    const orderAmount = roundToLotSize(rawAmount, spec.lotSize);
    const roundedPrice = roundToTickSize(signal.entryPrice, spec.tickSize);

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const clientOrderId = `CL-${orderId}`;

    // Simulate Realistic Latency (5ms - 25ms)
    const latencyMs = Math.floor(Math.random() * 20) + 6;
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > 100) this.latencyHistory.shift();

    // Order State Machine: PENDING_NEW -> NEW
    const paperOrder: PaperOrder = {
      orderId,
      clientOrderId,
      idempotencyKey: idempKey,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: orderSide,
      type: 'MARKET',
      role: 'OPEN',
      price: roundedPrice,
      requestedAmount: orderAmount,
      filledAmount: 0,
      avgFillPrice: 0,
      feePaid: 0,
      slippageBps: 0,
      status: 'NEW',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      latencyMs,
    };
    this.orders.set(orderId, paperOrder);

    // Realistic Simulation: Test simulated rejection rate
    if (this.config.simulateRejectionRate > 0 && Math.random() < this.config.simulateRejectionRate) {
      paperOrder.status = 'REJECTED';
      paperOrder.rejectReason = 'SIMULATED_EXCHANGE_REJECTION: Order buffer saturated';
      paperOrder.updatedAt = Date.now();
      this.ordersRejectedCount++;
      this.orderHistory.unshift(paperOrder);
      this.orders.delete(orderId);
      return { success: false, order: paperOrder, rejectReason: paperOrder.rejectReason };
    }

    // Realistic Slippage Simulation (spread + volatility impact)
    const spreadPct = ticker.spreadPercent || 0.0002;
    const slippageBps = this.config.baseSlippageBps + (spreadPct * 10000 * 0.5);
    const slippageDecimal = slippageBps / 10000;

    // Fill Price accounting for directional slippage
    const fillPrice = orderSide === 'BUY'
      ? roundToTickSize(ticker.askPr * (1 + slippageDecimal), spec.tickSize)
      : roundToTickSize(ticker.bidPr * (1 - slippageDecimal), spec.tickSize);

    // Check Partial Fill Simulation
    let fillAmount = orderAmount;
    if (this.config.partialFillProbability > 0 && Math.random() < this.config.partialFillProbability) {
      fillAmount = roundToLotSize(orderAmount * 0.65, spec.lotSize);
      if (fillAmount < spec.minSize) fillAmount = orderAmount; // fallback to full if below min
      else this.ordersPartiallyFilledCount++;
    }

    const filledNotional = fillAmount * fillPrice;
    const openFee = +(filledNotional * this.config.takerFeeRate).toFixed(6);

    // Update Order to FILLED (or PARTIALLY_FILLED)
    paperOrder.status = fillAmount < orderAmount ? 'PARTIALLY_FILLED' : 'FILLED';
    paperOrder.filledAmount = fillAmount;
    paperOrder.avgFillPrice = fillPrice;
    paperOrder.feePaid = openFee;
    paperOrder.slippageBps = +slippageBps.toFixed(2);
    paperOrder.updatedAt = Date.now();

    this.ordersFilledCount++;
    this.totalSlippageBpsSum += slippageBps;
    this.totalFeesPaid += openFee;

    // Deduct margin and entry fee from free wallet balance
    const actualMargin = +(margin * (fillAmount / orderAmount)).toFixed(4);
    this.walletBalance = Math.max(0, +(this.walletBalance - actualMargin).toFixed(6));
    this.walletBalance = Math.max(0, +(this.walletBalance - openFee).toFixed(6));

    // Ledger Double-Entry Records
    this.recordLedgerEntry({
      type: 'MARGIN_ALLOCATION',
      symbol: signal.symbol,
      orderId,
      debit: actualMargin,
      credit: 0,
      description: `Margin lock for ${signal.direction} ${signal.symbol} (x${leverage})`,
    });

    this.recordLedgerEntry({
      type: 'TAKER_FEE_ENTRY',
      symbol: signal.symbol,
      orderId,
      debit: openFee,
      credit: 0,
      description: `Entry Taker Fee (6 bps) on $${filledNotional.toFixed(2)} notional`,
    });

    // Create Managed Position
    const positionId = `POS-${Date.now().toString().slice(-6)}-${signal.symbol}`;
    const estExitFee = +(filledNotional * this.config.takerFeeRate).toFixed(6);

    const managedPos: ManagedPosition = {
      id: positionId,
      symbol: signal.symbol,
      side: signal.direction,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      amount: fillAmount,
      margin: actualMargin,
      leverage,
      openFee,
      estExitFee,
      accruedFunding: 0,
      grossPnL: 0,
      currentCosts: openFee + estExitFee,
      netPnL: -(openFee + estExitFee),
      roe: -(((openFee + estExitFee) / actualMargin) * 100),
      peakNetPnL: -(openFee + estExitFee),
      stopLoss: signal.stopLossPrice,
      takeProfit: signal.takeProfitPrice,
      trailingStopActive: this.config.enableTrailingStop,
      trailingHighWaterMark: fillPrice,
      trailingCallbackBps: this.config.trailingCallbackBps,
      status: 'OPEN',
      closingInProgress: false,
      signalId: signal.signalId,
      openTime: Date.now(),
    };

    this.positions.set(signal.symbol, managedPos);
    this.orderHistory.unshift(paperOrder);
    this.orders.delete(orderId);

    this.recalculateAccountEquity();

    this.log(
      `[BOT 4] 🚀 Executed ${signal.direction} ${signal.symbol} | Amount: ${fillAmount} @ $${fillPrice} | Margin: $${actualMargin.toFixed(2)} (x${leverage}) | Slip: ${slippageBps.toFixed(1)}bps | Fee: -$${openFee.toFixed(4)} | Latency: ${latencyMs}ms`,
      'success'
    );

    return { success: true, position: managedPos, order: paperOrder };
  }

  // --- EVENT-DRIVEN PRICE UPDATE & NET-PROFIT EXIT EVALUATION ---
  public onPriceUpdate(
    symbol: string,
    ticker: TickerData
  ): { positionUpdated?: ManagedPosition; closedTrade?: ClosedTrade } {
    const pos = this.positions.get(symbol);
    if (!pos || pos.status !== 'OPEN' || pos.closingInProgress) {
      return {};
    }

    const currentPrice = ticker.lastPr;
    pos.currentPrice = currentPrice;

    // 1. Accrue Proportional Funding Drag (every 8-hour period)
    const elapsedSec = (Date.now() - pos.openTime) / 1000;
    const fundingRate = ticker.fundingRate || 0.0001; // default 0.01% if not specified
    const notional = pos.amount * currentPrice;
    // Funding cost = notional * fundingRate * (elapsed / (8 * 3600))
    pos.accruedFunding = +(notional * Math.abs(fundingRate) * (elapsedSec / 28800)).toFixed(6);

    // 2. Real-time Gross PnL
    const grossPnL = pos.side === 'LONG'
      ? (currentPrice - pos.entryPrice) * pos.amount
      : (pos.entryPrice - currentPrice) * pos.amount;

    // 3. Current Real-time Costs = Open Fee + Estimated Exit Taker Fee + Accrued Funding
    const estExitFee = +(notional * this.config.takerFeeRate).toFixed(6);
    pos.estExitFee = estExitFee;
    const totalCosts = +(pos.openFee + estExitFee + pos.accruedFunding).toFixed(6);
    pos.currentCosts = totalCosts;

    // 4. Net PnL = Gross PnL - All Friction Costs
    const netPnL = +(grossPnL - totalCosts).toFixed(6);
    pos.grossPnL = +grossPnL.toFixed(6);
    pos.netPnL = netPnL;
    pos.roe = +((netPnL / pos.margin) * 100).toFixed(2);

    // Track peak net PnL and high-water mark for trailing stop
    if (netPnL > pos.peakNetPnL) {
      pos.peakNetPnL = netPnL;
      pos.trailingHighWaterMark = currentPrice;
    }

    // 5. EVALUATE EXIT CONDITIONS
    // CONDITION A: STOP LOSS HIT (STRICTLY PRESERVED FOR CAPITAL PROTECTION - ALWAYS TRIGGERED)
    const isStopLossTriggered = pos.side === 'LONG'
      ? currentPrice <= pos.stopLoss
      : currentPrice >= pos.stopLoss;

    if (isStopLossTriggered) {
      this.log(`[BOT 4] 🛑 STOP LOSS hit for ${pos.symbol} (${pos.side}) @ $${currentPrice} (SL: $${pos.stopLoss}) | Net: -$${Math.abs(netPnL).toFixed(4)}`, 'danger');
      const closed = this.closePosition(symbol, ticker, 'STOP_LOSS');
      return { closedTrade: closed || undefined };
    }

    // CONDITION B: TAKE PROFIT PRICE HIT (Autonomous Take Profit)
    const isTakeProfitTriggered = pos.takeProfit && (
      pos.side === 'LONG' ? currentPrice >= pos.takeProfit : currentPrice <= pos.takeProfit
    );

    if (isTakeProfitTriggered && netPnL > 0 && this.config.autoCloseEnabled !== false) {
      this.log(
        `[BOT 4] 🎯 TAKE PROFIT price reached for ${pos.symbol} (${pos.side}) @ $${currentPrice} (TP target: $${pos.takeProfit}) | Locking Net PnL: +$${netPnL.toFixed(4)}`,
        'success'
      );
      const closed = this.closePosition(symbol, ticker, 'NET_PNL_POSITIVE_TRIGGER');
      return { closedTrade: closed || undefined };
    }

    // CONDITION C: TRAILING STOP TRIGGER (if enabled & profit target hit)
    if (pos.trailingStopActive && pos.peakNetPnL >= this.config.trailingActivationNetUsdt && this.config.autoCloseEnabled !== false) {
      const pullbackBps = pos.side === 'LONG'
        ? ((pos.trailingHighWaterMark - currentPrice) / pos.trailingHighWaterMark) * 10000
        : ((currentPrice - pos.trailingHighWaterMark) / pos.trailingHighWaterMark) * 10000;

      if (pullbackBps >= pos.trailingCallbackBps && netPnL >= this.config.netProfitThresholdUsdt) {
        this.log(
          `[BOT 4] 🎯 Trailing Take-Profit triggered on ${pos.symbol}: Peak Net +$${pos.peakNetPnL.toFixed(4)}, Pulled back ${pullbackBps.toFixed(1)}bps | Locking Net: +$${netPnL.toFixed(4)}`,
          'success'
        );
        const closed = this.closePosition(symbol, ticker, 'TRAILING_TP');
        return { closedTrade: closed || undefined };
      }
    }

    // CONDITION D: NET PROFIT THRESHOLD TRIGGER (Autonomous Net-Profit Scalp Exit)
    // STRICT RULE: Only trigger when Net PnL >= threshold. NEVER close purely on gross PnL!
    if (netPnL >= this.config.netProfitThresholdUsdt && this.config.autoCloseEnabled !== false) {
      this.log(
        `[BOT 4] 💰 TỰ ĐỘNG CHỐT LỜI (Net PnL Target) cho ${pos.symbol}: Lãi ròng +$${netPnL.toFixed(4)} >= ngưỡng $${this.config.netProfitThresholdUsdt} (Gross: +$${grossPnL.toFixed(4)}, Chi phí: -$${totalCosts.toFixed(4)})`,
        'success'
      );
      const closed = this.closePosition(symbol, ticker, 'NET_PNL_POSITIVE_TRIGGER');
      return { closedTrade: closed || undefined };
    }

    this.recalculateAccountEquity();
    return { positionUpdated: pos };
  }

  // --- ATOMIC POSITION CLOSING WITH IN-FLIGHT LOCK ---
  public closePosition(
    symbol: string,
    ticker: TickerData,
    reason: 'NET_PNL_POSITIVE_TRIGGER' | 'MANUAL_CLOSE' | 'STOP_LOSS' | 'TRAILING_TP' | 'EMERGENCY_KILL'
  ): ClosedTrade | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;

    // Atomic In-flight Close Lock to prevent duplicate close submissions
    if (pos.closingInProgress) {
      this.duplicateClosesBlockedCount++;
      this.log(`[BOT 4] 🛡️ Duplicate close request for ${symbol} suppressed: Closing already in-flight`, 'warning');
      return null;
    }

    pos.closingInProgress = true;
    pos.status = 'CLOSING';

    const spec = getContractSpec(symbol);
    const orderSide: OrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';

    // Latency & Slippage on Exit
    const latencyMs = Math.floor(Math.random() * 15) + 5;
    this.latencyHistory.push(latencyMs);

    const spreadPct = ticker.spreadPercent || 0.0002;
    const slippageBps = this.config.baseSlippageBps + (spreadPct * 10000 * 0.5);
    const slippageDecimal = slippageBps / 10000;

    const exitPrice = orderSide === 'SELL'
      ? roundToTickSize(ticker.bidPr * (1 - slippageDecimal), spec.tickSize)
      : roundToTickSize(ticker.askPr * (1 + slippageDecimal), spec.tickSize);

    const exitNotional = pos.amount * exitPrice;
    const exitFee = +(exitNotional * this.config.takerFeeRate).toFixed(6);

    // Final PnL Calculations
    const finalGrossPnL = pos.side === 'LONG'
      ? (exitPrice - pos.entryPrice) * pos.amount
      : (pos.entryPrice - exitPrice) * pos.amount;

    const finalCosts = +(pos.openFee + exitFee + pos.accruedFunding).toFixed(6);
    const finalNetPnL = +(finalGrossPnL - finalCosts).toFixed(6);
    const roe = +((finalNetPnL / pos.margin) * 100).toFixed(2);
    const durationSeconds = Math.max(1, Math.round((Date.now() - pos.openTime) / 1000));

    // Create and record Close Order
    const closeOrderId = `ORD-CLS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const closeOrder: PaperOrder = {
      orderId: closeOrderId,
      clientOrderId: `CL-${closeOrderId}`,
      idempotencyKey: `IDEMP-CLS-${pos.id}`,
      symbol: pos.symbol,
      side: orderSide,
      type: 'MARKET',
      role: 'CLOSE',
      price: exitPrice,
      requestedAmount: pos.amount,
      filledAmount: pos.amount,
      avgFillPrice: exitPrice,
      feePaid: exitFee,
      slippageBps: +slippageBps.toFixed(2),
      status: 'FILLED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      latencyMs,
    };
    this.orderHistory.unshift(closeOrder);

    // Release margin + apply Net Realized PnL to Cash Balance
    // Return margin to wallet
    this.walletBalance = +(this.walletBalance + pos.margin).toFixed(6);
    // Apply realized gross PnL
    this.walletBalance = +(this.walletBalance + finalGrossPnL).toFixed(6);
    // Deduct actual exit fee
    this.walletBalance = Math.max(0, +(this.walletBalance - exitFee).toFixed(6));
    // Deduct funding if applicable
    if (pos.accruedFunding > 0) {
      this.walletBalance = Math.max(0, +(this.walletBalance - pos.accruedFunding).toFixed(6));
    }

    // Ledger Double-Entry Records for Exit
    this.recordLedgerEntry({
      type: 'MARGIN_RELEASE',
      symbol: pos.symbol,
      orderId: closeOrderId,
      positionId: pos.id,
      debit: 0,
      credit: pos.margin,
      description: `Margin release of $${pos.margin.toFixed(2)} on position close`,
    });

    this.recordLedgerEntry({
      type: 'REALIZED_GROSS_PNL',
      symbol: pos.symbol,
      orderId: closeOrderId,
      positionId: pos.id,
      debit: finalGrossPnL < 0 ? Math.abs(finalGrossPnL) : 0,
      credit: finalGrossPnL >= 0 ? finalGrossPnL : 0,
      description: `Realized Gross PnL: ${finalGrossPnL >= 0 ? '+' : ''}$${finalGrossPnL.toFixed(4)}`,
    });

    this.recordLedgerEntry({
      type: 'TAKER_FEE_EXIT',
      symbol: pos.symbol,
      orderId: closeOrderId,
      positionId: pos.id,
      debit: exitFee,
      credit: 0,
      description: `Exit Taker Fee on $${exitNotional.toFixed(2)} notional`,
    });

    if (pos.accruedFunding > 0) {
      this.recordLedgerEntry({
        type: 'FUNDING_DRAG',
        symbol: pos.symbol,
        orderId: closeOrderId,
        positionId: pos.id,
        debit: pos.accruedFunding,
        credit: 0,
        description: `Accrued Funding Fee over ${durationSeconds}s`,
      });
      this.totalFundingPaid += pos.accruedFunding;
    }

    // Record Closed Trade
    const closedTrade: ClosedTrade = {
      id: `TRD-${Date.now().toString().slice(-6)}`,
      time: Date.now(),
      symbol: pos.symbol,
      side: pos.side,
      entry: pos.entryPrice,
      exit: exitPrice,
      margin: pos.margin,
      leverage: pos.leverage,
      amount: pos.amount,
      grossPnL: finalGrossPnL,
      costs: finalCosts,
      netPnL: finalNetPnL,
      roe,
      durationSeconds,
      reason: reason === 'EMERGENCY_KILL' ? 'MANUAL_CLOSE' : reason,
      botId: 4,
    };

    this.closedTrades.unshift(closedTrade);
    this.totalRealizedNetPnL += finalNetPnL;
    this.totalGrossPnL += finalGrossPnL;
    this.totalFeesPaid += exitFee;

    if (finalNetPnL < 0) {
      this.dailyRealizedLoss += Math.abs(finalNetPnL);
    }

    // Remove position from active map only after order is confirmed
    this.positions.delete(symbol);
    this.recalculateAccountEquity();

    this.log(
      `[BOT 4] 🏁 Closed ${pos.symbol} (${pos.side}) @ $${exitPrice} | Reason: ${reason} | Duration: ${durationSeconds}s | Net: ${finalNetPnL >= 0 ? '+' : ''}$${finalNetPnL.toFixed(4)} (ROE: ${roe >= 0 ? '+' : ''}${roe}%) | Total Costs: -$${finalCosts.toFixed(4)}`,
      finalNetPnL >= 0 ? 'success' : 'danger'
    );

    // Notify Bot 5 Loss Analysis Engine via Closed Trade Payload
    if (this.onTradeClosedCallback) {
      const closedLogPayload: ClosedTradeLogPayload = {
        tradeId: closedTrade.id,
        signalId: pos.signalId,
        symbol: pos.symbol,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        marginUsdt: pos.margin,
        leverage: pos.leverage,
        notionalUsdt: exitNotional,
        entryTime: pos.openTime,
        exitTime: closedTrade.time,
        durationSeconds,
        grossPnL: finalGrossPnL,
        openFee: pos.openFee,
        exitFee,
        accruedFunding: pos.accruedFunding,
        totalCosts: finalCosts,
        netPnL: finalNetPnL,
        roePct: roe,
        closeReason: closedTrade.reason,
        entryIndicators: {
          rsi5m: 50,
          atr1m: pos.entryPrice * 0.005,
          spreadBps: 2.0,
          confidenceScore: 80,
        },
      };
      this.onTradeClosedCallback(closedLogPayload);
    }

    return closedTrade;
  }

  // --- RISK CONTROLS & KILL SWITCH ---
  public triggerKillSwitch(reason: string) {
    this.isKillSwitchActive = true;
    this.killSwitchReason = reason;
    this.log(`[BOT 4] 🚨 EMERGENCY KILL SWITCH ACTIVATED: ${reason}`, 'danger');

    // Liquidate all active positions at market
    for (const [symbol, pos] of this.positions.entries()) {
      const fallbackTicker: TickerData = {
        symbol,
        lastPr: pos.currentPrice,
        bidPr: pos.currentPrice * 0.9995,
        askPr: pos.currentPrice * 1.0005,
        change24h: 0,
        high24h: pos.currentPrice,
        low24h: pos.currentPrice,
        volume24h: 1000000,
        updatedAt: Date.now(),
      };
      this.closePosition(symbol, fallbackTicker, 'EMERGENCY_KILL');
    }

    // Cancel any pending orders
    for (const [orderId, order] of this.orders.entries()) {
      order.status = 'CANCELLED';
      order.rejectReason = 'EMERGENCY_KILL_SWITCH_ACTIVE';
      this.orderHistory.unshift(order);
      this.orders.delete(orderId);
    }
  }

  public resetKillSwitch() {
    this.isKillSwitchActive = false;
    this.killSwitchReason = undefined;
    this.log(`[BOT 4] 🔄 Emergency Kill Switch manually reset. Normal execution resumed.`, 'info');
  }

  // --- PERIODIC 1-MINUTE HEARTBEAT AUDIT ---
  public runHeartbeat(): {
    timestamp: number;
    openPositionsCount: number;
    openOrdersCount: number;
    auditPassed: boolean;
    discrepancyUsdt: number;
  } {
    this.lastHeartbeatTime = Date.now();
    this.checkAndResetDailyLoss();

    // 1. Audit active orders for timeouts (clean up stuck orders)
    for (const [orderId, order] of this.orders.entries()) {
      const orderAgeSec = (Date.now() - order.createdAt) / 1000;
      if (orderAgeSec > 60 && order.status === 'NEW') {
        order.status = 'EXPIRED';
        order.rejectReason = 'HEARTBEAT_TIMEOUT: Order pending > 60s without fill';
        this.orderHistory.unshift(order);
        this.orders.delete(orderId);
        this.log(`[BOT 4] ⏱️ Cancelled expired order ${orderId} on heartbeat`, 'warning');
      }
    }

    // 2. Perform Double-Entry Ledger Reconciliation
    const audit = this.auditLedgerConsistency();

    this.log(
      `[BOT 4] 💓 Heartbeat Audit: Equity $${this.equity.toFixed(4)} | Free Margin $${this.walletBalance.toFixed(4)} | Positions: ${this.positions.size}/${this.config.maxSimultaneousPositions} | Ledger Reconciled: ${audit.isReconciled}`,
      audit.isReconciled ? 'cyan' : 'danger'
    );

    return {
      timestamp: this.lastHeartbeatTime,
      openPositionsCount: this.positions.size,
      openOrdersCount: this.orders.size,
      auditPassed: audit.isReconciled,
      discrepancyUsdt: audit.discrepancyUsdt,
    };
  }

  // --- DOUBLE-ENTRY LEDGER RECONCILIATION ---
  private recordLedgerEntry(entry: Omit<DoubleEntryLedgerRecord, 'entryId' | 'timestamp' | 'cashBalanceAfter'>) {
    const entryId = `LDG-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const record: DoubleEntryLedgerRecord = {
      entryId,
      timestamp: Date.now(),
      cashBalanceAfter: +this.walletBalance.toFixed(6),
      ...entry,
    };
    this.ledger.unshift(record);
    if (this.ledger.length > 500) this.ledger.pop();
  }

  public auditLedgerConsistency(): { isReconciled: boolean; discrepancyUsdt: number; ledgerEntriesCount: number } {
    let computedCash = 0;
    // Iterate from oldest to newest ledger record
    const reversed = [...this.ledger].reverse();
    for (const entry of reversed) {
      if (entry.type === 'INITIAL_CAPITAL' || entry.type === 'MANUAL_DEPOSIT') {
        computedCash += entry.credit;
      } else if (entry.type === 'MARGIN_ALLOCATION') {
        computedCash -= entry.debit;
      } else if (entry.type === 'MARGIN_RELEASE') {
        computedCash += entry.credit;
      } else if (entry.type === 'TAKER_FEE_ENTRY' || entry.type === 'TAKER_FEE_EXIT' || entry.type === 'FUNDING_DRAG') {
        computedCash -= entry.debit;
      } else if (entry.type === 'REALIZED_GROSS_PNL') {
        computedCash += entry.credit - entry.debit;
      }
    }

    const discrepancy = Math.abs(computedCash - this.walletBalance);
    const isReconciled = discrepancy < 0.001;

    return {
      isReconciled,
      discrepancyUsdt: +discrepancy.toFixed(6),
      ledgerEntriesCount: this.ledger.length,
    };
  }

  // --- ACCOUNT EQUITY RECALCULATION ---
  private recalculateAccountEquity() {
    let totalUnrealizedNetPnL = 0;
    let totalAllocatedMargin = 0;

    for (const pos of this.positions.values()) {
      totalUnrealizedNetPnL += pos.netPnL;
      totalAllocatedMargin += pos.margin;
    }

    this.equity = +(this.walletBalance + totalAllocatedMargin + totalUnrealizedNetPnL).toFixed(6);
    if (this.equity > this.peakEquity) {
      this.peakEquity = this.equity;
    }
  }

  private checkAndResetDailyLoss() {
    const today = new Date().getUTCDate();
    if (today !== this.dailyLossResetDay) {
      this.dailyRealizedLoss = 0;
      this.dailyLossResetDay = today;
      this.log(`[BOT 4] Daily realized loss counter reset for UTC day ${today}`, 'info');
    }
  }

  // --- STATE ACCESSORS ---
  public getPositions(): ManagedPosition[] {
    return Array.from(this.positions.values());
  }

  public getPosition(symbol: string): ManagedPosition | undefined {
    return this.positions.get(symbol);
  }

  public getOrders(): PaperOrder[] {
    return Array.from(this.orders.values());
  }

  public getOrderHistory(): PaperOrder[] {
    return [...this.orderHistory];
  }

  public getLedger(): DoubleEntryLedgerRecord[] {
    return [...this.ledger];
  }

  public getClosedTrades(): ClosedTrade[] {
    return [...this.closedTrades];
  }

  public getMetrics(): Bot4ExecutionMetrics {
    const totalAllocatedMargin = Array.from(this.positions.values()).reduce((sum, p) => sum + p.margin, 0);
    const marginUtilizationPct = this.equity > 0 ? (totalAllocatedMargin / this.equity) * 100 : 0;
    const avgLatency = this.latencyHistory.length > 0
      ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      : 12;
    const avgSlippage = this.ordersFilledCount > 0
      ? this.totalSlippageBpsSum / this.ordersFilledCount
      : this.config.baseSlippageBps;
    const maxDrawdownObserved = this.peakEquity > 0
      ? ((this.peakEquity - this.equity) / this.peakEquity) * 100
      : 0;

    const audit = this.auditLedgerConsistency();

    return {
      equity: +this.equity.toFixed(4),
      walletBalance: +this.walletBalance.toFixed(4),
      allocatedMargin: +totalAllocatedMargin.toFixed(4),
      marginUtilizationPct: +marginUtilizationPct.toFixed(2),
      openPositionsCount: this.positions.size,
      ordersSubmittedCount: this.ordersSubmittedCount,
      ordersFilledCount: this.ordersFilledCount,
      ordersPartiallyFilledCount: this.ordersPartiallyFilledCount,
      ordersRejectedCount: this.ordersRejectedCount,
      duplicatesBlockedCount: this.duplicatesBlockedCount,
      duplicateClosesBlockedCount: this.duplicateClosesBlockedCount,
      totalRealizedNetPnL: +this.totalRealizedNetPnL.toFixed(4),
      totalGrossPnL: +this.totalGrossPnL.toFixed(4),
      totalFeesPaid: +this.totalFeesPaid.toFixed(4),
      totalFundingPaid: +this.totalFundingPaid.toFixed(4),
      totalSlippageBpsAvg: +avgSlippage.toFixed(2),
      avgExecutionLatencyMs: +avgLatency.toFixed(1),
      dailyLossRecorded: +this.dailyRealizedLoss.toFixed(4),
      peakEquity: +this.peakEquity.toFixed(4),
      maxDrawdownObservedPct: +maxDrawdownObserved.toFixed(2),
      isKillSwitchActive: this.isKillSwitchActive,
      killSwitchReason: this.killSwitchReason,
      isDataReliabilityHalted: this.isDataReliabilityHalted,
      lastHeartbeatTime: this.lastHeartbeatTime,
      lastAuditResult: audit,
    };
  }

  // Reset balance and state for testing / re-initialization
  public resetAccount(newBalance: number = 10.0) {
    this.positions.clear();
    this.orders.clear();
    this.orderHistory = [];
    this.ledger = [];
    this.closedTrades = [];
    this.idempotencyKeys.clear();
    this.walletBalance = newBalance;
    this.equity = newBalance;
    this.peakEquity = newBalance;
    this.dailyRealizedLoss = 0;
    this.isKillSwitchActive = false;
    this.killSwitchReason = undefined;
    this.ordersSubmittedCount = 0;
    this.ordersFilledCount = 0;
    this.ordersPartiallyFilledCount = 0;
    this.ordersRejectedCount = 0;
    this.duplicatesBlockedCount = 0;
    this.duplicateClosesBlockedCount = 0;
    this.totalRealizedNetPnL = 0;
    this.totalGrossPnL = 0;
    this.totalFeesPaid = 0;
    this.totalFundingPaid = 0;
    this.totalSlippageBpsSum = 0;

    this.recordLedgerEntry({
      type: 'INITIAL_CAPITAL',
      debit: 0,
      credit: newBalance,
      description: `Account reset with $${newBalance.toFixed(4)} USDT Paper Capital`,
    });
  }

  // Synchronize state from storage on server reboot
  public syncFromStoredState(storedPositions: ManagedPosition[], storedClosedTrades: ClosedTrade[], balance: number) {
    this.positions.clear();
    for (const p of storedPositions) {
      this.positions.set(p.symbol, { ...p, closingInProgress: false });
    }
    this.closedTrades = [...storedClosedTrades];
    this.walletBalance = balance;
    this.recalculateAccountEquity();
  }

  /**
   * BOT 4 PRIMARY PIPELINE METHOD: bot4_executeOrders
   * Independently receives verified signal from Bot 3 ->
   * Enforces risk checks, allocates target 2.0 USDT margin at configured leverage,
   * simulates order fill with real-world friction ->
   * Sets up real-time net-profit monitoring & exit ->
   * Returns execution payload
   */
  public bot4_executeOrders(
    signalPayload: Bot3SignalNetTPPayload,
    ticker: TickerData
  ): Bot4ExecutionPayload {
    if (signalPayload.action === 'NO_TRADE' || !signalPayload.signal) {
      return {
        stage: 'BOT4_EXECUTE_ORDERS',
        timestamp: Date.now(),
        actionType: 'ORDER_BLOCKED',
        symbol: signalPayload.symbol,
        marginUsdt: 0,
        leverage: this.config.maxLeverage,
        notionalUsdt: 0,
        openFeeUsdt: 0,
        rejectReason: signalPayload.rejectionReason || 'No trade action from Bot 3',
      };
    }

    const execResult = this.executeSignal(signalPayload.signal, ticker);

    if (!execResult.success || !execResult.position) {
      return {
        stage: 'BOT4_EXECUTE_ORDERS',
        timestamp: Date.now(),
        actionType: 'ORDER_BLOCKED',
        symbol: signalPayload.symbol,
        marginUsdt: this.config.targetMarginPerPosition,
        leverage: this.config.maxLeverage,
        notionalUsdt: this.config.targetMarginPerPosition * this.config.maxLeverage,
        openFeeUsdt: 0,
        rejectReason: execResult.rejectReason || 'Execution capacity or risk limits reached',
      };
    }

    const pos = execResult.position;
    return {
      stage: 'BOT4_EXECUTE_ORDERS',
      timestamp: Date.now(),
      actionType: 'ORDER_OPENED',
      symbol: pos.symbol,
      orderId: execResult.order?.orderId,
      positionId: pos.id,
      marginUsdt: pos.margin,
      leverage: pos.leverage,
      notionalUsdt: +(pos.amount * pos.entryPrice).toFixed(4),
      openFeeUsdt: pos.openFee,
      openPosition: pos,
    };
  }
}

export const bot4ExecutionManager = new Bot4ExecutionManager();
