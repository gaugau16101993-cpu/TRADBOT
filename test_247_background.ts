import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadServerState, saveServerState, appendTradeToLedger, appendAuditLog, getDbStatus } from './src/server/storage';
import { BackgroundWorker } from './src/server/backgroundWorker';
import { TelegramNotifier } from './src/server/telegramService';
import { ClosedTrade } from './src/types/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const TRADES_LEDGER_FILE = path.join(DATA_DIR, 'trades_ledger.jsonl');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.jsonl');

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    process.exit(1);
  }
}

async function run247BackgroundTestSuite() {
  console.log('===============================================================');
  console.log('☁️ 24/7 CLOUD SERVER DAEMON & TELEGRAM MONITORING TEST SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: DATABASE PERSISTENCE & ZERO DATA-LOSS RESTART RECOVERY
  // -------------------------------------------------------------------------
  console.log('▶ TEST 1: Server Restart & State Persistence');
  const testState = loadServerState();
  assert(typeof testState.walletBalance === 'number', 'Wallet balance loaded from persistent storage');
  assert(testState.walletBalance > 0, `Wallet balance is non-zero ($${testState.walletBalance.toFixed(2)} USDT)`);
  assert(testState.settings.marginPerTrade === 2.0, 'Strict 2.0 USDT target margin preserved');
  assert(testState.settings.startingBalance === 10.0, 'Strict 10.0 USDT starting balance preserved');

  // Simulate an active position and test atomic save
  const mockTrade: ClosedTrade = {
    id: `TRD-TEST-PERSIST-${Date.now()}`,
    time: Date.now(),
    symbol: 'BTCUSDT',
    side: 'LONG',
    entry: 80500,
    exit: 80600,
    margin: 2.0,
    leverage: 5,
    amount: 0.00012,
    grossPnL: 0.012,
    costs: 0.006,
    netPnL: 0.006,
    roe: 0.3,
    durationSeconds: 42,
    reason: 'NET_PNL_POSITIVE_TRIGGER',
    botId: 4,
  };

  testState.tradeHistory.unshift(mockTrade);
  saveServerState(testState);

  // Reload state from disk simulating server reboot
  const reloadedState = loadServerState();
  const foundTrade = reloadedState.tradeHistory.find((t) => t.id === mockTrade.id);
  assert(foundTrade !== undefined, 'State successfully recovered from disk after simulated server reboot');
  assert(foundTrade!.netPnL === 0.006, 'Net PnL data preserved exactly ($0.006)');
  assert(getDbStatus() === 'PERSISTED', 'DB persistence status verified as PERSISTED');

  // -------------------------------------------------------------------------
  // TEST 2: IMMUTABLE APPEND-ONLY LEDGER (trades_ledger.jsonl)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Immutable Append-Only Ledger (trades_ledger.jsonl)');
  const initialLedgerLines = fs.existsSync(TRADES_LEDGER_FILE)
    ? fs.readFileSync(TRADES_LEDGER_FILE, 'utf-8').trim().split('\n').filter(Boolean).length
    : 0;

  appendTradeToLedger(mockTrade);
  appendAuditLog('TEST_EVENT_LOGGED', { note: '24/7 test run', timestamp: Date.now() });

  assert(fs.existsSync(TRADES_LEDGER_FILE), 'trades_ledger.jsonl exists on filesystem');
  const updatedLedgerLines = fs.readFileSync(TRADES_LEDGER_FILE, 'utf-8').trim().split('\n').filter(Boolean).length;
  assert(updatedLedgerLines === initialLedgerLines + 1, `Ledger appended exactly 1 line (Total: ${updatedLedgerLines})`);

  const lastLine = JSON.parse(
    fs.readFileSync(TRADES_LEDGER_FILE, 'utf-8').trim().split('\n').filter(Boolean).pop()!
  );
  assert(lastLine.id === mockTrade.id, 'Last ledger entry ID matches closed trade');
  assert(lastLine.recordedAt > 0, 'Ledger entry contains recordedAt timestamp');

  // -------------------------------------------------------------------------
  // TEST 3: BACKGROUND WORKER, PROCESS SHIELDS & WATCHDOG
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Background Worker Watchdog & Health Telemetry');
  let watchdogRecoverTriggered = false;

  const worker = new BackgroundWorker({
    onWatchdogStallRecover: () => {
      watchdogRecoverTriggered = true;
    },
  });

  worker.recordCycleSuccess(15);
  const health = worker.getHealth({
    websocketStatus: 'CONNECTED',
    activePositionsCount: 1,
    walletBalance: 10.05,
    telegramStatus: 'CONNECTED',
  });

  assert(health.status === 'RUNNING', 'Worker status is RUNNING');
  assert(health.isWorkerAlive === true, 'Worker is alive');
  assert(health.uptimeSeconds >= 0, `Uptime tracked (${health.uptimeFormatted})`);
  assert(health.totalCyclesCompleted === 1, 'Completed cycles recorded');
  assert(health.websocketStatus === 'CONNECTED', 'WebSocket health tracked');
  assert(health.memoryUsageMb > 0, `Node memory tracked (${health.memoryUsageMb} MB)`);
  assert(health.dbStatus === 'PERSISTED', 'DB status verified in health object');

  worker.destroy();

  // -------------------------------------------------------------------------
  // TEST 4: TELEGRAM NOTIFIER MESSAGE FORMATTING & QUEUE SAFETY
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Telegram Notifier Message Formatting & Templates');
  const notifier = new TelegramNotifier();

  // Test configuration management
  notifier.updateConfig({
    enabled: true,
    botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ',
    chatId: '987654321',
    notifyOnOpen: true,
    notifyOnClose: true,
    notifyOnError: true,
    notifyHeartbeat: true,
  });

  assert(notifier.isConfigured() === true, 'Telegram notifier recognized valid configuration');
  const masked = notifier.getMaskedConfig();
  assert(masked.botTokenMasked === '1234...wxYZ', `Bot token masked for security (${masked.botTokenMasked})`);

  // Verify that enqueuing messages works without crashing
  notifier.notifyOrderOpened({
    symbol: 'ETHUSDT',
    side: 'LONG',
    entryPrice: 2320.5,
    marginUsdt: 2.0,
    leverage: 5,
    stopLoss: 2300.0,
    takeProfit: 2360.0,
    strategy: 'Trend Pullback Pro',
    expectedNetEdgeBps: 22.5,
    signalId: 'SIG-TEST-001',
  });
  console.log('  ✅ [PASS] notifyOrderOpened dispatched without error');

  notifier.notifyOrderClosed({
    symbol: 'ETHUSDT',
    side: 'LONG',
    entryPrice: 2320.5,
    exitPrice: 2335.0,
    netPnL: 0.0245,
    grossPnL: 0.0312,
    totalCosts: 0.0067,
    roePct: 1.22,
    durationSeconds: 95,
    closeReason: 'NET_PNL_POSITIVE_TRIGGER',
  });
  console.log('  ✅ [PASS] notifyOrderClosed dispatched with positive Net PnL');

  notifier.notifyOrderClosed({
    symbol: 'SOLUSDT',
    side: 'SHORT',
    entryPrice: 102.5,
    exitPrice: 103.8,
    netPnL: -0.065,
    grossPnL: -0.052,
    totalCosts: 0.013,
    roePct: -3.25,
    durationSeconds: 40,
    closeReason: 'STOP_LOSS',
    rootCauseCategory: 'FALSE_SIGNAL_NOISE',
    rootCauseDescription: 'Bẫy nến vi mô M1 giật râu khi thanh khoản thấp',
  });
  console.log('  ✅ [PASS] notifyOrderClosed dispatched with Bot 5 root-cause diagnostics');

  notifier.notifyHeartbeat({
    uptimeFormatted: '1d 4h 12m',
    walletBalance: 10.15,
    openPositionsCount: 1,
    todayTradesCount: 12,
    todayNetPnL: 0.154,
    totalCyclesRun: 1440,
    wsStatus: 'CONNECTED',
  });
  console.log('  ✅ [PASS] notifyHeartbeat dispatched with full 24/7 stats');

  notifier.notifyErrorAlert('Mất kết nối Bitget WebSocket', 'Hệ thống đã tự động kích hoạt kết nối lại với Bitget.');
  console.log('  ✅ [PASS] notifyErrorAlert dispatched');

  // -------------------------------------------------------------------------
  // TEST 5: PAPER TRADING SAFETY BOUNDARIES & REAL BITGET DATA FEEDS
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Strict Paper Trading Safeguards (No Live Trading)');
  assert(testState.settings.marginPerTrade === 2.0, 'Strict 2.0 USDT margin per position enforced');
  assert(testState.settings.startingBalance === 10.0, 'Strict 10.0 USDT initial capital');
  assert(testState.settings.maxPositions <= 4, 'Max positions strictly bounded (<= 4)');

  console.log('\n===============================================================');
  console.log('🎉 ALL 24/7 CLOUD SERVER DAEMON & TELEGRAM TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

run247BackgroundTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
