import { BackgroundWorkerHealth } from '../types/engine';
import { getDbStatus, getLastDbSaveTimestamp, appendAuditLog } from './storage';
import { TelegramNotifier } from './telegramService';

export interface BackgroundWorkerOptions {
  onHeartbeat?: () => void;
  onWatchdogStallRecover?: () => void;
  telegramNotifier?: TelegramNotifier;
}

export class BackgroundWorker {
  private serverStartTime: number;
  private lastCycleTimestamp: number;
  private lastCycleLatencyMs: number = 0;
  private totalCyclesCompleted: number = 0;
  private consecutiveErrors: number = 0;
  private autoRestartCount: number = 0;
  private isRunning: boolean = true;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private heartbeatIntervalTimer: NodeJS.Timeout | null = null;
  private options: BackgroundWorkerOptions;
  private lastTelegramHeartbeatTimestamp: number = 0;

  constructor(options: BackgroundWorkerOptions = {}) {
    this.serverStartTime = Date.now();
    this.lastCycleTimestamp = Date.now();
    this.options = options;

    this.installProcessCrashShields();
    this.startWatchdog();
    this.startHeartbeatScheduler();

    appendAuditLog('SERVER_BACKGROUND_WORKER_STARTED', {
      serverStartTime: this.serverStartTime,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    });
  }

  /**
   * Defensive Process Shields: Prevents any unhandled exception or rejection
   * from crashing the continuous 24/7 Node.js daemon
   */
  private installProcessCrashShields() {
    process.on('uncaughtException', (err: Error) => {
      console.error('[24/7 DAEMON SHIELD] Uncaught Exception caught safely:', err);
      this.consecutiveErrors += 1;
      appendAuditLog('UNCAUGHT_EXCEPTION_HANDLED', {
        error: err.message,
        stack: err.stack,
        timestamp: Date.now(),
      });
      if (this.options.telegramNotifier?.isConfigured()) {
        this.options.telegramNotifier.notifyErrorAlert(
          'Ngoại Lệ Chưa Bắt Đã Được Tự Phục Hồi',
          `Chi tiết lỗi: <code>${err.message.slice(0, 200)}</code>\nBộ giám sát Watchdog đã ngăn chặn tiến trình server bị dừng.`
        );
      }
    });

    process.on('unhandledRejection', (reason: any) => {
      console.error('[24/7 DAEMON SHIELD] Unhandled Promise Rejection caught safely:', reason);
      this.consecutiveErrors += 1;
      appendAuditLog('UNHANDLED_REJECTION_HANDLED', {
        reason: String(reason),
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Watchdog timer: checks every 15 seconds if the engine loop is responsive
   */
  private startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.isRunning) return;

      const now = Date.now();
      const elapsedSinceLastCycle = now - this.lastCycleTimestamp;

      // If more than 180 seconds have elapsed with no cycle completion, recover
      if (elapsedSinceLastCycle > 180_000) {
        console.warn(
          `[24/7 WATCHDOG] Chu kỳ quét bị gián đoạn (${Math.round(elapsedSinceLastCycle / 1000)}s > 180s). Kích hoạt tự phục hồi...`
        );
        this.autoRestartCount += 1;
        this.lastCycleTimestamp = now;
        appendAuditLog('WATCHDOG_STALL_RECOVERY_TRIGGERED', {
          elapsedSinceLastCycle,
          autoRestartCount: this.autoRestartCount,
        });

        if (this.options.onWatchdogStallRecover) {
          try {
            this.options.onWatchdogStallRecover();
          } catch (err) {
            console.error('[24/7 WATCHDOG] Lỗi khi gọi callback phục hồi:', err);
          }
        }

        if (this.options.telegramNotifier?.isConfigured()) {
          this.options.telegramNotifier.notifyErrorAlert(
            'Watchdog Tự Động Phục Hồi Chu Kỳ Quét',
            `Chu kỳ quét bị trễ ${Math.round(elapsedSinceLastCycle / 1000)}s do nghẽn mạng API. Hệ thống đã tự động reset và tiếp tục quét Bitget bình thường.`
          );
        }
      }
    }, 15_000);
  }

  /**
   * Heartbeat periodic scheduler for Telegram alerts
   */
  private startHeartbeatScheduler() {
    if (this.heartbeatIntervalTimer) clearInterval(this.heartbeatIntervalTimer);
    // Check every 60 seconds if heartbeat interval has passed
    this.heartbeatIntervalTimer = setInterval(() => {
      if (!this.isRunning) return;
      if (this.options.onHeartbeat) {
        this.options.onHeartbeat();
      }
    }, 60_000);
  }

  public recordCycleSuccess(latencyMs: number) {
    this.lastCycleTimestamp = Date.now();
    this.lastCycleLatencyMs = latencyMs;
    this.totalCyclesCompleted += 1;
    this.consecutiveErrors = 0;
  }

  public recordCycleError(errorMessage: string) {
    this.consecutiveErrors += 1;
    appendAuditLog('CYCLE_ERROR_RECORDED', {
      error: errorMessage,
      consecutiveErrors: this.consecutiveErrors,
      timestamp: Date.now(),
    });
  }

  public setEngineRunning(running: boolean, reason: string = 'User toggle') {
    this.isRunning = running;
    appendAuditLog('ENGINE_STATUS_CHANGED', {
      running,
      reason,
      timestamp: Date.now(),
    });
  }

  public getUptimeFormatted(): string {
    const totalSeconds = Math.floor((Date.now() - this.serverStartTime) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  public getHealth(additionalData: {
    websocketStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
    activePositionsCount: number;
    walletBalance: number;
    telegramStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
    lastTelegramSentTimestamp?: number;
  }): BackgroundWorkerHealth {
    const mem = process.memoryUsage();
    const memoryMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
    const now = Date.now();
    const isAlive = this.isRunning && now - this.lastCycleTimestamp < 180_000;

    return {
      status: this.isRunning ? 'RUNNING' : 'STOPPED',
      uptimeSeconds: Math.floor((now - this.serverStartTime) / 1000),
      uptimeFormatted: this.getUptimeFormatted(),
      serverStartTime: this.serverStartTime,
      lastCycleTimestamp: this.lastCycleTimestamp,
      lastCycleLatencyMs: this.lastCycleLatencyMs,
      totalCyclesCompleted: this.totalCyclesCompleted,
      isWorkerAlive: isAlive,
      consecutiveErrors: this.consecutiveErrors,
      autoRestartCount: this.autoRestartCount,
      websocketStatus: additionalData.websocketStatus,
      dbStatus: getDbStatus(),
      lastDbSaveTimestamp: getLastDbSaveTimestamp(),
      telegramStatus: additionalData.telegramStatus,
      lastTelegramSentTimestamp: additionalData.lastTelegramSentTimestamp,
      memoryUsageMb: memoryMb,
      activePositionsCount: additionalData.activePositionsCount,
      walletBalance: additionalData.walletBalance,
      platform: `${process.platform} (${process.arch}) Node ${process.version}`,
    };
  }

  public destroy() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    if (this.heartbeatIntervalTimer) clearInterval(this.heartbeatIntervalTimer);
  }
}
