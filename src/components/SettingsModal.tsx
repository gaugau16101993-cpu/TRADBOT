import React, { useState, useEffect, useRef } from 'react';
import { X, Sliders, DollarSign, Percent, Shield, Clock, Volume2, Send, CheckCircle2, AlertCircle, Loader2, Smartphone, Server } from 'lucide-react';
import { EngineSettings } from '../types/engine';

interface SettingsModalProps {
  isOpen: boolean;
  settings: EngineSettings;
  onClose: () => void;
  onSave: (newSettings: EngineSettings) => void;
  onOpenCronModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
  onOpenCronModal,
}) => {
  const [formData, setFormData] = useState<EngineSettings>({ ...settings });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResultMsg, setTestResultMsg] = useState<string>('');

  // String state for input fields so users can completely delete characters, type decimals freely, and use clear buttons
  const [startingBalanceStr, setStartingBalanceStr] = useState<string>(
    settings.startingBalance !== undefined ? String(settings.startingBalance) : '10'
  );
  const [marginPerTradeStr, setMarginPerTradeStr] = useState<string>(
    settings.marginPerTrade !== undefined ? String(settings.marginPerTrade) : '2'
  );
  const [netPnLThresholdStr, setNetPnLThresholdStr] = useState<string>(
    settings.netPnLThreshold !== undefined ? String(settings.netPnLThreshold) : '0.0001'
  );
  const [stopLossPctStr, setStopLossPctStr] = useState<string>(
    settings.stopLossPct !== undefined ? String(Math.abs(settings.stopLossPct)) : '5'
  );
  const [bot5MinSampleSizeStr, setBot5MinSampleSizeStr] = useState<string>(
    settings.bot5MinSampleSize !== undefined ? String(settings.bot5MinSampleSize) : '5'
  );

  const prevIsOpenRef = useRef<boolean>(false);

  useEffect(() => {
    // Only synchronize when modal transitions from closed to open.
    // Crucial: Do NOT depend on settings object, otherwise background 800ms polling in App.tsx
    // will continuously wipe out the user's edits while they are typing!
    if (isOpen && !prevIsOpenRef.current) {
      setFormData({ ...settings });
      setStartingBalanceStr(settings.startingBalance !== undefined ? String(settings.startingBalance) : '10');
      setMarginPerTradeStr(settings.marginPerTrade !== undefined ? String(settings.marginPerTrade) : '2');
      setNetPnLThresholdStr(settings.netPnLThreshold !== undefined ? String(settings.netPnLThreshold) : '0.0001');
      setStopLossPctStr(settings.stopLossPct !== undefined ? String(Math.abs(settings.stopLossPct)) : '5');
      setBot5MinSampleSizeStr(settings.bot5MinSampleSize !== undefined ? String(settings.bot5MinSampleSize) : '5');
      setTestStatus('idle');
      setTestResultMsg('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestTelegram = async () => {
    if (!formData.telegramBotToken || !formData.telegramChatId) {
      setTestStatus('error');
      setTestResultMsg('Vui lòng nhập đầy đủ Bot Token và Chat ID trước khi kiểm tra.');
      return;
    }

    setTestStatus('testing');
    setTestResultMsg('Đang gửi tin nhắn kiểm tra tới máy chủ Telegram...');

    try {
      const res = await fetch('/api/engine/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: formData.telegramBotToken,
          chatId: formData.telegramChatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus('success');
        setTestResultMsg('Gửi thành công! Hãy kiểm tra tin nhắn trên ứng dụng Telegram của bạn.');
      } else {
        setTestStatus('error');
        setTestResultMsg(`Thất bại: ${data.error || 'Kiểm tra lại Bot Token hoặc Chat ID'}`);
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestResultMsg(`Lỗi kết nối mạng: ${err.message}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawBal = startingBalanceStr.trim().replace(',', '.');
    const parsedStartingBalance = rawBal !== '' && !isNaN(Number(rawBal)) && Number(rawBal) > 0 ? Number(rawBal) : (settings.startingBalance || 10);

    const rawMargin = marginPerTradeStr.trim().replace(',', '.');
    const parsedMarginPerTrade = rawMargin !== '' && !isNaN(Number(rawMargin)) && Number(rawMargin) > 0 ? Number(rawMargin) : (settings.marginPerTrade || 2);

    const rawThreshold = netPnLThresholdStr.trim().replace(',', '.');
    const parsedNetPnLThreshold = rawThreshold !== '' && !isNaN(Number(rawThreshold)) && Number(rawThreshold) >= 0 ? Number(rawThreshold) : (settings.netPnLThreshold ?? 0.0001);

    const rawSL = stopLossPctStr.trim().replace(',', '.');
    const parsedStopLossPct = -Math.abs(rawSL !== '' && !isNaN(Number(rawSL)) && Number(rawSL) > 0 ? Number(rawSL) : Math.abs(settings.stopLossPct) || 5);

    const rawSample = bot5MinSampleSizeStr.trim().replace(',', '.');
    const parsedMinSampleSize = rawSample !== '' && !isNaN(parseInt(rawSample, 10)) && parseInt(rawSample, 10) > 0 ? parseInt(rawSample, 10) : (settings.bot5MinSampleSize || 5);

    const finalSettings: EngineSettings = {
      ...formData,
      startingBalance: parsedStartingBalance,
      marginPerTrade: parsedMarginPerTrade,
      netPnLThreshold: parsedNetPnLThreshold,
      stopLossPct: parsedStopLossPct,
      bot5MinSampleSize: parsedMinSampleSize,
    };

    onSave(finalSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-[#1f2430] rounded-xl max-w-lg w-full p-5 shadow-2xl font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Cấu hình Bitget 5-Bot Engine
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 my-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Autonomous Mode Toggles */}
          <div className="p-3 bg-gradient-to-r from-emerald-950/50 via-[#0d121c] to-cyan-950/40 rounded-xl border border-emerald-800/60 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-900/40">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Chế Độ Tự Động Giao Dịch (Autonomous 5-Bot Engine)
              </span>
              <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/50 font-mono">
                PAPER 2.0 USDT MARGIN
              </span>
            </div>

            {/* Auto Trading Entry Toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#080a0f] border border-[#1f2430]">
              <div className="space-y-0.5 pr-2">
                <div className="text-white font-semibold flex items-center gap-1.5 text-[11px]">
                  <span>Tự Động Đặt Lệnh (Auto-Trade Entry)</span>
                  {formData.autoTradingEnabled ? (
                    <span className="text-[9px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded font-mono">BẬT</span>
                  ) : (
                    <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded font-mono">TẮT</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Bot 4 tự động mở lệnh ký quỹ 2.0 USDT khi Bot 3 duyệt tín hiệu đạt chuẩn biên lợi nhuận ròng.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, autoTradingEnabled: !formData.autoTradingEnabled })}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  formData.autoTradingEnabled ? 'bg-emerald-600 justify-end' : 'bg-gray-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Auto Close Exit Toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#080a0f] border border-[#1f2430]">
              <div className="space-y-0.5 pr-2">
                <div className="text-white font-semibold flex items-center gap-1.5 text-[11px]">
                  <span>Tự Động Chốt Lệnh (Auto-Close Net TP / SL)</span>
                  {formData.autoCloseEnabled ? (
                    <span className="text-[9px] bg-emerald-900/70 text-emerald-300 px-1.5 py-0.2 rounded font-mono">BẬT</span>
                  ) : (
                    <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded font-mono">TẮT</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Tự động đóng vị thế ngay lập tức khi Net PnL &gt; $0.0001 hoặc chạm giá Take-Profit / Stop-Loss.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, autoCloseEnabled: !formData.autoCloseEnabled })}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  formData.autoCloseEnabled ? 'bg-emerald-600 justify-end' : 'bg-gray-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Unrestricted Opportunity (Bypass Capital Protection) Toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#080a0f] border border-amber-500/40">
              <div className="space-y-0.5 pr-2">
                <div className="text-white font-semibold flex items-center gap-1.5 text-[11px]">
                  <span className="text-amber-300">Tìm Cơ Hội Không Bảo Vệ Vốn (Unrestricted Opportunity)</span>
                  {formData.bypassCapitalProtection !== false ? (
                    <span className="text-[9px] bg-amber-900/80 text-amber-200 px-1.5 py-0.2 rounded font-mono border border-amber-600/60 animate-pulse">
                      ĐANG BẬT
                    </span>
                  ) : (
                    <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded font-mono">
                      BẢO VỆ VỐN BẬT
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Bỏ qua toàn bộ giới hạn bảo vệ vốn (Daily Loss, Max Drawdown cap, Spread chặt); Bot 3 và Bot 4 được phép tự do săn cơ hội và giải ngân vốn liên tục trên Bitget Futures.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    bypassCapitalProtection: formData.bypassCapitalProtection === false ? true : false,
                  })
                }
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  formData.bypassCapitalProtection !== false ? 'bg-amber-600 justify-end' : 'bg-gray-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>
          </div>

          {/* Bot 5 AI Trade Review & Self-Learning Controls */}
          <div className="p-3 bg-gradient-to-r from-purple-950/40 via-[#0d101a] to-cyan-950/40 rounded-xl border border-purple-800/50 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-purple-900/40">
              <span className="text-purple-300 font-bold flex items-center gap-1.5 text-xs">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Bot 5 Quản Trị Tự Học &amp; Kiểm Định OOS (AI Reviewer)
              </span>
              <span className="text-[10px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded border border-purple-700/50 font-mono">
                ANTI-OVERFITTING
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-gray-300 text-[11px] font-semibold">Tự động áp dụng khi OOS đạt</label>
                <select
                  value={formData.bot5AutoApproveOOS ? 'TRUE' : 'FALSE'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bot5AutoApproveOOS: e.target.value === 'TRUE',
                    })
                  }
                  className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-purple-500 rounded px-2.5 py-1.5 text-white outline-none font-mono"
                >
                  <option value="FALSE">Yêu cầu người dùng duyệt thủ công (Khuyên dùng)</option>
                  <option value="TRUE">Tự động áp dụng khi OOS đạt chuẩn an toàn</option>
                </select>
                <p className="text-[9px] text-gray-500">
                  Không tự ý đổi quy tắc rủi ro; chỉ cập nhật tham số kỹ thuật (RSI, ADX, Spread).
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-gray-300 text-[11px] font-semibold">Số lệnh đóng tối thiểu chạy OOS</label>
                  {bot5MinSampleSizeStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBot5MinSampleSizeStr('')}
                      className="text-[9px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                    >
                      Xoá
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bot5MinSampleSizeStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setBot5MinSampleSizeStr(e.target.value)}
                    onBlur={() => {
                      if (!bot5MinSampleSizeStr.trim() || isNaN(parseInt(bot5MinSampleSizeStr, 10))) {
                        setBot5MinSampleSizeStr('5');
                      }
                    }}
                    className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-purple-500 rounded px-2.5 py-1.5 pr-8 text-white font-digital outline-none"
                    placeholder="5"
                  />
                  {bot5MinSampleSizeStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBot5MinSampleSizeStr('')}
                      className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                      title="Xoá toàn bộ ký tự"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-gray-500">
                  Tách mẫu 70% In-Sample / 30% Out-Of-Sample để kiểm định trước khi đề xuất.
                </p>
              </div>
            </div>
          </div>

          {/* Telegram 24/7 Cloud Alerts & Mobile (iPhone) Monitoring */}
          <div className="p-3 bg-gradient-to-r from-sky-950/40 via-[#0d131f] to-cyan-950/40 rounded-xl border border-sky-800/60 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-sky-900/40">
              <span className="text-sky-300 font-bold flex items-center gap-1.5 text-xs">
                <Send className="w-3.5 h-3.5 text-sky-400" />
                Cảnh Báo Telegram 24/7 (iPhone &amp; Cloud Server)
              </span>
              <span className="text-[10px] bg-sky-900/60 text-sky-300 px-2 py-0.5 rounded border border-sky-700/50 font-mono flex items-center gap-1">
                <Server className="w-2.5 h-2.5 text-sky-400 animate-pulse" />
                BACKGROUND DAEMON
              </span>
            </div>

            {/* Enable/Disable Telegram Toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#080a0f] border border-[#1f2430]">
              <div className="space-y-0.5 pr-2">
                <div className="text-white font-semibold flex items-center gap-1.5 text-[11px]">
                  <span>Bật Thông Báo Telegram 24/7</span>
                  {formData.telegramEnabled ? (
                    <span className="text-[9px] bg-sky-900/70 text-sky-300 px-1.5 py-0.2 rounded font-mono">ĐANG BẬT</span>
                  ) : (
                    <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded font-mono">TẮT</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Nhận báo cáo tự động mở/đóng lệnh, PnL ròng, heartbeat định kỳ và cảnh báo lỗi về điện thoại.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, telegramEnabled: !formData.telegramEnabled })}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  formData.telegramEnabled ? 'bg-sky-600 justify-end' : 'bg-gray-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Telegram Configuration Fields */}
            {formData.telegramEnabled && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-gray-300 text-[11px] font-semibold">Telegram Bot Token</label>
                    <div className="flex items-center gap-2">
                      {Boolean(formData.telegramBotToken) && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, telegramBotToken: '' })}
                          className="text-[9px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          Xoá
                        </button>
                      )}
                      <span className="text-[9px] text-sky-400">Từ @BotFather</span>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="password"
                      placeholder="Ví dụ: 123456789:AAHk..."
                      value={formData.telegramBotToken || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, telegramBotToken: e.target.value })}
                      className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-sky-500 rounded px-2.5 py-1.5 pr-8 text-white font-mono outline-none"
                    />
                    {Boolean(formData.telegramBotToken) && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, telegramBotToken: '' })}
                        className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                        title="Xoá toàn bộ ký tự"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-500">
                    Mở Telegram ➡️ Tìm <b>@BotFather</b> ➡️ Gõ <code>/newbot</code> để tạo bot và copy token.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-gray-300 text-[11px] font-semibold">Telegram Chat ID (Người Dùng hoặc Nhóm)</label>
                    <div className="flex items-center gap-2">
                      {Boolean(formData.telegramChatId) && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, telegramChatId: '' })}
                          className="text-[9px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          Xoá
                        </button>
                      )}
                      <span className="text-[9px] text-sky-400">Từ @userinfobot</span>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="Ví dụ: 5616719245 hoặc -100123456789"
                      value={formData.telegramChatId || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
                      className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-sky-500 rounded px-2.5 py-1.5 pr-8 text-white font-mono outline-none"
                    />
                    {Boolean(formData.telegramChatId) && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, telegramChatId: '' })}
                        className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                        title="Xoá toàn bộ ký tự"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-500">
                    Mở Telegram ➡️ Tìm <b>@userinfobot</b> ➡️ Bấm Start để lấy Id của bạn. Sau đó bấm Start với Bot của bạn để mở quyền nhắn tin.
                  </p>
                </div>

                {/* Notification detail toggles */}
                <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                  <label className="flex items-center gap-1.5 p-1.5 bg-[#080a0f] rounded border border-[#1f2430] cursor-pointer text-gray-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.telegramNotifyOnOpen ?? true}
                      onChange={(e) => setFormData({ ...formData, telegramNotifyOnOpen: e.target.checked })}
                      className="rounded accent-sky-500"
                    />
                    <span>Báo khi mở vị thế mới</span>
                  </label>

                  <label className="flex items-center gap-1.5 p-1.5 bg-[#080a0f] rounded border border-[#1f2430] cursor-pointer text-gray-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.telegramNotifyOnClose ?? true}
                      onChange={(e) => setFormData({ ...formData, telegramNotifyOnClose: e.target.checked })}
                      className="rounded accent-sky-500"
                    />
                    <span>Báo khi chốt lời / cắt lỗ</span>
                  </label>

                  <label className="flex items-center gap-1.5 p-1.5 bg-[#080a0f] rounded border border-[#1f2430] cursor-pointer text-gray-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.telegramNotifyOnError ?? true}
                      onChange={(e) => setFormData({ ...formData, telegramNotifyOnError: e.target.checked })}
                      className="rounded accent-sky-500"
                    />
                    <span>Cảnh báo lỗi bất thường</span>
                  </label>

                  <label className="flex items-center gap-1.5 p-1.5 bg-[#080a0f] rounded border border-[#1f2430] cursor-pointer text-gray-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.telegramNotifyHeartbeat ?? true}
                      onChange={(e) => setFormData({ ...formData, telegramNotifyHeartbeat: e.target.checked })}
                      className="rounded accent-sky-500"
                    />
                    <span>Heartbeat nhịp tim định kỳ</span>
                  </label>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-[#080a0f] border border-[#1f2430]">
                  <span className="text-[10px] text-gray-300">Chu kỳ gửi báo cáo Heartbeat:</span>
                  <select
                    value={formData.telegramHeartbeatIntervalMinutes || 60}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        telegramHeartbeatIntervalMinutes: parseInt(e.target.value, 10),
                      })
                    }
                    className="bg-[#11141d] border border-gray-800 rounded px-2 py-0.5 text-sky-400 font-mono text-[10px] outline-none"
                  >
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={60}>1 giờ (Mặc định)</option>
                    <option value={120}>2 giờ</option>
                  </select>
                </div>

                {/* Test Connection Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testStatus === 'testing'}
                    className="w-full py-2 px-3 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-600/70 text-sky-200 font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    {testStatus === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        <span>Đang gửi tin nhắn kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-sky-400" />
                        <span>Gửi Tin Nhắn Thử Nghiệm Tới Telegram</span>
                      </>
                    )}
                  </button>

                  {testResultMsg && (
                    <div
                      className={`mt-2 p-2 rounded text-[10px] flex items-start gap-1.5 ${
                        testStatus === 'success'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                          : testStatus === 'error'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          : 'bg-sky-950/60 text-sky-300 border border-sky-800/60'
                      }`}
                    >
                      {testStatus === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : testStatus === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-spin mt-0.5" />
                      )}
                      <span>{testResultMsg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* iPhone Background Running Explanation */}
            <div className="p-2.5 rounded-lg bg-[#080a0f]/90 border border-sky-900/50 space-y-1">
              <div className="text-[10px] font-bold text-sky-300 flex items-center gap-1.5">
                <Smartphone className="w-3 h-3 text-sky-400" />
                Vận Hành Nền 24/7 Khi Đóng Safari / Khóa Màn Hình iPhone
              </div>
              <p className="text-[9px] text-gray-400 leading-relaxed">
                Toàn bộ động cơ quét Bitget USDT-M, tính toán kỹ thuật 5 Bot, khớp lệnh và chốt lời ròng chạy độc lập trên <b>Cloud Server Node.js Daemon</b>. Khi bạn thoát Safari hoặc khóa màn hình, máy chủ vẫn tự vận hành 24/7 và đẩy báo cáo trực tiếp về Telegram mà không làm hao pin hay tốn dung lượng điện thoại.
              </p>
            </div>
          </div>

          {/* CronJob & Webhook Integration Card */}
          <div className="p-3 bg-gradient-to-r from-cyan-950/40 via-[#0d141e] to-emerald-950/40 rounded-xl border border-cyan-800/60 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40">
              <span className="text-cyan-300 font-bold flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Kết Nối CronJob &amp; Webhook Tự Động 24/7
              </span>
              <span className="text-[10px] bg-cyan-900/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-700/50 font-mono">
                CRON READY
              </span>
            </div>
            <p className="text-[10px] text-gray-300 leading-relaxed">
              Kích hoạt tự động chu kỳ quét hoặc giữ server không bị sleep bằng dịch vụ bên ngoài (như <b>cron-job.org</b>, <b>UptimeRobot</b>, <b>Cloud Scheduler</b>).
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-gray-400 font-mono">
                Endpoint: <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">/api/cron</code> (GET &amp; POST)
              </span>
              {onOpenCronModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCronModal();
                  }}
                  className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <Clock className="w-3 h-3" />
                  <span>Xem Link &amp; Hướng Dẫn</span>
                </button>
              )}
            </div>
          </div>

          {/* Paper Capital */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-gray-300 font-semibold flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Paper Initial Balance (USDT)
              </label>
              {startingBalanceStr.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStartingBalanceStr('')}
                  className="text-[10px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                >
                  Xoá toàn bộ
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="decimal"
                value={startingBalanceStr}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setStartingBalanceStr(e.target.value)}
                placeholder="10"
                className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-emerald-500 rounded px-3 py-2 pr-9 text-white font-digital text-sm outline-none"
              />
              {startingBalanceStr.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStartingBalanceStr('')}
                  className="absolute right-2.5 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                  title="Xoá toàn bộ ký tự"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-500">
              Vốn paper mặc định là 10.00 USDT để thử nghiệm mô hình micro-scalping.
            </p>
          </div>

          {/* Margin & Leverage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-gray-300 font-semibold text-xs">Margin / Trade (USDT)</label>
                {marginPerTradeStr.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMarginPerTradeStr('')}
                    className="text-[10px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                  >
                    Xoá
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  value={marginPerTradeStr}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setMarginPerTradeStr(e.target.value)}
                  placeholder="2"
                  className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-emerald-500 rounded px-3 py-2 pr-8 text-white font-digital outline-none"
                />
                {marginPerTradeStr.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMarginPerTradeStr('')}
                    className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                    title="Xoá toàn bộ ký tự"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-gray-300 font-semibold text-xs">Max Leverage</label>
              <select
                value={formData.maxLeverage}
                onChange={(e) =>
                  setFormData({ ...formData, maxLeverage: parseInt(e.target.value, 10) })
                }
                className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-emerald-500 rounded px-3 py-2 text-white outline-none"
              >
                <option value={5}>5x Leverage</option>
                <option value={10}>10x Leverage</option>
                <option value={20}>20x Leverage</option>
              </select>
            </div>
          </div>

          {/* Max Positions & Cycle Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 font-semibold">Max Open Positions</label>
              <select
                value={formData.maxPositions}
                onChange={(e) =>
                  setFormData({ ...formData, maxPositions: parseInt(e.target.value, 10) })
                }
                className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-emerald-500 rounded px-3 py-2 text-white outline-none"
              >
                <option value={1}>1 Position</option>
                <option value={2}>2 Positions (Standard)</option>
                <option value={3}>3 Positions</option>
                <option value={4}>4 Positions</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-gray-300 font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                Pipeline Cycle Interval
              </label>
              <select
                value={formData.cycleIntervalSeconds}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cycleIntervalSeconds: parseInt(e.target.value, 10),
                  })
                }
                className="w-full bg-[#080a0f] border border-[#1f2430] focus:border-emerald-500 rounded px-3 py-2 text-white outline-none"
              >
                <option value={15}>15 Giây (Fastest)</option>
                <option value={30}>30 Giây</option>
                <option value={60}>60 Giây (Mặc định)</option>
                <option value={120}>120 Giây</option>
              </select>
            </div>
          </div>

          {/* Bot 4 Rules */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-[#1f2430] space-y-2.5">
            <div className="text-amber-400 font-bold flex items-center gap-1.5 text-xs">
              <Shield className="w-3.5 h-3.5" />
              Bot 4 Golden Rule: Net PnL Zero Exit
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-gray-400 text-[10px]">Net PnL Trigger Target ($)</label>
                  {netPnLThresholdStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNetPnLThresholdStr('')}
                      className="text-[9px] text-gray-500 hover:text-rose-400 transition cursor-pointer"
                    >
                      Xoá
                    </button>
                  )}
                </div>
                <div className="relative flex items-center mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={netPnLThresholdStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNetPnLThresholdStr(e.target.value)}
                    placeholder="0.0001"
                    className="w-full bg-[#11141d] border border-gray-800 rounded px-2.5 py-1.5 pr-8 text-emerald-400 font-digital outline-none"
                  />
                  {netPnLThresholdStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNetPnLThresholdStr('')}
                      className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                      title="Xoá toàn bộ ký tự"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-gray-400 text-[10px]">Emergency Stop Loss (% Margin)</label>
                  {stopLossPctStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStopLossPctStr('')}
                      className="text-[9px] text-gray-500 hover:text-rose-400 transition cursor-pointer"
                    >
                      Xoá
                    </button>
                  )}
                </div>
                <div className="relative flex items-center mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={stopLossPctStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setStopLossPctStr(e.target.value)}
                    placeholder="5"
                    className="w-full bg-[#11141d] border border-gray-800 rounded px-2.5 py-1.5 pr-8 text-rose-400 font-digital outline-none"
                  />
                  {stopLossPctStr.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStopLossPctStr('')}
                      className="absolute right-2 p-1 text-gray-400 hover:text-white rounded-full bg-gray-800/80 hover:bg-gray-700 transition cursor-pointer"
                      title="Xoá toàn bộ ký tự"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-gray-500">
              Vị thế sẽ tự động đóng ngay lập tức khi (Gross PnL - Phí mở - Phí đóng - Slippage) &gt; ${netPnLThresholdStr || '0.0001'}.
            </p>
          </div>

          {/* Fee parameters */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-[#1f2430] space-y-2">
            <div className="text-gray-300 font-bold flex items-center gap-1.5 text-xs">
              <Percent className="w-3.5 h-3.5 text-cyan-400" />
              Bitget Futures Real Fee Matrix
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <span className="text-gray-400">Maker Fee</span>
                <div className="text-white font-digital font-semibold mt-0.5">
                  {(formData.makerFee * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <span className="text-gray-400">Taker Fee</span>
                <div className="text-white font-digital font-semibold mt-0.5">
                  {(formData.takerFee * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <span className="text-gray-400">Slippage Buffer</span>
                <div className="text-white font-digital font-semibold mt-0.5">
                  {(formData.slippagePct * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#1f2430]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#1a202c] hover:bg-gray-800 text-gray-300 rounded cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold cursor-pointer shadow"
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
};
