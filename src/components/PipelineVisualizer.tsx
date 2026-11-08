import React from 'react';
import {
  ArrowRight,
  Database,
  Cpu,
  Zap,
  ShieldAlert,
  Repeat,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { CompletePipelineSnapshot } from '../types/pipeline';
import { BotState } from '../types/engine';

interface PipelineVisualizerProps {
  pipelineSnapshot?: CompletePipelineSnapshot;
  botState: BotState;
  onOpenStage: (stageIndex: number) => void;
  onOpenInspector: () => void;
  onTriggerCycle: () => void;
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = React.memo(({
  pipelineSnapshot,
  botState,
  onOpenStage,
  onOpenInspector,
  onTriggerCycle,
}) => {
  const b1 = pipelineSnapshot?.bot1Payload;
  const b2 = pipelineSnapshot?.bot2Payload;
  const b3 = pipelineSnapshot?.bot3Payload;
  const b4 = pipelineSnapshot?.bot4Payload;
  const b5 = pipelineSnapshot?.bot5Payload;

  const b2Params = b2?.activeParameters;

  return (
    <div className="bg-[#11141d] border border-[#1f2430] rounded-xl p-3.5 shadow-lg font-mono text-xs">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2430]/70 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Repeat className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
              Chuỗi Dữ liệu Chuyển giao 5-Bot (Fast Auto-Trading Engine • 60s Pipeline)
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 font-normal">
                Cycle #{pipelineSnapshot?.cycleNumber || 1}
              </span>
            </div>
            <div className="text-gray-400 text-[11px]">
              Dữ liệu tuần tự: Bot 1 quét giá Bitget &rarr; Bot 2 phân tích MTF 1m/5m &rarr; Bot 3 tính Lãi Ròng sau phí &rarr; Bot 4 ký quỹ 2 USDT &amp; Chốt lời nhanh Net PnL &gt; 0 &rarr; Bot 5 mổ xẻ lệnh &amp; tối ưu OOS
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onTriggerCycle}
            className="px-2.5 py-1.5 rounded-lg bg-[#1a202c] hover:bg-[#252d3d] text-gray-200 border border-gray-700 hover:border-gray-500 transition text-[11px] font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Kích hoạt Chu kỳ Ngay</span>
          </button>
          <button
            onClick={onOpenInspector}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold transition text-[11px] shadow-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Kiểm tra Payloads (Inspector)</span>
          </button>
        </div>
      </div>

      {/* 5-Node Interactive Pipeline Visualization */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 relative">
        {/* STAGE 1: Bot 1 (bot1_scanMarket) */}
        <div
          onClick={() => onOpenStage(0)}
          className="bg-[#0b0e14] border border-cyan-800/40 hover:border-cyan-400 rounded-lg p-2.5 transition cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-cyan-400 mb-1">
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                BOT 1
              </span>
              <span className="text-[9px] text-gray-500">bot1_scanMarket</span>
            </div>
            <div className="text-white font-semibold text-xs mb-1">Quét Bitget Futures</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Vũ trụ: <span className="text-gray-200">{b1?.universeTotal || 850}+ coin</span></div>
              <div>Đạt chuẩn: <span className="text-emerald-400 font-bold">{b1?.passedCount || 8} coin</span></div>
              <div className="truncate">Top: <strong className="text-cyan-300">{b1?.selectedCandidate?.symbol || botState.bot1.topCandidate || 'BTCUSDT'}</strong></div>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1f2430] text-[9px] text-cyan-400 flex items-center justify-between">
            <span>Payload: Giá &amp; Volume</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* STAGE 2: Bot 2 (bot2_analyzeTechnicals) */}
        <div
          onClick={() => onOpenStage(1)}
          className="bg-[#0b0e14] border border-blue-800/40 hover:border-blue-400 rounded-lg p-2.5 transition cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-400 mb-1">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                BOT 2
              </span>
              <span className="text-[9px] text-gray-500">bot2_analyzeTechnicals</span>
            </div>
            <div className="text-white font-semibold text-xs mb-1">Phân tích Kỹ thuật</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Xu hướng: <span className="text-blue-300 font-bold">{b2?.bias || botState.bot2.bias}</span></div>
              <div>Điểm MTF: <span className="text-amber-300 font-bold">{b2?.confidenceScore || botState.bot2.mtfScore}%</span></div>
              <div>Chỉ báo: <span className="text-gray-200">EMA, RSI, ATR, SMC</span></div>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1f2430] text-[9px] text-blue-400 flex items-center justify-between">
            <span>Payload: Kỹ thuật MTF</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* STAGE 3: Bot 3 (bot3_evaluateSignalAndNetTP) */}
        <div
          onClick={() => onOpenStage(2)}
          className="bg-[#0b0e14] border border-purple-800/40 hover:border-purple-400 rounded-lg p-2.5 transition cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-purple-400 mb-1">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                BOT 3
              </span>
              <span className="text-[9px] text-gray-500">bot3_evaluateSignalAndNetTP</span>
            </div>
            <div className="text-white font-semibold text-xs mb-1">Đánh giá &amp; Lãi Ròng</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Phí Taker: <span className="text-rose-400 font-bold">0.06% x 2</span></div>
              <div>Ma sát sàn: <span className="text-gray-200">{b3?.feeDeductions.totalFrictionBps || 16.5} bps</span></div>
              <div>Lãi ròng TP: <span className="text-emerald-400 font-bold font-digital">${b3?.feeDeductions.netTakeProfitPrice.toFixed(2) || '---'}</span></div>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1f2430] text-[9px] text-purple-400 flex items-center justify-between">
            <span>Payload: Tín hiệu đạt chuẩn</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* STAGE 4: Bot 4 (bot4_executeOrders) */}
        <div
          onClick={() => onOpenStage(3)}
          className="bg-[#0b0e14] border border-amber-800/40 hover:border-amber-400 rounded-lg p-2.5 transition cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 mb-1">
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                BOT 4
              </span>
              <span className="text-[9px] text-gray-500">bot4_executeOrders</span>
            </div>
            <div className="text-white font-semibold text-xs mb-1">Thực thi &amp; Chốt Lời</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Ký quỹ: <span className="text-amber-300 font-bold">2.0 USDT</span></div>
              <div>Mô phỏng: <span className="text-emerald-400 font-bold">Paper Trading</span></div>
              <div>Quy tắc: <span className="text-gray-200">Auto-Close Net &gt; 0</span></div>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1f2430] text-[9px] text-amber-400 flex items-center justify-between">
            <span>Payload: Nhật ký lệnh đóng</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* STAGE 5: Bot 5 (bot5_runLossAnalysis) */}
        <div
          onClick={() => onOpenStage(4)}
          className="bg-[#0b0e14] border border-rose-800/40 hover:border-rose-400 rounded-lg p-2.5 transition cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-rose-400 mb-1">
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                BOT 5
              </span>
              <span className="text-[9px] text-gray-500">bot5_runLossAnalysis</span>
            </div>
            <div className="text-white font-semibold text-xs mb-1">Mổ xẻ Lỗ &amp; Học hỏi</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Post-Mortem: <span className="text-gray-200">{b5?.postMortem?.category?.replace('_', ' ') || 'Sẵn sàng'}</span></div>
              <div>Phản hồi: <span className="text-purple-300 font-bold">Tự điều chỉnh Bot 2</span></div>
              <div>Tham số: <span className="text-emerald-400 font-bold">Ver v{b2Params?.version || 1}</span></div>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1f2430] text-[9px] text-rose-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Repeat className="w-2.5 h-2.5 text-purple-400" />
              <span>Feedback &rarr; Bot 2</span>
            </span>
            <span className="text-gray-500 font-mono text-[8px]">&larr; Vòng lặp</span>
          </div>
        </div>
      </div>

      {/* Dynamic Feedback Banner */}
      <div className="mt-2.5 pt-2 border-t border-[#1f2430]/60 flex flex-wrap items-center justify-between text-[11px] text-gray-400 gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50 text-[10px] font-bold flex items-center gap-1">
            <Repeat className="w-3 h-3 text-purple-400 animate-spin-slow" />
            Vòng lặp tự học Bot 5 &rarr; Bot 2 đang kích hoạt
          </span>
          <span className="text-gray-400 hidden sm:inline">
            Khi lệnh chạm Stop Loss hoặc bị phí ăn mòn, Bot 5 tự chẩn đoán nguyên nhân và siết/nới các ngưỡng RSI, ATR, Spread cho Bot 2.
          </span>
        </div>

        <div className="text-[10px] text-gray-400 flex items-center gap-2">
          <span>Tham số hiện tại:</span>
          <span className="text-gray-200">RSI Long &le; <strong className="text-cyan-400">{b2Params?.rsiLongMax || 68}</strong></span>
          <span>·</span>
          <span>Đệm ATR &ge; <strong className="text-emerald-400">{b2Params?.minAtrRatio || 1.8}x</strong></span>
          <span>·</span>
          <span>Spread &le; <strong className="text-amber-400">{b2Params?.maxAllowedSpreadBps || 5.0} bps</strong></span>
        </div>
      </div>
    </div>
  );
});
