import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { MarketTickerBar } from './components/MarketTickerBar';
import { PositionsTable } from './components/PositionsTable';
import { ConsoleLogs } from './components/ConsoleLogs';
import { HistoryTable } from './components/HistoryTable';
import { SettingsModal } from './components/SettingsModal';
import { QuickTradeModal } from './components/QuickTradeModal';
import { BotDetailModal } from './components/BotDetailModal';
import { Bot1ScannerMetricsModal } from './components/Bot1ScannerMetricsModal';
import { Bot2AnalystModal } from './components/Bot2AnalystModal';
import { Bot3SignalModal } from './components/Bot3SignalModal';
import { Bot4ExecutionModal } from './components/Bot4ExecutionModal';
import { Bot5LossModal } from './components/Bot5LossModal';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { PipelineInspectorModal } from './components/PipelineInspectorModal';
import { CronJobModal } from './components/CronJobModal';
import { EvolutionLab } from './components/EvolutionLab';
import {
  Position,
  ClosedTrade,
  EngineSettings,
  LogMessage,
  BotState,
  TradeSide,
  TickerData,
} from './types/engine';
import { CompletePipelineSnapshot } from './types/pipeline';
import { CheckCircle2, Server, X, Layers, Activity, History, Sliders, Cpu, Zap } from 'lucide-react';

const DEFAULT_SETTINGS: EngineSettings = {
  startingBalance: 100.0,
  marginPerTrade: 20.0,
  maxLeverage: 10,
  maxPositions: 10,
  makerFee: 0.0002,
  takerFee: 0.0006,
  slippagePct: 0.0005,
  netPnLThreshold: 0.0001,
  stopLossPct: -5,
  cycleIntervalSeconds: 60,
  soundEnabled: true,
  autoTradingEnabled: true,
  autoCloseEnabled: true,
  bot5AutoApproveOOS: true,
  bot5MinSampleSize: 5,
};

function playChime(isWin: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isWin) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Ignore audio context block
  }
}

export default function App() {
  // App State synchronized with backend 24/7 server engine
  const [settings, setSettings] = useState<EngineSettings>(DEFAULT_SETTINGS);
  const [walletBalance, setWalletBalance] = useState<number>(100.0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradeHistory, setTradeHistory] = useState<ClosedTrade[]>([]);
  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(true);
  const [cycleCountdown, setCycleCountdown] = useState<number>(60);
  const [scannedCoinsCount, setScannedCoinsCount] = useState<number>(8);
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [dataSource, setDataSource] = useState<string>('REST_PROXY');
  const [tickers, setTickers] = useState<Record<string, TickerData>>({});
  const [totalTradesExecuted, setTotalTradesExecuted] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'scalper' | 'evolution' | 'history'>('pipeline');

  // Offline welcome toast
  const [offlineToast, setOfflineToast] = useState<{ show: boolean; tradesCount: number; netPnL: number } | null>(null);
  const lastHistoryCountRef = useRef<number | null>(null);

  // Bot state
  const [botState, setBotState] = useState<BotState>({
    bot1: { status: 'Scanner 24/7', scannedCount: 8, lastScanTime: Date.now(), topCandidate: 'BTCUSDT' },
    bot2: { status: 'MTF Analyst', analyzedCoin: 'ETHUSDT', mtfScore: 84, bias: 'BULLISH' },
    bot3: { status: 'Signal Engine', signalActive: false, lastSignal: 'IDLE', confidence: 80 },
    bot4: { status: 'Net PnL Zero', rule: 'Auto-Close on Net PnL > 0', executedToday: 0, winRate: 100 },
    bot5: { status: 'Audit Learn', totalEvaluated: 0, netProfit: 0, feeDrag: 0 },
  });

  const [logs, setLogs] = useState<LogMessage[]>([]);

  // Modals & Inspectors
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isQuickTradeOpen, setIsQuickTradeOpen] = useState<boolean>(false);
  const [isBotDetailsOpen, setIsBotDetailsOpen] = useState<boolean>(false);
  const [isBot1MetricsOpen, setIsBot1MetricsOpen] = useState<boolean>(false);
  const [isBot2AnalystOpen, setIsBot2AnalystOpen] = useState<boolean>(false);
  const [isBot3SignalsOpen, setIsBot3SignalsOpen] = useState<boolean>(false);
  const [isBot4ExecutionOpen, setIsBot4ExecutionOpen] = useState<boolean>(false);
  const [isBot5LossOpen, setIsBot5LossOpen] = useState<boolean>(false);
  const [isPipelineInspectorOpen, setIsPipelineInspectorOpen] = useState<boolean>(false);
  const [inspectorInitialTab, setInspectorInitialTab] = useState<number>(0);
  const [pipelineSnapshot, setPipelineSnapshot] = useState<CompletePipelineSnapshot | undefined>(undefined);
  const [quickTradeSymbol, setQuickTradeSymbol] = useState<string>('BTCUSDT');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const [isCronJobOpen, setIsCronJobOpen] = useState<boolean>(false);

  // Poll 24/7 Server Engine State every 800ms
  useEffect(() => {
    let isMounted = true;

    const fetchServerState = async () => {
      try {
        const res = await fetch('/api/engine/state');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        setWalletBalance((prev) => (prev !== data.walletBalance ? data.walletBalance : prev));
        setPositions((prev) => {
          const inc = data.positions || [];
          if (prev.length === inc.length) {
            const hasChanged = inc.some((p: Position, i: number) => {
              const o = prev[i];
              return !o || o.id !== p.id || o.currentPrice !== p.currentPrice || o.netPnL !== p.netPnL || o.status !== p.status;
            });
            if (!hasChanged) return prev;
          }
          return inc;
        });
        setIsEngineRunning((prev) => (prev !== data.isEngineRunning ? data.isEngineRunning : prev));
        setCycleCountdown((prev) => (prev !== data.cycleCountdown ? data.cycleCountdown : prev));
        setSettings((prev) => {
          const incoming = data.settings || DEFAULT_SETTINGS;
          if (JSON.stringify(prev) === JSON.stringify(incoming)) {
            return prev;
          }
          return incoming;
        });
        setBotState((prev) => {
          const inc = data.botState;
          if (!inc) return prev;
          if (JSON.stringify(prev) === JSON.stringify(inc)) {
            return prev;
          }
          return inc;
        });
        setTickers((prev) => {
          const inc = data.tickers || {};
          const prevKeys = Object.keys(prev);
          const incKeys = Object.keys(inc);
          if (prevKeys.length === incKeys.length) {
            let changed = false;
            for (const k of incKeys) {
              if (!prev[k] || prev[k].lastPr !== inc[k].lastPr) {
                changed = true;
                break;
              }
            }
            if (!changed) return prev;
          }
          return inc;
        });
        setLogs((prev) => {
          const inc = data.logs || [];
          if (prev.length === inc.length && prev[prev.length - 1]?.id === inc[inc.length - 1]?.id) {
            return prev;
          }
          return inc;
        });
        setLatencyMs((prev) => (prev !== data.latencyMs ? data.latencyMs : prev));
        setScannedCoinsCount((prev) => {
          const c = Object.keys(data.tickers || {}).length || 8;
          return prev !== c ? c : prev;
        });
        setTotalTradesExecuted((prev) => {
          const total = data.serverStats?.totalTradesExecuted || (data.tradeHistory || []).length;
          return prev !== total ? total : prev;
        });
        if (data.pipelineSnapshot) {
          setPipelineSnapshot((prev) => {
            if (prev && prev.cycleNumber === data.pipelineSnapshot.cycleNumber && prev.lastHandoffTime === data.pipelineSnapshot.lastHandoffTime) {
              return prev;
            }
            return data.pipelineSnapshot;
          });
        }

        const currentHistory: ClosedTrade[] = data.tradeHistory || [];
        // Check if new trades were completed while away
        if (lastHistoryCountRef.current !== null && currentHistory.length > lastHistoryCountRef.current) {
          const diff = currentHistory.length - lastHistoryCountRef.current;
          const newTrades = currentHistory.slice(0, diff);
          const gainedPnL = newTrades.reduce((acc, t) => acc + t.netPnL, 0);

          if (settings.soundEnabled && gainedPnL > 0) {
            playChime(true);
          }

          // Show friendly offline sync banner if more than 0 trades happened
          setOfflineToast({
            show: true,
            tradesCount: diff,
            netPnL: gainedPnL,
          });
        }
        lastHistoryCountRef.current = currentHistory.length;
        setTradeHistory(currentHistory);
      } catch (err) {
        // Backend momentarily busy or restarting
      }
    };

    fetchServerState();
    const interval = setInterval(fetchServerState, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [settings.soundEnabled]);

  // Actions wired to 24/7 backend
  const handleToggleEngine = async () => {
    try {
      const res = await fetch('/api/engine/toggle', { method: 'POST' });
      const data = await res.json();
      setIsEngineRunning(data.isRunning);
    } catch (e) {
      console.error('Failed to toggle engine:', e);
    }
  };

  const handleTriggerCycleNow = async () => {
    try {
      await fetch('/api/engine/cycle', { method: 'POST' });
    } catch (e) {
      console.error('Failed to trigger cycle:', e);
    }
  };

  const handleExecuteQuickTrade = async (symbol: string, side: TradeSide) => {
    try {
      await fetch('/api/engine/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side }),
      });
    } catch (e) {
      console.error('Failed to execute trade:', e);
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      await fetch('/api/engine/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error('Failed to close position:', e);
    }
  };

  const handleSaveSettings = async (newSettings: EngineSettings) => {
    try {
      await fetch('/api/engine/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings }),
      });
      setSettings(newSettings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const handleResetBalance = async () => {
    try {
      await fetch('/api/engine/reset-balance', { method: 'POST' });
      setIsResetConfirmOpen(false);
    } catch (e) {
      console.error('Failed to reset balance:', e);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/engine/clear-logs', { method: 'POST' });
      setLogs([]);
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  };

  const handleToggleAutoTrade = async () => {
    try {
      const res = await fetch('/api/engine/toggle-autotrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTradingEnabled: !settings.autoTradingEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          autoTradingEnabled: data.autoTradingEnabled,
          autoCloseEnabled: data.autoCloseEnabled !== undefined ? data.autoCloseEnabled : prev.autoCloseEnabled,
        }));
      }
    } catch (e) {
      console.error('Failed to toggle auto trade:', e);
    }
  };

  const handleToggleBypassCapitalProtection = async () => {
    try {
      const current = settings.bypassCapitalProtection !== false;
      const res = await fetch('/api/engine/capital-protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypassCapitalProtection: !current }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          bypassCapitalProtection: data.bypassCapitalProtection,
        }));
      }
    } catch (e) {
      console.error('Failed to toggle capital protection:', e);
    }
  };

  const handleExportCSV = () => {
    window.location.href = '/api/engine/export-csv';
  };

  const handleTriggerBot1Scan = async () => {
    try {
      await fetch('/api/engine/bot1/scan', { method: 'POST' });
    } catch (e) {
      console.error('Failed to trigger Bot 1 scan:', e);
    }
  };

  const handleTriggerBot2Analyze = async (symbol?: string) => {
    try {
      const target = symbol || botState.bot2.analyzedCoin || 'BTCUSDT';
      const res = await fetch('/api/engine/bot2/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: target }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          setBotState((prev) => ({
            ...prev,
            bot2: {
              ...prev.bot2,
              analysis: data.analysis,
              analyzedCoin: data.analysis.symbol,
              bias: data.analysis.bias,
              mtfScore: data.analysis.confidenceScore,
            },
          }));
        }
      }
    } catch (e) {
      console.error('Failed to trigger Bot 2 analysis:', e);
    }
  };

  const handleSimulateLoss = async (category: string) => {
    try {
      await fetch('/api/engine/bot5/simulate-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      const res = await fetch('/api/engine/state');
      if (res.ok) {
        const data = await res.json();
        setBotState(data.botState);
        if (data.pipelineSnapshot) setPipelineSnapshot(data.pipelineSnapshot);
      }
    } catch (e) {
      console.error('Failed to simulate loss:', e);
    }
  };

  const handleResetBot5Params = async () => {
    try {
      await fetch('/api/engine/bot5/reset-params', { method: 'POST' });
      const res = await fetch('/api/engine/state');
      if (res.ok) {
        const data = await res.json();
        setBotState(data.botState);
        if (data.pipelineSnapshot) setPipelineSnapshot(data.pipelineSnapshot);
      }
    } catch (e) {
      console.error('Failed to reset params:', e);
    }
  };

  // Calculations (Memoized to prevent unnecessary recalculation)
  const unrealizedPnL = useMemo(() => positions.reduce((acc, p) => acc + (p.netPnL || 0), 0), [positions]);
  const totalMarginLocked = useMemo(() => positions.reduce((acc, p) => acc + (p.margin || 0), 0), [positions]);
  const equity = useMemo(() => (walletBalance || 0) + totalMarginLocked + unrealizedPnL, [walletBalance, totalMarginLocked, unrealizedPnL]);
  const closedPnL = useMemo(() => tradeHistory.reduce((acc, h) => acc + (h.netPnL || 0), 0), [tradeHistory]);

  return (
    <div className="min-h-screen bg-[#080a0f] text-gray-300 font-sans p-2 sm:p-4 select-none flex flex-col justify-between">
      <div>
        {/* Offline sync notification toast */}
        {offlineToast && offlineToast.show && (
          <div className="max-w-7xl mx-auto mb-3 bg-emerald-950/90 border border-emerald-500/60 rounded-xl p-3 shadow-xl flex items-center justify-between text-xs font-mono text-emerald-200 animate-fadeIn">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-900/80 text-emerald-400">
                <Server className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <span className="font-bold text-white">Đồng bộ máy chủ 24/7: </span>
                <span>
                  Bot vừa tự động chốt lời{' '}
                  <strong className="text-white">{offlineToast.tradesCount} lệnh</strong> khi chạy ngầm trên máy chủ. Lợi nhuận:{' '}
                  <strong className="text-emerald-300 font-digital font-bold text-sm">
                    {offlineToast.netPnL >= 0 ? '+' : ''}${offlineToast.netPnL.toFixed(4)} USDT
                  </strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => setOfflineToast(null)}
              className="p-1 rounded text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TOP HEADER */}
        <Header
          settings={settings}
          latencyMs={latencyMs}
          dataSource={dataSource}
          isEngineRunning={isEngineRunning}
          totalTradesExecuted={totalTradesExecuted}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenCronModal={() => setIsCronJobOpen(true)}
          onOpenQuickTrade={() => {
            setQuickTradeSymbol('BTCUSDT');
            setIsQuickTradeOpen(true);
          }}
          onResetBalance={() => setIsResetConfirmOpen(true)}
          onToggleSound={() =>
            setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
          }
          onToggleAutoTrade={handleToggleAutoTrade}
          onToggleBypassCapitalProtection={handleToggleBypassCapitalProtection}
        />

        {/* UNRESTRICTED OPPORTUNITY BANNER */}
        {settings.bypassCapitalProtection !== false && (
          <div className="w-full max-w-7xl mx-auto mb-3 bg-gradient-to-r from-amber-950/80 via-amber-900/50 to-[#10141f] border border-amber-500/50 p-2.5 rounded-lg flex items-center justify-between shadow-lg text-xs font-mono">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
              <div>
                <span className="font-bold text-amber-300">
                  ⚡ CHẾ ĐỘ TÌM CƠ HỘI TOÀN LỰC (BẢO VỆ VỐN: ĐÃ TẮT):
                </span>{' '}
                <span className="text-amber-100/90 text-[11px]">
                  Hệ thống được phép tự do săn cơ hội vào lệnh trên Bitget Futures. Toàn bộ rào cản kiểm soát vốn (Daily Loss, Max Drawdown cap, Spread &lt; 3bps) đã được gỡ bỏ; Bot 3 duyệt nhanh tín hiệu với RR &gt;= 1.15 và Bot 4 giải ngân vốn khả dụng linh hoạt.
                </span>
              </div>
            </div>
            <button
              onClick={handleToggleBypassCapitalProtection}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[11px] font-bold cursor-pointer transition flex-shrink-0 ml-2"
            >
              BẬT LẠI BẢO VỆ VỐN
            </button>
          </div>
        )}

        {/* MAIN ENGINE WRAPPER */}
        <main className="w-full max-w-7xl mx-auto space-y-4">
          {/* NAVIGATION TABS: 5-BOT PIPELINE, SCALPER, EVOLUTION & HISTORY */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2430] pb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab('pipeline')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                  activeTab === 'pipeline'
                    ? 'bg-gradient-to-r from-cyan-700 to-blue-800 text-white shadow-md border border-cyan-400/50'
                    : 'bg-[#10141f] text-gray-400 hover:text-gray-200 hover:bg-[#161c2a] border border-[#1f2430]'
                }`}
              >
                <Layers className="w-4 h-4 text-cyan-300" />
                <span>PIPELINE 5-BOT (24/7)</span>
              </button>

              <button
                onClick={() => setActiveTab('scalper')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                  activeTab === 'scalper'
                    ? 'bg-gradient-to-r from-purple-700 to-indigo-800 text-white shadow-md border border-purple-400/50'
                    : 'bg-[#10141f] text-gray-400 hover:text-gray-200 hover:bg-[#161c2a] border border-[#1f2430]'
                }`}
              >
                <Activity className="w-4 h-4 text-purple-300" />
                <span>VỊ THẾ & LỆNH SCALPER</span>
                {positions.length > 0 && (
                  <span className="bg-purple-950 text-purple-300 border border-purple-500/50 text-[10px] px-1.5 py-0.5 rounded">
                    {positions.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('evolution')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                  activeTab === 'evolution'
                    ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-md border border-blue-400/50'
                    : 'bg-[#10141f] text-gray-400 hover:text-gray-200 hover:bg-[#161c2a] border border-[#1f2430]'
                }`}
              >
                <Cpu className="w-4 h-4 text-blue-300 animate-pulse" />
                <span>KIỂM ĐỊNH &amp; TIẾN HÓA</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-amber-700 to-orange-800 text-white shadow-md border border-amber-400/50'
                    : 'bg-[#10141f] text-gray-400 hover:text-gray-200 hover:bg-[#161c2a] border border-[#1f2430]'
                }`}
              >
                <History className="w-4 h-4 text-amber-300" />
                <span>LỊCH SỬ KHÉP VỊ THẾ</span>
                {tradeHistory.length > 0 && (
                  <span className="bg-amber-950 text-amber-300 border border-amber-500/50 text-[10px] px-1.5 py-0.5 rounded">
                    {tradeHistory.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Balance Status in Tab Bar */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-gray-400">Vốn khả dụng:</span>
              <span className="text-emerald-400 font-digital font-bold text-sm">
                ${walletBalance.toFixed(2)} USDT
              </span>
            </div>
          </div>

          {/* TAB 2: PIPELINE 5-BOT MULTI-AGENT */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <MetricsCards
                walletBalance={walletBalance}
                equity={equity}
                unrealizedPnL={unrealizedPnL}
                closedPnL={closedPnL}
                isEngineRunning={isEngineRunning}
                cycleCountdown={cycleCountdown}
                scannedCoinsCount={scannedCoinsCount}
                botState={botState}
                settings={settings}
                totalTradesExecuted={totalTradesExecuted}
                onToggleEngine={handleToggleEngine}
                onTriggerCycleNow={handleTriggerCycleNow}
                onOpenBotDetails={() => setIsBotDetailsOpen(true)}
                onOpenBot1Metrics={() => setIsBot1MetricsOpen(true)}
                onOpenBot2Analyst={() => setIsBot2AnalystOpen(true)}
                onOpenBot3Signals={() => setIsBot3SignalsOpen(true)}
                onOpenBot4Execution={() => setIsBot4ExecutionOpen(true)}
                onOpenBot5Loss={() => setIsBot5LossOpen(true)}
              />

              <PipelineVisualizer
                pipelineSnapshot={pipelineSnapshot}
                botState={botState}
                onOpenStage={(idx) => {
                  setInspectorInitialTab(idx);
                  setIsPipelineInspectorOpen(true);
                }}
                onOpenInspector={() => {
                  setInspectorInitialTab(0);
                  setIsPipelineInspectorOpen(true);
                }}
                onTriggerCycle={handleTriggerCycleNow}
              />

              <MarketTickerBar
                tickers={tickers}
                onSelectQuickTrade={(sym) => {
                  setQuickTradeSymbol(sym);
                  setIsQuickTradeOpen(true);
                }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <PositionsTable
                  positions={positions}
                  settings={settings}
                  onClosePosition={handleClosePosition}
                  onTriggerQuickTrade={() => {
                    setQuickTradeSymbol('BTCUSDT');
                    setIsQuickTradeOpen(true);
                  }}
                />
                <ConsoleLogs logs={logs} onClearLogs={handleClearLogs} />
              </div>
            </div>
          )}

          {/* TAB 3: SCALPER EXECUTION & POSITIONS */}
          {activeTab === 'scalper' && (
            <div className="space-y-4">
              <MetricsCards
                walletBalance={walletBalance}
                equity={equity}
                unrealizedPnL={unrealizedPnL}
                closedPnL={closedPnL}
                isEngineRunning={isEngineRunning}
                cycleCountdown={cycleCountdown}
                scannedCoinsCount={scannedCoinsCount}
                botState={botState}
                settings={settings}
                totalTradesExecuted={totalTradesExecuted}
                onToggleEngine={handleToggleEngine}
                onTriggerCycleNow={handleTriggerCycleNow}
                onOpenBotDetails={() => setIsBotDetailsOpen(true)}
                onOpenBot1Metrics={() => setIsBot1MetricsOpen(true)}
                onOpenBot2Analyst={() => setIsBot2AnalystOpen(true)}
                onOpenBot3Signals={() => setIsBot3SignalsOpen(true)}
                onOpenBot4Execution={() => setIsBot4ExecutionOpen(true)}
                onOpenBot5Loss={() => setIsBot5LossOpen(true)}
              />

              <MarketTickerBar
                tickers={tickers}
                onSelectQuickTrade={(sym) => {
                  setQuickTradeSymbol(sym);
                  setIsQuickTradeOpen(true);
                }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <PositionsTable
                    positions={positions}
                    settings={settings}
                    onClosePosition={handleClosePosition}
                    onTriggerQuickTrade={() => {
                      setQuickTradeSymbol('BTCUSDT');
                      setIsQuickTradeOpen(true);
                    }}
                  />
                </div>
                <div>
                  <ConsoleLogs logs={logs} onClearLogs={handleClearLogs} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EVOLUTION & INDEPENDENT VALIDATOR LAB */}
          {activeTab === 'evolution' && (
            <div className="space-y-4">
              <EvolutionLab />
            </div>
          )}

          {/* TAB 5: COMPLETE HISTORY & AUDIT */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <HistoryTable
                history={tradeHistory}
                totalTradesExecuted={totalTradesExecuted}
                onExportCSV={handleExportCSV}
              />
              <ConsoleLogs logs={logs} onClearLogs={handleClearLogs} />
            </div>
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-7xl mx-auto mt-6 pt-3 border-t border-[#1f2430]/60 flex flex-wrap justify-between text-[11px] font-mono text-gray-500">
        <div className="flex items-center space-x-2">
          <span className="flex items-center gap-1 text-emerald-400">
            <Server className="w-3.5 h-3.5" />
            24/7 Node.js Background Service
          </span>
          <span>•</span>
          <span>Chạy liên tục không gián đoạn khi đóng trình duyệt</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Lưu trữ file: data/engine_state.json</span>
          <span>•</span>
          <span className="text-gray-400">Bitget Multi-Layer Scalper Engine</span>
        </div>
      </footer>

      {/* MODALS */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onOpenCronModal={() => setIsCronJobOpen(true)}
      />

      <CronJobModal
        isOpen={isCronJobOpen}
        onClose={() => setIsCronJobOpen(false)}
      />

      <QuickTradeModal
        isOpen={isQuickTradeOpen}
        selectedSymbol={quickTradeSymbol}
        tickers={tickers}
        settings={settings}
        onClose={() => setIsQuickTradeOpen(false)}
        onExecute={handleExecuteQuickTrade}
      />

      <BotDetailModal isOpen={isBotDetailsOpen} onClose={() => setIsBotDetailsOpen(false)} />

      <Bot1ScannerMetricsModal
        isOpen={isBot1MetricsOpen}
        metrics={botState.bot1.metrics}
        onClose={() => setIsBot1MetricsOpen(false)}
        onTriggerScan={handleTriggerBot1Scan}
      />

      <Bot2AnalystModal
        isOpen={isBot2AnalystOpen}
        analysis={botState.bot2.analysis}
        onClose={() => setIsBot2AnalystOpen(false)}
        onTriggerAnalyze={handleTriggerBot2Analyze}
      />

      <Bot3SignalModal
        isOpen={isBot3SignalsOpen}
        onClose={() => setIsBot3SignalsOpen(false)}
        topCandidate={botState.bot1.topCandidate}
      />

      <Bot4ExecutionModal
        isOpen={isBot4ExecutionOpen}
        onClose={() => setIsBot4ExecutionOpen(false)}
      />

      <Bot5LossModal
        isOpen={isBot5LossOpen}
        onClose={() => setIsBot5LossOpen(false)}
      />

      <PipelineInspectorModal
        isOpen={isPipelineInspectorOpen}
        onClose={() => setIsPipelineInspectorOpen(false)}
        snapshot={pipelineSnapshot}
        initialTab={inspectorInitialTab}
        onTriggerCycle={handleTriggerCycleNow}
        onSimulateLoss={handleSimulateLoss}
        onResetParams={handleResetBot5Params}
      />

      {/* Custom Reset Confirm Modal (avoiding window.alert/window.confirm) */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#11141d] border border-[#1f2430] rounded-xl max-w-sm w-full p-5 shadow-2xl font-mono text-xs">
            <div className="text-white font-bold text-sm mb-2">Reset Paper Balance?</div>
            <p className="text-gray-400 mb-4 leading-relaxed">
              Bạn có chắc chắn muốn đặt lại Paper Balance về số dư khởi tạo ($
              {settings.startingBalance.toFixed(2)} USDT) trên máy chủ? Các vị thế mở hiện tại sẽ được giải phóng.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3 py-1.5 bg-[#1a202c] hover:bg-gray-800 text-gray-300 rounded cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleResetBalance}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold cursor-pointer"
              >
                Xác nhận Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
