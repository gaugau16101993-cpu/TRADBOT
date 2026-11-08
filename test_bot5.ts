import { Bot5LossAnalysisEngine } from './src/server/bot5LossAnalysis';
import { Bot2MarketAnalyst } from './src/server/bot2Analyst';
import { ClosedTradeLogPayload } from './src/types/pipeline';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exit(1);
  }
}

async function runBot5TestSuite() {
  console.log('===============================================================');
  console.log('🧠 BOT 5 — LOSING POST-MORTEM & ADAPTIVE FEEDBACK TEST SUITE');
  console.log('===============================================================\n');

  const bot2 = new Bot2MarketAnalyst();
  const bot5 = new Bot5LossAnalysisEngine(bot2);

  // Initial State Check
  console.log('▶ TEST 1: Initial Bot 5 & Bot 2 Parameter Synchronization');
  const initialParams = bot5.getParameters();
  const bot2Params = bot2.getTunableParameters();
  assert(initialParams.version === 1, 'Initial Bot 5 parameter version is 1');
  assert(bot2Params.rsiLongMax === 68, 'Bot 2 rsiLongMax is 68');
  assert(bot2Params.minAtrRatio === 1.8, 'Bot 2 minAtrRatio is 1.8');
  assert(bot2Params.minConfidenceScore === 70, 'Bot 2 minConfidenceScore is 70');

  // TEST 2: Healthy Win Analysis (Fee deducted, strictly positive net profit)
  console.log('\n▶ TEST 2: Healthy Win Analysis');
  const winningTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-WIN-01',
    symbol: 'BTCUSDT',
    side: 'LONG',
    entryPrice: 80000.0,
    exitPrice: 80200.0,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 120000,
    exitTime: Date.now(),
    durationSeconds: 120,
    grossPnL: 0.025,
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0001,
    totalCosts: 0.0121,
    netPnL: 0.0129, // strictly positive net profit
    roePct: 0.645,
    closeReason: 'NET_PNL_POSITIVE_TRIGGER',
    entryIndicators: {
      rsi5m: 54.0,
      atr1m: 12.0,
      spreadBps: 2.0,
      confidenceScore: 84,
    },
  };

  const winPayload = bot5.bot5_runLossAnalysis(winningTrade);
  assert(!winPayload.postMortem.isLoss, 'Win recognized as non-loss');
  assert(winPayload.postMortem.category === 'HEALTHY_WIN', 'Category is HEALTHY_WIN');
  assert(winPayload.metrics.totalWins === 1, 'Total wins count is 1');
  assert(winPayload.metrics.totalRealizedNetProfit > 0, 'Realized net profit is positive');

  // TEST 3: Slippage / Spread Drag Diagnosis
  // Scenario: Gross PnL was slightly positive (+0.002), but fees (-0.012) turned it into Net Loss (-0.010)
  console.log('\n▶ TEST 3: Slippage & Spread Drag Diagnosis');
  const slippageTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-SLIP-01',
    symbol: 'ETHUSDT',
    side: 'LONG',
    entryPrice: 2500.0,
    exitPrice: 2500.5, // tiny price gain
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 40000,
    exitTime: Date.now(),
    durationSeconds: 40,
    grossPnL: 0.002, // Gross is positive!
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0002,
    totalCosts: 0.0122,
    netPnL: -0.0102, // Net is negative due to fee drag!
    roePct: -0.51,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 56.0,
      atr1m: 0.35,
      spreadBps: 6.5,
      confidenceScore: 75,
    },
  };

  const slipPayload = bot5.bot5_runLossAnalysis(slippageTrade);
  assert(slipPayload.postMortem.isLoss, 'Trade recognized as Loss');
  assert(slipPayload.postMortem.category === 'SLIPPAGE_SPREAD_DRAG', 'Root cause classified as SLIPPAGE_SPREAD_DRAG');
  assert(slipPayload.feedbackToBot2.applied, 'Feedback automatically applied to Bot 2');

  const bot2UpdatedParams1 = bot2.getTunableParameters();
  assert(
    bot2UpdatedParams1.maxAllowedSpreadBps < 5.0,
    `maxAllowedSpreadBps tightened from 5.0 to ${bot2UpdatedParams1.maxAllowedSpreadBps}`
  );
  assert(
    bot2UpdatedParams1.minAtrRatio > 1.8,
    `minAtrRatio increased from 1.8 to ${bot2UpdatedParams1.minAtrRatio}`
  );

  // TEST 4: RSI Exhaustion Reversal Diagnosis (Entering at high RSI on LONG)
  console.log('\n▶ TEST 4: RSI Exhaustion Reversal Diagnosis');
  const rsiExhaustionTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-RSI-01',
    symbol: 'SOLUSDT',
    side: 'LONG',
    entryPrice: 100.0,
    exitPrice: 98.8,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 85000,
    exitTime: Date.now(),
    durationSeconds: 85,
    grossPnL: -0.12,
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0001,
    totalCosts: 0.0121,
    netPnL: -0.1321,
    roePct: -6.6,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 71.0, // High RSI entry!
      atr1m: 0.25,
      spreadBps: 2.0,
      confidenceScore: 78,
    },
  };

  const rsiPayload = bot5.bot5_runLossAnalysis(rsiExhaustionTrade);
  assert(rsiPayload.postMortem.category === 'RSI_EXHAUSTION_REVERSAL', 'Root cause classified as RSI_EXHAUSTION_REVERSAL');
  assert(rsiPayload.feedbackToBot2.applied, 'Feedback applied to Bot 2');

  const bot2UpdatedParams2 = bot2.getTunableParameters();
  assert(
    bot2UpdatedParams2.rsiLongMax < 68,
    `rsiLongMax lowered from 68 to ${bot2UpdatedParams2.rsiLongMax}`
  );

  // TEST 5: Fast Whipsaw / ATR Expansion (< 60s Stop Loss)
  console.log('\n▶ TEST 5: Fast Whipsaw / ATR Expansion (< 60s Stop Loss)');
  const whipsawTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-WHIP-01',
    symbol: 'DOGEUSDT',
    side: 'SHORT',
    entryPrice: 0.15,
    exitPrice: 0.153,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 25000,
    exitTime: Date.now(),
    durationSeconds: 25, // Only 25 seconds!
    grossPnL: -0.20,
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0,
    totalCosts: 0.012,
    netPnL: -0.212,
    roePct: -10.6,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 45.0,
      atr1m: 0.0008,
      spreadBps: 3.0,
      confidenceScore: 72,
    },
  };

  const whipPayload = bot5.bot5_runLossAnalysis(whipsawTrade);
  assert(whipPayload.postMortem.category === 'ATR_EXPANSION_WHIPSAW', 'Root cause classified as ATR_EXPANSION_WHIPSAW');
  const bot2UpdatedParams3 = bot2.getTunableParameters();
  assert(
    bot2UpdatedParams3.minConfidenceScore > 70,
    `minConfidenceScore raised from 70 to ${bot2UpdatedParams3.minConfidenceScore}`
  );
  assert(
    bot2UpdatedParams3.adxTrendThreshold > 22,
    `adxTrendThreshold raised from 22 to ${bot2UpdatedParams3.adxTrendThreshold}`
  );

  // TEST 6: Parameter Adjustment Audit History
  console.log('\n▶ TEST 6: Parameter Adjustment Audit Trail');
  const adjustments = bot5.getAdjustmentHistory();
  assert(adjustments.length >= 4, `At least 4 adjustments recorded (Actual: ${adjustments.length})`);
  adjustments.forEach((adj, idx) => {
    console.log(`    [#${idx + 1}] ${adj.parameterName}: ${adj.previousValue} -> ${adj.newValue} (${adj.reason})`);
  });

  console.log('\n===============================================================');
  console.log('🎉 ALL BOT 5 POST-MORTEM & ADAPTIVE FEEDBACK TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

runBot5TestSuite().catch((err) => {
  console.error('Fatal Bot 5 Test Error:', err);
  process.exit(1);
});
