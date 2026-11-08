export interface SymbolContractSpec {
  symbol: string;
  minSize: number;
  lotSize: number;
  tickSize: number;
  minNotional: number;
  maxLeverage: number;
  makerFeeRate: number;
  takerFeeRate: number;
}

export const BITGET_CONTRACT_SPECS: Record<string, SymbolContractSpec> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    minSize: 0.0001,
    lotSize: 0.0001,
    tickSize: 0.1,
    minNotional: 5.0,
    maxLeverage: 125,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    minSize: 0.001,
    lotSize: 0.001,
    tickSize: 0.01,
    minNotional: 5.0,
    maxLeverage: 100,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  SOLUSDT: {
    symbol: 'SOLUSDT',
    minSize: 0.01,
    lotSize: 0.01,
    tickSize: 0.01,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  XRPUSDT: {
    symbol: 'XRPUSDT',
    minSize: 1.0,
    lotSize: 1.0,
    tickSize: 0.0001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  DOGEUSDT: {
    symbol: 'DOGEUSDT',
    minSize: 10.0,
    lotSize: 10.0,
    tickSize: 0.00001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  AVAXUSDT: {
    symbol: 'AVAXUSDT',
    minSize: 0.1,
    lotSize: 0.1,
    tickSize: 0.01,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  NEARUSDT: {
    symbol: 'NEARUSDT',
    minSize: 1.0,
    lotSize: 1.0,
    tickSize: 0.001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  LINKUSDT: {
    symbol: 'LINKUSDT',
    minSize: 0.1,
    lotSize: 0.1,
    tickSize: 0.001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  BNBUSDT: {
    symbol: 'BNBUSDT',
    minSize: 0.01,
    lotSize: 0.01,
    tickSize: 0.01,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  SUIUSDT: {
    symbol: 'SUIUSDT',
    minSize: 1.0,
    lotSize: 1.0,
    tickSize: 0.0001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  ADAUSDT: {
    symbol: 'ADAUSDT',
    minSize: 1.0,
    lotSize: 1.0,
    tickSize: 0.0001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
  PEPEUSDT: {
    symbol: 'PEPEUSDT',
    minSize: 1000.0,
    lotSize: 100.0,
    tickSize: 0.00000001,
    minNotional: 5.0,
    maxLeverage: 50,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  },
};

// Explicit blacklist for non-crypto synthetic equity CFDs, commodities, and high-slippage/illiquid symbols
// identified in 661-trade audit (such as MINIMAXUSDT with 186 bps slippage and AKEUSDT with 798 bps slippage)
export const BANNED_ILLIQUID_SYMBOLS = new Set([
  'MINIMAXUSDT',
  'AKEUSDT',
  'SOXLUSDT',
  'SOXSUSDT',
  'KORUUSDT',
  'CLUSDT',
  'SKHYUSDT',
  'ENAUSDT',
  'PLTRUSDT',
  'MUUSDT',
  'SPCXUSDT',
  'NVDAUSDT',
  'TSLAUSDT',
  'AAPLUSDT',
  'AMZNUSDT',
  'MSFTUSDT',
  'MSTRUSDT',
  'COINUSDT',
  'XAUUSDT', // Gold CFD
  'XAUTUSDT',
]);

export function isSupportedBitgetCryptoFutures(symbol: string): boolean {
  if (!symbol || !symbol.endsWith('USDT')) return false;
  if (BANNED_ILLIQUID_SYMBOLS.has(symbol)) return false;
  return true;
}

export const DEFAULT_CONTRACT_SPEC: SymbolContractSpec = {
  symbol: 'DEFAULT',
  minSize: 0.01,
  lotSize: 0.01,
  tickSize: 0.0001,
  minNotional: 5.0,
  maxLeverage: 10, // Capped to 10x max for risk governor compliance
  makerFeeRate: 0.0002,
  takerFeeRate: 0.0006,
};

export function getContractSpec(symbol: string): SymbolContractSpec {
  return BITGET_CONTRACT_SPECS[symbol] || { ...DEFAULT_CONTRACT_SPEC, symbol };
}

export function roundToTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const inv = 1 / tickSize;
  return Math.round(price * inv) / inv;
}

export function roundToLotSize(amount: number, lotSize: number): number {
  if (lotSize <= 0) return amount;
  const inv = 1 / lotSize;
  return Math.floor(amount * inv) / inv;
}
