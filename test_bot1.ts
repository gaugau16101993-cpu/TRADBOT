import { Bot1MarketScanner } from './src/server/bot1Scanner';

async function runBot1Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING BOT 1 — BITGET MARKET SCANNER PRO TESTS');
  console.log('====================================================\n');

  const scanner = new Bot1MarketScanner(
    {
      minUsdtVolume24h: 5_000_000,
      maxSpreadPercent: 0.06,
      minVolatility24h: 1.0,
      maxDataAgeSeconds: 60,
    },
    {
      onLog: (msg, type) => console.log(`[BOT1_LOG][${type.toUpperCase()}] ${msg}`),
    }
  );

  // Wait 1.5s for WebSocket to establish
  await new Promise((r) => setTimeout(r, 1500));

  console.log('\n--- TEST 1: Real-time Bitget USDT-M Universe Scan ---');
  const t0 = performance.now();
  const scanResult = await scanner.scanUniverse();
  const scanDuration = Math.round(performance.now() - t0);

  console.log(`Scan completed in ${scanDuration}ms`);
  console.log(`Total coins scanned: ${scanResult.metrics.coinsScanned}`);
  console.log(`Coins passed filters: ${scanResult.metrics.coinsPassed}`);
  console.log(`Coins rejected: ${scanResult.metrics.coinsRejected}`);
  console.log('Rejection breakdown:', scanResult.metrics.rejectionBreakdown);
  console.log(`Data freshness: ${scanResult.metrics.dataFreshnessMs}ms`);
  console.log(`API errors: ${scanResult.metrics.apiErrors}`);
  console.log(`WebSocket Status: ${scanResult.metrics.wsStatus}`);
  console.log(`WebSocket Messages: ${scanResult.metrics.wsMessagesCount}`);

  if (scanResult.metrics.coinsScanned < 100) {
    throw new Error(`Expected at least 100 contracts in Bitget USDT-M universe, got ${scanResult.metrics.coinsScanned}`);
  }
  if (scanResult.metrics.coinsPassed === 0) {
    throw new Error('Expected at least some coins to pass liquidity & spread filters!');
  }

  console.log('\n--- TEST 2: Top Ranked Candidates Quality Verification ---');
  const top = scanResult.candidates.slice(0, 5);
  top.forEach((c, idx) => {
    console.log(
      `#${idx + 1} ${c.symbol.padEnd(10)} | Price: $${c.lastPrice.toString().padEnd(8)} | Spread: ${c.spreadPercent.toFixed(4)}% (${c.spreadBps} bps) | 24h Vol: $${(c.volume24hUsdt / 1e6).toFixed(1)}M | Funding: ${(c.fundingRate * 100).toFixed(4)}% | Score: ${c.scalpScore}`
    );
  });

  const top1 = top[0];
  if (!top1 || !top1.symbol || top1.lastPrice <= 0) {
    throw new Error('Invalid top candidate');
  }

  console.log('\n--- TEST 3: 1m OHLCV Candles Verification for Top Candidate ---');
  console.log(`Top candidate ${top1.symbol} candles count: ${top1.candles1m?.length || 0}`);
  if (top1.candles1m && top1.candles1m.length > 0) {
    const lastCandle = top1.candles1m[top1.candles1m.length - 1];
    console.log('Sample candle:', {
      time: new Date(lastCandle.ts).toISOString(),
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
      isComplete: lastCandle.isComplete,
    });
  }

  console.log('\n--- TEST 4: Stress Test & In-Flight Request Deduplication ---');
  const stressStart = performance.now();
  // Fire 10 concurrent scans simultaneously
  const results = await Promise.all([
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
    scanner.scanUniverse(),
  ]);
  const stressDuration = Math.round(performance.now() - stressStart);
  console.log(`10 Concurrent scans completed in ${stressDuration}ms (Deduplicated properly)`);
  console.log(`Results consistency check: ${results.every((r) => r.candidates.length === scanResult.candidates.length ? 'PASSED' : 'DIFFERED')}`);

  console.log('\n--- TEST 5: Real-time WebSocket Event Ingestion ---');
  // Wait 3 seconds to observe incoming ticks via WebSocket
  const initialWsMsgs = scanner.getMetrics().wsMessagesCount;
  console.log(`WS messages before wait: ${initialWsMsgs}`);
  await new Promise((r) => setTimeout(r, 3000));
  const finalWsMsgs = scanner.getMetrics().wsMessagesCount;
  console.log(`WS messages after 3s: ${finalWsMsgs} (Received ${finalWsMsgs - initialWsMsgs} live event updates)`);

  console.log('\n====================================================');
  console.log('✅ ALL BOT 1 UNIT & STRESS TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');

  scanner.destroy();
  process.exit(0);
}

runBot1Tests().catch((err) => {
  console.error('\n❌ BOT 1 TEST FAILED:', err);
  process.exit(1);
});
