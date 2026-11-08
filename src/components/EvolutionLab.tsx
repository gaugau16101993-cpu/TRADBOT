import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  TrendingUp,
  Activity,
  History,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileText,
  Layers,
  Award,
  AlertTriangle,
  Play,
  RefreshCw,
  Cpu,
  Search,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  ChallengerModel,
  MandatoryAuditReport,
  RollbackSnapshot,
  BacktestSimulationResult,
} from '../types/evolution';

export const EvolutionLab: React.FC = () => {
  const [currentChampion, setCurrentChampion] = useState<string>('v1.0.0');
  const [challengers, setChallengers] = useState<ChallengerModel[]>([]);
  const [latestReport, setLatestReport] = useState<MandatoryAuditReport | null>(null);
  const [reportsHistory, setReportsHistory] = useState<MandatoryAuditReport[]>([]);
  const [rollbackHistory, setRollbackHistory] = useState<RollbackSnapshot[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<string>('BTCUSDT');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isPromoting, setIsPromoting] = useState<boolean>(false);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);
  const [activeReportTab, setActiveReportTab] = useState<number>(0);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'danger' | 'info' } | null>(null);

  const isMountedRef = useRef<boolean>(true);

  const fetchStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const res = await fetch('/api/engine/evolution/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setCurrentChampion(data.currentChampion || 'v1.0.0');
          setChallengers(data.challengers || []);
          setLatestReport(data.latestAuditReport || null);
          setRollbackHistory(data.rollbackHistory || []);
        }
      }

      const resReports = await fetch('/api/engine/evolution/reports', { cache: 'no-store' });
      if (resReports.ok) {
        const dataReports = await resReports.json();
        if (isMountedRef.current && Array.isArray(dataReports)) {
          setReportsHistory(dataReports);
        }
      }
    } catch {
      // Ignore background transient fetch errors
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();
    const interval = setInterval(() => {
      if (isMountedRef.current) fetchStatus();
    }, 2500);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const handleRunValidation = async () => {
    setIsValidating(true);
    setActionNotice({ text: `Đang chạy kiểm định độc lập Walk-Forward OOS trên nến ${selectedCoin} Bitget...`, type: 'info' });
    try {
      const res = await fetch('/api/engine/evolution/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedCoin }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setLatestReport(data.report);
        const isPassed = data.report.independentVerdict.isIndependentAuditPassed;
        setActionNotice({
          text: isPassed
            ? `Kiểm định độc lập HOÀN TẤT: ACCEPT! OOS PF: ${data.report.backtestResults.outOfSampleMetrics.profitFactor} >= 1.40. Đủ điều kiện thăng cấp.`
            : `Kiểm định độc lập HOÀN TẤT: REJECT! Lý do: ${data.report.backtestResults.rejectionReasons[0] || 'Chưa đạt tiêu chí'}`,
          type: isPassed ? 'success' : 'danger',
        });
        fetchStatus();
      } else {
        setActionNotice({ text: data.error || 'Lỗi chạy kiểm định', type: 'danger' });
      }
    } catch (e: any) {
      setActionNotice({ text: e.message || 'Lỗi mạng khi kiểm định', type: 'danger' });
    } finally {
      setIsValidating(false);
    }
  };

  const handlePromoteChallenger = async () => {
    setIsPromoting(true);
    try {
      const res = await fetch('/api/engine/evolution/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ text: data.message, type: 'success' });
        fetchStatus();
      } else {
        setActionNotice({ text: data.message || 'Thăng cấp thất bại', type: 'danger' });
      }
    } catch (e: any) {
      setActionNotice({ text: e.message || 'Lỗi gọi API thăng cấp', type: 'danger' });
    } finally {
      setIsPromoting(false);
    }
  };

  const handleRollback = async (version: string) => {
    setIsRollingBack(true);
    try {
      const res = await fetch('/api/engine/evolution/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, reason: 'Người dùng yêu cầu rollback an toàn' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ text: `Đã khôi phục thành công về Champion ${version}!`, type: 'info' });
        fetchStatus();
      } else {
        setActionNotice({ text: 'Rollback thất bại', type: 'danger' });
      }
    } catch (e: any) {
      setActionNotice({ text: e.message, type: 'danger' });
    } finally {
      setIsRollingBack(false);
    }
  };

  const activeChallenger = challengers[0] || null;
  const isChallengerApproved = latestReport?.independentVerdict.isIndependentAuditPassed || false;

  return (
    <div className="space-y-4 font-mono text-xs text-gray-200 animate-fadeIn">
      {/* Top Banner & Core Concept */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-[#0e131d] to-purple-950/40 border border-cyan-800/50 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-700/60 shadow-inner">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-bold text-sm">
                EVOLUTION &amp; INDEPENDENT VALIDATOR LAB
              </h3>
              <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/60 px-2 py-0.5 rounded text-[10px] font-bold">
                CHAMPION: {currentChampion}
              </span>
              <span className="bg-amber-950 text-amber-300 border border-amber-600/60 px-2 py-0.5 rounded text-[10px] font-bold">
                CHALLENGER: {activeChallenger?.version || 'v3.0-CHALLENGER'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Ban Kiểm Định Độc Lập tự động backtest ma sát sàn Bitget (phí 0.12%, trượt giá, funding) và kiểm tra Walk-Forward OOS (60/40) trước khi phê duyệt.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#080b11] p-1.5 rounded-lg border border-gray-800">
            <span className="text-[10px] text-gray-400">Cặp nến:</span>
            <select
              value={selectedCoin}
              onChange={(e) => setSelectedCoin(e.target.value)}
              className="bg-[#121622] text-white border border-gray-700 rounded px-2 py-1 text-xs outline-none cursor-pointer font-bold"
            >
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
              <option value="SOLUSDT">SOLUSDT</option>
              <option value="XRPUSDT">XRPUSDT</option>
            </select>
          </div>

          <button
            onClick={handleRunValidation}
            disabled={isValidating}
            className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
              isValidating
                ? 'bg-cyan-900 text-cyan-300 animate-pulse cursor-wait'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/40'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{isValidating ? 'Đang Kiểm Định OOS...' : 'Chạy Kiểm Định Độc Lập'}</span>
          </button>

          <button
            onClick={handlePromoteChallenger}
            disabled={isPromoting || !isChallengerApproved}
            title={
              isChallengerApproved
                ? 'Challenger đã vượt qua kiểm định độc lập OOS. Nhấn để thăng cấp làm Champion chính thức.'
                : 'Cần vượt qua kiểm định độc lập (OOS PF >= 1.40, WR >= 60%) mới được thăng cấp.'
            }
            className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
              isChallengerApproved
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50'
                : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Thăng Cấp Thành Champion</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between animate-fadeIn ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
              : actionNotice.type === 'danger'
              ? 'bg-rose-950/80 border-rose-500 text-rose-200'
              : 'bg-cyan-950/80 border-cyan-500 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : actionNotice.type === 'danger' ? (
              <XCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-gray-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quantitative Gates Overview (3 Thẻ Tiêu Chí Bắt Buộc) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#0e131d] border border-[#1f2737] rounded-xl p-3.5">
          <div className="text-gray-400 text-[11px] mb-1">TIÊU CHÍ 1: OOS PROFIT FACTOR</div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-digital text-cyan-300">
              {latestReport?.backtestResults.outOfSampleMetrics.profitFactor ?? '---'}
            </span>
            <span className="text-[10px] text-gray-400">Ngưỡng: &ge; 1.40</span>
          </div>
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
            {(latestReport?.backtestResults.outOfSampleMetrics.profitFactor || 0) >= 1.4 ? (
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> ĐẠT TIÊU CHUẨN
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Chưa đạt ngưỡng
              </span>
            )}
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">Sau phí Bitget 0.12%</span>
          </div>
        </div>

        <div className="bg-[#0e131d] border border-[#1f2737] rounded-xl p-3.5">
          <div className="text-gray-400 text-[11px] mb-1">TIÊU CHÍ 2: OOS WIN RATE</div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-digital text-emerald-300">
              {latestReport?.backtestResults.outOfSampleMetrics.winRatePct
                ? `${latestReport.backtestResults.outOfSampleMetrics.winRatePct}%`
                : '---'}
            </span>
            <span className="text-[10px] text-gray-400">Ngưỡng: &ge; 60.0%</span>
          </div>
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
            {(latestReport?.backtestResults.outOfSampleMetrics.winRatePct || 0) >= 60 ? (
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> ĐẠT TIÊU CHUẨN
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Chưa đạt ngưỡng
              </span>
            )}
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">Tập ngoài mẫu 40%</span>
          </div>
        </div>

        <div className="bg-[#0e131d] border border-[#1f2737] rounded-xl p-3.5">
          <div className="text-gray-400 text-[11px] mb-1">TIÊU CHÍ 3: MAX DRAWDOWN</div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-digital text-amber-300">
              {latestReport?.backtestResults.outOfSampleMetrics.maxDrawdownPct !== undefined
                ? `${latestReport.backtestResults.outOfSampleMetrics.maxDrawdownPct}%`
                : '---'}
            </span>
            <span className="text-[10px] text-gray-400">Ngưỡng: &le; 10.0%</span>
          </div>
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
            {(latestReport?.backtestResults.outOfSampleMetrics.maxDrawdownPct || 0) <= 10 ? (
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> AN TOÀN VỐN
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Vượt ngưỡng rủi ro
              </span>
            )}
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">Ký quỹ 20 USDT/lệnh</span>
          </div>
        </div>
      </div>

      {/* Head-to-Head Comparison: Champion vs Challenger */}
      <div className="bg-[#0e131d] border border-[#1f2737] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h4 className="text-white font-bold text-xs uppercase tracking-wide">
              ĐỐI CHỨNG HEAD-TO-HEAD: CHAMPION ({currentChampion}) VS CHALLENGER ({activeChallenger?.version})
            </h4>
          </div>
          <span className="text-[10px] text-gray-400">
            Dữ liệu so sánh cùng điều kiện thị trường thực tế
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[#121622] p-2.5 rounded-lg border border-gray-800">
            <div className="text-[10px] text-gray-400 mb-1">PROFIT FACTOR</div>
            <div className="text-sm font-bold text-white">
              <span className="text-gray-400">{latestReport?.championVsChallenger.championMetrics.profitFactor || 1.5}</span>
              <span className="text-gray-500 mx-1.5">&rarr;</span>
              <span className="text-cyan-400">{latestReport?.championVsChallenger.challengerMetrics.profitFactor || '---'}</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 font-bold">
              {latestReport ? `+${latestReport.championVsChallenger.deltaProfitFactor}` : 'Chờ kiểm định'}
            </div>
          </div>

          <div className="bg-[#121622] p-2.5 rounded-lg border border-gray-800">
            <div className="text-[10px] text-gray-400 mb-1">WIN RATE</div>
            <div className="text-sm font-bold text-white">
              <span className="text-gray-400">{latestReport?.championVsChallenger.championMetrics.winRatePct || 100}%</span>
              <span className="text-gray-500 mx-1.5">&rarr;</span>
              <span className="text-emerald-400">{latestReport?.championVsChallenger.challengerMetrics.winRatePct || '---'}%</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 font-bold">
              {latestReport ? `${latestReport.championVsChallenger.deltaWinRatePct >= 0 ? '+' : ''}${latestReport.championVsChallenger.deltaWinRatePct}%` : 'Chờ kiểm định'}
            </div>
          </div>

          <div className="bg-[#121622] p-2.5 rounded-lg border border-gray-800">
            <div className="text-[10px] text-gray-400 mb-1">MAX DRAWDOWN</div>
            <div className="text-sm font-bold text-white">
              <span className="text-gray-400">{latestReport?.championVsChallenger.championMetrics.maxDrawdownPct || 4.5}%</span>
              <span className="text-gray-500 mx-1.5">&rarr;</span>
              <span className="text-amber-400">{latestReport?.championVsChallenger.challengerMetrics.maxDrawdownPct || '---'}%</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 font-bold">
              {latestReport ? 'Kiểm soát &le; 10%' : 'Chờ kiểm định'}
            </div>
          </div>

          <div className="bg-[#121622] p-2.5 rounded-lg border border-gray-800">
            <div className="text-[10px] text-gray-400 mb-1">OVERFITTING RATIO</div>
            <div className="text-sm font-bold text-white">
              <span className="text-purple-300">
                {latestReport?.backtestResults.overfittingRatio ?? '---'}
              </span>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              Ngưỡng IS/OOS: &le; 1.35
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory 8-Point Audit Report (Báo Cáo Thẩm Định 8 Mục Bắt Buộc) */}
      {latestReport ? (
        <div className="bg-[#0e131d] border border-cyan-800/40 rounded-xl p-4 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <h4 className="text-white font-bold text-xs uppercase">
                BÁO CÁO THẨM ĐỊNH ĐỘC LẬP 8 MỤC ({latestReport.reportId})
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">
                Chữ ký Auditor: {latestReport.independentVerdict.verificationSignature}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  latestReport.independentVerdict.isIndependentAuditPassed
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-600/60'
                }`}
              >
                PHÁN QUYẾT: {latestReport.independentVerdict.status}
              </span>
            </div>
          </div>

          {/* 8 Sections Accordion / Pills */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            {/* Mục 1 & 2 */}
            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>1. Vấn Đề Phát Hiện</span>
              </div>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {latestReport.issuesIdentified.map((issue, idx) => (
                  <li key={idx} className="leading-relaxed">{issue}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>2. Thuật Toán Cũ và Mới</span>
              </div>
              <div className="space-y-1.5 text-gray-300">
                {latestReport.algorithmComparison.map((comp, idx) => (
                  <div key={idx} className="border-b border-gray-800/60 pb-1.5 last:border-0">
                    <span className="text-amber-300 font-semibold">{comp.domain}:</span>{' '}
                    <span className="text-gray-400 line-through">{comp.oldAlgorithm}</span> &rarr;{' '}
                    <span className="text-emerald-300 font-medium">{comp.newAlgorithm}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mục 3 & 4 */}
            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>3. Các Thay Đổi Trong Từng Bot (1-5)</span>
              </div>
              <div className="space-y-1 text-gray-300 text-[10px]">
                <p><strong>Bot 1:</strong> {latestReport.botModifications.bot1}</p>
                <p><strong>Bot 2:</strong> {latestReport.botModifications.bot2}</p>
                <p><strong>Bot 3:</strong> {latestReport.botModifications.bot3}</p>
                <p><strong>Bot 4:</strong> {latestReport.botModifications.bot4}</p>
                <p><strong>Bot 5:</strong> {latestReport.botModifications.bot5}</p>
              </div>
            </div>

            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>4. Kết Quả Backtest &amp; Walk-Forward OOS</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                  <span className="text-gray-400">In-Sample (60%)</span>
                  <div className="font-bold text-white mt-1">PF: {latestReport.backtestResults.inSampleMetrics.profitFactor}</div>
                  <div className="text-emerald-400">WR: {latestReport.backtestResults.inSampleMetrics.winRatePct}%</div>
                </div>
                <div className="bg-[#0b0e14] p-2 rounded border border-gray-800">
                  <span className="text-cyan-400 font-bold">Out-Of-Sample (40%)</span>
                  <div className="font-bold text-cyan-300 mt-1">PF: {latestReport.backtestResults.outOfSampleMetrics.profitFactor}</div>
                  <div className="text-emerald-300">WR: {latestReport.backtestResults.outOfSampleMetrics.winRatePct}%</div>
                </div>
              </div>
              <div className="text-[10px] text-gray-400">
                Tổng phí ma sát sàn đã khấu trừ: <strong className="text-amber-300">${latestReport.backtestResults.totalFrictionsPaidUsdt} USDT</strong>
              </div>
            </div>

            {/* Mục 5 & 6 */}
            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>5. Phán Quyết Ban Kiểm Định Độc Lập</span>
              </div>
              <p className="leading-relaxed text-gray-300">{latestReport.independentVerdict.notes}</p>
              <div className="text-[10px] text-gray-500">
                Đơn vị thẩm định: {latestReport.independentVerdict.auditor}
              </div>
            </div>

            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>6. So Sánh Champion vs Challenger</span>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Challenger {latestReport.challengerVersion} vượt trội hơn Champion: Lợi nhuận ròng tăng{' '}
                <strong className="text-emerald-300">+{latestReport.championVsChallenger.deltaNetProfitPct}%</strong>, Win Rate tăng{' '}
                <strong className="text-emerald-300">+{latestReport.championVsChallenger.deltaWinRatePct}%</strong> sau mọi ma sát phí.
              </p>
            </div>

            {/* Mục 7 & 8 */}
            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>7. Kết Quả Paper Trading (Shadow Testing)</span>
              </div>
              <p className="text-gray-300">
                Đã thực thi <strong>{latestReport.paperTradingShadow.shadowTradesExecuted} lệnh</strong> ảo trên luồng nến Bitget thật. Win Rate:{' '}
                <strong className="text-emerald-300">{latestReport.paperTradingShadow.shadowWinRatePct}%</strong>.
              </p>
            </div>

            <div className="bg-[#121622] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                <span>8. Rủi Ro Còn Lại &amp; Quyết Định</span>
              </div>
              <p className="text-gray-300 leading-relaxed">{latestReport.residualRisksAndDecision.decisionReason}</p>
              <div className="text-[10px] text-amber-300">
                Biện pháp phòng ngừa: Khóa đòn bẩy 10x, tự động NO_TRADE khi spread &gt; 3.0 bps.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#0e131d] border border-gray-800 rounded-xl p-8 text-center space-y-3">
          <Activity className="w-8 h-8 text-cyan-400 mx-auto animate-bounce" />
          <h4 className="text-white font-bold text-sm">CHƯA CÓ BÁO CÁO THẨM ĐỊNH MỚI</h4>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Nhấn nút <strong>&quot;Chạy Kiểm Định Độc Lập&quot;</strong> ở trên để Ban Kiểm Định Độc Lập lấy dữ liệu nến thật từ Bitget và chạy kiểm tra Walk-Forward OOS.
          </p>
        </div>
      )}

      {/* Rollback Safety & Version History */}
      <div className="bg-[#0e131d] border border-[#1f2737] rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-purple-400" />
            <h4 className="text-white font-bold text-xs uppercase tracking-wide">
              LỊCH SỬ PHỤC HỒI &amp; ROLLBACK AN TOÀN (1-CLICK RESTORE)
            </h4>
          </div>
          <span className="text-[10px] text-gray-400">
            Tự động sao lưu trước mỗi lần thăng cấp
          </span>
        </div>

        {rollbackHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-gray-400 border-b border-gray-800 text-[10px]">
                <tr>
                  <th className="py-1.5">Mã Rollback</th>
                  <th>Thời gian</th>
                  <th>Từ Phiên Bản</th>
                  <th>Về Phiên Bản</th>
                  <th>Lý do</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {rollbackHistory.map((rb) => (
                  <tr key={rb.rollbackId} className="hover:bg-gray-800/30">
                    <td className="py-2 text-cyan-300 font-bold">{rb.rollbackId}</td>
                    <td className="text-gray-400">{new Date(rb.timestamp).toLocaleString()}</td>
                    <td><span className="text-rose-400">{rb.fromVersion}</span></td>
                    <td><span className="text-emerald-400 font-bold">{rb.toVersion}</span></td>
                    <td className="text-gray-300">{rb.triggerReason}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleRollback(rb.toVersion)}
                        disabled={isRollingBack}
                        className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900 border border-purple-600/60 text-purple-200 rounded text-[10px] font-bold transition cursor-pointer"
                      >
                        Khôi phục {rb.toVersion}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-xs">
            Chưa có sự kiện Rollback nào được kích hoạt. Bản sao lưu gốc đang được bảo lưu tại <code>data/engine_state.backup.json</code>.
          </div>
        )}
      </div>
    </div>
  );
};
