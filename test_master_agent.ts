/**
 * MEO AI HYBRID AGENT V1 — PHASE 2 VERIFICATION TEST SUITE
 * Tests Master Agent Orchestrator:
 * 1. Standardized 5-Bot Registry & APIs
 * 2. Immutable Central Safety Configurations (Directive Section A)
 * 3. Master Event Bus decoupled communication
 * 4. Heartbeat pulse & Watchdog stall detection + self-recovery
 * 5. Autonomous 5-Bot pipeline execution
 * 6. Emergency Halt & Resume safety mechanics
 * 7. Live Trading Lockout enforcement (LIVE_TRADING_ENABLED=false)
 */

import { serverEngine } from './src/server/engine';
import { IMMUTABLE_SAFETY_CONFIG } from './src/types/masterAgent';
import { MasterEvent } from './src/types/masterAgent';

async function runMasterAgentVerification() {
  console.log('===============================================================');
  console.log('🤖 MEO AI HYBRID AGENT V1 — PHASE 2 MASTER AGENT VERIFICATION');
  console.log('===============================================================\n');

  let passedTests = 0;
  const masterAgent = serverEngine.getMasterAgent();
  const eventBus = masterAgent.getEventBus();

  // -------------------------------------------------------------------------
  // TEST 1: Standardized 5-Bot Registry & Lifecycle Status
  // -------------------------------------------------------------------------
  console.log('▶ TEST 1: Standardized 5-Bot Registry & Initial Lifecycle State');
  const initialStatus = masterAgent.getStatus();

  if (initialStatus.masterStatus !== 'RUNNING') {
    throw new Error(`Master status expected RUNNING, got: ${initialStatus.masterStatus}`);
  }
  console.log('  ✅ [PASS] Master Agent status is RUNNING');

  const registeredBotKeys = Object.keys(initialStatus.bots);
  const requiredBots = ['BOT1_SCANNER', 'BOT2_ANALYST', 'BOT3_SIGNAL', 'BOT4_EXECUTION', 'BOT5_LEARNING'];

  for (const botKey of requiredBots) {
    if (!registeredBotKeys.includes(botKey)) {
      throw new Error(`Missing registered bot in Master Agent: ${botKey}`);
    }
    const reg = (initialStatus.bots as any)[botKey];
    if (reg.status !== 'HEALTHY') {
      throw new Error(`Bot ${botKey} expected HEALTHY, got: ${reg.status}`);
    }
    if (!reg.capabilities || reg.capabilities.length === 0) {
      throw new Error(`Bot ${botKey} has no registered capabilities`);
    }
  }
  console.log(`  ✅ [PASS] All 5 bots registered with verified health and capabilities: ${registeredBotKeys.join(', ')}`);
  passedTests++;

  // -------------------------------------------------------------------------
  // TEST 2: Inviolable Central Safety Configurations (Directive Section A)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Central Immutable Safety Configuration Bounds');
  const safety = initialStatus.safetyConfig;

  if (safety.exchange !== 'Bitget USDT-M Futures') {
    throw new Error(`Exchange must strictly be Bitget USDT-M Futures, got: ${safety.exchange}`);
  }
  console.log(`  ✅ [PASS] Exchange verified: ${safety.exchange}`);

  if (safety.paperCapitalUsdt !== 100.0) {
    throw new Error(`Paper capital must strictly be 100 USDT, got: ${safety.paperCapitalUsdt}`);
  }
  console.log(`  ✅ [PASS] Paper Capital strictly set to: ${safety.paperCapitalUsdt} USDT`);

  if (safety.defaultMarginPerOrder !== 2.0) {
    throw new Error(`Default margin/order must strictly be 2.0 USDT, got: ${safety.defaultMarginPerOrder}`);
  }
  console.log(`  ✅ [PASS] Default Margin per order strictly set to: ${safety.defaultMarginPerOrder} USDT`);

  if (safety.maxConcurrentPositions !== 3) {
    throw new Error(`Max concurrent positions must strictly be 3, got: ${safety.maxConcurrentPositions}`);
  }
  console.log(`  ✅ [PASS] Max concurrent positions strictly set to: ${safety.maxConcurrentPositions}`);

  if (safety.maxTotalMarginUsdt !== 6.0) {
    throw new Error(`Max total margin must strictly be 6.0 USDT, got: ${safety.maxTotalMarginUsdt}`);
  }
  console.log(`  ✅ [PASS] Max total margin strictly set to: ${safety.maxTotalMarginUsdt} USDT`);

  if (safety.suggestedDailyLossLimitUsdt !== 2.0) {
    throw new Error(`Daily loss limit must strictly be 2.0 USDT, got: ${safety.suggestedDailyLossLimitUsdt}`);
  }
  console.log(`  ✅ [PASS] Daily loss limit strictly set to: ${safety.suggestedDailyLossLimitUsdt} USDT`);

  if (safety.suggestedMaxDrawdownUsdt !== 5.0) {
    throw new Error(`Max drawdown limit must strictly be 5.0 USDT, got: ${safety.suggestedMaxDrawdownUsdt}`);
  }
  console.log(`  ✅ [PASS] Max drawdown limit strictly set to: ${safety.suggestedMaxDrawdownUsdt} USDT`);

  // Section G: Live Trading Lockout
  if (safety.liveTradingEnabled !== false || initialStatus.liveExecutionLock.locked !== true) {
    throw new Error('LIVE_TRADING_ENABLED must be strictly false and locked!');
  }
  console.log('  ✅ [PASS] Backend-enforced Live Execution Lock verified: LIVE_TRADING_ENABLED=false (LOCKED)');
  passedTests++;

  // -------------------------------------------------------------------------
  // TEST 3: Master Event Bus Decoupled Asynchronous Communication
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Master Event Bus Decoupled Communication');
  const receivedEvents: MasterEvent[] = [];

  const unsubscribe = eventBus.on('ORDER_REQUESTED', (evt) => {
    receivedEvents.push(evt);
  });

  const emitted = await eventBus.emit(
    'ORDER_REQUESTED',
    { symbol: 'BTCUSDT', side: 'LONG', margin: 2.0 },
    'BOT3_SIGNAL',
    99
  );

  if (emitted.type !== 'ORDER_REQUESTED') {
    throw new Error(`Emitted event type mismatch: ${emitted.type}`);
  }
  if (receivedEvents.length === 0 || receivedEvents[0].id !== emitted.id) {
    throw new Error('Event bus listener failed to receive emitted event');
  }
  console.log(`  ✅ [PASS] Event Bus successfully dispatched and listened to ${emitted.id}`);

  unsubscribe(); // clean up
  const recentEvents = eventBus.getRecentEvents(10);
  if (!recentEvents.some((e) => e.type === 'ORDER_REQUESTED')) {
    throw new Error('Recent event history does not contain emitted event');
  }
  console.log(`  ✅ [PASS] Event Bus retains verified history (${recentEvents.length} events logged)`);
  passedTests++;

  // -------------------------------------------------------------------------
  // TEST 4: Heartbeat Pulse & Multi-Tier Watchdog Stall Detection + Recovery
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Heartbeat Pulse & Multi-Tier Watchdog Stall Detection + Recovery');
  masterAgent.heartbeatPulse();
  const pulseStatus = masterAgent.getStatus();
  if (Date.now() - pulseStatus.watchdog.lastPulse > 1000) {
    throw new Error('Heartbeat pulse failed to update lastPulse timestamp');
  }
  console.log('  ✅ [PASS] Heartbeat pulse refreshed successfully');

  // Verify watchdog check when all bots are fresh
  const initialCheck = masterAgent.watchdogCheck();
  if (!initialCheck.healthy || initialCheck.stalledBots.length > 0) {
    throw new Error(`Watchdog should be healthy, got stalled bots: ${initialCheck.stalledBots.join(', ')}`);
  }
  console.log('  ✅ [PASS] Watchdog check confirmed 5/5 bots are responsive');

  // Test individual bot self-recovery
  const recovered = await masterAgent.recoverBot('BOT1_SCANNER');
  if (!recovered) {
    throw new Error('Bot 1 self-recovery failed');
  }
  console.log('  ✅ [PASS] Bot 1 self-recovery procedure executed cleanly');
  passedTests++;

  // -------------------------------------------------------------------------
  // TEST 5: Autonomous 5-Bot Pipeline Execution by Master Agent
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Autonomous 5-Bot Pipeline Execution by Master Agent');
  const pipelineSnapshot = serverEngine.getPipelineSnapshot();
  const logEntries: string[] = [];

  const success = await masterAgent.runAutonomousPipeline(pipelineSnapshot, (msg, type, source) => {
    logEntries.push(`[${source}] ${msg}`);
  });

  if (!success) {
    throw new Error('Master Agent runAutonomousPipeline failed');
  }

  const updatedStatus = masterAgent.getStatus();
  if (updatedStatus.cycleCount < 1) {
    throw new Error(`Cycle count expected >= 1, got: ${updatedStatus.cycleCount}`);
  }
  console.log(`  ✅ [PASS] Pipeline completed Cycle #${updatedStatus.cycleCount} in ${updatedStatus.lastCycleDurationMs}ms`);

  const positions = serverEngine.getBot4Manager().getPositions();
  if (positions.length > safety.maxConcurrentPositions) {
    throw new Error(`Positions exceeded max limit ${safety.maxConcurrentPositions}: currently ${positions.length}`);
  }
  console.log(`  ✅ [PASS] Position limit respected: ${positions.length}/${safety.maxConcurrentPositions} open positions`);

  const totalMargin = positions.reduce((sum, p) => sum + (p.margin || 0), 0);
  if (totalMargin > safety.maxTotalMarginUsdt) {
    throw new Error(`Total margin exceeded max limit ${safety.maxTotalMarginUsdt}: currently ${totalMargin}`);
  }
  console.log(`  ✅ [PASS] Total margin limit respected: ${totalMargin.toFixed(2)}/${safety.maxTotalMarginUsdt} USDT`);
  passedTests++;

  // -------------------------------------------------------------------------
  // TEST 6: Emergency Halt & Safe Resume Mechanics
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Emergency Halt & Safe Resume Mechanics');
  masterAgent.triggerEmergencyHalt('Test Emergency Safety Circuit Breaker');
  const haltedStatus = masterAgent.getStatus();

  if (haltedStatus.masterStatus !== 'HALTED' || haltedStatus.currentPhase !== 'EMERGENCY_HALT') {
    throw new Error(`Expected HALTED state, got: ${haltedStatus.masterStatus} / ${haltedStatus.currentPhase}`);
  }
  console.log('  ✅ [PASS] Emergency Halt successfully engaged: status is HALTED');

  // Verify that new pipeline cycle is refused when halted
  const cycleAttemptWhileHalted = await masterAgent.runAutonomousPipeline(pipelineSnapshot, () => {});
  if (cycleAttemptWhileHalted !== false) {
    throw new Error('Master Agent must NOT execute pipeline cycles while HALTED!');
  }
  console.log('  ✅ [PASS] New order cycles strictly rejected during EMERGENCY_HALT');

  // Resume
  masterAgent.resumeFromHalt();
  const resumedStatus = masterAgent.getStatus();
  if (resumedStatus.masterStatus !== 'RUNNING') {
    throw new Error(`Expected RUNNING state after resume, got: ${resumedStatus.masterStatus}`);
  }
  console.log('  ✅ [PASS] Safe resume restored master status to RUNNING');
  passedTests++;

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedTests}/6 MASTER AGENT TESTS PASSED WITH 100% SUCCESS!`);
  console.log('===============================================================');
  process.exit(0);
}

runMasterAgentVerification().catch((err) => {
  console.error('\n❌ MASTER AGENT VERIFICATION FAILED:', err);
  process.exit(1);
});
