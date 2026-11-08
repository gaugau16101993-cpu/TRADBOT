/**
 * TRADINGAGENTS — MULTI-AGENT ANALYST TEAM
 * Coordinates the 6 specialized analytical roles across H1/H4 (Macro Bias)
 * and M15/M5 (Micro Structure & Timing).
 */

import { CandleData, TickerData } from '../../types/engine';
import {
  Timeframe,
  TechnicalAnalystReport,
  MarketStructureReport,
  VolumeAnalystReport,
  MomentumAnalystReport,
  VolatilityAnalystReport,
  SentimentAnalystReport,
  MultiAgentAnalystSynthesis,
  OrderBlockData,
  FairValueGapData,
} from './types';

// ============================================================================
// HELPER MATH & INDICATOR FUNCTIONS
// ============================================================================

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

export function calculateATR(candles: CandleData[], period = 14): number[] {
  if (candles.length < 2) return [];
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const val = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(val);
  }

  if (tr.length < period) return tr;
  const atr: number[] = [];
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  atr.push(sum / period);

  for (let i = period; i < tr.length; i++) {
    const nextVal = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
    atr.push(nextVal);
  }
  return atr;
}

export function calculateMACD(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
  if (closes.length < 26) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdSeries.push(ema12[i] - ema26[i]);
  }

  const signalSeries = calculateEMA(macdSeries, 9);
  const latestMacd = macdSeries[macdSeries.length - 1] || 0;
  const latestSignal = signalSeries[signalSeries.length - 1] || 0;
  const histogram = latestMacd - latestSignal;

  return { macdLine: latestMacd, signalLine: latestSignal, histogram };
}

export function calculateADX(candles: CandleData[], period = 14): number {
  if (candles.length < period * 2) return 20;
  let plusDM = 0;
  let minusDM = 0;
  let tr = 0;

  for (let i = 1; i <= period; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    if (highDiff > lowDiff && highDiff > 0) plusDM += highDiff;
    if (lowDiff > highDiff && lowDiff > 0) minusDM += lowDiff;

    tr += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  if (tr === 0) return 20;
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const diSum = plusDI + minusDI;
  if (diSum === 0) return 20;

  const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;
  return Math.min(100, Math.max(0, dx));
}

// ============================================================================
// INDIVIDUAL SPECIALIST RUNNERS
// ============================================================================

export function runTechnicalAnalyst(candles: CandleData[]): TechnicalAnalystReport {
  if (candles.length < 25) {
    return {
      role: 'TECHNICAL_ANALYST',
      ema9: 0,
      ema21: 0,
      ema50: 0,
      emaCross: 'NEUTRAL',
      rsi14: 50,
      macd: { macdLine: 0, signalLine: 0, histogram: 0, trend: 'CONVERGING' },
      adx14: 15,
      isTrending: false,
      atr14: 0,
      bias: 'NEUTRAL',
      confidence: 40,
      keyInsights: ['Insufficient candle depth for reliable moving averages'],
    };
  }

  const closes = candles.map((c) => c.close);
  const ema9Series = calculateEMA(closes, 9);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, 50);

  const e9 = ema9Series[ema9Series.length - 1];
  const e21 = ema21Series[ema21Series.length - 1];
  const e50 = ema50Series[ema50Series.length - 1];
  const prevE9 = ema9Series[ema9Series.length - 2];
  const prevE21 = ema21Series[ema21Series.length - 2];

  let emaCross: TechnicalAnalystReport['emaCross'] = 'NEUTRAL';
  if (prevE9 <= prevE21 && e9 > e21) emaCross = 'BULLISH_CROSS';
  else if (prevE9 >= prevE21 && e9 < e21) emaCross = 'BEARISH_CROSS';
  else if (e9 > e21 && e21 > e50) emaCross = 'ALIGNED_BULL';
  else if (e9 < e21 && e21 < e50) emaCross = 'ALIGNED_BEAR';

  const rsiSeries = calculateRSI(closes, 14);
  const rsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : 50;

  const macd = calculateMACD(closes);
  const atrSeries = calculateATR(candles, 14);
  const atr = atrSeries.length > 0 ? atrSeries[atrSeries.length - 1] : 0;
  const adx = calculateADX(candles, 14);

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let score = 50;
  const insights: string[] = [];

  if (e9 > e21 && rsi > 50 && macd.histogram > 0) {
    bias = 'BULLISH';
    score = 75;
    insights.push(`Bullish EMA alignment (EMA9: ${e9.toFixed(2)} > EMA21: ${e21.toFixed(2)}) with positive MACD histogram`);
  } else if (e9 < e21 && rsi < 50 && macd.histogram < 0) {
    bias = 'BEARISH';
    score = 75;
    insights.push(`Bearish EMA alignment (EMA9: ${e9.toFixed(2)} < EMA21: ${e21.toFixed(2)}) with negative MACD histogram`);
  }

  if (adx >= 25) {
    insights.push(`Strong trend confirmed: ADX = ${adx.toFixed(1)}`);
    score += 10;
  } else {
    insights.push(`Low trend momentum: ADX = ${adx.toFixed(1)} (chop risk)`);
  }

  return {
    role: 'TECHNICAL_ANALYST',
    ema9: e9,
    ema21: e21,
    ema50: e50,
    emaCross,
    rsi14: rsi,
    macd: {
      ...macd,
      trend: macd.histogram > 0 ? 'BULLISH_EXPANSION' : 'BEARISH_EXPANSION',
    },
    adx14: adx,
    isTrending: adx >= 20,
    atr14: atr,
    bias,
    confidence: Math.min(95, score),
    keyInsights: insights,
  };
}

export function runMarketStructureAnalyst(candles: CandleData[], timeframe: Timeframe = '15m'): MarketStructureReport {
  if (candles.length < 20) {
    return {
      role: 'MARKET_STRUCTURE_ANALYST',
      bos: { detected: false },
      choch: { detected: false },
      liquiditySweep: { detected: false, rejected: false },
      orderBlocks: [],
      fairValueGaps: [],
      volumeImbalance: { detected: false },
      swingHigh: 0,
      swingLow: 0,
      structureBias: 'RANGING',
      confidence: 35,
      keyInsights: ['Insufficient candle history for SMC detection'],
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const currentClose = closes[closes.length - 1];

  // Swing Highs and Lows (using 5-bar pivots)
  let swingHigh = Math.max(...highs.slice(-15, -1));
  let swingLow = Math.min(...lows.slice(-15, -1));

  // BOS (Break of Structure) & CHoCH (Change of Character)
  let bosDetected = false;
  let bosType: 'BULLISH_BOS' | 'BEARISH_BOS' | undefined;
  let chochDetected = false;
  let chochType: 'BULLISH_CHOCH' | 'BEARISH_CHOCH' | undefined;

  if (currentClose > swingHigh) {
    bosDetected = true;
    bosType = 'BULLISH_BOS';
  } else if (currentClose < swingLow) {
    bosDetected = true;
    bosType = 'BEARISH_BOS';
  }

  // Liquidity Sweep Check: Did price wick beyond swing high/low then close back inside?
  let sweepDetected = false;
  let sweepSide: 'BUY_SIDE' | 'SELL_SIDE' | undefined;
  const recentHigh = highs[highs.length - 1];
  const recentLow = lows[lows.length - 1];

  if (recentHigh > swingHigh && currentClose < swingHigh) {
    sweepDetected = true;
    sweepSide = 'BUY_SIDE'; // Swept buy stops, potential bearish reversal
    chochDetected = true;
    chochType = 'BEARISH_CHOCH';
  } else if (recentLow < swingLow && currentClose > swingLow) {
    sweepDetected = true;
    sweepSide = 'SELL_SIDE'; // Swept sell stops, potential bullish reversal
    chochDetected = true;
    chochType = 'BULLISH_CHOCH';
  }

  // FAIR VALUE GAPS (FVG: 3-candle imbalance)
  const fairValueGaps: FairValueGapData[] = [];
  for (let i = candles.length - 3; i >= Math.max(0, candles.length - 15); i--) {
    const c1 = candles[i];
    const c3 = candles[i + 2];
    // Bullish FVG: Low of candle 3 is higher than High of candle 1
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      const sizePct = ((top - bottom) / bottom) * 100;
      if (sizePct >= 0.01) {
        fairValueGaps.push({
          type: 'BULLISH_FVG',
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          sizePercent: sizePct,
          filled: currentClose < bottom,
          timeframe,
        });
      }
    }
    // Bearish FVG: High of candle 3 is lower than Low of candle 1
    else if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      const sizePct = ((top - bottom) / bottom) * 100;
      if (sizePct >= 0.01) {
        fairValueGaps.push({
          type: 'BEARISH_FVG',
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          sizePercent: sizePct,
          filled: currentClose > top,
          timeframe,
        });
      }
    }
  }

  // ORDER BLOCKS (OB: Last counter candle before displacement impulse)
  const orderBlocks: OrderBlockData[] = [];
  for (let i = candles.length - 4; i >= Math.max(0, candles.length - 16); i--) {
    const candle = candles[i];
    const nextCandle = candles[i + 1];
    const impulse = Math.abs(nextCandle.close - nextCandle.open);
    const avgBody = (Math.abs(candle.close - candle.open) + impulse) / 2;

    if (impulse > avgBody * 1.5) {
      if (nextCandle.close > nextCandle.open && candle.close < candle.open) {
        orderBlocks.push({
          type: 'BULLISH_OB',
          high: candle.high,
          low: candle.low,
          mitigated: currentClose < candle.low,
          strength: 80,
          timeframe,
        });
      } else if (nextCandle.close < nextCandle.open && candle.close > candle.open) {
        orderBlocks.push({
          type: 'BEARISH_OB',
          high: candle.high,
          low: candle.low,
          mitigated: currentClose > candle.high,
          strength: 80,
          timeframe,
        });
      }
    }
  }

  const primaryOB = orderBlocks.find((ob) => !ob.mitigated);
  const primaryFVG = fairValueGaps.find((fvg) => !fvg.filled);

  let structureBias: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (bosType === 'BULLISH_BOS' || (sweepDetected && sweepSide === 'SELL_SIDE')) {
    structureBias = 'BULLISH';
  } else if (bosType === 'BEARISH_BOS' || (sweepDetected && sweepSide === 'BUY_SIDE')) {
    structureBias = 'BEARISH';
  }

  const insights: string[] = [];
  if (bosDetected) insights.push(`Break of Structure confirmed: ${bosType}`);
  if (sweepDetected) insights.push(`Liquidity Sweep detected on ${sweepSide} at level ${(sweepSide === 'BUY_SIDE' ? swingHigh : swingLow).toFixed(2)}`);
  if (primaryOB) insights.push(`Active ${primaryOB.type} identified at [${primaryOB.low.toFixed(2)} - ${primaryOB.high.toFixed(2)}]`);
  if (primaryFVG) insights.push(`Unmitigated ${primaryFVG.type} identified with midpoint ${primaryFVG.midpoint.toFixed(2)}`);

  return {
    role: 'MARKET_STRUCTURE_ANALYST',
    bos: { detected: bosDetected, type: bosType, level: bosType === 'BULLISH_BOS' ? swingHigh : swingLow },
    choch: { detected: chochDetected, type: chochType, level: chochType === 'BULLISH_CHOCH' ? swingLow : swingHigh },
    liquiditySweep: { detected: sweepDetected, side: sweepSide, level: sweepSide === 'BUY_SIDE' ? swingHigh : swingLow, rejected: sweepDetected },
    orderBlocks,
    primaryOrderBlock: primaryOB,
    fairValueGaps,
    primaryFVG,
    volumeImbalance: { detected: false },
    swingHigh,
    swingLow,
    structureBias,
    confidence: structureBias !== 'RANGING' ? 85 : 50,
    keyInsights: insights,
  };
}

export function runVolumeAnalyst(candles: CandleData[]): VolumeAnalystReport {
  if (candles.length < 20) {
    return {
      role: 'VOLUME_ANALYST',
      rvol: 1.0,
      isHighVolume: false,
      buyingVolumePercent: 50,
      sellingVolumePercent: 50,
      volumeTrend: 'FLAT',
      volumeConfirmation: false,
      confidence: 50,
      keyInsights: ['Insufficient volume history'],
    };
  }

  const getVol = (c: CandleData) => c.quoteVolume || c.baseVolume || c.volume || 0;
  const volumes = candles.map(getVol);
  const recentVolume = volumes[volumes.length - 1];
  const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const rvol = avgVolume20 > 0 ? recentVolume / avgVolume20 : 1.0;

  // Buy vs Sell Delta estimation based on candle close location within high-low range
  let buyingVolSum = 0;
  let sellingVolSum = 0;
  for (const c of candles.slice(-5)) {
    const range = Math.max(0.00001, c.high - c.low);
    const closeLocation = (c.close - c.low) / range; // 0 (closed on low) to 1 (closed on high)
    const v = getVol(c);
    buyingVolSum += v * closeLocation;
    sellingVolSum += v * (1 - closeLocation);
  }

  const totalVol = Math.max(1, buyingVolSum + sellingVolSum);
  const buyingPercent = (buyingVolSum / totalVol) * 100;
  const sellingPercent = (sellingVolSum / totalVol) * 100;

  let trend: 'ACCUMULATION' | 'DISTRIBUTION' | 'EXHAUSTION' | 'FLAT' = 'FLAT';
  if (rvol >= 1.3 && buyingPercent > 58) trend = 'ACCUMULATION';
  else if (rvol >= 1.3 && sellingPercent > 58) trend = 'DISTRIBUTION';
  else if (rvol >= 2.5) trend = 'EXHAUSTION';

  const insights: string[] = [
    `RVOL: ${rvol.toFixed(2)}x (20-period baseline)`,
    `Buyer delta: ${buyingPercent.toFixed(1)}% | Seller delta: ${sellingPercent.toFixed(1)}%`,
    `Volume regime: ${trend}`,
  ];

  return {
    role: 'VOLUME_ANALYST',
    rvol,
    isHighVolume: rvol >= 1.3,
    buyingVolumePercent: buyingPercent,
    sellingVolumePercent: sellingPercent,
    volumeTrend: trend,
    volumeConfirmation: rvol >= 1.2 && (buyingPercent > 55 || sellingPercent > 55),
    confidence: Math.min(90, Math.floor(50 + rvol * 15)),
    keyInsights: insights,
  };
}

export function runMomentumAnalyst(candles: CandleData[]): MomentumAnalystReport {
  if (candles.length < 25) {
    return {
      role: 'MOMENTUM_ANALYST',
      rsiSlope: 0,
      macdVelocity: 0,
      roc10: 0,
      momentumState: 'NEUTRAL',
      divergenceDetected: false,
      confidence: 45,
      keyInsights: ['Insufficient candle bars for momentum derivatives'],
    };
  }

  const closes = candles.map((c) => c.close);
  const rsiSeries = calculateRSI(closes, 14);
  const rsiNow = rsiSeries[rsiSeries.length - 1];
  const rsiPrev3 = rsiSeries[rsiSeries.length - 4] || rsiNow;
  const rsiSlope = (rsiNow - rsiPrev3) / 3;

  const macd = calculateMACD(closes);
  const macdPrev = calculateMACD(closes.slice(0, -3));
  const macdVelocity = macd.histogram - macdPrev.histogram;

  const cNow = closes[closes.length - 1];
  const cPrev10 = closes[closes.length - 11] || cNow;
  const roc10 = ((cNow - cPrev10) / cPrev10) * 100;

  // Divergence check
  let divergenceDetected = false;
  let divergenceType: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | undefined;

  const priceTrend = cNow - closes[closes.length - 6];
  const rsiDelta = rsiNow - rsiSeries[rsiSeries.length - 6];

  if (priceTrend < 0 && rsiDelta > 4) {
    divergenceDetected = true;
    divergenceType = 'BULLISH_DIVERGENCE';
  } else if (priceTrend > 0 && rsiDelta < -4) {
    divergenceDetected = true;
    divergenceType = 'BEARISH_DIVERGENCE';
  }

  let momentumState: MomentumAnalystReport['momentumState'] = 'NEUTRAL';
  if (divergenceDetected) {
    momentumState = divergenceType === 'BULLISH_DIVERGENCE' ? 'BULL_DIV' : 'BEAR_DIV';
  } else if (rsiSlope > 1.2 && macdVelocity > 0 && roc10 > 0.4) {
    momentumState = 'STRONG_BULL';
  } else if (rsiSlope < -1.2 && macdVelocity < 0 && roc10 < -0.4) {
    momentumState = 'STRONG_BEAR';
  }

  const insights: string[] = [
    `RSI Slope: ${rsiSlope.toFixed(2)} pts/bar (Current: ${rsiNow.toFixed(1)})`,
    `MACD Velocity: ${macdVelocity.toFixed(4)}`,
    `ROC(10): ${roc10 >= 0 ? '+' : ''}${roc10.toFixed(2)}%`,
  ];
  if (divergenceDetected) {
    insights.push(`🚨 Momentum Divergence: ${divergenceType}`);
  }

  return {
    role: 'MOMENTUM_ANALYST',
    rsiSlope,
    macdVelocity,
    roc10,
    momentumState,
    divergenceDetected,
    divergenceType,
    confidence: divergenceDetected ? 88 : momentumState !== 'NEUTRAL' ? 78 : 50,
    keyInsights: insights,
  };
}

export function runVolatilityAnalyst(candles: CandleData[]): VolatilityAnalystReport {
  if (candles.length < 20) {
    return {
      role: 'VOLATILITY_ANALYST',
      atrPercent: 0.2,
      atrPercentile20: 50,
      bollingerBandwidth: 1.0,
      squeezeStatus: 'EXPANSION',
      volatilityRegime: 'NORMAL',
      isSafeToExecute: true,
      confidence: 50,
      keyInsights: ['Default volatility settings applied'],
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const atrSeries = calculateATR(candles, 14);
  const atr = atrSeries[atrSeries.length - 1] || 1;
  const atrPercent = (atr / currentPrice) * 100;

  // Bollinger Bandwidth calculation
  const closes = candles.map((c) => c.close).slice(-20);
  const sma20 = closes.reduce((a, b) => a + b, 0) / 20;
  const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);
  const upperBB = sma20 + 2 * stdDev;
  const lowerBB = sma20 - 2 * stdDev;
  const bandwidth = ((upperBB - lowerBB) / sma20) * 100;

  let squeezeStatus: VolatilityAnalystReport['squeezeStatus'] = 'EXPANSION';
  let volatilityRegime: VolatilityAnalystReport['volatilityRegime'] = 'NORMAL';

  if (bandwidth < 0.6) {
    squeezeStatus = 'SQUEEZE_ON';
    volatilityRegime = 'COMPRESSION';
  } else if (bandwidth > 2.2) {
    squeezeStatus = 'EXPANSION';
    volatilityRegime = 'EXPANSION';
  }

  const isSafe = atrPercent <= 4.0 && bandwidth <= 6.0; // Filter out flash-crash mania

  return {
    role: 'VOLATILITY_ANALYST',
    atrPercent,
    atrPercentile20: Math.min(100, Math.floor(atrPercent * 30)),
    bollingerBandwidth: bandwidth,
    squeezeStatus,
    volatilityRegime,
    isSafeToExecute: isSafe,
    confidence: isSafe ? 80 : 40,
    keyInsights: [
      `ATR%: ${atrPercent.toFixed(3)}% ($${atr.toFixed(4)})`,
      `Bollinger Bandwidth: ${bandwidth.toFixed(2)}% (${squeezeStatus})`,
      `Execution safety status: ${isSafe ? 'APPROVED' : 'REJECTED_EXTREME_VOLATILITY'}`,
    ],
  };
}

export function runSentimentAnalyst(ticker: TickerData): SentimentAnalystReport {
  const fundingRate = ticker.fundingRate || 0.0001; // default 0.01%
  const change24h = ticker.change24h || 0;

  let fundingBias: SentimentAnalystReport['fundingBias'] = 'NORMAL';
  let crowdTrapRisk: SentimentAnalystReport['crowdTrapRisk'] = 'LOW';
  let sentimentScore = 50;

  // Funding Rate Analysis (Every 8h on Bitget Futures)
  if (fundingRate >= 0.0005) { // >= +0.05% per 8h
    fundingBias = 'EXTREME_LONG_CROWDED';
    crowdTrapRisk = 'HIGH_LONG_TRAP_RISK';
    sentimentScore = 80;
  } else if (fundingRate <= -0.0004) { // <= -0.04% per 8h
    fundingBias = 'EXTREME_SHORT_CROWDED';
    crowdTrapRisk = 'HIGH_SHORT_TRAP_RISK';
    sentimentScore = 20;
  } else {
    sentimentScore = Math.min(85, Math.max(15, 50 + change24h * 3));
  }

  const insights: string[] = [
    `Bitget 8h Funding Rate: ${(fundingRate * 100).toFixed(4)}% (${fundingBias})`,
    `24h Momentum: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`,
    `Crowded sentiment trap risk: ${crowdTrapRisk}`,
  ];

  return {
    role: 'SENTIMENT_ANALYST',
    fundingRate8h: fundingRate,
    fundingBias,
    change24h,
    sentimentScore,
    crowdTrapRisk,
    confidence: 82,
    keyInsights: insights,
  };
}

// ============================================================================
// COMPREHENSIVE MULTI-AGENT SYNTHESIS
// ============================================================================

export function synthesizeMultiAgentAnalysis(
  symbol: string,
  timeframeCandles: {
    '1m'?: CandleData[];
    '5m'?: CandleData[];
    '15m'?: CandleData[];
    '1H'?: CandleData[];
    '4H'?: CandleData[];
  },
  ticker: TickerData
): MultiAgentAnalystSynthesis {
  const m15Candles = timeframeCandles['15m'] || timeframeCandles['5m'] || [];
  const h1Candles = timeframeCandles['1H'] || [];
  const h4Candles = timeframeCandles['4H'] || [];
  const m5Candles = timeframeCandles['5m'] || [];

  const currentPrice = ticker.lastPr || (m15Candles.length > 0 ? m15Candles[m15Candles.length - 1].close : 0);

  // Check data integrity
  if (m15Candles.length < 15) {
    return {
      symbol,
      timestamp: Date.now(),
      currentPrice,
      timeframesEvaluated: ['15m'],
      macroBiasH1: 'NEUTRAL',
      macroConfirmationH4: 'NEUTRAL',
      setupStructureM15: 'NEUTRAL',
      executionTimingM5: 'NEUTRAL',
      isMultiTimeframeAligned: false,
      specialists: {
        technical: runTechnicalAnalyst(m15Candles),
        marketStructure: runMarketStructureAnalyst(m15Candles, '15m'),
        volume: runVolumeAnalyst(m15Candles),
        momentum: runMomentumAnalyst(m15Candles),
        volatility: runVolatilityAnalyst(m15Candles),
        sentiment: runSentimentAnalyst(ticker),
      },
      overallAnalystScore: 0,
      dataIntegrityPassed: false,
      rejectionReason: 'INSUFFICIENT_DATA_BARS: Minimum 15 candles required across timeframes',
    };
  }

  // 1. Run 6 Specialists on primary working timeframe (M15)
  const technical = runTechnicalAnalyst(m15Candles);
  const marketStructure = runMarketStructureAnalyst(m15Candles, '15m');
  const volume = runVolumeAnalyst(m15Candles);
  const momentum = runMomentumAnalyst(m15Candles);
  const volatility = runVolatilityAnalyst(m15Candles);
  const sentiment = runSentimentAnalyst(ticker);

  // 2. Multi-Timeframe Alignment
  const h1Tech = h1Candles.length >= 10 ? runTechnicalAnalyst(h1Candles) : technical;
  const h4Tech = h4Candles.length >= 8 ? runTechnicalAnalyst(h4Candles) : h1Tech;
  const m5Tech = m5Candles.length >= 10 ? runTechnicalAnalyst(m5Candles) : technical;

  const macroBiasH1 = h1Tech.bias;
  const macroConfirmationH4 = h4Tech.bias;
  const setupStructureM15 = marketStructure.structureBias === 'RANGING' ? technical.bias : marketStructure.structureBias;
  const executionTimingM5 = m5Tech.bias;

  const isMultiTimeframeAligned =
    (macroBiasH1 === 'BULLISH' && setupStructureM15 === 'BULLISH') ||
    (macroBiasH1 === 'BEARISH' && setupStructureM15 === 'BEARISH');

  // 3. Weighted Composite Analyst Score (-100 to +100)
  let score = 0;
  // Technical: 25% weight
  if (technical.bias === 'BULLISH') score += 25;
  else if (technical.bias === 'BEARISH') score -= 25;

  // Market Structure (SMC): 30% weight
  if (marketStructure.structureBias === 'BULLISH') score += 30;
  else if (marketStructure.structureBias === 'BEARISH') score -= 30;

  // Volume: 15% weight
  if (volume.volumeTrend === 'ACCUMULATION') score += 15;
  else if (volume.volumeTrend === 'DISTRIBUTION') score -= 15;

  // Momentum: 15% weight
  if (momentum.momentumState === 'STRONG_BULL' || momentum.momentumState === 'BULL_DIV') score += 15;
  else if (momentum.momentumState === 'STRONG_BEAR' || momentum.momentumState === 'BEAR_DIV') score -= 15;

  // Sentiment: 15% weight (contrarian check)
  if (sentiment.fundingBias === 'EXTREME_SHORT_CROWDED') score += 15; // Short squeeze potential
  else if (sentiment.fundingBias === 'EXTREME_LONG_CROWDED') score -= 15; // Long squeeze potential

  return {
    symbol,
    timestamp: Date.now(),
    currentPrice,
    timeframesEvaluated: ['5m', '15m', '1H'],
    macroBiasH1,
    macroConfirmationH4,
    setupStructureM15,
    executionTimingM5,
    isMultiTimeframeAligned,
    specialists: {
      technical,
      marketStructure,
      volume,
      momentum,
      volatility,
      sentiment,
    },
    overallAnalystScore: Math.max(-100, Math.min(100, score)),
    dataIntegrityPassed: true,
  };
}
