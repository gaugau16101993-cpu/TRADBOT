import React from 'react';
import { Wallet, Play, Pause, RefreshCw, Eye, Sparkles, Activity, Server, ShieldCheck, Database } from 'lucide-react';
import { BotState, EngineSettings } from '../types/engine';

interface MetricsCardsProps {
  walletBalance: number;
  equity: number;
  unrealizedPnL: number;
  closedPnL: number;
  isEngineRunning: boolean;
  cycleCountdown: number;
  scannedCoinsCount: number;
  botState: BotState;
  settings: EngineSettings;
  totalTradesExecuted: number;
  onToggleEngine: () => void;
  onTriggerCycleNow: () => void;
  onOpenBotDetails: () => void;
  onOpenBot1Metrics: () => void;
  onOpenBot2Analyst: () => void;
  onOpenBot3Signals: () => void;
  onOpenBot4Execution?: () => void;
  onOpenBot5Loss?: () => void;
}

export const MetricsCards: React.FC<MetricsCardsProps> = React.memo(({
  walletBalance,
  equity,
  unrealizedPnL,
  closedPnL,
  isEngineRunning,
  cycleCountdown,
  scannedCoinsCount,
  botState,
  settings,
  totalTradesExecuted,
  onToggleEngine,
  onTriggerCycleNow,
  onOpenBotDetails,
  onOpenBot1Metrics,
  onOpenBot2Analyst,
  onOpenBot3Signals,
  onOpenBot4Execution,
  onOpenBot5Loss,
}) => {
  const isPnLPositive = unrealizedPnL >= 0;
  const isClosedPositive = closedPnL >= 0;
  const countdownPct = ((60 - cycleCountdown) / 60) * 100;

  return (
    <div className="space-y-3">
      {/* 24/7 Server Persistence Status Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-[#11141d] to-cyan-950/70 border border-emerald-800/40 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono shadow-md gap-2">
        <div className="flex items-center space-x-2 text-emerald-400">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute"></span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <span className="font-bold text-white flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            24/7 BACKGROUND ENGINE RUNNING TRÊN SERVER
          </span>
          <span className="hidden sm:inline text-gray-500">|</span>
          <span className="hidden sm:inline text-gray-300 text-[11px]">
            Đóng trình duyệt hoặc tắt máy bot vẫn tự động giao dịch &amp; chốt lời theo chu kỳ
          </span>
        </div>

        <div className="flex items-center flex-wrap gap-2 text-[11px] text-gray-400">
          <span className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded border ${
            settings.autoTradingEnabled
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/70 shadow-sm'
              : 'bg-gray-900 text-gray-400 border-gray-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${settings.autoTradingEnabled ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'}`}></span>
            {settings.autoTradingEnabled ? 'TỰ ĐẶT LỆNH: BẬT' : 'TỰ ĐẶT LỆNH: TẮT'}
          </span>

          <span className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded border ${
            settings.autoCloseEnabled
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-600/70 shadow-sm'
              : 'bg-gray-900 text-gray-400 border-gray-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${settings.autoCloseEnabled ? 'bg-cyan-400' : 'bg-gray-500'}`}></span>
            {settings.autoCloseEnabled ? 'TỰ CHỐT LỜI: BẬT' : 'TỰ CHỐT LỜI: TẮT'}
          </span>

          <span className="hidden md:inline text-gray-600">|</span>
          <span className="hidden sm:inline">
            Ký quỹ: <strong className="text-white font-digital">{settings.marginPerTrade || 2} USDT</strong>
          </span>
          <span className="text-gray-600">|</span>
          <span>
            Tổng lệnh: <strong className="text-white font-digital">{totalTradesExecuted}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* WALLET CARD */}
        <div className="bg-[#11141d] border border-[#1f2430] rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono uppercase text-gray-400">Paper Balance</span>
              <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-900 px-1.5 py-0.2 rounded font-mono">
                PERSISTENT
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          <div className="my-1">
            <div
              id="wallet-balance"
              className="text-3xl font-bold font-digital text-white glow-green tracking-tight"
            >
              ${(walletBalance ?? 0).toFixed(4)}
            </div>
            <div className="flex justify-between text-[11px] font-mono text-gray-400 mt-2 border-t border-[#1f2430]/60 pt-2">
              <span>
                Equity:{' '}
                <strong id="wallet-equity" className="text-gray-200">
                  ${(equity ?? 0).toFixed(4)}
                </strong>
              </span>
              <span>
                Unrealized:{' '}
                <strong
                  id="wallet-pnl"
                  className={isPnLPositive ? 'text-emerald-400' : 'text-rose-400'}
                >
                  {isPnLPositive ? '+' : ''}${(unrealizedPnL ?? 0).toFixed(4)}
                </strong>
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-[#1f2430]/60 flex justify-between text-[10px] font-mono text-gray-500">
            <span>Margin: <strong className="text-gray-300">${((settings?.marginPerTrade ?? 2)).toFixed(2)}</strong></span>
            <span>Leverage: <strong className="text-gray-300">{settings?.maxLeverage ?? 10}x</strong></span>
            <span>Closed: <strong className={isClosedPositive ? 'text-emerald-400' : 'text-rose-400'}>
              {isClosedPositive ? '+' : ''}${(closedPnL ?? 0).toFixed(4)}
            </strong></span>
          </div>
        </div>

        {/* ENGINE STATUS CARD */}
        <div className="bg-[#11141d] border border-[#1f2430] rounded-xl p-4 flex flex-col justify-between shadow-lg relative">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-mono uppercase text-gray-400">Scheduler Engine</span>
            <span
              id="engine-badge"
              className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${
                isEngineRunning
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isEngineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              ></span>
              {isEngineRunning ? 'RUNNING (24/7)' : 'PAUSED'}
            </span>
          </div>

          <div className="flex items-center space-x-3 my-1">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-full border-2 border-emerald-500/30 bg-[#080a0f] font-digital text-emerald-400 font-bold text-lg shadow-inner">
              <span id="cycle-countdown">{isEngineRunning ? cycleCountdown : '--'}</span>
              <svg className="absolute inset-0 w-12 h-12 -rotate-90 pointer-events-none">
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="rgba(34, 197, 94, 0.15)"
                  strokeWidth="2"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="132"
                  strokeDashoffset={132 - (132 * countdownPct) / 100}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
            </div>

            <div className="flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>{settings.cycleIntervalSeconds}s Multi-Bot Cycle</span>
                {isEngineRunning && <Activity className="w-3 h-3 text-cyan-400 animate-spin" />}
              </div>
              <div className="text-[11px] font-mono text-gray-400" id="scanned-coins-count">
                Scanned: <span className="text-white font-semibold">{scannedCoinsCount} Coins</span>
              </div>
              <div className="text-[10px] font-mono text-gray-500">
                Next scan: {isEngineRunning ? `in ${cycleCountdown}s` : 'Paused'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 mt-2">
            <button
              id="toggle-engine-btn"
              onClick={onToggleEngine}
              className={`w-full py-1.5 rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition active:scale-95 cursor-pointer shadow-sm ${
                isEngineRunning
                  ? 'bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-500/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50'
              }`}
            >
              {isEngineRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span id="engine-btn-text">Tạm dừng System</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span id="engine-btn-text">Kích hoạt System</span>
                </>
              )}
            </button>

            <button
              onClick={onTriggerCycleNow}
              title="Kích hoạt quét và phân tích chu kỳ ngay lập tức trên máy chủ"
              className="p-1.5 rounded bg-[#1e2430] hover:bg-[#2c3445] text-gray-300 hover:text-white border border-gray-700 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* BOTS PIPELINE STATUS */}
        <div className="lg:col-span-2 bg-[#11141d] border border-[#1f2430] rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex justify-between items-center mb-2 border-b border-[#1f2430]/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-gray-400">5-Bot Scalping Pipeline</span>
              <span className="bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[9px] px-1.5 py-0.2 rounded font-mono">
                SYNCHRONIZED (SERVER)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                Real-time Bitget Feed
              </span>
              <button
                onClick={onOpenBotDetails}
                className="text-[10px] text-gray-400 hover:text-cyan-300 flex items-center gap-0.5 underline transition cursor-pointer"
              >
                <Eye className="w-3 h-3" /> Chi tiết
              </button>
            </div>
          </div>

          {/* 5 Bot columns */}
          <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[11px]">
            {/* BOT 1 - Market Scanner Pro */}
            <div
              onClick={onOpenBot1Metrics}
              title="Nhấn để xem chi tiết Telemetry & Bảng xếp hạng Bot 1"
              className="bg-[#080a0f]/90 p-2 rounded border border-emerald-800/60 hover:border-emerald-500 hover:bg-[#121824] transition cursor-pointer group"
            >
              <div className="text-gray-400 font-bold text-[10px] mb-0.5 flex items-center justify-center gap-1 group-hover:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                BOT 1 PRO
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Universe Scanner</div>
              <div id="bot1-status" className="text-emerald-400 text-[10px] font-semibold mt-1 truncate">
                {botState.bot1.status}
              </div>
            </div>

            {/* BOT 2 - Advanced Market Analyst Pro */}
            <div
              onClick={onOpenBot2Analyst}
              title="Nhấn để xem chi tiết phân tích đa khung MTF & SMC Bot 2"
              className="bg-[#080a0f]/90 p-2 rounded border border-cyan-800/60 hover:border-cyan-500 hover:bg-[#121824] transition cursor-pointer group"
            >
              <div className="text-gray-400 font-bold text-[10px] mb-0.5 flex items-center justify-center gap-1 group-hover:text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                BOT 2 PRO
              </div>
              <div className="text-[9px] text-gray-500 uppercase">MTF &amp; SMC</div>
              <div id="bot2-status" className="text-cyan-400 text-[10px] font-semibold mt-1 truncate">
                {botState.bot2.status}
              </div>
            </div>

            {/* BOT 3 - Signal Engine Pro */}
            <div
              onClick={onOpenBot3Signals}
              title="Nhấn để xem chi tiết Tín hiệu, Filter Gates & Backtest Bot 3"
              className="bg-[#080a0f]/90 p-2 rounded border border-purple-800/60 hover:border-purple-500 hover:bg-[#121824] transition cursor-pointer group"
            >
              <div className="text-gray-400 font-bold text-[10px] mb-0.5 flex items-center justify-center gap-1 group-hover:text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                BOT 3 PRO
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Signal Engine</div>
              <div id="bot3-status" className="text-purple-400 text-[10px] font-semibold mt-1 truncate">
                {botState.bot3.status}
              </div>
            </div>

            {/* BOT 4 - Execution & Net-Profit Manager Pro */}
            <div
              onClick={onOpenBot4Execution}
              title="Nhấn để xem chi tiết Quản lý Thực thi, Sổ cái kép & Rủi ro Bot 4"
              className="bg-[#080a0f]/90 p-2 rounded border border-amber-800/60 hover:border-amber-500 hover:bg-[#121824] transition cursor-pointer group"
            >
              <div className="text-gray-400 font-bold text-[10px] mb-0.5 flex items-center justify-center gap-1 group-hover:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                BOT 4 PRO
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Execution Mgr</div>
              <div id="bot4-status" className="text-amber-400 text-[10px] font-semibold mt-1 truncate">
                {botState.bot4.status}
              </div>
            </div>

            {/* BOT 5 - Loss Analysis & Adaptive Feedback */}
            <div
              onClick={onOpenBot5Loss}
              title="Nhấn để xem chi tiết Mổ xẻ Thua lỗ & Phản hồi Tham số Bot 5"
              className="bg-[#080a0f]/90 p-2 rounded border border-rose-800/60 hover:border-rose-500 hover:bg-[#181216] transition cursor-pointer group"
            >
              <div className="text-gray-400 font-bold text-[10px] mb-0.5 flex items-center justify-center gap-1 group-hover:text-rose-300">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                BOT 5 PRO
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Post-Mortem &amp; Feedback</div>
              <div id="bot5-status" className="text-rose-400 text-[10px] font-semibold mt-1 truncate">
                {botState.bot5.status}
              </div>
            </div>
          </div>

          <div className="mt-2 text-[10px] font-mono text-gray-400 flex flex-wrap justify-between items-center border-t border-[#1f2430]/60 pt-2 gap-1">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Active Bot 4 Rule:{' '}
              <strong className="text-amber-400 bg-amber-950/60 px-1 py-0.2 rounded border border-amber-900/40">
                Auto-Close on Net PnL &gt; 0 (24/7 Server Enforced)
              </strong>
            </span>
            <span>
              Strategy Ver: <strong id="strat-ver" className="text-gray-200">v2.4-Scalp (Continuous)</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
