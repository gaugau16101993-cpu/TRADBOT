import React, { useState, useEffect } from 'react';
import { Cpu, Settings, RefreshCw, Volume2, VolumeX, ShieldCheck, Zap, Server, Send, Clock } from 'lucide-react';
import { EngineSettings } from '../types/engine';

interface HeaderProps {
  settings: EngineSettings;
  latencyMs: number;
  dataSource: string;
  isEngineRunning: boolean;
  totalTradesExecuted: number;
  onOpenSettings: () => void;
  onOpenCronModal: () => void;
  onOpenQuickTrade: () => void;
  onResetBalance: () => void;
  onToggleSound: () => void;
  onToggleAutoTrade: () => void;
  onToggleBypassCapitalProtection?: () => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
  settings,
  latencyMs,
  dataSource,
  isEngineRunning,
  totalTradesExecuted,
  onOpenSettings,
  onOpenCronModal,
  onOpenQuickTrade,
  onResetBalance,
  onToggleSound,
  onToggleAutoTrade,
  onToggleBypassCapitalProtection,
}) => {
  const [utcTime, setUtcTime] = useState<string>('00:00:00 UTC');
  const [currentUtcHour, setCurrentUtcHour] = useState<number>(new Date().getUTCHours());

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().split(' ')[4] + ' UTC');
      setCurrentUtcHour(now.getUTCHours());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isBypassActive = settings.bypassCapitalProtection !== false;
  const isTimeBlackout = currentUtcHour >= 1 && currentUtcHour < 4;
  const isNightWindow = currentUtcHour >= 22 || currentUtcHour < 6;

  return (
    <header className="w-full max-w-7xl mx-auto flex flex-wrap items-center justify-between border-b border-[#1f2430] pb-3 mb-4 text-xs font-digital">
      <div className="flex items-center flex-wrap gap-2 mb-2 sm:mb-0">
        <div className="flex items-center text-white font-bold tracking-wider text-sm">
          <Zap className="w-4 h-4 text-amber-400 mr-1 animate-pulse" />
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-300 to-amber-300 bg-clip-text text-transparent">
            BITGET FAST AUTO-TRADING ENGINE
          </span>
        </div>

        {/* Fast Scalp Tag */}
        <span
          className="bg-amber-950/80 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm"
          title="Fast Auto-Trading: Quét liên tục 60s, MTF 1m/5m, ưu tiên chốt lời ròng nhanh ngay khi Net PnL > $0.0001 sau mọi chi phí sàn."
        >
          <Zap className="w-2.5 h-2.5 text-amber-400" />
          <span>FAST SCALP (60s • 1m/5m MTF • NET-TP &gt; 0)</span>
        </span>

        {/* 24/7 Background Server Tag */}
        {/* Time-based Filter Status Badge (01:00-04:00 UTC) */}
        {isTimeBlackout ? (
          <span
            className="bg-rose-950/90 text-rose-300 border border-rose-600 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm animate-pulse"
            title="Tạm ngưng mở vị thế mới (No New Entries) từ 01:00 đến 04:00 UTC theo dữ liệu kiểm toán 604 giao dịch. Các lệnh hiện hữu vẫn được SL/TP bảo vệ 100%. Tự động khôi phục lúc 04:00:01 UTC."
          >
            <Clock className="w-2.5 h-2.5 text-rose-400" />
            <span className="font-bold">⛔ 01-04h UTC BLACKOUT (NO ENTRIES)</span>
          </span>
        ) : (
          <span
            className="bg-[#121622] text-gray-400 border border-gray-800 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm"
            title="Bộ lọc thời gian đang sẵn sàng: Tự động khóa mở lệnh mới từ 01:00 đến 04:00 UTC."
          >
            <Clock className="w-2.5 h-2.5 text-emerald-400" />
            <span>TIME FILTER: 01-04h UTC GUARD</span>
          </span>
        )}

        {/* Dynamic Night Volatility Filter Status Badge (22:00-06:00 UTC) */}
        {isNightWindow ? (
          <span
            className="bg-purple-950/90 text-purple-200 border border-purple-600/80 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm"
            title="Khung giờ đêm (22:00-06:00 UTC): Yêu cầu ngưỡng xác nhận biến động ATR cao hơn +40% để loại bỏ fakeout và quét SL trong vùng biên hẹp."
          >
            <span className="text-[11px]">🌙</span>
            <span className="font-bold text-purple-300">ĐÊM (22-06h UTC): ATR +40%</span>
          </span>
        ) : (
          <span
            className="bg-[#121622] text-gray-400 border border-gray-800 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm"
            title="Khung giờ ban ngày: Yêu cầu biến động tiêu chuẩn."
          >
            <span className="text-[11px]">☀️</span>
            <span>NGÀY: ATR CHUẨN</span>
          </span>
        )}

        {/* Capital Protection Bypass Indicator & Toggle */}
        {onToggleBypassCapitalProtection && (
          <button
            type="button"
            onClick={onToggleBypassCapitalProtection}
            title={
              isBypassActive
                ? 'Chế độ TÌM CƠ HỘI TOÀN LỰC (Bảo vệ vốn: ĐÃ TẮT). Bấm để kích hoạt lại bảo vệ vốn chuẩn.'
                : 'Chế độ BẢO VỆ VỐN ĐANG BẬT. Bấm để tắt bảo vệ vốn và tìm kiếm cơ hội tối đa.'
            }
            className={`px-2.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5 transition cursor-pointer border ${
              isBypassActive
                ? 'bg-amber-950/90 hover:bg-amber-900 text-amber-200 border-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse'
                : 'bg-gray-900/90 hover:bg-gray-800 text-gray-300 border-gray-700'
            }`}
          >
            {isBypassActive ? (
              <>
                <Zap className="w-3 h-3 text-amber-400" />
                <span className="font-bold">BẢO VỆ VỐN: ĐÃ TẮT (SĂN LỆNH TOÀN LỰC)</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>BẢO VỆ VỐN: ĐANG BẬT</span>
              </>
            )}
          </button>
        )}

        {/* Autonomous Mode Switch & Indicator */}
        <button
          type="button"
          onClick={onToggleAutoTrade}
          title={
            settings.autoTradingEnabled
              ? `Tự động đặt lệnh & chốt lời: ĐANG BẬT (Ký quỹ ${settings.marginPerTrade} USDT/lệnh). Nhấn để TẮT.`
              : 'Tự động đặt lệnh: ĐANG TẮT. Nhấn để BẬT.'
          }
          className={`px-2.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5 transition cursor-pointer border ${
            settings.autoTradingEnabled
              ? 'bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border-emerald-500/70 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
              : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 border-gray-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              settings.autoTradingEnabled ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'
            }`}
          ></span>
          <span className="font-bold">
            {settings.autoTradingEnabled ? 'TỰ ĐỘNG ĐẶT & CHỐT LỆNH: BẬT' : 'TỰ ĐỘNG: TẮT'}
          </span>
        </button>

        <span className="bg-purple-950/80 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm">
          <ShieldCheck className="w-3 h-3 text-purple-400" />
          PAPER ({settings.startingBalance.toFixed(2)} USDT)
        </span>

        {/* Telegram 24/7 Status Badge */}
        {settings.telegramEnabled && settings.telegramChatId ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="bg-sky-950/90 hover:bg-sky-900 text-sky-300 border border-sky-600/70 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm cursor-pointer transition"
            title="Telegram 24/7 Alerts đang BẬT. Bấm để điều chỉnh hoặc kiểm tra tin nhắn."
          >
            <Send className="w-3 h-3 text-sky-400 animate-pulse" />
            <span className="font-semibold">TELEGRAM 24/7 ON</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenSettings}
            className="bg-gray-900/90 hover:bg-sky-950/60 text-gray-400 hover:text-sky-300 border border-gray-700/80 hover:border-sky-700/80 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm cursor-pointer transition"
            title="Bấm để cấu hình nhận thông báo tự động mở/đóng lệnh về điện thoại (iPhone/Android) qua Telegram."
          >
            <Send className="w-3 h-3 text-gray-500" />
            <span>CẤU HÌNH TELEGRAM</span>
          </button>
        )}

        {/* CronJob Webhook Link Button */}
        <button
          type="button"
          onClick={onOpenCronModal}
          className="bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/70 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm cursor-pointer transition"
          title="Nhấn để lấy Link kết nối CronJob (cron-job.org / Cloud Scheduler / UptimeRobot) tự động kích hoạt 24/7."
        >
          <Clock className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span className="font-semibold">LINK CRONJOB 24/7</span>
        </button>

        <span className="hidden md:inline text-gray-600">|</span>

        <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          {dataSource === 'REST_PROXY'
            ? 'BITGET LIVE REST PROXY'
            : dataSource === 'REST_DIRECT'
            ? 'BITGET DIRECT REST FEED'
            : 'BITGET 24/7 STREAM'}
        </span>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        {/* WS / Connection status */}
        <div id="ws-status" className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[11px] bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>LIVE SYNC</span>
        </div>

        <span className="text-gray-600">|</span>

        <span className="text-gray-400 font-mono text-[11px]" id="latency-val">
          p50: <span className="text-emerald-400 font-bold">{latencyMs}ms</span>
        </span>

        <span className="text-gray-600">|</span>

        <span className="text-gray-300 font-digital tracking-wide bg-[#11141d] px-2 py-0.5 rounded border border-[#1f2430]" id="utc-clock">
          {utcTime}
        </span>

        {/* Action icons */}
        <div className="flex items-center space-x-1 ml-2 border-l border-gray-800 pl-2">
          <button
            onClick={onOpenQuickTrade}
            title="Kích hoạt lệnh Test (Manual Scalp Signal)"
            className="p-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/50 transition cursor-pointer flex items-center gap-1 text-[11px] font-mono px-2"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quick Test</span>
          </button>

          <button
            onClick={onToggleSound}
            title={settings.soundEnabled ? 'Tắt âm báo' : 'Bật âm báo'}
            className="p-1.5 rounded bg-[#11141d] hover:bg-[#1a202c] text-gray-400 hover:text-white border border-[#1f2430] transition cursor-pointer"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>

          <button
            onClick={onResetBalance}
            title="Reset lại Paper Balance về số dư ban đầu trên máy chủ"
            className="p-1.5 rounded bg-[#11141d] hover:bg-[#1a202c] text-gray-400 hover:text-amber-400 border border-[#1f2430] transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenCronModal}
            title="Lấy Link kết nối CronJob / Webhook 24/7"
            className="p-1.5 rounded bg-[#11141d] hover:bg-cyan-950/60 text-gray-400 hover:text-cyan-300 border border-[#1f2430] hover:border-cyan-800/80 transition cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          <button
            onClick={onOpenSettings}
            title="Cấu hình hệ thống 5-Bot"
            className="p-1.5 rounded bg-[#11141d] hover:bg-[#1a202c] text-gray-400 hover:text-white border border-[#1f2430] transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
});
