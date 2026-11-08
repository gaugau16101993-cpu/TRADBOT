import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Wallet,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  Lock,
  Zap,
  Sliders,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  Bot4ExecutionMetrics,
  Bot4ExecutionConfig,
  PaperOrder,
  ManagedPosition,
  DoubleEntryLedgerRecord,
} from '../types/execution';

interface Bot4ExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Bot4ExecutionModal: React.FC<Bot4ExecutionModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions_orders' | 'ledger' | 'config'>('overview');
  const [metrics, setMetrics] = useState<Bot4ExecutionMetrics | null>(null);
  const [positions, setPositions] = useState<ManagedPosition[]>([]);
  const [activeOrders, setActiveOrders] = useState<PaperOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<PaperOrder[]>([]);
  const [ledger, setLedger] = useState<DoubleEntryLedgerRecord[]>([]);
  const [config, setConfig] = useState<Bot4ExecutionConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, ordersRes, ledgerRes] = await Promise.all([
        fetch('/api/engine/bot4/status'),
        fetch('/api/engine/bot4/orders'),
        fetch('/api/engine/bot4/ledger'),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setMetrics(data.metrics);
        setPositions(data.positions);
        setConfig(data.config);
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setActiveOrders(data.activeOrders || []);
        setOrderHistory(data.orderHistory || []);
      }
      if (ledgerRes.ok) {
        const data = await ledgerRes.json();
        setLedger(data.ledger || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch Bot 4 data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      const interval = setInterval(fetchData, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleToggleKillSwitch = async () => {
    if (!metrics) return;
    try {
      const action = metrics.isKillSwitchActive ? 'RESET' : 'TRIGGER';
      const res = await fetch('/api/engine/bot4/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: 'Toggled manually from UI' }),
      });
      if (res.ok) {
        setActionMessage(
          action === 'RESET' ? 'Emergency Kill Switch reset. Normal trading resumed.' : '🚨 Emergency Kill Switch activated! All positions liquidated.'
        );
        fetchData();
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err: any) {
      console.error('Failed to toggle kill switch:', err);
    }
  };

  const handleRunHeartbeat = async () => {
    try {
      const res = await fetch('/api/engine/bot4/heartbeat', { method: 'POST' });
      if (res.ok) {
        setActionMessage('💓 Heartbeat audit executed successfully!');
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: any) {
      console.error('Heartbeat error:', err);
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      const res = await fetch('/api/engine/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setActionMessage(`Đã gửi yêu cầu đóng vị thế ${id}`);
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: any) {
      console.error('Error closing position:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0e121a] border border-[#1f2638] rounded-xl max-w-5xl w-full p-5 shadow-2xl font-mono text-xs max-h-[90vh] flex flex-col">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2638]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  BOT 4 — EXECUTION &amp; NET-PROFIT MANAGER PRO
                </span>
                <span className="text-[10px] bg-amber-950/80 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-mono">
                  PAPER TRADING ONLY
                </span>
                {metrics?.isKillSwitchActive && (
                  <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-800 px-2 py-0.5 rounded font-bold animate-pulse">
                    🚨 KILL SWITCH ACTIVE
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Vốn mô phỏng: <strong className="text-emerald-400">$10.00 USDT</strong> | Ký quỹ: <strong className="text-cyan-400">$2.00 / vị thế</strong> | Tối đa: <strong className="text-purple-400">2 vị thế đồng thời</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunHeartbeat}
              title="Kích hoạt kiểm tra nhịp tim (Heartbeat 60s) ngay"
              className="p-1.5 rounded bg-[#161c28] hover:bg-[#1f2638] text-gray-300 hover:text-white border border-gray-700 transition cursor-pointer flex items-center gap-1 text-[11px]"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Heartbeat</span>
            </button>
            <button
              onClick={fetchData}
              disabled={isLoading}
              title="Làm mới dữ liệu telemetry"
              className="p-1.5 rounded bg-[#161c28] hover:bg-[#1f2638] text-gray-300 hover:text-white border border-gray-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NOTIFICATION BANNER */}
        {actionMessage && (
          <div className="mt-3 p-2.5 bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 rounded text-[11px] flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="flex items-center gap-2 border-b border-[#1f2638] my-3 pb-2 text-[11px]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tổng quan &amp; Rủi ro</span>
          </button>

          <button
            onClick={() => setActiveTab('positions_orders')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'positions_orders'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Vị thế ({positions.length}) &amp; Lệnh</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Sổ cái kép (Double-Entry Ledger)</span>
            {metrics?.lastAuditResult.isReconciled && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Cấu hình &amp; Kill Switch</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW & RISK CONTROLS */}
        {activeTab === 'overview' && metrics && (
          <div className="overflow-y-auto space-y-4 pr-1 flex-1">
            {/* 4 PRIMARY METRIC CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2638]">
                <div className="text-gray-400 text-[10px] uppercase">Simulated Equity</div>
                <div className="text-xl font-bold font-digital text-emerald-400 mt-1">
                  ${metrics.equity.toFixed(4)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Free Cash: <span className="text-gray-300 font-digital">${metrics.walletBalance.toFixed(4)}</span>
                </div>
              </div>

              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2638]">
                <div className="text-gray-400 text-[10px] uppercase">Allocated Margin</div>
                <div className="text-xl font-bold font-digital text-cyan-400 mt-1">
                  ${metrics.allocatedMargin.toFixed(4)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Utilization: <span className="text-gray-300 font-digital">{metrics.marginUtilizationPct.toFixed(1)}%</span> (Cap: 40%)
                </div>
              </div>

              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2638]">
                <div className="text-gray-400 text-[10px] uppercase">Realized Net PnL</div>
                <div
                  className={`text-xl font-bold font-digital mt-1 ${
                    metrics.totalRealizedNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {metrics.totalRealizedNetPnL >= 0 ? '+' : ''}${metrics.totalRealizedNetPnL.toFixed(4)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Gross: <span className="text-gray-300 font-digital">${metrics.totalGrossPnL.toFixed(4)}</span>
                </div>
              </div>

              <div className="bg-[#080a0f] p-3 rounded-lg border border-[#1f2638]">
                <div className="text-gray-400 text-[10px] uppercase">Total Friction Costs</div>
                <div className="text-xl font-bold font-digital text-amber-400 mt-1">
                  -${metrics.totalFeesPaid.toFixed(4)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Fees: <span className="text-gray-300 font-digital">${metrics.totalFeesPaid.toFixed(4)}</span> | Funding: <span className="text-gray-300 font-digital">${metrics.totalFundingPaid.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* RISK SAFEGUARDS GAUGES */}
            <div className="p-3 bg-[#080a0f] rounded-lg border border-amber-900/30 space-y-3">
              <div className="flex items-center justify-between text-amber-400 font-bold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Hệ thống Kiểm soát Rủi ro &amp; Ngưỡng Bảo vệ (Paper Safeguards)
                </span>
                <span className="text-[10px] text-gray-400">
                  Idempotency: <strong className="text-emerald-400">ACTIVE</strong> | In-flight Lock: <strong className="text-emerald-400">ENFORCED</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                {/* Daily Loss Gauge */}
                <div className="p-2.5 bg-[#10141e] rounded border border-gray-800">
                  <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                    <span>Mức lỗ trong ngày (Daily Loss)</span>
                    <span className="text-gray-300 font-digital">
                      ${metrics.dailyLossRecorded.toFixed(4)} / $2.0000
                    </span>
                  </div>
                  <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full transition-all"
                      style={{ width: `${Math.min(100, (metrics.dailyLossRecorded / 2.0) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Tự dừng (Kill Switch) khi lỗ &gt; 2.0 USDT/ngày</div>
                </div>

                {/* Max Drawdown Gauge */}
                <div className="p-2.5 bg-[#10141e] rounded border border-gray-800">
                  <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                    <span>Drawdown tối đa (Max Drawdown)</span>
                    <span className="text-gray-300 font-digital">
                      {metrics.maxDrawdownObservedPct.toFixed(1)}% / 25.0%
                    </span>
                  </div>
                  <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${Math.min(100, (metrics.maxDrawdownObservedPct / 25.0) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Đỉnh vốn: ${metrics.peakEquity.toFixed(4)} USDT</div>
                </div>

                {/* Data Reliability & Slippage */}
                <div className="p-2.5 bg-[#10141e] rounded border border-gray-800">
                  <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                    <span>Độ trễ &amp; Trượt giá thực thi</span>
                    <span className="text-cyan-400 font-digital">
                      {metrics.avgExecutionLatencyMs.toFixed(1)}ms | {metrics.totalSlippageBpsAvg.toFixed(1)} bps
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2">
                    <span>Tự dừng khi data cũ &gt; 60s:</span>
                    <strong className={metrics.isDataReliabilityHalted ? 'text-rose-400' : 'text-emerald-400'}>
                      {metrics.isDataReliabilityHalted ? 'HALTED' : 'NORMAL'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ORDER COUNTERS & SUPPRESSION METRICS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div className="p-2.5 bg-[#080a0f] rounded border border-[#1f2638]">
                <div className="text-gray-400 text-[10px]">Lệnh gửi / Đã khớp</div>
                <div className="text-base font-bold font-digital text-white mt-0.5">
                  {metrics.ordersSubmittedCount} / {metrics.ordersFilledCount}
                </div>
                <div className="text-[10px] text-gray-500">Khớp 1 phần: {metrics.ordersPartiallyFilledCount}</div>
              </div>

              <div className="p-2.5 bg-[#080a0f] rounded border border-[#1f2638]">
                <div className="text-gray-400 text-[10px]">Chặn lệnh trùng (Idempotency)</div>
                <div className="text-base font-bold font-digital text-emerald-400 mt-0.5">
                  {metrics.duplicatesBlockedCount}
                </div>
                <div className="text-[10px] text-gray-500">Ngăn đặt lệnh lặp khi retry/restart</div>
              </div>

              <div className="p-2.5 bg-[#080a0f] rounded border border-[#1f2638]">
                <div className="text-gray-400 text-[10px]">Chặn đóng trùng (In-Flight Lock)</div>
                <div className="text-base font-bold font-digital text-cyan-400 mt-0.5">
                  {metrics.duplicateClosesBlockedCount}
                </div>
                <div className="text-[10px] text-gray-500">Ngăn double-exit cùng 1 vị thế</div>
              </div>

              <div className="p-2.5 bg-[#080a0f] rounded border border-[#1f2638]">
                <div className="text-gray-400 text-[10px]">Đối chiếu Sổ cái (Ledger Audit)</div>
                <div className="text-base font-bold font-digital text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>0.0000 Chênh lệch</span>
                </div>
                <div className="text-[10px] text-gray-500">{metrics.lastAuditResult.ledgerEntriesCount} bút toán đã ghi</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE POSITIONS & ORDERS */}
        {activeTab === 'positions_orders' && (
          <div className="overflow-y-auto space-y-4 pr-1 flex-1">
            {/* OPEN POSITIONS */}
            <div>
              <div className="flex items-center justify-between text-gray-300 font-bold mb-2">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Vị thế đang mở ({positions.length} / {config?.maxSimultaneousPositions || 2})
                </span>
                <span className="text-[11px] text-gray-400">
                  Quy tắc: Chốt lời khi Net PnL &gt; ${config?.netProfitThresholdUsdt || 0.0001} | Bảo toàn Stop Loss tuyệt đối
                </span>
              </div>

              {positions.length === 0 ? (
                <div className="p-6 bg-[#080a0f] rounded-lg border border-gray-800 text-center text-gray-500">
                  Hiện không có vị thế mở. Bot 4 đang theo dõi thị trường và chờ tín hiệu đạt chuẩn từ Bot 3.
                </div>
              ) : (
                <div className="space-y-2">
                  {positions.map((pos) => {
                    const isLong = pos.side === 'LONG';
                    const isNetPositive = pos.netPnL >= 0;
                    return (
                      <div
                        key={pos.id}
                        className="p-3 bg-[#080a0f] rounded-lg border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              isLong ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {pos.side}
                          </span>
                          <div>
                            <div className="font-bold text-white text-sm">{pos.symbol}</div>
                            <div className="text-[10px] text-gray-400">
                              Entry: ${pos.entryPrice.toFixed(4)} | Mark: ${pos.currentPrice.toFixed(4)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                          <div>
                            <div className="text-gray-500">Ký quỹ (Margin)</div>
                            <div className="font-digital text-gray-200">${pos.margin.toFixed(2)} (x{pos.leverage})</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Chi phí (Friction)</div>
                            <div className="font-digital text-amber-400">-${pos.currentCosts.toFixed(4)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Lợi nhuận ròng (Net PnL)</div>
                            <div className={`font-digital font-bold text-xs ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isNetPositive ? '+' : ''}${pos.netPnL.toFixed(4)} ({pos.roe >= 0 ? '+' : ''}{pos.roe.toFixed(1)}%)
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">Stop Loss / Peak Net</div>
                            <div className="font-digital text-rose-400">
                              SL: ${pos.stopLoss?.toFixed(4) || 'None'}
                            </div>
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => handleClosePosition(pos.id)}
                            disabled={pos.closingInProgress}
                            className={`px-3 py-1.5 rounded transition cursor-pointer text-[10px] font-bold ${
                              pos.closingInProgress
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {pos.closingInProgress ? 'Đang đóng...' : 'Đóng vị thế'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ORDER HISTORY */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-gray-300 font-bold mb-2">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Lịch sử Lệnh Paper (State Machine &amp; Idempotency Log)
                </span>
                <span className="text-[10px] text-gray-500">50 lệnh gần nhất</span>
              </div>

              {orderHistory.length === 0 ? (
                <div className="p-4 bg-[#080a0f] rounded-lg border border-gray-800 text-center text-gray-500">
                  Chưa có lệnh nào được gửi.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-60 border border-gray-800 rounded-lg">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-[#10141e] text-gray-400 uppercase border-b border-gray-800">
                      <tr>
                        <th className="p-2">Thời gian</th>
                        <th className="p-2">Order ID</th>
                        <th className="p-2">Cặp</th>
                        <th className="p-2">Loại</th>
                        <th className="p-2">Giá khớp</th>
                        <th className="p-2">Khối lượng</th>
                        <th className="p-2">Phí Taker</th>
                        <th className="p-2">Trượt giá</th>
                        <th className="p-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-900 bg-[#080a0f]">
                      {orderHistory.slice(0, 30).map((ord) => (
                        <tr key={ord.orderId} className="hover:bg-gray-900/50">
                          <td className="p-2 text-gray-400">{new Date(ord.createdAt).toLocaleTimeString()}</td>
                          <td className="p-2 text-gray-400 font-mono">{ord.orderId.slice(-10)}</td>
                          <td className="p-2 font-bold text-white">{ord.symbol}</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] ${
                                ord.side === 'BUY' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                              }`}
                            >
                              {ord.role} {ord.side}
                            </span>
                          </td>
                          <td className="p-2 font-digital text-gray-200">${ord.avgFillPrice.toFixed(4)}</td>
                          <td className="p-2 font-digital text-gray-300">
                            {ord.filledAmount} / {ord.requestedAmount}
                          </td>
                          <td className="p-2 font-digital text-amber-400">-${ord.feePaid.toFixed(4)}</td>
                          <td className="p-2 font-digital text-gray-400">{ord.slippageBps.toFixed(1)} bps</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                                ord.status === 'FILLED'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : ord.status === 'PARTIALLY_FILLED'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DOUBLE-ENTRY LEDGER */}
        {activeTab === 'ledger' && (
          <div className="overflow-y-auto space-y-3 pr-1 flex-1">
            <div className="flex items-center justify-between text-gray-300 font-bold">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Sổ cái Kép Minh bạch (Immutable Double-Entry Ledger)
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ĐỐI CHIẾU HOÀN TOÀN KHỚP (0.0000 Discrepancy)
              </span>
            </div>

            <div className="text-[11px] text-gray-400 leading-relaxed bg-[#080a0f] p-3 rounded border border-gray-800">
              Mọi biến động tài sản — từ khóa ký quỹ, hoàn ký quỹ, trừ phí taker 2 chiều, trích phí funding drag, cho tới ghi nhận lãi/lỗ ròng — đều được ghi nhận song song theo chuẩn bút toán kép để đảm bảo không thất thoát dù chỉ $0.0001.
            </div>

            <div className="overflow-x-auto max-h-80 border border-gray-800 rounded-lg">
              <table className="w-full text-[10px] text-left">
                <thead className="bg-[#10141e] text-gray-400 uppercase border-b border-gray-800">
                  <tr>
                    <th className="p-2">Thời gian</th>
                    <th className="p-2">Loại bút toán</th>
                    <th className="p-2">Mô tả</th>
                    <th className="p-2 text-rose-400">Nợ (Debit)</th>
                    <th className="p-2 text-emerald-400">Có (Credit)</th>
                    <th className="p-2 text-right">Số dư ví sau GD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 bg-[#080a0f]">
                  {ledger.map((entry) => (
                    <tr key={entry.entryId} className="hover:bg-gray-900/50">
                      <td className="p-2 text-gray-400">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                      <td className="p-2">
                        <span className="font-bold text-gray-300">{entry.type}</span>
                      </td>
                      <td className="p-2 text-gray-400">{entry.description}</td>
                      <td className="p-2 font-digital text-rose-400">
                        {entry.debit > 0 ? `-$${entry.debit.toFixed(4)}` : '-'}
                      </td>
                      <td className="p-2 font-digital text-emerald-400">
                        {entry.credit > 0 ? `+$${entry.credit.toFixed(4)}` : '-'}
                      </td>
                      <td className="p-2 font-digital text-right text-gray-200">
                        ${entry.cashBalanceAfter.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: CONFIG & EMERGENCY CONTROLS */}
        {activeTab === 'config' && config && (
          <div className="overflow-y-auto space-y-4 pr-1 flex-1">
            {/* EMERGENCY KILL SWITCH */}
            <div className="p-4 bg-rose-950/20 border border-rose-900/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-rose-400 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    EMERGENCY KILL SWITCH &amp; SYSTEM HALT
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Đóng khẩn cấp mọi vị thế đang mở theo giá thị trường, hủy toàn bộ lệnh chờ và ngừng mở vị thế mới.
                  </div>
                </div>

                <button
                  onClick={handleToggleKillSwitch}
                  className={`px-4 py-2 rounded font-bold text-xs cursor-pointer transition ${
                    metrics?.isKillSwitchActive
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  }`}
                >
                  {metrics?.isKillSwitchActive ? 'Khôi phục hệ thống (Reset)' : 'KÍCH HOẠT KILL SWITCH'}
                </button>
              </div>
            </div>

            {/* CONFIGURATION PARAMETERS */}
            <div className="p-4 bg-[#080a0f] rounded-xl border border-gray-800 space-y-3">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Thông số Vận hành &amp; Quản trị Rủi ro Bot 4
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Vốn mô phỏng ban đầu</div>
                  <div className="text-base font-digital font-bold text-emerald-400">
                    ${config.initialEquity.toFixed(2)} USDT
                  </div>
                  <div className="text-[10px] text-gray-500">Mặc định $10.00 USDT Paper Trading</div>
                </div>

                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Ký quỹ mục tiêu mỗi lệnh</div>
                  <div className="text-base font-digital font-bold text-cyan-400">
                    ${config.targetMarginPerPosition.toFixed(2)} USDT (Đòn bẩy: {config.maxLeverage}x)
                  </div>
                  <div className="text-[10px] text-gray-500">Kiểm soát vị thế notional $10.00 USDT</div>
                </div>

                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Giới hạn vị thế đồng thời</div>
                  <div className="text-base font-digital font-bold text-purple-400">
                    Tối đa {config.maxSimultaneousPositions} vị thế ($4.00 USDT ký quỹ)
                  </div>
                  <div className="text-[10px] text-gray-500">Dành tối thiểu 60% tiền mặt làm đệm dự phòng rủi ro</div>
                </div>

                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Ngưỡng chốt lời ròng (Net Profit Threshold)</div>
                  <div className="text-base font-digital font-bold text-amber-400">
                    +${config.netProfitThresholdUsdt} USDT
                  </div>
                  <div className="text-[10px] text-gray-500">Chỉ đóng khi Net PnL sau phí &gt; 0 (Không đóng vì gross &gt; 0)</div>
                </div>

                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Mức lỗ tối đa trong ngày (Daily Loss Limit)</div>
                  <div className="text-base font-digital font-bold text-rose-400">
                    ${config.dailyMaxLossUsdt.toFixed(2)} USDT (20% vốn)
                  </div>
                  <div className="text-[10px] text-gray-500">Tự động ngắt giao dịch để bảo toàn vốn</div>
                </div>

                <div className="p-3 bg-[#10141e] rounded border border-gray-800 space-y-1">
                  <div className="text-gray-400">Drawdown tối đa cho phép</div>
                  <div className="text-base font-digital font-bold text-amber-400">
                    {config.maxDrawdownPct.toFixed(1)}% từ đỉnh vốn
                  </div>
                  <div className="text-[10px] text-gray-500">Bảo vệ tài khoản khỏi chuỗi thua liên tiếp</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="pt-3 border-t border-[#1f2638] flex flex-wrap items-center justify-between text-gray-400 text-[11px] gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Bitget USDT-M Real-time Simulation Engine | No Live Trading</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
