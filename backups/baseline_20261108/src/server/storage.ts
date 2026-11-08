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
  startingBalance: 100.0, // 100 USDT Paper Capital
  marginPerTrade: 5.0,    // 5.0 USDT / trade
  maxLeverage: 10,
  maxPositions: 10,       // Maximum concurrent positions: 10
  maxTotalMargin: 50.0,   // Maximum total margin: 50 USDT (up to 100 USDT capital)
  dailyLossLimit: 20.0,   // Daily loss limit: 20 USDT (20% of 100 USDT)
  maxDrawdownLimit: 25.0, // Max drawdown: 25 USDT
  liveTradingEnabled: false, // Locked at API level
  makerFee: 0.0002, // 0.02%
  takerFee: 0.0006, // 0.06%
  slippagePct: 0.0005, // 0.05%
  netPnLThreshold: 0.0001, // Auto close immediately when Net PnL > 0
  stopLossPct: -5, // -5% of margin
  cycleIntervalSeconds: 60,
  soundEnabled: true,
  autoTradingEnabled: true, // Tự động mở vị thế khi có tín hiệu đạt chuẩn
  autoCloseEnabled: true, // Tự động chốt lời Net PnL > 0 và bảo toàn vốn
  bot5AutoApproveOOS: true, // Tự động áp dụng tối ưu khi OOS đạt chuẩn an toàn
  bot5MinSampleSize: 5, // Tối thiểu 5 lệnh đóng để tối ưu OOS
  bypassCapitalProtection: true, // Chế độ tìm cơ hội toàn lực: Không bị chặn bởi rào cản bảo vệ vốn

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
  walletBalance: 100.0,
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
      const rawBalance = typeof parsed.walletBalance === 'number' ? parsed.walletBalance : 100.0;
      // Guarantee paper balance is upgraded to 100 USDT for autonomous operation
      const finalBalance = rawBalance < 50.0 ? 100.0 : rawBalance;
      const parsedSettings = parsed.settings || {};

      return {
        ...INITIAL_SERVER_STATE,
        ...parsed,
        walletBalance: finalBalance,
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsedSettings,
          startingBalance: 100.0,
          marginPerTrade: parsedSettings.marginPerTrade && parsedSettings.marginPerTrade >= 2 ? parsedSettings.marginPerTrade : 5.0,
          maxPositions: Math.max(10, parsedSettings.maxPositions || 10),
          maxTotalMargin: Math.max(25.0, parsedSettings.maxTotalMargin || 50.0),
          dailyLossLimit: Math.max(15.0, parsedSettings.dailyLossLimit || 20.0),
          maxDrawdownLimit: Math.max(20.0, parsedSettings.maxDrawdownLimit || 25.0),
          liveTradingEnabled: false,
          autoTradingEnabled: true,
          autoCloseEnabled: true,
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
const NO_TRADE_LEDGER_FILE = path.join(DATA_DIR, 'no_trade_learning.jsonl');

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

let ledgerTradesCache: ClosedTrade[] | null = null;

/**
 * Loads and consolidates all historical closed trades from permanent append-only ledger and state.
 * Guaranteed to never drop or truncate past trading history.
 */
export function getAllLedgerTrades(stateTrades?: ClosedTrade[]): ClosedTrade[] {
  if (ledgerTradesCache && ledgerTradesCache.length > 0 && (!stateTrades || stateTrades.length <= ledgerTradesCache.length)) {
    return ledgerTradesCache;
  }

  const tradeMap = new Map<string, ClosedTrade>();

  // 1. Load from append-only JSONL file if it exists
  if (fs.existsSync(TRADES_LEDGER_FILE)) {
    try {
      const content = fs.readFileSync(TRADES_LEDGER_FILE, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const id = parsed.id || parsed.tradeId || `TRD-${parsed.time}-${parsed.symbol}`;
          const normalized: ClosedTrade = {
            id,
            time: parsed.time || parsed.exitTime || parsed.entryTime || Date.now(),
            symbol: parsed.symbol,
            side: parsed.side,
            entry: parsed.entry ?? parsed.entryPrice ?? 0,
            exit: parsed.exit ?? parsed.exitPrice ?? 0,
            margin: parsed.margin ?? parsed.marginUsdt ?? 2,
            leverage: parsed.leverage ?? 10,
            amount: parsed.amount ?? (parsed.notionalUsdt && parsed.entryPrice ? parsed.notionalUsdt / parsed.entryPrice : 0),
            grossPnL: parsed.grossPnL ?? 0,
            costs: parsed.costs ?? parsed.totalCosts ?? 0,
            netPnL: parsed.netPnL ?? 0,
            roe: parsed.roe ?? parsed.roePct ?? 0,
            durationSeconds: parsed.durationSeconds ?? 0,
            reason: parsed.reason ?? parsed.closeReason ?? 'TAKE_PROFIT',
            botId: parsed.botId ?? 4,
            stopLoss: parsed.stopLoss,
            takeProfit: parsed.takeProfit,
            openFee: parsed.openFee,
            exitFee: parsed.exitFee,
            slippageBps: parsed.slippageBps,
            strategy: parsed.strategy,
            signalId: parsed.signalId,
          };
          tradeMap.set(id, normalized);
        } catch {
          // ignore corrupted lines
        }
      }
    } catch (err) {
      console.error('Failed reading trades ledger:', err);
    }
  }

  // 2. Consolidate trades passed from state or STATE_FILE
  const sourceTrades = stateTrades || [];
  let addedNewCount = 0;
  for (const t of sourceTrades) {
    const id = t.id || (t as any).tradeId || `TRD-${t.time || (t as any).exitTime}-${t.symbol}`;
    const normalized: ClosedTrade = {
      ...t,
      id,
      time: t.time || (t as any).exitTime || (t as any).recordedAt || Date.now(),
      symbol: t.symbol,
      side: ((t.side || 'LONG') as string).toUpperCase() as any,
      entry: t.entry ?? (t as any).entryPrice ?? 0,
      exit: t.exit ?? (t as any).exitPrice ?? 0,
      margin: t.margin ?? (t as any).marginUsdt ?? 2,
      leverage: t.leverage ?? 10,
      amount: t.amount ?? 0,
      grossPnL: t.grossPnL ?? 0,
      costs: t.costs ?? (t as any).totalCosts ?? 0,
      netPnL: t.netPnL ?? 0,
      roe: t.roe ?? (t as any).roePct ?? 0,
      durationSeconds: t.durationSeconds ?? 0,
      reason: t.reason ?? (t as any).closeReason ?? 'TAKE_PROFIT',
      botId: t.botId ?? 4,
    };
    if (!tradeMap.has(id)) {
      tradeMap.set(id, normalized);
      // Append missing historical trade to JSONL so it is never lost
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const entry = JSON.stringify({
          ...normalized,
          recordedAt: Date.now(),
          recordedIso: new Date().toISOString(),
        }) + '\n';
        fs.appendFileSync(TRADES_LEDGER_FILE, entry, 'utf-8');
        addedNewCount++;
      } catch {
        // ignore
      }
    } else {
      const existing = tradeMap.get(id)!;
      if (existing.costs === undefined || existing.costs === null) {
        existing.costs = normalized.costs;
      }
    }
  }

  // Sort newest first
  const allTrades = Array.from(tradeMap.values()).sort((a, b) => (b.time || 0) - (a.time || 0));
  ledgerTradesCache = allTrades;
  if (addedNewCount > 0) {
    console.log(`[LEDGER] Consolidated and safely saved ${addedNewCount} historical trades into ${TRADES_LEDGER_FILE}. Total: ${allTrades.length}`);
  }
  return allTrades;
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

    // Update in-memory cache
    if (ledgerTradesCache) {
      const idx = ledgerTradesCache.findIndex((t) => t.id === trade.id);
      if (idx === -1) {
        ledgerTradesCache.unshift(trade);
      } else {
        ledgerTradesCache[idx] = trade;
      }
    }
  } catch (err) {
    console.error('Failed to append trade to ledger:', err);
  }
}

/**
 * Serves paginated trades for lightweight UI browsing with search and filters.
 */
export function getPaginatedTrades(params: {
  page?: number;
  limit?: number;
  symbol?: string;
  side?: string;
  reason?: string;
  stateTrades?: ClosedTrade[];
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(5, params.limit || 30));
  const symbol = (params.symbol || '').trim().toUpperCase();
  const side = (params.side || 'ALL').trim().toUpperCase();
  const reason = (params.reason || 'ALL').trim().toUpperCase();

  const allTrades = getAllLedgerTrades(params.stateTrades);

  let filtered = allTrades;
  if (symbol && symbol !== 'ALL') {
    filtered = filtered.filter((t) => t.symbol.toUpperCase().includes(symbol));
  }
  if (side && side !== 'ALL') {
    filtered = filtered.filter((t) => t.side.toUpperCase() === side);
  }
  if (reason && reason !== 'ALL') {
    filtered = filtered.filter((t) => (t.reason || '').toUpperCase() === reason);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pageTrades = filtered.slice(startIndex, startIndex + limit);

  // Compute aggregate summary metrics on filtered dataset
  const totalNetPnL = filtered.reduce((acc, t) => acc + (t.netPnL || 0), 0);
  const totalGrossPnL = filtered.reduce((acc, t) => acc + (t.grossPnL || 0), 0);
  const totalFees = filtered.reduce((acc, t) => acc + (t.costs || 0), 0);
  const winCount = filtered.filter((t) => (t.netPnL || 0) > 0).length;
  const lossCount = filtered.filter((t) => (t.netPnL || 0) <= 0).length;
  const winRate = total > 0 ? (winCount / total) * 100 : 0;
  const avgDurationSeconds = total > 0 ? filtered.reduce((acc, t) => acc + (t.durationSeconds || 0), 0) / total : 0;

  return {
    trades: pageTrades,
    total,
    page,
    totalPages,
    limit,
    summary: {
      totalNetPnL: +totalNetPnL.toFixed(4),
      totalGrossPnL: +totalGrossPnL.toFixed(4),
      totalFees: +totalFees.toFixed(4),
      winCount,
      lossCount,
      winRate: +winRate.toFixed(2),
      avgDurationSeconds: +avgDurationSeconds.toFixed(1),
    },
  };
}

/**
 * Exports 100% of all historical trades to standard CSV string.
 */
export function exportAllTradesToCSV(stateTrades?: ClosedTrade[]): string {
  const allTrades = getAllLedgerTrades(stateTrades);
  const headers = [
    'TradeID',
    'TimeISO',
    'TimeUnix',
    'Symbol',
    'Side',
    'EntryPrice',
    'ExitPrice',
    'MarginUSDT',
    'Leverage',
    'Amount',
    'GrossPnL_USDT',
    'FeesAndCosts_USDT',
    'NetPnL_USDT',
    'ROE_Percent',
    'DurationSeconds',
    'CloseReason',
    'BotID',
    'SignalID',
  ];

  const rows = allTrades.map((t) => [
    `"${t.id || ''}"`,
    `"${new Date(t.time || Date.now()).toISOString()}"`,
    t.time || 0,
    `"${t.symbol || ''}"`,
    `"${t.side || ''}"`,
    t.entry || 0,
    t.exit || 0,
    (t.margin || 2).toFixed(4),
    t.leverage || 10,
    t.amount || 0,
    (t.grossPnL || 0).toFixed(4),
    (t.costs || 0).toFixed(4),
    (t.netPnL || 0).toFixed(4),
    (t.roe || 0).toFixed(2),
    t.durationSeconds || 0,
    `"${t.reason || ''}"`,
    t.botId || 4,
    `"${t.signalId || ''}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Append-only immutable NO_TRADE learning dataset (JSONL)
 * Preserves rejected market setups for autonomous model calibration and filter learning
 */
export function appendNoTradeToLedger(noTrade: any) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const entry = JSON.stringify({
      ...noTrade,
      recordedAt: Date.now(),
      recordedIso: new Date().toISOString(),
    }) + '\n';
    fs.appendFileSync(NO_TRADE_LEDGER_FILE, entry, 'utf-8');
  } catch (err) {
    console.error('Failed to append NO_TRADE to ledger:', err);
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

