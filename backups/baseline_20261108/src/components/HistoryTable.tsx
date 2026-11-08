import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History,
  Download,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
} from 'lucide-react';
import { ClosedTrade } from '../types/engine';

interface HistoryTableProps {
  history?: ClosedTrade[];
  totalTradesExecuted?: number;
  onExportCSV?: () => void;
}

interface PaginatedResponse {
  trades: ClosedTrade[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: {
    totalNetPnL: number;
    totalGrossPnL: number;
    totalFees: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    avgDurationSeconds: number;
  };
}

export const HistoryTable: React.FC<HistoryTableProps> = React.memo(({
  history = [],
  totalTradesExecuted = 0,
  onExportCSV,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterReason, setFilterReason] = useState<string>('ALL');

  const [paginatedData, setPaginatedData] = useState<PaginatedResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch paginated trades from dedicated server endpoint
  const fetchTrades = useCallback(async (page: number, limit: number, symbol: string, side: string, reason: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        symbol: symbol.trim(),
        side,
        reason,
      });
      const res = await fetch(`/api/engine/trades?${params.toString()}`);
      if (res.ok) {
        const data: PaginatedResponse = await res.json();
        setPaginatedData(data);
      }
    } catch (err) {
      console.error('Failed to fetch paginated trades:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger fetch when pagination, filters, or total trade count changes
  useEffect(() => {
    fetchTrades(currentPage, pageSize, searchSymbol, filterSide, filterReason);
  }, [currentPage, pageSize, searchSymbol, filterSide, filterReason, totalTradesExecuted, fetchTrades]);

  // Handle Export CSV
  const handleExport = useCallback(() => {
    if (onExportCSV) {
      onExportCSV();
    } else {
      window.location.href = '/api/engine/export-csv';
    }
  }, [onExportCSV]);

  // Trades to display (paginated server response or fallback to history prop)
  const displayTrades = paginatedData ? paginatedData.trades : history.slice(0, pageSize);
  const totalTrades = paginatedData ? paginatedData.total : (totalTradesExecuted || history.length);
  const totalPages = paginatedData ? paginatedData.totalPages : Math.max(1, Math.ceil(totalTrades / pageSize));

  const summary = paginatedData?.summary || {
    totalNetPnL: history.reduce((acc, h) => acc + (h.netPnL ?? 0), 0),
    totalGrossPnL: history.reduce((acc, h) => acc + (h.grossPnL ?? 0), 0),
    totalFees: history.reduce((acc, h) => acc + (h.costs ?? (h as any).totalCosts ?? 0), 0),
    winCount: history.filter((h) => (h.netPnL ?? 0) > 0).length,
    lossCount: history.filter((h) => (h.netPnL ?? 0) <= 0).length,
    winRate: history.length > 0 ? (history.filter((h) => (h.netPnL ?? 0) > 0).length / history.length) * 100 : 0,
    avgDurationSeconds: history.length > 0 ? history.reduce((acc, h) => acc + (h.durationSeconds ?? 0), 0) / history.length : 0,
  };

  const formatPrice = (pr: number, sym: string) => {
    if (!pr || isNaN(pr)) return '$0.00';
    return sym && (sym.includes('XRP') || sym.includes('DOGE') || pr < 1)
      ? `$${pr.toFixed(4)}`
      : `$${pr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="bg-[#11141d] border border-[#1f2430] rounded-xl p-4 shadow-lg flex flex-col gap-3 font-mono">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#1f2430]/60 text-xs gap-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-bold text-white text-sm">
            <History className="w-4 h-4 text-purple-400" />
            Lịch Sử Giao Dịch &amp; Kiểm Toán Net PnL
          </span>
          <span className="bg-purple-950/70 text-purple-300 border border-purple-800 text-[10px] px-2 py-0.5 rounded font-bold">
            {totalTrades} lệnh đã lưu vĩnh viễn
          </span>
        </div>

        {/* METRICS SUMMARY */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-gray-400">
            Thắng: <strong className="text-emerald-400 font-digital">{summary.winCount}</strong> / Thua: <strong className="text-rose-400 font-digital">{summary.lossCount}</strong>
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">
            Win Rate: <strong className="text-emerald-400 font-digital">{(summary.winRate ?? 0).toFixed(1)}%</strong>
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">
            Tổng Phí: <strong className="text-amber-400 font-digital">-${(summary.totalFees ?? 0).toFixed(4)}</strong>
          </span>
          <span className="text-gray-600">|</span>
          <span
            id="history-total-pnl"
            className={`font-digital font-bold text-xs px-2 py-0.5 rounded border ${
              (summary.totalNetPnL ?? 0) >= 0
                ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'
                : 'text-rose-400 bg-rose-950/40 border-rose-800/60'
            }`}
          >
            Net PnL: {(summary.totalNetPnL ?? 0) >= 0 ? '+' : ''}${(summary.totalNetPnL ?? 0).toFixed(4)}
          </span>

          {/* 1-CLICK CSV EXPORT BUTTON */}
          <button
            onClick={handleExport}
            className="text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/70 hover:bg-emerald-800/80 px-3 py-1.5 rounded-lg border border-emerald-600/70 flex items-center gap-1.5 shadow transition cursor-pointer"
            title="Tải toàn bộ 100% lịch sử giao dịch chi tiết ra file CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Xuất toàn bộ CSV ({totalTrades} lệnh)</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#0b0e14] p-2.5 rounded-lg border border-[#1f2430]/70">
        <div className="flex flex-wrap items-center gap-2">
          {/* Symbol Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => {
                setSearchSymbol(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm Symbol (BTC, SOL...)"
              className="pl-8 pr-3 py-1 bg-[#151a24] text-gray-200 border border-gray-700/70 rounded text-[11px] placeholder-gray-500 focus:outline-none focus:border-purple-500 w-44"
            />
          </div>

          {/* Side Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">Side:</span>
            <select
              value={filterSide}
              onChange={(e) => {
                setFilterSide(e.target.value as any);
                setCurrentPage(1);
              }}
              className="bg-[#151a24] text-gray-300 border border-gray-700/70 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Tất cả Side</option>
              <option value="LONG">Chỉ LONG</option>
              <option value="SHORT">Chỉ SHORT</option>
            </select>
          </div>

          {/* Reason Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">Lý do đóng:</span>
            <select
              value={filterReason}
              onChange={(e) => {
                setFilterReason(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#151a24] text-gray-300 border border-gray-700/70 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Tất cả lý do</option>
              <option value="TAKE_PROFIT">TAKE_PROFIT (Chốt Lời TP)</option>
              <option value="NET_PNL_POSITIVE_TRIGGER">NET_PNL_TRIGGER (Auto-Close)</option>
              <option value="STOP_LOSS">STOP_LOSS (Cắt Lỗ)</option>
              <option value="TRAILING_TP">TRAILING_TP (Bảo Vệ Lãi)</option>
              <option value="MANUAL_CLOSE">MANUAL_CLOSE (Đóng Thủ Công)</option>
            </select>
          </div>

          {(searchSymbol || filterSide !== 'ALL' || filterReason !== 'ALL') && (
            <button
              onClick={() => {
                setSearchSymbol('');
                setFilterSide('ALL');
                setFilterReason('ALL');
                setCurrentPage(1);
              }}
              className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>

        {/* PAGE SIZE SELECTOR */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>Hiển thị:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-[#151a24] text-gray-300 border border-gray-700/70 rounded px-2 py-0.5 text-[11px] focus:outline-none cursor-pointer"
          >
            <option value={20}>20 lệnh / trang</option>
            <option value={25}>25 lệnh / trang</option>
            <option value={50}>50 lệnh / trang</option>
            <option value={100}>100 lệnh / trang</option>
          </select>
        </div>
      </div>

      {/* TABLE DATA */}
      <div className="overflow-x-auto min-h-[300px] max-h-[480px] overflow-y-auto rounded-lg border border-[#1f2430]/60 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-[#11141d]/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <div className="flex items-center gap-2 text-xs text-purple-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Đang tải danh sách giao dịch...
            </div>
          </div>
        )}

        <table className="w-full text-left font-mono text-xs">
          <thead className="text-[10px] text-gray-400 border-b border-[#1f2430]/80 uppercase sticky top-0 bg-[#0d1017] z-10 shadow-sm">
            <tr>
              <th className="py-2.5 px-3">Thời gian</th>
              <th className="px-2">Symbol</th>
              <th className="px-2">Vị thế</th>
              <th className="px-2">Entry</th>
              <th className="px-2">Exit</th>
              <th className="px-2">Thời lượng</th>
              <th className="px-2">Lợi nhuận gộp</th>
              <th className="px-2">Phí &amp; Chi phí</th>
              <th className="px-2">Net PnL</th>
              <th className="px-2">ROE</th>
              <th className="px-3">Lý do đóng</th>
            </tr>
          </thead>
          <tbody id="history-tbody" className="divide-y divide-gray-800/40 text-[11px]">
            {displayTrades.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-gray-500">
                  {isLoading ? 'Đang truy vấn lịch sử giao dịch...' : 'Không tìm thấy giao dịch nào phù hợp với bộ lọc hiện tại.'}
                </td>
              </tr>
            ) : (
              displayTrades.map((h) => {
                const isLong = (h.side || 'LONG') === 'LONG';
                const sideClass = isLong
                  ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 px-1.5 py-0.5 rounded text-[10px]'
                  : 'text-rose-400 bg-rose-950/60 border border-rose-900/60 px-1.5 py-0.5 rounded text-[10px]';

                const grossPnL = h.grossPnL ?? 0;
                const costs = h.costs ?? (h as any).totalCosts ?? 0;
                const netPnL = h.netPnL ?? 0;
                const roe = h.roe ?? (h as any).roePct ?? 0;
                const durationSeconds = h.durationSeconds ?? 0;
                const entryPrice = h.entry ?? (h as any).entryPrice ?? 0;
                const exitPrice = h.exit ?? (h as any).exitPrice ?? 0;
                const leverage = h.leverage || 10;
                const timeMs = h.time || (h as any).exitTime || Date.now();

                const pnlClass =
                  netPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';

                const reasonBadge =
                  h.reason === 'TAKE_PROFIT'
                    ? 'text-emerald-300 bg-emerald-950/80 border border-emerald-600'
                    : h.reason === 'NET_PNL_POSITIVE_TRIGGER'
                    ? 'text-cyan-300 bg-cyan-950/80 border border-cyan-700'
                    : h.reason === 'STOP_LOSS'
                    ? 'text-rose-400 bg-rose-950/80 border border-rose-800'
                    : h.reason === 'TRAILING_TP'
                    ? 'text-amber-300 bg-amber-950/80 border border-amber-700'
                    : 'text-gray-400 bg-gray-900 border border-gray-800';

                return (
                  <tr key={h.id || `${timeMs}-${h.symbol}`} className="hover:bg-[#151a24] transition">
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                      {new Date(timeMs).toLocaleDateString()} {new Date(timeMs).toLocaleTimeString()}
                    </td>
                    <td className="px-2 font-bold text-white whitespace-nowrap">{h.symbol}</td>
                    <td className="px-2 whitespace-nowrap">
                      <span className={sideClass}>
                        {h.side || 'LONG'} {leverage}x
                      </span>
                    </td>
                    <td className="px-2 text-gray-300 whitespace-nowrap">{formatPrice(entryPrice, h.symbol)}</td>
                    <td className="px-2 text-gray-300 whitespace-nowrap">{formatPrice(exitPrice, h.symbol)}</td>
                    <td className="px-2 text-gray-400 whitespace-nowrap">{durationSeconds}s</td>
                    <td className={`px-2 whitespace-nowrap ${grossPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {grossPnL >= 0 ? '+' : ''}${grossPnL.toFixed(4)}
                    </td>
                    <td className="px-2 text-amber-400 whitespace-nowrap">-${costs.toFixed(4)}</td>
                    <td className={`px-2 whitespace-nowrap ${pnlClass}`}>
                      {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(4)}
                    </td>
                    <td className={`px-2 whitespace-nowrap ${roe >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {roe >= 0 ? '+' : ''}{roe.toFixed(2)}%
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${reasonBadge}`}>
                        {h.reason === 'NET_PNL_POSITIVE_TRIGGER'
                          ? 'Bot 4 Auto-Close'
                          : h.reason === 'TAKE_PROFIT'
                          ? 'Take Profit'
                          : h.reason === 'STOP_LOSS'
                          ? 'Stop Loss'
                          : (h.reason || 'CLOSED')}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION CONTROLS */}
      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#1f2430]/60 text-xs gap-3">
        <div className="text-[11px] text-gray-400">
          Hiển thị <strong className="text-gray-200">{displayTrades.length}</strong> trên tổng số <strong className="text-gray-200">{totalTrades}</strong> giao dịch (Trang <strong className="text-purple-400">{currentPage}</strong> / {totalPages})
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage <= 1 || isLoading}
            className="p-1.5 rounded border border-gray-700 bg-[#151a24] text-gray-300 hover:text-white hover:bg-[#1f2533] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Trang đầu"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isLoading}
            className="px-2.5 py-1 rounded border border-gray-700 bg-[#151a24] text-gray-300 hover:text-white hover:bg-[#1f2533] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            title="Trang trước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Trước</span>
          </button>

          <span className="px-3 py-1 bg-purple-950/50 border border-purple-800/60 rounded text-purple-300 font-bold text-xs">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || isLoading}
            className="px-2.5 py-1 rounded border border-gray-700 bg-[#151a24] text-gray-300 hover:text-white hover:bg-[#1f2533] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            title="Trang sau"
          >
            <span>Sau</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages || isLoading}
            className="p-1.5 rounded border border-gray-700 bg-[#151a24] text-gray-300 hover:text-white hover:bg-[#1f2533] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Trang cuối"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
