import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Zap, ChevronDown, ChevronUp, Minimize2, Maximize2 } from 'lucide-react';
import { TickerData } from '../types/engine';

interface MarketTickerBarProps {
  tickers: Record<string, TickerData>;
  onSelectQuickTrade: (symbol: string) => void;
}

export const MarketTickerBar: React.FC<MarketTickerBarProps> = React.memo(({
  tickers,
  onSelectQuickTrade,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('market_ticker_collapsed');
      // Default to collapsed (true) if not previously explicitly set to false
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('market_ticker_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const symbols = Object.keys(tickers);
  if (symbols.length === 0) return null;

  return (
    <div className="bg-[#11141d]/90 border border-[#1f2430] rounded-xl p-2.5 shadow-md transition-all duration-200">
      <div className="flex items-center justify-between pb-1.5 border-b border-[#1f2430]/60 text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-white font-bold">Bitget USDT-M Watchlist</span>
          <span className="text-gray-500 text-[10px]">({symbols.length} contracts)</span>
          {isCollapsed && (
            <span className="text-amber-400 text-[9px] bg-amber-950/60 border border-amber-600/40 px-1.5 py-0.2 rounded">
              ĐÃ THU GỌN
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-gray-500 text-[10px]">
            {isCollapsed ? 'Nhấn để mở rộng danh sách coin' : 'Click coin để mở vị thế scalper nhanh'}
          </span>
          <button
            onClick={toggleCollapse}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161c2a] hover:bg-[#1f273b] text-gray-300 hover:text-white border border-[#263147] transition cursor-pointer text-[10px]"
            title={isCollapsed ? 'Mở rộng bảng danh sách coin' : 'Thu gọn bảng danh sách coin'}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3 h-3 text-cyan-400" />
                <span>MỞ RỘNG ({symbols.length})</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3 text-amber-400" />
                <span>THU GỌN</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isCollapsed ? (
        /* COMPACT SINGLE-LINE HORIZONTAL SCROLL FOR MINIMAL VIEWPORT FOOTPRINT */
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[11px] font-mono">
          {symbols.slice(0, 12).map((sym) => {
            const t = tickers[sym];
            if (!t) return null;
            const isUp = t.change24h >= 0;
            return (
              <button
                key={sym}
                onClick={() => onSelectQuickTrade(sym)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#080a0f] hover:bg-[#161b26] border border-gray-800/80 hover:border-emerald-500/50 transition cursor-pointer flex-shrink-0"
              >
                <span className="font-bold text-gray-200">{sym.replace('USDT', '')}</span>
                <span className="text-gray-400 font-digital text-[10px]">
                  ${sym.includes('XRP') || sym.includes('DOGE') ? t.lastPr.toFixed(4) : t.lastPr.toFixed(2)}
                </span>
                <span className={`text-[9px] font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}{t.change24h.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* EXPANDED GRID VIEW */
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {symbols.map((sym) => {
            const t = tickers[sym];
            if (!t) return null;
            const isUp = t.change24h >= 0;

            return (
              <div
                key={sym}
                onClick={() => onSelectQuickTrade(sym)}
                className="bg-[#080a0f] hover:bg-[#161b26] border border-gray-800/80 hover:border-emerald-500/40 rounded-lg p-2 flex flex-col justify-between transition cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-gray-200 group-hover:text-emerald-400 transition">
                    {sym.replace('USDT', '')}
                  </span>
                  <span
                    className={`text-[9px] font-bold flex items-center ${
                      isUp ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {t.change24h.toFixed(2)}%
                  </span>
                </div>

                <div className="mt-1 flex items-baseline justify-between font-digital">
                  <span className="text-xs font-bold text-white tracking-wide">
                    ${sym.includes('XRP') || sym.includes('DOGE') ? t.lastPr.toFixed(4) : t.lastPr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <Zap className="w-3 h-3 text-gray-600 group-hover:text-amber-400 transition" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
