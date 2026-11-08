import { Bot5LossAnalysisEngine } from './src/server/bot5LossAnalysis';
import { Bot2MarketAnalyst } from './src/server/bot2Analyst';
import { ClosedTradeLogPayload, LossRootCauseCategory } from './src/types/pipeline';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exit(1);
  }
}

async function runBot5SelfLearningTestSuite() {
  console.log('===============================================================');
  console.log('🧠 BOT 5 — AI TRADE REVIEW & SELF-LEARNING ENGINE TEST SUITE');
  console.log('===============================================================\n');

  const bot2 = new Bot2MarketAnalyst();
  const bot5 = new Bot5LossAnalysisEngine(bot2);

  // -------------------------------------------------------------------------
  // TEST 1: WIN/LOSS AUDIT & NET PNL CALCULATION AFTER 0.06% TAKER X 2 + FUNDING
  // -------------------------------------------------------------------------
  console.log('▶ TEST 1: Win/Loss Audit with Exact Friction Deductions');
  const winTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-WIN-001',
    signalId: 'SIG-WIN-001',
    symbol: 'BTCUSDT',
    side: 'LONG',
    strategy: 'TREND_PULLBACK_MOMENTUM',
    triggerTimeframe: '5m',
    entryPrice: 80000.0,
    exitPrice: 80800.0,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 120000,
    exitTime: Date.now(),
    durationSeconds: 120,
    grossPnL: 0.10, // 1% gross move
    openFee: 0.006, // 0.06%
    exitFee: 0.00606, // 0.06%
    accruedFunding: 0.0004,
    totalCosts: 0.01246,
    netPnL: 0.08754, // strictly positive after all costs
    roePct: 4.38,
    closeReason: 'NET_PNL_POSITIVE_TRIGGER',
    entryIndicators: {
      rsi5m: 54.0,
      atr1m: 120.0,
      spreadBps: 1.2,
      confidenceScore: 82,
    },
  };

  const winAudit = bot5.bot5_runLossAnalysis(winTrade);
  assert(!winAudit.postMortem.isLoss, 'Recognized trade as a healthy win');
  assert(winAudit.postMortem.category === 'HEALTHY_WIN_EFFICIENCY', 'Classified as HEALTHY_WIN_EFFICIENCY');
  assert(winAudit.metrics.totalWins === 1, 'Win count recorded');
  assert(winAudit.metrics.totalRealizedNetProfit > 0, 'Net PnL is strictly positive');

  // -------------------------------------------------------------------------
  // TEST 2: ROOT CAUSE CLASSIFICATION ACROSS CAUSE VECTORS
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Root Cause Classification (Noise, Spread, Trend, SL Timing)');
  
  // Vector A: POOR_ENTRY_SPREAD_SLIPPAGE (Gross positive but fee drag turned negative)
  const spreadDragTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-LOSS-SPREAD-002',
    symbol: 'SOLUSDT',
    side: 'LONG',
    strategy: 'REGIME_BREAKOUT_RVOL',
    entryPrice: 100.0,
    exitPrice: 100.02,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 45000,
    exitTime: Date.now(),
    durationSeconds: 45,
    grossPnL: 0.002,
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0002,
    totalCosts: 0.0122,
    netPnL: -0.0102, // Gross was positive but fee turned it negative!
    roePct: -0.51,
    closeReason: 'NET_PNL_POSITIVE_TRIGGER',
    entryIndicators: {
      rsi5m: 58.0,
      atr1m: 0.4,
      spreadBps: 5.2,
      confidenceScore: 75,
    },
  };

  const spreadAudit = bot5.bot5_runLossAnalysis(spreadDragTrade);
  assert(spreadAudit.postMortem.isLoss, 'Identified loss');
  assert(
    spreadAudit.postMortem.category === 'POOR_ENTRY_SPREAD_SLIPPAGE',
    'Classified as POOR_ENTRY_SPREAD_SLIPPAGE',
    spreadAudit.postMortem.category
  );

  // Vector B: FALSE_SIGNAL_NOISE (Low confidence M1 choppy noise)
  const noiseTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-LOSS-NOISE-003',
    symbol: 'ETHUSDT',
    side: 'LONG',
    strategy: 'SMC_SWEEP_REVERSAL',
    entryPrice: 2300.0,
    exitPrice: 2285.0,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 30000,
    exitTime: Date.now(),
    durationSeconds: 30,
    grossPnL: -0.065,
    openFee: 0.006,
    exitFee: 0.0059,
    accruedFunding: 0.0001,
    totalCosts: 0.012,
    netPnL: -0.077,
    roePct: -3.85,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 51.0,
      atr1m: 2.5,
      spreadBps: 2.0,
      confidenceScore: 68, // Low confidence noise
    },
  };

  const noiseAudit = bot5.bot5_runLossAnalysis(noiseTrade);
  assert(
    noiseAudit.postMortem.category === 'FALSE_SIGNAL_NOISE',
    'Classified as FALSE_SIGNAL_NOISE',
    noiseAudit.postMortem.category
  );

  // Vector C: PREMATURE_SL_TIMING (Fast whipsaw < 90s under normal ATR noise)
  const slTimingTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-LOSS-SL-004',
    symbol: 'DOGEUSDT',
    side: 'LONG',
    strategy: 'TREND_PULLBACK_MOMENTUM',
    entryPrice: 0.140,
    exitPrice: 0.138,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 40000,
    exitTime: Date.now(),
    durationSeconds: 40,
    grossPnL: -0.14,
    openFee: 0.006,
    exitFee: 0.0059,
    accruedFunding: 0.0001,
    totalCosts: 0.012,
    netPnL: -0.152,
    roePct: -7.6,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 55.0,
      atr1m: 0.001,
      spreadBps: 2.5,
      confidenceScore: 78,
    },
  };

  const slAudit = bot5.bot5_runLossAnalysis(slTimingTrade);
  assert(
    slAudit.postMortem.category === 'PREMATURE_SL_TIMING',
    'Classified as PREMATURE_SL_TIMING',
    slAudit.postMortem.category
  );

  // -------------------------------------------------------------------------
  // TEST 3: MULTI-TIMEFRAME (1m/3m/5m/15m) AUDIT & MATRICES
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Multi-Timeframe Analysis & Coin/Strategy Matrices');
  assert(slAudit.postMortem.timeframeAudit !== undefined, 'MTF correlation audit generated');
  assert(slAudit.postMortem.timeframeAudit!.m1 !== undefined, '1m timeframe analyzed');
  assert(slAudit.postMortem.timeframeAudit!.m3 !== undefined, '3m timeframe analyzed');
  assert(slAudit.postMortem.timeframeAudit!.m5 !== undefined, '5m timeframe analyzed');
  assert(slAudit.postMortem.timeframeAudit!.m15 !== undefined, '15m timeframe analyzed');

  const currentMetrics = bot5.getMetrics();
  assert(currentMetrics.breakdownBySymbol['BTCUSDT'] !== undefined, 'Symbol matrix recorded BTCUSDT');
  assert(currentMetrics.breakdownBySymbol['SOLUSDT'] !== undefined, 'Symbol matrix recorded SOLUSDT');
  assert(currentMetrics.breakdownByStrategy['TREND_PULLBACK_MOMENTUM'] !== undefined, 'Strategy matrix recorded TREND_PULLBACK_MOMENTUM');

  // -------------------------------------------------------------------------
  // TEST 4: DEDUPLICATION & 24/7 THREAD-SAFE EXECUTION
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Trade Deduplication & Idempotency');
  const duplicateAudit = bot5.bot5_runLossAnalysis(winTrade);
  assert(bot5.getMetrics().totalTradesAudited === 4, 'Duplicate trade submission rejected (count unchanged at 4)');

  // -------------------------------------------------------------------------
  // TEST 5: OUT-OF-SAMPLE (OOS) VALIDATION & PROPOSALS (SAMPLE SIZE GATE)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Out-of-Sample (OOS) Gate & Anti-Overfitting');
  // Feed 5th and 6th trades to satisfy minSampleSizeForOOS
  const fifthTrade: ClosedTradeLogPayload = {
    ...winTrade,
    tradeId: 'TRD-WIN-005',
    netPnL: 0.05,
    grossPnL: 0.062,
  };
  const fifthAudit = bot5.bot5_runLossAnalysis(fifthTrade);

  const sixthTrade: ClosedTradeLogPayload = {
    ...noiseTrade,
    tradeId: 'TRD-LOSS-006',
  };
  const sixthAudit = bot5.bot5_runLossAnalysis(sixthTrade);

  const proposals = bot5.getProposals();
  assert(proposals.length > 0, 'OOS Parameter Optimization triggered after meeting sample size');
  const latestProposal = proposals[0];
  assert(latestProposal.oosReport.sampleType === 'OUT_OF_SAMPLE', 'OOS sample type verified');
  assert(latestProposal.oosReport.inSampleTradesCount > 0, 'In-Sample trades count > 0');
  assert(latestProposal.oosReport.outOfSampleTradesCount > 0, 'Out-of-Sample trades count > 0');
  assert(latestProposal.parameterChanges.length > 0, 'Generated specific parameter improvement proposals');

  // -------------------------------------------------------------------------
  // TEST 6: GOVERNANCE, SAFETY GATES & 1-CLICK ROLLBACK
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Safe Parameter Proposal Approval & Model Rollback');
  assert(latestProposal.status === 'PENDING_APPROVAL', 'Proposal held for user approval (not auto-applied to core risk)');

  // Approve proposal
  const applied = bot5.applyProposal(latestProposal.proposalId, 'Unit test approval');
  assert(applied, 'Proposal successfully applied');
  assert(bot5.getCurrentModelVersion() === latestProposal.modelTargetVersion, 'Model version updated');

  // Check version registry
  const versionHistory = bot5.getVersionHistory();
  assert(versionHistory.length >= 2, 'Version history archived previous versions');
  assert(versionHistory.some((v) => v.version === 'v1.0.0'), 'v1.0.0 preserved in registry');

  // Test 1-Click Rollback
  console.log('\n▶ TEST 7: 1-Click Rollback to Previous Version');
  const rollbackSuccess = bot5.rollbackToVersion('v1.0.0');
  assert(rollbackSuccess, 'Rollback to v1.0.0 succeeded');
  assert(bot5.getCurrentModelVersion() === 'v1.0.0', 'Active model version reverted to v1.0.0');

  console.log('\n===============================================================');
  console.log('🎉 ALL 8 BOT 5 AI REVIEW & SELF-LEARNING TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

runBot5SelfLearningTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
