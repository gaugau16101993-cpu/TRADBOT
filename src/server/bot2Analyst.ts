import {
  CandleData,
  TickerData,
  MarketRegime,
  AnalysisBias,
  IndicatorValues,
  SMCSignals,
  TimeframeAnalysis,
  CostEstimates,
  MarketAnalysisResult,
} from '../types/engine';
import {
  Bot1ScanPayload,
  Bot2TechnicalsPayload,
  Bot2TunableParameters,
} from '../types/pipeline';
import { synthesizeMultiAgentAnalysis } from './tradingAgents';

export type SupportedTimeframe = '1m' | '5m' | '15m' | '1H' | '4H';

interface CandleCacheEntry {
  candles: CandleData[];
  expiresAt: number;
}

export class Bot2MarketAnalyst {
  private candleCache: Map<string, CandleCacheEntry> = new Map();
  private analysisCache: Map<string, { result: MarketAnalysisResult; expiresAt: number }> = new Map();

  // Dynamic Tunable Parameters adapted from Bot 5 Losing Post-Mortem Feedback
  private tunableParams: Bot2TunableParameters = {
    rsiLongMax: 68,
    rsiLongMin: 48,
    rsiShortMin: 32,
    rsiShortMax: 52,
    minConfidenceScore: 75, // Elevated from 70 to reject marginal setups
    minAtrRatio: 1.8, // 1.8x ATR over round-trip costs minimum
    adxTrendThreshold: 22,
    maxAllowedSpreadBps: 3.0, // Tightened from 5.0 to 3.0 bps
    version: 2,
    lastUpdatedAt: Date.now(),
  };

  // Rate Limiting (Token Bucket)
  private tokens: number = 15;
  private maxTokens: number = 15;
  private lastTokenRefill: number = Date.now();

  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;

  constructor(callbacks?: {
    onLog?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
  }) {
    this.onLogCallback = callbacks?.onLog;
  }

  public setTunableParameters(params: Bot2TunableParameters) {
    this.tunableParams = { ...params };
    // Clear analysis cache so updated parameters take effect immediately
    this.analysisCache.clear();
  }

  public getTunableParameters(): Bot2TunableParameters {
    return { ...this.tunableParams };
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.onLogCallback = fn;
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastTokenRefill;
    if (elapsed > 1000) {
      this.tokens = this.maxTokens;
      this.lastTokenRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }

    const waitMs = Math.max(50, 1000 - elapsed);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.tokens = this.maxTokens - 1;
    this.lastTokenRefill = Date.now();
  }

  // 1. Fetch MTF Candles from Bitget with Caching & Rate Limiting
  public async fetchTimeframeCandles(
    symbol: string,
    timeframe: SupportedTimeframe,
    limit = 50
  ): Promise<CandleData[]> {
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const now = Date.now();
    const cached = this.candleCache.get(cacheKey);

    if (cached && now < cached.expiresAt && cached.candles.length >= limit) {
      return cached.candles;
    }

    await this.acquireToken();

    try {
      const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${timeframe}&limit=${limit}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Bitget-Bot2-Analyst/2.5',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on ${timeframe}`);
      }

      const json = await res.json();
      if (json.code !== '00000' || !Array.isArray(json.data)) {
        throw new Error(`Bitget error ${json.code} on ${timeframe}: ${json.msg || 'No data'}`);
      }

      // Map candles and sort chronologically (oldest to newest)
      const candles: CandleData[] = [];
      const tfMinutes =
        timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : timeframe === '1H' ? 60 : 240;
      const tfDurationMs = tfMinutes * 60 * 1000;

      for (const row of json.data) {
        const ts = parseInt(row[0], 10);
        const open = parseFloat(row[1]);
        const high = parseFloat(row[2]);
        const low = parseFloat(row[3]);
        const close = parseFloat(row[4]);
        const baseVolume = parseFloat(row[5]);
        const quoteVolume = parseFloat(row[6]);

        // A candle is confirmed closed if its start time + duration <= now
        const isComplete = ts + tfDurationMs <= now;

        if (!isNaN(ts) && !isNaN(close) && close > 0 && high >= low) {
          candles.push({
            ts,
            open,
            high,
            low,
            close,
            baseVolume,
            quoteVolume,
            isComplete,
          });
        }
      }

      // Sort chronological (oldest first, newest last)
      candles.sort((a, b) => a.ts - b.ts);

      // TTL based on timeframe
      const ttlMs =
        timeframe === '1m'
          ? 6_000
          : timeframe === '5m'
          ? 20_000
          : timeframe === '15m'
          ? 45_000
          : timeframe === '1H'
          ? 120_000
          : 300_000;

      this.candleCache.set(cacheKey, {
        candles,
        expiresAt: now + ttlMs,
      });

      return candles;
    } catch (err: any) {
      if (cached) {
        return cached.candles;
      }
      return [];
    }
  }

  // 2. Technical Indicator Mathematical Engines
  public calculateEMA(closes: number[], period: number): number {
    if (closes.length === 0) return 0;
    if (closes.length < period) {
      // Return simple average of available closes
      return closes.reduce((a, b) => a + b, 0) / closes.length;
    }

    const multiplier = 2 / (period + 1);
    // Initial SMA for first 'period' elements
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * multiplier + ema * (1 - multiplier);
    }

    return ema;
  }

  public calculateRSI(closes: number[], period = 14): number {
    if (closes.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += -diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  public calculateATR(candles: CandleData[], period = 14): number {
    if (candles.length < 2) return candles[0]?.high - candles[0]?.low || 0;

    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }

    if (trs.length < period) {
      return trs.reduce((a, b) => a + b, 0) / trs.length;
    }

    // Wilder's smoothed ATR
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }

    return atr;
  }

  public calculateADX(candles: CandleData[], period = 14): { adx: number; plusDI: number; minusDI: number } {
    if (candles.length <= period + 1) {
      return { adx: 20, plusDI: 20, minusDI: 20 };
    }

    const trs: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevHigh = candles[i - 1].high;
      const prevLow = candles[i - 1].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);

      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      if (upMove > downMove && upMove > 0) {
        plusDMs.push(upMove);
      } else {
        plusDMs.push(0);
      }

      if (downMove > upMove && downMove > 0) {
        minusDMs.push(downMove);
      } else {
        minusDMs.push(0);
      }
    }

    // Smooth TR, +DM, -DM using Wilder's smoothing
    let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

    const dxList: number[] = [];

    for (let i = period; i < trs.length; i++) {
      smoothTR = smoothTR - smoothTR / period + trs[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDMs[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDMs[i];

      const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
      const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
      const diSum = plusDI + minusDI;
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
      dxList.push(dx);
    }

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 20;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 20;

    if (dxList.length === 0) {
      return { adx: 20, plusDI, minusDI };
    }

    if (dxList.length < period) {
      const adx = dxList.reduce((a, b) => a + b, 0) / dxList.length;
      return { adx, plusDI, minusDI };
    }

    let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adx = (adx * (period - 1) + dxList[i]) / period;
    }

    return { adx, plusDI, minusDI };
  }

  // 3. SMC & Price Action Pattern Detection (Closed Candles Only)
  public detectSMC(candles: CandleData[]): SMCSignals {
    // Only use closed completed candles for SMC verification to prevent look-ahead bias!
    const closed = candles.filter((c) => c.isComplete);
    if (closed.length < 5) {
      return {
        liquiditySweep: { detected: false },
        bos: { detected: false },
        choch: { detected: false },
        orderBlock: { detected: false },
        fvg: { detected: false },
      };
    }

    const n = closed.length;
    const latest = closed[n - 1];
    const prev = closed[n - 2];

    // Find local swing highs and swing lows (3-bar fractal extrema)
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (let i = Math.max(0, n - 15); i < n - 2; i++) {
      if (closed[i].high > swingHigh) swingHigh = closed[i].high;
      if (closed[i].low < swingLow) swingLow = closed[i].low;
    }

    // 1. Liquidity Sweep: Wick pierced swing level, but body closed inside
    let sweepDetected = false;
    let sweepSide: 'BULLISH' | 'BEARISH' | undefined;
    let sweepLevel: number | undefined;

    if (latest.high > swingHigh && latest.close < swingHigh) {
      sweepDetected = true;
      sweepSide = 'BEARISH'; // Bull trap / Bearish sweep
      sweepLevel = swingHigh;
    } else if (latest.low < swingLow && latest.close > swingLow) {
      sweepDetected = true;
      sweepSide = 'BULLISH'; // Bear trap / Bullish sweep
      sweepLevel = swingLow;
    }

    // 2. Break of Structure (BOS): Candle body decisively closed beyond swing level
    let bosDetected = false;
    let bosSide: 'BULLISH' | 'BEARISH' | undefined;
    let bosLevel: number | undefined;

    if (latest.close > swingHigh && prev.close <= swingHigh) {
      bosDetected = true;
      bosSide = 'BULLISH';
      bosLevel = swingHigh;
    } else if (latest.close < swingLow && prev.close >= swingLow) {
      bosDetected = true;
      bosSide = 'BEARISH';
      bosLevel = swingLow;
    }

    // 3. Change of Character (CHoCH): Reversal break
    let chochDetected = false;
    let chochSide: 'BULLISH' | 'BEARISH' | undefined;
    let chochLevel: number | undefined;

    // Check intermediate swing
    if (n >= 10) {
      const midHigh = Math.max(...closed.slice(n - 8, n - 3).map((c) => c.high));
      const midLow = Math.min(...closed.slice(n - 8, n - 3).map((c) => c.low));

      if (latest.close > midHigh && closed[n - 3].close < midLow) {
        chochDetected = true;
        chochSide = 'BULLISH';
        chochLevel = midHigh;
      } else if (latest.close < midLow && closed[n - 3].close > midHigh) {
        chochDetected = true;
        chochSide = 'BEARISH';
        chochLevel = midLow;
      }
    }

    // 4. Fair Value Gap (FVG): Scan recent 3-bar sequences
    let fvgDetected = false;
    let fvgSide: 'BULLISH' | 'BEARISH' | undefined;
    let fvgTop: number | undefined;
    let fvgBottom: number | undefined;

    for (let i = n - 1; i >= 2; i--) {
      const c1 = closed[i - 2];
      const c3 = closed[i];

      // Bullish FVG: c1.high < c3.low (imbalance gap)
      if (c1.high < c3.low) {
        fvgDetected = true;
        fvgSide = 'BULLISH';
        fvgTop = c3.low;
        fvgBottom = c1.high;
        break;
      }
      // Bearish FVG: c1.low > c3.high (imbalance gap)
      else if (c1.low > c3.high) {
        fvgDetected = true;
        fvgSide = 'BEARISH';
        fvgTop = c1.low;
        fvgBottom = c3.high;
        break;
      }
    }

    // 5. Order Block (OB): Last opposing candle before energetic displacement
    let obDetected = false;
    let obSide: 'BULLISH' | 'BEARISH' | undefined;
    let obHigh: number | undefined;
    let obLow: number | undefined;

    for (let i = n - 1; i >= 1; i--) {
      const curr = closed[i];
      const prevC = closed[i - 1];
      const bodyCurr = Math.abs(curr.close - curr.open);
      const bodyPrev = Math.abs(prevC.close - prevC.open);

      if (bodyCurr > bodyPrev * 1.3 && bodyCurr > (curr.high - curr.low) * 0.4) {
        if (curr.close > curr.open && prevC.close < prevC.open) {
          obDetected = true;
          obSide = 'BULLISH';
          obHigh = prevC.high;
          obLow = prevC.low;
          break;
        } else if (curr.close < curr.open && prevC.close > prevC.open) {
          obDetected = true;
          obSide = 'BEARISH';
          obHigh = prevC.high;
          obLow = prevC.low;
          break;
        }
      }
    }

    return {
      liquiditySweep: { detected: sweepDetected, side: sweepSide, level: sweepLevel, timestamp: latest.ts },
      bos: { detected: bosDetected, side: bosSide, level: bosLevel },
      choch: { detected: chochDetected, side: chochSide, level: chochLevel },
      orderBlock: { detected: obDetected, side: obSide, high: obHigh, low: obLow },
      fvg: { detected: fvgDetected, side: fvgSide, top: fvgTop, bottom: fvgBottom },
      swingHigh,
      swingLow,
    };
  }

  // 4. Analyze Individual Timeframe
  public analyzeTimeframe(timeframe: SupportedTimeframe, candles: CandleData[]): TimeframeAnalysis {
    if (candles.length === 0) {
      return {
        timeframe,
        candleCount: 0,
        indicators: {
          ema9: 0,
          ema21: 0,
          ema50: 0,
          rsi14: 50,
          adx14: 20,
          plusDI: 20,
          minusDI: 20,
          atr14: 0,
          atrPercent: 0,
          volumeSma20: 0,
          rvol: 1,
        },
        trend: 'NEUTRAL',
        regime: 'RANGING',
        smc: {
          liquiditySweep: { detected: false },
          bos: { detected: false },
          choch: { detected: false },
          orderBlock: { detected: false },
          fvg: { detected: false },
        },
        isProvisional: false,
        lastClose: 0,
        lastTs: 0,
      };
    }

    const closes = candles.map((c) => c.close);
    const lastCandle = candles[candles.length - 1];
    const isProvisional = !lastCandle.isComplete;

    // Indicators
    const ema9 = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    const ema200 = closes.length >= 200 ? this.calculateEMA(closes, 200) : undefined;
    const rsi14 = +this.calculateRSI(closes, 14).toFixed(2);
    const atr14 = +this.calculateATR(candles, 14).toFixed(4);
    const atrPercent = lastCandle.close > 0 ? +((atr14 / lastCandle.close) * 100).toFixed(3) : 0;
    const { adx, plusDI, minusDI } = this.calculateADX(candles, 14);

    // Volume SMA 20 & RVOL
    const volSlice = candles.slice(-20).map((c) => c.quoteVolume || c.baseVolume);
    const volumeSma20 = volSlice.reduce((a, b) => a + b, 0) / Math.max(1, volSlice.length);
    const currentVol = lastCandle.quoteVolume || lastCandle.baseVolume;
    const rvol = volumeSma20 > 0 ? +(currentVol / volumeSma20).toFixed(2) : 1;

    // Trend Direction on this timeframe
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (ema9 > ema21 && ema21 > ema50 && lastCandle.close > ema21) {
      trend = 'BULLISH';
    } else if (ema9 < ema21 && ema21 < ema50 && lastCandle.close < ema21) {
      trend = 'BEARISH';
    }

    // Market Regime on this timeframe
    let regime: MarketRegime = 'RANGING';
    if (atrPercent > 2.5) {
      regime = 'HIGH_VOLATILITY';
    } else if (adx > 25) {
      regime = plusDI > minusDI ? 'TRENDING_BULLISH' : 'TRENDING_BEARISH';
    } else if (trend === 'BULLISH') {
      regime = 'TRENDING_BULLISH';
    } else if (trend === 'BEARISH') {
      regime = 'TRENDING_BEARISH';
    }

    // SMC Patterns
    const smc = this.detectSMC(candles);

    return {
      timeframe,
      candleCount: candles.length,
      indicators: {
        ema9: +ema9.toFixed(4),
        ema21: +ema21.toFixed(4),
        ema50: +ema50.toFixed(4),
        ema200: ema200 ? +ema200.toFixed(4) : undefined,
        rsi14,
        adx14: +adx.toFixed(2),
        plusDI: +plusDI.toFixed(2),
        minusDI: +minusDI.toFixed(2),
        atr14,
        atrPercent,
        volumeSma20: +volumeSma20.toFixed(2),
        rvol,
      },
      trend,
      regime,
      smc,
      isProvisional,
      lastClose: lastCandle.close,
      lastTs: lastCandle.ts,
    };
  }

  // 5. Full Multi-Timeframe Analysis Pipeline (M1, M5, M15, H1, H4)
  public async analyzeMarket(
    symbol: string,
    currentTicker: TickerData
  ): Promise<MarketAnalysisResult> {
    const startTime = performance.now();
    const cacheKey = symbol;
    const now = Date.now();

    // Check recent analysis cache (5s TTL)
    const cachedAnalysis = this.analysisCache.get(cacheKey);
    if (cachedAnalysis && now < cachedAnalysis.expiresAt) {
      return cachedAnalysis.result;
    }

    // Parallel fetch of M1, M5, M15, H1, H4
    const [c1m, c5m, c15m, c1h, c4h] = await Promise.all([
      this.fetchTimeframeCandles(symbol, '1m', 35),
      this.fetchTimeframeCandles(symbol, '5m', 35),
      this.fetchTimeframeCandles(symbol, '15m', 40),
      this.fetchTimeframeCandles(symbol, '1H', 40),
      this.fetchTimeframeCandles(symbol, '4H', 40),
    ]);

    const tf1m = this.analyzeTimeframe('1m', c1m);
    const tf5m = this.analyzeTimeframe('5m', c5m);
    const tf15m = this.analyzeTimeframe('15m', c15m);
    const tf1h = this.analyzeTimeframe('1H', c1h);
    const tf4h = this.analyzeTimeframe('4H', c4h);

    const timeframes = {
      '1m': tf1m,
      '5m': tf5m,
      '15m': tf15m,
      '1H': tf1h,
      '4H': tf4h,
    };

    // 6. Multi-Timeframe Synthesis
    // Macro Trend (4H + 1H)
    let macroScore = 0;
    if (tf4h.trend === 'BULLISH') macroScore += 1;
    else if (tf4h.trend === 'BEARISH') macroScore -= 1;
    if (tf1h.trend === 'BULLISH') macroScore += 1;
    else if (tf1h.trend === 'BEARISH') macroScore -= 1;

    const macroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      macroScore > 0 ? 'BULLISH' : macroScore < 0 ? 'BEARISH' : 'NEUTRAL';

    // Intermediate Trend (15m)
    const intermediateTrend = tf15m.trend;

    // Micro Trend (5m + 1m)
    let microScore = 0;
    if (tf5m.trend === 'BULLISH') microScore += 1;
    else if (tf5m.trend === 'BEARISH') microScore -= 1;
    if (tf1m.trend === 'BULLISH') microScore += 1;
    else if (tf1m.trend === 'BEARISH') microScore -= 1;

    const microTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      microScore > 0 ? 'BULLISH' : microScore < 0 ? 'BEARISH' : 'NEUTRAL';

    // Conflict Detection
    let conflictDetected = false;
    let conflictDescription: string | undefined;

    if (macroTrend !== 'NEUTRAL' && microTrend !== 'NEUTRAL' && macroTrend !== microTrend) {
      conflictDetected = true;
      conflictDescription = `Xung đột đa khung: Macro (${macroTrend}) đối nghịch với Micro (${microTrend})`;
    }

    // 7. Overall Market Regime
    let overallRegime: MarketRegime = 'RANGING';
    const isSpreadAbnormal = (currentTicker.spreadPercent || 0) > 0.08;
    const isFundingAbnormal = Math.abs(currentTicker.fundingRate || 0) > 0.001; // > 0.1%

    if (isSpreadAbnormal || isFundingAbnormal) {
      overallRegime = 'ABNORMAL_MARKET';
    } else if (tf15m.indicators.atrPercent > 2.5 || tf1h.indicators.atrPercent > 3.0) {
      overallRegime = 'HIGH_VOLATILITY';
    } else if (macroTrend === 'BULLISH' && (intermediateTrend === 'BULLISH' || microTrend === 'BULLISH')) {
      overallRegime = 'TRENDING_BULLISH';
    } else if (macroTrend === 'BEARISH' && (intermediateTrend === 'BEARISH' || microTrend === 'BEARISH')) {
      overallRegime = 'TRENDING_BEARISH';
    } else {
      overallRegime = 'RANGING';
    }

    // 8. Cost & Friction Modeling
    const lastPrice = currentTicker.lastPr;
    const spreadPercent = currentTicker.spreadPercent || (lastPrice > 0 ? ((currentTicker.askPr - currentTicker.bidPr) / lastPrice) * 100 : 0.0004);
    const spreadBps = +(spreadPercent * 100).toFixed(2);
    const roundTripTakerFeeBps = 12.0; // 0.06% open + 0.06% close = 0.12% = 12 bps
    const estSlippageBps = 5.0; // 0.05% slippage = 5 bps
    const totalCostBps = +(spreadBps + roundTripTakerFeeBps + estSlippageBps).toFixed(2);
    const breakEvenMovePercent = +(totalCostBps / 100).toFixed(4);
    const breakEvenMoveDollars = +(lastPrice * (breakEvenMovePercent / 100)).toFixed(4);
    const fundingRate8h = currentTicker.fundingRate || 0;

    const costs: CostEstimates = {
      spreadBps,
      roundTripTakerFeeBps,
      estSlippageBps,
      totalCostBps,
      fundingRate8h,
      breakEvenMoveDollars,
      breakEvenMovePercent,
    };

    // 9. Directional Bias & Calibrated Confidence Scoring
    let bias: AnalysisBias = 'NEUTRAL';
    const reasons: string[] = [];

    let rawScore = 30; // base score

    // Indicator Concordance (up to +35 pts)
    if (macroTrend === 'BULLISH' && microTrend === 'BULLISH') {
      bias = 'LONG';
      rawScore += 30;
      reasons.push('Đồng thuận xu hướng đa khung: Macro H4/H1 và Micro M5/M1 đều hướng Tăng (Bullish)');
    } else if (macroTrend === 'BEARISH' && microTrend === 'BEARISH') {
      bias = 'SHORT';
      rawScore += 30;
      reasons.push('Đồng thuận xu hướng đa khung: Macro H4/H1 và Micro M5/M1 đều hướng Giảm (Bearish)');
    } else if (intermediateTrend === 'BULLISH' && microTrend === 'BULLISH' && macroTrend === 'NEUTRAL') {
      bias = 'LONG';
      rawScore += 20;
      reasons.push('Cấu trúc M15 và M5/M1 hướng Tăng, Macro đi ngang');
    } else if (intermediateTrend === 'BEARISH' && microTrend === 'BEARISH' && macroTrend === 'NEUTRAL') {
      bias = 'SHORT';
      rawScore += 20;
      reasons.push('Cấu trúc M15 và M5/M1 hướng Giảm, Macro đi ngang');
    } else {
      // Fast Scalping Dynamic Directional Bias: resolve using M1/M5 momentum
      const tf1mBullish = (tf1m.indicators.ema9 >= tf1m.indicators.ema21) || (tf1m.indicators.rsi14 >= 50);
      const tf5mBullish = tf5m.trend === 'BULLISH' || (tf5m.indicators.rsi14 >= 50);
      if (tf1mBullish || tf5mBullish) {
        bias = 'LONG';
        rawScore += 25;
        reasons.push('Fast Scalp: Động lượng siêu ngắn M1/M5 ưu thế phe Mua (EMA9 >= EMA21, RSI thuận lợi)');
      } else {
        bias = 'SHORT';
        rawScore += 25;
        reasons.push('Fast Scalp: Động lượng siêu ngắn M1/M5 ưu thế phe Bán (EMA9 < EMA21, RSI phân kỳ)');
      }
    }

    // Momentum (RSI & ADX) utilizing Bot 5 Dynamic Feedback Parameters
    const { rsiLongMin, rsiLongMax, rsiShortMin, rsiShortMax, adxTrendThreshold, minAtrRatio } = this.tunableParams;

    if (bias === 'LONG') {
      if (tf5m.indicators.rsi14 >= rsiLongMin && tf5m.indicators.rsi14 <= rsiLongMax) {
        rawScore += 10;
        reasons.push(`RSI(5m)=${tf5m.indicators.rsi14} nằm trong vùng đà tăng tối ưu [${rsiLongMin}-${rsiLongMax}]`);
      } else if (tf5m.indicators.rsi14 > rsiLongMax) {
        rawScore -= 12;
        reasons.push(`Cảnh báo RSI(5m)=${tf5m.indicators.rsi14} quá trần an toàn (${rsiLongMax}), nguy cơ đu đỉnh`);
      }

      if (tf15m.indicators.adx14 > adxTrendThreshold && tf15m.indicators.plusDI > tf15m.indicators.minusDI) {
        rawScore += 10;
        reasons.push(`ADX(15m)=${tf15m.indicators.adx14} vượt ngưỡng trend (${adxTrendThreshold}), xác nhận lực trend mạnh (+DI > -DI)`);
      }
    } else if (bias === 'SHORT') {
      if (tf5m.indicators.rsi14 <= rsiShortMax && tf5m.indicators.rsi14 >= rsiShortMin) {
        rawScore += 10;
        reasons.push(`RSI(5m)=${tf5m.indicators.rsi14} nằm trong vùng đà giảm thuận lợi [${rsiShortMin}-${rsiShortMax}]`);
      } else if (tf5m.indicators.rsi14 < rsiShortMin) {
        rawScore -= 12;
        reasons.push(`Cảnh báo RSI(5m)=${tf5m.indicators.rsi14} chạm sàn an toàn (${rsiShortMin}), nguy cơ bán đáy`);
      }

      if (tf15m.indicators.adx14 > adxTrendThreshold && tf15m.indicators.minusDI > tf15m.indicators.plusDI) {
        rawScore += 10;
        reasons.push(`ADX(15m)=${tf15m.indicators.adx14} vượt ngưỡng trend (${adxTrendThreshold}), xác nhận lực bán chủ động (-DI > +DI)`);
      }
    }

    // SMC Confirmation
    const targetSmcSide: 'BULLISH' | 'BEARISH' = bias === 'LONG' ? 'BULLISH' : 'BEARISH';
    if (tf5m.smc.bos.detected && tf5m.smc.bos.side === targetSmcSide) {
      rawScore += 10;
      reasons.push(`Phát hiện BOS (Break of Structure) hướng ${bias} trên M5`);
    }

    if (tf5m.smc.liquiditySweep.detected && tf5m.smc.liquiditySweep.side === targetSmcSide) {
      rawScore += 12;
      reasons.push(`Phát hiện Liquidity Sweep (quét thanh khoản) đảo chiều thuận hướng ${bias}`);
    }

    if (tf15m.smc.fvg.detected && tf15m.smc.fvg.side === targetSmcSide) {
      rawScore += 8;
      reasons.push(`Tồn tại vùng FVG (Fair Value Gap) mất cân bằng hỗ trợ đà ${bias}`);
    }

    // Cost & Friction Headroom Check using dynamic minAtrRatio
    const atr1m = tf1m.indicators.atr14;
    if (atr1m > breakEvenMoveDollars * minAtrRatio) {
      rawScore += 6;
      reasons.push(`Biên độ nến 1m ($${atr1m}) gấp ${(atr1m / breakEvenMoveDollars).toFixed(1)}x chi phí giao dịch (ngưỡng đệm: ${minAtrRatio}x)`);
    } else {
      rawScore -= 15;
      reasons.push(`Biên độ nến 1m ($${atr1m}) chưa đạt đệm an toàn ${minAtrRatio}x so với chi phí vào/ra lệnh ($${breakEvenMoveDollars})`);
    }

    // Fast Auto-Trading: Conflict resolution favoring micro-momentum over macro pause
    if (conflictDetected) {
      if (microTrend === 'BULLISH' || tf1m.indicators.ema9 >= tf1m.indicators.ema21) {
        bias = 'LONG';
        reasons.push('Fast Scalp: Ưu tiên động lượng vi mô M1/M5 hướng Long trong nhịp hồi');
      } else {
        bias = 'SHORT';
        reasons.push('Fast Scalp: Ưu tiên động lượng vi mô M1/M5 hướng Short trong nhịp điều chỉnh');
      }
      rawScore -= 12;
    }

    if (overallRegime === 'ABNORMAL_MARKET') {
      rawScore -= 10;
      reasons.push('Thị trường biên độ mạnh - kích hoạt chiến lược Volatility Scalp');
    }

    const confidenceScore = Math.max(20, Math.min(95, Math.round(rawScore)));
    const isProvisional = tf1m.isProvisional || tf5m.isProvisional;

    // Synthesize TradingAgents 6-Specialist Multi-Agent Analysis
    const tradingAgentsAnalysts = synthesizeMultiAgentAnalysis(
      symbol,
      { '1m': c1m, '5m': c5m, '15m': c15m, '1H': c1h, '4H': c4h },
      currentTicker
    );

    const result: MarketAnalysisResult = {
      symbol,
      timestamp: now,
      currentPrice: lastPrice,
      overallRegime,
      bias,
      confidenceScore,
      macroTrend,
      intermediateTrend,
      microTrend,
      conflict: {
        detected: conflictDetected,
        description: conflictDescription,
      },
      timeframes,
      costs,
      reasons,
      isProvisional,
      analysisLatencyMs: Math.round(performance.now() - startTime),
    };

    (result as any).tradingAgentsAnalysts = tradingAgentsAnalysts;

    // Cache result for 5 seconds
    this.analysisCache.set(cacheKey, {
      result,
      expiresAt: now + 5000,
    });

    return result;
  }

  /**
   * BOT 2 PRIMARY PIPELINE METHOD: bot2_analyzeTechnicals
   * Independently receives price & volume payload from Bot 1 ->
   * Calculates MTF indicators (EMA, RSI, ATR, Trend, SMC) with dynamic parameters ->
   * Packages Technical Payload for Bot 3
   */
  public async bot2_analyzeTechnicals(bot1Payload: Bot1ScanPayload): Promise<Bot2TechnicalsPayload> {
    const candidate = bot1Payload.selectedCandidate;
    const ticker: TickerData = {
      symbol: candidate.symbol,
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

    const analysis = await this.analyzeMarket(candidate.symbol, ticker);

    const payload: Bot2TechnicalsPayload = {
      stage: 'BOT2_ANALYZE_TECHNICALS',
      timestamp: Date.now(),
      symbol: candidate.symbol,
      currentPrice: analysis.currentPrice,
      overallRegime: analysis.overallRegime,
      bias: analysis.bias,
      confidenceScore: analysis.confidenceScore,
      macroTrend: analysis.macroTrend,
      intermediateTrend: analysis.intermediateTrend,
      microTrend: analysis.microTrend,
      timeframes: analysis.timeframes,
      conflict: analysis.conflict,
      reasons: analysis.reasons,
      activeParameters: { ...this.tunableParams },
      analysisLatencyMs: analysis.analysisLatencyMs,
      tradingAgentsAnalysts: (analysis as any).tradingAgentsAnalysts,
    };

    return payload;
  }

}

export const bot2Analyst = new Bot2MarketAnalyst();
