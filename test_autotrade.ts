import { Bot1MarketScanner } from './src/server/bot1Scanner';
import { Bot2MarketAnalyst } from './src/server/bot2Analyst';
import { Bot3SignalEngine } from './src/server/bot3SignalEngine';
import { Bot4ExecutionManager } from './src/server/bot4ExecutionManager';
import { Bot5LossAnalysisEngine } from './src/server/bot5LossAnalysis';
import { TickerData, TradeSignal } from './src/types/engine';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exit(1);
  }
}

async function runAutoTradeTest() {
  console.log('===============================================================');
  console.log('🤖 AUTONOMOUS AUTO-TRADE ENTRY & AUTO-CLOSE EXIT VERIFICATION');
  console.log('===============================================================\n');

  // Initialize bot modules
  const bot2 = new Bot2MarketAnalyst();
  const bot3 = new Bot3SignalEngine();
  const bot4 = new Bot4ExecutionManager({
    initialEquity: 10.0,
    targetMarginPerPosition: 2.0,
    maxLeverage: 5,
    maxSimultaneousPositions: 2,
    netProfitThresholdUsdt: 0.0001,
    autoCloseEnabled: true,
  }, 10.0);

  // 1. Verify Auto-Entry: Margin strictly 2.0 USDT, 5x leverage -> 10.0 USDT Notional
  console.log('▶ TEST 1: Autonomous Order Execution (Target 2.0 USDT Margin)');
  const syntheticSignal: TradeSignal = {
    signalId: `SIG-TEST-AUTO-01`,
    symbol: 'SOLUSDT',
    direction: 'LONG',
    strategy: 'TREND_PULLBACK_MOMENTUM',
    version: '4.0.0',
    createdAt: Date.now(),
    expiresAt: Date.now() + 300000,
    status: 'CONFIRMED',
    entryPrice: 100.0,
    stopLossPrice: 98.0,
    takeProfitPrice: 104.0,
    riskRewardRatio: 2.0,
    grossRewardBps: 400,
    grossRiskBps: 200,
    totalFrictionBps: 18,
    expectedNetEdgeBps: 382,
    confidenceScore: 88,
    fillProbability: 95,
    rankScore: 88,
    frictionBreakdown: {
      roundTripTakerFeeBps: 12,
      spreadBps: 3,
      estSlippageBps: 3,
      estFundingCostBps: 0,
      totalFrictionBps: 18,
    },
    triggerTimeframe: '5m',
    confirmationReason: 'Auto test verification',
    isRepainted: false,
    auditTrail: [],
  };

  const ticker: TickerData = {
    symbol: 'SOLUSDT',
    lastPr: 100.0,
    bidPr: 99.98,
    askPr: 100.02,
    change24h: 2.5,
    high24h: 102.0,
    low24h: 97.0,
    volume24h: 80_000_000,
    updatedAt: Date.now(),
    spreadPercent: 0.0004,
  };

  const execResult = bot4.executeSignal(syntheticSignal, ticker);
  assert(execResult.success, 'Autonomous order placement succeeded');
  assert(execResult.position !== undefined, 'Position successfully created');
  assert(execResult.position!.margin === 2.0, 'Strict 2.0 USDT margin allocated', `got ${execResult.position?.margin}`);
  assert(execResult.position!.leverage === 5, '5x leverage applied (10 USDT notional)');
  assert(bot4.hasPosition('SOLUSDT'), 'bot4.hasPosition returns true');

  // 2. Verify Auto-Close: Price moves up to generate Net PnL > threshold
  console.log('\n▶ TEST 2: Autonomous Net-Profit Auto-Close');
  // At $100.50, Gross PnL = (100.50 - 100) * 0.1 = +$0.05
  // Costs = entry fee ($0.006) + exit fee ($0.006) = $0.012
  // Net PnL = 0.05 - 0.012 = +$0.038 > $0.0001 threshold!
  const winTicker: TickerData = {
    ...ticker,
    lastPr: 100.50,
    bidPr: 100.48,
    askPr: 100.52,
    updatedAt: Date.now(),
  };

  const updateResult = bot4.onPriceUpdate('SOLUSDT', winTicker);
  assert(updateResult.closedTrade !== undefined, 'Position automatically closed on Net PnL profit target');
  assert(updateResult.closedTrade!.netPnL > 0, `Closed trade net PnL is positive ($${updateResult.closedTrade?.netPnL.toFixed(4)})`);
  assert(updateResult.closedTrade!.reason === 'NET_PNL_POSITIVE_TRIGGER', 'Close reason is NET_PNL_POSITIVE_TRIGGER');
  assert(!bot4.hasPosition('SOLUSDT'), 'Position removed from active positions after close');

  // 3. Verify Autonomous Stop Loss Cap
  console.log('\n▶ TEST 3: Autonomous Stop Loss Protection');
  const shortSignal: TradeSignal = {
    ...syntheticSignal,
    signalId: `SIG-TEST-SL-02`,
    direction: 'SHORT',
    entryPrice: 100.0,
    stopLossPrice: 101.50,
    takeProfitPrice: 97.0,
  };

  const execShort = bot4.executeSignal(shortSignal, ticker);
  assert(execShort.success, 'Short position opened with 2.0 USDT margin');

  // Price jumps above Stop Loss ($101.60 >= $101.50)
  const slTicker: TickerData = {
    ...ticker,
    lastPr: 101.60,
    bidPr: 101.58,
    askPr: 101.62,
    updatedAt: Date.now(),
  };

  const slResult = bot4.onPriceUpdate('SOLUSDT', slTicker);
  assert(slResult.closedTrade !== undefined, 'Autonomous Stop Loss triggered immediately');
  assert(slResult.closedTrade!.reason === 'STOP_LOSS', 'Close reason is strictly STOP_LOSS');
  assert(slResult.closedTrade!.exit >= 101.50, 'Exit price matches breached level');

  // 4. Ledger consistency
  console.log('\n▶ TEST 4: Double-Entry Ledger Reconciliation');
  const audit = bot4.auditLedgerConsistency();
  assert(audit.isReconciled, 'Double-entry ledger is perfectly reconciled (0 discrepancy)');

  console.log('\n===============================================================');
  console.log('🎉 ALL AUTONOMOUS TRADING & AUTO-CLOSE TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

runAutoTradeTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
