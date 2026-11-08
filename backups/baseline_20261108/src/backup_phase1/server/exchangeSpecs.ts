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
};

export const DEFAULT_CONTRACT_SPEC: SymbolContractSpec = {
  symbol: 'DEFAULT',
  minSize: 0.01,
  lotSize: 0.01,
  tickSize: 0.0001,
  minNotional: 5.0,
  maxLeverage: 20,
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
