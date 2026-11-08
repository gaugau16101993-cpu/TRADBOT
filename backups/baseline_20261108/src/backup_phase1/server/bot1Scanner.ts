import {
  TickerData,
  CandleData,
  QualifiedCandidate,
  ScannerMetrics,
} from '../types/engine';

export interface ScannerFilterConfig {
  minUsdtVolume24h: number;
  maxSpreadPercent: number;
  minVolatility24h: number;
  maxDataAgeSeconds: number;
  topCandlesLimit: number;
}

export const DEFAULT_FILTER_CONFIG: ScannerFilterConfig = {
  minUsdtVolume24h: 5_000_000, // $5,000,000 USDT 24h minimum
  maxSpreadPercent: 0.05, // 0.05% max spread (5 bps) for scalping
  minVolatility24h: 1.2, // 1.2% 24h high/low range minimum
  maxDataAgeSeconds: 60, // Data cannot be older than 60s
  topCandlesLimit: 8, // Fetch 1m candles for top 8 candidates
};

interface ContractMeta {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  symbolStatus: string;
  minTradeUSDT: number;
  makerFeeRate: number;
  takerFeeRate: number;
}

export class Bot1MarketScanner {
  private filterConfig: ScannerFilterConfig;
  private ws: WebSocket | null = null;
  private wsConnectedSince: number = 0;
  private wsUptimeMs: number = 0;
  private wsMessagesCount: number = 0;
  private wsStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
  private wsPingInterval: NodeJS.Timeout | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsReconnectAttempts: number = 0;
  private subscribedSymbols: Set<string> = new Set();

  // Cache & Rate Limiting
  private contractsCache: Map<string, ContractMeta> = new Map();
  private contractsCacheExpiresAt: number = 0;
  private lastTickersCache: Record<string, TickerData> = {};
  private tickersCacheExpiresAt: number = 0;
  private inFlightScanPromise: Promise<{ candidates: QualifiedCandidate[]; metrics: ScannerMetrics }> | null = null;
  private candleCache: Map<string, { candles: CandleData[]; expiresAt: number }> = new Map();

  // Rate Limiting (Token Bucket)
  private tokens: number = 15;
  private maxTokens: number = 15;
  private lastTokenRefill: number = Date.now();

  // Telemetry & Metrics
  private metrics: ScannerMetrics = {
    scanLatencyMs: 0,
    dataFreshnessMs: 0,
    apiErrors: 0,
    wsStatus: 'DISCONNECTED',
    wsUptimeMs: 0,
    wsMessagesCount: 0,
    coinsScanned: 0,
    coinsPassed: 0,
    coinsRejected: 0,
    rejectionBreakdown: {
      LOW_VOLUME: 0,
      WIDE_SPREAD: 0,
      LOW_VOLATILITY: 0,
      STALE_DATA: 0,
      NON_NORMAL_STATUS: 0,
      INVALID_DEPTH: 0,
    },
    topCandidates: [],
    lastCompletedScanTime: 0,
  };

  private onTickerUpdateCallback?: (ticker: TickerData) => void;
  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;

  constructor(
    config: Partial<ScannerFilterConfig> = {},
    callbacks?: {
      onTickerUpdate?: (ticker: TickerData) => void;
      onLog?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
    }
  ) {
    this.filterConfig = { ...DEFAULT_FILTER_CONFIG, ...config };
    this.onTickerUpdateCallback = callbacks?.onTickerUpdate;
    this.onLogCallback = callbacks?.onLog;

    // Start WebSocket
    this.initWebSocket();
  }

  public setCallbacks(callbacks: {
    onTickerUpdate?: (ticker: TickerData) => void;
    onLog?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
  }) {
    if (callbacks.onTickerUpdate) this.onTickerUpdateCallback = callbacks.onTickerUpdate;
    if (callbacks.onLog) this.onLogCallback = callbacks.onLog;
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  // Rate Limiter
  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastTokenRefill;
    if (elapsed > 1000) {
      this.tokens = this.maxTokens;
      this.lastTokenRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }

    // Wait for refill
    const waitMs = Math.max(50, 1000 - elapsed);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.tokens = this.maxTokens - 1;
    this.lastTokenRefill = Date.now();
  }

  // Exponential Backoff fetch
  private async fetchWithRetry<T>(url: string, retries = 3, baseBackoffMs = 400): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.acquireToken();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Bitget-MarketScanner-Pro/2.5',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (json.code !== '00000') {
          throw new Error(`Bitget API Error ${json.code}: ${json.msg || 'Unknown error'}`);
        }

        return json as T;
      } catch (err: any) {
        lastError = err;
        this.metrics.apiErrors += 1;
        this.metrics.lastApiErrorTime = Date.now();
        this.metrics.lastApiErrorMessage = err.message;

        if (attempt < retries) {
          const jitter = Math.random() * 100;
          const waitTime = baseBackoffMs * Math.pow(2, attempt - 1) + jitter;
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }
    throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts.`);
  }

  // 1. Fetch & Cache Bitget Contracts Metadata
  public async getActiveContracts(): Promise<Map<string, ContractMeta>> {
    const now = Date.now();
    if (this.contractsCache.size > 0 && now < this.contractsCacheExpiresAt) {
      return this.contractsCache;
    }

    try {
      const data = await this.fetchWithRetry<{ code: string; data: any[] }>(
        'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES'
      );

      const map = new Map<string, ContractMeta>();
      if (Array.isArray(data.data)) {
        for (const c of data.data) {
          if (c.symbol && c.quoteCoin === 'USDT') {
            map.set(c.symbol, {
              symbol: c.symbol,
              baseCoin: c.baseCoin,
              quoteCoin: c.quoteCoin,
              symbolStatus: c.symbolStatus || 'normal',
              minTradeUSDT: parseFloat(c.minTradeUSDT || '5'),
              makerFeeRate: parseFloat(c.makerFeeRate || '0.0002'),
              takerFeeRate: parseFloat(c.takerFeeRate || '0.0006'),
            });
          }
        }
      }

      this.contractsCache = map;
      this.contractsCacheExpiresAt = now + 30 * 60 * 1000; // 30 min TTL
      return map;
    } catch (err: any) {
      if (this.contractsCache.size > 0) {
        this.log(`[BOT 1] Contracts list fetch failed (${err.message}). Using cached contracts.`, 'warning');
        return this.contractsCache;
      }
      throw err;
    }
  }

  // 2. Fetch OHLCV 1m Candles with caching
  public async get1mCandles(symbol: string, limit = 5): Promise<CandleData[]> {
    const now = Date.now();
    const cached = this.candleCache.get(symbol);
    if (cached && now < cached.expiresAt) {
      return cached.candles;
    }

    try {
      const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1m&limit=${limit}`;
      const res = await this.fetchWithRetry<{ code: string; data: any[] }>(url, 2, 300);

      const candles: CandleData[] = [];
      if (Array.isArray(res.data)) {
        for (const row of res.data) {
          const ts = parseInt(row[0], 10);
          const open = parseFloat(row[1]);
          const high = parseFloat(row[2]);
          const low = parseFloat(row[3]);
          const close = parseFloat(row[4]);
          const baseVolume = parseFloat(row[5]);
          const quoteVolume = parseFloat(row[6]);

          // Candle is complete if it started more than 60s ago
          const isComplete = ts + 60_000 <= now;

          if (!isNaN(ts) && !isNaN(close) && close > 0) {
            candles.push({
              ts,
              open,
              high,
              low,
              close,
              baseVolume,
              quoteVolume,
              isComplete,
            });
          }
        }
      }

      this.candleCache.set(symbol, {
        candles,
        expiresAt: now + 12_000, // 12s TTL
      });

      return candles;
    } catch (err: any) {
      return cached ? cached.candles : [];
    }
  }

  // Fetch real-time live ticker for a specific symbol (e.g. for active position micro-scalping)
  public async fetchSingleTicker(symbol: string): Promise<TickerData | null> {
    try {
      const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`;
      const res = await this.fetchWithRetry<{ code: string; data: any }>(url, 1, 250);
      const item = Array.isArray(res.data) ? res.data[0] : res.data;
      if (item && item.lastPr) {
        const lastPr = parseFloat(item.lastPr);
        const bidPr = parseFloat(item.bidPr || item.lastPr);
        const askPr = parseFloat(item.askPr || item.lastPr);
        const change24h = parseFloat(item.change24h || '0') * 100;
        const high24h = parseFloat(item.high24h || '0');
        const low24h = parseFloat(item.low24h || '0');
        const usdtVolume = parseFloat(item.usdtVolume || '0');
        const fundingRate = parseFloat(item.fundingRate || '0');
        const ts = parseInt(item.ts, 10) || Date.now();
        const spread = +(askPr - bidPr).toFixed(6);
        const spreadPercent = lastPr > 0 ? +((spread / lastPr) * 100).toFixed(4) : 0;

        const updated: TickerData = {
          symbol,
          lastPr,
          bidPr,
          askPr,
          change24h: isNaN(change24h) ? 0 : change24h,
          high24h,
          low24h,
          volume24h: usdtVolume,
          updatedAt: ts,
          fundingRate,
          spread,
          spreadPercent,
          usdtVolume24h: usdtVolume,
        };

        this.lastTickersCache[symbol] = updated;
        return updated;
      }
    } catch {
      // Fallback to cache if network fails
    }
    return this.lastTickersCache[symbol] || null;
  }

  // 3. Scan & Filter the Entire USDT-M Universe
  public async scanUniverse(): Promise<{ candidates: QualifiedCandidate[]; metrics: ScannerMetrics }> {
    // Request deduplication
    if (this.inFlightScanPromise) {
      return this.inFlightScanPromise;
    }

    this.inFlightScanPromise = this.executeUniverseScan().finally(() => {
      this.inFlightScanPromise = null;
    });

    return this.inFlightScanPromise;
  }

  private async executeUniverseScan(): Promise<{ candidates: QualifiedCandidate[]; metrics: ScannerMetrics }> {
    const startTime = performance.now();
    const now = Date.now();

    // 1. Get Contracts & Active Tickers
    const [contracts, rawTickersRes] = await Promise.all([
      this.getActiveContracts(),
      this.fetchWithRetry<{ code: string; data: any[]; requestTime: number }>(
        'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES'
      ),
    ]);

    const rawList = rawTickersRes.data || [];
    const totalCount = rawList.length;

    // Reset rejection counters
    const rejection = {
      LOW_VOLUME: 0,
      WIDE_SPREAD: 0,
      LOW_VOLATILITY: 0,
      STALE_DATA: 0,
      NON_NORMAL_STATUS: 0,
      INVALID_DEPTH: 0,
    };

    const qualified: QualifiedCandidate[] = [];
    let totalFreshnessSum = 0;
    let freshItemsCount = 0;

    for (const item of rawList) {
      const symbol = item.symbol;
      if (!symbol || !symbol.endsWith('USDT')) continue;

      // Contract status check
      const contractMeta = contracts.get(symbol);
      if (contractMeta && contractMeta.symbolStatus !== 'normal') {
        rejection.NON_NORMAL_STATUS += 1;
        continue;
      }

      const lastPr = parseFloat(item.lastPr);
      const bidPr = parseFloat(item.bidPr || item.lastPr);
      const askPr = parseFloat(item.askPr || item.lastPr);
      const bidSz = parseFloat(item.bidSz || '0');
      const askSz = parseFloat(item.askSz || '0');
      const high24h = parseFloat(item.high24h || '0');
      const low24h = parseFloat(item.low24h || '0');
      const change24h = parseFloat(item.change24h || '0') * 100;
      const usdtVolume = parseFloat(item.usdtVolume || item.quoteVolume || '0');
      const fundingRate = parseFloat(item.fundingRate || '0');
      const itemTs = parseInt(item.ts, 10) || now;

      // Data sanity & freshness check
      const dataAgeSeconds = Math.max(0, (now - itemTs) / 1000);
      totalFreshnessSum += Math.abs(now - itemTs);
      freshItemsCount += 1;

      if (
        isNaN(lastPr) ||
        lastPr <= 0 ||
        isNaN(bidPr) ||
        isNaN(askPr) ||
        bidPr <= 0 ||
        askPr <= 0 ||
        bidPr > askPr ||
        dataAgeSeconds > this.filterConfig.maxDataAgeSeconds
      ) {
        rejection.STALE_DATA += 1;
        continue;
      }

      // Depth check
      if (bidSz <= 0 && askSz <= 0) {
        rejection.INVALID_DEPTH += 1;
        continue;
      }

      // Liquidity / Volume check
      if (usdtVolume < this.filterConfig.minUsdtVolume24h) {
        rejection.LOW_VOLUME += 1;
        continue;
      }

      // Spread check
      const spread = +(askPr - bidPr).toFixed(6);
      const spreadPercent = +((spread / lastPr) * 100).toFixed(4);
      const spreadBps = +(spreadPercent * 100).toFixed(2);

      if (spreadPercent > this.filterConfig.maxSpreadPercent) {
        rejection.WIDE_SPREAD += 1;
        continue;
      }

      // Volatility check
      const volatility24h = lastPr > 0 && high24h > low24h ? +(((high24h - low24h) / lastPr) * 100).toFixed(2) : 0;
      if (volatility24h < this.filterConfig.minVolatility24h) {
        rejection.LOW_VOLATILITY += 1;
        continue;
      }

      // Scalp Potential Score (0 - 100)
      // Criteria: Higher volume, tighter spread, optimal 2-5% volatility, low funding drag
      const volumeScore = Math.min(35, Math.log10(Math.max(1, usdtVolume / 1_000_000)) * 12);
      const spreadScore = Math.max(0, 35 * (1 - spreadPercent / this.filterConfig.maxSpreadPercent));
      const volScore = Math.min(20, (volatility24h / 5) * 20);
      const fundingPenalty = Math.min(10, Math.abs(fundingRate) * 10000);
      const scalpScore = Math.round(Math.max(10, Math.min(99, volumeScore + spreadScore + volScore - fundingPenalty)));

      // Save to qualified pool
      qualified.push({
        symbol,
        lastPrice: lastPr,
        bidPrice: bidPr,
        askPrice: askPr,
        spread,
        spreadPercent,
        spreadBps,
        volume24hUsdt: usdtVolume,
        fundingRate,
        volatility24h,
        change24h: isNaN(change24h) ? 0 : change24h,
        scalpScore,
        lastUpdateTime: itemTs,
      });

      // Update Tickers Map
      const updatedTicker: TickerData = {
        symbol,
        lastPr,
        bidPr,
        askPr,
        change24h: isNaN(change24h) ? 0 : change24h,
        high24h,
        low24h,
        volume24h: usdtVolume,
        updatedAt: itemTs,
        fundingRate,
        spread,
        spreadPercent,
        bidSz,
        askSz,
        usdtVolume24h: usdtVolume,
      };
      this.lastTickersCache[symbol] = updatedTicker;
      if (this.onTickerUpdateCallback) {
        this.onTickerUpdateCallback(updatedTicker);
      }
    }

    // Sort qualified candidates by scalpScore descending
    qualified.sort((a, b) => b.scalpScore - a.scalpScore);

    // Fetch 1m candles for top candidates asynchronously
    const topBatch = qualified.slice(0, this.filterConfig.topCandlesLimit);
    await Promise.allSettled(
      topBatch.map(async (cand) => {
        const candles = await this.get1mCandles(cand.symbol, 5);
        cand.candles1m = candles;
      })
    );

    // Dynamic WebSocket subscription for top 10 candidates
    this.updateWsSubscriptions(topBatch.map((c) => c.symbol));

    const scanLatencyMs = Math.round(performance.now() - startTime);
    const avgFreshness = freshItemsCount > 0 ? Math.round(totalFreshnessSum / freshItemsCount) : 0;
    const coinsRejected = totalCount - qualified.length;

    // Update Telemetry Metrics
    this.metrics = {
      scanLatencyMs,
      dataFreshnessMs: avgFreshness,
      apiErrors: this.metrics.apiErrors,
      lastApiErrorTime: this.metrics.lastApiErrorTime,
      lastApiErrorMessage: this.metrics.lastApiErrorMessage,
      wsStatus: this.wsStatus,
      wsUptimeMs: this.wsConnectedSince > 0 ? Date.now() - this.wsConnectedSince : 0,
      wsMessagesCount: this.wsMessagesCount,
      coinsScanned: totalCount,
      coinsPassed: qualified.length,
      coinsRejected,
      rejectionBreakdown: rejection,
      topCandidates: topBatch,
      lastCompletedScanTime: Date.now(),
    };

    return { candidates: qualified, metrics: this.metrics };
  }

  // 4. WebSocket Management with Heartbeat & Auto-reconnect
  private initWebSocket() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    try {
      this.wsStatus = 'RECONNECTING';
      const wsUrl = 'wss://ws.bitget.com/v2/ws/public';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsStatus = 'CONNECTED';
        this.wsConnectedSince = Date.now();
        this.wsReconnectAttempts = 0;
        this.log('[BOT 1] Bitget Public WebSocket Connected successfully.', 'success');

        // Setup Ping Heartbeat (20s)
        this.setupWsHeartbeat();

        // Resubscribe to tracked symbols
        if (this.subscribedSymbols.size > 0) {
          this.sendSubscriptions(Array.from(this.subscribedSymbols));
        }
      };

      this.ws.onmessage = (event) => {
        this.wsMessagesCount += 1;
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();

        if (raw === 'pong') return; // Heartbeat response

        try {
          const msg = JSON.parse(raw);
          if (msg.action === 'snapshot' || msg.action === 'update') {
            if (Array.isArray(msg.data)) {
              for (const item of msg.data) {
                const sym = item.instId || item.symbol;
                if (!sym) continue;

                const lastPr = parseFloat(item.lastPr);
                const bidPr = parseFloat(item.bidPr || item.lastPr);
                const askPr = parseFloat(item.askPr || item.lastPr);
                const change24h = parseFloat(item.change24h || '0') * 100;
                const high24h = parseFloat(item.high24h || '0');
                const low24h = parseFloat(item.low24h || '0');
                const usdtVolume = parseFloat(item.usdtVolume || '0');
                const fundingRate = parseFloat(item.fundingRate || '0');
                const ts = parseInt(item.ts, 10) || Date.now();

                const spread = +(askPr - bidPr).toFixed(6);
                const spreadPercent = lastPr > 0 ? +((spread / lastPr) * 100).toFixed(4) : 0;

                const updated: TickerData = {
                  symbol: sym,
                  lastPr,
                  bidPr,
                  askPr,
                  change24h: isNaN(change24h) ? 0 : change24h,
                  high24h,
                  low24h,
                  volume24h: usdtVolume,
                  updatedAt: ts,
                  fundingRate,
                  spread,
                  spreadPercent,
                  usdtVolume24h: usdtVolume,
                };

                this.lastTickersCache[sym] = updated;
                if (this.onTickerUpdateCallback) {
                  this.onTickerUpdateCallback(updated);
                }
              }
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      this.ws.onerror = (err: any) => {
        this.metrics.apiErrors += 1;
        this.metrics.lastApiErrorTime = Date.now();
        this.metrics.lastApiErrorMessage = `WebSocket Error: ${err.message || 'connection failed'}`;
      };

      this.ws.onclose = () => {
        this.wsStatus = 'DISCONNECTED';
        this.wsConnectedSince = 0;
        this.cleanupWs();
        this.scheduleWsReconnect();
      };
    } catch (err: any) {
      this.wsStatus = 'DISCONNECTED';
      this.scheduleWsReconnect();
    }
  }

  private setupWsHeartbeat() {
    if (this.wsPingInterval) clearInterval(this.wsPingInterval);
    this.wsPingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 20_000);
  }

  private cleanupWs() {
    if (this.wsPingInterval) {
      clearInterval(this.wsPingInterval);
      this.wsPingInterval = null;
    }
  }

  private scheduleWsReconnect() {
    if (this.wsReconnectTimer) return;
    this.wsReconnectAttempts += 1;
    // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s
    const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(5, this.wsReconnectAttempts)));
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.initWebSocket();
    }, delay);
  }

  public updateWsSubscriptions(symbols: string[]) {
    const newSet = new Set(symbols);
    // Find symbols to add
    const toAdd = symbols.filter((s) => !this.subscribedSymbols.has(s));
    if (toAdd.length > 0) {
      this.sendSubscriptions(toAdd);
      toAdd.forEach((s) => this.subscribedSymbols.add(s));
    }
  }

  private sendSubscriptions(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Batch into chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const msg = {
        op: 'subscribe',
        args: chunk.map((sym) => ({
          instType: 'USDT-FUTURES',
          channel: 'ticker',
          instId: sym,
        })),
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Getters
  public getMetrics(): ScannerMetrics {
    return {
      ...this.metrics,
      wsUptimeMs: this.wsConnectedSince > 0 ? Date.now() - this.wsConnectedSince : 0,
    };
  }

  public getCachedTickers(): Record<string, TickerData> {
    return { ...this.lastTickersCache };
  }

  public getFilterConfig(): ScannerFilterConfig {
    return { ...this.filterConfig };
  }

  public updateFilterConfig(newConfig: Partial<ScannerFilterConfig>) {
    this.filterConfig = { ...this.filterConfig, ...newConfig };
  }

  public destroy() {
    this.cleanupWs();
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
