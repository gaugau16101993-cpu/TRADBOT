import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Zap,
  RotateCcw,
  Sliders,
  Database,
  Cpu,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Percent,
  MessageSquare,
  Scale,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { CompletePipelineSnapshot } from '../types/pipeline';

interface PipelineInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot?: CompletePipelineSnapshot;
  initialTab?: number;
  onTriggerCycle: () => void;
  onSimulateLoss: (category: string) => void;
  onResetParams: () => void;
}

export const PipelineInspectorModal: React.FC<PipelineInspectorModalProps> = ({
  isOpen,
  onClose,
  snapshot,
  initialTab = 0,
  onTriggerCycle,
  onSimulateLoss,
  onResetParams,
}) => {
  const [activeTab, setActiveTab] = useState<number>(initialTab);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const b1 = snapshot?.bot1Payload;
  const b2 = snapshot?.bot2Payload;
  const b3 = snapshot?.bot3Payload;
  const b4 = snapshot?.bot4Payload;
  const b5 = snapshot?.bot5Payload;
  const debate = b3?.tradingAgentsDebate;

  const currentPayloadData =
    activeTab === 0
      ? b1
      : activeTab === 1
      ? b2
      : activeTab === 2
      ? b3
      : activeTab === 3
      ? b4
      : activeTab === 4
      ? b5
      : debate;

  const handleCopyJSON = () => {
    if (!currentPayloadData) return;
    navigator.clipboard.writeText(JSON.stringify(currentPayloadData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 0, label: '1. Bot 1 Scan', icon: Database, color: 'text-cyan-400', role: 'Giá & Volume' },
    { id: 1, label: '2. Bot 2 Technicals', icon: Cpu, color: 'text-blue-400', role: 'Chỉ báo & MTF' },
    { id: 2, label: '3. Bot 3 Net TP', icon: Sparkles, color: 'text-purple-400', role: 'Khấu trừ phí sàn' },
    { id: 3, label: '4. Bot 4 Orders', icon: Zap, color: 'text-amber-400', role: 'Ký quỹ 2 USDT' },
    { id: 4, label: '5. Bot 5 Post-Mortem', icon: ShieldAlert, color: 'text-rose-400', role: 'Tự chỉnh Bot 2' },
    { id: 5, label: '6. TradingAgents Debate', icon: MessageSquare, color: 'text-amber-300', role: 'Bull vs Bear vs Trader' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-[#1f2430] rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f2430] bg-[#0c0e15]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white font-bold text-sm">
                Kiểm tra Dữ liệu Chuyển giao giữa 5 Bot (Payloads Inspector)
              </div>
              <div className="text-gray-400 text-[11px]">
                Kiểm toán từng gói payload truyền tin, khấu trừ phí Taker 0.06% x2, và phản hồi tham số Bot 5 &rarr; Bot 2
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerCycle}
              className="px-2.5 py-1 bg-[#1a202c] hover:bg-gray-800 text-gray-300 rounded border border-gray-700 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Chạy Chu kỳ</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#1f2430] bg-[#090b10] overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 border-b-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-emerald-500 bg-[#151a24] text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#0e1219]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                <span>{tab.label}</span>
                <span className="text-[10px] text-gray-500 font-normal">({tab.role})</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 0: BOT 1 PAYLOAD */}
          {activeTab === 0 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-cyan-900/40 rounded-lg p-3">
                <div className="text-cyan-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span>1. Bot 1 (bot1_scanMarket) Output Payload</span>
                  <span className="text-gray-400 text-[11px]">
                    Độ tươi: <strong className="text-emerald-400 font-digital">{b1?.dataFreshnessMs || 12}ms</strong>
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Bot 1 độc lập quét toàn bộ hợp đồng Bitget USDT-M Futures. Lọc spread &le; 0.05%, volume 24h &ge; $5M, độ biến động &ge; 1.0% và đóng gói payload gửi cho Bot 2.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Tổng hợp đồng quét</div>
                    <div className="text-white font-bold font-digital text-base">{b1?.universeTotal || 850}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Đạt chuẩn vào vòng 2</div>
                    <div className="text-emerald-400 font-bold font-digital text-base">{b1?.passedCount || 8}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Độ trễ quét API Bitget</div>
                    <div className="text-cyan-400 font-bold font-digital text-base">{b1?.scanLatencyMs || 25}ms</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Top Candidate chọn lọc</div>
                    <div className="text-amber-400 font-bold font-digital text-base">{b1?.selectedCandidate?.symbol || 'BTCUSDT'}</div>
                  </div>
                </div>
              </div>

              {/* Selected Candidate Details */}
              {b1?.selectedCandidate && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-2">
                    Chi tiết Candidate được đóng gói gửi Bot 2: {b1.selectedCandidate.symbol}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>Giá khớp gần nhất: <strong className="text-white font-digital">${b1.selectedCandidate.lastPrice}</strong></div>
                    <div>Bid / Ask: <strong className="text-gray-300 font-digital">${b1.selectedCandidate.bidPrice} / ${b1.selectedCandidate.askPrice}</strong></div>
                    <div>Spread bps: <strong className="text-emerald-400 font-digital">{b1.selectedCandidate.spreadBps} bps</strong> ({b1.selectedCandidate.spreadPercent.toFixed(4)}%)</div>
                    <div>Volume 24h: <strong className="text-cyan-300 font-digital">${(b1.selectedCandidate.volume24hUsdt / 1e6).toFixed(2)}M</strong></div>
                    <div>Funding Rate 8h: <strong className="text-purple-300 font-digital">{(b1.selectedCandidate.fundingRate * 100).toFixed(4)}%</strong></div>
                    <div>Biến động 24h: <strong className="text-amber-300 font-digital">{b1.selectedCandidate.volatility24h.toFixed(2)}%</strong></div>
                    <div>Điểm Scalp Score: <strong className="text-emerald-400 font-digital">{b1.selectedCandidate.scalpScore} / 100</strong></div>
                    <div>Nến 1m đã đóng: <strong className="text-gray-200">{b1.selectedCandidate.candles1m?.length || 35} nến</strong></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: BOT 2 PAYLOAD */}
          {activeTab === 1 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-blue-900/40 rounded-lg p-3">
                <div className="text-blue-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span>2. Bot 2 (bot2_analyzeTechnicals) Output Payload</span>
                  <span className="text-purple-300 text-[11px]">
                    Áp dụng tham số tự học Bot 5: <strong className="text-emerald-400 font-digital">Ver v{b2?.activeParameters.version || 1}</strong>
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Nhận payload giá từ Bot 1. Độc lập tính toán EMA 9/21/50, RSI 14, ATR 14, ADX 14, SMC (FVG, OrderBlock, BOS, Sweep) đa khung thời gian (M1, M5, M15, H1, H4).
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Xu hướng Directional Bias</div>
                    <div className="text-emerald-400 font-bold text-base">{b2?.bias || 'LONG'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Điểm tin cậy MTF Score</div>
                    <div className="text-amber-300 font-bold font-digital text-base">{b2?.confidenceScore || 82}%</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Cơ chế thị trường Regime</div>
                    <div className="text-cyan-400 font-bold text-xs">{b2?.overallRegime || 'TRENDING_BULLISH'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Xung đột đa khung</div>
                    <div className="text-emerald-400 font-bold text-xs">{b2?.conflict.detected ? 'Có xung đột' : 'Đồng thuận'}</div>
                  </div>
                </div>
              </div>

              {/* Timeframes breakdown */}
              {b2?.timeframes && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-2">Chỉ báo kỹ thuật đa khung đã tính toán:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div className="bg-[#121620] p-2 rounded border border-gray-800">
                      <div className="text-cyan-400 font-bold mb-1">M1 (Micro Scalp)</div>
                      <div>EMA 9: <strong className="text-white font-digital">${b2.timeframes['1m']?.indicators.ema9}</strong></div>
                      <div>RSI 14: <strong className="text-white font-digital">{b2.timeframes['1m']?.indicators.rsi14}</strong></div>
                      <div>ATR 14: <strong className="text-emerald-400 font-digital">${b2.timeframes['1m']?.indicators.atr14}</strong> ({b2.timeframes['1m']?.indicators.atrPercent}%)</div>
                    </div>
                    <div className="bg-[#121620] p-2 rounded border border-gray-800">
                      <div className="text-blue-400 font-bold mb-1">M5 (Trigger Frame)</div>
                      <div>EMA 21: <strong className="text-white font-digital">${b2.timeframes['5m']?.indicators.ema21}</strong></div>
                      <div>RSI 14: <strong className="text-white font-digital">{b2.timeframes['5m']?.indicators.rsi14}</strong></div>
                      <div>ADX 14: <strong className="text-purple-400 font-digital">{b2.timeframes['5m']?.indicators.adx14}</strong></div>
                    </div>
                    <div className="bg-[#121620] p-2 rounded border border-gray-800">
                      <div className="text-purple-400 font-bold mb-1">M15 / H1 (Macro Trend)</div>
                      <div>Macro: <strong className="text-white">{b2.macroTrend}</strong></div>
                      <div>Intermediate: <strong className="text-white">{b2.intermediateTrend}</strong></div>
                      <div>SMC BOS: <strong className="text-amber-400">{b2.timeframes['5m']?.smc.bos.detected ? 'Xác nhận' : 'Chưa phá vỡ'}</strong></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Active parameters adapted by Bot 5 */}
              {b2?.activeParameters && (
                <div className="bg-[#161224] border border-purple-800/50 rounded-lg p-3">
                  <div className="text-purple-300 font-bold text-xs mb-1">
                    Tham số thích ứng động (Dynamic Feedback Parameters từ Bot 5):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-300">
                    <div>RSI Long Max: <strong className="text-cyan-400">{b2.activeParameters.rsiLongMax}</strong></div>
                    <div>RSI Short Min: <strong className="text-rose-400">{b2.activeParameters.rsiShortMin}</strong></div>
                    <div>Đệm ATR tối thiểu: <strong className="text-emerald-400">{b2.activeParameters.minAtrRatio}x</strong></div>
                    <div>Spread tối đa: <strong className="text-amber-400">{b2.activeParameters.maxAllowedSpreadBps} bps</strong></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BOT 3 PAYLOAD */}
          {activeTab === 2 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-purple-900/40 rounded-lg p-3">
                <div className="text-purple-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span>3. Bot 3 (bot3_evaluateSignalAndNetTP) Output Payload</span>
                  <span className="text-rose-400 font-bold">
                    Khấu trừ Phí Sàn Taker: 0.06% Vào + 0.06% Ra = 0.12%
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Nhận payload kỹ thuật từ Bot 2. Khấu trừ 100% phí Taker 0.06% hai chiều, trượt giá dự kiến và funding rate để tính mức chốt lời ròng (Net TP) và tỷ lệ RR thực tế.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Tín hiệu phát ra</div>
                    <div className="text-emerald-400 font-bold text-base">{b3?.action || 'LONG'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Tổng ma sát sàn</div>
                    <div className="text-rose-400 font-bold font-digital text-base">{b3?.feeDeductions.totalFrictionBps || 16.5} bps</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Tỷ lệ Risk-Reward</div>
                    <div className="text-amber-300 font-bold font-digital text-base">1 : {b3?.feeDeductions.riskRewardRatio || 2.0}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Lợi thế ròng dự tính (Net Edge)</div>
                    <div className="text-cyan-400 font-bold font-digital text-base">+{b3?.feeDeductions.expectedNetEdgeBps || 24.5} bps</div>
                  </div>
                </div>
              </div>

              {/* Fee Breakdown Table */}
              {b3?.feeDeductions && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-2">Bảng khấu trừ chi phí sàn chi tiết:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>Phí Taker mở lệnh: <strong className="text-rose-400">0.06% (6 bps)</strong></div>
                    <div>Phí Taker đóng lệnh: <strong className="text-rose-400">0.06% (6 bps)</strong></div>
                    <div>Trượt giá ước tính: <strong className="text-amber-400">{b3.feeDeductions.estSlippageBps} bps</strong></div>
                    <div>Chi phí Spread: <strong className="text-amber-400">{b3.feeDeductions.spreadBps} bps</strong></div>
                    <div>Điểm hòa vốn (Break-even): <strong className="text-white font-digital">${b3.feeDeductions.breakEvenMoveDollars}</strong></div>
                    <div>Giá chốt lời ròng (Net TP): <strong className="text-emerald-400 font-digital">${b3.feeDeductions.netTakeProfitPrice.toFixed(4)}</strong></div>
                    <div>Giá cắt lỗ (Net SL): <strong className="text-rose-400 font-digital">${b3.feeDeductions.netStopLossPrice.toFixed(4)}</strong></div>
                  </div>
                </div>
              )}

              {/* 8 Strict Gates Status */}
              {b3?.gatesPassed && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-2">Trạng thái 8 cổng lọc an toàn (Filter Gates):</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                    {Object.entries(b3.gatesPassed).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between p-1 rounded bg-[#121620]">
                        <span className="text-gray-400 truncate">{key}</span>
                        <span className={`font-bold ${val ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {val ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BOT 4 PAYLOAD */}
          {activeTab === 3 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-amber-900/40 rounded-lg p-3">
                <div className="text-amber-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span>4. Bot 4 (bot4_executeOrders) Output Payload</span>
                  <span className="text-emerald-400 font-bold font-digital">
                    Ký quỹ cố định: 2.0 USDT / vị thế
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Nhận tín hiệu đã duyệt từ Bot 3. Kiểm tra số dư ký quỹ 2 USDT, đòn bẩy, áp dụng state machine và idempotency key để ngăn trùng lệnh. Giám sát Net PnL và tự động đóng lệnh khi có lãi ròng &gt; 0.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Trạng thái thực thi</div>
                    <div className="text-emerald-400 font-bold text-xs">{b4?.actionType || 'ORDER_OPENED'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Ký quỹ Margin</div>
                    <div className="text-amber-300 font-bold font-digital text-base">${b4?.marginUsdt || 2.0} USDT</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Đòn bẩy / Vốn danh nghĩa</div>
                    <div className="text-cyan-400 font-bold font-digital text-base">{b4?.leverage || 5}x (${b4?.notionalUsdt || 10.0})</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Phí Taker vào lệnh</div>
                    <div className="text-rose-400 font-bold font-digital text-base">-${b4?.openFeeUsdt?.toFixed(4) || '0.0060'}</div>
                  </div>
                </div>
              </div>

              {/* Open Position Monitoring */}
              {b4?.openPosition && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-2">Vị thế đang được Bot 4 giám sát theo sự kiện:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>Mã hợp đồng: <strong className="text-white">{b4.openPosition.symbol}</strong> ({b4.openPosition.side})</div>
                    <div>Giá vào lệnh: <strong className="text-white font-digital">${b4.openPosition.entryPrice}</strong></div>
                    <div>Giá hiện tại: <strong className="text-cyan-300 font-digital">${b4.openPosition.currentPrice}</strong></div>
                    <div>Lợi nhuận ròng (Net PnL): <strong className={`font-digital ${b4.openPosition.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${b4.openPosition.netPnL.toFixed(4)}</strong></div>
                    <div>Tổng chi phí sàn: <strong className="text-rose-400 font-digital">-${b4.openPosition.currentCosts.toFixed(4)}</strong></div>
                    <div>Đỉnh Net PnL (Peak): <strong className="text-amber-400 font-digital">${b4.openPosition.peakNetPnL.toFixed(4)}</strong></div>
                    <div>Trailing Stop: <strong className="text-gray-300">{b4.openPosition.trailingStopActive ? 'Đang bám sát' : 'Chờ kích hoạt'}</strong></div>
                    <div>Quy tắc thoát: <strong className="text-emerald-400">Net PnL &gt; $0.0001</strong></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BOT 5 PAYLOAD & ADAPTIVE FEEDBACK */}
          {activeTab === 4 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-rose-900/40 rounded-lg p-3">
                <div className="text-rose-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span>5. Bot 5 (bot5_runLossAnalysis) - Mổ xẻ Thua lỗ &amp; Phản hồi Bot 2</span>
                  <span className="text-purple-300 text-[11px]">
                    Vòng lặp tự học khép kín: <strong className="text-emerald-400">ACTIVE</strong>
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Nhận nhật ký lệnh đóng từ Bot 4. Tự động mổ xẻ nguyên nhân thua lỗ (Losing post-mortem) và tự động cập nhật tham số đầu vào cho Bot 2 để tránh lặp lại sai lầm.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Phân loại nguyên nhân</div>
                    <div className="text-rose-400 font-bold text-xs">{b5?.postMortem?.category?.replace(/_/g, ' ') || 'HEALTHY_WIN'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Mức độ nghiêm trọng</div>
                    <div className="text-amber-300 font-bold text-xs">{b5?.postMortem?.severity || 'LOW'}</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Tỷ lệ phí sàn ăn mòn</div>
                    <div className="text-rose-400 font-bold font-digital text-base">{((b5?.postMortem?.feeImpactRatio || 0) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="bg-[#121620] p-2 rounded border border-[#1f2430]">
                    <div className="text-gray-400 text-[10px]">Số lần tự chỉnh Bot 2</div>
                    <div className="text-purple-400 font-bold font-digital text-base">{b5?.metrics?.breakdownByCategory ? Object.values(b5.metrics.breakdownByCategory).reduce((a, b) => a + b, 0) : 1}</div>
                  </div>
                </div>
              </div>

              {/* Diagnosis Details */}
              {b5?.postMortem && (
                <div className="bg-[#0b0e14] border border-[#1f2430] rounded-lg p-3">
                  <div className="text-white font-bold text-xs mb-1">Chẩn đoán chuyên sâu (Post-Mortem Root Cause):</div>
                  <p className="text-rose-300 text-[11px] font-semibold mb-1">{b5.postMortem.rootCauseDescription}</p>
                  <p className="text-gray-400 text-[11px] leading-relaxed">{b5.postMortem.detailedAudit}</p>
                </div>
              )}

              {/* Parameter Adjustments to Bot 2 */}
              <div className="bg-[#161224] border border-purple-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-purple-300 font-bold text-xs">
                    Tác động điều chỉnh tham số đầu vào cho Bot 2 (Feedback Applied):
                  </div>
                  <button
                    onClick={onResetParams}
                    className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset về mặc định</span>
                  </button>
                </div>

                {b5?.feedbackToBot2.adjustments && b5.feedbackToBot2.adjustments.length > 0 ? (
                  <div className="space-y-1.5">
                    {b5.feedbackToBot2.adjustments.map((adj, idx) => (
                      <div key={idx} className="bg-[#0f0c1a] p-2 rounded border border-purple-900/40 text-[11px] flex items-center justify-between">
                        <div>
                          <strong className="text-cyan-400">{adj.parameterName}</strong>:{' '}
                          <span className="text-gray-400 line-through">{adj.previousValue}</span> &rarr;{' '}
                          <strong className="text-emerald-400">{adj.newValue}</strong>
                          <div className="text-gray-400 text-[10px]">{adj.reason}</div>
                        </div>
                        <span className="text-purple-400 text-[9px] font-bold">APPLIED</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 text-[11px]">
                    Chưa có điều chỉnh mới trong chu kỳ này. Lệnh gần nhất đạt kết quả tích cực hoặc không cần can thiệp.
                  </div>
                )}
              </div>

              {/* Quick Simulator Controls to test Bot 5 Post-Mortem in real-time */}
              <div className="bg-[#0b0e14] border border-gray-800 rounded-lg p-3">
                <div className="text-gray-300 font-bold text-xs mb-1.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Thử nghiệm mô phỏng các tình huống thất bại để xem Bot 5 tự học:</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    onClick={() => onSimulateLoss('SLIPPAGE_SPREAD_DRAG')}
                    className="px-2.5 py-1 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded cursor-pointer"
                  >
                    Mô phỏng Phí Sàn ăn mòn &rarr; Siết Spread
                  </button>
                  <button
                    onClick={() => onSimulateLoss('RSI_EXHAUSTION_REVERSAL')}
                    className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 rounded cursor-pointer"
                  >
                    Mô phỏng Đu Đỉnh RSI &rarr; Hạ trần RSI
                  </button>
                  <button
                    onClick={() => onSimulateLoss('ATR_EXPANSION_WHIPSAW')}
                    className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded cursor-pointer"
                  >
                    Mô phỏng Quét Stop Loss nhanh &rarr; Tăng điểm MTF
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRADINGAGENTS MULTI-AGENT DEBATE */}
          {activeTab === 5 && (
            <div className="space-y-3">
              <div className="bg-[#0b0e14] border border-amber-900/40 rounded-lg p-3">
                <div className="text-amber-400 font-bold text-xs mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    <span>TradingAgents Multi-Agent Debate Session (Tauric Research Architecture)</span>
                  </span>
                  <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded font-bold">
                    Bull vs Bear Tranh Biện Đối Kháng
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Cơ chế tranh biện 4 vai trò của TradingAgents: <strong>6 AI Specialists</strong> tổng hợp dữ liệu, <strong>Bull Agent</strong> tìm lý do Long, <strong>Bear Agent</strong> tìm lý do Short/Bẫy giá, <strong>Research Manager</strong> kiểm tra tính xác thực và phạt tin đồn vô căn cứ, <strong>Trader Agent</strong> ra quyết định tối thượng (LONG / SHORT / NO TRADE).
                </p>

                {debate ? (
                  <div className="mt-3 space-y-3">
                    {/* Research Manager Verdict Banner */}
                    <div className="p-2.5 rounded-lg border bg-[#121622] border-[#222a3d] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-gray-400 text-[10px] uppercase font-bold">Phán quyết từ Research Manager</div>
                        <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              debate.researchManagerAudit?.debateVerdict === 'BULL_CONVICTION'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : debate.researchManagerAudit?.debateVerdict === 'BEAR_CONVICTION'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : 'bg-gray-800 text-gray-300 border border-gray-700'
                            }`}
                          >
                            {debate.researchManagerAudit?.debateVerdict || 'DEADLOCK_NO_TRADE'}
                          </span>
                          <span className="text-gray-400 text-xs">
                            (Chênh lệch điểm: <strong className="text-white font-digital">{debate.researchManagerAudit?.consensusMargin > 0 ? '+' : ''}{debate.researchManagerAudit?.consensusMargin || 0}</strong>)
                          </span>
                        </div>
                      </div>

                      {/* Trader Agent Action */}
                      <div className="text-right">
                        <div className="text-gray-400 text-[10px] uppercase font-bold">Quyết định Trader Agent</div>
                        <div
                          className={`font-digital text-base font-bold ${
                            debate.traderDecision?.finalAction === 'LONG'
                              ? 'text-emerald-400'
                              : debate.traderDecision?.finalAction === 'SHORT'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {debate.traderDecision?.finalAction || 'NO_TRADE'}
                        </div>
                      </div>
                    </div>

                    {/* Summary Rationale */}
                    <div className="bg-[#141926] p-2 rounded text-[11px] text-gray-300 border border-[#222b40]">
                      <strong className="text-cyan-400">Luận điểm Trader Agent: </strong>
                      {debate.traderDecision?.tradingThesis || 'Không có tín hiệu giao dịch đủ sức thuyết phục.'}
                    </div>

                    {/* Side-by-Side: Bull Agent vs Bear Agent */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Bull Card */}
                      <div className="bg-[#0e161f] border border-emerald-900/50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-emerald-900/30 mb-2">
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>BULL AGENT (Ủng hộ MUA)</span>
                          </span>
                          <span className="text-emerald-300 font-digital text-xs bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                            Điểm: {debate.bullArgument?.convictionScore || 0}/100
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-300 mb-2 italic">
                          "{debate.bullArgument?.thesis || 'Đang quan sát'}"
                        </div>
                        <div className="space-y-1 text-[10px]">
                          {(debate.bullArgument?.structuralPoints || []).map((pt: string, idx: number) => (
                            <div key={idx} className="text-emerald-300 flex items-start gap-1">
                              <span>•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                          {(debate.bullArgument?.indicatorPoints || []).map((pt: string, idx: number) => (
                            <div key={idx} className="text-gray-300 flex items-start gap-1">
                              <span>•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-emerald-900/30 text-[10px] text-gray-400 flex justify-between">
                          <span>Mục tiêu TP: <strong className="text-emerald-400 font-digital">${debate.bullArgument?.upsideLiquidityTarget?.toFixed(4) || '--'}</strong></span>
                          <span>Đề xuất RR: <strong className="text-white font-digital">1 : {debate.bullArgument?.proposedRiskReward || '--'}</strong></span>
                        </div>
                      </div>

                      {/* Bear Card */}
                      <div className="bg-[#170f14] border border-rose-900/50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-rose-900/30 mb-2">
                          <span className="text-rose-400 font-bold flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>BEAR AGENT (Ủng hộ BÁN / Bẫy)</span>
                          </span>
                          <span className="text-rose-300 font-digital text-xs bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800">
                            Điểm: {debate.bearArgument?.convictionScore || 0}/100
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-300 mb-2 italic">
                          "{debate.bearArgument?.thesis || 'Đang quan sát'}"
                        </div>
                        <div className="space-y-1 text-[10px]">
                          {(debate.bearArgument?.riskAndTrapPoints || []).map((pt: string, idx: number) => (
                            <div key={idx} className="text-rose-300 flex items-start gap-1">
                              <span>•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                          {(debate.bearArgument?.structuralPoints || []).map((pt: string, idx: number) => (
                            <div key={idx} className="text-gray-300 flex items-start gap-1">
                              <span>•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-rose-900/30 text-[10px] text-gray-400 flex justify-between">
                          <span>Mục tiêu SL/TP: <strong className="text-rose-400 font-digital">${debate.bearArgument?.downsideLiquidityTarget?.toFixed(4) || '--'}</strong></span>
                          <span>Đề xuất RR: <strong className="text-white font-digital">1 : {debate.bearArgument?.proposedRiskReward || '--'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* 6 Specialized Analysts Grid */}
                    {debate.analystsSynthesis?.specialists && (
                      <div className="mt-3 bg-[#0d1017] p-2.5 rounded-lg border border-[#1f2430]">
                        <div className="text-gray-300 font-bold text-xs mb-2">Báo cáo từ 6 AI Analysts chuyên biệt:</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-blue-400 font-bold">1. Technical: </span>
                            <span className="text-white">{debate.analystsSynthesis.specialists.technical?.bias} (ADX: {debate.analystsSynthesis.specialists.technical?.adx14?.toFixed(1)})</span>
                          </div>
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-purple-400 font-bold">2. SMC Structure: </span>
                            <span className="text-white">{debate.analystsSynthesis.specialists.marketStructure?.structureBias}</span>
                          </div>
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-cyan-400 font-bold">3. Volume: </span>
                            <span className="text-white">RVOL {debate.analystsSynthesis.specialists.volume?.rvol?.toFixed(2)}x ({debate.analystsSynthesis.specialists.volume?.volumeTrend})</span>
                          </div>
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-amber-400 font-bold">4. Momentum: </span>
                            <span className="text-white">{debate.analystsSynthesis.specialists.momentum?.momentumState}</span>
                          </div>
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-rose-400 font-bold">5. Volatility: </span>
                            <span className="text-white">{debate.analystsSynthesis.specialists.volatility?.volatilityRegime} ({debate.analystsSynthesis.specialists.volatility?.squeezeStatus})</span>
                          </div>
                          <div className="p-1.5 bg-[#121620] rounded border border-gray-800">
                            <span className="text-emerald-400 font-bold">6. Sentiment: </span>
                            <span className="text-white">{debate.analystsSynthesis.specialists.sentiment?.fundingBias}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-500 text-xs">
                    Chưa có phiên tranh luận nào được thực hiện trong chu kỳ này. Hãy bấm "Chạy Chu kỳ" để khởi chạy TradingAgents multi-agent pipeline.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* JSON Payload Inspector Box */}
          <div className="bg-[#07090e] border border-[#1f2430] rounded-lg p-3 mt-4">
            <div className="flex items-center justify-between text-gray-400 text-[11px] mb-2">
              <span className="font-bold text-gray-300 flex items-center gap-1">
                <span>Dữ liệu Payload JSON chính xác (Live Contract Transfer):</span>
              </span>
              <button
                onClick={handleCopyJSON}
                className="px-2 py-1 bg-[#151923] hover:bg-[#202738] text-gray-300 rounded border border-gray-700 flex items-center gap-1 cursor-pointer transition"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép JSON'}</span>
              </button>
            </div>
            <pre className="bg-[#05060a] p-3 rounded border border-gray-900 font-mono text-[10px] text-emerald-300/90 overflow-x-auto max-h-56 leading-relaxed">
              {JSON.stringify(currentPayloadData || { message: 'Đang chờ chu kỳ pipeline hoàn thành...' }, null, 2)}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 bg-[#0a0d14] border-t border-[#1f2430] flex flex-wrap items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-2">
            <span>Chuỗi truyền tin: 1. Scan &rarr; 2. Analysis &rarr; 3. Net TP &rarr; 4. Execution &rarr; 5. Post-Mortem &rarr; 2. Bot 2</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1f2430] hover:bg-gray-700 text-white rounded font-medium cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
