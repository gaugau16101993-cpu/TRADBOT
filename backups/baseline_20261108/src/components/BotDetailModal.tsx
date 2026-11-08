import React from 'react';
import { X, Cpu, Search, LineChart, Target, ShieldCheck, GraduationCap, ArrowRight } from 'lucide-react';

interface BotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BotDetailModal: React.FC<BotDetailModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#11141d] border border-[#1f2430] rounded-xl max-w-2xl w-full p-5 shadow-2xl font-mono text-xs max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <Cpu className="w-4 h-4 text-emerald-400" />
            Kiến trúc Hệ thống 5-Bot Multi-Layer Scalping Pipeline
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 space-y-4 overflow-y-auto pr-2 flex-1">
          {/* BOT 1 */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-emerald-900/40">
            <div className="flex items-center justify-between text-emerald-400 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Search className="w-4 h-4 text-emerald-400" />
                BOT 1: Market Scanner &amp; Liquidity Screener
              </span>
              <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                Lớp 1 - Lọc thị trường
              </span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Quét toàn bộ hợp đồng tương lai USDT-M trên Bitget theo chu kỳ 60s. Phân tích khối lượng 24h &gt; $10M, spread bid-ask nhỏ nhất (&lt; 0.02%), và biến động ATR phù hợp với chiến lược scalping tốc độ cao.
            </p>
          </div>

          {/* BOT 2 */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-cyan-900/40">
            <div className="flex items-center justify-between text-cyan-400 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <LineChart className="w-4 h-4 text-cyan-400" />
                BOT 2: Multi-Timeframe (MTF) Trend &amp; Momentum
              </span>
              <span className="text-[10px] bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                Lớp 2 - Phân tích đa khung
              </span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Kiểm tra tính đồng thuận trên 3 khung thời gian: 15m (Xu hướng chính EMA 20/50), 5m (Động lượng RSI 14 &amp; MACD), 1m (Điểm xoay vi mô Micro-Structure). Chỉ khi đạt trên 70% độ đồng thuận mới chuyển dữ liệu sang Bot 3.
            </p>
          </div>

          {/* BOT 3 */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-purple-900/40">
            <div className="flex items-center justify-between text-purple-400 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-purple-400" />
                BOT 3: Signal Engine &amp; Entry Synthesizer
              </span>
              <span className="text-[10px] bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                Lớp 3 - Tạo tín hiệu
              </span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Tổng hợp điểm số từ Bot 1 và Bot 2, xác định hướng LONG hoặc SHORT, tính toán kích thước vị thế an toàn dựa trên số dư Paper (ví dụ margin $2.00 với đòn bẩy 10x-20x) và gửi lệnh tức thì tới Bot 4.
            </p>
          </div>

          {/* BOT 4 */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-amber-900/40">
            <div className="flex items-center justify-between text-amber-400 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                BOT 4: Net PnL Zero Execution &amp; Ultra-Fast Scalper
              </span>
              <span className="text-[10px] bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                Lớp 4 - Khớp lệnh &amp; Thoát lời
              </span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Trái tim của chiến lược: Quét giá thị trường real-time liên tục mỗi 800ms. Tính toán chi phí thực tế bao gồm Phí Mở (0.06%), Phí Đóng (0.06%), và Độ trượt giá Slippage (0.05%).
              <strong className="text-amber-300 block mt-1">
                Quy tắc vàng: Ngay khi Net PnL (Lợi nhuận ròng sau mọi chi phí) &gt; 0, Bot 4 tự động kích hoạt lệnh đóng thị trường ngay lập tức để chốt lời chắc chắn!
              </strong>
            </p>
          </div>

          {/* BOT 5 */}
          <div className="p-3 bg-[#080a0f] rounded-lg border border-rose-900/40">
            <div className="flex items-center justify-between text-rose-400 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-rose-400" />
                BOT 5: Post-Trade Audit &amp; Strategy Learner
              </span>
              <span className="text-[10px] bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
                Lớp 5 - Kiểm toán &amp; Học máy
              </span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Kiểm toán lại từng giao dịch đã đóng: Đo lường thời gian giữ lệnh trung bình, tỷ lệ hao hụt do phí (Fee Drag), tỷ lệ thắng (Win Rate %). Phản hồi ngược lại Bot 1 và Bot 3 để tinh chỉnh ngưỡng nhạy cảm thị trường.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#1f2430]">
          <span className="text-[10px] text-gray-500">Mô hình phân tán 5 lớp độc lập</span>
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
