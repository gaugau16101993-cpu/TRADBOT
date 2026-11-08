import { serverEngine } from './src/server/engine';

async function runTest() {
  console.log('========================================================');
  console.log('TESTING NO TRADE ELIMINATION & FAST AUTO-TRADING ENGINE');
  console.log('========================================================\n');

  const bot1Scanner = serverEngine.getScanner();
  const bot2Analyst = serverEngine.getBot2Analyst();
  const bot3SignalEngine = serverEngine.getBot3Engine();
  const bot4ExecutionManager = serverEngine.getBot4Manager();

  // Test 1: Bitget Market Scan Candidates
  console.log('[TEST 1] Scanning Bitget Universe...');
  const scan = await bot1Scanner.scanUniverse();
  console.log(`Scan completed: ${scan.metrics.coinsScanned} coins, ${scan.candidates.length} qualified candidates.`);
  if (scan.candidates.length === 0) {
    throw new Error('Bot 1 scanner returned 0 candidates from Bitget!');
  }
  const topCandidate = scan.candidates[0];
  console.log(`Top candidate selected: ${topCandidate.symbol} (Score: ${topCandidate.scalpScore}, Spread: ${topCandidate.spreadBps} bps)\n`);

  // Test 2: Bot 2 MTF Analysis - Verify Bias is Actionable (NEVER NEUTRAL)
  console.log(`[TEST 2] Analyzing ${topCandidate.symbol} with Bot 2...`);
  const ticker = {
    symbol: topCandidate.symbol,
    lastPr: topCandidate.lastPrice,
    bidPr: topCandidate.bidPrice,
    askPr: topCandidate.askPrice,
    change24h: topCandidate.change24h,
    high24h: topCandidate.lastPrice * 1.02,
    low24h: topCandidate.lastPrice * 0.98,
    volume24h: topCandidate.volume24hUsdt,
    updatedAt: topCandidate.lastUpdateTime,
    fundingRate: topCandidate.fundingRate,
    spreadPercent: topCandidate.spreadPercent,
  };

  const analysis = await bot2Analyst.analyzeMarket(topCandidate.symbol, ticker);
  console.log(`Bot 2 Result for ${topCandidate.symbol}:`);
  console.log(` - Bias: ${analysis.bias}`);
  console.log(` - Confidence: ${analysis.confidenceScore}%`);
  console.log(` - Overall Regime: ${analysis.overallRegime}`);

  if (analysis.bias === 'NEUTRAL') {
    throw new Error(`FAIL: Bot 2 returned NEUTRAL bias on top candidate ${topCandidate.symbol}!`);
  }
  console.log(`PASSED: Bot 2 provided actionable directional bias: ${analysis.bias}\n`);

  // Test 3: Bot 3 Evaluation - Verify Signal is Confirmed (NOT NO_TRADE)
  console.log(`[TEST 3] Evaluating Signal with Bot 3 for ${topCandidate.symbol}...`);
  const evalResult = bot3SignalEngine.evaluateCandidate(analysis, ticker);
  console.log(`Bot 3 Action: ${evalResult.action}`);
  if (evalResult.action === 'NO_TRADE') {
    throw new Error(`FAIL: Bot 3 returned NO_TRADE! Reason: ${evalResult.rejectionReason}`);
  }
  console.log(`Bot 3 Signal Approved: ${evalResult.action}`);
  console.log(` - Strategy: ${evalResult.signal?.strategy}`);
  console.log(` - Entry: $${evalResult.signal?.entryPrice}`);
  console.log(` - Net Edge: +${evalResult.signal?.expectedNetEdgeBps} bps`);
  console.log(` - RR Ratio: 1:${evalResult.signal?.riskRewardRatio}`);
  console.log(`PASSED: Bot 3 successfully confirmed trade signal!\n`);

  // Test 4: End-to-End Pipeline Cycle in Server Engine
  console.log('[TEST 4] Running Server Engine Pipeline Cycle...');
  await serverEngine.runPipelineCycle();
  const engineState = serverEngine.getState();

  console.log('Engine Bot States after cycle:');
  console.log(` - Bot 1: ${engineState.botState.bot1.status}`);
  console.log(` - Bot 2: ${engineState.botState.bot2.status}`);
  console.log(` - Bot 3: ${engineState.botState.bot3.status}`);
  console.log(` - Bot 4: ${engineState.botState.bot4.status}`);

  if (engineState.botState.bot3.status.includes('NO TRADE')) {
    throw new Error(`FAIL: Engine Bot 3 is showing NO TRADE!`);
  }

  const positions = bot4ExecutionManager.getPositions();
  console.log(`\nActive Positions open in Bot 4: ${positions.length}`);
  positions.forEach((p, idx) => {
    console.log(` Position #${idx + 1}: ${p.side} ${p.symbol} | Entry: $${p.entryPrice} | Margin: $${p.margin} USDT | Net PnL: $${p.netPnL.toFixed(4)}`);
  });

  if (positions.length === 0) {
    throw new Error('FAIL: No positions were opened! Fast Auto-Trading should always have active trades.');
  }

  console.log('\n========================================================');
  console.log('ALL TESTS PASSED: NO TRADE ELIMINATED! SYSTEM 100% ACTIVE');
  console.log('========================================================');

  bot1Scanner.destroy();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
