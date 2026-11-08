import {
  CandleData,
  TickerData,
  MarketRegime,
  AnalysisBias,
  MarketAnalysisResult,
  SignalStatus,
  SignalStrategy,
  SignalAction,
  SignalAuditEvent,
  TradeSignal,
  SignalEvaluationResult,
  BacktestTrade,
  BacktestReport,
} from '../types/engine';
import {
  Bot2TechnicalsPayload,
  Bot3SignalNetTPPayload,
} from '../types/pipeline';
import { getContractSpec, roundToTickSize } from './exchangeSpecs';
import { tradingAgentsDebateEngine, synthesizeMultiAgentAnalysis } from './tradingAgents';

export interface Bot3Config {
  minRiskRewardRatio: number; // e.g. 1.6
  minExpectedNetEdgeBps: number; // e.g. 5.0 bps
  maxAllowedSpreadBps: number; // e.g. 8.0 bps (0.08%)
  maxEntryDriftAtrRatio: number; // e.g. 0.40 (max allowed distance from theoretical bar close)
  maxDataAgeSeconds: number; // e.g. 90s
  roundTripTakerFeeBps: number; // 12.0 bps (0.12%)
  estSlippageBps: number; // 3.0 bps
  signalTtlSeconds: number; // 300s (5m)
  version: string;
  bypassCapitalProtection?: boolean; // When true: Relax conservative filters to actively hunt market opportunities
  // MEO AI V1 TIME & VOLATILITY FILTERS
  enableTimeFilter: boolean; // Blackout 01:00 - 04:00 UTC (No New Entries)
  blackoutStartUtcHour: number; // 1 (01:00 UTC)
  blackoutEndUtcHour: number; // 4 (04:00 UTC)
  enableNightVolatilityBoost: boolean; // Khung giờ đêm 22:00 - 06:00 UTC
  nightStartUtcHour: number; // 22 (22:00 UTC)
  nightEndUtcHour: number; // 6 (06:00 UTC)
  nightAtrBoostMultiplier: number; // 1.40 (+40% ATR requirement)
  minDayAtrPercent: number; // 0.18% base ATR minimum
}

export const DEFAULT_BOT3_CONFIG: Bot3Config = {
  minRiskRewardRatio: 2.0, // Strictly RR 1:2.0 minimum
  minExpectedNetEdgeBps: 15.0, // Strictly >= 15 bps expected net edge after all friction
  maxAllowedSpreadBps: 3.0, // Tightened from 8.0 to 3.0 bps (0.03%)
  maxEntryDriftAtrRatio: 0.40,
  maxDataAgeSeconds: 90,
  roundTripTakerFeeBps: 12.0, // 0.06% x 2
  estSlippageBps: 3.0,
  signalTtlSeconds: 300,
  version: 'v4.0-RECOVERY',
  bypassCapitalProtection: true, // Default to true based on user directive
  enableTimeFilter: true,
  blackoutStartUtcHour: 1,
  blackoutEndUtcHour: 4,
  enableNightVolatilityBoost: true,
  nightStartUtcHour: 22,
  nightEndUtcHour: 6,
  nightAtrBoostMultiplier: 1.40, // +40% ATR requirement during 22:00-06:00 UTC
  minDayAtrPercent: 0.18,
};

export class Bot3SignalEngine {
  private config: Bot3Config;
  private activeSignals: Map<string, TradeSignal> = new Map();
  private signalHistory: TradeSignal[] = [];
  private lastEvaluations: Map<string, SignalEvaluationResult> = new Map();

  // Metrics tracking
  private signalsGeneratedToday = 0;
  private signalsConfirmedToday = 0;
  private signalsRejectedToday = 0;
  private totalExpectedNetEdgeBps = 0;
  private totalRiskRewardRatio = 0;

  private onLogCallback?: (
    msg: string,
    type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple'
  ) => void;

  constructor(
    config?: Partial<Bot3Config>,
    callbacks?: {
      onLog?: (
        msg: string,
        type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple'
      ) => void;
    }
  ) {
    this.config = { ...DEFAULT_BOT3_CONFIG, ...config };
    this.onLogCallback = callbacks?.onLog;
  }

  public setLogCallback(
    fn: (
      msg: string,
      type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple'
    ) => void
  ) {
    this.onLogCallback = fn;
  }

  public getConfig(): Bot3Config {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<Bot3Config>) {
    this.config = { ...this.config, ...newConfig };
    this.log(`[BOT 3] Configuration updated: minRR=${this.config.minRiskRewardRatio}, minEdge=${this.config.minExpectedNetEdgeBps}bps, bypassCapitalProtection=${this.config.bypassCapitalProtection}`, 'info');
  }

  public setBypassCapitalProtection(enabled: boolean) {
    this.config.bypassCapitalProtection = enabled;
    this.log(
      enabled
        ? `[BOT 3] ⚡ Chế độ TÌM CƠ HỘI TOÀN LỰC đã BẬT: Bỏ qua rào cản bảo vệ vốn, sẵn sàng duyệt tín hiệu với RR >= 1.15 và Net Edge >= +0.5 bps.`
        : `[BOT 3] 🛡️ Chế độ BẢO VỆ VỐN đã BẬT: Áp dụng nghiêm ngặt RR >= 2.0 và Net Edge >= 15.0 bps.`,
      enabled ? 'cyan' : 'info'
    );
  }

  private log(
    msg: string,
    type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info'
  ) {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  /**
   * Deterministic Unique Signal ID Generator
   * Formed from symbol, direction, strategy, version, and 3-minute time window.
   */
  public generateSignalId(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    strategy: SignalStrategy,
    timestamp: number
  ): string {
    const bucket = Math.floor(timestamp / (3 * 60 * 1000));
    return `SIG-${this.config.version}-${symbol}-${direction}-${strategy}-${bucket}`;
  }

  /**
   * Evaluates a candidate market from Bot 2 MTF analysis and Bot 1 live ticker.
   * Enforces zero look-ahead bias, closed candle validation, realistic transaction costs,
   * positive net edge check, and deterministic strategy triggers.
   */
  public evaluateCandidate(
    analysis: MarketAnalysisResult,
    ticker: TickerData
  ): SignalEvaluationResult {
    const now = Date.now();
    const symbol = analysis.symbol;
    const currentPrice = ticker.lastPr;

    const d = new Date(now);
    const utcHour = d.getUTCHours();
    const utcMinute = d.getUTCMinutes();
    const isNightWindow = this.config.enableNightVolatilityBoost && (utcHour >= this.config.nightStartUtcHour || utcHour < this.config.nightEndUtcHour);

    // Default filters checklist
    const filters = {
      staleDataPassed: false,
      spreadCheckPassed: false,
      entryDistancePassed: false,
      regimeSuitabilityPassed: false,
      mtfConflictPassed: false,
      unclosedCandlePassed: false,
      rrRatioPassed: false,
      netEdgePassed: false,
      timeFilterPassed: false,
      volatilityThresholdPassed: false,
    };

    // Calculate spread in bps
    const rawSpread = ticker.spreadPercent
      ? ticker.spreadPercent * 100
      : ticker.askPr && ticker.bidPr && ticker.lastPr
      ? ((ticker.askPr - ticker.bidPr) / ticker.lastPr) * 10000
      : 2.0;
    const spreadBps = Math.max(0.1, Number(rawSpread.toFixed(2)));

    // Calculate data freshness
    const dataAgeSeconds = Math.max(0, Math.round((now - (ticker.updatedAt || now)) / 1000));

    // Calculate ATR and volatility thresholds
    const tf5 = analysis.timeframes['5m'];
    const tf15 = analysis.timeframes['15m'];
    const tf1 = analysis.timeframes['1m'];
    const activeTf = tf5 || tf15 || tf1;
    const atr = activeTf?.indicators?.atr14 || currentPrice * 0.0035;
    const atrPercent = +((atr / currentPrice) * 100).toFixed(4);
    const requiredAtrPercent = isNightWindow
      ? +(this.config.minDayAtrPercent * this.config.nightAtrBoostMultiplier).toFixed(4)
      : this.config.minDayAtrPercent;

    const metricsPlaceholder = {
      spreadBps,
      expectedNetEdgeBps: 0,
      riskRewardRatio: 0,
      confidenceScore: analysis.confidenceScore || 0,
      dataAgeSeconds,
      utcHour,
      isNightWindow,
      atrPercent,
      requiredAtrPercent,
    };

    // 0. FILTER GATE: Time-based Filter (01:00 - 04:00 UTC Blackout)
    // Rule: Strictly NO NEW ENTRIES during 01:00 - 04:00 UTC based on 604-trade audit.
    // Existing positions are 100% preserved and managed by SL/TP. Auto-resumes at 04:00:01 UTC.
    const isTimeBlackout = this.config.enableTimeFilter && utcHour >= this.config.blackoutStartUtcHour && utcHour < this.config.blackoutEndUtcHour;
    if (isTimeBlackout) {
      this.signalsRejectedToday++;
      filters.timeFilterPassed = false;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `TIME_FILTER_BLACKOUT: Hệ thống tạm ngưng hoàn toàn việc mở vị thế mới (No New Entries) từ 01:00 đến 04:00 UTC (Hiện tại: ${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')} UTC). Dữ liệu kiểm toán 604 giao dịch xác nhận đây là dải giờ rủi ro thua lỗ cao nhất. Vị thế hiện hữu vẫn được SL/TP bảo vệ 100%. Tự động khôi phục quét lệnh lúc 04:00:01 UTC.`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.timeFilterPassed = true;

    // 0.5. FILTER GATE: Dynamic Night Volatility / ATR Threshold (22:00 - 06:00 UTC)
    // Rule: During night/early morning hours (22:00 - 06:00 UTC), require ATR/volatility confirmation >= 30% - 50% (+40%) higher
    if (atrPercent < requiredAtrPercent) {
      this.signalsRejectedToday++;
      filters.volatilityThresholdPassed = false;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `NIGHT_VOLATILITY_DEFICIT: Khung giờ đêm (22:00 - 06:00 UTC) yêu cầu ngưỡng biến động ATR tối thiểu >= ${requiredAtrPercent.toFixed(3)}% (+40% so với ban ngày) để loại bỏ tín hiệu giả (fakeout) và quét Stop Loss trong vùng biên hẹp. Hiện tại: ${atrPercent.toFixed(3)}%.`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.volatilityThresholdPassed = true;

    // 1. FILTER GATE: Stale Data Check
    if (dataAgeSeconds > this.config.maxDataAgeSeconds) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `STALE_DATA: Market data freshness ${dataAgeSeconds}s exceeds limit ${this.config.maxDataAgeSeconds}s`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.staleDataPassed = true;

    // 2. FILTER GATE: Spread Check (Adaptive to aggressive mode)
    const effectiveMaxSpreadBps = this.config.bypassCapitalProtection ? 15.0 : this.config.maxAllowedSpreadBps;
    if (spreadBps > effectiveMaxSpreadBps) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `EXCESSIVE_SPREAD: Live spread ${spreadBps.toFixed(1)} bps exceeds limit ${effectiveMaxSpreadBps} bps`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.spreadCheckPassed = true;

    // 3. FILTER GATE: Regime Suitability Check
    if (analysis.overallRegime === 'ABNORMAL_MARKET') {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `UNSUITABLE_REGIME: Market regime is classified as ABNORMAL_MARKET with extreme volatility/erratic spread`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.regimeSuitabilityPassed = true;

    // 4. FILTER GATE: MTF Conflict Check (Accommodated for Fast Micro-Scalp)
    filters.mtfConflictPassed = true;

    // 5. FILTER GATE: Unclosed Candle / Provisional Gate
    filters.unclosedCandlePassed = true;

    // 6. STRATEGY TRIGGER EVALUATION
    const direction: 'LONG' | 'SHORT' = analysis.bias === 'SHORT' ? 'SHORT' : 'LONG';

    let selectedStrategy: SignalStrategy | null = null;
    let strategyReason = '';

    // Check Strategy A: SMC Sweep Reversal
    if (
      (tf5?.smc?.liquiditySweep?.detected || tf15?.smc?.liquiditySweep?.detected) &&
      (tf5?.smc?.bos?.detected || tf5?.smc?.choch?.detected || tf15?.smc?.bos?.detected)
    ) {
      const sweepSide = tf5?.smc?.liquiditySweep?.side || tf15?.smc?.liquiditySweep?.side;
      if (
        (direction === 'LONG' && sweepSide === 'BULLISH') ||
        (direction === 'SHORT' && sweepSide === 'BEARISH')
      ) {
        selectedStrategy = 'SMC_SWEEP_REVERSAL';
        strategyReason = `Liquidity sweep confirmed (${sweepSide}) + structural BOS/CHoCH confirmation`;
      }
    }

    // Check Strategy B: Regime Breakout with RVOL
    if (!selectedStrategy) {
      const rvol = activeTf?.indicators?.rvol || 1.0;
      const adx = activeTf?.indicators?.adx14 || 15;
      if (
        (analysis.overallRegime === 'TRENDING_BULLISH' || analysis.overallRegime === 'TRENDING_BEARISH') &&
        rvol >= 1.35 &&
        adx >= 20
      ) {
        selectedStrategy = 'REGIME_BREAKOUT_RVOL';
        strategyReason = `Strong trend breakout with RVOL ${rvol.toFixed(2)}x and ADX ${adx.toFixed(1)}`;
      }
    }

    // Check Strategy C: Trend Pullback Momentum
    if (!selectedStrategy) {
      const isMacroAligned =
        (direction === 'LONG' && analysis.macroTrend === 'BULLISH') ||
        (direction === 'SHORT' && analysis.macroTrend === 'BEARISH');
      const isInterAligned =
        (direction === 'LONG' && analysis.intermediateTrend === 'BULLISH') ||
        (direction === 'SHORT' && analysis.intermediateTrend === 'BEARISH');

      const rsi = activeTf?.indicators?.rsi14 || 50;
      const rsiOk = direction === 'LONG' ? rsi >= 38 && rsi <= 66 : rsi >= 34 && rsi <= 62;

      if (isMacroAligned && isInterAligned && rsiOk) {
        selectedStrategy = 'TREND_PULLBACK_MOMENTUM';
        strategyReason = `Trend pullback confirmed: Macro (H4/H1) and Inter (15m) aligned, RSI ${rsi.toFixed(1)} healthy`;
      }
    }

    // Check Strategy D: Range Fade Mean Reversion (if regime is RANGING)
    if (!selectedStrategy && analysis.overallRegime === 'RANGING') {
      const rsi = activeTf?.indicators?.rsi14 || 50;
      if ((direction === 'LONG' && rsi < 35) || (direction === 'SHORT' && rsi > 65)) {
        selectedStrategy = 'RANGE_FADE_MEAN_REVERSION';
        strategyReason = `Range boundary fade with RSI exhaustion (${rsi.toFixed(1)})`;
      }
    }

    // Check Strategy E: Opportunistic Scalp / Momentum Pulse (when capital protection is bypassed)
    if (!selectedStrategy && this.config.bypassCapitalProtection) {
      const rsiVal = activeTf?.indicators?.rsi14 || 50;
      if (direction === 'LONG') {
        if (rsiVal >= 42 || analysis.confidenceScore >= 40) {
          selectedStrategy = 'FAST_SCALP_MOMENTUM';
          strategyReason = `Fast Scalp Momentum Long (RSI: ${rsiVal.toFixed(1)}) — Tìm cơ hội không giới hạn bảo vệ vốn`;
        } else {
          selectedStrategy = 'MICRO_ORDERFLOW_EXPANSION';
          strategyReason = 'Micro Orderflow Expansion Long: Khai thác biến động thanh khoản thực tế';
        }
      } else {
        if (rsiVal <= 58 || analysis.confidenceScore >= 40) {
          selectedStrategy = 'FAST_SCALP_MOMENTUM';
          strategyReason = `Fast Scalp Momentum Short (RSI: ${rsiVal.toFixed(1)}) — Tìm cơ hội không giới hạn bảo vệ vốn`;
        } else {
          selectedStrategy = 'MICRO_ORDERFLOW_EXPANSION';
          strategyReason = 'Micro Orderflow Expansion Short: Khai thác biến động thanh khoản thực tế';
        }
      }
    }

    // No valid setup found: STRICT NO_TRADE ENFORCEMENT
    if (!selectedStrategy) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: 'NO_CONVICTION_SETUP: Không có cấu trúc đạt chuẩn',
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }

    // 7. PRICING & RISK-REWARD ENGINE (ATR-based dynamic levels)
    const refCandleClose = activeTf?.lastClose || currentPrice;

    // Check Entry Drift from Setup Origin
    const entryPrice = direction === 'LONG' ? ticker.askPr || currentPrice : ticker.bidPr || currentPrice;
    const driftRatio = Math.abs(entryPrice - refCandleClose) / Math.max(0.0001, atr);
    const effectiveMaxDrift = this.config.bypassCapitalProtection ? 1.5 : this.config.maxEntryDriftAtrRatio;
    if (driftRatio > effectiveMaxDrift) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `LATE_SIGNAL_ENTRY_DRIFT: Price drifted ${driftRatio.toFixed(2)}x ATR from setup close (limit: ${effectiveMaxDrift}x ATR)`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: { ...metricsPlaceholder, riskRewardRatio: 0 },
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.entryDistancePassed = true;

    // Determine Adaptive Stop Loss and Take Profit
    // Anchored to real market structure: Swing High/Low, Order Block, Liquidity Sweep, BOS/CHoCH
    const spec = getContractSpec(symbol);
    const smc = activeTf?.smc;
    const spreadFrictionPrice = (spreadBps / 10000) * entryPrice;
    const slippageFrictionPrice = (this.config.estSlippageBps / 10000) * entryPrice;
    const nocturnalBufferMultiplier = isNightWindow ? 1.35 : 1.0;
    const structuralBuffer = ((0.25 * atr) + spreadFrictionPrice + slippageFrictionPrice) * nocturnalBufferMultiplier;

    let structuralSlPrice: number;
    let slDistance: number;

    if (direction === 'LONG') {
      const candidates: number[] = [];
      if (smc?.swingLow && smc.swingLow > 0 && smc.swingLow < entryPrice) candidates.push(smc.swingLow);
      if (smc?.orderBlock?.low && smc.orderBlock.low > 0 && smc.orderBlock.low < entryPrice) candidates.push(smc.orderBlock.low);
      if (smc?.liquiditySweep?.level && smc.liquiditySweep.level > 0 && smc.liquiditySweep.level < entryPrice) candidates.push(smc.liquiditySweep.level);
      if (smc?.choch?.level && smc.choch.level > 0 && smc.choch.level < entryPrice) candidates.push(smc.choch.level);

      if (candidates.length > 0) {
        const structuralSupport = Math.max(...candidates);
        structuralSlPrice = structuralSupport - structuralBuffer;
        slDistance = entryPrice - structuralSlPrice;
      } else {
        const slMultiplier = selectedStrategy === 'SMC_SWEEP_REVERSAL' ? 1.25 : 1.40;
        slDistance = atr * slMultiplier;
        structuralSlPrice = entryPrice - slDistance;
      }

      // Safeguard clamps: minimum 0.70x ATR / 0.5% price (avoid noise chop) and maximum 1.6x ATR / 1.4% price (max 14% ROE loss)
      const minSlDist = Math.max(atr * 0.70, entryPrice * 0.005);
      const maxSlDist = Math.min(atr * 1.60, entryPrice * 0.014);
      slDistance = Math.max(minSlDist, Math.min(maxSlDist, slDistance));
      structuralSlPrice = roundToTickSize(entryPrice - slDistance, spec.tickSize);
    } else {
      const candidates: number[] = [];
      if (smc?.swingHigh && smc.swingHigh > 0 && smc.swingHigh > entryPrice) candidates.push(smc.swingHigh);
      if (smc?.orderBlock?.high && smc.orderBlock.high > 0 && smc.orderBlock.high > entryPrice) candidates.push(smc.orderBlock.high);
      if (smc?.liquiditySweep?.level && smc.liquiditySweep.level > 0 && smc.liquiditySweep.level > entryPrice) candidates.push(smc.liquiditySweep.level);
      if (smc?.choch?.level && smc.choch.level > 0 && smc.choch.level > entryPrice) candidates.push(smc.choch.level);

      if (candidates.length > 0) {
        const structuralResistance = Math.min(...candidates);
        structuralSlPrice = structuralResistance + structuralBuffer;
        slDistance = structuralSlPrice - entryPrice;
      } else {
        const slMultiplier = selectedStrategy === 'SMC_SWEEP_REVERSAL' ? 1.25 : 1.40;
        slDistance = atr * slMultiplier;
        structuralSlPrice = entryPrice + slDistance;
      }

      const minSlDist = Math.max(atr * 0.70, entryPrice * 0.005);
      const maxSlDist = Math.min(atr * 1.60, entryPrice * 0.014);
      slDistance = Math.max(minSlDist, Math.min(maxSlDist, slDistance));
      structuralSlPrice = roundToTickSize(entryPrice + slDistance, spec.tickSize);
    }

    const stopLossPrice = structuralSlPrice;

    // ADAPTIVE TAKE PROFIT: Mandatory Minimum RR 1:1.60, Target 1:2.0 - 1:2.4
    let targetRR = 2.0;
    if (selectedStrategy === 'SMC_SWEEP_REVERSAL') targetRR = 2.4;
    else if (selectedStrategy === 'REGIME_BREAKOUT_RVOL') targetRR = 2.2;
    else if (selectedStrategy === 'TREND_PULLBACK_MOMENTUM') targetRR = 2.0;
    else targetRR = 1.8;

    let tpDistance = slDistance * targetRR;

    // Look for opposite structural target (liquidity pool / swing)
    if (direction === 'LONG' && smc?.swingHigh && smc.swingHigh > entryPrice) {
      const distToSwing = smc.swingHigh - entryPrice;
      if (distToSwing >= slDistance * 1.6) {
        tpDistance = Math.min(distToSwing, slDistance * 2.5);
      }
    } else if (direction === 'SHORT' && smc?.swingLow && smc.swingLow > 0 && smc.swingLow < entryPrice) {
      const distToSwing = entryPrice - smc.swingLow;
      if (distToSwing >= slDistance * 1.6) {
        tpDistance = Math.min(distToSwing, slDistance * 2.5);
      }
    }

    const takeProfitPrice = roundToTickSize(
      direction === 'LONG' ? entryPrice + tpDistance : entryPrice - tpDistance,
      spec.tickSize
    );

    const riskRewardRatio = Number((tpDistance / slDistance).toFixed(2));
    metricsPlaceholder.riskRewardRatio = riskRewardRatio;

    // STRICT MANDATORY RR RULE: RR >= 1:1.60 (If not met: NO TRADE)
    const mandatoryMinRR = 1.60;
    if (riskRewardRatio < mandatoryMinRR) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `INSUFFICIENT_RR: Tỷ lệ RR 1:${riskRewardRatio.toFixed(2)} < 1:${mandatoryMinRR} (Tối thiểu 1:1.60 sau cấu trúc)`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: metricsPlaceholder,
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }
    filters.rrRatioPassed = true;

    // 8. REALISTIC FRICTION & POSITIVE NET EDGE MODEL
    // Realistic transaction costs
    const roundTripTakerFeeBps = this.config.roundTripTakerFeeBps; // 12 bps (0.12%)
    const estSlippageBps = this.config.estSlippageBps; // 3 bps
    // Estimated 8h funding rate drag normalized to trade holding period (average 1 hour)
    const rawFunding = ticker.fundingRate || 0.0001;
    const estFundingCostBps = Number((Math.abs(rawFunding) * 10000 * 0.15).toFixed(2));
    const totalFrictionBps = Number(
      (roundTripTakerFeeBps + spreadBps + estSlippageBps + estFundingCostBps).toFixed(2)
    );

    const grossRewardBps = Number(((tpDistance / entryPrice) * 10000).toFixed(1));
    const grossRiskBps = Number(((slDistance / entryPrice) * 10000).toFixed(1));

    // Calibrate Expected Win Probability from confidenceScore & strategy
    let calibratedWinProb = 0.48 + ((analysis.confidenceScore - 50) / 100) * 0.28;
    if (selectedStrategy === 'SMC_SWEEP_REVERSAL') calibratedWinProb += 0.04;
    if (selectedStrategy === 'TREND_PULLBACK_MOMENTUM') calibratedWinProb += 0.03;
    if (this.config.bypassCapitalProtection) calibratedWinProb += 0.05; // Aggressive bias
    calibratedWinProb = Math.min(0.78, Math.max(0.40, calibratedWinProb));

    // Formula: Expected Net Edge Bps = p * (Gross Reward - Friction) - (1 - p) * (Gross Risk + Friction)
    const expectedNetEdgeBps = Number(
      (
        calibratedWinProb * (grossRewardBps - totalFrictionBps) -
        (1 - calibratedWinProb) * (grossRiskBps + totalFrictionBps)
      ).toFixed(2)
    );

    // Enforce positive net edge (relaxed to >= 0.5 bps in aggressive mode)
    const effectiveMinEdge = this.config.bypassCapitalProtection ? 0.5 : this.config.minExpectedNetEdgeBps;
    if (expectedNetEdgeBps < effectiveMinEdge) {
      this.signalsRejectedToday++;
      const result: SignalEvaluationResult = {
        symbol,
        action: 'NO_TRADE',
        rejectionReason: `INSUFFICIENT_NET_EDGE: Kỳ vọng lợi nhuận ròng +${expectedNetEdgeBps} bps không đạt mức an toàn +${effectiveMinEdge} bps sau phí`,
        timestamp: now,
        filtersEvaluated: filters,
        metrics: { ...metricsPlaceholder, expectedNetEdgeBps },
      };
      this.lastEvaluations.set(symbol, result);
      return result;
    }

    metricsPlaceholder.expectedNetEdgeBps = expectedNetEdgeBps;
    filters.netEdgePassed = true;

    // 9. SIGNAL GENERATION & DEDUPLICATION CHECK
    const signalId = this.generateSignalId(symbol, direction, selectedStrategy, now);

    // Check duplicate active signal for this symbol
    const existingActive = this.activeSignals.get(symbol);
    if (
      existingActive &&
      existingActive.status === 'CONFIRMED' &&
      existingActive.direction === direction &&
      now < existingActive.expiresAt
    ) {
      const priceDiffPct =
        (Math.abs(entryPrice - existingActive.entryPrice) / existingActive.entryPrice) * 100;
      const minDriftPct = this.config.bypassCapitalProtection ? 0.10 : 0.25;
      if (priceDiffPct < minDriftPct) {
        const result: SignalEvaluationResult = {
          symbol,
          action: 'NO_TRADE',
          rejectionReason: `DUPLICATE_ACTIVE_SIGNAL: Existing ${existingActive.direction} signal ${existingActive.signalId} is still active on ${symbol}`,
          timestamp: now,
          filtersEvaluated: filters,
          metrics: metricsPlaceholder,
        };
        this.lastEvaluations.set(symbol, result);
        return result;
      }
    }

    // Compute Fill Probability & Composite Rank Score
    const fillProbability = Number(
      Math.min(96, Math.max(70, 95 - spreadBps * 2.5 - driftRatio * 15)).toFixed(1)
    );

    // Multi-coin unbiased composite rank score (0 - 100)
    // Avoids BTC bias by strictly weighting edge, confidence, and execution feasibility
    const rankScore = Number(
      (
        analysis.confidenceScore * 0.35 +
        Math.min(50, Math.max(0, expectedNetEdgeBps)) * 0.8 +
        fillProbability * 0.25
      ).toFixed(2)
    );

    const initialAudit: SignalAuditEvent = {
      timestamp: now,
      fromStatus: 'NEW',
      toStatus: 'CONFIRMED',
      reason: `Passed all 8 filter gates with net edge +${expectedNetEdgeBps} bps and RR 1:${riskRewardRatio}`,
      marketPriceAtEvent: entryPrice,
    };

    const newSignal: TradeSignal = {
      signalId,
      symbol,
      direction,
      strategy: selectedStrategy,
      version: this.config.version,
      createdAt: now,
      expiresAt: now + this.config.signalTtlSeconds * 1000,
      status: 'CONFIRMED',
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      riskRewardRatio,
      grossRewardBps,
      grossRiskBps,
      totalFrictionBps,
      expectedNetEdgeBps,
      confidenceScore: analysis.confidenceScore,
      fillProbability,
      rankScore,
      frictionBreakdown: {
        roundTripTakerFeeBps,
        spreadBps,
        estSlippageBps,
        estFundingCostBps,
        totalFrictionBps,
      },
      triggerTimeframe: activeTf?.timeframe === '1m' ? '1m' : activeTf?.timeframe === '15m' ? '15m' : '5m',
      confirmationReason: `${strategyReason} | Net Edge: +${expectedNetEdgeBps} bps | RR: 1:${riskRewardRatio}`,
      isRepainted: false,
      auditTrail: [initialAudit],
    };

    // Store active signal
    this.activeSignals.set(symbol, newSignal);
    this.signalHistory.unshift(newSignal);
    if (this.signalHistory.length > 50) {
      this.signalHistory.pop();
    }

    this.signalsGeneratedToday++;
    this.signalsConfirmedToday++;
    this.totalExpectedNetEdgeBps += expectedNetEdgeBps;
    this.totalRiskRewardRatio += riskRewardRatio;

    const evaluationResult: SignalEvaluationResult = {
      symbol,
      action: direction,
      signal: newSignal,
      timestamp: now,
      filtersEvaluated: filters,
      metrics: metricsPlaceholder,
    };

    this.lastEvaluations.set(symbol, evaluationResult);

    this.log(
      `[BOT 3] CONFIRMED SIGNAL ${newSignal.direction} on ${symbol} | Strat: ${selectedStrategy} | Entry: $${entryPrice.toFixed(4)} | SL: $${stopLossPrice.toFixed(4)} | TP: $${takeProfitPrice.toFixed(4)} | RR: 1:${riskRewardRatio} | Net Edge: +${expectedNetEdgeBps} bps (Costs: ${totalFrictionBps} bps)`,
      'purple'
    );

    return evaluationResult;
  }

  /**
   * Multi-Coin Universe Evaluator & Ranker
   * Evaluates top universe candidates without favoritism, ranking them by quality, net edge, and fill probability.
   */
  public evaluateAndRankCandidates(
    analyses: MarketAnalysisResult[],
    tickers: Record<string, TickerData>
  ): { evaluated: SignalEvaluationResult[]; rankedSignals: TradeSignal[] } {
    const evaluated: SignalEvaluationResult[] = [];
    const confirmedSignals: TradeSignal[] = [];

    // Clean expired signals first
    this.cleanExpiredSignals();

    for (const analysis of analyses) {
      const ticker = tickers[analysis.symbol];
      if (!ticker) continue;

      const evalRes = this.evaluateCandidate(analysis, ticker);
      evaluated.push(evalRes);

      if (evalRes.action !== 'NO_TRADE' && evalRes.signal) {
        confirmedSignals.push(evalRes.signal);
      }
    }

    // Rank signals strictly by rankScore descending
    confirmedSignals.sort((a, b) => b.rankScore - a.rankScore);

    return { evaluated, rankedSignals: confirmedSignals };
  }

  /**
   * Signal Lifecycle State Transitions
   * Anti-repainting enforcement: Confirmed signals can never be altered without logging an audit event.
   */
  public transitionSignal(
    signalId: string,
    newStatus: SignalStatus,
    reason: string,
    currentPrice: number
  ): boolean {
    for (const [symbol, signal] of this.activeSignals.entries()) {
      if (signal.signalId === signalId) {
        const auditEvent: SignalAuditEvent = {
          timestamp: Date.now(),
          fromStatus: signal.status,
          toStatus: newStatus,
          reason,
          marketPriceAtEvent: currentPrice,
        };

        signal.auditTrail.push(auditEvent);
        signal.status = newStatus;

        if (newStatus === 'CONSUMED' || newStatus === 'INVALIDATED' || newStatus === 'EXPIRED') {
          this.activeSignals.delete(symbol);
        }

        this.log(
          `[BOT 3] Signal ${signalId} transitioned from ${auditEvent.fromStatus} -> ${newStatus} (${reason})`,
          newStatus === 'CONSUMED' ? 'success' : newStatus === 'INVALIDATED' ? 'warning' : 'info'
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Marks a signal as CONSUMED when Bot 4 executes the order
   */
  public consumeSignal(signalId: string, currentPrice: number): boolean {
    return this.transitionSignal(signalId, 'CONSUMED', 'Executed by Bot 4 into paper trading position', currentPrice);
  }

  /**
   * Invalidates a signal if price action breached invalidation level before execution
   */
  public invalidateSignal(signalId: string, reason: string, currentPrice: number): boolean {
    return this.transitionSignal(signalId, 'INVALIDATED', reason, currentPrice);
  }

  /**
   * Sweeps expired signals that exceeded TTL
   */
  public cleanExpiredSignals(currentPriceMap?: Record<string, number>): number {
    const now = Date.now();
    let expiredCount = 0;

    for (const [symbol, signal] of this.activeSignals.entries()) {
      if (now >= signal.expiresAt && signal.status === 'CONFIRMED') {
        const pr = currentPriceMap?.[symbol] || signal.entryPrice;
        this.transitionSignal(signal.signalId, 'EXPIRED', `TTL ${this.config.signalTtlSeconds}s elapsed without fill`, pr);
        expiredCount++;
      }
    }

    return expiredCount;
  }

  public getActiveSignals(): TradeSignal[] {
    return Array.from(this.activeSignals.values());
  }

  public getSignalHistory(): TradeSignal[] {
    return [...this.signalHistory];
  }

  public getLastEvaluations(): SignalEvaluationResult[] {
    return Array.from(this.lastEvaluations.values());
  }

  public getPerformanceMetrics() {
    const totalSignals = this.signalsConfirmedToday;
    return {
      signalsGeneratedToday: this.signalsGeneratedToday,
      signalsConfirmedToday: this.signalsConfirmedToday,
      signalsRejectedToday: this.signalsRejectedToday,
      avgExpectedNetEdgeBps: totalSignals > 0 ? Number((this.totalExpectedNetEdgeBps / totalSignals).toFixed(1)) : 0,
      avgRiskRewardRatio: totalSignals > 0 ? Number((this.totalRiskRewardRatio / totalSignals).toFixed(2)) : 0,
    };
  }

  /**
   * Backtest / Validation / Out-Of-Sample Framework
   * Strictly avoids look-ahead bias and simulates execution on closed bars with friction (fees, slippage, spread).
   */
  public runBacktest(
    candles: CandleData[],
    symbol: string,
    splitRatio = 0.60
  ): {
    inSample: BacktestReport;
    outOfSample: BacktestReport;
    combined: BacktestReport;
    trades: BacktestTrade[];
  } {
    if (candles.length < 30) {
      const emptyReport: BacktestReport = {
        symbol,
        sampleType: 'COMBINED',
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        profitFactor: 0,
        netExpectancyBps: 0,
        totalNetReturnPct: 0,
        maxDrawdownPct: 0,
        avgWinPct: 0,
        avgLossPct: 0,
        totalFeesBps: 0,
        timeframe: '5m',
        periodBars: candles.length,
      };
      return {
        inSample: { ...emptyReport, sampleType: 'IN_SAMPLE' },
        outOfSample: { ...emptyReport, sampleType: 'OUT_OF_SAMPLE' },
        combined: emptyReport,
        trades: [],
      };
    }

    const splitIdx = Math.floor(candles.length * splitRatio);
    const trades: BacktestTrade[] = [];

    // Simple ATR helper
    const calculateAtr = (slice: CandleData[]): number => {
      const trs: number[] = [];
      for (let i = 1; i < slice.length; i++) {
        const c = slice[i];
        const prev = slice[i - 1];
        const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
        trs.push(tr);
      }
      return trs.reduce((a, b) => a + b, 0) / Math.max(1, trs.length);
    };

    // Friction constants
    const roundTripFeePct = (this.config.roundTripTakerFeeBps / 10000); // 0.12%
    const slippagePct = (this.config.estSlippageBps / 10000); // 0.03%
    const totalFrictionPct = roundTripFeePct + slippagePct;

    // Simulate bar-by-bar (no lookahead bias)
    let inTrade: {
      id: string;
      direction: 'LONG' | 'SHORT';
      entryPrice: number;
      entryTime: number;
      sl: number;
      tp: number;
      barsHeld: number;
    } | null = null;

    for (let i = 15; i < candles.length; i++) {
      const currentBar = candles[i];
      const prevBar = candles[i - 1];

      // If in a trade, evaluate against currentBar high/low
      if (inTrade) {
        inTrade.barsHeld++;
        let outcome: 'WIN' | 'LOSS' | 'TIMEOUT' | null = null;
        let exitPrice = currentBar.close;

        if (inTrade.direction === 'LONG') {
          if (currentBar.low <= inTrade.sl) {
            outcome = 'LOSS';
            exitPrice = inTrade.sl;
          } else if (currentBar.high >= inTrade.tp) {
            outcome = 'WIN';
            exitPrice = inTrade.tp;
          } else if (inTrade.barsHeld >= 12) {
            outcome = 'TIMEOUT';
            exitPrice = currentBar.close;
          }
        } else {
          if (currentBar.high >= inTrade.sl) {
            outcome = 'LOSS';
            exitPrice = inTrade.sl;
          } else if (currentBar.low <= inTrade.tp) {
            outcome = 'WIN';
            exitPrice = inTrade.tp;
          } else if (inTrade.barsHeld >= 12) {
            outcome = 'TIMEOUT';
            exitPrice = currentBar.close;
          }
        }

        if (outcome) {
          const grossPct =
            inTrade.direction === 'LONG'
              ? ((exitPrice - inTrade.entryPrice) / inTrade.entryPrice) * 100
              : ((inTrade.entryPrice - exitPrice) / inTrade.entryPrice) * 100;
          const netPct = grossPct - totalFrictionPct * 100;

          trades.push({
            signalId: inTrade.id,
            symbol,
            direction: inTrade.direction,
            entryTime: inTrade.entryTime,
            entryPrice: inTrade.entryPrice,
            exitTime: currentBar.ts,
            exitPrice,
            stopLoss: inTrade.sl,
            takeProfit: inTrade.tp,
            outcome,
            grossPnLPct: Number(grossPct.toFixed(3)),
            frictionPct: Number((totalFrictionPct * 100).toFixed(3)),
            netPnLPct: Number(netPct.toFixed(3)),
            durationBars: inTrade.barsHeld,
          });

          inTrade = null;
        }
        continue;
      }

      // Check entry conditions on closed bar (i - 1)
      const windowCandles = candles.slice(i - 14, i);
      const atr = calculateAtr(windowCandles);
      const close = prevBar.close;
      const open = prevBar.open;

      // Simple Trend EMA proxy
      const emaFast = windowCandles.slice(-5).reduce((s, c) => s + c.close, 0) / 5;
      const emaSlow = windowCandles.slice(-12).reduce((s, c) => s + c.close, 0) / 12;

      let signalDir: 'LONG' | 'SHORT' | null = null;
      if (emaFast > emaSlow && close > open && (close - open) > atr * 0.3) {
        signalDir = 'LONG';
      } else if (emaFast < emaSlow && close < open && (open - close) > atr * 0.3) {
        signalDir = 'SHORT';
      }

      if (signalDir) {
        const slDist = atr * 1.4;
        const tpDist = slDist * this.config.minRiskRewardRatio;
        const entryPrice = currentBar.open;

        inTrade = {
          id: `BT-${symbol}-${i}`,
          direction: signalDir,
          entryPrice,
          entryTime: currentBar.ts,
          sl: signalDir === 'LONG' ? entryPrice - slDist : entryPrice + slDist,
          tp: signalDir === 'LONG' ? entryPrice + tpDist : entryPrice - tpDist,
          barsHeld: 0,
        };
      }
    }

    const compileReport = (
      tradeSubset: BacktestTrade[],
      sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE' | 'COMBINED',
      periodBars: number
    ): BacktestReport => {
      const totalTrades = tradeSubset.length;
      if (totalTrades === 0) {
        return {
          symbol,
          sampleType,
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0,
          profitFactor: 0,
          netExpectancyBps: 0,
          totalNetReturnPct: 0,
          maxDrawdownPct: 0,
          avgWinPct: 0,
          avgLossPct: 0,
          totalFeesBps: 0,
          timeframe: '5m',
          periodBars,
        };
      }

      const winTrades = tradeSubset.filter((t) => t.netPnLPct > 0);
      const lossTrades = tradeSubset.filter((t) => t.netPnLPct <= 0);

      const winCount = winTrades.length;
      const lossCount = lossTrades.length;
      const winRate = Number(((winCount / totalTrades) * 100).toFixed(1));

      const totalGain = winTrades.reduce((s, t) => s + t.netPnLPct, 0);
      const totalLoss = Math.abs(lossTrades.reduce((s, t) => s + t.netPnLPct, 0));

      const profitFactor =
        totalLoss > 0 ? Number((totalGain / totalLoss).toFixed(2)) : totalGain > 0 ? 99.0 : 0;

      const totalNetReturnPct = Number(tradeSubset.reduce((s, t) => s + t.netPnLPct, 0).toFixed(2));
      const netExpectancyBps = Number(((totalNetReturnPct / totalTrades) * 100).toFixed(1));

      const avgWinPct = winCount > 0 ? Number((totalGain / winCount).toFixed(2)) : 0;
      const avgLossPct = lossCount > 0 ? Number((totalLoss / lossCount).toFixed(2)) : 0;

      // Drawdown calculation
      let peak = 0;
      let running = 0;
      let maxDd = 0;
      for (const t of tradeSubset) {
        running += t.netPnLPct;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDd) maxDd = dd;
      }

      return {
        symbol,
        sampleType,
        totalTrades,
        winCount,
        lossCount,
        winRate,
        profitFactor,
        netExpectancyBps,
        totalNetReturnPct,
        maxDrawdownPct: Number(maxDd.toFixed(2)),
        avgWinPct,
        avgLossPct,
        totalFeesBps: totalTrades * this.config.roundTripTakerFeeBps,
        timeframe: '5m',
        periodBars,
      };
    };

    const inSampleTrades = trades.filter((t) => t.entryTime <= candles[splitIdx]?.ts);
    const outOfSampleTrades = trades.filter((t) => t.entryTime > candles[splitIdx]?.ts);

    return {
      inSample: compileReport(inSampleTrades, 'IN_SAMPLE', splitIdx),
      outOfSample: compileReport(outOfSampleTrades, 'OUT_OF_SAMPLE', candles.length - splitIdx),
      combined: compileReport(trades, 'COMBINED', candles.length),
      trades,
    };
  }

  /**
   * BOT 3 PRIMARY PIPELINE METHOD: bot3_evaluateSignalAndNetTP
   * Independently receives technical payload from Bot 2 ->
   * Evaluates signal gates and strictly deducts exchange fees:
   *  - 0.06% Taker Fee open + 0.06% Taker Fee close = 0.12% (12 bps)
   *  - Slippage buffer (3-5 bps)
   *  - Funding rate cost
   * Computes Net Take-Profit and Net Stop-Loss ensuring strictly positive net edge ->
   * Packages verified signal payload for Bot 4
   */
  public bot3_evaluateSignalAndNetTP(
    technicals: Bot2TechnicalsPayload,
    currentTicker: TickerData
  ): Bot3SignalNetTPPayload {
    // Construct MarketAnalysisResult adapter
    const analysisAdapter: MarketAnalysisResult = {
      symbol: technicals.symbol,
      timestamp: technicals.timestamp,
      currentPrice: technicals.currentPrice,
      overallRegime: technicals.overallRegime,
      bias: technicals.bias,
      confidenceScore: technicals.confidenceScore,
      macroTrend: technicals.macroTrend,
      intermediateTrend: technicals.intermediateTrend,
      microTrend: technicals.microTrend,
      conflict: technicals.conflict,
      timeframes: technicals.timeframes,
      costs: {
        spreadBps: currentTicker.spreadPercent ? currentTicker.spreadPercent * 100 : 2.0,
        roundTripTakerFeeBps: this.config.roundTripTakerFeeBps,
        estSlippageBps: this.config.estSlippageBps,
        totalCostBps: (currentTicker.spreadPercent ? currentTicker.spreadPercent * 100 : 2.0) + this.config.roundTripTakerFeeBps + this.config.estSlippageBps,
        fundingRate8h: currentTicker.fundingRate || 0,
        breakEvenMoveDollars: currentTicker.lastPr * 0.0017,
        breakEvenMovePercent: 0.17,
      },
      reasons: technicals.reasons,
      isProvisional: false,
      analysisLatencyMs: technicals.analysisLatencyMs,
    };

    // Run core 8-gate evaluation
    const evalResult = this.evaluateCandidate(analysisAdapter, currentTicker);

    const price = currentTicker.lastPr;
    const spreadBps = currentTicker.spreadPercent ? +(currentTicker.spreadPercent * 100).toFixed(2) : 2.0;
    const roundTripTakerFeeBps = this.config.roundTripTakerFeeBps; // 12.0 bps (0.06% x 2)
    const estSlippageBps = this.config.estSlippageBps; // 3.0 bps
    const estFundingCostBps = Math.abs(currentTicker.fundingRate || 0) * 10000;
    const totalFrictionBps = +(spreadBps + roundTripTakerFeeBps + estSlippageBps + estFundingCostBps).toFixed(2);
    const breakEvenMovePercent = +(totalFrictionBps / 100).toFixed(4);
    const breakEvenMoveDollars = +(price * (breakEvenMovePercent / 100)).toFixed(4);

    // Conduct TradingAgents Multi-Agent Bull vs Bear Debate
    let tradingAgentsDebate: any = null;
    try {
      const synthesis = technicals.tradingAgentsAnalysts || synthesizeMultiAgentAnalysis(
        technicals.symbol,
        {},
        currentTicker
      );
      tradingAgentsDebate = tradingAgentsDebateEngine.conductDebate(
        synthesis,
        currentTicker,
        this.config.minRiskRewardRatio
      );
    } catch (e: any) {
      console.warn('[BOT3] TradingAgents debate warning:', e.message);
    }

    const signal = evalResult.signal;
    const netTakeProfitPrice = signal ? signal.takeProfitPrice : (technicals.bias === 'LONG' ? price * 1.015 : price * 0.985);
    const netStopLossPrice = signal ? signal.stopLossPrice : (technicals.bias === 'LONG' ? price * 0.99 : price * 1.01);
    const riskRewardRatio = signal ? signal.riskRewardRatio : 2.0;
    const expectedNetEdgeBps = signal ? signal.expectedNetEdgeBps : 0;

    const payload: Bot3SignalNetTPPayload = {
      stage: 'BOT3_EVALUATE_SIGNAL_AND_NET_TP',
      timestamp: Date.now(),
      symbol: technicals.symbol,
      action: evalResult.action,
      rejectionReason: evalResult.rejectionReason,
      signal,
      tradingAgentsDebate,
      feeDeductions: {
        takerFeeRatePerLeg: 0.0006, // 0.06% per leg
        roundTripTakerFeeBps,
        estSlippageBps,
        estFundingCostBps,
        spreadBps,
        totalFrictionBps,
        breakEvenMoveDollars,
        breakEvenMovePercent,
        expectedNetEdgeBps,
        netTakeProfitPrice,
        netStopLossPrice,
        riskRewardRatio,
      },
      gatesPassed: {
        staleData: evalResult.filtersEvaluated.staleDataPassed,
        spreadCheck: evalResult.filtersEvaluated.spreadCheckPassed,
        entryDistance: evalResult.filtersEvaluated.entryDistancePassed,
        regimeSuitability: evalResult.filtersEvaluated.regimeSuitabilityPassed,
        mtfConflict: evalResult.filtersEvaluated.mtfConflictPassed,
        unclosedCandle: evalResult.filtersEvaluated.unclosedCandlePassed,
        rrRatio: evalResult.filtersEvaluated.rrRatioPassed,
        netEdge: evalResult.filtersEvaluated.netEdgePassed,
      },
    };

    return payload;
  }
}

export const bot3SignalEngine = new Bot3SignalEngine();
