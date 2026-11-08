import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EngineSettings, Position, ClosedTrade, LogMessage, BotState, TickerData } from '../types/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const STATE_FILE = path.join(DATA_DIR, 'engine_state.json');

export interface ServerState {
  walletBalance: number;
  positions: Position[];
  tradeHistory: ClosedTrade[];
  isEngineRunning: boolean;
  cycleCountdown: number;
  settings: EngineSettings;
  logs: LogMessage[];
  botState: BotState;
  tickers: Record<string, TickerData>;
  serverStats: {
    serverStartTime: number;
    totalCyclesRun: number;
    totalTradesExecuted: number;
    lastTickTime: number;
  };
}

export const DEFAULT_SETTINGS: EngineSettings = {
  startingBalance: 10.0,
  marginPerTrade: 2.0,
  maxLeverage: 10,
  maxPositions: 2,
  makerFee: 0.0002, // 0.02%
  takerFee: 0.0006, // 0.06%
  slippagePct: 0.0005, // 0.05%
  netPnLThreshold: 0.0001, // Auto close immediately when Net PnL > 0
  stopLossPct: -5, // -5% of margin
  cycleIntervalSeconds: 60,
  soundEnabled: true,
  autoTradingEnabled: true, // Tự động mở vị thế khi có tín hiệu đạt chuẩn
  autoCloseEnabled: true, // Tự động chốt lời Net PnL > 0 và bảo toàn vốn
  bot5AutoApproveOOS: false, // Yêu cầu phê duyệt đề xuất (hoặc bật auto khi OOS đạt)
  bot5MinSampleSize: 5, // Tối thiểu 5 lệnh đóng để tối ưu OOS

  // 24/7 Cloud Background & Telegram Alerts Settings
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  telegramNotifyOnOpen: true,
  telegramNotifyOnClose: true,
  telegramNotifyOnError: true,
  telegramNotifyHeartbeat: true,
  telegramHeartbeatIntervalMinutes: 60,
};

export const INITIAL_SERVER_STATE: ServerState = {
  walletBalance: 10.0,
  positions: [],
  tradeHistory: [],
  isEngineRunning: true,
  cycleCountdown: 60,
  settings: DEFAULT_SETTINGS,
  logs: [
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      source: 'SYS',
      message: 'Server 24/7 Background Trading Engine started. Runs continuously even if browser is closed.',
      type: 'cyan',
    },
    {
      id: 'init-2',
      time: new Date().toLocaleTimeString(),
      source: 'BOT4',
      message: 'Active Execution Rule: Instant Auto-Close on Net PnL > $0.0001',
      type: 'warning',
    },
  ],
  botState: {
    bot1: { status: 'Scanner Active', scannedCount: 8, lastScanTime: Date.now(), topCandidate: 'BTCUSDT' },
    bot2: { status: 'MTF Analyst Ready', analyzedCoin: 'ETHUSDT', mtfScore: 84, bias: 'BULLISH' },
    bot3: {
      status: 'Signal Engine Active',
      signalActive: false,
      lastSignal: 'IDLE',
      confidence: 80,
      activeSignals: [],
      recentSignalsHistory: [],
      lastEvaluations: [],
      performance: {
        signalsGeneratedToday: 0,
        signalsConfirmedToday: 0,
        signalsRejectedToday: 0,
        avgExpectedNetEdgeBps: 0,
        avgRiskRewardRatio: 0,
      },
    },
    bot4: { status: 'Net PnL Zero', rule: 'Auto-Close on Net PnL > 0', executedToday: 0, winRate: 100 },
    bot5: { status: 'Audit Learn Ready', totalEvaluated: 0, netProfit: 0, feeDrag: 0 },
  },
  tickers: {},
  serverStats: {
    serverStartTime: Date.now(),
    totalCyclesRun: 0,
    totalTradesExecuted: 0,
    lastTickTime: Date.now(),
  },
};

export function loadServerState(): ServerState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // Merge with defaults to guarantee all fields exist
      return {
        ...INITIAL_SERVER_STATE,
        ...parsed,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
        },
        serverStats: {
          ...INITIAL_SERVER_STATE.serverStats,
          ...(parsed.serverStats || {}),
          lastTickTime: Date.now(),
        },
      };
    }
  } catch (err) {
    console.error('Failed to load server state from disk, using initial:', err);
  }

  // Create initial state file
  saveServerState(INITIAL_SERVER_STATE);
  return { ...INITIAL_SERVER_STATE };
}

let lastSaveTimestamp = Date.now();
let dbStatus: 'PERSISTED' | 'SAVING' | 'ERROR' = 'PERSISTED';

const TRADES_LEDGER_FILE = path.join(DATA_DIR, 'trades_ledger.jsonl');
const SYSTEM_AUDIT_FILE = path.join(DATA_DIR, 'audit_log.jsonl');

let saveTimeout: NodeJS.Timeout | null = null;
export function scheduleSaveServerState(state: ServerState) {
  if (saveTimeout) return;
  dbStatus = 'SAVING';
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveServerState(state);
  }, 300);
}

export function saveServerState(state: ServerState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, STATE_FILE);
    lastSaveTimestamp = Date.now();
    dbStatus = 'PERSISTED';
  } catch (err) {
    dbStatus = 'ERROR';
    console.error('Failed to save server state to disk:', err);
  }
}

/**
 * Append-only immutable trade ledger (JSONL)
 * Ensures historical trade records are permanently preserved even if JSON state file is rewritten
 */
export function appendTradeToLedger(trade: ClosedTrade) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const entry = JSON.stringify({
      ...trade,
      recordedAt: Date.now(),
      recordedIso: new Date().toISOString(),
    }) + '\n';
    fs.appendFileSync(TRADES_LEDGER_FILE, entry, 'utf-8');
  } catch (err) {
    console.error('Failed to append trade to ledger:', err);
  }
}

/**
 * Append-only immutable system audit log (JSONL)
 */
export function appendAuditLog(eventType: string, details: Record<string, any>) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const entry = JSON.stringify({
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      eventType,
      details,
    }) + '\n';
    fs.appendFileSync(SYSTEM_AUDIT_FILE, entry, 'utf-8');
  } catch (err) {
    console.error('Failed to append audit log:', err);
  }
}

export function getDbStatus(): 'PERSISTED' | 'SAVING' | 'ERROR' {
  return dbStatus;
}

export function getLastDbSaveTimestamp(): number {
  return lastSaveTimestamp;
}
