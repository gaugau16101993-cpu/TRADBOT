import { Bot4ExecutionManager } from './src/server/bot4ExecutionManager';
import { TradeSignal, TickerData } from './src/types/engine';

async function runBot4TestSuite() {
  console.log('===============================================================');
  console.log('🤖 BOT 4 EXECUTION & NET-PROFIT MANAGER — COMPREHENSIVE TEST SUITE');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
    }
  }

  // Common Tickers for test
  const btcTicker: TickerData = {
    symbol: 'BTCUSDT',
    lastPr: 80000.0,
    bidPr: 79998.0,
    askPr: 80002.0,
    change24h: 2.5,
    high24h: 81000.0,
    low24h: 79000.0,
    volume24h: 50000000,
    updatedAt: Date.now(),
    fundingRate: 0.0001,
    spreadPercent: 0.00005, // 0.5 bps
  };

  const ethTicker: TickerData = {
    symbol: 'ETHUSDT',
    lastPr: 2500.0,
    bidPr: 2499.9,
    askPr: 2500.1,
    change24h: 1.8,
    high24h: 2550.0,
    low24h: 2450.0,
    volume24h: 25000000,
    updatedAt: Date.now(),
    fundingRate: 0.00015,
    spreadPercent: 0.00008,
  };

  // Helper to generate a signal
  function createSignal(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    entry: number,
    sl: number,
    tp: number,
    signalId: string = `SIG-${Date.now()}-${symbol}`
  ): TradeSignal {
    return {
      signalId,
      symbol,
      direction,
      strategy: 'TREND_PULLBACK_MOMENTUM',
      version: '4.0.0',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      status: 'CONFIRMED',
      entryPrice: entry,
      stopLossPrice: sl,
      takeProfitPrice: tp,
      riskRewardRatio: 2.0,
      grossRewardBps: 150,
      grossRiskBps: 75,
      totalFrictionBps: 18,
      expectedNetEdgeBps: 132,
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
      confirmationReason: 'Valid MTF trend alignment with positive net edge',
      isRepainted: false,
      auditTrail: [],
    };
  }

  // ==========================================
  // TEST 1: Initial Paper Capital & Account Setup
  // ==========================================
  console.log('▶ TEST 1: Initial Paper Capital & Specs Checking');
  const bot4 = new Bot4ExecutionManager(
    {
      initialEquity: 10.0,
      targetMarginPerPosition: 2.0,
      maxLeverage: 5,
      maxSimultaneousPositions: 2,
      maxTotalMarginUsdt: 4.0,
      netProfitThresholdUsdt: 0.0001,
      baseSlippageBps: 3.0,
    },
    10.0
  );

  const initMetrics = bot4.getMetrics();
  assert(initMetrics.equity === 10.0, 'Initial Paper Equity is 10.0000 USDT');
  assert(initMetrics.walletBalance === 10.0, 'Initial Free Wallet Balance is 10.0000 USDT');
  assert(initMetrics.openPositionsCount === 0, 'No open positions initially');
  assert(initMetrics.lastAuditResult.isReconciled, 'Initial double-entry ledger is reconciled');

  // ==========================================
  // TEST 2: Two-way Taker Fees & Net PnL Threshold Exit
  // ==========================================
  console.log('\n▶ TEST 2: Two-way Taker Fees & Net-Profit Discipline');
  const btcSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 78500.0, 81500.0, 'SIG-BTC-001');
  const execResult = bot4.executeSignal(btcSignal, btcTicker);

  assert(execResult.success, 'BTCUSDT LONG order executed successfully');
  assert(execResult.position !== undefined, 'Position created');
  const pos1 = execResult.position!;

  // 2 USDT margin at 5x = 10 USDT notional. Open fee 0.06% on ~10 USDT = ~0.006 USDT
  assert(pos1.margin === 2.0, `Allocated margin is strictly 2.0 USDT (got ${pos1.margin})`);
  assert(pos1.openFee > 0.003 && pos1.openFee < 0.008, `Entry taker fee ~0.0048-0.006 USDT (got ${pos1.openFee})`);
  assert(pos1.netPnL < 0, `Initial Net PnL is negative due to friction drag (${pos1.netPnL} USDT)`);

  // Subtest: Price increases slightly such that Gross PnL > 0, but Net PnL < 0 (STRICT NET DISCIPLINE)
  const minorGainTicker: TickerData = {
    ...btcTicker,
    lastPr: 80020.0, // +$20 gain on 80,000 = +0.025% = +$0.0025 gross, but fees = ~$0.012 => NET < 0
    bidPr: 80019.0,
    askPr: 80021.0,
  };
  const updateMinor = bot4.onPriceUpdate('BTCUSDT', minorGainTicker);
  assert(updateMinor.closedTrade === undefined, 'Does NOT close on minor gain where Gross > 0 but Net PnL < 0');
  assert(bot4.getPositions().length === 1, 'Position remains open while Net PnL is below threshold');

  // Subtest: Price rises enough to overcome two-way fees, slippage, and reach net threshold (+0.0001 USDT)
  const winningTicker: TickerData = {
    ...btcTicker,
    lastPr: 80200.0, // +$200 gain on 80,000 = +0.25% = +$0.025 gross; fees ~$0.012 => Net PnL ~+$0.013 > 0.0001
    bidPr: 80199.0,
    askPr: 80201.0,
  };
  const updateWin = bot4.onPriceUpdate('BTCUSDT', winningTicker);
  assert(updateWin.closedTrade !== undefined, 'Closes position when Net PnL exceeds profit threshold');
  assert(updateWin.closedTrade!.reason === 'NET_PNL_POSITIVE_TRIGGER', 'Close reason is NET_PNL_POSITIVE_TRIGGER');
  assert(updateWin.closedTrade!.netPnL > 0, `Realized Net PnL is strictly positive (+${updateWin.closedTrade!.netPnL} USDT)`);
  assert(bot4.getPositions().length === 0, 'Open positions count is 0 after confirmed close');

  // ==========================================
  // TEST 3: Funding Fee Drag Accrual
  // ==========================================
  console.log('\n▶ TEST 3: Funding Fee Drag Calculation');
  const ethSignal = createSignal('ETHUSDT', 'SHORT', 2500.0, 2550.0, 2400.0, 'SIG-ETH-001');
  const execEth = bot4.executeSignal(ethSignal, ethTicker);
  assert(execEth.success, 'ETHUSDT SHORT order executed');
  const posEth = execEth.position!;

  // Simulate elapsed time for funding accrual (e.g., simulate backdated openTime)
  posEth.openTime = Date.now() - 4 * 3600 * 1000; // 4 hours ago
  bot4.onPriceUpdate('ETHUSDT', ethTicker);
  assert(posEth.accruedFunding > 0, `Funding fee accrued over 4 hours (${posEth.accruedFunding} USDT)`);
  assert(posEth.currentCosts > posEth.openFee + posEth.estExitFee, 'Total costs include accrued funding drag');

  // Close ETH position to keep state clean for next tests
  bot4.closePosition('ETHUSDT', ethTicker, 'MANUAL_CLOSE');
  assert(bot4.getPositions().length === 0, 'Cleaned up ETH position');

  // ==========================================
  // TEST 4: Idempotency Key & Anti-Duplicate Order Protection
  // ==========================================
  console.log('\n▶ TEST 4: Idempotency Key & Anti-Duplicate Orders');
  const duplicateSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 78500.0, 81500.0, 'SIG-IDEMP-TEST');
  const firstExec = bot4.executeSignal(duplicateSignal, btcTicker);
  assert(firstExec.success, 'First execution of signal succeeds');

  // Re-submit identical signal with exact same idempotency key / signal ID
  const secondExec = bot4.executeSignal(duplicateSignal, btcTicker);
  assert(!secondExec.success, 'Second execution of identical signal is rejected');
  assert(secondExec.rejectReason?.includes('DUPLICATE_ORDER_SUPPRESSED') === true, 'Rejection reason states duplicate suppressed');
  assert(bot4.getMetrics().duplicatesBlockedCount >= 1, 'Duplicate blocked counter incremented');
  assert(bot4.getPositions().length === 1, 'Only one position exists; duplicate order prevented');

  // ==========================================
  // TEST 5: Atomic In-Flight Close Lock (Anti-Duplicate Close)
  // ==========================================
  console.log('\n▶ TEST 5: Atomic In-Flight Close Lock');
  // Attempt concurrent closes on the same position
  const posToClose = bot4.getPosition('BTCUSDT')!;
  posToClose.closingInProgress = true; // simulate in-flight closing lock

  const duplicateClose = bot4.closePosition('BTCUSDT', btcTicker, 'MANUAL_CLOSE');
  assert(duplicateClose === null, 'Concurrent close request blocked while closing in-flight');
  assert(bot4.getMetrics().duplicateClosesBlockedCount >= 1, 'Duplicate close blocked counter incremented');

  posToClose.closingInProgress = false; // release lock and close legitimately
  const legitimateClose = bot4.closePosition('BTCUSDT', btcTicker, 'MANUAL_CLOSE');
  assert(legitimateClose !== null, 'Legitimate close succeeds once lock is free');

  // ==========================================
  // TEST 6: Protective Stop Loss Preservation
  // ==========================================
  console.log('\n▶ TEST 6: Protective Stop Loss Preservation (Strict SL)');
  const slSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 79200.0, 81600.0, 'SIG-SL-TEST');
  const slExec = bot4.executeSignal(slSignal, btcTicker);
  assert(slExec.success, 'Position opened with Stop Loss at 79,200');

  // Price dumps below Stop Loss
  const dumpedTicker: TickerData = {
    ...btcTicker,
    lastPr: 79150.0, // breached SL of 79,200
    bidPr: 79148.0,
    askPr: 79152.0,
  };

  const slResult = bot4.onPriceUpdate('BTCUSDT', dumpedTicker);
  assert(slResult.closedTrade !== undefined, 'Stop Loss triggered immediately on breach');
  assert(slResult.closedTrade!.reason === 'STOP_LOSS', 'Closure reason is STOP_LOSS');
  assert(slResult.closedTrade!.netPnL < 0, `Loss recorded accurately (-$${Math.abs(slResult.closedTrade!.netPnL)} USDT)`);
  assert(bot4.getPositions().length === 0, 'Position cleanly removed from book upon SL hit');

  // ==========================================
  // TEST 7: Capital Exhaustion & Margin Over-allocation Safeguards
  // ==========================================
  console.log('\n▶ TEST 7: Capital Allocation & Margin Limits');
  // Fill up max simultaneous positions (max 2 positions, 2 USDT each = 4 USDT total margin)
  const pos1Signal = createSignal('BTCUSDT', 'LONG', 80000.0, 79000.0, 82000.0, 'SIG-POS-1');
  const pos2Signal = createSignal('ETHUSDT', 'LONG', 2500.0, 2450.0, 2600.0, 'SIG-POS-2');
  const pos3Signal = createSignal('SOLUSDT', 'LONG', 100.0, 95.0, 110.0, 'SIG-POS-3');

  const p1 = bot4.executeSignal(pos1Signal, btcTicker);
  const p2 = bot4.executeSignal(pos2Signal, ethTicker);
  assert(p1.success && p2.success, 'First 2 positions opened within capacity');

  // Attempt 3rd position when max is 2
  const solTicker: TickerData = {
    symbol: 'SOLUSDT',
    lastPr: 100.0,
    bidPr: 99.98,
    askPr: 100.02,
    change24h: 3.0,
    high24h: 105.0,
    low24h: 95.0,
    volume24h: 15000000,
    updatedAt: Date.now(),
    fundingRate: 0.0001,
  };

  const p3 = bot4.executeSignal(pos3Signal, solTicker);
  assert(!p3.success, 'Third position blocked due to maxSimultaneousPositions cap (2)');
  assert(p3.rejectReason?.includes('CAPACITY_FULL') === true, 'Rejection reason states CAPACITY_FULL');

  // Subtest: Insufficient Balance Check
  const brokeBot = new Bot4ExecutionManager({ targetMarginPerPosition: 2.0 }, 1.5); // only 1.5 USDT balance
  const brokeExec = brokeBot.executeSignal(btcSignal, btcTicker);
  assert(!brokeExec.success, 'Order rejected when wallet balance < target margin');
  assert(brokeExec.rejectReason?.includes('INSUFFICIENT_FREE_MARGIN') === true, 'Reason states INSUFFICIENT_FREE_MARGIN');

  // Clean up positions for pos1 and pos2
  bot4.closePosition('BTCUSDT', btcTicker, 'MANUAL_CLOSE');
  bot4.closePosition('ETHUSDT', ethTicker, 'MANUAL_CLOSE');

  // ==========================================
  // TEST 8: Emergency Kill Switch & Market Data Stale Auto-Halt
  // ==========================================
  console.log('\n▶ TEST 8: Emergency Kill Switch & Data Staleness Halt');
  const ksSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 78500.0, 81500.0, 'SIG-KS-1');
  bot4.executeSignal(ksSignal, btcTicker);
  assert(bot4.getPositions().length === 1, 'Position opened prior to kill switch');

  // Activate Kill Switch
  bot4.triggerKillSwitch('Market Anomaly Detected');
  assert(bot4.getMetrics().isKillSwitchActive, 'Kill switch is active');
  assert(bot4.getPositions().length === 0, 'All positions liquidated immediately on kill switch');

  // Attempt new trade while kill switch active
  const newKSSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 78500.0, 81500.0, 'SIG-KS-2');
  const blockedByKS = bot4.executeSignal(newKSSignal, btcTicker);
  assert(!blockedByKS.success, 'New trades blocked while Kill Switch active');
  assert(blockedByKS.rejectReason?.includes('KILL_SWITCH_ACTIVE') === true, 'Reason identifies Kill Switch');

  bot4.resetKillSwitch();
  assert(!bot4.getMetrics().isKillSwitchActive, 'Kill switch reset');

  // Test Stale Data Halt (>60s old)
  const staleTicker: TickerData = {
    ...btcTicker,
    updatedAt: Date.now() - 75000, // 75 seconds old
  };
  const staleSignal = createSignal('BTCUSDT', 'LONG', 80000.0, 78500.0, 81500.0, 'SIG-STALE');
  const staleExec = bot4.executeSignal(staleSignal, staleTicker);
  assert(!staleExec.success, 'Trade blocked due to stale market data (>60s)');
  assert(staleExec.rejectReason?.includes('DATA_STALE') === true, 'Reason identifies DATA_STALE');

  // ==========================================
  // TEST 9: Partial Fill Simulation
  // ==========================================
  console.log('\n▶ TEST 9: Partial Fill Simulation');
  const partialBot = new Bot4ExecutionManager(
    {
      targetMarginPerPosition: 2.0,
      maxLeverage: 5,
      partialFillProbability: 1.0, // Force partial fill
    },
    10.0
  );

  // ETHUSDT: 10 USDT notional / 2500 = 0.004 ETH. lotSize is 0.001. 65% is 0.002 ETH (valid partial fill)
  const partialSignal = createSignal('ETHUSDT', 'LONG', 2500.0, 2450.0, 2600.0, 'SIG-PARTIAL');
  const partialResult = partialBot.executeSignal(partialSignal, ethTicker);
  assert(partialResult.success, 'Partial fill executed');
  assert(partialResult.order?.status === 'PARTIALLY_FILLED', 'Order status is PARTIALLY_FILLED');
  assert(partialResult.position!.margin < 2.0, 'Margin allocated is proportional to filled amount');
  assert(partialBot.getMetrics().ordersPartiallyFilledCount >= 1, 'Partial fill recorded in metrics');

  // ==========================================
  // TEST 10: Double-Entry Ledger Reconciliation & Restart Sync
  // ==========================================
  console.log('\n▶ TEST 10: Double-Entry Ledger Audit & Restart State Recovery');
  const audit = bot4.auditLedgerConsistency();
  assert(audit.isReconciled, 'Ledger debits and credits reconcile with cash balance (0 discrepancy)');
  assert(audit.ledgerEntriesCount > 0, `Ledger records maintained (${audit.ledgerEntriesCount} entries)`);

  // Test System Restart Simulation
  const snapshotPositions = bot4.getPositions();
  const snapshotTrades = bot4.getClosedTrades();
  const snapshotMetrics = bot4.getMetrics();

  const restartedBot = new Bot4ExecutionManager();
  restartedBot.syncFromStoredState(snapshotPositions, snapshotTrades, snapshotMetrics.walletBalance);

  assert(restartedBot.getPositions().length === snapshotPositions.length, 'Restored exact open positions count without loss');
  assert(restartedBot.getClosedTrades().length === snapshotTrades.length, 'Restored trade history');
  assert(Math.abs(restartedBot.getMetrics().walletBalance - snapshotMetrics.walletBalance) < 0.001, 'Restored wallet balance accurately');

  // Test 1-Minute Periodic Heartbeat
  const heartbeatResult = bot4.runHeartbeat();
  assert(heartbeatResult.auditPassed, 'Periodic 1-minute heartbeat audit passed');

  // ==========================================
  // FINAL REPORT & METRICS SUMMARY
  // ==========================================
  const finalMetrics = bot4.getMetrics();
  console.log('\n===============================================================');
  console.log('📊 BOT 4 PERFORMANCE & METRICS AUDIT REPORT');
  console.log('===============================================================');
  console.log(`- Final Paper Equity:           $${finalMetrics.equity.toFixed(4)} USDT`);
  console.log(`- Free Wallet Balance:          $${finalMetrics.walletBalance.toFixed(4)} USDT`);
  console.log(`- Allocated Margin:             $${finalMetrics.allocatedMargin.toFixed(4)} USDT`);
  console.log(`- Margin Utilization:           ${finalMetrics.marginUtilizationPct.toFixed(2)}%`);
  console.log(`- Orders Submitted:             ${finalMetrics.ordersSubmittedCount}`);
  console.log(`- Orders Filled:                ${finalMetrics.ordersFilledCount}`);
  console.log(`- Orders Partially Filled:      ${finalMetrics.ordersPartiallyFilledCount}`);
  console.log(`- Orders Rejected:              ${finalMetrics.ordersRejectedCount}`);
  console.log(`- Duplicates Suppressed:        ${finalMetrics.duplicatesBlockedCount}`);
  console.log(`- Duplicate Closes Suppressed:  ${finalMetrics.duplicateClosesBlockedCount}`);
  console.log(`- Realized Net PnL:             $${finalMetrics.totalRealizedNetPnL.toFixed(4)} USDT`);
  console.log(`- Realized Gross PnL:           $${finalMetrics.totalGrossPnL.toFixed(4)} USDT`);
  console.log(`- Total Taker Fees Paid:        $${finalMetrics.totalFeesPaid.toFixed(4)} USDT`);
  console.log(`- Total Funding Fees Paid:      $${finalMetrics.totalFundingPaid.toFixed(4)} USDT`);
  console.log(`- Average Slippage:             ${finalMetrics.totalSlippageBpsAvg.toFixed(2)} bps`);
  console.log(`- Average Latency:              ${finalMetrics.avgExecutionLatencyMs.toFixed(1)} ms`);
  console.log(`- Ledger Reconciled:            ${finalMetrics.lastAuditResult.isReconciled ? 'YES (0 discrepancy)' : 'NO'}`);
  console.log(`- Live Trading Status:          STRICTLY DISABLED (Paper Trading Only)`);
  console.log(`- Test Score:                   ${passedTests} / ${totalTests} (${Math.round((passedTests / totalTests) * 100)}% Passed)`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runBot4TestSuite().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
