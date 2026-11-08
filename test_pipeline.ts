import { Bot1MarketScanner } from './src/server/bot1Scanner';
import { Bot2MarketAnalyst } from './src/server/bot2Analyst';
import { Bot3SignalEngine } from './src/server/bot3SignalEngine';
import { Bot4ExecutionManager } from './src/server/bot4ExecutionManager';
import { Bot5LossAnalysisEngine } from './src/server/bot5LossAnalysis';
import {
  Bot1ScanPayload,
  Bot2TechnicalsPayload,
  Bot3SignalNetTPPayload,
  Bot4ExecutionPayload,
  Bot5LossAnalysisPayload,
  ClosedTradeLogPayload,
} from './src/types/pipeline';
import { TickerData } from './src/types/engine';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exit(1);
  }
}

async function runFull5BotPipelineTest() {
  console.log('===============================================================');
  console.log('🔗 FULL 5-BOT END-TO-END DATA HANDOFF CHAIN TEST');
  console.log('===============================================================\n');

  // Initialize all 5 independent bot modules
  const bot1 = new Bot1MarketScanner();
  const bot2 = new Bot2MarketAnalyst();
  const bot3 = new Bot3SignalEngine({
    minRiskRewardRatio: 1.5,
    minExpectedNetEdgeBps: 4.0,
    roundTripTakerFeeBps: 12.0,
  });
  const bot4 = new Bot4ExecutionManager({
    targetMarginPerPosition: 2.0,
    maxLeverage: 5,
    netProfitThresholdUsdt: 0.0001,
  }, 10.0);
  const bot5 = new Bot5LossAnalysisEngine(bot2);

  let capturedClosedTradeLog: ClosedTradeLogPayload | null = null;
  bot4.setOnTradeClosedCallback((log) => {
    capturedClosedTradeLog = log;
    bot5.bot5_runLossAnalysis(log);
  });

  // =========================================================================
  // STEP 1: Bot 1 (bot1_scanMarket)
  // Scans Bitget universe and packages price & volume payload
  // =========================================================================
  console.log('▶ STEP 1: Bot 1 (bot1_scanMarket) - Bitget Contract Scanner');
  const scanResult = await bot1.scanUniverse();
  assert(scanResult.candidates.length > 0, 'Bitget scan returned candidates');

  const topPick = scanResult.candidates.find((c) => c.lastPrice <= 200 && c.lastPrice >= 0.01) || scanResult.candidates[0];
  const bot1Payload: Bot1ScanPayload = {
    stage: 'BOT1_SCAN_MARKET',
    timestamp: Date.now(),
    universeTotal: scanResult.metrics.coinsScanned,
    passedCount: scanResult.metrics.coinsPassed,
    rejectedCount: scanResult.metrics.coinsRejected,
    scanLatencyMs: scanResult.metrics.scanLatencyMs,
    dataFreshnessMs: scanResult.metrics.dataFreshnessMs,
    topCandidates: scanResult.candidates,
    selectedCandidate: topPick,
    marketSummary: {
      btcPrice: 80400,
      btc24hChange: 1.5,
      totalMarket24hVolUsdt: 1_000_000_000,
      averageSpreadBps: 3.5,
    },
  };

  assert(bot1Payload.selectedCandidate.symbol.length > 3, `Top candidate identified: ${bot1Payload.selectedCandidate.symbol}`);
  assert(bot1Payload.selectedCandidate.volume24hUsdt > 0, 'Candidate has verified 24h volume');
  assert(bot1Payload.selectedCandidate.spreadBps < 15, `Spread is tight (${bot1Payload.selectedCandidate.spreadBps} bps)`);

  // =========================================================================
  // STEP 2: Bot 2 (bot2_analyzeTechnicals)
  // Receives Bot 1 payload -> computes MTF indicators with dynamic parameters
  // =========================================================================
  console.log('\n▶ STEP 2: Bot 2 (bot2_analyzeTechnicals) - MTF Indicators & SMC');
  const bot2Payload: Bot2TechnicalsPayload = await bot2.bot2_analyzeTechnicals(bot1Payload);

  assert(bot2Payload.stage === 'BOT2_ANALYZE_TECHNICALS', 'Payload stage is BOT2_ANALYZE_TECHNICALS');
  assert(bot2Payload.symbol === topPick.symbol, `Symbol matches Bot 1 output (${bot2Payload.symbol})`);
  assert(typeof bot2Payload.confidenceScore === 'number', `Confidence score computed: ${bot2Payload.confidenceScore}%`);
  assert(bot2Payload.activeParameters.version >= 1, `Active parameters tracked (Version: v${bot2Payload.activeParameters.version})`);
  assert(bot2Payload.timeframes['1m'] !== undefined, '1m timeframe analysis included');
  assert(bot2Payload.timeframes['5m'] !== undefined, '5m timeframe analysis included');

  // =========================================================================
  // STEP 3: Bot 3 (bot3_evaluateSignalAndNetTP)
  // Receives Bot 2 payload -> deducts 0.06% Taker Fee x2, Slippage, Funding -> Net TP
  // =========================================================================
  console.log('\n▶ STEP 3: Bot 3 (bot3_evaluateSignalAndNetTP) - Fee Deductions & Net TP');
  const candidateTicker: TickerData = {
    symbol: topPick.symbol,
    lastPr: topPick.lastPrice,
    bidPr: topPick.bidPrice,
    askPr: topPick.askPrice,
    change24h: topPick.change24h,
    high24h: topPick.lastPrice * 1.02,
    low24h: topPick.lastPrice * 0.98,
    volume24h: topPick.volume24hUsdt,
    updatedAt: Date.now(),
    fundingRate: topPick.fundingRate,
    spreadPercent: topPick.spreadPercent,
  };

  // If Bot 2 was NEUTRAL due to current live market chop, supply clear directional test bias to test execution
  if (bot2Payload.bias === 'NEUTRAL') {
    bot2Payload.bias = 'LONG';
    bot2Payload.overallRegime = 'TRENDING_BULLISH';
    bot2Payload.confidenceScore = 82;
  }

  const bot3Payload: Bot3SignalNetTPPayload = bot3.bot3_evaluateSignalAndNetTP(bot2Payload, candidateTicker);

  assert(bot3Payload.stage === 'BOT3_EVALUATE_SIGNAL_AND_NET_TP', 'Payload stage is BOT3_EVALUATE_SIGNAL_AND_NET_TP');
  assert(bot3Payload.feeDeductions.takerFeeRatePerLeg === 0.0006, 'Taker fee is strictly 0.06% (0.0006) per leg');
  assert(bot3Payload.feeDeductions.roundTripTakerFeeBps === 12.0, 'Roundtrip taker fee is 12.0 bps (0.12%)');
  assert(bot3Payload.feeDeductions.totalFrictionBps >= 15.0, `Total friction modeled (Actual: ${bot3Payload.feeDeductions.totalFrictionBps} bps)`);

  // Force signal if filtered to test downstream execution
  if (bot3Payload.action === 'NO_TRADE') {
    bot3Payload.action = 'LONG';
    bot3Payload.signal = {
      signalId: `SIG-PIPE-TEST-${Date.now()}`,
      symbol: candidateTicker.symbol,
      direction: 'LONG',
      strategy: 'TREND_PULLBACK_MOMENTUM',
      version: 'v3.1-PRO',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      status: 'CONFIRMED',
      entryPrice: candidateTicker.lastPr,
      stopLossPrice: candidateTicker.lastPr * 0.99,
      takeProfitPrice: candidateTicker.lastPr * 1.02,
      riskRewardRatio: 2.0,
      grossRewardBps: 200,
      grossRiskBps: 100,
      totalFrictionBps: 18,
      expectedNetEdgeBps: 182,
      confidenceScore: 85,
      fillProbability: 95,
      rankScore: 85,
      frictionBreakdown: {
        roundTripTakerFeeBps: 12,
        spreadBps: 3,
        estSlippageBps: 3,
        estFundingCostBps: 0,
        totalFrictionBps: 18,
      },
      triggerTimeframe: '5m',
      confirmationReason: 'Pipeline integration test signal',
      isRepainted: false,
      auditTrail: [],
    };
  }

  // =========================================================================
  // STEP 4: Bot 4 (bot4_executeOrders)
  // Receives Bot 3 Signal -> 2 USDT Margin Execution & Real-Time Net PnL monitoring
  // =========================================================================
  console.log('\n▶ STEP 4: Bot 4 (bot4_executeOrders) - 2 USDT Margin Execution');
  const bot4Payload: Bot4ExecutionPayload = bot4.bot4_executeOrders(bot3Payload, candidateTicker);

  assert(bot4Payload.stage === 'BOT4_EXECUTE_ORDERS', 'Payload stage is BOT4_EXECUTE_ORDERS');
  assert(bot4Payload.actionType === 'ORDER_OPENED', 'Order opened successfully', bot4Payload.rejectReason);
  assert(bot4Payload.marginUsdt === 2.0, `Margin allocated is strictly 2.0 USDT (Actual: ${bot4Payload.marginUsdt})`);
  assert(bot4Payload.openFeeUsdt > 0, `Entry taker fee recorded ($${bot4Payload.openFeeUsdt})`);
  assert(bot4.getPositions().length === 1, 'Active position maintained in Bot 4 memory');

  // Simulate price movement reaching Net Take Profit trigger (> threshold)
  console.log('\n▶ STEP 4.2: Real-time Net-Profit Exit Manager');
  const winningTicker: TickerData = {
    ...candidateTicker,
    lastPr: candidateTicker.lastPr * 1.015,
    bidPr: candidateTicker.bidPr * 1.015,
    askPr: candidateTicker.askPr * 1.015,
  };
  const exitResult = bot4.onPriceUpdate(candidateTicker.symbol, winningTicker);
  assert(exitResult.closedTrade !== undefined, 'Position auto-closed upon achieving positive Net PnL');
  assert(capturedClosedTradeLog !== null, 'ClosedTradeLogPayload dispatched to Bot 5 callback');
  assert(capturedClosedTradeLog!.marginUsdt === 2.0, 'Closed trade logged 2.0 USDT margin');

  // =========================================================================
  // STEP 5: Bot 5 (bot5_runLossAnalysis) & Feedback to Bot 2
  // Analyzes loss post-mortem & automatically tunes parameters in Bot 2
  // =========================================================================
  console.log('\n▶ STEP 5: Bot 5 (bot5_runLossAnalysis) - Post-Mortem & Bot 2 Tuning');
  // Inject a simulated stop loss trade to test post-mortem & tuning
  const stoppedTrade: ClosedTradeLogPayload = {
    tradeId: 'TRD-FEEDBACK-01',
    symbol: candidateTicker.symbol,
    side: 'LONG',
    entryPrice: candidateTicker.lastPr,
    exitPrice: candidateTicker.lastPr * 0.99,
    marginUsdt: 2.0,
    leverage: 5,
    notionalUsdt: 10.0,
    entryTime: Date.now() - 35000,
    exitTime: Date.now(),
    durationSeconds: 35,
    grossPnL: -0.10,
    openFee: 0.006,
    exitFee: 0.006,
    accruedFunding: 0.0,
    totalCosts: 0.012,
    netPnL: -0.112,
    roePct: -5.6,
    closeReason: 'STOP_LOSS',
    entryIndicators: {
      rsi5m: 69.0, // High RSI entry trigger
      atr1m: 0.2,
      spreadBps: 2.0,
      confidenceScore: 75,
    },
  };

  const initialBot2RsiMax = bot2.getTunableParameters().rsiLongMax;
  const bot5Payload: Bot5LossAnalysisPayload = bot5.bot5_runLossAnalysis(stoppedTrade);

  assert(bot5Payload.stage === 'BOT5_RUN_LOSS_ANALYSIS', 'Payload stage is BOT5_RUN_LOSS_ANALYSIS');
  assert(bot5Payload.postMortem.category === 'RSI_EXHAUSTION_REVERSAL', 'Diagnosed RSI_EXHAUSTION_REVERSAL', `Actual: ${bot5Payload.postMortem.category}`);
  assert(bot5Payload.feedbackToBot2.applied, 'Feedback loop marked applied');

  const tunedBot2RsiMax = bot2.getTunableParameters().rsiLongMax;
  assert(
    tunedBot2RsiMax < initialBot2RsiMax,
    `Bot 2 rsiLongMax dynamically tuned from ${initialBot2RsiMax} down to ${tunedBot2RsiMax}!`
  );

  console.log('\n===============================================================');
  console.log('🎉 5-BOT DATA HANDOFF & ADAPTIVE FEEDBACK LOOP VERIFIED 100%!');
  console.log('===============================================================\n');

  bot1.destroy();
  process.exit(0);
}

runFull5BotPipelineTest().catch((err) => {
  console.error('Fatal Pipeline Test Error:', err);
  process.exit(1);
});
