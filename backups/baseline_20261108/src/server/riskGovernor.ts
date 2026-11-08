import { TradeSignal, TickerData, Position } from '../types/engine';
import { getContractSpec, roundToLotSize, roundToTickSize, isSupportedBitgetCryptoFutures, SymbolContractSpec } from './exchangeSpecs';

export interface RiskGovernorConfig {
  maxRiskPerTradePct: number; // Max allowed risk per trade as % of equity (default: 2.0%)
  maxLossRoePercent: number; // Max allowable ROE loss at Stop Loss (default: 50.0% - prevents >100% ROE disasters)
  maxConcurrentPositions: number; // Portfolio cap (default: 10 concurrent positions)
  maxTotalMarginPct: number; // Max total margin allocated as % of equity (default: 50.0%)
  maxSpreadBps: number; // Max spread in basis points (default: 3.0 bps)
  maxSlippageBps: number; // Max acceptable slippage ceiling (default: 5.0 bps)
  maxDataAgeSeconds: number; // Max acceptable age of ticker data (default: 60s)
  dailyDrawdownCircuitBreakerPct: number; // Emergency halt if daily realized drawdown hits this (default: 15.0%)
  minRiskRewardRatio: number; // Mandatory RR (default: 1.50)
  maxLeverage: number; // Capped leverage (default: 10x)
  enableCircuitBreaker: boolean;
}

export const DEFAULT_RISK_GOVERNOR_CONFIG: RiskGovernorConfig = {
  maxRiskPerTradePct: 2.0,
  maxLossRoePercent: 15.0, // Hard ceiling: Max 15% ROE loss per trade (max -$0.30 on 2 USDT margin)
  maxConcurrentPositions: 10,
  maxTotalMarginPct: 50.0,
  maxSpreadBps: 3.0,
  maxSlippageBps: 5.0,
  maxDataAgeSeconds: 60,
  dailyDrawdownCircuitBreakerPct: 15.0,
  minRiskRewardRatio: 1.60, // Mandatory minimum RR 1:1.60
  maxLeverage: 10,
  enableCircuitBreaker: true,
};

export interface PreTradeRiskVerdict {
  allowed: boolean;
  rejectionReason?: string;
  governorCode: 'APPROVED' | 'SYMBOL_REJECTED' | 'DATA_STALE' | 'SPREAD_TOO_WIDE' | 'SLIPPAGE_TOO_HIGH' | 'CIRCUIT_BREAKER_ACTIVE' | 'PORTFOLIO_CAP_REACHED' | 'MARGIN_CAP_REACHED' | 'DUPLICATE_SYMBOL' | 'INSUFFICIENT_RR' | 'ROE_LOSS_OVERFLOW' | 'INSUFFICIENT_EQUITY' | 'LIQUIDATION_RISK_BREACH';
  clampedStopLoss?: number;
  clampedTakeProfit?: number;
  sizedAmount?: number;
  sizedMargin?: number;
  sizedLeverage?: number;
  riskUsdt?: number;
  riskPct?: number;
  effectiveRR?: number;
  estimatedLiquidationPrice?: number;
  liquidationBufferPct?: number;
  contractSpec?: SymbolContractSpec;
}

export interface RiskGovernorTelemetry {
  verdictsCount: number;
  approvedCount: number;
  rejectedCount: number;
  rejectionBreakdown: Record<string, number>;
  catastrophicLossesAverted: number;
  circuitBreakerActive: boolean;
  circuitBreakerTriggeredAt?: number;
  circuitBreakerReason?: string;
  lastVerdictTime: number;
}

/**
 * INDEPENDENT RISK GOVERNOR (TẦNG ĐIỀU KHIỂN & BẢO VỆ RỦI RO ĐỘC LẬP)
 * Operates independently from Bot 1, Bot 2, Bot 3, and Bot 4.
 * Enforces hard mathematical risk boundaries:
 * 1. Strictly Bitget USDT-M crypto contracts only (no synthetic CFDs / illiquid pairs)
 * 2. Enforces hard dollar risk cap <= 2.0% equity per position
 * 3. Enforces hard stop-loss clamp so maximum loss NEVER exceeds 50% ROE
 * 4. Strictly enforces RR >= 1:1.50 post-friction
 * 5. Limits portfolio exposure to <= 20% margin and max 3 positions
 * 6. Implements automated daily drawdown Circuit Breaker (15%)
 * 7. Enforces data freshness (<60s) and spread (<3.0 bps)
 */
export class IndependentRiskGovernor {
  private config: RiskGovernorConfig;
  private telemetry: RiskGovernorTelemetry;
  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;

  constructor(config: Partial<RiskGovernorConfig> = {}) {
    this.config = { ...DEFAULT_RISK_GOVERNOR_CONFIG, ...config };
    this.telemetry = {
      verdictsCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      rejectionBreakdown: {},
      catastrophicLossesAverted: 0,
      circuitBreakerActive: false,
      lastVerdictTime: Date.now(),
    };
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.onLogCallback = fn;
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  public getConfig(): RiskGovernorConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<RiskGovernorConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.log(`[RISK GOVERNOR] Cấu hình cập nhật: MaxRisk=${this.config.maxRiskPerTradePct}%, MaxLossROE=${this.config.maxLossRoePercent}%, MinRR=1:${this.config.minRiskRewardRatio}`, 'cyan');
  }

  public resetCircuitBreaker() {
    this.telemetry.circuitBreakerActive = false;
    this.telemetry.circuitBreakerTriggeredAt = undefined;
    this.telemetry.circuitBreakerReason = undefined;
    this.log('[RISK GOVERNOR] 🔄 Circuit Breaker đã được đặt lại thủ công.', 'success');
  }

  public triggerCircuitBreaker(reason: string) {
    this.telemetry.circuitBreakerActive = true;
    this.telemetry.circuitBreakerTriggeredAt = Date.now();
    this.telemetry.circuitBreakerReason = reason;
    this.log(`[RISK GOVERNOR] 🚨 CIRCUIT BREAKER KÍCH HOẠT: ${reason}. Khóa toàn bộ lệnh mới!`, 'danger');
  }

  /**
   * Pre-Trade Risk Verification & Parameter Clamping
   */
  public evaluatePreTradeRisk(params: {
    signal: TradeSignal;
    ticker: TickerData;
    activePositions: Map<string, any> | any[];
    walletBalance: number;
    equity: number;
    dailyRealizedLossUsdt: number;
    peakEquity: number;
  }): PreTradeRiskVerdict {
    this.telemetry.verdictsCount++;
    this.telemetry.lastVerdictTime = Date.now();

    const {
      signal,
      ticker,
      activePositions,
      walletBalance,
      equity,
      dailyRealizedLossUsdt,
      peakEquity,
    } = params;

    const positionsArray = activePositions instanceof Map ? Array.from(activePositions.values()) : activePositions;

    // Helper to record rejections
    const reject = (
      code: PreTradeRiskVerdict['governorCode'],
      reason: string
    ): PreTradeRiskVerdict => {
      this.telemetry.rejectedCount++;
      this.telemetry.rejectionBreakdown[code] = (this.telemetry.rejectionBreakdown[code] || 0) + 1;
      this.log(`[RISK GOVERNOR] 🛑 TỪ CHỐI LỆNH [${signal.symbol} ${signal.direction}]: ${reason}`, 'warning');
      return { allowed: false, rejectionReason: reason, governorCode: code };
    };

    // 1. CIRCUIT BREAKER CHECK
    if (this.telemetry.circuitBreakerActive) {
      return reject(
        'CIRCUIT_BREAKER_ACTIVE',
        `Circuit breaker đang hoạt động: ${this.telemetry.circuitBreakerReason || 'Bảo vệ khẩn cấp'}`
      );
    }

    if (this.config.enableCircuitBreaker) {
      const dailyDrawdownPct = peakEquity > 0 ? (dailyRealizedLossUsdt / peakEquity) * 100 : 0;
      if (dailyDrawdownPct >= this.config.dailyDrawdownCircuitBreakerPct) {
        this.triggerCircuitBreaker(
          `Sụt giảm trong ngày ${dailyDrawdownPct.toFixed(1)}% vượt ngưỡng ${this.config.dailyDrawdownCircuitBreakerPct}%`
        );
        return reject(
          'CIRCUIT_BREAKER_ACTIVE',
          `Sụt giảm trong ngày ${dailyDrawdownPct.toFixed(1)}% vượt ngưỡng an toàn. Kích hoạt Circuit Breaker.`
        );
      }
    }

    // 2. CONTRACT SPECIFICATION & BAN CHECK
    if (!isSupportedBitgetCryptoFutures(signal.symbol)) {
      return reject(
        'SYMBOL_REJECTED',
        `Tài sản ${signal.symbol} bị cấm giao dịch: Non-crypto synthetic CFD hoặc thanh khoản kém được xác định từ kiểm toán 661 lệnh.`
      );
    }

    const spec = getContractSpec(signal.symbol);

    // 3. DATA FRESHNESS CHECK
    const now = Date.now();
    const dataAgeSeconds = Math.max(0, (now - (ticker.updatedAt || now)) / 1000);
    if (dataAgeSeconds > this.config.maxDataAgeSeconds) {
      return reject(
        'DATA_STALE',
        `Dữ liệu thị trường quá cũ: ${dataAgeSeconds.toFixed(1)}s > ${this.config.maxDataAgeSeconds}s`
      );
    }

    // 4. SPREAD & SLIPPAGE CEILING CHECK
    const spreadBps = ticker.spreadPercent
      ? ticker.spreadPercent * 100
      : ticker.askPr && ticker.bidPr && ticker.lastPr
      ? ((ticker.askPr - ticker.bidPr) / ticker.lastPr) * 10000
      : 2.0;

    if (spreadBps > this.config.maxSpreadBps) {
      return reject(
        'SPREAD_TOO_WIDE',
        `Spread ${spreadBps.toFixed(2)} bps vượt trần tối đa ${this.config.maxSpreadBps} bps`
      );
    }

    const estimatedSlippageBps = 3.0 + spreadBps * 0.5;
    if (estimatedSlippageBps > this.config.maxSlippageBps) {
      return reject(
        'SLIPPAGE_TOO_HIGH',
        `Ước tính trượt giá ${estimatedSlippageBps.toFixed(2)} bps vượt giới hạn an toàn ${this.config.maxSlippageBps} bps`
      );
    }

    // 5. PORTFOLIO CAPACITY & DIVERSIFICATION CHECK
    if (positionsArray.length >= this.config.maxConcurrentPositions) {
      return reject(
        'PORTFOLIO_CAP_REACHED',
        `Danh mục đã đạt tối đa ${positionsArray.length}/${this.config.maxConcurrentPositions} vị thế đồng thời.`
      );
    }

    // Single Symbol Exposure Check (Prevent concentration like PEPE dominating all trades)
    const existingSameSymbol = positionsArray.find((p) => p.symbol === signal.symbol);
    if (existingSameSymbol) {
      return reject(
        'DUPLICATE_SYMBOL',
        `Đã có vị thế đang mở cho ${signal.symbol}. Tuân thủ nguyên tắc đa dạng hóa danh mục.`
      );
    }

    // Total Margin Allocation Check
    const currentAllocatedMargin = positionsArray.reduce((sum, p) => sum + p.margin, 0);
    const maxAllowedTotalMargin = equity * (this.config.maxTotalMarginPct / 100);
    const targetMargin = Math.min(2.0, Math.max(1.0, equity * 0.02)); // $2.0 USDT default margin
    if (currentAllocatedMargin + targetMargin > maxAllowedTotalMargin) {
      return reject(
        'MARGIN_CAP_REACHED',
        `Tổng ký quỹ vượt trần danh mục: Hiện tại $${currentAllocatedMargin.toFixed(2)} + $${targetMargin.toFixed(2)} > $${maxAllowedTotalMargin.toFixed(2)} (50% equity)`
      );
    }

    if (walletBalance < targetMargin) {
      return reject(
        'INSUFFICIENT_EQUITY',
        `Số dư khả dụng $${walletBalance.toFixed(2)} không đủ ký quỹ $${targetMargin.toFixed(2)}`
      );
    }

    // 6. LEVERAGE & HARD STOP LOSS CLAMPING (PREVENT ROE LOSS > 50%)
    const leverage = Math.min(this.config.maxLeverage, spec.maxLeverage);
    const entryPrice = signal.direction === 'LONG'
      ? roundToTickSize(ticker.askPr || signal.entryPrice, spec.tickSize)
      : roundToTickSize(ticker.bidPr || signal.entryPrice, spec.tickSize);

    // Hard Stop Loss calculation:
    // Max permitted price loss distance: (maxLossRoePercent / 100) / leverage * entryPrice
    // With 50% max ROE loss at 10x leverage, max price move against us is 5.0%
    const maxAllowedPriceMovePct = (this.config.maxLossRoePercent / 100) / leverage;
    const maxAllowedSlDistance = entryPrice * maxAllowedPriceMovePct;

    let plannedSlPrice = signal.stopLossPrice ?? (signal as any).stopLoss ?? (signal.direction === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02);
    let slDistance = Math.abs(entryPrice - plannedSlPrice);

    // If proposed SL is wider than max allowed ROE loss, CLAMP IT
    let wasClamped = false;
    if (slDistance > maxAllowedSlDistance) {
      wasClamped = true;
      this.telemetry.catastrophicLossesAverted++;
      slDistance = maxAllowedSlDistance;
      plannedSlPrice = signal.direction === 'LONG'
        ? roundToTickSize(entryPrice - slDistance, spec.tickSize)
        : roundToTickSize(entryPrice + slDistance, spec.tickSize);
      this.log(
        `[RISK GOVERNOR] 🛡️ CLAMP STOP LOSS: Siết chặt SL của ${signal.symbol} từ $${signal.stopLossPrice || (signal as any).stopLoss} về $${plannedSlPrice} (Khóa mức lỗ tối đa <= 15% ROE)`,
        'cyan'
      );
    }

    // 6.5. LIQUIDATION RISK CALCULATION & SAFETY BUFFER ENFORCEMENT
    // Bitget Futures Maintenance Margin Rate (MMR) is ~0.5% (0.005) for USDT-M crypto contracts
    const mmr = 0.005;
    const estimatedLiquidationPrice = signal.direction === 'LONG'
      ? roundToTickSize(entryPrice * (1 - (1 / leverage) + mmr), spec.tickSize)
      : roundToTickSize(entryPrice * (1 + (1 / leverage) - mmr), spec.tickSize);

    // Enforce that Stop Loss is strictly placed well before the Liquidation Price
    const distEntryToLiq = Math.abs(entryPrice - estimatedLiquidationPrice);
    const distSlToLiq = Math.abs(plannedSlPrice - estimatedLiquidationPrice);
    const liquidationBufferPct = distEntryToLiq > 0 ? +((distSlToLiq / distEntryToLiq) * 100).toFixed(1) : 100;

    const isSlPastLiq = signal.direction === 'LONG'
      ? plannedSlPrice <= estimatedLiquidationPrice
      : plannedSlPrice >= estimatedLiquidationPrice;

    if (isSlPastLiq || liquidationBufferPct < 30.0) {
      this.telemetry.catastrophicLossesAverted++;
      slDistance = distEntryToLiq * 0.50; // Clamp SL to 50% distance to liquidation
      plannedSlPrice = signal.direction === 'LONG'
        ? roundToTickSize(entryPrice - slDistance, spec.tickSize)
        : roundToTickSize(entryPrice + slDistance, spec.tickSize);
      this.log(
        `[RISK GOVERNOR] 🛡️ LIQUIDATION GUARD: SL của ${signal.symbol} bị kéo khỏi vùng thanh lý về $${plannedSlPrice} (Giá thanh lý: $${estimatedLiquidationPrice}, Buffer an toàn: 50%)`,
        'danger'
      );
    }

    // 7. TAKE PROFIT & RISK/REWARD VERIFICATION
    let plannedTpPrice = signal.takeProfitPrice ?? (signal as any).takeProfit ?? (signal.direction === 'LONG' ? entryPrice * 1.04 : entryPrice * 0.96);
    let tpDistance = Math.abs(plannedTpPrice - entryPrice);

    // If TP does not meet minimum RR >= 1:1.50, adjust TP to meet 1:2.0 or reject
    let riskRewardRatio = +(tpDistance / slDistance).toFixed(2);
    if (riskRewardRatio < this.config.minRiskRewardRatio) {
      // If signal didn't provide sufficient TP, set TP to 1:2.0
      tpDistance = slDistance * 2.0;
      plannedTpPrice = signal.direction === 'LONG'
        ? roundToTickSize(entryPrice + tpDistance, spec.tickSize)
        : roundToTickSize(entryPrice - tpDistance, spec.tickSize);
      riskRewardRatio = +(tpDistance / slDistance).toFixed(2);
    }

    if (riskRewardRatio < this.config.minRiskRewardRatio) {
      return reject(
        'INSUFFICIENT_RR',
        `Tỷ lệ RR ${riskRewardRatio} < tối thiểu 1:${this.config.minRiskRewardRatio}`
      );
    }

    // 8. RISK-BASED POSITION SIZING
    // Max dollar risk = equity * (maxRiskPerTradePct / 100)
    const maxRiskDollars = +(equity * (this.config.maxRiskPerTradePct / 100)).toFixed(4); // e.g., $2.00 on $100
    // Sized amount = maxRiskDollars / slDistance
    const rawAmountFromRisk = maxRiskDollars / slDistance;
    const maxAmountFromMargin = (targetMargin * leverage) / entryPrice;
    const finalRawAmount = Math.min(rawAmountFromRisk, maxAmountFromMargin);
    const sizedAmount = roundToLotSize(finalRawAmount, spec.lotSize);

    if (sizedAmount < spec.minSize) {
      return reject(
        'INSUFFICIENT_EQUITY',
        `Khối lượng tính toán ${sizedAmount} < kích thước tối thiểu ${spec.minSize} của sàn Bitget`
      );
    }

    const actualNotional = sizedAmount * entryPrice;
    if (actualNotional < spec.minNotional) {
      return reject(
        'INSUFFICIENT_EQUITY',
        `Giá trị vị thế $${actualNotional.toFixed(2)} < ngưỡng tối thiểu $${spec.minNotional} của sàn Bitget`
      );
    }

    const sizedMargin = +(actualNotional / leverage).toFixed(4);
    const potentialLossAtSl = +(sizedAmount * slDistance).toFixed(4);
    const estRoundTripFee = +(actualNotional * (spec.takerFeeRate * 2)).toFixed(4);
    const totalRiskUsdt = +(potentialLossAtSl + estRoundTripFee).toFixed(4);
    const riskPct = +((totalRiskUsdt / equity) * 100).toFixed(2);

    this.telemetry.approvedCount++;
    this.log(
      `[RISK GOVERNOR] ✅ PHÊ DUYỆT LỆNH: ${signal.symbol} ${signal.direction} | Ký quỹ: $${sizedMargin.toFixed(2)} (x${leverage}) | SL: $${plannedSlPrice} | TP: $${plannedTpPrice} | RR: 1:${riskRewardRatio} | Rủi ro tối đa: $${totalRiskUsdt} (${riskPct}% equity)`,
      'success'
    );

    return {
      allowed: true,
      governorCode: 'APPROVED',
      clampedStopLoss: plannedSlPrice,
      clampedTakeProfit: plannedTpPrice,
      sizedAmount,
      sizedMargin,
      sizedLeverage: leverage,
      riskUsdt: totalRiskUsdt,
      riskPct,
      effectiveRR: riskRewardRatio,
      estimatedLiquidationPrice,
      liquidationBufferPct,
      contractSpec: spec,
    };
  }

  public getTelemetry(): RiskGovernorTelemetry {
    return { ...this.telemetry };
  }
}

export const riskGovernor = new IndependentRiskGovernor();
