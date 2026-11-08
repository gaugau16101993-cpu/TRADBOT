import React, { useState } from 'react';
import { X, Search, RefreshCw, Activity, ShieldCheck, Wifi, AlertTriangle, Filter, CheckCircle2, TrendingUp, DollarSign } from 'lucide-react';
import { ScannerMetrics, QualifiedCandidate } from '../types/engine';

interface Bot1ScannerMetricsModalProps {
  isOpen: boolean;
  metrics?: ScannerMetrics;
  onClose: () => void;
  onTriggerScan: () => void;
}

export const Bot1ScannerMetricsModal: React.FC<Bot1ScannerMetricsModalProps> = ({
  isOpen,
  metrics,
  onClose,
  onTriggerScan,
}) => {
  const [isScanning, setIsScanning] = useState(false);

  if (!isOpen) return null;

  const m = metrics || {
    scanLatencyMs: 0,
    dataFreshnessMs: 0,
    apiErrors: 0,
    wsStatus: 'DISCONNECTED',
    wsUptimeMs: 0,
    wsMessagesCount: 0,
    coinsScanned: 857,
    coinsPassed: 0,
    coinsRejected: 0,
    rejectionBreakdown: {
      LOW_VOLUME: 0,
      WIDE_SPREAD: 0,
      LOW_VOLATILITY: 0,
      STALE_DATA: 0,
      NON_NORMAL_STATUS: 0,
      INVALID_DEPTH: 0,
    },
    topCandidates: [],
    lastCompletedScanTime: Date.now(),
  };

  const formatUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    await onTriggerScan();
    setTimeout(() => setIsScanning(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-emerald-800/60 rounded-xl max-w-4xl w-full p-5 shadow-2xl font-mono text-xs max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
              <Search className="w-4 h-4" />
            </span>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>BOT 1: BITGET MARKET SCANNER PRO</span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] px-2 py-0.5 rounded font-mono">
                  REAL-DATA ENGINE
                </span>
              </div>
              <div className="text-[10px] text-gray-400">
                Quét toàn bộ Universe 850+ hợp đồng USDT-M Futures chính thức của Bitget
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleManualScan}
              disabled={isScanning}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Quét lại Universe ngay</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 6 Key Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 my-3.5">
          {/* 1. Scan Latency */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" /> Latency
            </div>
            <div className="text-lg font-bold font-digital text-white mt-0.5">
              {m.scanLatencyMs}ms
            </div>
            <div className="text-[9px] text-emerald-400">Toàn bộ universe</div>
          </div>

          {/* 2. Data Freshness */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Freshness
            </div>
            <div className="text-lg font-bold font-digital text-emerald-400 mt-0.5">
              {m.dataFreshnessMs}ms
            </div>
            <div className="text-[9px] text-gray-500">Độ trễ giá sàn</div>
          </div>

          {/* 3. API Errors */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> API Errors
            </div>
            <div className={`text-lg font-bold font-digital mt-0.5 ${m.apiErrors > 0 ? 'text-rose-400' : 'text-gray-200'}`}>
              {m.apiErrors}
            </div>
            <div className="text-[9px] text-gray-500">Tự động backoff</div>
          </div>

          {/* 4. WebSocket Status */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <Wifi className="w-3 h-3 text-emerald-400" /> WS Uptime
            </div>
            <div className="text-xs font-bold text-white mt-1 truncate">
              {formatUptime(m.wsUptimeMs)}
            </div>
            <div className="text-[9px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {m.wsStatus} ({m.wsMessagesCount} msgs)
            </div>
          </div>

          {/* 5. Coins Scanned */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <Search className="w-3 h-3 text-purple-400" /> Scanned
            </div>
            <div className="text-lg font-bold font-digital text-white mt-0.5">
              {m.coinsScanned}
            </div>
            <div className="text-[9px] text-purple-400">USDT-M Contracts</div>
          </div>

          {/* 6. Coins Passed / Rejected */}
          <div className="bg-[#080a0f] p-2.5 rounded-lg border border-[#1f2430]">
            <div className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
              <Filter className="w-3 h-3 text-amber-400" /> Qualified
            </div>
            <div className="text-lg font-bold font-digital text-emerald-400 mt-0.5">
              {m.coinsPassed}
              <span className="text-xs text-gray-500 font-normal"> / {m.coinsScanned}</span>
            </div>
            <div className="text-[9px] text-rose-400">Loại {m.coinsRejected} coin</div>
          </div>
        </div>

        {/* Rejection Breakdown */}
        <div className="p-3 bg-[#080a0f] rounded-lg border border-[#1f2430] mb-3">
          <div className="text-[11px] font-bold text-gray-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-amber-400" />
              Tiêu chí sàng lọc khắt khe của Bot 1 (Rejection Breakdown):
            </span>
            <span className="text-[10px] text-gray-500">Loại bỏ các coin không an toàn cho Scalping</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px]">
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Thanh khoản thấp (&lt;$5M):</span>
              <strong className="text-rose-400 font-digital">{m.rejectionBreakdown.LOW_VOLUME}</strong>
            </div>
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Spread rộng (&gt;0.05%):</span>
              <strong className="text-rose-400 font-digital">{m.rejectionBreakdown.WIDE_SPREAD}</strong>
            </div>
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Biến động thấp (&lt;1.2%):</span>
              <strong className="text-rose-400 font-digital">{m.rejectionBreakdown.LOW_VOLATILITY}</strong>
            </div>
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Dữ liệu cũ (&gt;60s):</span>
              <strong className="text-gray-400 font-digital">{m.rejectionBreakdown.STALE_DATA}</strong>
            </div>
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Sổ lệnh rỗng/lệch:</span>
              <strong className="text-gray-400 font-digital">{m.rejectionBreakdown.INVALID_DEPTH}</strong>
            </div>
            <div className="bg-[#11141d] p-1.5 rounded border border-gray-800">
              <span className="text-gray-500 block">Trạng thái phi chuẩn:</span>
              <strong className="text-gray-400 font-digital">{m.rejectionBreakdown.NON_NORMAL_STATUS}</strong>
            </div>
          </div>
        </div>

        {/* Top Candidates Table */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between pb-1.5 text-xs font-bold text-white">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Top Hợp Đồng Đạt Chuẩn Scalping Tốt Nhất ({m.topCandidates.length} ứng viên hàng đầu)
            </span>
            <span className="text-[10px] text-gray-500">
              Cập nhật lần cuối: {new Date(m.lastCompletedScanTime).toLocaleTimeString()}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[10px] text-gray-500 border-b border-[#1f2430] uppercase sticky top-0 bg-[#11141d]">
                <tr>
                  <th className="py-2">Hạng</th>
                  <th>Hợp đồng</th>
                  <th>Last Price</th>
                  <th>Bid / Ask</th>
                  <th>Spread %</th>
                  <th>Volume 24h</th>
                  <th>Funding Rate</th>
                  <th>24h Chg</th>
                  <th>Scalp Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40 text-[11px]">
                {m.topCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      Đang đồng bộ dữ liệu thị trường từ Bitget...
                    </td>
                  </tr>
                ) : (
                  m.topCandidates.map((c, idx) => {
                    const isUp = c.change24h >= 0;
                    return (
                      <tr key={c.symbol} className="hover:bg-[#161a24] transition">
                        <td className="py-2 font-bold text-gray-500">#{idx + 1}</td>
                        <td className="font-bold text-white flex items-center gap-1">
                          <span>{c.symbol}</span>
                          {idx === 0 && (
                            <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1 rounded border border-emerald-800">
                              TOP 1
                            </span>
                          )}
                        </td>
                        <td className="font-digital text-white">
                          ${c.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </td>
                        <td className="text-gray-400 text-[10px]">
                          ${c.bidPrice.toFixed(2)} / ${c.askPrice.toFixed(2)}
                        </td>
                        <td className="text-emerald-400 font-digital">
                          {c.spreadPercent.toFixed(4)}% ({c.spreadBps} bps)
                        </td>
                        <td className="text-gray-300 font-digital">
                          ${(c.volume24hUsdt / 1_000_000).toFixed(1)}M
                        </td>
                        <td className="text-amber-400 font-digital text-[10px]">
                          {(c.fundingRate * 100).toFixed(4)}%
                        </td>
                        <td className={`font-digital ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isUp ? '+' : ''}{c.change24h.toFixed(2)}%
                        </td>
                        <td>
                          <span className="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800 font-bold font-digital">
                            {c.scalpScore}/100
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#1f2430] text-[10px] text-gray-500">
          <span>Chu kỳ tự động hoàn tất 1 phút/lần • WS Streaming liên tục</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1a202c] hover:bg-gray-800 text-white rounded cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
