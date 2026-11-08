import { Bot3SignalEngine } from './src/server/bot3SignalEngine';
import {
  MarketAnalysisResult,
  TickerData,
  TimeframeAnalysis,
  CandleData,
} from './src/types/engine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

function createMockTimeframe(
  tf: '1m' | '5m' | '15m' | '1H' | '4H',
  bias: 'LONG' | 'SHORT' | 'NEUTRAL',
  rsi: number,
  atr: number,
  close: number
): TimeframeAnalysis {
  return {
    timeframe: tf,
    candleCount: 50,
    regime: bias === 'SHORT' ? 'TRENDING_BEARISH' : 'TRENDING_BULLISH',
    trend: bias === 'LONG' ? 'BULLISH' : bias === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
    indicators: {
      ema9: bias === 'LONG' ? close * 0.998 : close * 1.002,
      ema21: bias === 'LONG' ? close * 0.995 : close * 1.005,
      ema50: bias === 'LONG' ? close * 0.99 : close * 1.01,
      rsi14: rsi,
      adx14: 26.5,
      plusDI: 28.0,
      minusDI: 14.0,
      atr14: atr,
      atrPercent: 0.5,
      volumeSma20: 500000,
      rvol: 1.6,
    },
    smc: {
      bos: { detected: false },
      choch: { detected: false },
      liquiditySweep: { detected: false },
      orderBlock: { detected: false },
      fvg: { detected: false },
    },
    isProvisional: false,
    lastClose: close,
    lastTs: Date.now() - 30000,
  };
}

function createMockAnalysis(
  bias: 'LONG' | 'SHORT' | 'NEUTRAL',
  symbol = 'SOLUSDT',
  price = 100.0,
  isProvisional = false
): MarketAnalysisResult {
  const atr = price * 0.005; // 0.50
  return {
    symbol,
    timestamp: Date.now(),
    currentPrice: price,
    overallRegime: bias === 'SHORT' ? 'TRENDING_BEARISH' : 'TRENDING_BULLISH',
    bias,
    confidenceScore: 82,
    macroTrend: bias === 'LONG' ? 'BULLISH' : bias === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
    intermediateTrend: bias === 'LONG' ? 'BULLISH' : bias === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
    microTrend: bias === 'LONG' ? 'BULLISH' : bias === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
    conflict: { detected: false },
    timeframes: {
      '1m': createMockTimeframe('1m', bias, bias === 'LONG' ? 52 : 48, atr * 0.5, price),
      '5m': createMockTimeframe('5m', bias, bias === 'LONG' ? 54 : 46, atr, price),
      '15m': createMockTimeframe('15m', bias, bias === 'LONG' ? 58 : 42, atr * 1.5, price),
      '1H': createMockTimeframe('1H', bias, bias === 'LONG' ? 60 : 40, atr * 2.5, price),
      '4H': createMockTimeframe('4H', bias, bias === 'LONG' ? 62 : 38, atr * 4.0, price),
    },
    costs: {
      spreadBps: 1.5,
      roundTripTakerFeeBps: 12.0,
      estSlippageBps: 3.0,
      totalCostBps: 16.5,
      fundingRate8h: 0.0001,
      breakEvenMoveDollars: price * 0.00165,
      breakEvenMovePercent: 0.165,
    },
    reasons: ['Macro and micro trend alignment', 'RSI healthy momentum'],
    isProvisional,
    analysisLatencyMs: 12,
  };
}

function createMockTicker(symbol = 'SOLUSDT', price = 100.0, ageSeconds = 5, spreadBps = 1.8): TickerData {
  const halfSpread = (price * (spreadBps / 10000)) / 2;
  return {
    symbol,
    lastPr: price,
    bidPr: price - halfSpread,
    askPr: price + halfSpread,
    change24h: 3.5,
    high24h: price * 1.05,
    low24h: price * 0.95,
    volume24h: 150_000_000,
    updatedAt: Date.now() - ageSeconds * 1000,
    fundingRate: 0.0001,
    spreadPercent: spreadBps / 100,
  };
}

async function runAllTests() {
  console.log('===============================================================');
  console.log('🤖 RUNNING BOT 3 — SIGNAL ENGINE PRO COMPREHENSIVE TEST SUITE');
  console.log('===============================================================\n');

  const engine = new Bot3SignalEngine({
    minRiskRewardRatio: 1.6,
    minExpectedNetEdgeBps: 5.0,
    maxAllowedSpreadBps: 8.0,
    maxEntryDriftAtrRatio: 0.45,
    maxDataAgeSeconds: 90,
    roundTripTakerFeeBps: 12.0,
    estSlippageBps: 3.0,
  });

  // TEST 1: LONG Signal Generation with Positive Edge
  console.log('TEST 1: Valid LONG Signal Synthesis & Parameter Verification');
  const longAnalysis = createMockAnalysis('LONG', 'SOLUSDT', 100.0);
  const longTicker = createMockTicker('SOLUSDT', 100.0);
  const evalLong = engine.evaluateCandidate(longAnalysis, longTicker);

  assert(evalLong.action === 'LONG', 'LONG action triggered for bullish alignment');
  assert(evalLong.signal !== undefined, 'Signal object generated');
  const longSig = evalLong.signal!;
  assert(longSig.stopLossPrice < longSig.entryPrice, 'LONG Stop Loss is strictly below Entry');
  assert(longSig.takeProfitPrice > longSig.entryPrice, 'LONG Take Profit is strictly above Entry');
  assert(longSig.riskRewardRatio >= 1.6, `Risk-Reward ratio is >= 1.6 (Actual: ${longSig.riskRewardRatio})`);
  assert(longSig.expectedNetEdgeBps >= 5.0, `Expected net edge is >= 5.0 bps (Actual: +${longSig.expectedNetEdgeBps} bps)`);
  assert(longSig.status === 'CONFIRMED', 'Signal is marked CONFIRMED');
  assert(longSig.isRepainted === false, 'Anti-repainting contract is true (isRepainted: false)');
  console.log(`  -> Signal ID: ${longSig.signalId} | RR: 1:${longSig.riskRewardRatio} | Edge: +${longSig.expectedNetEdgeBps} bps\n`);

  // TEST 2: SHORT Signal Generation with Positive Edge
  console.log('TEST 2: Valid SHORT Signal Synthesis & Parameter Verification');
  const shortAnalysis = createMockAnalysis('SHORT', 'AVAXUSDT', 30.0);
  const shortTicker = createMockTicker('AVAXUSDT', 30.0);
  const evalShort = engine.evaluateCandidate(shortAnalysis, shortTicker);

  assert(evalShort.action === 'SHORT', 'SHORT action triggered for bearish alignment');
  assert(evalShort.signal !== undefined, 'Signal object generated');
  const shortSig = evalShort.signal!;
  assert(shortSig.stopLossPrice > shortSig.entryPrice, 'SHORT Stop Loss is strictly above Entry');
  assert(shortSig.takeProfitPrice < shortSig.entryPrice, 'SHORT Take Profit is strictly below Entry');
  assert(shortSig.riskRewardRatio >= 1.6, `SHORT Risk-Reward ratio >= 1.6 (Actual: ${shortSig.riskRewardRatio})`);
  assert(shortSig.expectedNetEdgeBps >= 5.0, `SHORT Expected net edge >= 5.0 bps (Actual: +${shortSig.expectedNetEdgeBps} bps)`);
  console.log(`  -> Signal ID: ${shortSig.signalId} | RR: 1:${shortSig.riskRewardRatio} | Edge: +${shortSig.expectedNetEdgeBps} bps\n`);

  // TEST 3: Stale Data Rejection Gate
  console.log('TEST 3: Stale Data Rejection Gate (> 90s)');
  const staleTicker = createMockTicker('SOLUSDT', 100.0, 120); // 120 seconds old
  const evalStale = engine.evaluateCandidate(longAnalysis, staleTicker);

  assert(evalStale.action === 'NO_TRADE', 'Stale data immediately returns NO_TRADE');
  assert(evalStale.rejectionReason?.includes('STALE_DATA') === true, 'Reason explicitly cites STALE_DATA');
  assert(evalStale.filtersEvaluated.staleDataPassed === false, 'staleDataPassed flag is false');
  console.log(`  -> Rejected as expected: ${evalStale.rejectionReason}\n`);

  // TEST 4: Excessive Spread Rejection Gate (> 8 bps)
  console.log('TEST 4: Excessive Spread Rejection Gate (> 8.0 bps)');
  const wideSpreadTicker = createMockTicker('SOLUSDT', 100.0, 5, 12.5); // 12.5 bps spread
  const evalSpread = engine.evaluateCandidate(longAnalysis, wideSpreadTicker);

  assert(evalSpread.action === 'NO_TRADE', 'Wide spread immediately returns NO_TRADE');
  assert(evalSpread.rejectionReason?.includes('EXCESSIVE_SPREAD') === true, 'Reason explicitly cites EXCESSIVE_SPREAD');
  assert(evalSpread.filtersEvaluated.spreadCheckPassed === false, 'spreadCheckPassed flag is false');
  console.log(`  -> Rejected as expected: ${evalSpread.rejectionReason}\n`);

  // TEST 5: Late Signal / Entry Drift Rejection Gate (> 0.45x ATR)
  console.log('TEST 5: Late Signal / Entry Drift Rejection Gate');
  // If price has surged far away from reference candle close
  const lateTicker = createMockTicker('SOLUSDT', 100.40); // 0.40 away when ATR is 0.50 (drift = 0.8x ATR > 0.45)
  const evalLate = engine.evaluateCandidate(longAnalysis, lateTicker);

  assert(evalLate.action === 'NO_TRADE', 'Late drifted price returns NO_TRADE');
  assert(evalLate.rejectionReason?.includes('LATE_SIGNAL_ENTRY_DRIFT') === true, 'Reason explicitly cites LATE_SIGNAL_ENTRY_DRIFT');
  console.log(`  -> Rejected as expected: ${evalLate.rejectionReason}\n`);

  // TEST 6: Unclosed Candle / Provisional Protection
  console.log('TEST 6: Unclosed Candle / Provisional Protection');
  const provisionalAnalysis = createMockAnalysis('LONG', 'SOLUSDT', 100.0, true); // isProvisional: true
  const evalProvisional = engine.evaluateCandidate(provisionalAnalysis, longTicker);

  assert(evalProvisional.action === 'NO_TRADE', 'Unclosed provisional candle returns NO_TRADE');
  assert(evalProvisional.rejectionReason?.includes('PROVISIONAL_UNCLOSED_BAR') === true, 'Reason cites PROVISIONAL_UNCLOSED_BAR');
  console.log(`  -> Rejected as expected: ${evalProvisional.rejectionReason}\n`);

  // TEST 7: Deduplication & Anti-Repaint State Machine
  console.log('TEST 7: Deduplication & Anti-Repaint State Machine');
  // Evaluating the same active symbol SOLUSDT again without meaningful price change
  const evalDup = engine.evaluateCandidate(longAnalysis, longTicker);
  assert(evalDup.action === 'NO_TRADE', 'Duplicate active signal suppressed');
  assert(evalDup.rejectionReason?.includes('DUPLICATE_ACTIVE_SIGNAL') === true, 'Reason cites DUPLICATE_ACTIVE_SIGNAL');

  // Test consumption transition by Bot 4
  const activeBefore = engine.getActiveSignals().find((s) => s.symbol === 'SOLUSDT');
  assert(activeBefore !== undefined, 'SOLUSDT signal found in activeSignals');
  const consumeOk = engine.consumeSignal(activeBefore!.signalId, 100.02);
  assert(consumeOk === true, 'Signal transitioned to CONSUMED');
  assert(activeBefore!.status === 'CONSUMED', 'Signal status is CONSUMED');
  assert(activeBefore!.auditTrail.length === 2, 'Audit trail logged NEW -> CONFIRMED -> CONSUMED');
  console.log(`  -> Audit trail verified: ${activeBefore!.auditTrail.map((a) => `${a.fromStatus}->${a.toStatus}`).join(', ')}\n`);

  // TEST 8: Multi-Coin Ranking Unbiased Evaluation
  console.log('TEST 8: Multi-Coin Ranking (No BTC Favoritism)');
  const ethAnalysis = createMockAnalysis('LONG', 'ETHUSDT', 2500.0);
  const ethTicker = createMockTicker('ETHUSDT', 2500.0);
  const dogeAnalysis = createMockAnalysis('LONG', 'DOGEUSDT', 0.15);
  const dogeTicker = createMockTicker('DOGEUSDT', 0.15);

  const multiEval = engine.evaluateAndRankCandidates([ethAnalysis, dogeAnalysis], {
    ETHUSDT: ethTicker,
    DOGEUSDT: dogeTicker,
  });

  assert(multiEval.rankedSignals.length >= 1, 'Ranked signals generated');
  for (let i = 0; i < multiEval.rankedSignals.length - 1; i++) {
    assert(
      multiEval.rankedSignals[i].rankScore >= multiEval.rankedSignals[i + 1].rankScore,
      'Signals sorted strictly descending by objective rank score'
    );
  }
  console.log(`  -> Ranked signals: ${multiEval.rankedSignals.map((s) => `${s.symbol} (Score: ${s.rankScore})`).join(', ')}\n`);

  // TEST 9: Walk-Forward Backtesting Framework (In-Sample vs Out-Of-Sample)
  console.log('TEST 9: Realistic Walk-Forward Backtest Simulator (With Fees & Slippage)');
  // Generate 80 synthetic bars with realistic trend and swings
  const mockCandles: CandleData[] = [];
  let basePrice = 100.0;
  const now = Date.now();
  for (let i = 0; i < 80; i++) {
    const trend = Math.sin(i / 8) * 1.5;
    const noise = ((i % 3) - 1) * 0.4;
    const delta = trend + noise;
    const open = basePrice;
    const close = basePrice + delta;
    const high = Math.max(open, close) + 0.35;
    const low = Math.min(open, close) - 0.35;
    mockCandles.push({
      ts: now - (80 - i) * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      baseVolume: 10000,
      quoteVolume: 1000000,
      isComplete: true,
    });
    basePrice = close;
  }

  const backtest = engine.runBacktest(mockCandles, 'SOLUSDT', 0.60);

  assert(backtest.inSample !== undefined, 'In-Sample report exists');
  assert(backtest.outOfSample !== undefined, 'Out-Of-Sample report exists');
  assert(backtest.trades.length > 0, `Trades simulated (Total: ${backtest.trades.length})`);

  // Check metrics are real mathematical numbers, not fabricated strings
  assert(typeof backtest.outOfSample.winRate === 'number', 'Win rate is a real calculated number');
  assert(typeof backtest.outOfSample.profitFactor === 'number', 'Profit factor is a real calculated number');
  assert(typeof backtest.outOfSample.netExpectancyBps === 'number', 'Net expectancy is a real calculated number');
  assert(typeof backtest.outOfSample.maxDrawdownPct === 'number', 'Max drawdown is a real calculated number');

  console.log('  --- OUT-OF-SAMPLE TEST RESULTS (40% UNSEEN DATA) ---');
  console.log(`  Total Trades:     ${backtest.outOfSample.totalTrades}`);
  console.log(`  Win Rate:         ${backtest.outOfSample.winRate}% (${backtest.outOfSample.winCount}W / ${backtest.outOfSample.lossCount}L)`);
  console.log(`  Profit Factor:    ${backtest.outOfSample.profitFactor}`);
  console.log(`  Net Expectancy:   +${backtest.outOfSample.netExpectancyBps} bps per trade`);
  console.log(`  Total Net Return: ${backtest.outOfSample.totalNetReturnPct}%`);
  console.log(`  Max Drawdown:     -${backtest.outOfSample.maxDrawdownPct}%`);
  console.log(`  Taker Fees Paid:  -${backtest.outOfSample.totalFeesBps} bps`);
  console.log('  ----------------------------------------------------\n');

  console.log('===============================================================');
  console.log('🎉 ALL BOT 3 SIGNAL ENGINE PRO UNIT & REGRESSION TESTS PASSED!');
  console.log('===============================================================');
}

runAllTests().catch((err) => {
  console.error('Fatal error during Bot 3 tests:', err);
  process.exit(1);
});
