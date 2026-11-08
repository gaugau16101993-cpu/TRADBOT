import React, { useState } from 'react';
import {
  X,
  LineChart,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { MarketAnalysisResult, TimeframeAnalysis } from '../types/engine';

interface Bot2AnalystModalProps {
  isOpen: boolean;
  analysis?: MarketAnalysisResult;
  onClose: () => void;
  onTriggerAnalyze: (symbol?: string) => Promise<void>;
}

export const Bot2AnalystModal: React.FC<Bot2AnalystModalProps> = ({
  isOpen,
  analysis,
  onClose,
  onTriggerAnalyze,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isOpen) return null;

  const a = analysis;

  const handleRefresh = async () => {
    setIsAnalyzing(true);
    await onTriggerAnalyze(a?.symbol);
    setTimeout(() => setIsAnalyzing(false), 800);
  };

  const getRegimeColor = (regime?: string) => {
    switch (regime) {
      case 'TRENDING_BULLISH':
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
      case 'TRENDING_BEARISH':
        return 'text-rose-400 bg-rose-950/80 border-rose-800';
      case 'HIGH_VOLATILITY':
        return 'text-amber-400 bg-amber-950/80 border-amber-800';
      case 'ABNORMAL_MARKET':
        return 'text-rose-500 bg-rose-950 border-rose-700 animate-pulse';
      default:
        return 'text-cyan-400 bg-cyan-950/80 border-cyan-800';
    }
  };

  const getBiasBadge = (bias?: string) => {
    if (bias === 'LONG') {
      return (
        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-700 font-bold flex items-center gap-1 font-digital text-sm">
          <TrendingUp className="w-4 h-4" /> LONG / BUY
        </span>
      );
    }
    if (bias === 'SHORT') {
      return (
        <span className="px-2.5 py-1 rounded bg-rose-950 text-rose-400 border border-rose-700 font-bold flex items-center gap-1 font-digital text-sm">
          <TrendingDown className="w-4 h-4" /> SHORT / SELL
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded bg-gray-900 text-gray-300 border border-gray-700 font-bold flex items-center gap-1 font-digital text-sm">
        <Activity className="w-4 h-4" /> NEUTRAL / WAIT
      </span>
    );
  };

  const timeframesList: Array<'1m' | '5m' | '15m' | '1H' | '4H'> = ['1m', '5m', '15m', '1H', '4H'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-cyan-800/60 rounded-xl max-w-5xl w-full p-5 shadow-2xl font-mono text-xs max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
              <LineChart className="w-4 h-4" />
            </span>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>BOT 2: ADVANCED MARKET ANALYST PRO</span>
                <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] px-2 py-0.5 rounded font-mono">
                  MTF M1-H4 • SMC ENGINE
                </span>
              </div>
              <div className="text-[10px] text-gray-400">
                Phân tích định lượng đa khung thời gian M1, M5, M15, H1, H4 &amp; Smart Money Concepts
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={isAnalyzing}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>Phân tích lại ngay</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!a ? (
          <div className="py-16 text-center text-gray-500">
            <Activity className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-spin" />
            <p>Đang tải dữ liệu phân tích đa khung thời gian từ Bitget Futures...</p>
          </div>
        ) : (
          <div className="my-3 space-y-3.5 overflow-y-auto pr-1 flex-1">
            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Target & Price */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Hợp đồng phân tích</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-bold text-white">{a.symbol}</span>
                  <span className="text-xs font-digital text-emerald-400 font-bold">
                    ${a.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="text-[9px] text-gray-500 mt-1 flex justify-between">
                  <span>Latency: {a.analysisLatencyMs}ms</span>
                  <span>{new Date(a.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Regime */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Market Regime (Chế độ thị trường)</span>
                <div className="mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getRegimeColor(a.overallRegime)}`}>
                    {a.overallRegime}
                  </span>
                </div>
                <div className="text-[9px] text-gray-400 mt-1">
                  Đo lường từ ADX, biến động ATR và độ siết EMA
                </div>
              </div>

              {/* Bias & Score */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Directional Bias &amp; Confidence</span>
                <div className="flex items-center justify-between mt-1">
                  {getBiasBadge(a.bias)}
                  <div className="text-right">
                    <span className="text-sm font-bold font-digital text-white">
                      {a.confidenceScore}/100
                    </span>
                    <span className="text-[9px] text-gray-500 block">Độ tin cậy</span>
                  </div>
                </div>
                <div className="text-[9px] text-gray-400 mt-1">
                  Hiệu chuẩn từ độ đồng thuận đa khung &amp; SMC
                </div>
              </div>

              {/* MTF Alignment Summary */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Phân tầng xu hướng</span>
                <div className="grid grid-cols-3 gap-1 text-[10px] text-center mt-1">
                  <div className="bg-[#11141d] p-1 rounded border border-gray-800">
                    <span className="text-gray-500 block text-[9px]">Macro H4/H1</span>
                    <strong className={a.macroTrend === 'BULLISH' ? 'text-emerald-400' : a.macroTrend === 'BEARISH' ? 'text-rose-400' : 'text-gray-400'}>
                      {a.macroTrend}
                    </strong>
                  </div>
                  <div className="bg-[#11141d] p-1 rounded border border-gray-800">
                    <span className="text-gray-500 block text-[9px]">Inter M15</span>
                    <strong className={a.intermediateTrend === 'BULLISH' ? 'text-emerald-400' : a.intermediateTrend === 'BEARISH' ? 'text-rose-400' : 'text-gray-400'}>
                      {a.intermediateTrend}
                    </strong>
                  </div>
                  <div className="bg-[#11141d] p-1 rounded border border-gray-800">
                    <span className="text-gray-500 block text-[9px]">Micro M5/M1</span>
                    <strong className={a.microTrend === 'BULLISH' ? 'text-emerald-400' : a.microTrend === 'BEARISH' ? 'text-rose-400' : 'text-gray-400'}>
                      {a.microTrend}
                    </strong>
                  </div>
                </div>
                <div className="text-[9px] text-gray-500 mt-1 text-center">
                  {a.conflict.detected ? (
                    <span className="text-amber-400 font-bold">Xung đột tín hiệu!</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">Đồng thuận xu hướng</span>
                  )}
                </div>
              </div>
            </div>

            {/* Conflict Banner if detected */}
            {a.conflict.detected && (
              <div className="p-2.5 bg-amber-950/70 border border-amber-600/70 rounded-lg flex items-center justify-between text-[11px] text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>
                    <strong>CẢNH BÁO XUNG ĐỘT ĐA KHUNG:</strong> {a.conflict.description}. Bot 2 đã hạ bậc độ tin cậy để phòng tránh bẫy ngược xu hướng khung lớn.
                  </span>
                </div>
                <span className="text-[10px] bg-amber-900 px-2 py-0.5 rounded text-white font-bold">
                  Bảo vệ vốn
                </span>
              </div>
            )}

            {/* Multi-Timeframe Matrix Table */}
            <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Ma Trận Chỉ Báo Kỹ Thuật Đa Khung Thời Gian (M1, M5, M15, H1, H4)
                </span>
                <span className="text-[10px] text-gray-500">
                  EMA 9/21/50 • RSI(14) • ADX(14) • ATR(14) • RVOL
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="text-[10px] text-gray-500 border-b border-gray-800 uppercase bg-[#11141d]">
                    <tr>
                      <th className="py-2 px-2">Khung</th>
                      <th>Số nến</th>
                      <th>Trend</th>
                      <th>EMA 9 / 21 / 50</th>
                      <th>RSI(14)</th>
                      <th>ADX / +DI / -DI</th>
                      <th>ATR (Biên độ %)</th>
                      <th>RVOL</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/40 text-[11px]">
                    {timeframesList.map((tf) => {
                      const data = a.timeframes[tf];
                      if (!data) return null;

                      const isBull = data.trend === 'BULLISH';
                      const isBear = data.trend === 'BEARISH';
                      const trendColor = isBull
                        ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-1.5 py-0.2 rounded font-bold'
                        : isBear
                        ? 'text-rose-400 bg-rose-950/60 border border-rose-900 px-1.5 py-0.2 rounded font-bold'
                        : 'text-gray-400 bg-gray-900 px-1.5 py-0.2 rounded';

                      const rsiColor =
                        data.indicators.rsi14 >= 70
                          ? 'text-rose-400 font-bold'
                          : data.indicators.rsi14 <= 30
                          ? 'text-emerald-400 font-bold'
                          : 'text-gray-300';

                      return (
                        <tr key={tf} className="hover:bg-[#151a24] transition">
                          <td className="py-2.5 px-2 font-bold text-white">{tf}</td>
                          <td className="text-gray-400">{data.candleCount}</td>
                          <td>
                            <span className={trendColor}>{data.trend}</span>
                          </td>
                          <td className="text-gray-300 text-[10px]">
                            {data.indicators.ema9} / {data.indicators.ema21} / {data.indicators.ema50}
                          </td>
                          <td className={rsiColor}>{data.indicators.rsi14}</td>
                          <td className="text-gray-300 text-[10px]">
                            {data.indicators.adx14} ({data.indicators.plusDI} / {data.indicators.minusDI})
                          </td>
                          <td className="text-cyan-400">
                            ${data.indicators.atr14} ({data.indicators.atrPercent}%)
                          </td>
                          <td className={data.indicators.rvol > 1.3 ? 'text-amber-400 font-bold' : 'text-gray-400'}>
                            {data.indicators.rvol}x
                          </td>
                          <td>
                            {data.isProvisional ? (
                              <span className="text-[9px] text-amber-400 bg-amber-950/60 px-1 rounded border border-amber-900">
                                Đang chạy
                              </span>
                            ) : (
                              <span className="text-[9px] text-emerald-400 bg-emerald-950/60 px-1 rounded border border-emerald-900">
                                Nến đóng
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SMC & Price Action Signals + Cost Modeling */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* SMC Signals */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <div className="text-xs font-bold text-white flex items-center justify-between pb-1.5 border-b border-gray-800">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Tín Hiệu Smart Money Concepts (SMC)
                  </span>
                  <span className="text-[10px] text-gray-500">Chỉ dùng nến đã đóng (No Look-Ahead)</span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-2 text-[10px]">
                  {/* Liquidity Sweep */}
                  <div className="bg-[#11141d] p-2 rounded border border-gray-800">
                    <div className="text-gray-400 flex items-center justify-between">
                      <span>Liquidity Sweep</span>
                      <span className={a.timeframes['5m']?.smc.liquiditySweep.detected ? 'text-emerald-400 font-bold' : 'text-gray-600'}>
                        {a.timeframes['5m']?.smc.liquiditySweep.detected ? 'CÓ' : 'KHÔNG'}
                      </span>
                    </div>
                    {a.timeframes['5m']?.smc.liquiditySweep.detected && (
                      <div className="text-emerald-400 font-digital mt-1">
                        {a.timeframes['5m']?.smc.liquiditySweep.side} @ ${a.timeframes['5m']?.smc.liquiditySweep.level}
                      </div>
                    )}
                  </div>

                  {/* BOS */}
                  <div className="bg-[#11141d] p-2 rounded border border-gray-800">
                    <div className="text-gray-400 flex items-center justify-between">
                      <span>BOS (Break of Structure)</span>
                      <span className={a.timeframes['5m']?.smc.bos.detected ? 'text-emerald-400 font-bold' : 'text-gray-600'}>
                        {a.timeframes['5m']?.smc.bos.detected ? 'CÓ' : 'KHÔNG'}
                      </span>
                    </div>
                    {a.timeframes['5m']?.smc.bos.detected && (
                      <div className="text-cyan-400 font-digital mt-1">
                        {a.timeframes['5m']?.smc.bos.side} BOS @ ${a.timeframes['5m']?.smc.bos.level}
                      </div>
                    )}
                  </div>

                  {/* CHoCH */}
                  <div className="bg-[#11141d] p-2 rounded border border-gray-800">
                    <div className="text-gray-400 flex items-center justify-between">
                      <span>CHoCH (Change of Character)</span>
                      <span className={a.timeframes['5m']?.smc.choch.detected ? 'text-purple-400 font-bold' : 'text-gray-600'}>
                        {a.timeframes['5m']?.smc.choch.detected ? 'CÓ' : 'KHÔNG'}
                      </span>
                    </div>
                    {a.timeframes['5m']?.smc.choch.detected && (
                      <div className="text-purple-400 font-digital mt-1">
                        {a.timeframes['5m']?.smc.choch.side} CHoCH
                      </div>
                    )}
                  </div>

                  {/* FVG */}
                  <div className="bg-[#11141d] p-2 rounded border border-gray-800">
                    <div className="text-gray-400 flex items-center justify-between">
                      <span>Fair Value Gap (FVG)</span>
                      <span className={a.timeframes['15m']?.smc.fvg.detected ? 'text-amber-400 font-bold' : 'text-gray-600'}>
                        {a.timeframes['15m']?.smc.fvg.detected ? 'CÓ' : 'KHÔNG'}
                      </span>
                    </div>
                    {a.timeframes['15m']?.smc.fvg.detected && (
                      <div className="text-amber-400 font-digital mt-1">
                        {a.timeframes['15m']?.smc.fvg.side} [${a.timeframes['15m']?.smc.fvg.bottom} - ${a.timeframes['15m']?.smc.fvg.top}]
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[9px] text-gray-500">
                  Xác nhận cấu trúc nến nhằm lọc bỏ tín hiệu giả (fake-outs).
                </div>
              </div>

              {/* Execution Cost & Break-Even Modeling */}
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430] flex flex-col justify-between">
                <div className="text-xs font-bold text-white flex items-center justify-between pb-1.5 border-b border-gray-800">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Mô Hình Ước Tính Chi Phí &amp; Điểm Hòa Vốn (Friction Model)
                  </span>
                  <span className="text-[10px] text-gray-500">Paper Trading Net PnL</span>
                </div>

                <div className="space-y-1.5 my-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Spread thực tế trên sàn:</span>
                    <span className="text-white font-digital">{a.costs.spreadBps} bps</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Phí Taker mở + đóng (0.06% x 2):</span>
                    <span className="text-white font-digital">{a.costs.roundTripTakerFeeBps} bps (0.12%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Độ trượt giá dự kiến (Slippage):</span>
                    <span className="text-white font-digital">{a.costs.estSlippageBps} bps (0.05%)</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-1 text-amber-400 font-bold">
                    <span>Tổng chi phí vòng lệnh (Friction):</span>
                    <span className="font-digital">{a.costs.totalCostBps} bps ({a.costs.breakEvenMovePercent}%)</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800/60 pt-1 text-emerald-400 font-bold">
                    <span>Biên độ giá tối thiểu để có Lãi ròng (Net PnL &gt; 0):</span>
                    <span className="font-digital">${a.costs.breakEvenMoveDollars}</span>
                  </div>
                </div>

                <div className="text-[9px] text-gray-500">
                  Bot 4 chỉ kích hoạt Auto-Close khi biên độ giá dịch chuyển vượt ngưỡng ${a.costs.breakEvenMoveDollars}.
                </div>
              </div>
            </div>

            {/* Technical Rationales */}
            <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2430]">
              <div className="text-xs font-bold text-white mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Lý Do Kỹ Thuật Đưa Ra Quyết Định (Technical Rationales):
              </div>
              <ul className="space-y-1 text-[11px] text-gray-300">
                {a.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-cyan-400 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#1f2430] text-[10px] text-gray-500">
          <span>Bot 2 MTF Pipeline • Tính toán gia tăng &amp; Caching theo Timeframe</span>
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
