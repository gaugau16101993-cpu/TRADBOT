import { EngineSettings } from '../types/engine';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnOpen: boolean;
  notifyOnClose: boolean;
  notifyOnError: boolean;
  notifyHeartbeat: boolean;
  heartbeatIntervalMinutes: number;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export class TelegramNotifier {
  private config: TelegramConfig;
  private messageQueue: string[] = [];
  private isProcessingQueue = false;
  private lastSentTimestamp = 0;
  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;

  constructor(
    settings?: Partial<EngineSettings>,
    onLog?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void
  ) {
    this.onLogCallback = onLog;
    this.config = {
      enabled: settings?.telegramEnabled ?? false,
      botToken: settings?.telegramBotToken ?? '',
      chatId: settings?.telegramChatId ?? '',
      notifyOnOpen: settings?.telegramNotifyOnOpen ?? true,
      notifyOnClose: settings?.telegramNotifyOnClose ?? true,
      notifyOnError: settings?.telegramNotifyOnError ?? true,
      notifyHeartbeat: settings?.telegramNotifyHeartbeat ?? true,
      heartbeatIntervalMinutes: settings?.telegramHeartbeatIntervalMinutes ?? 60,
    };
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.onLogCallback = fn;
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  public updateConfig(newConfig: Partial<TelegramConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.log(
      `[TELEGRAM] Cấu hình cập nhật: ${this.config.enabled ? 'ĐÃ BẬT' : 'ĐANG TẮT'} (Chat ID: ${this.config.chatId ? this.config.chatId.slice(0, 4) + '***' : 'Chưa nhập'})`,
      'info'
    );
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  public getMaskedConfig(): Omit<TelegramConfig, 'botToken'> & { botTokenMasked: string } {
    const token = this.config.botToken;
    const masked = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : token ? '****' : '';
    return {
      ...this.config,
      botTokenMasked: masked,
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.enabled && this.config.botToken.trim() && this.config.chatId.trim());
  }

  /**
   * Send a direct raw HTML message to Telegram API with timeout and error handling
   */
  public async sendRawMessage(
    htmlMessage: string,
    overrideToken?: string,
    overrideChatId?: string
  ): Promise<TelegramSendResult> {
    const token = (overrideToken || this.config.botToken).trim();
    const chatId = (overrideChatId || this.config.chatId).trim();

    if (!token || !chatId) {
      return { success: false, error: 'Thiếu Telegram Bot Token hoặc Chat ID' };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const errorDesc = data.description || `HTTP ${res.status}`;
        this.log(`[TELEGRAM LỖI] ${errorDesc}`, 'danger');
        return { success: false, error: errorDesc };
      }

      this.lastSentTimestamp = Date.now();
      return { success: true, messageId: data.result?.message_id };
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Timeout kết nối Telegram API sau 8s' : err.message;
      this.log(`[TELEGRAM LỖI] ${msg}`, 'danger');
      return { success: false, error: msg };
    }
  }

  /**
   * Queue message to avoid Telegram 429 rate limits (safe async delivery)
   */
  public enqueueMessage(htmlMessage: string) {
    if (!this.isConfigured()) return;
    this.messageQueue.push(htmlMessage);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.isProcessingQueue = true;
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) {
        await this.sendRawMessage(msg);
        // Small delay between telegram messages to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
    this.isProcessingQueue = false;
  }

  /**
   * Send test connection message
   */
  public async sendTestMessage(
    testToken?: string,
    testChatId?: string
  ): Promise<TelegramSendResult> {
    const nowIso = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const html = `🤖 <b>[BITGET 5-BOT ENGINE] KIỂM TRA KẾT NỐI TELEGRAM THÀNH CÔNG!</b>

✅ <b>Trạng thái:</b> Đã kết nối với Cloud Server 24/7
⏰ <b>Thời gian máy chủ:</b> ${nowIso} (GMT+7)
☁️ <b>Môi trường:</b> Node.js Backend Cloud Daemon
🛡️ <b>Chế độ:</b> Bitget USDT-M Futures Paper Trading
💵 <b>Ký quỹ mặc định:</b> 2.0 USDT / vị thế (Đòn bẩy 5x-10x)

📱 <i>Hệ thống sẽ tự động gửi thông báo khi:</i>
• Mở lệnh tự động (Auto-Trade Entry)
• Chốt lời ròng (Net-Profit TP) hoặc Cắt lỗ (Stop Loss)
• Báo cáo nhịp tim định kỳ (Heartbeat 24/7)
• Cảnh báo lỗi bất thường hoặc ngắt kết nối

<i>Bạn có thể an tâm tắt Safari/Chrome hoặc khóa màn hình iPhone. Bot vẫn tự vận hành liên tục 24/7!</i>`;

    const res = await this.sendRawMessage(html, testToken, testChatId);
    if (res.success) {
      this.log('[TELEGRAM] Gửi tin nhắn kiểm tra kết nối thành công!', 'success');
    }
    return res;
  }

  /**
   * Notify when Bot 4 opens an autonomous Paper position
   */
  public notifyOrderOpened(data: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    marginUsdt: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
    strategy?: string;
    expectedNetEdgeBps?: number;
    signalId?: string;
  }) {
    if (!this.isConfigured() || !this.config.notifyOnOpen) return;

    const sideBadge = data.side === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    const nowIso = new Date().toLocaleTimeString('vi-VN');

    const html = `🚀 <b>[BOT 4] TỰ ĐỘNG MỞ VỊ THẾ MỚI</b>

🪙 <b>Cặp giao dịch:</b> <code>${data.symbol}</code> (${sideBadge})
💵 <b>Giá khớp (Entry):</b> <code>${data.entryPrice}</code> USDT
🛡️ <b>Ký quỹ:</b> <b>${data.marginUsdt.toFixed(2)} USDT</b> (Đòn bẩy ${data.leverage}x)
🛑 <b>Dừng lỗ (SL):</b> <code>${data.stopLoss ? data.stopLoss : 'Chưa đặt'}</code> USDT
🎯 <b>Chốt lời (TP):</b> <code>${data.takeProfit ? data.takeProfit : 'Chưa đặt'}</code> USDT
📈 <b>Chiến lược:</b> <i>${data.strategy || 'Trend Pullback Scalp'}</i>
✨ <b>Net Edge kỳ vọng:</b> <code>+${data.expectedNetEdgeBps ? data.expectedNetEdgeBps.toFixed(1) : '15.0'} bps</code>
⏰ <b>Giờ vào lệnh:</b> ${nowIso}
🆔 <b>Signal ID:</b> <code>${data.signalId || 'N/A'}</code>

<i>Vị thế đang được giám sát theo thời gian thực mỗi 800ms để chốt lời ròng tự động.</i>`;

    this.enqueueMessage(html);
  }

  /**
   * Notify when Bot 4 closes a position
   */
  public notifyOrderClosed(data: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    netPnL: number;
    grossPnL: number;
    totalCosts: number;
    roePct: number;
    durationSeconds: number;
    closeReason: string;
    rootCauseCategory?: string;
    rootCauseDescription?: string;
  }) {
    if (!this.isConfigured() || !this.config.notifyOnClose) return;

    const isWin = data.netPnL > 0;
    const icon = isWin ? '🎯' : '🛑';
    const statusText = isWin ? 'CHỐT LÃI THÀNH CÔNG' : 'CẮT LỖ BẢO TOÀN VỐN';
    const sideBadge = data.side === 'LONG' ? 'LONG' : 'SHORT';
    const pnlSign = data.netPnL >= 0 ? '+' : '';
    const nowIso = new Date().toLocaleTimeString('vi-VN');

    let html = `${icon} <b>[BOT 4] ĐÓNG VỊ THẾ — ${statusText}</b>

🪙 <b>Cặp:</b> <code>${data.symbol}</code> (${sideBadge})
📊 <b>LÃI RÒNG (NET PnL):</b> <b>${pnlSign}${data.netPnL.toFixed(4)} USDT</b> (${pnlSign}${data.roePct.toFixed(2)}%)
💵 <b>Giá vào:</b> <code>${data.entryPrice}</code> ➡️ <b>Giá đóng:</b> <code>${data.exitPrice}</code>
📈 <b>Lãi gộp (Gross):</b> ${data.grossPnL >= 0 ? '+' : ''}${data.grossPnL.toFixed(4)} USDT
🧾 <b>Tổng phí sàn & trượt giá:</b> -${data.totalCosts.toFixed(4)} USDT (Taker 0.06% x 2)
⏱️ <b>Thời gian giữ:</b> ${data.durationSeconds} giây
🏷️ <b>Lý do đóng:</b> <code>${data.closeReason}</code>
⏰ <b>Thời điểm:</b> ${nowIso}`;

    if (!isWin && data.rootCauseCategory) {
      html += `\n\n🧠 <b>Bot 5 Hậu Kiểm (Post-Mortem):</b>
• Nguyên nhân: <code>[${data.rootCauseCategory}]</code>
• Chi tiết: <i>${data.rootCauseDescription || 'Kiểm toán đa khung'}</i>`;
    }

    this.enqueueMessage(html);
  }

  /**
   * Periodic 24/7 Heartbeat alert
   */
  public notifyHeartbeat(stats: {
    uptimeFormatted: string;
    walletBalance: number;
    openPositionsCount: number;
    todayTradesCount: number;
    todayNetPnL: number;
    totalCyclesRun: number;
    wsStatus: string;
  }) {
    if (!this.isConfigured() || !this.config.notifyHeartbeat) return;

    const nowIso = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const pnlSign = stats.todayNetPnL >= 0 ? '+' : '';

    const html = `💓 <b>[24/7 CLOUD HEARTBEAT] HỆ THỐNG VẬN HÀNH ỔN ĐỊNH</b>

⚙️ <b>Trạng thái:</b> 🟢 <b>RUNNING (Backend Cloud Daemon)</b>
⏳ <b>Thời gian chạy liên tục:</b> <b>${stats.uptimeFormatted}</b>
💰 <b>Số dư ví:</b> <b>${stats.walletBalance.toFixed(4)} USDT</b>
📂 <b>Vị thế đang mở:</b> <b>${stats.openPositionsCount}/2</b>
📊 <b>Net PnL hôm nay:</b> <b>${pnlSign}${stats.todayNetPnL.toFixed(4)} USDT</b> (${stats.todayTradesCount} lệnh)
🔄 <b>Tổng chu kỳ quét Bitget:</b> <b>${stats.totalCyclesRun} chu kỳ</b>
📡 <b>Bitget WebSocket:</b> <code>${stats.wsStatus}</code>
⏰ <b>Kiểm tra lúc:</b> ${nowIso}

<i>Hệ thống hoàn toàn độc lập, đang tiếp tục quét 850+ hợp đồng Bitget 24/7.</i>`;

    this.enqueueMessage(html);
  }

  /**
   * Critical error or emergency alert
   */
  public notifyErrorAlert(title: string, details: string) {
    if (!this.isConfigured() || !this.config.notifyOnError) return;

    const nowIso = new Date().toLocaleTimeString('vi-VN');
    const html = `⚠️ <b>[CẢNH BÁO KHẨN CẤP] ${title}</b>

${details}

⏰ <b>Thời điểm:</b> ${nowIso}
🛡️ <i>Cơ chế tự bảo vệ an toàn vốn đã kích hoạt để bảo vệ số dư tài khoản.</i>`;

    this.enqueueMessage(html);
  }

  /**
   * Engine Status change (RUNNING / STOPPED)
   */
  public notifyStatusChange(status: 'RUNNING' | 'STOPPED', reason: string) {
    if (!this.isConfigured()) return;

    const icon = status === 'RUNNING' ? '🟢' : '⏸️';
    const html = `${icon} <b>[HỆ THỐNG] TRẠNG THÁI: ${status}</b>

<b>Lý do:</b> ${reason}
⏰ <b>Thời điểm:</b> ${new Date().toLocaleTimeString('vi-VN')}`;

    this.enqueueMessage(html);
  }

  public getLastSentTimestamp(): number {
    return this.lastSentTimestamp;
  }
}

export const telegramNotifier = new TelegramNotifier();
