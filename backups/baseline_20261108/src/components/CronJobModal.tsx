import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Link as LinkIcon,
  Copy,
  Check,
  Play,
  Server,
  Globe,
  Terminal,
  Activity,
  ExternalLink,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

interface CronJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CronJobModal: React.FC<CronJobModalProps> = ({ isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cronjob_org' | 'uptimerobot' | 'crontab' | 'github'>('cronjob_org');
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  // Fallback domain from metadata or current browser origin
  const [origin, setOrigin] = useState<string>('https://ais-dev-s73nnjkdacuewo5chfevgx-561671924519.asia-southeast1.run.app');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  if (!isOpen) return null;

  const cronUrl = `${origin}/api/cron`;
  const pingUrl = `${origin}/api/cron/ping`;
  const infoUrl = `${origin}/api/cron/info`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleTestCron = async (endpoint: string) => {
    setTestLoading(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      const latency = Math.round(performance.now() - start);
      setTestLatency(latency);
      setTestResult({ status: res.status, ok: res.ok, data });
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      setTestLatency(latency);
      setTestResult({ status: 500, ok: false, error: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn font-mono">
      <div className="bg-[#0f131c] border border-cyan-900/60 rounded-2xl max-w-2xl w-full p-5 shadow-2xl text-xs text-gray-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2430]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950/80 border border-cyan-700/60 rounded-lg text-cyan-400">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>KẾT NỐI CRONJOB & WEBHOOK 24/7</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.2 rounded-full font-sans">
                  ACTIVE
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                Link HTTP Webhook để dịch vụ bên ngoài tự động gọi chu kỳ quét 5-Bot & giữ máy chủ online
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="my-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Main Link Cards */}
          <div className="space-y-3">
            {/* Primary Trigger Link */}
            <div className="bg-[#141924] border border-emerald-800/50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Link Kích Hoạt Chu Kỳ Quét & Giao Dịch (Auto Scalp)
                </span>
                <span className="text-[10px] text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold">
                  GET & POST (Mỗi 60s)
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Dùng link này cho <strong>cron-job.org</strong> hoặc <strong>Cloud Scheduler</strong>. Khi link được gọi, hệ thống sẽ tự động quét 850+ cặp Bitget Futures, phân tích kỹ thuật và quản lý chốt lời ngay lập tức.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#090c12] border border-gray-700/80 rounded-lg px-3 py-2 text-cyan-300 font-mono text-[11px] select-all truncate">
                  {cronUrl}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cronUrl, 'cronUrl')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer text-xs"
                >
                  {copiedKey === 'cronUrl' ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Đã chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={() => handleTestCron(cronUrl)}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-cyan-800/60 rounded-lg flex items-center gap-1.5 transition shrink-0 cursor-pointer text-xs"
                  title="Gửi 1 yêu cầu thật tới link này để kiểm tra phản hồi"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Link</span>
                </button>
              </div>
            </div>

            {/* Keep-Alive Ping Link */}
            <div className="bg-[#141924] border border-cyan-900/40 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-bold flex items-center gap-1.5 text-xs">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Link Giữ Máy Chủ Online 24/7 (Keep-Alive Ping)
                </span>
                <span className="text-[10px] text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                  GET (Mỗi 3-5 phút)
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Dùng link này cho <strong>UptimeRobot</strong> hoặc dịch vụ theo dõi uptime. Giúp máy chủ backend luôn thức, không bị ngủ đông kể cả khi bạn đóng trình duyệt hoặc tắt điện thoại.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#090c12] border border-gray-700/80 rounded-lg px-3 py-2 text-cyan-300 font-mono text-[11px] select-all truncate">
                  {pingUrl}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(pingUrl, 'pingUrl')}
                  className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer text-xs"
                >
                  {copiedKey === 'pingUrl' ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Đã chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={() => handleTestCron(pingUrl)}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-cyan-800/60 rounded-lg flex items-center gap-1.5 transition shrink-0 cursor-pointer text-xs"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Ping</span>
                </button>
              </div>
            </div>
          </div>

          {/* Test Result Display */}
          {(testLoading || testResult) && (
            <div className="p-3 bg-[#0a0e16] border border-cyan-800/60 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300 font-bold flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  Kết Quả Kiểm Tra Link Trực Tiếp:
                </span>
                {testLoading ? (
                  <span className="text-amber-400 flex items-center gap-1 animate-pulse">
                    Đang gửi yêu cầu...
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    HTTP {testResult?.status} OK ({testLatency}ms)
                  </span>
                )}
              </div>
              {testResult && (
                <pre className="p-2.5 bg-[#05070a] border border-gray-800 rounded text-[11px] text-emerald-300 overflow-x-auto max-h-36 leading-tight">
                  {JSON.stringify(testResult.data || testResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Guides & Instructions Tabs */}
          <div className="space-y-3 pt-2">
            <div className="text-gray-300 font-bold flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              Hướng Dẫn Cài Đặt Từng Nền Tảng (Chọn nền tảng bạn sử dụng):
            </div>

            {/* Tab Buttons */}
            <div className="flex flex-wrap gap-1.5 border-b border-gray-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('cronjob_org')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'cronjob_org'
                    ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                    : 'bg-[#141924] text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>1. cron-job.org (Khuyên dùng - Miễn phí)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('uptimerobot')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'uptimerobot'
                    ? 'bg-cyan-900/80 text-cyan-300 border border-cyan-600'
                    : 'bg-[#141924] text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>2. UptimeRobot</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('crontab')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'crontab'
                    ? 'bg-amber-900/80 text-amber-300 border border-amber-600'
                    : 'bg-[#141924] text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>3. Linux Crontab / VPS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('github')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'github'
                    ? 'bg-purple-900/80 text-purple-300 border border-purple-600'
                    : 'bg-[#141924] text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <Server className="w-3.5 h-3.5 text-purple-400" />
                <span>4. GitHub Actions Cron</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="bg-[#141924]/70 p-3.5 rounded-xl border border-gray-800 space-y-2.5 text-[11px] leading-relaxed">
              {activeTab === 'cronjob_org' && (
                <div className="space-y-2">
                  <div className="text-white font-bold flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">✓</span>
                    <span>Cài đặt trên cron-job.org (Miễn phí 100%, không cần thẻ tín dụng)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1">
                    <li>Truy cập website <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold inline-flex items-center gap-0.5">cron-job.org <ExternalLink className="w-2.5 h-2.5" /></a> và đăng ký tài khoản miễn phí.</li>
                    <li>Bấm nút <strong>Create Cronjob</strong>.</li>
                    <li>
                      Tại ô <strong>Title</strong>: đặt tên <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">Bitget 5-Bot Auto-Trade</code>.
                    </li>
                    <li>
                      Tại ô <strong>URL</strong>: Dán link:
                      <div className="my-1 p-2 bg-[#080b11] border border-gray-700 rounded text-cyan-300 flex items-center justify-between select-all">
                        <span>{cronUrl}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(cronUrl, 'cronTab1')}
                          className="text-gray-400 hover:text-white cursor-pointer ml-2"
                        >
                          {copiedKey === 'cronTab1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </li>
                    <li>
                      Tại mục <strong>Schedule</strong>: Chọn <strong>Every 1 minute</strong> (hoặc Every 2 minutes tùy nhu cầu).
                    </li>
                    <li>
                      Tại mục <strong>Request Method</strong>: Để mặc định <strong>GET</strong> (hoặc POST).
                    </li>
                    <li>Bấm <strong>Create</strong> để lưu. Dịch vụ sẽ tự động kích hoạt bot định kỳ 24/7!</li>
                  </ol>
                </div>
              )}

              {activeTab === 'uptimerobot' && (
                <div className="space-y-2">
                  <div className="text-white font-bold flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px]">✓</span>
                    <span>Cài đặt trên UptimeRobot (Giữ máy chủ online 24/7)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1">
                    <li>Truy cập <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold inline-flex items-center gap-0.5">uptimerobot.com <ExternalLink className="w-2.5 h-2.5" /></a> và đăng nhập.</li>
                    <li>Bấm <strong>+ Add New Monitor</strong>.</li>
                    <li>Chọn <strong>Monitor Type: HTTP(s)</strong>.</li>
                    <li>Đặt <strong>Friendly Name:</strong> <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">MEO AI Trading Engine</code>.</li>
                    <li>Dán link URL: <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">{pingUrl}</code>.</li>
                    <li>Chọn <strong>Monitoring Interval: 5 minutes</strong> và bấm <strong>Create Monitor</strong>.</li>
                  </ol>
                </div>
              )}

              {activeTab === 'crontab' && (
                <div className="space-y-2">
                  <div className="text-white font-bold flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">✓</span>
                    <span>Lệnh Crontab trên Linux / VPS / Terminal</span>
                  </div>
                  <p className="text-gray-300">
                    Mở terminal trên máy tính hoặc VPS của bạn, gõ <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">crontab -e</code> và thêm dòng sau vào cuối:
                  </p>
                  <div className="p-2.5 bg-[#080b11] border border-gray-700 rounded text-amber-300 flex items-center justify-between select-all font-mono text-[11px]">
                    <code>* * * * * curl -s &quot;{cronUrl}&quot; &gt; /dev/null 2&gt;&amp;1</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`* * * * * curl -s "${cronUrl}" > /dev/null 2>&1`, 'crontabCmd')}
                      className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                    >
                      {copiedKey === 'crontabCmd' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>Sao chép lệnh</span>
                    </button>
                  </div>
                  <p className="text-gray-400 text-[10px]">
                    Lệnh này sẽ tự động ping và kích hoạt chu kỳ quét mỗi phút một lần.
                  </p>
                </div>
              )}

              {activeTab === 'github' && (
                <div className="space-y-2">
                  <div className="text-white font-bold flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">✓</span>
                    <span>Tự động kích hoạt qua GitHub Actions</span>
                  </div>
                  <p className="text-gray-300">
                    Tạo file <code className="text-purple-300 bg-black/40 px-1 py-0.5 rounded">.github/workflows/cron.yml</code> trong repository GitHub của bạn:
                  </p>
                  <pre className="p-2.5 bg-[#080b11] border border-gray-700 rounded text-purple-300 text-[10px] overflow-x-auto leading-tight select-all">
{`name: Bitget 5-Bot Cron
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  ping-engine:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Trading Cycle
        run: curl -s "${cronUrl}"`}
                  </pre>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`name: Bitget 5-Bot Cron\non:\n  schedule:\n    - cron: '*/5 * * * *'\n  workflow_dispatch:\n\njobs:\n  ping-engine:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Trigger Trading Cycle\n        run: curl -s "${cronUrl}"`, 'githubYaml')}
                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'githubYaml' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>Sao chép YAML</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#1f2430] flex items-center justify-between">
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Link hoạt động công khai, an toàn, hỗ trợ CORS và phản hồi JSON chuẩn.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1a202c] hover:bg-gray-700 text-white rounded-lg font-semibold cursor-pointer transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
