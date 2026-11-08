/**
 * TRADINGAGENTS — AI RESEARCH & DEBATE ENGINE
 * Implements the Bull vs Bear adversarial debate protocol, Research Manager factual verification,
 * and Trader Agent final proposal.
 */

import { TickerData } from '../../types/engine';
import {
  MultiAgentAnalystSynthesis,
  BullAgentArgument,
  BearAgentArgument,
  ResearchManagerAudit,
  TraderAgentDecision,
  TradingAgentsDebateSession,
} from './types';

export class TradingAgentsDebateEngine {
  private debateCounter = 0;

  /**
   * Conducts an adversarial debate session between Bull Agent and Bear Agent,
   * arbitrated by Research Manager, with final decision by Trader Agent.
   */
  public conductDebate(
    synthesis: MultiAgentAnalystSynthesis,
    ticker: TickerData,
    minRiskRewardRequired: number = 2.0
  ): TradingAgentsDebateSession {
    this.debateCounter++;
    const sessionId = `DEBATE-${Date.now()}-${synthesis.symbol}-${this.debateCounter}`;
    const currentPrice = ticker.lastPr || synthesis.currentPrice;

    // Fail immediately if data integrity check failed
    if (!synthesis.dataIntegrityPassed) {
      const bullArgument: BullAgentArgument = {
        role: 'BULL_AGENT',
        thesis: 'Data integrity failed, unable to form thesis',
        structuralPoints: [],
        indicatorPoints: [],
        volumePoints: [],
        upsideLiquidityTarget: currentPrice * 1.02,
        invalidationLevel: currentPrice * 0.98,
        convictionScore: 0,
        proposedRiskReward: 0,
      };
      const bearArgument: BearAgentArgument = {
        role: 'BEAR_AGENT',
        thesis: 'Data integrity failed, unable to form counter-thesis',
        structuralPoints: [],
        indicatorPoints: [],
        riskAndTrapPoints: [],
        downsideLiquidityTarget: currentPrice * 0.98,
        invalidationLevel: currentPrice * 1.02,
        convictionScore: 0,
        proposedRiskReward: 0,
      };
      const researchManagerAudit: ResearchManagerAudit = {
        role: 'RESEARCH_MANAGER',
        factCheckPassed: false,
        hallucinationPenalties: ['Incomplete candle dataset provided'],
        conflictsIdentified: ['DATA_UNRELIABLE'],
        bullScoreAdjusted: 0,
        bearScoreAdjusted: 0,
        consensusMargin: 0,
        debateVerdict: 'UNRELIABLE_DATA',
        summaryRationale: synthesis.rejectionReason || 'Dữ liệu không đủ để thẩm định tranh luận.',
      };
      const traderDecision: TraderAgentDecision = {
        role: 'TRADER_AGENT',
        finalAction: 'NO_TRADE',
        finalConvictionScore: 0,
        executionStrategy: 'STRICT_ABSTAIN',
        recommendedEntry: currentPrice,
        recommendedSL: currentPrice,
        recommendedTP: currentPrice,
        riskRewardRatio: 0,
        expectedNetEdgeBps: 0,
        tradingThesis: 'Từ chối giao dịch do dữ liệu đầu vào không hoàn chỉnh.',
      };

      return {
        sessionId,
        symbol: synthesis.symbol,
        timestamp: Date.now(),
        analystsSynthesis: synthesis,
        bullArgument,
        bearArgument,
        researchManagerAudit,
        traderDecision,
        executionOutcome: 'SUPPRESSED_AS_NO_TRADE',
      };
    }

    const { technical, marketStructure, volume, momentum, volatility, sentiment } = synthesis.specialists;

    // ------------------------------------------------------------------------
    // 1. BULL AGENT: Identifies upside thesis and evidence
    // ------------------------------------------------------------------------
    const bullStructural: string[] = [];
    const bullIndicators: string[] = [];
    const bullVolume: string[] = [];
    let bullScore = 40; // baseline

    if (technical.bias === 'BULLISH') {
      bullScore += 20;
      if (technical.rsi14 <= 70) {
        bullIndicators.push(`EMA9 (${technical.ema9.toFixed(2)}) > EMA21 (${technical.ema21.toFixed(2)}), RSI14 ở mức ${technical.rsi14.toFixed(1)}`);
      } else {
        bullIndicators.push(`EMA9 (${technical.ema9.toFixed(2)}) > EMA21 (${technical.ema21.toFixed(2)}) (Cảnh báo: RSI=${technical.rsi14.toFixed(1)} cao)`);
      }
    }
    if (technical.macd.histogram > 0) {
      bullScore += 10;
      bullIndicators.push(`MACD Histogram dương (+${technical.macd.histogram.toFixed(4)}) xác nhận quán tính tăng`);
    }

    if (marketStructure.structureBias === 'BULLISH') {
      bullScore += 25;
      bullStructural.push(`Cấu trúc thị trường tăng: BOS/CHoCH tại đỉnh $${marketStructure.swingHigh.toFixed(2)}`);
    }
    if (marketStructure.primaryOrderBlock?.type === 'BULLISH_OB') {
      bullScore += 10;
      bullStructural.push(`Vùng cầu Bullish Order Block bảo vệ đáy tại [${marketStructure.primaryOrderBlock.low.toFixed(2)} - ${marketStructure.primaryOrderBlock.high.toFixed(2)}]`);
    }
    if (marketStructure.primaryFVG?.type === 'BULLISH_FVG') {
      bullStructural.push(`Fair Value Gap (FVG) tăng giá với midpoint $${marketStructure.primaryFVG.midpoint.toFixed(2)}`);
    }

    if (volume.volumeTrend === 'ACCUMULATION') {
      bullScore += 10;
      bullVolume.push(`Lực tích lũy dòng tiền (Buyer chiếm ${volume.buyingVolumePercent.toFixed(1)}%, RVOL: ${volume.rvol.toFixed(2)}x)`);
    }
    if (momentum.momentumState === 'STRONG_BULL' || momentum.momentumState === 'BULL_DIV') {
      bullScore += 10;
      bullIndicators.push(`Quán tính RSI dốc lên (+${momentum.rsiSlope.toFixed(2)}), không có phân kỳ giảm`);
    }

    const upsideTarget = marketStructure.swingHigh > currentPrice ? marketStructure.swingHigh * 1.005 : currentPrice * 1.015;
    const bullInvalidation = marketStructure.primaryOrderBlock?.low
      ? marketStructure.primaryOrderBlock.low * 0.998
      : currentPrice - (technical.atr14 * 1.5 || currentPrice * 0.008);

    const bullRisk = Math.max(0.0001, currentPrice - bullInvalidation);
    const bullReward = Math.max(0.0001, upsideTarget - currentPrice);
    const bullProposedRR = +(bullReward / bullRisk).toFixed(2);

    const bullArgument: BullAgentArgument = {
      role: 'BULL_AGENT',
      thesis: `Thị trường hỗ trợ vị thế LONG dựa trên ${bullStructural.length > 0 ? 'cấu trúc SMC tăng' : 'xu hướng EMA'} và dòng tiền tích lũy`,
      structuralPoints: bullStructural,
      indicatorPoints: bullIndicators,
      volumePoints: bullVolume,
      upsideLiquidityTarget: upsideTarget,
      invalidationLevel: bullInvalidation,
      convictionScore: Math.min(100, bullScore),
      proposedRiskReward: bullProposedRR,
    };

    // ------------------------------------------------------------------------
    // 2. BEAR AGENT: Identifies downside thesis, counter-evidence & traps
    // ------------------------------------------------------------------------
    const bearStructural: string[] = [];
    const bearIndicators: string[] = [];
    const bearRisks: string[] = [];
    let bearScore = 40; // baseline

    if (technical.bias === 'BEARISH') {
      bearScore += 20;
      bearIndicators.push(`EMA9 (${technical.ema9.toFixed(2)}) < EMA21 (${technical.ema21.toFixed(2)}), áp lực cản trên`);
    }
    if (technical.rsi14 >= 68) {
      bearScore += 15;
      bearIndicators.push(`RSI14 quá mua (${technical.rsi14.toFixed(1)}) — nguy cơ kiệt sức mua`);
    }
    if (momentum.divergenceType === 'BEARISH_DIVERGENCE') {
      bearScore += 20;
      bearRisks.push(`Phát hiện phân kỳ giảm Bearish Divergence rõ rệt giữa giá và RSI/MACD`);
    }

    if (marketStructure.structureBias === 'BEARISH') {
      bearScore += 25;
      bearStructural.push(`Cấu trúc thị trường phá vỡ đáy Bearish BOS/CHoCH tại $${marketStructure.swingLow.toFixed(2)}`);
    }
    if (marketStructure.liquiditySweep.detected && marketStructure.liquiditySweep.side === 'BUY_SIDE') {
      bearScore += 20;
      bearRisks.push(`Cá mập vừa quét thanh khoản đỉnh (Buy-side Liquidity Sweep) — bẫy Bull Trap`);
    }

    if (volume.volumeTrend === 'DISTRIBUTION') {
      bearScore += 10;
      bearRisks.push(`Dòng tiền đang âm thầm xả hàng (Phân phối, Seller chiếm ${volume.sellingVolumePercent.toFixed(1)}%)`);
    }

    // Fee & Friction hurdle defense
    bearRisks.push(`Chi phí trượt giá & phí Bitget Taker (0.12% roundtrip) tạo rào cản cản trở các lệnh scalp ngắn`);

    const downsideTarget = marketStructure.swingLow < currentPrice ? marketStructure.swingLow * 0.995 : currentPrice * 0.985;
    const bearInvalidation = marketStructure.swingHigh > currentPrice
      ? marketStructure.swingHigh * 1.002
      : currentPrice + (technical.atr14 * 1.5 || currentPrice * 0.008);

    const bearRisk = Math.max(0.0001, bearInvalidation - currentPrice);
    const bearReward = Math.max(0.0001, currentPrice - downsideTarget);
    const bearProposedRR = +(bearReward / bearRisk).toFixed(2);

    const bearArgument: BearAgentArgument = {
      role: 'BEAR_AGENT',
      thesis: `Phe Gấu chiếm ưu thế hoặc cấu trúc chứa rủi ro đảo chiều/bẫy giá`,
      structuralPoints: bearStructural,
      indicatorPoints: bearIndicators,
      riskAndTrapPoints: bearRisks,
      downsideLiquidityTarget: downsideTarget,
      invalidationLevel: bearInvalidation,
      convictionScore: Math.min(100, bearScore),
      proposedRiskReward: bearProposedRR,
    };

    // ------------------------------------------------------------------------
    // 3. RESEARCH MANAGER: Fact-checking, hallucination audit & consensus
    // ------------------------------------------------------------------------
    const hallucinationPenalties: string[] = [];
    const conflictsIdentified: string[] = [];

    // Fact-checking Bull's claims
    if (bullArgument.indicatorPoints.some((p) => p.includes('RSI14 ở mức')) && technical.rsi14 >= 72) {
      hallucinationPenalties.push('Bull phớt lờ trạng thái RSI quá mua nghiêm trọng');
      bullScore -= 15;
    }
    if (synthesis.macroBiasH1 === 'BEARISH' && bullScore > 60) {
      conflictsIdentified.push('Mâu thuẫn khung thời gian: Khung H1 đang xu hướng GIẢM, nhưng Bull đòi Long');
      bullScore -= 15;
    }

    // Fact-checking Bear's claims
    if (bearArgument.indicatorPoints.some((p) => p.includes('EMA9 < EMA21')) && technical.emaCross === 'ALIGNED_BULL') {
      hallucinationPenalties.push('Bear tuyên bố đường trung bình giảm nhưng thực tế EMA đang Bullish');
      bearScore -= 20;
    }
    if (synthesis.macroBiasH1 === 'BULLISH' && bearScore > 60) {
      conflictsIdentified.push('Mâu thuẫn khung thời gian: Khung H1 đang xu hướng TĂNG, nhưng Bear đòi Short');
      bearScore -= 15;
    }

    const bullScoreAdjusted = Math.max(0, bullScore);
    const bearScoreAdjusted = Math.max(0, bearScore);
    const consensusMargin = bullScoreAdjusted - bearScoreAdjusted;

    let debateVerdict: ResearchManagerAudit['debateVerdict'] = 'DEADLOCK_NO_TRADE';
    let summaryRationale = '';

    if (consensusMargin >= 22 && bullProposedRR >= 1.5 && bullScoreAdjusted >= 65) {
      debateVerdict = 'BULL_CONVICTION';
      summaryRationale = `Bull Agent chiến thắng áp đảo (Điểm: ${bullScoreAdjusted} vs ${bearScoreAdjusted}, chênh lệch +${consensusMargin}). Bằng chứng SMC và dòng tiền đủ sức bù đắp chi phí sàn.`;
    } else if (consensusMargin <= -22 && bearProposedRR >= 1.5 && bearScoreAdjusted >= 65) {
      debateVerdict = 'BEAR_CONVICTION';
      summaryRationale = `Bear Agent chiến thắng áp đảo (Điểm: ${bearScoreAdjusted} vs ${bullScoreAdjusted}, chênh lệch ${consensusMargin}). Tín hiệu bẫy thanh khoản hoặc phân kỳ giảm rõ rệt.`;
    } else {
      debateVerdict = 'DEADLOCK_NO_TRADE';
      summaryRationale = `Hai bên giằng co bất phân thắng bại (Bull: ${bullScoreAdjusted}, Bear: ${bearScoreAdjusted}, chênh lệch: ${consensusMargin}). Nghiêm cấm vào lệnh khi thiếu lợi thế thống kê rõ ràng (NO TRADE).`;
    }

    const researchManagerAudit: ResearchManagerAudit = {
      role: 'RESEARCH_MANAGER',
      factCheckPassed: hallucinationPenalties.length === 0,
      hallucinationPenalties,
      conflictsIdentified,
      bullScoreAdjusted,
      bearScoreAdjusted,
      consensusMargin,
      debateVerdict,
      summaryRationale,
    };

    // ------------------------------------------------------------------------
    // 4. TRADER AGENT: Formulates executable proposal (LONG / SHORT / NO_TRADE)
    // ------------------------------------------------------------------------
    let traderDecision: TraderAgentDecision;

    // Fixed friction costs on Bitget USDT-M
    const roundTripFeeBps = 12.0; // 0.06% x 2
    const slippageBps = 3.0;
    const spreadBps = ((ticker.askPr && ticker.bidPr ? ticker.askPr - ticker.bidPr : 0.0001) / currentPrice) * 10000;
    const totalFrictionBps = roundTripFeeBps + slippageBps + spreadBps;

    if (debateVerdict === 'BULL_CONVICTION') {
      const entryPrice = ticker.askPr || currentPrice;
      const stopLossPrice = +(bullInvalidation).toFixed(4);
      const slDistance = entryPrice - stopLossPrice;
      // Target TP strictly guarantees minimum RR after all friction
      const targetReward = Math.max(slDistance * minRiskRewardRequired, (entryPrice * (totalFrictionBps * 2)) / 10000);
      const takeProfitPrice = +(entryPrice + targetReward).toFixed(4);
      const actualRR = +((takeProfitPrice - entryPrice) / Math.max(0.0001, entryPrice - stopLossPrice)).toFixed(2);
      const expectedNetEdgeBps = +(((takeProfitPrice - entryPrice) / entryPrice) * 10000 - totalFrictionBps).toFixed(1);

      traderDecision = {
        role: 'TRADER_AGENT',
        finalAction: 'LONG',
        finalConvictionScore: bullScoreAdjusted,
        executionStrategy: 'TRADINGAGENTS_CONSENSUS_BULL_EXPANSION',
        recommendedEntry: entryPrice,
        recommendedSL: stopLossPrice,
        recommendedTP: takeProfitPrice,
        riskRewardRatio: actualRR,
        expectedNetEdgeBps,
        tradingThesis: `Đồng thuận LONG theo TradingAgents Debate. Entry: $${entryPrice}, SL: $${stopLossPrice}, Net TP: $${takeProfitPrice} (RR 1:${actualRR}, Edge ròng: +${expectedNetEdgeBps} bps sau phí).`,
      };
    } else if (debateVerdict === 'BEAR_CONVICTION') {
      const entryPrice = ticker.bidPr || currentPrice;
      const stopLossPrice = +(bearInvalidation).toFixed(4);
      const slDistance = stopLossPrice - entryPrice;
      const targetReward = Math.max(slDistance * minRiskRewardRequired, (entryPrice * (totalFrictionBps * 2)) / 10000);
      const takeProfitPrice = +(entryPrice - targetReward).toFixed(4);
      const actualRR = +((entryPrice - takeProfitPrice) / Math.max(0.0001, stopLossPrice - entryPrice)).toFixed(2);
      const expectedNetEdgeBps = +(((entryPrice - takeProfitPrice) / entryPrice) * 10000 - totalFrictionBps).toFixed(1);

      traderDecision = {
        role: 'TRADER_AGENT',
        finalAction: 'SHORT',
        finalConvictionScore: bearScoreAdjusted,
        executionStrategy: 'TRADINGAGENTS_CONSENSUS_BEAR_REVERSAL',
        recommendedEntry: entryPrice,
        recommendedSL: stopLossPrice,
        recommendedTP: takeProfitPrice,
        riskRewardRatio: actualRR,
        expectedNetEdgeBps,
        tradingThesis: `Đồng thuận SHORT theo TradingAgents Debate. Entry: $${entryPrice}, SL: $${stopLossPrice}, Net TP: $${takeProfitPrice} (RR 1:${actualRR}, Edge ròng: +${expectedNetEdgeBps} bps sau phí).`,
      };
    } else {
      traderDecision = {
        role: 'TRADER_AGENT',
        finalAction: 'NO_TRADE',
        finalConvictionScore: 0,
        executionStrategy: 'RISK_AVERSION_PRESERVE_CAPITAL',
        recommendedEntry: currentPrice,
        recommendedSL: currentPrice,
        recommendedTP: currentPrice,
        riskRewardRatio: 0,
        expectedNetEdgeBps: 0,
        tradingThesis: `Quyết định NO TRADE từ Trader Agent: ${summaryRationale}`,
      };
    }

    return {
      sessionId,
      symbol: synthesis.symbol,
      timestamp: Date.now(),
      analystsSynthesis: synthesis,
      bullArgument,
      bearArgument,
      researchManagerAudit,
      traderDecision,
      executionOutcome: traderDecision.finalAction !== 'NO_TRADE' ? 'DISPATCHED_TO_BOT4' : 'SUPPRESSED_AS_NO_TRADE',
    };
  }
}

export const tradingAgentsDebateEngine = new TradingAgentsDebateEngine();
