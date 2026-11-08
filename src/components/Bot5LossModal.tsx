import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Repeat,
  RotateCcw,
  Sliders,
  TrendingDown,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Server,
  History,
  Check,
  ArrowRight,
  ShieldCheck,
  Layers,
  GitBranch,
  Cpu,
  BarChart2,
  Trophy,
  Swords,
  BookOpen,
  Target,
  Globe,
  Sparkles,
  ScrollText,
  Ban,
} from 'lucide-react';
import {
  Bot5LossAnalysisPayload,
  ParameterAdjustmentRecord,
  Bot2TunableParameters,
  OptimizationProposal,
  ModelParameterVersion,
} from '../types/pipeline';

interface Bot5LossModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerAnalyze?: () => void;
}

export const Bot5LossModal: React.FC<Bot5LossModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'CHALLENGER' | 'NO_TRADE' | 'EXTERNAL_AI' | 'JOURNAL' | 'PROPOSALS' | 'POST_MORTEM' | 'MATRICES' | 'SIMULATOR'>('EXTERNAL_AI');
  const [metrics, setMetrics] = useState<any>(null);
  const [history, setHistory] = useState<Bot5LossAnalysisPayload[]>([]);
  const [adjustments, setAdjustments] = useState<ParameterAdjustmentRecord[]>([]);
  const [proposals, setProposals] = useState<OptimizationProposal[]>([]);
  const [versionHistory, setVersionHistory] = useState<ModelParameterVersion[]>([]);
  const [challenger, setChallenger] = useState<any>(null);
  const [noTradeData, setNoTradeData] = useState<any>(null);
  const [journal, setJournal] = useState<any[]>([]);
  const [blockedSymbols, setBlockedSymbols] = useState<string[]>([]);
  const [externalAiAdvice, setExternalAiAdvice] = useState<any>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(false);
  const [nextConsultSeconds, setNextConsultSeconds] = useState<number>(900);
  const [consecutiveLosses, setConsecutiveLosses] = useState<number>(0);
  const [isConsultingAi, setIsConsultingAi] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'warning' } | null>(null);

  const fetchBot5Data = async () => {
    try {
      setLoading(true);
      const [resMetrics, resHist, resAdj, resProp, resVer, resChall, resNT, resJourn, resExtAi] = await Promise.all([
        fetch('/api/engine/bot5/metrics'),
        fetch('/api/engine/bot5/history'),
        fetch('/api/engine/bot5/adjustments'),
        fetch('/api/engine/bot5/proposals'),
        fetch('/api/engine/bot5/versions'),
        fetch('/api/engine/bot5/challenger'),
        fetch('/api/engine/bot5/no-trade'),
        fetch('/api/engine/bot5/journal'),
        fetch('/api/engine/bot5/external-ai'),
      ]);

      if (resMetrics.ok) setMetrics(await resMetrics.json());
      if (resHist.ok) setHistory(await resHist.json());
      if (resAdj.ok) setAdjustments(await resAdj.json());
      if (resProp.ok) setProposals(await resProp.json());
      if (resVer.ok) setVersionHistory(await resVer.json());
      if (resChall.ok) setChallenger(await resChall.json());
      if (resNT.ok) setNoTradeData(await resNT.json());
      if (resJourn.ok) {
        const jData = await resJourn.json();
        setJournal(jData.journal || []);
        setBlockedSymbols(jData.blockedSymbols || []);
      }
      if (resExtAi.ok) {
        const aiData = await resExtAi.json();
        setExternalAiAdvice(aiData.advice);
        setApiKeyConfigured(aiData.apiKeyConfigured);
        if (aiData.nextConsultCountdownSeconds !== undefined) {
          setNextConsultSeconds(aiData.nextConsultCountdownSeconds);
        }
        if (aiData.consecutiveLossCount !== undefined) {
          setConsecutiveLosses(aiData.consecutiveLossCount);
        }
      }
    } catch (e) {
      console.error('Failed to load Bot 5 data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBot5Data();
      const interval = setInterval(fetchBot5Data, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleApplyProposal = async (proposalId: string) => {
    try {
      const res = await fetch('/api/engine/bot5/apply-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, comment: 'Phê duyệt từ bảng điều khiển AI Reviewer' }),
      });
      if (res.ok) {
        setActionMessage({ text: `Đã phê duyệt và áp dụng thành công đề xuất ${proposalId}!`, type: 'success' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      }
    } catch (e) {
      console.error('Apply proposal failed:', e);
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    try {
      const res = await fetch('/api/engine/bot5/reject-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, reason: 'Từ chối bởi người dùng' }),
      });
      if (res.ok) {
        setActionMessage({ text: `Đã từ chối đề xuất ${proposalId}.`, type: 'warning' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      }
    } catch (e) {
      console.error('Reject proposal failed:', e);
    }
  };

  const handleRollback = async (targetVersion: string) => {
    try {
      const res = await fetch('/api/engine/bot5/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      });
      if (res.ok) {
        setActionMessage({ text: `Đã rollback thành công hệ thống về phiên bản ${targetVersion}!`, type: 'success' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      }
    } catch (e) {
      console.error('Rollback failed:', e);
    }
  };

  const handlePromoteChallenger = async () => {
    try {
      const res = await fetch('/api/engine/bot5/promote-challenger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Thăng hạng thủ công bởi người dùng từ giao diện' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: `Đã thăng hạng thành công Paper Challenger lên phiên bản Champion ${data.currentVersion}!`, type: 'success' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      } else {
        setActionMessage({ text: 'Challenger chưa đạt đủ điều kiện an toàn (10 lệnh OOS, WR >= 50%, Net PnL > 0).', type: 'warning' });
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (e) {
      console.error('Promote challenger error:', e);
    }
  };

  const handleSimulateLoss = async (category: string) => {
    try {
      const res = await fetch('/api/engine/bot5/simulate-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      if (res.ok) {
        fetchBot5Data();
      }
    } catch (e) {
      console.error('Simulation failed:', e);
    }
  };

  const handleResetParams = async () => {
    try {
      const res = await fetch('/api/engine/bot5/reset-params', { method: 'POST' });
      if (res.ok) {
        setActionMessage({ text: 'Đã thiết lập lại các tham số về mặc định v1.0.0.', type: 'warning' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      }
    } catch (e) {
      console.error('Reset failed:', e);
    }
  };

  const handleConsultGemini = async () => {
    try {
      setIsConsultingAi(true);
      const res = await fetch('/api/engine/bot5/consult-ai', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.result) {
        setExternalAiAdvice(data.result);
        setActionMessage({ text: 'Đã nhận thành công khuyến nghị chiến lược từ Google Gemini 3.8 Flash (Web Search Grounding)!', type: 'success' });
        setTimeout(() => setActionMessage(null), 4000);
        fetchBot5Data();
      } else {
        setActionMessage({ text: data.error || 'Tham vấn thất bại hoặc chưa có API Key', type: 'warning' });
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (e: any) {
      console.error('Consult AI error:', e);
      setActionMessage({ text: e.message, type: 'warning' });
    } finally {
      setIsConsultingAi(false);
    }
  };

  if (!isOpen) return null;

  const currentParams: Bot2TunableParameters | undefined = metrics?.currentParameters;
  const currentVersion = metrics?.currentModelVersion || 'v1.0.0';
  const pendingProposals = proposals.filter((p) => p.status === 'PENDING_APPROVAL');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 animate-fadeIn">
      <div className="bg-[#0e111a] border border-[#1f2430] rounded-xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl font-mono text-xs overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f2430] bg-[#090b12]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-800/50 shadow-sm">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-white font-bold text-sm flex items-center gap-2">
                <span>Bot 5 — AI Trade Review &amp; Self-Learning Engine</span>
                <span className="bg-purple-900/60 text-purple-300 border border-purple-700/60 px-2 py-0.2 rounded text-[10px] font-mono">
                  {currentVersion}
                </span>
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.2 rounded text-[10px] flex items-center gap-1">
                  <Server className="w-3 h-3 animate-ping" />
                  24/7 DAEMON
                </span>
              </div>
              <div className="text-gray-400 text-[11px]">
                Kiểm toán lệnh thắng/thua, phân tích đa khung MTF, kiểm định OOS chống overfitting &amp; tự tối ưu tham số an toàn
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetParams}
              className="px-2.5 py-1 bg-[#161a24] hover:bg-gray-800 text-gray-300 rounded border border-gray-700 text-[11px] flex items-center gap-1 cursor-pointer transition"
              title="Đặt lại tham số về v1.0.0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset v1.0.0</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 24/7 Server Persistence Status Bar */}
        <div className="bg-gradient-to-r from-emerald-950/60 via-[#10141f] to-purple-950/60 border-b border-[#1f2430] px-5 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="font-semibold text-white">CHẠY NGẦM 24/7 TRÊN MÁY CHỦ:</span>
            <span className="text-gray-300">Đóng trình duyệt bot vẫn tự động kiểm toán, ghi sổ kép và tự tối ưu OOS.</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Đề xuất chờ duyệt: <strong className="text-amber-400 font-digital">{pendingProposals.length}</strong></span>
            <span className="text-gray-600">|</span>
            <span>Tổng phiên bản mô hình: <strong className="text-cyan-400 font-digital">{versionHistory.length}</strong></span>
          </div>
        </div>

        {/* Action toast if any */}
        {actionMessage && (
          <div className={`px-5 py-2 text-[11px] font-semibold flex items-center justify-between ${
            actionMessage.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-b border-emerald-800' : 'bg-amber-950 text-amber-300 border-b border-amber-800'
          }`}>
            <span>{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-gray-400 hover:text-white">&times;</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1f2430] bg-[#0a0d14] px-4 pt-2 gap-1 text-[11px] overflow-x-auto">
          <button
            onClick={() => setActiveTab('EXTERNAL_AI')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'EXTERNAL_AI'
                ? 'bg-[#121622] text-cyan-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>External AI (Gemini 🌐)</span>
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-1.5 py-0.2 rounded text-[9px] font-bold animate-pulse">
              TỰ ĐỘNG 100%
            </span>
          </button>

          <button
            onClick={() => setActiveTab('JOURNAL')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'JOURNAL'
                ? 'bg-[#121622] text-emerald-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nhật Ký Tri Thức ({journal.length})</span>
            {blockedSymbols.length > 0 && (
              <span className="bg-rose-950 text-rose-300 border border-rose-800/60 px-1.5 py-0.2 rounded text-[9px]">
                {blockedSymbols.length} KHÓA
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('CHALLENGER')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'CHALLENGER'
                ? 'bg-[#121622] text-amber-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            <span>Paper Challenger ⚔️ Champion</span>
            {challenger?.status === 'PROMOTION_READY' && (
              <span className="bg-emerald-500 text-black font-bold px-1.5 py-0.2 rounded-full text-[9px] animate-bounce">
                SẴN SÀNG
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('NO_TRADE')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'NO_TRADE'
                ? 'bg-[#121622] text-sky-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Dữ Liệu Học NO_TRADE ({noTradeData?.metrics?.totalNoTradeEvaluations || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('PROPOSALS')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
              activeTab === 'PROPOSALS'
                ? 'bg-[#121622] text-purple-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-purple-400" />
            <span>Đề Xuất OOS &amp; Phiên Bản</span>
            {pendingProposals.length > 0 && (
              <span className="bg-amber-500 text-black font-bold px-1.5 py-0.2 rounded-full text-[9px] animate-pulse">
                {pendingProposals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('POST_MORTEM')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
              activeTab === 'POST_MORTEM'
                ? 'bg-[#121622] text-rose-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Kiểm Toán Mổ Xẻ MTF</span>
          </button>

          <button
            onClick={() => setActiveTab('MATRICES')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
              activeTab === 'MATRICES'
                ? 'bg-[#121622] text-cyan-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ma Trận Coin</span>
          </button>

          <button
            onClick={() => setActiveTab('SIMULATOR')}
            className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
              activeTab === 'SIMULATOR'
                ? 'bg-[#121622] text-amber-300 border-[#2a3042] border-b-transparent shadow-sm'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Thử Nghiệm</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a0d14]">
          {/* Top KPI Metrics Cards (6-columns) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Lệnh đã kiểm toán</div>
              <div className="text-white font-bold font-digital text-lg">
                {metrics?.totalTradesAudited || 0}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {metrics?.totalWins || 0}W / {metrics?.totalLosses || 0}L
              </div>
            </div>

            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Win Rate Ròng</div>
              <div className="text-emerald-400 font-bold font-digital text-lg">
                {metrics?.winRatePct || 100}%
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Sau 100% phí sàn</div>
            </div>

            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Net PnL Tích Lũy</div>
              <div className={`font-bold font-digital text-lg ${metrics?.totalRealizedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics?.totalRealizedNetProfit >= 0 ? '+' : ''}${metrics?.totalRealizedNetProfit?.toFixed(4) || '0.0000'}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Paper Capital: 100 USDT</div>
            </div>

            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Phí sàn đã trừ</div>
              <div className="text-rose-400 font-bold font-digital text-lg">
                -${metrics?.totalFeeFrictionAbsorbed?.toFixed(4) || '0.0000'}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Taker + Trượt giá</div>
            </div>

            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Kỳ Vọng Toán Học</div>
              <div className={`font-bold font-digital text-lg ${(metrics?.expectancy || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(metrics?.expectancy || 0) >= 0 ? '+' : ''}${metrics?.expectancy?.toFixed(3) || '0.000'}/lệnh
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">PF: {metrics?.profitFactor ? metrics.profitFactor.toFixed(2) : 'N/A'}</div>
            </div>

            <div className="bg-[#121622] p-3 rounded-xl border border-[#1f2430]">
              <div className="text-gray-400 text-[10px] uppercase">Coin Tạm Khóa</div>
              <div className="text-amber-400 font-bold font-digital text-lg flex items-center gap-1">
                <Ban className="w-4 h-4 text-rose-400" />
                <span>{blockedSymbols.length}</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={blockedSymbols.join(', ') || 'Không có coin nào'}>
                {blockedSymbols.length > 0 ? blockedSymbols.join(', ') : 'Tất cả đạt chuẩn'}
              </div>
            </div>
          </div>

          {/* TAB: EXTERNAL AI LEARNING (GEMINI 3.8 FLASH + GOOGLE SEARCH GROUNDING) */}
          {activeTab === 'EXTERNAL_AI' && (
            <div className="space-y-4">
              {/* External AI Hero Card */}
              <div className="bg-gradient-to-r from-cyan-950/50 via-[#121622] to-purple-950/50 border border-cyan-800/60 rounded-xl p-4 shadow-lg space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-700/60 shadow-inner">
                      <Globe className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-bold text-sm">
                          MEO AI v2.2 — CƠ CHẾ HỌC EXTERNAL AI (GEMINI 3.8 FLASH)
                        </h4>
                        <span className="bg-cyan-900/80 text-cyan-300 border border-cyan-600/60 px-2 py-0.5 rounded text-[10px] font-mono">
                          gemini-3.8-flash
                        </span>
                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold">
                          <Sparkles className="w-3 h-3" />
                          GOOGLE SEARCH GROUNDING
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Tự động tìm kiếm web các chiến lược định lượng phái sinh mới nhất, phân tích chế độ thị trường và cung cấp giải pháp khắc phục lệnh thua.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConsultGemini}
                    disabled={isConsultingAi}
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md ${
                      isConsultingAi
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 cursor-not-allowed opacity-80'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                    }`}
                  >
                    {isConsultingAi ? (
                      <>
                        <RotateCcw className="w-4 h-4 animate-spin text-cyan-300" />
                        <span>Đang Tìm Kiếm &amp; Tham Vấn AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Tham Vấn Gemini AI Ngay</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 24/7 Autonomous Control Status Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] bg-[#0a0d14] p-3 rounded-lg border border-cyan-800/60 shadow-inner">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                    <div>
                      <div className="text-gray-400 text-[10px] uppercase font-semibold">Tự động định kỳ 15 phút</div>
                      <div className="text-white font-bold font-digital text-sm">
                        Kế tiếp sau: <span className="text-cyan-400 font-bold">{Math.floor(nextConsultSeconds / 60)}:{(nextConsultSeconds % 60).toString().padStart(2, '0')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-3">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${consecutiveLosses >= 1 ? 'text-amber-400' : 'text-gray-500'}`} />
                    <div>
                      <div className="text-gray-400 text-[10px] uppercase font-semibold">Khẩn cấp chuỗi thua liên tiếp</div>
                      <div className="text-white font-bold font-digital text-sm">
                        Hiện tại: <span className={consecutiveLosses >= 2 ? 'text-rose-400 font-bold animate-pulse' : 'text-amber-300'}>{consecutiveLosses}/2</span> lệnh thua
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-3">
                    <Swords className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-gray-400 text-[10px] uppercase font-semibold">Đồng bộ Paper Challenger</div>
                      <div className="text-purple-300 font-bold text-xs truncate">
                        Tự nạp OOS 100% tự động
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Latest AI Strategy Advice Card */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white text-xs">Khuyến Nghị Chiến Lược Gần Nhất Từ External AI</span>
                  </div>
                  {externalAiAdvice?.isoTime && (
                    <span className="text-[10px] text-gray-500 font-mono">
                      {new Date(externalAiAdvice.isoTime).toLocaleString('vi-VN')}
                    </span>
                  )}
                </div>

                {externalAiAdvice ? (
                  <div className="space-y-3">
                    <div className="bg-[#0a0d14] p-3.5 rounded-lg border border-cyan-900/40 text-gray-200 leading-relaxed text-xs">
                      {externalAiAdvice.advice}
                    </div>

                    {/* Google Grounding Web Queries */}
                    {externalAiAdvice.groundingSearchQueries && externalAiAdvice.groundingSearchQueries.length > 0 && (
                      <div className="space-y-1.5 bg-[#0e121d] p-3 rounded-lg border border-gray-800">
                        <div className="text-[10px] uppercase text-cyan-400 font-semibold flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />
                          <span>Google Search Queries Đã Thực Thi (Live Grounding):</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {externalAiAdvice.groundingSearchQueries.map((q: string, idx: number) => (
                            <span key={idx} className="bg-[#181f2f] text-gray-300 border border-gray-700 px-2 py-0.5 rounded text-[10px]">
                              🔍 {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-[#0a0d14] p-2.5 rounded-lg border border-gray-800">
                      <div>
                        <span className="text-gray-500">Chế độ thị trường:</span>
                        <div className="text-amber-300 font-bold">{externalAiAdvice.marketRegime || 'TREND/SIDEWAY'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Win Rate lúc tham vấn:</span>
                        <div className="text-emerald-400 font-bold font-digital">{externalAiAdvice.stats?.winRatePct || 100}%</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Profit Factor:</span>
                        <div className="text-cyan-400 font-bold font-digital">{externalAiAdvice.stats?.profitFactor || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Kỳ vọng:</span>
                        <div className="text-purple-400 font-bold font-digital">${externalAiAdvice.stats?.expectancy || 0}/lệnh</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-500 space-y-2">
                    <Globe className="w-8 h-8 mx-auto text-gray-600 opacity-50" />
                    <p className="text-xs">Chưa có dữ liệu tham vấn từ Gemini AI.</p>
                    <p className="text-[11px] text-gray-600">
                      Nhấn nút <strong className="text-cyan-400">"Tham Vấn Gemini AI Ngay"</strong> ở trên để AI tìm kiếm giải pháp tối ưu cho chu kỳ này.
                    </p>
                  </div>
                )}
              </div>

              {/* Dynamic Market Regimes ATR Multipliers (MEO AI v2.2) */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span>Bộ Hệ Số Co Giãn ATR Theo Chế Độ Thị Trường (Regime Matrix)</span>
                  </h4>
                  <span className="text-gray-500 text-[10px]">Tự động thích ứng</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-[#0a0d14] p-3 rounded-lg border border-purple-900/40">
                    <div className="text-purple-400 font-bold flex items-center justify-between">
                      <span>TREND (Xu Hướng)</span>
                      <span className="text-[10px] text-gray-500">ADX &ge; 22</span>
                    </div>
                    <div className="text-gray-400 text-[11px] mt-1">SL: 1.5x ATR • TP: 3.0x ATR</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Mục tiêu ăn trọn sóng xu hướng chính</div>
                  </div>

                  <div className="bg-[#0a0d14] p-3 rounded-lg border border-sky-900/40">
                    <div className="text-sky-400 font-bold flex items-center justify-between">
                      <span>SIDEWAY (Đi Ngang)</span>
                      <span className="text-[10px] text-gray-500">ADX &lt; 20</span>
                    </div>
                    <div className="text-gray-400 text-[11px] mt-1">SL: 1.2x ATR • TP: 2.2x ATR</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Chốt lời nhanh, giảm thiểu thời gian ngâm lệnh</div>
                  </div>

                  <div className="bg-[#0a0d14] p-3 rounded-lg border border-amber-900/40">
                    <div className="text-amber-400 font-bold flex items-center justify-between">
                      <span>VOLATILE (Biến Động)</span>
                      <span className="text-[10px] text-gray-500">ATR &gt; 1.2%</span>
                    </div>
                    <div className="text-gray-400 text-[11px] mt-1">SL: 2.0x ATR • TP: 4.0x ATR</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Biên độ đệm rộng chống râu nến quét SL</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: KNOWLEDGE JOURNAL & SELF-LEARNING STREAM */}
          {activeTab === 'JOURNAL' && (
            <div className="space-y-4">
              {/* Blocked Symbols Panel */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <h4 className="text-white font-bold text-xs">Danh Sách Coin Tạm Khóa (Hiệu Suất Dưới Chuẩn)</h4>
                  </div>
                  <span className="text-gray-400 text-[11px]">
                    Điều kiện khóa: &ge; 6 lệnh, PnL âm và Win Rate &lt; 30%
                  </span>
                </div>

                {blockedSymbols.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {blockedSymbols.map((sym) => (
                      <div key={sym} className="bg-rose-950/60 border border-rose-800 text-rose-300 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2">
                        <span className="font-bold">{sym}</span>
                        <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-rose-400">TẠM KHÓA</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#0a0d14] p-3 rounded-lg border border-gray-800 text-gray-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Không có coin nào bị khóa. Tất cả các cặp đều đạt chuẩn tỷ lệ thắng và biên lợi nhuận ròng.</span>
                  </div>
                )}
              </div>

              {/* Journal Event Stream */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <div className="flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-white font-bold text-xs">Dòng Sự Kiện Học Hỏi (Knowledge Stream)</h4>
                  </div>
                  <span className="text-gray-500 text-[10px]">Lưu giữ 60 sự kiện tự học gần nhất</span>
                </div>

                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {journal.length > 0 ? (
                    journal.map((item) => {
                      const badgeColor =
                        item.source === 'EXTERNAL_AI'
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                          : item.source === 'SELF_LEARN'
                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                          : item.source === 'PARAM_AUDIT'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-gray-800 text-gray-300 border-gray-700';

                      return (
                        <div key={item.id} className="bg-[#0a0d14] p-2.5 rounded-lg border border-gray-800 flex items-start gap-2.5 hover:border-gray-700 transition">
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono shrink-0 ${badgeColor}`}>
                            {item.source}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-200 text-xs leading-snug">{item.msg}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-1">
                              {new Date(item.timestamp).toLocaleTimeString('vi-VN')} — {new Date(item.timestamp).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-xs">
                      Chưa có sự kiện nào trong nhật ký tri thức.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 0: PAPER CHALLENGER VS CHAMPION ARCHITECTURE */}
          {activeTab === 'CHALLENGER' && (
            <div className="space-y-4">
              {/* Header Status Card */}
              <div className="bg-gradient-to-r from-amber-950/40 via-[#121622] to-purple-950/40 border border-amber-800/50 rounded-xl p-4 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Swords className="w-5 h-5 text-amber-400 animate-pulse" />
                    <div>
                      <h4 className="text-white font-bold text-xs flex items-center gap-2">
                        <span>KIẾN TRÚC CHAMPION VS PAPER CHALLENGER</span>
                        <span className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold ${
                          challenger?.status === 'PROMOTION_READY'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60 animate-bounce'
                            : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                        }`}>
                          {challenger?.status || 'FORWARD_TESTING'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Challenger chạy ngầm song song trên dữ liệu Bitget thật. Chỉ thăng hạng khi hoàn thành 10 lệnh OOS vượt trội Champion.
                      </p>
                    </div>
                  </div>

                  {/* Promote Challenger Button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePromoteChallenger}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                        challenger?.status === 'PROMOTION_READY' || (challenger?.forwardTestTradesCount || 0) >= 3
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                      }`}
                      title="Áp dụng tham số của Challenger thành Champion sản xuất mới"
                    >
                      <Trophy className="w-4 h-4 text-amber-300" />
                      <span>Thăng Hạng Challenger Lên Champion</span>
                    </button>
                  </div>
                </div>

                {/* Progress bar towards 10 forward trades */}
                <div className="space-y-1 bg-[#0a0d14] p-2.5 rounded-lg border border-gray-800">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-400">Tiến độ kiểm thử Out-Of-Sample (Forward Testing):</span>
                    <span className="text-amber-400 font-digital font-bold">
                      {challenger?.forwardTestTradesCount || 0} / {challenger?.requiredSampleSize || 10} Lệnh Hoàn Tất
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((challenger?.forwardTestTradesCount || 0) / (challenger?.requiredSampleSize || 10)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Card: Champion (Production Active) */}
                <div className="bg-[#121622] border border-purple-800/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                    <span className="text-purple-300 font-bold flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      CHAMPION HIỆN TẠI ({currentVersion})
                    </span>
                    <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800">
                      SẢN XUẤT (LIVE PAPER)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Win Rate:</span>
                      <div className="text-emerald-400 font-digital font-bold text-sm">
                        {metrics?.winRatePct || 100}%
                      </div>
                    </div>
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Net PnL:</span>
                      <div className={`font-digital font-bold text-sm ${metrics?.totalRealizedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {metrics?.totalRealizedNetProfit >= 0 ? '+' : ''}${metrics?.totalRealizedNetProfit?.toFixed(4) || '0.0000'}
                      </div>
                    </div>
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Lệnh đóng:</span>
                      <div className="text-white font-digital font-bold text-sm">
                        {metrics?.totalTradesAudited || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#0b0e14] rounded border border-gray-800 space-y-1.5 text-[11px]">
                    <div className="text-gray-400 font-bold text-[10px]">Tham số hoạt động chính:</div>
                    <div className="flex justify-between text-gray-300">
                      <span>Điểm tin cậy tối thiểu:</span>
                      <span className="text-white font-digital">{currentParams?.minConfidenceScore || 75}%</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Trần spread tối đa:</span>
                      <span className="text-white font-digital">{currentParams?.maxAllowedSpreadBps || 3.0} bps</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Tỷ lệ ATR bảo vệ:</span>
                      <span className="text-white font-digital">{currentParams?.minAtrRatio || 1.8}x</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Ngưỡng xu hướng ADX:</span>
                      <span className="text-white font-digital">{currentParams?.adxTrendThreshold || 22}</span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Paper Challenger */}
                <div className="bg-[#121622] border border-amber-800/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                    <span className="text-amber-300 font-bold flex items-center gap-1.5 text-xs">
                      <Swords className="w-4 h-4 text-amber-400" />
                      PAPER CHALLENGER ({challenger?.version || 'v1.1.0-CHALLENGER'})
                    </span>
                    <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                      SHADOW TEST
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Win Rate OOS:</span>
                      <div className="text-amber-400 font-digital font-bold text-sm">
                        {challenger?.metrics?.winRatePct || 0}%
                      </div>
                    </div>
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Net PnL OOS:</span>
                      <div className={`font-digital font-bold text-sm ${challenger?.metrics?.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {challenger?.metrics?.netPnL >= 0 ? '+' : ''}${challenger?.metrics?.netPnL?.toFixed(4) || '0.0000'}
                      </div>
                    </div>
                    <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                      <span className="text-gray-500">Profit Factor:</span>
                      <div className="text-cyan-400 font-digital font-bold text-sm">
                        {challenger?.metrics?.profitFactor || 1.0}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#0b0e14] rounded border border-gray-800 space-y-1.5 text-[11px]">
                    <div className="text-gray-400 font-bold text-[10px]">Tham số tối ưu đề xuất:</div>
                    <div className="flex justify-between text-gray-300">
                      <span>Điểm tin cậy tối thiểu:</span>
                      <span className="text-amber-300 font-digital">{challenger?.proposedParameters?.minConfidenceScore || 78}%</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Trần spread tối đa:</span>
                      <span className="text-amber-300 font-digital">{challenger?.proposedParameters?.maxAllowedSpreadBps || 2.8} bps</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Biên lợi nhuận ròng kỳ vọng:</span>
                      <span className="text-amber-300 font-digital">+{challenger?.targetNetEdgeBps || 18.0} bps</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Vị thế ảo đang mở:</span>
                      <span className="text-cyan-400 font-digital">{challenger?.virtualPositions?.length || 0} lệnh</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Challenger Virtual Positions & Recent Forward Test History */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                  <span className="text-white font-bold text-xs flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                    Lịch Sử Lệnh Thử Nghiệm Out-Of-Sample của Paper Challenger
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Khớp trên giá Bitget thật, tính toán 100% phí Taker &amp; trượt giá
                  </span>
                </div>

                {challenger?.forwardTestHistory && challenger.forwardTestHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-800 text-[10px]">
                          <th className="pb-1.5">Thời gian</th>
                          <th className="pb-1.5">Coin</th>
                          <th className="pb-1.5">Hướng</th>
                          <th className="pb-1.5">Entry</th>
                          <th className="pb-1.5">Exit</th>
                          <th className="pb-1.5">Phí sàn</th>
                          <th className="pb-1.5">Net PnL</th>
                          <th className="pb-1.5">Lý do đóng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-mono">
                        {challenger.forwardTestHistory.map((tr: any) => (
                          <tr key={tr.tradeId} className="hover:bg-gray-800/30">
                            <td className="py-1 text-gray-400">{new Date(tr.timestamp).toLocaleTimeString()}</td>
                            <td className="py-1 font-bold text-white">{tr.symbol}</td>
                            <td className={`py-1 font-bold ${tr.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tr.side}
                            </td>
                            <td className="py-1 text-gray-300">${tr.entryPrice}</td>
                            <td className="py-1 text-gray-300">${tr.exitPrice}</td>
                            <td className="py-1 text-rose-400">-${tr.fees.toFixed(4)}</td>
                            <td className={`py-1 font-bold ${tr.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tr.netPnL >= 0 ? '+' : ''}${tr.netPnL.toFixed(4)}
                            </td>
                            <td className="py-1 text-gray-400 text-[10px]">{tr.closeReason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-4 text-center text-gray-500 text-[11px]">
                    Challenger đang theo dõi dữ liệu nến thật và chờ nhịp thị trường để mở vị thế thử nghiệm...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 0.5: NO_TRADE LEARNING DATASET */}
          {activeTab === 'NO_TRADE' && (
            <div className="space-y-4">
              <div className="bg-[#121622] border border-sky-800/50 rounded-xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-sky-400" />
                    <div>
                      <h4 className="text-white font-bold text-xs flex items-center gap-2">
                        <span>TẬP DỮ LIỆU HỌC TẬP NO_TRADE (BẢO VỆ VỐN 100%)</span>
                        <span className="bg-sky-950 text-sky-300 border border-sky-800/80 px-2 py-0.2 rounded text-[10px]">
                          DATASET ACTIVE
                        </span>
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Bot 5 ghi lại mọi tình huống thị trường bị từ chối để tối ưu hóa bộ lọc, tránh mở lệnh trong vùng nhiễu sideway.
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 uppercase">Phí &amp; rủi ro đã tránh:</div>
                    <div className="text-emerald-400 font-digital font-bold text-lg">
                      +${noTradeData?.metrics?.totalAvoidedFrictionUsdt?.toFixed(4) || '0.0000'} USDT
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div className="bg-[#0b0e14] p-2.5 rounded border border-gray-800">
                    <span className="text-gray-500">Tổng quyết định NO_TRADE:</span>
                    <div className="text-white font-digital font-bold text-base mt-0.5">
                      {noTradeData?.metrics?.totalNoTradeEvaluations || 0}
                    </div>
                  </div>
                  <div className="bg-[#0b0e14] p-2.5 rounded border border-gray-800">
                    <span className="text-gray-500">Tỷ lệ bảo toàn vốn:</span>
                    <div className="text-emerald-400 font-digital font-bold text-base mt-0.5">
                      100.0%
                    </div>
                  </div>
                  <div className="bg-[#0b0e14] p-2.5 rounded border border-gray-800">
                    <span className="text-gray-500">Lý do từ chối chính:</span>
                    <div className="text-amber-400 font-semibold truncate mt-0.5">
                      Net Edge &lt; 15 bps / Spread
                    </div>
                  </div>
                  <div className="bg-[#0b0e14] p-2.5 rounded border border-gray-800">
                    <span className="text-gray-500">Sổ lưu trữ vĩnh viễn:</span>
                    <div className="text-cyan-400 font-mono text-[9px] truncate mt-0.5">
                      no_trade_learning.jsonl
                    </div>
                  </div>
                </div>
              </div>

              {/* Table of recent NO_TRADE records */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                  <span className="text-white font-bold text-xs">
                    Chi Tiết Các Tín Hiệu Bị Từ Chối &amp; Bài Học Rút Ra
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Lưu vết 100% điều kiện kỹ thuật tại thời điểm quét
                  </span>
                </div>

                {noTradeData?.history && noTradeData.history.length > 0 ? (
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-[#121622]">
                        <tr className="text-gray-500 border-b border-gray-800 text-[10px]">
                          <th className="pb-1.5">Thời gian</th>
                          <th className="pb-1.5">Coin</th>
                          <th className="pb-1.5">Lý do từ chối</th>
                          <th className="pb-1.5">Spread</th>
                          <th className="pb-1.5">Net Edge</th>
                          <th className="pb-1.5">R:R</th>
                          <th className="pb-1.5">RSI 5m</th>
                          <th className="pb-1.5">Chi tiết kiểm toán</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-mono">
                        {noTradeData.history.map((nt: any) => (
                          <tr key={nt.id} className="hover:bg-gray-800/30">
                            <td className="py-1 text-gray-400">{new Date(nt.timestamp).toLocaleTimeString()}</td>
                            <td className="py-1 font-bold text-white">{nt.symbol}</td>
                            <td className="py-1 text-amber-300 font-semibold">{nt.primaryReason}</td>
                            <td className="py-1 text-gray-300">{nt.spreadBps.toFixed(1)} bps</td>
                            <td className="py-1 text-rose-400">+{nt.expectedNetEdgeBps.toFixed(1)} bps</td>
                            <td className="py-1 text-gray-300">1:{nt.riskRewardRatio.toFixed(1)}</td>
                            <td className="py-1 text-cyan-300">{nt.rsi5m.toFixed(1)}</td>
                            <td className="py-1 text-gray-400 text-[10px] max-w-xs truncate">{nt.detailedAudit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-4 text-center text-gray-500 text-[11px]">
                    Đang theo dõi chu kỳ quét 60s để ghi nhận dữ liệu học tập...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: PROPOSALS & MODEL VERSIONING */}
          {activeTab === 'PROPOSALS' && (
            <div className="space-y-4">
              {/* Active Proposals Section */}
              <div className="bg-[#121622] border border-purple-800/40 rounded-xl p-4 shadow-md">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1f2430]">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-bold text-xs">
                      Đề Xuất Cải Tiến Tham Số OOS Đang Chờ Phê Duyệt (Pending Optimization Proposals)
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    Chống Overfitting: Tách mẫu 70% In-Sample / 30% Out-Of-Sample
                  </span>
                </div>

                {pendingProposals.length > 0 ? (
                  <div className="space-y-3">
                    {pendingProposals.map((prop) => (
                      <div
                        key={prop.proposalId}
                        className="bg-[#0b0e14] border border-purple-600/40 rounded-lg p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{prop.proposalId}</span>
                            <span className="bg-purple-950 text-purple-300 border border-purple-700/60 px-2 py-0.2 rounded text-[10px]">
                              Đích: {prop.modelTargetVersion}
                            </span>
                            <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                              prop.oosReport.status === 'PASSED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                            }`}>
                              OOS: {prop.oosReport.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRejectProposal(prop.proposalId)}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded cursor-pointer transition text-[11px]"
                            >
                              Từ chối
                            </button>
                            <button
                              onClick={() => handleApplyProposal(prop.proposalId)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded cursor-pointer transition shadow-md flex items-center gap-1 text-[11px]"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Phê duyệt áp dụng</span>
                            </button>
                          </div>
                        </div>

                        {/* OOS Validation Telemetry */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#121622] p-2.5 rounded border border-[#1f2430] text-[10px]">
                          <div>
                            <span className="text-gray-400">Tập In-Sample:</span>
                            <div className="text-white font-digital font-semibold mt-0.5">
                              {prop.oosReport.inSampleTradesCount} lệnh (WR: {prop.oosReport.isWinRatePct}%)
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Tập Out-Of-Sample:</span>
                            <div className="text-cyan-400 font-digital font-semibold mt-0.5">
                              {prop.oosReport.outOfSampleTradesCount} lệnh (WR: {prop.oosReport.oosWinRatePct}%)
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Net Profit Factor (OOS):</span>
                            <div className="text-emerald-400 font-digital font-semibold mt-0.5">
                              {prop.oosReport.oosNetProfitFactor}x
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Overfitting Stability Score:</span>
                            <div className="text-purple-400 font-digital font-semibold mt-0.5">
                              {prop.oosReport.overfittingScore}/100 (An toàn)
                            </div>
                          </div>
                        </div>

                        {/* Parameter changes breakdown */}
                        <div className="text-[11px] space-y-1">
                          <div className="text-gray-400 text-[10px] font-semibold">Các tham số điều chỉnh đề xuất:</div>
                          {prop.parameterChanges.map((change, cIdx) => (
                            <div key={cIdx} className="flex items-center justify-between bg-[#151926] px-2.5 py-1 rounded">
                              <span className="text-cyan-300 font-semibold">{change.parameterName}</span>
                              <div className="flex items-center gap-1.5 font-digital">
                                <span className="text-gray-500 line-through">{change.previousValue}</span>
                                <ArrowRight className="w-3 h-3 text-purple-400" />
                                <span className="text-emerald-400 font-bold">{change.newValue}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="text-[10px] text-gray-400 italic">{prop.oosReport.verdictNote}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 text-[11px] py-4 text-center bg-[#0b0e14] rounded-lg border border-[#1f2430]">
                    Hiện tại chưa có đề xuất nào chờ duyệt. Khi có lệnh đóng mới, Bot 5 sẽ tự động chạy OOS Parameter Sweep và tạo đề xuất cải tiến an toàn.
                  </div>
                )}
              </div>

              {/* Model Version Registry & Rollback Panel */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span className="text-white font-bold text-xs">
                      Sổ Đăng Ký Phiên Bản Mô Hình &amp; Khả Năng Rollback 1-Click
                    </span>
                  </div>
                  <span className="text-purple-300 text-[10px] font-mono">
                    Hiện hành: <strong>{currentVersion}</strong>
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {versionHistory.map((ver, vIdx) => (
                    <div
                      key={vIdx}
                      className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between ${
                        ver.isCurrent
                          ? 'bg-purple-950/30 border-purple-600/60 shadow-sm'
                          : 'bg-[#0b0e14] border-[#1f2430]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 font-bold mb-0.5">
                          <span className={ver.isCurrent ? 'text-purple-300' : 'text-white'}>
                            {ver.version}
                          </span>
                          {ver.isCurrent ? (
                            <span className="bg-purple-900 text-purple-200 px-1.5 py-0.2 rounded text-[9px] font-mono">
                              ĐANG ÁP DỤNG
                            </span>
                          ) : (
                            <span className="text-gray-500 text-[9px]">Lưu trữ</span>
                          )}
                          <span className="text-gray-400 text-[10px] font-digital">
                            {new Date(ver.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-gray-400 text-[10px]">{ver.commitReason}</div>
                        <div className="text-gray-500 text-[9px] mt-0.5 font-digital">
                          Win Rate lúc lưu: {ver.performanceSnapshot?.winRatePct}% • Net PnL: ${ver.performanceSnapshot?.totalNetProfit?.toFixed(4)} USDT
                        </div>
                      </div>

                      <div>
                        {!ver.isCurrent && (
                          <button
                            onClick={() => handleRollback(ver.version)}
                            className="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded cursor-pointer transition text-[10px] flex items-center gap-1 font-semibold"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Rollback về {ver.version}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MULTI-TIMEFRAME ROOT CAUSE POST-MORTEM */}
          {activeTab === 'POST_MORTEM' && (
            <div className="space-y-4">
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1f2430]">
                  <span className="text-white font-bold text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Hồ Sơ Mổ Xẻ Đa Khung Thời Gian 1m/3m/5m/15m (Post-Mortem Audit Records)
                  </span>
                  <span className="text-gray-400 text-[10px]">Lưu trữ 100 lệnh gần nhất</span>
                </div>

                {history.length > 0 ? (
                  <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                    {history.map((record, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-[11px] ${
                          record.postMortem.isLoss
                            ? 'bg-rose-950/15 border-rose-900/50'
                            : 'bg-emerald-950/15 border-emerald-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{record.symbol}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                              record.postMortem.isLoss
                                ? 'bg-rose-900/60 text-rose-300 border border-rose-800/60'
                                : 'bg-emerald-900/60 text-emerald-300 border border-emerald-800/60'
                            }`}>
                              {record.postMortem.category}
                            </span>
                            <span className="text-gray-400 text-[10px]">
                              Chiến lược: {record.postMortem.strategyName}
                            </span>
                          </div>
                          <span className="text-gray-400 text-[10px] font-digital">
                            {new Date(record.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="text-gray-200 text-[11px] mb-1 font-medium">
                          {record.postMortem.rootCauseDescription}
                        </div>
                        <div className="text-gray-400 text-[10px] leading-relaxed mb-2">
                          {record.postMortem.detailedAudit}
                        </div>

                        {/* MTF Correlation Matrix for this trade */}
                        {record.postMortem.timeframeAudit && (
                          <div className="grid grid-cols-4 gap-1.5 bg-[#080a0f] p-2 rounded border border-[#1f2430] text-[10px]">
                            <div className="p-1 rounded bg-[#10141f]">
                              <span className="text-gray-500">M1 Micro:</span>
                              <div className="text-white font-digital font-semibold">
                                {record.postMortem.timeframeAudit.m1.trend} (RSI: {record.postMortem.timeframeAudit.m1.rsi})
                              </div>
                            </div>
                            <div className="p-1 rounded bg-[#10141f]">
                              <span className="text-gray-500">M3 Sóng nhỏ:</span>
                              <div className="text-white font-digital font-semibold">
                                {record.postMortem.timeframeAudit.m3.trend}
                              </div>
                            </div>
                            <div className="p-1 rounded bg-[#10141f]">
                              <span className="text-gray-500">M5 Scalp:</span>
                              <div className="text-white font-digital font-semibold">
                                {record.postMortem.timeframeAudit.m5.trend} (RVOL: {record.postMortem.timeframeAudit.m5.rvol})
                              </div>
                            </div>
                            <div className="p-1 rounded bg-[#10141f]">
                              <span className="text-gray-500">M15 Macro:</span>
                              <div className="text-white font-digital font-semibold">
                                {record.postMortem.timeframeAudit.m15.trend} (ADX: {record.postMortem.timeframeAudit.m15.adx})
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-8">
                    Chưa có lệnh nào được kiểm toán. Bot 5 sẽ tự động phân tích ngay khi lệnh Paper đầu tiên đóng!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COIN & STRATEGY MATRICES */}
          {activeTab === 'MATRICES' && (
            <div className="space-y-4">
              {/* Coin Breakdown Matrix */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4">
                <div className="text-white font-bold text-xs mb-2.5 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  <span>Ma Trận Hiệu Suất Theo Từng Đồng Coin (Symbol Performance Matrix)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-[#0b0e14] text-gray-400 uppercase text-[9px] border-b border-[#1f2430]">
                      <tr>
                        <th className="py-2 px-3">Cặp Giao Dịch</th>
                        <th className="py-2 px-3">Tổng Lệnh</th>
                        <th className="py-2 px-3">Thắng / Thua</th>
                        <th className="py-2 px-3">Win Rate</th>
                        <th className="py-2 px-3">Net PnL (USDT)</th>
                        <th className="py-2 px-3">Tổng Phí Đã Trả</th>
                        <th className="py-2 px-3">Thời Lượng TB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2430]">
                      {metrics?.breakdownBySymbol && Object.keys(metrics.breakdownBySymbol).length > 0 ? (
                        Object.values(metrics.breakdownBySymbol).map((sym: any) => (
                          <tr key={sym.symbol} className="hover:bg-[#151926]">
                            <td className="py-2 px-3 font-bold text-white">{sym.symbol}</td>
                            <td className="py-2 px-3 font-digital">{sym.totalTrades}</td>
                            <td className="py-2 px-3 font-digital text-gray-300">
                              {sym.wins}W / {sym.losses}L
                            </td>
                            <td className="py-2 px-3 font-digital font-bold text-emerald-400">
                              {sym.winRatePct}%
                            </td>
                            <td className={`py-2 px-3 font-digital font-bold ${sym.totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {sym.totalNetPnL >= 0 ? '+' : ''}${sym.totalNetPnL.toFixed(4)}
                            </td>
                            <td className="py-2 px-3 font-digital text-rose-400">
                              -${sym.totalFeesPaid.toFixed(4)}
                            </td>
                            <td className="py-2 px-3 font-digital text-gray-400">
                              {sym.avgDurationSec}s
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-4 text-gray-500">
                            Chưa có dữ liệu thống kê từng coin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strategy Breakdown Matrix */}
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4">
                <div className="text-white font-bold text-xs mb-2.5 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Ma Trận Hiệu Suất Theo Chiến Lược Scalping (Strategy Performance Matrix)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-[#0b0e14] text-gray-400 uppercase text-[9px] border-b border-[#1f2430]">
                      <tr>
                        <th className="py-2 px-3">Chiến Lược Scalp</th>
                        <th className="py-2 px-3">Tổng Lệnh</th>
                        <th className="py-2 px-3">Thắng / Thua</th>
                        <th className="py-2 px-3">Win Rate</th>
                        <th className="py-2 px-3">Profit Factor</th>
                        <th className="py-2 px-3">Net PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2430]">
                      {metrics?.breakdownByStrategy && Object.keys(metrics.breakdownByStrategy).length > 0 ? (
                        Object.values(metrics.breakdownByStrategy).map((strat: any) => (
                          <tr key={strat.strategy} className="hover:bg-[#151926]">
                            <td className="py-2 px-3 font-bold text-purple-300">{strat.strategy}</td>
                            <td className="py-2 px-3 font-digital">{strat.totalTrades}</td>
                            <td className="py-2 px-3 font-digital text-gray-300">{strat.wins}W / {strat.losses}L</td>
                            <td className="py-2 px-3 font-digital font-bold text-emerald-400">{strat.winRatePct}%</td>
                            <td className="py-2 px-3 font-digital font-bold text-cyan-400">{strat.profitFactor}x</td>
                            <td className={`py-2 px-3 font-digital font-bold ${strat.totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {strat.totalNetPnL >= 0 ? '+' : ''}${strat.totalNetPnL.toFixed(4)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center py-4 text-gray-500">
                            Chưa có dữ liệu thống kê từng chiến lược.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INTERACTIVE SIMULATOR */}
          {activeTab === 'SIMULATOR' && (
            <div className="space-y-4">
              <div className="bg-[#121622] border border-[#1f2430] rounded-xl p-4 space-y-3">
                <div className="text-white font-bold text-xs flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Kích Hoạt Thử Nghiệm Tự Học &amp; Kiểm Định OOS (Interactive Learning Testing)</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  Nhấn các nút bên dưới để mô phỏng các trường hợp thua lỗ đặc thù theo đúng tiêu chuẩn yêu cầu. Bot 5 sẽ kích hoạt thuật toán mổ xẻ đa khung MTF, tính toán chi phí thực tế và sinh đề xuất OOS chống overfitting:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-[11px]">
                  <button
                    onClick={() => handleSimulateLoss('FALSE_SIGNAL_NOISE')}
                    className="p-3 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 border border-purple-800/80 rounded-lg text-left cursor-pointer transition shadow-sm"
                  >
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <span>1. Sai tín hiệu do nhiễu micro (M1/M3)</span>
                    </div>
                    <div className="text-gray-400 text-[10px]">
                      &rarr; Đề xuất nâng ngưỡng điểm tin cậy Bot 2 và lọc nến đảo chiều.
                    </div>
                  </button>

                  <button
                    onClick={() => handleSimulateLoss('POOR_ENTRY_SPREAD_SLIPPAGE')}
                    className="p-3 bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800/80 rounded-lg text-left cursor-pointer transition shadow-sm"
                  >
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <span>2. Điểm vào xấu &amp; Spread giãn rộng</span>
                    </div>
                    <div className="text-gray-400 text-[10px]">
                      &rarr; Đề xuất siết chặt trần spread tối đa &le; 4.0 bps trước khi khớp.
                    </div>
                  </button>

                  <button
                    onClick={() => handleSimulateLoss('TREND_OPPOSITION_MTF')}
                    className="p-3 bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/80 rounded-lg text-left cursor-pointer transition shadow-sm"
                  >
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <span>3. Ngược xu hướng chủ đạo M15/H1</span>
                    </div>
                    <div className="text-gray-400 text-[10px]">
                      &rarr; Đề xuất nâng ngưỡng ADX Trend &ge; 25 để bắt buộc đồng pha khung lớn.
                    </div>
                  </button>

                  <button
                    onClick={() => handleSimulateLoss('PREMATURE_SL_TIMING')}
                    className="p-3 bg-blue-950/60 hover:bg-blue-900/80 text-blue-200 border border-blue-800/80 rounded-lg text-left cursor-pointer transition shadow-sm"
                  >
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <span>4. Quét Stop Loss sớm do râu nến ATR</span>
                    </div>
                    <div className="text-gray-400 text-[10px]">
                      &rarr; Đề xuất tăng hệ số đệm nến ATR tối thiểu lên 2.2x.
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#090b12] border-t border-[#1f2430] flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mọi đề xuất tham số đều được kiểm định OOS độc lập trước khi gửi cho Bot 1–4.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1f2430] hover:bg-gray-700 text-white rounded font-medium cursor-pointer transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
