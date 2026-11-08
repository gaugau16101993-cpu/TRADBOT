import React from 'react';
import { Layers, ArrowUpRight, ArrowDownRight, Zap, AlertCircle, ShieldAlert } from 'lucide-react';
import { Position, EngineSettings } from '../types/engine';

interface PositionsTableProps {
  positions: Position[];
  settings: EngineSettings;
  onClosePosition: (id: string) => void;
  onTriggerQuickTrade: () => void;
}

export const PositionsTable: React.FC<PositionsTableProps> = React.memo(({
  positions,
  settings,
  onClosePosition,
  onTriggerQuickTrade,
}) => {
  return (
    <div className="lg:col-span-2 bg-[#11141d] border border-[#1f2430] rounded-xl p-4 flex flex-col h-80 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]/60 text-xs font-mono">
        <span className="flex items-center gap-1.5 font-bold text-white">
          <Layers className="w-4 h-4 text-amber-400" />
          Active Paper Positions ({positions.length} / {settings.maxPositions})
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400/90 bg-amber-950/40 border border-amber-900/60 px-2 py-0.5 rounded">
            Bot 4 Rule: Auto-close Net PnL &gt; ${settings.netPnLThreshold}
          </span>
          <span className="text-gray-500 font-digital" id="active-positions-count">
            {positions.length} / {settings.maxPositions} Open
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto my-2">
        <table className="w-full text-left font-mono text-xs">
          <thead className="text-[10px] text-gray-500 border-b border-[#1f2430]/60 uppercase sticky top-0 bg-[#11141d] z-10">
            <tr>
              <th className="pb-2">Coin</th>
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Current</th>
              <th className="pb-2">Margin</th>
              <th className="pb-2">Gross PnL</th>
              <th className="pb-2">Fees</th>
              <th className="pb-2">Net PnL</th>
              <th className="pb-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody id="positions-tbody" className="divide-y divide-gray-800/40 text-[11px]">
            {positions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertCircle className="w-6 h-6 text-gray-600 mb-1" />
                    <span>Không có vị thế mở. Đang chờ tín hiệu từ Bot 3 & Execution Bot 4.</span>
                    <button
                      onClick={onTriggerQuickTrade}
                      className="mt-1 px-3 py-1 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 text-xs rounded transition flex items-center gap-1.5 cursor-pointer font-sans"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Mở lệnh Scalp Test ngay
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              positions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const isNetPositive = pos.netPnL > 0;
                const isCloseToZero = pos.netPnL > -0.002 && pos.netPnL <= 0;

                const sideClass = isLong
                  ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5'
                  : 'text-rose-400 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5';

                const pnlClass = isNetPositive
                  ? 'text-emerald-400 glow-green font-bold'
                  : 'text-rose-400 font-bold';

                const formatPrice = (pr: number) => {
                  return pos.symbol.includes('XRP') || pos.symbol.includes('DOGE')
                    ? `$${pr.toFixed(4)}`
                    : `$${pr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };

                return (
                  <tr
                    key={pos.id}
                    className={`hover:bg-[#151a24] transition ${
                      isNetPositive ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    <td className="py-3 font-bold text-white flex items-center gap-1">
                      <span>{pos.symbol}</span>
                      {pos.status === 'CLOSING' && (
                        <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1 rounded animate-pulse">
                          CLOSING
                        </span>
                      )}
                    </td>

                    <td>
                      <span className={sideClass}>
                        {isLong ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {pos.side} {pos.leverage}x
                      </span>
                    </td>

                    <td className="text-gray-300">{formatPrice(pos.entryPrice)}</td>

                    <td className="text-white font-semibold">
                      {formatPrice(pos.currentPrice)}
                    </td>

                    <td className="text-gray-400">
                      ${(pos.margin ?? 0).toFixed(2)}
                    </td>

                    <td className={(pos.grossPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {(pos.grossPnL ?? 0) >= 0 ? '+' : ''}${(pos.grossPnL ?? 0).toFixed(4)}
                    </td>

                    <td className="text-amber-400/90 text-[10px]">
                      -${(pos.currentCosts ?? (pos as any).costs ?? 0).toFixed(4)}
                    </td>

                    <td>
                      <div className="flex flex-col">
                        <span className={pnlClass}>
                          {isNetPositive ? '+' : ''}${(pos.netPnL ?? 0).toFixed(4)}
                        </span>
                        <span className="text-[9px] text-gray-500">
                          ROE: {(pos.roe ?? 0) >= 0 ? '+' : ''}{(pos.roe ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </td>

                    <td className="text-right">
                      <button
                        onClick={() => onClosePosition(pos.id)}
                        disabled={pos.status === 'CLOSING'}
                        className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] rounded transition active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        Đóng
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-2 border-t border-[#1f2430]/60 flex justify-between items-center text-[10px] font-mono text-gray-500">
        <span>
          Net PnL = Gross PnL - (Maker/Taker Fees: {(settings.takerFee * 100).toFixed(2)}% + Slippage: {(settings.slippagePct * 100).toFixed(2)}%)
        </span>
        <span className="text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Evaluation Loop: Real-time 2.0s
        </span>
      </div>
    </div>
  );
});
