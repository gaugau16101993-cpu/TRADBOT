import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { serverEngine } from './src/server/engine.ts';
import { getPaginatedTrades, exportAllTradesToCSV } from './src/server/storage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // API Endpoints for 24/7 Trading Engine
  app.get('/api/engine/state', (req, res) => {
    res.json(serverEngine.getState());
  });

  // Master Agent Orchestrator Endpoints (Directive Section B)
  app.get('/api/engine/master-agent/status', (req, res) => {
    res.json(serverEngine.getMasterAgent().getStatus());
  });

  app.get('/api/engine/master-agent/events', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const type = req.query.type as any;
    res.json({
      events: serverEngine.getMasterAgent().getEventBus().getRecentEvents(limit, type),
    });
  });

  app.post('/api/engine/master-agent/halt', (req, res) => {
    const reason = req.body.reason || 'User manual emergency halt';
    serverEngine.getMasterAgent().triggerEmergencyHalt(reason);
    res.json({ success: true, status: serverEngine.getMasterAgent().getStatus() });
  });

  app.post('/api/engine/master-agent/resume', (req, res) => {
    serverEngine.getMasterAgent().resumeFromHalt();
    res.json({ success: true, status: serverEngine.getMasterAgent().getStatus() });
  });

  app.post('/api/engine/master-agent/recover/:botId', async (req, res) => {
    const botId = req.params.botId as any;
    const success = await serverEngine.getMasterAgent().recoverBot(botId);
    res.json({ success, status: serverEngine.getMasterAgent().getStatus() });
  });

  // Bot 1 Market Scanner Pro Endpoints
  app.get('/api/engine/bot1/metrics', (req, res) => {
    res.json(serverEngine.getScanner().getMetrics());
  });

  app.get('/api/engine/bot1/config', (req, res) => {
    res.json(serverEngine.getScanner().getFilterConfig());
  });

  app.post('/api/engine/bot1/config', (req, res) => {
    const { config } = req.body;
    if (config) {
      serverEngine.getScanner().updateFilterConfig(config);
    }
    res.json({ success: true, config: serverEngine.getScanner().getFilterConfig() });
  });

  app.post('/api/engine/bot1/scan', async (req, res) => {
    try {
      const result = await serverEngine.getScanner().scanUniverse();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bot 2 Advanced Market Analyst Endpoints
  app.get('/api/engine/bot2/analysis', (req, res) => {
    res.json(serverEngine.getState().bot2Analysis || null);
  });

  app.post('/api/engine/bot2/analyze', async (req, res) => {
    try {
      const symbol = req.body.symbol || serverEngine.getState().botState.bot1.topCandidate || 'BTCUSDT';
      const ticker = serverEngine.getState().tickers[symbol] || {
        symbol,
        lastPr: 80400,
        bidPr: 80399,
        askPr: 80401,
        change24h: 0,
        high24h: 81000,
        low24h: 79500,
        volume24h: 100000000,
        updatedAt: Date.now(),
      };
      const analysis = await serverEngine.getBot2Analyst().analyzeMarket(symbol, ticker);
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bot 3 Signal Engine Pro Endpoints
  app.get('/api/engine/bot3/signals', (req, res) => {
    const engine = serverEngine.getBot3Engine();
    res.json({
      activeSignals: engine.getActiveSignals(),
      recentSignalsHistory: engine.getSignalHistory(),
      lastEvaluations: engine.getLastEvaluations(),
      performance: engine.getPerformanceMetrics(),
      config: engine.getConfig(),
    });
  });

  app.get('/api/engine/bot3/config', (req, res) => {
    res.json(serverEngine.getBot3Engine().getConfig());
  });

  app.post('/api/engine/bot3/config', (req, res) => {
    const { config } = req.body;
    if (config) {
      serverEngine.getBot3Engine().updateConfig(config);
    }
    res.json({ success: true, config: serverEngine.getBot3Engine().getConfig() });
  });

  app.post('/api/engine/bot3/evaluate', async (req, res) => {
    try {
      const symbol = req.body.symbol || serverEngine.getState().botState.bot1.topCandidate || 'BTCUSDT';
      const ticker = serverEngine.getState().tickers[symbol] || {
        symbol,
        lastPr: 80400,
        bidPr: 80399,
        askPr: 80401,
        change24h: 0,
        high24h: 81000,
        low24h: 79500,
        volume24h: 100000000,
        updatedAt: Date.now(),
      };
      const analysis = await serverEngine.getBot2Analyst().analyzeMarket(symbol, ticker);
      const evaluation = serverEngine.getBot3Engine().evaluateCandidate(analysis, ticker);
      res.json({ success: true, evaluation, analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/engine/bot3/backtest', async (req, res) => {
    try {
      const symbol = req.body.symbol || 'BTCUSDT';
      const timeframe = req.body.timeframe || '5m';
      const candles = await serverEngine.getBot2Analyst().fetchTimeframeCandles(symbol, timeframe, 100);
      const result = serverEngine.getBot3Engine().runBacktest(candles, symbol, 0.6);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bot 4 Execution & Risk Manager Endpoints
  app.get('/api/engine/bot4/status', (req, res) => {
    const manager = serverEngine.getBot4Manager();
    res.json({
      metrics: manager.getMetrics(),
      positions: manager.getPositions(),
      config: manager.getConfig(),
    });
  });

  app.get('/api/engine/bot4/orders', (req, res) => {
    const manager = serverEngine.getBot4Manager();
    res.json({
      activeOrders: manager.getOrders(),
      orderHistory: manager.getOrderHistory(),
    });
  });

  app.get('/api/engine/bot4/ledger', (req, res) => {
    const manager = serverEngine.getBot4Manager();
    res.json({
      ledger: manager.getLedger(),
      audit: manager.auditLedgerConsistency(),
    });
  });

  app.get('/api/engine/bot4/config', (req, res) => {
    res.json(serverEngine.getBot4Manager().getConfig());
  });

  app.post('/api/engine/bot4/config', (req, res) => {
    const { config } = req.body;
    if (config) {
      serverEngine.getBot4Manager().updateConfig(config);
    }
    res.json({ success: true, config: serverEngine.getBot4Manager().getConfig() });
  });

  app.post('/api/engine/bot4/kill-switch', (req, res) => {
    const { action, reason } = req.body;
    const manager = serverEngine.getBot4Manager();
    if (action === 'RESET') {
      manager.resetKillSwitch();
    } else {
      manager.triggerKillSwitch(reason || 'Manual user trigger from dashboard');
    }
    res.json({ success: true, metrics: manager.getMetrics() });
  });

  app.post('/api/engine/bot4/heartbeat', (req, res) => {
    const heartbeat = serverEngine.getBot4Manager().runHeartbeat();
    res.json({ success: true, heartbeat });
  });

  // Independent Risk Governor Endpoints
  app.get('/api/engine/risk-governor/status', (req, res) => {
    const gov = serverEngine.getRiskGovernor();
    res.json({
      config: gov.getConfig(),
      telemetry: gov.getTelemetry(),
    });
  });

  app.post('/api/engine/risk-governor/config', (req, res) => {
    const { config } = req.body;
    if (config) {
      serverEngine.getRiskGovernor().updateConfig(config);
    }
    res.json({ success: true, config: serverEngine.getRiskGovernor().getConfig() });
  });

  app.post('/api/engine/risk-governor/reset-circuit-breaker', (req, res) => {
    serverEngine.getRiskGovernor().resetCircuitBreaker();
    res.json({ success: true, telemetry: serverEngine.getRiskGovernor().getTelemetry() });
  });

  // Forensic Audit Ledger & Comparative Deliverable Endpoint
  app.get('/api/engine/audit-report/v2', (req, res) => {
    res.json(serverEngine.getAuditV2Forensics());
  });

  // Forensic Audit Report 2026-11-08 Endpoint
  app.get('/api/engine/audit/forensic-summary', (req, res) => {
    try {
      const reportPath = path.resolve(process.cwd(), 'data', 'forensic_audit_report_20261108.json');
      if (fs.existsSync(reportPath)) {
        const raw = fs.readFileSync(reportPath, 'utf8');
        return res.json(JSON.parse(raw));
      }
      res.json({ status: 'REPORT_PENDING', message: 'Forensic audit report is generating' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5-Bot End-to-End Pipeline Endpoints
  app.get('/api/engine/pipeline', (req, res) => {
    res.json(serverEngine.getPipelineSnapshot());
  });

  // TradingAgents Multi-Agent Debate Endpoint
  app.get('/api/engine/tradingagents/debate', (req, res) => {
    const pipeline = serverEngine.getPipelineSnapshot();
    res.json(pipeline?.bot3Payload?.tradingAgentsDebate || null);
  });

  // Bot 5 Loss Analysis & Feedback Endpoints
  app.get('/api/engine/bot5/metrics', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getMetrics());
  });

  app.get('/api/engine/bot5/history', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getPostMortemHistory());
  });

  app.get('/api/engine/bot5/adjustments', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getAdjustmentHistory());
  });

  app.get('/api/engine/bot5/proposals', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getProposals());
  });

  app.post('/api/engine/bot5/apply-proposal', (req, res) => {
    const { proposalId, comment } = req.body;
    if (!proposalId) return res.status(400).json({ error: 'Missing proposalId' });
    const success = serverEngine.applyBot5Proposal(proposalId, comment);
    res.json({ success });
  });

  app.post('/api/engine/bot5/reject-proposal', (req, res) => {
    const { proposalId, reason } = req.body;
    if (!proposalId) return res.status(400).json({ error: 'Missing proposalId' });
    const success = serverEngine.rejectBot5Proposal(proposalId, reason);
    res.json({ success });
  });

  app.get('/api/engine/bot5/versions', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getVersionHistory());
  });

  app.post('/api/engine/bot5/rollback', (req, res) => {
    const { targetVersion } = req.body;
    if (!targetVersion) return res.status(400).json({ error: 'Missing targetVersion' });
    const success = serverEngine.rollbackBot5Model(targetVersion);
    res.json({ success });
  });

  // =========================================================================
  // EVOLUTION & INDEPENDENT VALIDATOR LAB ENDPOINTS
  // =========================================================================
  app.get('/api/engine/evolution/status', (req, res) => {
    try {
      const bot5 = serverEngine.getBot5LossEngine();
      res.json({
        currentChampion: bot5.getCurrentModelVersion(),
        challengers: bot5.getChallengers(),
        latestAuditReport: bot5.getAuditReports()[0] || null,
        rollbackHistory: bot5.getRollbackHistory(),
        versionHistory: bot5.getVersionHistory(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/engine/evolution/reports', (req, res) => {
    try {
      res.json(serverEngine.getBot5LossEngine().getAuditReports());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/engine/evolution/validate', async (req, res) => {
    try {
      const { symbol, challengerId } = req.body;
      const report = await serverEngine.runIndependentValidation(symbol || 'BTCUSDT', challengerId);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/engine/evolution/promote', (req, res) => {
    try {
      const { challengerId } = req.body;
      const result = serverEngine.promoteChallenger(challengerId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/engine/evolution/rollback', (req, res) => {
    try {
      const { version, reason } = req.body;
      if (!version) return res.status(400).json({ error: 'Missing target version' });
      const success = serverEngine.rollbackChampion(version, reason || 'User triggered from Evolution Lab');
      res.json({ success, currentVersion: serverEngine.getBot5LossEngine().getCurrentModelVersion() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bot 5 Continuous Self-Learning: Challenger & NO_TRADE endpoints
  app.get('/api/engine/bot5/challenger', (req, res) => {
    res.json(serverEngine.getBot5LossEngine().getChallengerState());
  });

  app.post('/api/engine/bot5/promote-challenger', (req, res) => {
    const { reason } = req.body;
    const success = serverEngine.getBot5LossEngine().promoteChallenger(reason);
    res.json({
      success,
      challenger: serverEngine.getBot5LossEngine().getChallengerState(),
      currentVersion: serverEngine.getBot5LossEngine().getCurrentModelVersion(),
    });
  });

  app.get('/api/engine/bot5/no-trade', (req, res) => {
    res.json({
      history: serverEngine.getBot5LossEngine().getNoTradeHistory(),
      metrics: serverEngine.getBot5LossEngine().getNoTradeMetrics(),
    });
  });

  app.post('/api/engine/bot5/reset-params', (req, res) => {
    serverEngine.getBot5LossEngine().resetParameters();
    res.json({ success: true, metrics: serverEngine.getBot5LossEngine().getMetrics() });
  });

  // Bot 5 MEO AI v2.2 Knowledge Journal & External AI Learning endpoints
  app.get('/api/engine/bot5/journal', (req, res) => {
    res.json({
      journal: serverEngine.getBot5Journal(),
      blockedSymbols: serverEngine.getBot5LossEngine().getBlockedSymbols(),
    });
  });

  app.get('/api/engine/bot5/external-ai', (req, res) => {
    res.json({
      advice: serverEngine.getBot5ExternalAiAdvice(),
      apiKeyConfigured: !!process.env.GEMINI_API_KEY,
      nextConsultCountdownSeconds: serverEngine.getAiConsultCountdown(),
      consecutiveLossCount: serverEngine.getBot5LossEngine().getConsecutiveLossCount(),
      challenger: serverEngine.getBot5LossEngine().getChallengerState(),
    });
  });

  app.post('/api/engine/bot5/consult-ai', async (req, res) => {
    try {
      const result = await serverEngine.consultBot5ExternalAI(true);
      res.json({
        success: true,
        result,
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/engine/bot5/simulate-loss', (req, res) => {
    const { category, symbol } = req.body;
    const testSymbol = symbol || 'SOLUSDT';
    const fakeClosedLog = {
      tradeId: `TRD-SIM-${Date.now().toString().slice(-4)}`,
      signalId: `SIG-SIM-01`,
      symbol: testSymbol,
      side: 'LONG' as const,
      entryPrice: 100.0,
      exitPrice: category === 'SLIPPAGE_SPREAD_DRAG' ? 100.02 : 98.8,
      marginUsdt: 2.0,
      leverage: 5,
      notionalUsdt: 10.0,
      entryTime: Date.now() - 45000,
      exitTime: Date.now(),
      durationSeconds: 45,
      grossPnL: category === 'SLIPPAGE_SPREAD_DRAG' ? 0.002 : -0.12,
      openFee: 0.006,
      exitFee: 0.006,
      accruedFunding: category === 'FUNDING_DRAG' ? 0.015 : 0.0002,
      totalCosts: category === 'FUNDING_DRAG' ? 0.027 : 0.0122,
      netPnL: category === 'SLIPPAGE_SPREAD_DRAG' ? -0.0102 : -0.1322,
      roePct: -6.6,
      closeReason: (category === 'ATR_EXPANSION_WHIPSAW' ? 'STOP_LOSS' : 'NET_PNL_POSITIVE_TRIGGER') as any,
      entryIndicators: {
        rsi5m: category === 'RSI_EXHAUSTION_REVERSAL' ? 69.5 : 54.0,
        atr1m: 0.25,
        spreadBps: category === 'SLIPPAGE_SPREAD_DRAG' ? 7.2 : 2.5,
        confidenceScore: 78,
      },
    };
    const payload = serverEngine.getBot5LossEngine().bot5_runLossAnalysis(fakeClosedLog);
    res.json({ success: true, payload });
  });

  app.post('/api/engine/toggle', (req, res) => {
    const isRunning = serverEngine.toggleEngine();
    res.json({ success: true, isRunning });
  });

  // 24/7 Background Worker & System Health Telemetry
  app.get('/api/engine/worker/health', (req, res) => {
    res.json(serverEngine.getWorkerHealth());
  });

  // Telegram Alerts Configuration & Testing
  app.get('/api/engine/telegram/config', (req, res) => {
    res.json(serverEngine.getTelegramNotifier().getMaskedConfig());
  });

  app.post('/api/engine/telegram/config', (req, res) => {
    const { config } = req.body;
    if (config) {
      serverEngine.getTelegramNotifier().updateConfig(config);
      // Persist in settings
      const current = serverEngine.getState().settings;
      serverEngine.updateSettings({
        ...current,
        telegramEnabled: config.enabled ?? current.telegramEnabled,
        telegramBotToken: config.botToken !== undefined ? config.botToken : current.telegramBotToken,
        telegramChatId: config.chatId !== undefined ? config.chatId : current.telegramChatId,
        telegramNotifyOnOpen: config.notifyOnOpen ?? current.telegramNotifyOnOpen,
        telegramNotifyOnClose: config.notifyOnClose ?? current.telegramNotifyOnClose,
        telegramNotifyOnError: config.notifyOnError ?? current.telegramNotifyOnError,
        telegramNotifyHeartbeat: config.notifyHeartbeat ?? current.telegramNotifyHeartbeat,
        telegramHeartbeatIntervalMinutes: config.heartbeatIntervalMinutes ?? current.telegramHeartbeatIntervalMinutes,
      });
    }
    res.json({ success: true, config: serverEngine.getTelegramNotifier().getMaskedConfig() });
  });

  app.post('/api/engine/telegram/test', async (req, res) => {
    try {
      const { botToken, chatId } = req.body || {};
      const result = await serverEngine.getTelegramNotifier().sendTestMessage(botToken, chatId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/engine/toggle-autotrade', (req, res) => {
    const { autoTradingEnabled, autoCloseEnabled } = req.body;
    const result = serverEngine.toggleAutoTrade(autoTradingEnabled, autoCloseEnabled);
    res.json({ success: true, ...result });
  });

  // =========================================================================
  // CRONJOB & CLOUD SCHEDULER WEBHOOK ENDPOINTS
  // Allows external services (cron-job.org, Cloud Scheduler, UptimeRobot, GitHub Actions)
  // to trigger 60s trading cycles and keep server awake 24/7 via GET or POST.
  // =========================================================================
  const handleCronTrigger = async (req: express.Request, res: express.Response) => {
    try {
      const userAgent = (req.headers['user-agent'] as string) || 'external-cron';
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || 'external';
      
      serverEngine.addLog(
        `[CRONJOB WEBHOOK] Nhận tín hiệu kích hoạt từ dịch vụ ngoài (${userAgent.slice(0, 30)}...). Đang chạy chu kỳ quét 5-Bot...`,
        'cyan',
        'SYS'
      );

      // Reset countdown and run pipeline cycle
      await serverEngine.runPipelineCycle();
      const state = serverEngine.getState();

      res.json({
        success: true,
        service: 'MEO AI 5-Bot Trading Engine',
        exchange: 'Bitget USDT-M Futures',
        trigger: 'EXTERNAL_CRONJOB',
        clientUserAgent: userAgent,
        clientIp: clientIp,
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        cycleNumber: state.serverStats.totalCyclesRun,
        engineStatus: state.isEngineRunning ? 'RUNNING' : 'PAUSED',
        autoTradingEnabled: state.settings.autoTradingEnabled,
        walletBalance: state.walletBalance,
        activePositionsCount: state.positions.length,
        topCandidate: state.botState.bot1.topCandidate,
        nextScanInSeconds: state.cycleCountdown,
        message: 'Chu kỳ quét thị trường và quản lý vị thế 5-Bot đã thực thi thành công qua link CronJob.',
      });
    } catch (err: any) {
      console.error('[CRONJOB ERROR]', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Lỗi thực thi chu kỳ từ CronJob',
        timestamp: Date.now(),
      });
    }
  };

  // Primary cron endpoints (supports both GET and POST for cron-job.org, EasyCron, curl)
  app.get('/api/cron', handleCronTrigger);
  app.post('/api/cron', handleCronTrigger);
  app.get('/api/cron/trigger', handleCronTrigger);
  app.post('/api/cron/trigger', handleCronTrigger);
  app.get('/api/cron/cycle', handleCronTrigger);
  app.post('/api/cron/cycle', handleCronTrigger);

  // Keep-alive ping endpoint (for UptimeRobot, Pingdom, BetterStack)
  const handleCronPing = (req: express.Request, res: express.Response) => {
    const state = serverEngine.getState();
    const uptimeSec = Math.floor((Date.now() - state.serverStats.serverStartTime) / 1000);
    res.json({
      success: true,
      pong: true,
      service: 'MEO AI 24/7 Engine Keep-Alive',
      status: 'ONLINE',
      uptimeSeconds: uptimeSec,
      uptimeFormatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      activePositions: state.positions.length,
      walletBalance: state.walletBalance,
      totalTradesExecuted: state.serverStats.totalTradesExecuted,
      message: 'Máy chủ MEO AI đang trực tuyến 24/7.',
    });
  };
  app.get('/api/cron/ping', handleCronPing);
  app.post('/api/cron/ping', handleCronPing);

  // Endpoint delivering dynamic cron URL info and setup guides
  app.get('/api/cron/info', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;
    res.json({
      success: true,
      baseUrl,
      endpoints: {
        triggerCycle: {
          url: `${baseUrl}/api/cron`,
          methods: ['GET', 'POST'],
          description: 'Kích hoạt 1 chu kỳ quét toàn bộ thị trường Bitget USDT-M, phân tích kỹ thuật và quản lý đóng/mở vị thế.',
          recommendedInterval: '1 phút (60 giây)',
        },
        keepAlivePing: {
          url: `${baseUrl}/api/cron/ping`,
          methods: ['GET', 'POST'],
          description: 'Ping giữ máy chủ thức 24/7, chống sleep trên nền tảng Cloud.',
          recommendedInterval: '3 - 5 phút',
        },
      },
      curlExample: `curl -s "${baseUrl}/api/cron"`,
      crontabExample: `* * * * * curl -s "${baseUrl}/api/cron" > /dev/null 2>&1`,
    });
  });

  app.post('/api/engine/cycle', (req, res) => {
    serverEngine.runPipelineCycle();
    res.json({ success: true });
  });

  app.post('/api/engine/trade', (req, res) => {
    const { symbol, side } = req.body;
    if (!symbol || !side) {
      return res.status(400).json({ error: 'Missing symbol or side' });
    }
    const position = serverEngine.triggerPaperTrade(symbol, side);
    res.json({ success: !!position, position });
  });

  app.post('/api/engine/close-position', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing position id' });
    const success = serverEngine.closePositionById(id);
    res.json({ success });
  });

  // Capital Protection Bypass (Unrestricted Opportunity Finder)
  app.get('/api/engine/capital-protection', (req, res) => {
    res.json({
      bypassCapitalProtection: serverEngine.isBypassCapitalProtection(),
      status: serverEngine.isBypassCapitalProtection()
        ? 'UNRESTRICTED_OPPORTUNITY_MODE'
        : 'CONSERVATIVE_CAPITAL_PRESERVATION',
      message: serverEngine.isBypassCapitalProtection()
        ? 'Chế độ tìm cơ hội toàn lực: Không giới hạn bảo vệ vốn'
        : 'Chế độ bảo vệ vốn chuẩn định lượng đang bật',
    });
  });

  app.post('/api/engine/capital-protection', (req, res) => {
    const { bypassCapitalProtection } = req.body;
    const enabled = typeof bypassCapitalProtection === 'boolean' ? bypassCapitalProtection : true;
    serverEngine.setBypassCapitalProtection(enabled);
    res.json({
      success: true,
      bypassCapitalProtection: enabled,
      status: enabled ? 'UNRESTRICTED_OPPORTUNITY_MODE' : 'CONSERVATIVE_CAPITAL_PRESERVATION',
    });
  });

  // MEO AI V1 TIME & VOLATILITY FILTERS STATUS & TELEMETRY
  app.get('/api/engine/filters/time-volatility', (req, res) => {
    const now = Date.now();
    const d = new Date(now);
    const utcHour = d.getUTCHours();
    const utcMinute = d.getUTCMinutes();
    const utcSeconds = d.getUTCSeconds();
    const isBlackout = utcHour >= 1 && utcHour < 4;
    const isNight = utcHour >= 22 || utcHour < 6;

    const noTradeStats = serverEngine.getBot5LossEngine().getNoTradeMetrics();
    const breakdown = noTradeStats.breakdownByReason || {};

    let timeBlackoutCount = 0;
    let nightVolatilityCount = 0;
    Object.keys(breakdown).forEach((k) => {
      if (k.includes('TIME_FILTER_BLACKOUT')) timeBlackoutCount += breakdown[k];
      if (k.includes('NIGHT_VOLATILITY_DEFICIT')) nightVolatilityCount += breakdown[k];
    });

    res.json({
      success: true,
      currentUtcTime: `${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}:${String(utcSeconds).padStart(2, '0')} UTC`,
      utcHour,
      timeFilter: {
        rule: 'Tạm ngưng mở vị thế mới (No New Entries) từ 01:00 đến 04:00 UTC',
        blackoutWindow: '01:00 - 04:00 UTC',
        isBlackoutActive: isBlackout,
        status: isBlackout ? 'BLACKOUT_ACTIVE_NO_ENTRY' : 'NORMAL_SCANNING',
        autoResumeAt: '04:00:01 UTC',
        basis: 'Dữ liệu kiểm toán 604 giao dịch (dải giờ tập trung lỗ nặng nhất)',
        existingPositionsGuarded: true,
      },
      nightVolatilityFilter: {
        rule: 'Khung giờ đêm (22:00 - 06:00 UTC) yêu cầu ATR/biên độ tối thiểu cao hơn +40%',
        nightWindow: '22:00 - 06:00 UTC',
        isNightActive: isNight,
        status: isNight ? 'HIGH_THRESHOLD_ACTIVE_PLUS_40_PCT' : 'DAYTIME_STANDARD_THRESHOLD',
        boostMultiplier: 1.40,
        purpose: 'Loại bỏ fakeout và quét Stop Loss trong vùng biên độ hẹp',
      },
      telemetry: {
        totalNoTradeDecisions: noTradeStats.totalNoTradeEvaluations,
        timeBlackoutBlockedCount: timeBlackoutCount,
        nightVolatilityBlockedCount: nightVolatilityCount,
        totalAvoidedFrictionUsdt: noTradeStats.totalAvoidedFrictionUsdt,
      },
    });
  });

  app.post('/api/engine/settings', (req, res) => {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: 'Missing settings' });
    if (typeof settings.bypassCapitalProtection === 'boolean') {
      serverEngine.setBypassCapitalProtection(settings.bypassCapitalProtection);
    }
    serverEngine.updateSettings(settings);
    res.json({ success: true, settings: serverEngine.getState().settings });
  });

  app.post('/api/engine/set-capital', (req, res) => {
    const balance = typeof req.body.balance === 'number' ? req.body.balance : 100.0;
    serverEngine.setCapital(balance);
    res.json({ success: true, balance: serverEngine.getState().walletBalance });
  });

  app.post('/api/engine/reset-balance', (req, res) => {
    serverEngine.resetBalance();
    res.json({ success: true, balance: serverEngine.getState().walletBalance });
  });

  app.post('/api/engine/clear-logs', (req, res) => {
    serverEngine.clearLogs();
    res.json({ success: true });
  });

  // Paginated trade history endpoint with search & filters for anti-lag UI browsing
  app.get('/api/engine/trades', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const symbol = (req.query.symbol as string) || '';
    const side = (req.query.side as string) || 'ALL';
    const reason = (req.query.reason as string) || 'ALL';

    const result = getPaginatedTrades({
      page,
      limit,
      symbol,
      side,
      reason,
      stateTrades: serverEngine.getFullTradeHistory(),
    });

    res.json(result);
  });

  // 1-Click Export 100% of all historical trades to CSV
  app.get('/api/engine/export-csv', (req, res) => {
    const csvContent = exportAllTradesToCSV(serverEngine.getFullTradeHistory());
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=bitget_5bot_complete_audit_${new Date().toISOString().slice(0, 10)}.csv`
    );
    res.send(csvContent);
  });

  // Mount Vite or serve static dist
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bitget 5-Bot Engine] Server running 24/7 on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
