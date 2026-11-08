import fs from 'fs';
import path from 'path';

interface TradeRow {
  tradeId: string;
  timeIso: string;
  timeUnix: number;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  marginUsdt: number;
  leverage: number;
  amount: number;
  grossPnL: number;
  feesAndCosts: number;
  netPnL: number;
  roePct: number;
  durationSeconds: number;
  closeReason: string;
  botId: number;
  signalId: string;
}

function parseCSV(filePath: string): { rows: TradeRow[]; rawLines: string[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const rows: TradeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const matches = line.match(/(?:^|,)(?:"([^"]*)"|([^",]*))/g);
    if (!matches) continue;
    const parts = matches.map((m) => m.replace(/^,/, '').replace(/^"/, '').replace(/"$/, '').trim());

    if (parts.length < 18) continue;

    rows.push({
      tradeId: parts[0],
      timeIso: parts[1],
      timeUnix: Number(parts[2]),
      symbol: parts[3],
      side: parts[4],
      entryPrice: Number(parts[5]),
      exitPrice: Number(parts[6]),
      marginUsdt: Number(parts[7]),
      leverage: Number(parts[8]),
      amount: Number(parts[9]),
      grossPnL: Number(parts[10]),
      feesAndCosts: Number(parts[11]),
      netPnL: Number(parts[12]),
      roePct: Number(parts[13]),
      durationSeconds: Number(parts[14]),
      closeReason: parts[15],
      botId: Number(parts[16]),
      signalId: parts[17],
    });
  }

  return { rows, rawLines: lines };
}

const csvPath = path.resolve(process.cwd(), 'bitget_5bot_complete_audit_2026-11-08.csv');
const { rows, rawLines } = parseCSV(csvPath);

console.log('================================================================');
console.log(`🔍 INDEPENDENT FORENSIC AUDIT: ${path.basename(csvPath)}`);
console.log('================================================================');
console.log(`Total rows parsed from CSV: ${rows.length}`);

// 1. Missing or blank TradeIDs
const missingTradeId = rows.filter((r) => !r.tradeId || r.tradeId.trim() === '');
console.log(`\n1. Missing TradeID count: ${missingTradeId.length}`);

// 2. Zero or invalid Entry/Exit prices
const invalidPriceTrades = rows.filter(
  (r) => isNaN(r.entryPrice) || isNaN(r.exitPrice) || r.entryPrice <= 0 || r.exitPrice <= 0
);
console.log(`\n2. Zero or Invalid Entry/Exit Price records: ${invalidPriceTrades.length}`);
invalidPriceTrades.slice(0, 10).forEach((t, idx) => {
  console.log(
    `   [#${idx + 1}] ID: ${t.tradeId} | Symbol: ${t.symbol} | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | NetPnL: ${t.netPnL} | Reason: ${t.closeReason}`
  );
});

// 3. Duplicate SignalID records
const signalIdCounts = new Map<string, number>();
rows.forEach((r) => {
  if (r.signalId) {
    signalIdCounts.set(r.signalId, (signalIdCounts.get(r.signalId) || 0) + 1);
  }
});
const duplicateSignals = Array.from(signalIdCounts.entries()).filter(([_, count]) => count > 1);
console.log(`\n3. Unique SignalIDs with duplicates: ${duplicateSignals.length}`);
let totalDuplicateOrders = 0;
duplicateSignals.forEach(([sig, count]) => {
  totalDuplicateOrders += count;
  console.log(`   SignalID: ${sig} -> Used in ${count} orders`);
});
console.log(`   Total orders associated with duplicate signals: ${totalDuplicateOrders}`);

// 4. BotID distribution
const botIdCounts = new Map<number, number>();
rows.forEach((r) => {
  botIdCounts.set(r.botId, (botIdCounts.get(r.botId) || 0) + 1);
});
console.log(`\n4. BotID Breakdown:`);
botIdCounts.forEach((count, botId) => {
  console.log(`   BotID ${botId}: ${count} trades (${((count / rows.length) * 100).toFixed(2)}%)`);
});

// 5. Close Reason Breakdown
const reasonCounts = new Map<string, number>();
rows.forEach((r) => {
  reasonCounts.set(r.closeReason, (reasonCounts.get(r.closeReason) || 0) + 1);
});
console.log(`\n5. Close Reason Breakdown:`);
reasonCounts.forEach((count, reason) => {
  console.log(`   ${reason}: ${count} trades (${((count / rows.length) * 100).toFixed(2)}%)`);
});

// 6. Overall Performance Metrics (All 926 records)
const totalNetPnL = rows.reduce((s, r) => s + r.netPnL, 0);
const totalGrossPnL = rows.reduce((s, r) => s + r.grossPnL, 0);
const totalFeesAndCosts = rows.reduce((s, r) => s + r.feesAndCosts, 0);

const wins = rows.filter((r) => r.netPnL > 0);
const losses = rows.filter((r) => r.netPnL < 0);
const breakEvens = rows.filter((r) => r.netPnL === 0);

const winRate = (wins.length / rows.length) * 100;
const grossWinsSum = wins.reduce((s, r) => s + r.netPnL, 0);
const grossLossesSum = Math.abs(losses.reduce((s, r) => s + r.netPnL, 0));
const profitFactor = grossLossesSum > 0 ? grossWinsSum / grossLossesSum : 0;

console.log(`\n6. Performance Metrics (Total: ${rows.length} records):`);
console.log(`   Total Net PnL: ${totalNetPnL.toFixed(4)} USDT`);
console.log(`   Total Gross PnL: ${totalGrossPnL.toFixed(4)} USDT`);
console.log(`   Total Fees & Costs: ${totalFeesAndCosts.toFixed(4)} USDT`);
console.log(`   Wins: ${wins.length} | Losses: ${losses.length} | Breakevens: ${breakEvens.length}`);
console.log(`   Win Rate: ${winRate.toFixed(2)}%`);
console.log(`   Sum Wins Net: +${grossWinsSum.toFixed(4)} USDT`);
console.log(`   Sum Losses Net: -${grossLossesSum.toFixed(4)} USDT`);
console.log(`   Profit Factor: ${profitFactor.toFixed(4)}`);
console.log(`   Avg Win: +${(grossWinsSum / wins.length).toFixed(4)} USDT`);
console.log(`   Avg Loss: -${(grossLossesSum / losses.length).toFixed(4)} USDT`);
console.log(`   Loss/Win Asymmetry: ${(grossLossesSum / losses.length / (grossWinsSum / wins.length)).toFixed(2)}x`);

// 7. Symbol Breakdown & Eligibility Check
const symbolStats = new Map<
  string,
  { count: number; netPnL: number; wins: number; losses: number; avgMargin: number; maxLoss: number }
>();
rows.forEach((r) => {
  const s = symbolStats.get(r.symbol) || { count: 0, netPnL: 0, wins: 0, losses: 0, avgMargin: 0, maxLoss: 0 };
  s.count++;
  s.netPnL += r.netPnL;
  s.avgMargin += r.marginUsdt;
  if (r.netPnL > 0) s.wins++;
  else if (r.netPnL < 0) s.losses++;
  if (r.netPnL < s.maxLoss) s.maxLoss = r.netPnL;
  symbolStats.set(r.symbol, s);
});

console.log(`\n7. Symbol Breakdown & Exposure (Total Symbols: ${symbolStats.size}):`);
const sortedSymbols = Array.from(symbolStats.entries()).sort((a, b) => a[1].netPnL - b[1].netPnL);
sortedSymbols.forEach(([sym, stats]) => {
  const wr = ((stats.wins / stats.count) * 100).toFixed(1);
  const avgM = (stats.avgMargin / stats.count).toFixed(2);
  console.log(
    `   ${sym.padEnd(12)}: ${String(stats.count).padStart(4)} trades | Net: ${stats.netPnL.toFixed(2).padStart(8)} USDT | WR: ${wr.padStart(5)}% | MaxLoss: ${stats.maxLoss.toFixed(2)} USDT | AvgMargin: ${avgM} USDT`
  );
});

// 8. Investigate Unusually Large Losses relative to Margin
console.log(`\n8. Investigating Unusually Large Losses relative to Margin:`);
const catastrophicLosses = rows.filter((r) => r.netPnL < -r.marginUsdt * 1.5 || r.roePct < -150);
console.log(`   Trades where Loss > 150% of Margin: ${catastrophicLosses.length}`);
catastrophicLosses.slice(0, 10).forEach((t, idx) => {
  console.log(
    `   [#${idx + 1}] ID: ${t.tradeId} | Sym: ${t.symbol} | Margin: ${t.marginUsdt} | Lev: ${t.leverage}x | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | NetPnL: ${t.netPnL} | ROE: ${t.roePct}% | Reason: ${t.closeReason}`
  );
});

console.log('================================================================');
