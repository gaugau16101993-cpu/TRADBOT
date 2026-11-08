import React, { useState } from 'react';
import { X, Zap, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { TickerData, TradeSide, EngineSettings } from '../types/engine';

interface QuickTradeModalProps {
  isOpen: boolean;
  selectedSymbol: string;
  tickers: Record<string, TickerData>;
  settings: EngineSettings;
  onClose: () => void;
  onExecute: (symbol: string, side: TradeSide) => void;
}

export const QuickTradeModal: React.FC<QuickTradeModalProps> = ({
  isOpen,
  selectedSymbol,
  tickers,
  settings,
  onClose,
  onExecute,
}) => {
  const [symbol, setSymbol] = useState(selectedSymbol || 'BTCUSDT');
  const [side, setSide] = useState<TradeSide>('LONG');

  if (!isOpen) return null;

  const currentTicker = tickers[symbol] || {
    lastPr: 68000,
    change24h: 0,
    symbol,
  };

  const margin = settings.marginPerTrade;
  const leverage = settings.maxLeverage;
  const notional = margin * leverage;
  const estOpenFee = notional * settings.takerFee;
  const estCloseFee = notional * settings.takerFee;
  const estSlippage = notional * settings.slippagePct;
  const estTotalCosts = estOpenFee + estCloseFee + estSlippage;
  const requiredMoveDollars = (estTotalCosts / notional) * currentTicker.lastPr;

  const handleTrigger = () => {
    onExecute(symbol, side);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-[#1f2430] rounded-xl max-w-md w-full p-5 shadow-2xl font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <Zap className="w-4 h-4 text-amber-400" />
            Quick Scalp Order Simulator
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 space-y-3.5">
          {/* Symbol Select */}
          <div>
            <label className="text-gray-400 text-[11px] block mb-1">Contract Pair</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[#080a0f] border border-[#1f2430] rounded p-2 text-white font-bold outline-none"
            >
              {Object.keys(tickers).map((sym) => (
                <option key={sym} value={sym}>
                  {sym} - ${tickers[sym]?.lastPr?.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Side Selector */}
          <div>
            <label className="text-gray-400 text-[11px] block mb-1">Position Side</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('LONG')}
                className={`py-2 px-3 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  side === 'LONG'
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'bg-[#080a0f] border border-[#1f2430] text-gray-400 hover:text-emerald-400'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                LONG / BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SHORT')}
                className={`py-2 px-3 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  side === 'SHORT'
                    ? 'bg-rose-600 text-white shadow-lg'
                    : 'bg-[#080a0f] border border-[#1f2430] text-gray-400 hover:text-rose-400'
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                SHORT / SELL
              </button>
            </div>
          </div>

          {/* Pricing calculations */}
          <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Market Price:</span>
              <span className="font-digital text-white font-bold">
                ${currentTicker.lastPr?.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Margin &amp; Leverage:</span>
              <span className="text-gray-200">
                ${margin.toFixed(2)} @ {leverage}x (${notional.toFixed(2)} Notional)
              </span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>Round-trip Fees + Slippage:</span>
              <span>-${estTotalCosts.toFixed(4)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-800 pt-1.5 text-cyan-400 font-semibold">
              <span>Bot 4 Break-even Price Move:</span>
              <span>
                {side === 'LONG' ? '+' : '-'}${requiredMoveDollars.toFixed(4)} (
                {((requiredMoveDollars / currentTicker.lastPr) * 100).toFixed(3)}%)
              </span>
            </div>
          </div>

          <div className="text-[10px] text-gray-500 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>
              Ngay khi lệnh được mở, Bot 4 sẽ quét giá real-time cứ mỗi 800ms. Khi giá dịch chuyển đủ để bù trừ phí giao dịch và Net PnL &gt; 0, Bot 4 sẽ tự động khớp lệnh chốt lời ngay lập tức.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#1f2430]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-[#1a202c] hover:bg-gray-800 text-gray-300 rounded cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={handleTrigger}
            className={`px-4 py-1.5 rounded font-bold text-white transition cursor-pointer flex items-center gap-1 ${
              side === 'LONG'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Khớp lệnh {side} ngay
          </button>
        </div>
      </div>
    </div>
  );
};
