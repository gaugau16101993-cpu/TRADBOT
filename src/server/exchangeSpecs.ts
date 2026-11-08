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
// identified in 926-trade audit (such as MINIMAXUSDT with 186 bps slippage and AKEUSDT with 798 bps slippage)
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
  'ANTHROPICUSDT',
  'SNDKUSDT',
  'IDOLUSDT',
  'MUUUSDT',
  'BZUSDT',
  'SAMSUNGUSDT',
  'AMDUSDT',
  'SKHYNIXUSDT',
  'BEAMUSDT',
  'UAIUSDT',
  'GOOGLUSDT',
  'AVGOUSDT',
  'EWYUSDT',
  'MRVLUSDT',
  'BEUSDT',
  'TSMUSDT',
  'SNXXUSDT',
  'OPENAIUSDT',
  'QQQUSDT',
  'CRCLUSDT',
  'SOXXUSDT',
  'NBISUSDT',
]);

// Verified Genuine Bitget USDT-M Perpetual Crypto Futures Contracts
export const VERIFIED_BITGET_CRYPTO_FUTURES_WHITELIST = new Set([
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'NEARUSDT',
  'LINKUSDT',
  'BNBUSDT',
  'SUIUSDT',
  'ADAUSDT',
  'PEPEUSDT',
  'BCHUSDT',
  'LTCUSDT',
  'DOTUSDT',
  'APTUSDT',
  'ARBUSDT',
  'OPUSDT',
  'AAVEUSDT',
  'HYPEUSDT',
  'HOTUSDT',
  'ONEUSDT',
  'ZECUSDT',
]);

export function isSupportedBitgetCryptoFutures(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  const clean = symbol.toUpperCase().trim();
  if (!clean.endsWith('USDT')) return false;
  if (BANNED_ILLIQUID_SYMBOLS.has(clean)) return false;
  return VERIFIED_BITGET_CRYPTO_FUTURES_WHITELIST.has(clean);
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
  if (!price || isNaN(price) || !isFinite(price) || price <= 0) return 0;
  if (tickSize <= 0) return price;
  const inv = 1 / tickSize;
  const rounded = Math.round(price * inv) / inv;
  if (tickSize < 0.0001) {
    const decimals = Math.min(10, Math.max(4, Math.ceil(-Math.log10(tickSize))));
    return parseFloat(rounded.toFixed(decimals));
  }
  return rounded;
}

export function roundToLotSize(amount: number, lotSize: number): number {
  if (!amount || isNaN(amount) || !isFinite(amount) || amount <= 0) return 0;
  if (lotSize <= 0) return amount;
  const inv = 1 / lotSize;
  return Math.floor(amount * inv) / inv;
}
