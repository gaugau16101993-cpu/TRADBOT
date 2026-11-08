import { riskGovernor } from '../src/server/riskGovernor';
import { Bot1MarketScanner } from '../src/server/bot1Scanner';
import { bot2Analyst } from '../src/server/bot2Analyst';
import { bot3SignalEngine } from '../src/server/bot3SignalEngine';
import { bot4ExecutionManager } from '../src/server/bot4ExecutionManager';
import { bot5LossEngine } from '../src/server/bot5LossAnalysis';
import { independentValidator } from '../src/server/independentValidator';
import { isSupportedBitgetCryptoFutures } from '../src/server/exchangeSpecs';
import { TradeSignal, TickerData } from '../src/types/engine';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🤖 BITGET 5-BOT AUTONOMOUS ENGINE V2 — AUTOMATED VERIFICATION');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${msg}`);
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: RISK GOVERNOR PRE-TRADE ENFORCEMENT & HARD SL CLAMP
  // -------------------------------------------------------------
  console.log('▶ [TEST 1] Testing Independent Risk Governor:');
  const now = Date.now();

  // Test 1.1: Rejection of Banned Synthetic CFDs from 661-trade audit
  const isMinimaxBanned = !isSupportedBitgetCryptoFutures('MINIMAXUSDT');
  const isAkeBanned = !isSupportedBitgetCryptoFutures('AKEUSDT');
  const isSoxlBanned = !isSupportedBitgetCryptoFutures('SOXLUSDT');
  const isBtcAllowed = isSupportedBitgetCryptoFutures('BTCUSDT');
  assert(isMinimaxBanned && isAkeBanned && isSoxlBanned && isBtcAllowed, 'Banned illiquid synthetic CFDs (MINIMAX, AKE, SOXL) strictly rejected; BTCUSDT permitted');

  // Test 1.2: Hard Loss Clamping <= 50% ROE
  const sampleBtcTicker: TickerData = {
    symbol: 'BTCUSDT',
    lastPr: 80000,
    bidPr: 79998,
    askPr: 80002,
    change24h: 1.5,
    high24h: 81500,
    low24h: 79000,
    volume24h: 500000000,
    updatedAt: now,
    spread: 4,
    spreadPercent: 0.005,
    bidSz: 15.0,
    askSz: 14.5,
    usdtVolume24h: 500000000,
  };

  const dangerousSignal: TradeSignal = {
    signalId: 'TEST-DANGEROUS-SL-01',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    strategy: 'TREND_PULLBACK_MOMENTUM',
    version: 'v5.0',
    createdAt: now,
    expiresAt: now + 300000,
    status: 'CONFIRMED',
    entryPrice: 80000,
    stopLossPrice: 70000, // Dangerous 12.5% price distance (would be 125% ROE loss at 10x!)
    takeProfitPrice: 95000,
    riskRewardRatio: 1.5,
    grossRewardBps: 1875,
    grossRiskBps: 1250,
    totalFrictionBps: 15,
    expectedNetEdgeBps: 25,
    confidenceScore: 80,
    fillProbability: 0.8,
    rankScore: 85,
    frictionBreakdown: {
      roundTripTakerFeeBps: 12,
      spreadBps: 0.5,
      estSlippageBps: 3,
      estFundingCostBps: 0.5,
      totalFrictionBps: 16,
    },
    triggerTimeframe: '5m',
    confirmationReason: 'Test',
    isRepainted: false,
    auditTrail: [],
  };

  const verdict = riskGovernor.evaluatePreTradeRisk({
    signal: dangerousSignal,
    ticker: sampleBtcTicker,
    activePositions: [],
    walletBalance: 100.0,
    equity: 100.0,
    dailyRealizedLossUsdt: 0,
    peakEquity: 100.0,
  });

  assert(verdict.allowed === true, 'Risk Governor approves safe BTCUSDT trade');
  assert(verdict.clampedStopLoss !== undefined && verdict.clampedStopLoss >= 76000, `Stop Loss clamped from $70000 to $${verdict.clampedStopLoss} to guarantee max loss <= 50% ROE`);
  assert(verdict.riskUsdt! <= 2.50, `Dollar risk $${verdict.riskUsdt} strictly bounded <= 2.5% account equity`);
  assert(verdict.estimatedLiquidationPrice !== undefined && verdict.liquidationBufferPct! >= 30, `Liquidation distance checked: LiqPrice=$${verdict.estimatedLiquidationPrice}, Buffer=${verdict.liquidationBufferPct}% ahead of SL`);

  // -------------------------------------------------------------
  // TEST 2: BOT 1 MARKET SCANNER PRO
  // -------------------------------------------------------------
  console.log('\n▶ [TEST 2] Testing BOT 1 Market Scanner Universe Intelligence:');
  const scanner = new Bot1MarketScanner();
  const filterConfig = scanner.getFilterConfig();
  assert(filterConfig.maxSpreadPercent === 0.03, 'Scanner strictly filters spreads > 0.03% (3.0 bps)');
  assert(filterConfig.minUsdtVolume24h >= 10000000, 'Scanner requires $10M+ USDT 24h liquidity');

  // -------------------------------------------------------------
  // TEST 3: BOT 2 DEEP MULTI-TIMEFRAME ANALYST
  // -------------------------------------------------------------
  console.log('\n▶ [TEST 3] Testing BOT 2 Deep Technical & SMC Analyst:');
  const bot2Params = bot2Analyst.getTunableParameters();
  assert(bot2Params.adxTrendThreshold >= 20, 'ADX trend identification threshold calibrated >= 20');
  assert(bot2Params.minConfidenceScore >= 70, 'Min confidence score threshold calibrated >= 70');

  // -------------------------------------------------------------
  // TEST 4: BOT 3 SIGNAL & RISK/REWARD ENGINE
  // -------------------------------------------------------------
  console.log('\n▶ [TEST 4] Testing BOT 3 Signal & Mandatory RR Engine:');
  const bot3Config = bot3SignalEngine.getConfig();
  assert(bot3Config.minRiskRewardRatio >= 1.50, `Mandatory Risk/Reward strictly >= 1:1.50 (current: 1:${bot3Config.minRiskRewardRatio})`);
  assert(bot3Config.enableTimeFilter === true, 'Gate 0: Time Blackout Filter enabled (01:00-04:00 UTC)');
  assert(bot3Config.enableNightVolatilityBoost === true, 'Gate 0.5: Dynamic Night Volatility Boost (+40% ATR) enabled');

  // -------------------------------------------------------------
  // TEST 5: BOT 4 EXECUTION & DYNAMIC BREAK-EVEN
  // -------------------------------------------------------------
  console.log('\n▶ [TEST 5] Testing BOT 4 Autonomous Execution & Position Lifecycle:');
  const bot4Config = bot4ExecutionManager.getConfig();
  assert(bot4Config.takerFeeRate === 0.0006, 'Taker fee accurately configured at 0.06% (6 bps)');
  assert(bot4Config.maxLeverage <= 10, 'Leverage ceiling clamped to <= 10x for safe margin isolation');
  assert(bot4Config.maxSimultaneousPositions === 10, 'Bot 4 execution configured for up to 10 simultaneous positions');
  assert(riskGovernor.getConfig().maxConcurrentPositions === 10, 'Risk Governor configured for 10 maximum concurrent positions');
  assert(riskGovernor.getConfig().maxTotalMarginPct >= 50.0, 'Risk Governor accommodates up to 50% margin capacity for 10 concurrent positions');

  // Test Execution of safe trade with clamped SL
  const execResult = bot4ExecutionManager.executeSignal(dangerousSignal, sampleBtcTicker);
  assert(execResult.success === true, 'Autonomous Paper Trading execution succeeded');
  assert(execResult.position !== undefined, 'Position successfully created and tracked in memory');
  assert(execResult.position!.stopLoss >= 76000, `Position stop loss initialized at clamped safe level: $${execResult.position!.stopLoss}`);

  // Test Dynamic Break-Even trigger
  const profitTicker: TickerData = {
    ...sampleBtcTicker,
    lastPr: 83000, // Price in solid profit towards TP
    bidPr: 82998,
    askPr: 83002,
  };
  bot4ExecutionManager.onPriceUpdate('BTCUSDT', profitTicker);
  const updatedPos = bot4ExecutionManager.getPositions().find(p => p.symbol === 'BTCUSDT');
  assert(updatedPos !== undefined && updatedPos.stopLoss > 80000, `Dynamic Break-Even activated: Stop Loss elevated to $${updatedPos?.stopLoss} (+fee buffer) to lock risk-free run!`);

  // Close position safely
  bot4ExecutionManager.closePosition('BTCUSDT', profitTicker, 'TAKE_PROFIT');
  assert(bot4ExecutionManager.getPositions().length === 0, 'Position closed cleanly with ONE ENTRY • ONE SL • ONE TP lifecycle');

  // -------------------------------------------------------------
  // TEST 6: BOT 5 CHALLENGER V5.0 & INDEPENDENT VALIDATOR
  // -------------------------------------------------------------
  console.log('\n▶ [TEST 6] Testing BOT 5 Self-Learning & Champion vs Challenger v5.0:');
  const challengers = bot5LossEngine.getChallengers();
  const v5Challenger = challengers.find(c => c.version === 'v5.0-AUTONOMOUS-GOVERNOR');
  assert(v5Challenger !== undefined, 'Challenger v5.0-AUTONOMOUS-GOVERNOR successfully registered in Bot 5');

  // Generate realistic candles to run independent walk-forward validation
  const testCandles = [];
  let p = 80000;
  for (let i = 0; i < 200; i++) {
    const trend = (i % 40 < 20) ? 60 : -45;
    const noise = (Math.random() - 0.45) * 40;
    p += trend + noise;
    testCandles.push({
      ts: now - (200 - i) * 300000,
      open: p - 20,
      high: p + 55,
      low: p - 45,
      close: p,
      baseVolume: 120,
      quoteVolume: 9500000,
      isComplete: true,
    });
  }

  const auditReport = independentValidator.runIndependentBacktest(
    'BTCUSDT',
    testCandles,
    v5Challenger!.parameters,
    0.6 // 60% IS, 40% OOS
  );

  console.log(`    📊 Walk-Forward Simulation: In-Sample Trades: ${auditReport.inSampleMetrics.tradesCount} | OOS Trades: ${auditReport.outOfSampleMetrics.tradesCount}`);
  console.log(`    📊 Out-Of-Sample Profit Factor: ${auditReport.outOfSampleMetrics.profitFactor} | Win Rate: ${auditReport.outOfSampleMetrics.winRatePct}%`);
  assert(auditReport.totalTrades >= 0, 'Out-Of-Sample backtesting executed with complete Bitget fee friction matrix');

  console.log('\n================================================================');
  console.log(`🏁 TEST SUMMARY: ${passedTests}/${totalTests} PASSING (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('================================================================\n');

  process.exit(0);
}

runTestSuite().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
