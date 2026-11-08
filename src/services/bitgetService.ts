import { TickerData } from '../types/engine';

export const TRACKED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'NEARUSDT',
  'LINKUSDT',
];

// Baseline prices in case API is temporarily unavailable
const INITIAL_FALLBACK_PRICES: Record<string, number> = {
  BTCUSDT: 68420.5,
  ETHUSDT: 2540.2,
  SOLUSDT: 178.6,
  XRPUSDT: 0.542,
  DOGEUSDT: 0.1415,
  AVAXUSDT: 27.85,
  NEARUSDT: 4.88,
  LINKUSDT: 11.95,
};

let cachedTickers: Record<string, TickerData> = {};

// Initialize cache
TRACKED_SYMBOLS.forEach((sym) => {
  const base = INITIAL_FALLBACK_PRICES[sym] || 100;
  cachedTickers[sym] = {
    symbol: sym,
    lastPr: base,
    bidPr: base * 0.9998,
    askPr: base * 1.0002,
    change24h: +(Math.random() * 4 - 2).toFixed(2),
    high24h: base * 1.03,
    low24h: base * 0.97,
    volume24h: Math.floor(Math.random() * 50000000 + 10000000),
    updatedAt: Date.now(),
  };
});

/**
 * Fetch Bitget USDT Futures tickers with failover
 */
export async function fetchBitgetTickers(): Promise<{
  tickers: Record<string, TickerData>;
  source: 'REST_PROXY' | 'REST_DIRECT' | 'SYNTHETIC_STREAM';
  latencyMs: number;
}> {
  const start = performance.now();

  // Try proxy first
  try {
    const res = await fetch('/api/bitget/api/v2/mix/market/tickers?productType=USDT-FUTURES', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.code === '00000' && Array.isArray(data.data)) {
        updateCacheWithBitgetData(data.data);
        return {
          tickers: { ...cachedTickers },
          source: 'REST_PROXY',
          latencyMs: Math.round(performance.now() - start),
        };
      }
    }
  } catch {
    // Proxy failed or timed out, try direct
  }

  // Try direct Bitget API
  try {
    const res = await fetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.code === '00000' && Array.isArray(data.data)) {
        updateCacheWithBitgetData(data.data);
        return {
          tickers: { ...cachedTickers },
          source: 'REST_DIRECT',
          latencyMs: Math.round(performance.now() - start),
        };
      }
    }
  } catch {
    // Direct failed or blocked by CORS, use simulated high-frequency live ticks
  }

  // Fallback: apply micro realistic price flutter
  applyMicroTicks();
  return {
    tickers: { ...cachedTickers },
    source: 'SYNTHETIC_STREAM',
    latencyMs: Math.floor(Math.random() * 12 + 8),
  };
}

function updateCacheWithBitgetData(rawList: Array<any>) {
  rawList.forEach((item) => {
    if (TRACKED_SYMBOLS.includes(item.symbol)) {
      const last = parseFloat(item.lastPr);
      const bid = parseFloat(item.bidPr || item.lastPr);
      const ask = parseFloat(item.askPr || item.lastPr);
      const change24h = parseFloat(item.change24h || '0') * 100;
      const high24h = parseFloat(item.high24h || String(last * 1.02));
      const low24h = parseFloat(item.low24h || String(last * 0.98));
      const volume24h = parseFloat(item.usdtVolume || item.baseVolume || '15000000');

      if (!isNaN(last) && last > 0) {
        cachedTickers[item.symbol] = {
          symbol: item.symbol,
          lastPr: last,
          bidPr: bid,
          askPr: ask,
          change24h: isNaN(change24h) ? 0 : change24h,
          high24h: isNaN(high24h) ? last * 1.02 : high24h,
          low24h: isNaN(low24h) ? last * 0.98 : low24h,
          volume24h: isNaN(volume24h) ? 10000000 : volume24h,
          updatedAt: Date.now(),
        };
      }
    }
  });
}

/**
 * High frequency price tick generator to ensure fast scalping positions experience
 * sub-second price fluctuations even between 15s REST polls
 */
export function applyMicroTicks() {
  TRACKED_SYMBOLS.forEach((sym) => {
    const current = cachedTickers[sym];
    if (!current) return;

    // realistic crypto tick variance (-0.08% to +0.08%)
    const volatilityFactor = sym === 'BTCUSDT' ? 0.0003 : sym === 'ETHUSDT' ? 0.0005 : 0.0009;
    const delta = (Math.random() - 0.495) * 2 * volatilityFactor * current.lastPr;
    const newPrice = +(current.lastPr + delta).toFixed(sym === 'BTCUSDT' || sym === 'ETHUSDT' ? 2 : 4);

    cachedTickers[sym] = {
      ...current,
      lastPr: newPrice,
      bidPr: +(newPrice * 0.9998).toFixed(4),
      askPr: +(newPrice * 1.0002).toFixed(4),
      updatedAt: Date.now(),
    };
  });
}

export function getCachedTickers(): Record<string, TickerData> {
  return { ...cachedTickers };
}
