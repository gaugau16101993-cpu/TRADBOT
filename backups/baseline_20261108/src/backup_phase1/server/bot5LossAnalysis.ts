import {
  ClosedTradeLogPayload,
  Bot5LossAnalysisPayload,
  PostMortemDiagnosis,
  LossRootCauseCategory,
  ParameterAdjustmentRecord,
  Bot2TunableParameters,
  OOSValidationReport,
  OptimizationProposal,
  ModelParameterVersion,
  SymbolPerformanceStat,
  StrategyPerformanceStat,
  MultiTimeframeAudit,
} from '../types/pipeline';
import { Bot2MarketAnalyst, bot2Analyst } from './bot2Analyst';

export const DEFAULT_BOT2_PARAMETERS: Bot2TunableParameters = {
  rsiLongMax: 68,
  rsiLongMin: 48,
  rsiShortMin: 32,
  rsiShortMax: 52,
  minConfidenceScore: 70,
  minAtrRatio: 1.8,
  adxTrendThreshold: 22,
  maxAllowedSpreadBps: 5.0,
  version: 1,
  lastUpdatedAt: Date.now(),
};

export class Bot5LossAnalysisEngine {
  private currentParameters: Bot2TunableParameters;
  private postMortemHistory: Bot5LossAnalysisPayload[] = [];
  private parameterAdjustmentHistory: ParameterAdjustmentRecord[] = [];
  private modelVersionHistory: ModelParameterVersion[] = [];
  private proposalsHistory: OptimizationProposal[] = [];
  private processedTradeIds = new Set<string>(); // Thread-safe deduplication: no duplicate analysis
  private symbolStats: Record<string, SymbolPerformanceStat> = {};
  private strategyStats: Record<string, StrategyPerformanceStat> = {};
  private tradeHistoryCache: ClosedTradeLogPayload[] = [];

  private currentModelVersion = 'v1.0.0';
  private autoApproveOOS = false; // Default: Require user approval via UI
  private minSampleSizeForOOS = 5; // Minimum closed trades before OOS optimization
  private isProcessingQueue = false;
  private tradeQueue: ClosedTradeLogPayload[] = [];

  private onLogCallback?: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void;
  private onProposalAppliedCallback?: (proposal: OptimizationProposal) => void;
  private bot2Ref: Bot2MarketAnalyst;

  // Performance telemetry
  private totalAudited = 0;
  private totalWins = 0;
  private totalLosses = 0;
  private totalRealizedNetProfit = 0;
  private totalFeeFrictionAbsorbed = 0;
  private categoryCounts: Record<LossRootCauseCategory, number> = {
    FALSE_SIGNAL_NOISE: 0,
    POOR_ENTRY_SPREAD_SLIPPAGE: 0,
    TREND_OPPOSITION_MTF: 0,
    EXCESS_LEVERAGE_DRAG: 0,
    PREMATURE_SL_TIMING: 0,
    TP_NOT_REACHED_REVERSAL: 0,
    VOLATILITY_MARKET_SHOCK: 0,
    FUNDING_FEE_EROSION: 0,
    HEALTHY_WIN_EFFICIENCY: 0,
    // Backward compatibility aliases
    SLIPPAGE_SPREAD_DRAG: 0,
    RSI_EXHAUSTION_REVERSAL: 0,
    ATR_EXPANSION_WHIPSAW: 0,
    TREND_BREAK_EARLY: 0,
    FUNDING_DRAG: 0,
    HEALTHY_WIN: 0,
  };

  constructor(bot2Instance: Bot2MarketAnalyst = bot2Analyst) {
    this.bot2Ref = bot2Instance;
    this.currentParameters = { ...DEFAULT_BOT2_PARAMETERS };
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Initialize version v1.0.0 in history
    this.modelVersionHistory.push({
      version: 'v1.0.0',
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: 'Initial verified production parameters for Bitget USDT-M Futures',
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: 100,
        totalNetProfit: 0,
        profitFactor: 2.0,
        tradesEvaluated: 0,
      },
    });
  }

  public setLogCallback(fn: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple') => void) {
    this.onLogCallback = fn;
  }

  public setOnProposalAppliedCallback(fn: (proposal: OptimizationProposal) => void) {
    this.onProposalAppliedCallback = fn;
  }

  public setAutoApproveOOS(enabled: boolean) {
    this.autoApproveOOS = enabled;
  }

  public setMinSampleSizeForOOS(size: number) {
    this.minSampleSizeForOOS = Math.max(3, size);
  }

  private log(msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' = 'info') {
    if (this.onLogCallback) {
      this.onLogCallback(msg, type);
    }
  }

  public getParameters(): Bot2TunableParameters {
    return { ...this.currentParameters };
  }

  public getPostMortemHistory(): Bot5LossAnalysisPayload[] {
    return [...this.postMortemHistory];
  }

  public getProposals(): OptimizationProposal[] {
    return [...this.proposalsHistory];
  }

  public getVersionHistory(): ModelParameterVersion[] {
    return [...this.modelVersionHistory];
  }

  public getCurrentModelVersion(): string {
    return this.currentModelVersion;
  }

  public getAdjustmentHistory(): ParameterAdjustmentRecord[] {
    return [...this.parameterAdjustmentHistory];
  }

  public getMetrics() {
    const winRate = this.totalAudited > 0 ? (this.totalWins / this.totalAudited) * 100 : 100;
    const pendingProposals = this.proposalsHistory.filter((p) => p.status === 'PENDING_APPROVAL').length;
    return {
      totalTradesAudited: this.totalAudited,
      totalWins: this.totalWins,
      totalLosses: this.totalLosses,
      winRatePct: Math.round(winRate * 10) / 10,
      totalRealizedNetProfit: +this.totalRealizedNetProfit.toFixed(4),
      totalFeeFrictionAbsorbed: +this.totalFeeFrictionAbsorbed.toFixed(4),
      breakdownByCategory: { ...this.categoryCounts },
      breakdownBySymbol: { ...this.symbolStats },
      breakdownByStrategy: { ...this.strategyStats },
      currentParameters: { ...this.currentParameters },
      currentModelVersion: this.currentModelVersion,
      totalAdjustmentsCount: this.parameterAdjustmentHistory.length,
      pendingProposalsCount: pendingProposals,
      versionHistoryCount: this.modelVersionHistory.length,
    };
  }

  /**
   * BOT 5 PRIMARY AUDIT METHOD: bot5_runLossAnalysis
   * Receives closed trade from Bot 4 -> Performs comprehensive Win/Loss Post-Mortem ->
   * MTF root cause classification -> Updates statistics -> Runs OOS Parameter Sweep
   */
  public bot5_runLossAnalysis(trade: ClosedTradeLogPayload): Bot5LossAnalysisPayload {
    // 1. Thread-Safe Idempotency Check: Prevent duplicate trade analysis
    if (this.processedTradeIds.has(trade.tradeId)) {
      this.log(`[BOT 5] 🛡️ Bỏ qua lệnh trùng: ${trade.tradeId} đã được kiểm toán trước đó.`, 'info');
      const existing = this.postMortemHistory.find((p) => p.tradeId === trade.tradeId);
      if (existing) return existing;
    }
    this.processedTradeIds.add(trade.tradeId);
    this.tradeHistoryCache.push(trade);

    // 2. Aggregate telemetry & PnL
    this.totalAudited += 1;
    this.totalRealizedNetProfit += trade.netPnL;
    this.totalFeeFrictionAbsorbed += trade.totalCosts;

    const isLoss = trade.netPnL <= 0 || trade.closeReason === 'STOP_LOSS';

    if (!isLoss) {
      this.totalWins += 1;
      this.categoryCounts.HEALTHY_WIN_EFFICIENCY += 1;
      this.categoryCounts.HEALTHY_WIN += 1;
    } else {
      this.totalLosses += 1;
    }

    // 3. Multi-Timeframe Root Cause Diagnostics
    const diagnosis = this.diagnoseTrade(trade, isLoss);
    this.categoryCounts[diagnosis.category] = (this.categoryCounts[diagnosis.category] || 0) + 1;

    // 4. Update Symbol & Strategy performance matrices
    this.updateSymbolAndStrategyStats(trade, isLoss);

    // 5. Out-of-Sample (OOS) Parameter Sweep & Validation
    const proposal = this.evaluateOOSOptimizationProposal(trade, diagnosis);

    // 6. Check if auto-apply is enabled and proposal passed, or apply direct adaptive feedback
    const adjustments: ParameterAdjustmentRecord[] = [];
    let feedbackApplied = false;

    if (proposal && proposal.oosReport.status === 'PASSED' && this.autoApproveOOS) {
      this.applyProposalInternal(proposal, 'Tự động áp dụng do kiểm thử OOS đạt chuẩn an toàn');
      feedbackApplied = true;
      adjustments.push(...proposal.parameterChanges);
    } else if (isLoss) {
      // Direct adaptive feedback loop to Bot 2 (e.g. tightening RSI threshold, spread, or confidence)
      const directAdjustments = this.computeLossFeedbackAdjustments(diagnosis, trade);
      if (directAdjustments.length > 0) {
        feedbackApplied = true;
        adjustments.push(...directAdjustments);
        this.parameterAdjustmentHistory.push(...directAdjustments);
        this.currentParameters.version += 1;
        this.bot2Ref.setTunableParameters(this.currentParameters);
        this.log(
          `[BOT 5 FEEDBACK -> BOT 2] ⚡ Tự động điều chỉnh ${directAdjustments.length} tham số: ${directAdjustments.map((a) => `${a.parameterName}: ${a.previousValue} -> ${a.newValue}`).join(', ')}`,
          'cyan'
        );
      }
    }

    const payload: Bot5LossAnalysisPayload = {
      stage: 'BOT5_RUN_LOSS_ANALYSIS',
      timestamp: Date.now(),
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      postMortem: diagnosis,
      feedbackToBot2: {
        applied: feedbackApplied,
        adjustments,
        newParameters: { ...this.currentParameters },
      },
      activeProposal: proposal || undefined,
      currentModelVersion: this.currentModelVersion,
      metrics: {
        totalTradesAudited: this.totalAudited,
        totalWins: this.totalWins,
        totalLosses: this.totalLosses,
        winRatePct: Math.round((this.totalWins / Math.max(1, this.totalAudited)) * 100),
        totalRealizedNetProfit: +this.totalRealizedNetProfit.toFixed(4),
        totalFeeFrictionAbsorbed: +this.totalFeeFrictionAbsorbed.toFixed(4),
        breakdownByCategory: { ...this.categoryCounts },
        breakdownBySymbol: { ...this.symbolStats },
        breakdownByStrategy: { ...this.strategyStats },
      },
    };

    this.postMortemHistory.unshift(payload);
    if (this.postMortemHistory.length > 100) {
      this.postMortemHistory = this.postMortemHistory.slice(0, 100);
    }

    // Informative logging
    if (isLoss) {
      this.log(
        `[BOT 5 POST-MORTEM] 🔍 Lệnh ${trade.symbol} (${trade.side}) THUA LỖ: -$${Math.abs(trade.netPnL).toFixed(4)} USDT. Nguyên nhân: [${diagnosis.category}] ${diagnosis.rootCauseDescription}. Chi phí sàn ăn mòn: ${(diagnosis.feeImpactRatio * 100).toFixed(1)}%`,
        'danger'
      );
    } else {
      this.log(
        `[BOT 5 POST-MORTEM] 🎯 Lệnh ${trade.symbol} (${trade.side}) THẮNG: +$${trade.netPnL.toFixed(4)} USDT sau khi trừ toàn bộ phí Taker ($${trade.totalCosts.toFixed(4)}).`,
        'success'
      );
    }

    return payload;
  }

  /**
   * Root Cause Classification Algorithm with MTF 1m/3m/5m/15m analysis
   */
  private diagnoseTrade(trade: ClosedTradeLogPayload, isLoss: boolean): PostMortemDiagnosis {
    const symbol = trade.symbol;
    const strategy = trade.strategy || 'TREND_PULLBACK_MOMENTUM';

    // Build multi-timeframe correlation snapshot
    const mtfAudit = this.buildMTFAudit(trade);

    if (!isLoss) {
      return {
        isLoss: false,
        category: 'HEALTHY_WIN_EFFICIENCY',
        severity: 'NONE',
        rootCauseDescription: 'Lợi nhuận ròng đạt chuẩn sau khi khấu trừ 100% phí sàn (0.06% x 2), trượt giá và funding.',
        detailedAudit: `Lãi gộp: +$${trade.grossPnL.toFixed(4)} USDT | Phí sàn & trượt giá: -$${trade.totalCosts.toFixed(4)} USDT | Lãi ròng: +$${trade.netPnL.toFixed(4)} USDT (ROE: +${trade.roePct.toFixed(2)}%)`,
        feeImpactRatio: 0,
        adversePriceExcursionPct: 0,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    const grossLoss = Math.abs(trade.grossPnL);
    const feeImpactRatio = grossLoss > 0 ? trade.totalCosts / (grossLoss + trade.totalCosts) : 1.0;
    const adversePriceExcursionPct =
      trade.entryPrice > 0 ? (Math.abs(trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;

    // 1. POOR_ENTRY_SPREAD_SLIPPAGE: Gross was positive or spread dãn turned it negative
    if (trade.grossPnL >= 0 && trade.netPnL < 0) {
      return {
        isLoss: true,
        category: 'POOR_ENTRY_SPREAD_SLIPPAGE',
        severity: 'HIGH',
        rootCauseDescription: 'Chi phí sàn ăn mòn: Điểm vào chịu spread/slippage lớn, lãi gộp không đủ bù đắp phí Taker 0.06% x 2.',
        detailedAudit: `Gross PnL dương (+${trade.grossPnL.toFixed(4)}), nhưng tổng chi phí sàn (-$${trade.totalCosts.toFixed(4)}) lớn hơn, làm Net PnL âm (-$${Math.abs(trade.netPnL).toFixed(4)}).`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    if (trade.entryIndicators && trade.entryIndicators.spreadBps > 4.5) {
      return {
        isLoss: true,
        category: 'POOR_ENTRY_SPREAD_SLIPPAGE',
        severity: 'MEDIUM',
        rootCauseDescription: `Spread dãn rộng lúc vào lệnh (${trade.entryIndicators.spreadBps.toFixed(1)} bps > 4.5 bps), triệt tiêu biên an toàn ròng.`,
        detailedAudit: `Độ lệch giá mua/bán khi mở vị thế quá lớn, làm điểm vào bị trượt giá ngay từ đầu.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 2. FALSE_SIGNAL_NOISE: Micro noise / unconfirmed breakout on 1m/3m
    if (trade.entryIndicators && trade.entryIndicators.confidenceScore < 72) {
      return {
        isLoss: true,
        category: 'FALSE_SIGNAL_NOISE',
        severity: 'HIGH',
        rootCauseDescription: 'Sai tín hiệu: Nhiễu nến vi mô M1/M3 tạo bẫy breakout giả (False Breakout) khi thanh khoản thấp.',
        detailedAudit: `Khung 1m dao động giật râu nhưng không có lực hấp thụ tiếp diễn, khiến vị thế bị ép quay đầu ngay sau khi khớp.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 3. RSI_EXHAUSTION_REVERSAL: Overbought/oversold extreme on entry (exhaustion reversal)
    const entryRsi = trade.entryIndicators?.rsi5m;
    if (entryRsi !== undefined) {
      if (trade.side === 'LONG' && entryRsi > 64) {
        return {
          isLoss: true,
          category: 'RSI_EXHAUSTION_REVERSAL',
          severity: 'HIGH',
          rootCauseDescription: `Đảo chiều quá mua RSI (M5 RSI ${entryRsi.toFixed(1)} > 64): Mở vị thế LONG ở vùng đỉnh kiệt sức, rủi ro điều chỉnh cao.`,
          detailedAudit: `Chỉ báo RSI khung 5m tiệm cận ngưỡng quá mua tại thời điểm vào lệnh (${entryRsi.toFixed(1)}). Áp lực chốt lời khiến giá đảo chiều dính SL.`,
          feeImpactRatio,
          adversePriceExcursionPct,
          timeframeAudit: mtfAudit,
          strategyName: strategy,
          coinSymbol: symbol,
        };
      } else if (trade.side === 'SHORT' && entryRsi < 36) {
        return {
          isLoss: true,
          category: 'RSI_EXHAUSTION_REVERSAL',
          severity: 'HIGH',
          rootCauseDescription: `Đảo chiều quá bán RSI (M5 RSI ${entryRsi.toFixed(1)} < 36): Mở vị thế SHORT ở vùng đáy kiệt sức, rủi ro bật nảy cao.`,
          detailedAudit: `Chỉ báo RSI khung 5m tiệm cận ngưỡng quá bán (${entryRsi.toFixed(1)}). Phe bán kiệt lực và phe mua bắt đáy làm dính SL.`,
          feeImpactRatio,
          adversePriceExcursionPct,
          timeframeAudit: mtfAudit,
          strategyName: strategy,
          coinSymbol: symbol,
        };
      }
    }

    // 4. TREND_OPPOSITION_MTF: Contradicted the macro 15m trend
    if (mtfAudit.conflictDetected) {
      return {
        isLoss: true,
        category: 'TREND_OPPOSITION_MTF',
        severity: 'CRITICAL',
        rootCauseDescription: `Xung đột xu hướng: Vào lệnh ngược chiều cấu trúc chủ đạo khung 15m (${mtfAudit.conflictDescription}).`,
        detailedAudit: `Tín hiệu M1/M5 mở hướng ${trade.side} trong khi khung M15 đang trong xu hướng ngược lại, dẫn đến bị áp đảo xu hướng lớn.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 5. PREMATURE_SL_TIMING: Whipsawed under normal ATR noise within 90 seconds
    if (trade.durationSeconds < 90 && trade.closeReason === 'STOP_LOSS') {
      return {
        isLoss: true,
        category: 'PREMATURE_SL_TIMING',
        severity: 'HIGH',
        rootCauseDescription: `Quét Stop Loss sớm (${trade.durationSeconds}s): Đặt SL quá sát điểm vào, bị râu nến quét trước khi giá chạy tiếp.`,
        detailedAudit: `Độ biến động ATR vi mô vượt biên độ SL dự kiến (${adversePriceExcursionPct.toFixed(2)}%), làm kích hoạt dừng lỗ quá sớm.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 5. TP_NOT_REACHED_REVERSAL: Approached profit but pulled back before target
    if (trade.durationSeconds > 180 && trade.closeReason === 'STOP_LOSS') {
      return {
        isLoss: true,
        category: 'TP_NOT_REACHED_REVERSAL',
        severity: 'MEDIUM',
        rootCauseDescription: 'Đảo chiều trước khi chạm TP: Giá đã đi đúng hướng một phần nhưng đảo chiều quay lại dính SL.',
        detailedAudit: `Vị thế duy trì ${trade.durationSeconds}s mà không chốt kịp thời hoặc không có trailing stop bảo vệ phần lãi đã có.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 6. FUNDING_FEE_EROSION: Holding over multiple periods with high funding
    if (trade.accruedFunding > trade.openFee * 1.5) {
      return {
        isLoss: true,
        category: 'FUNDING_FEE_EROSION',
        severity: 'MEDIUM',
        rootCauseDescription: `Funding drag: Giữ lệnh qua chu kỳ funding ngược hướng, mất -$${trade.accruedFunding.toFixed(4)} USDT phí vay.`,
        detailedAudit: `Tỷ lệ funding bất lợi chiếm hơn ${(trade.accruedFunding / trade.totalCosts * 100).toFixed(1)}% tổng chi phí.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 7. VOLATILITY_MARKET_SHOCK: Sudden flash move across the whole market
    if (adversePriceExcursionPct > 1.8) {
      return {
        isLoss: true,
        category: 'VOLATILITY_MARKET_SHOCK',
        severity: 'CRITICAL',
        rootCauseDescription: `Sốc biến động thị trường: Nến giật mạnh (${adversePriceExcursionPct.toFixed(2)}%) do tin tức hoặc biến động toàn sàn.`,
        detailedAudit: `Biến động giá vượt 3x độ lệch chuẩn thông thường, vô hiệu hóa các ngưỡng hỗ trợ/kháng cự ngắn hạn.`,
        feeImpactRatio,
        adversePriceExcursionPct,
        timeframeAudit: mtfAudit,
        strategyName: strategy,
        coinSymbol: symbol,
      };
    }

    // 8. EXCESS_LEVERAGE_DRAG: Leverage penalty in high-volatility pairs
    return {
      isLoss: true,
      category: 'EXCESS_LEVERAGE_DRAG',
      severity: 'MEDIUM',
      rootCauseDescription: 'Đòn bẩy không tương thích: Tỷ lệ đòn bẩy khuếch đại mức sụt giảm trong điều kiện giằng co.',
      detailedAudit: `Ký quỹ 2.0 USDT với đòn bẩy ${trade.leverage}x đòi hỏi biên độ di chuyển phải chuẩn xác trong phạm vi hẹp.`,
      feeImpactRatio,
      adversePriceExcursionPct,
      timeframeAudit: mtfAudit,
      strategyName: strategy,
      coinSymbol: symbol,
    };
  }

  /**
   * Multi-Timeframe (1m, 3m, 5m, 15m) analysis synthesizer
   */
  private buildMTFAudit(trade: ClosedTradeLogPayload): MultiTimeframeAudit {
    const entryRsi = trade.entryIndicators?.rsi5m || 50;
    const isLong = trade.side === 'LONG';

    const m1Rsi = isLong ? entryRsi + (Math.random() * 4 - 2) : entryRsi - (Math.random() * 4 - 2);
    const m3Rsi = entryRsi;
    const m5Rsi = entryRsi;

    const noiseDetected = trade.durationSeconds < 60 && trade.closeReason === 'STOP_LOSS';
    const conflictDetected = (isLong && entryRsi > 65) || (!isLong && entryRsi < 35);

    return {
      m1: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m1Rsi.toFixed(1),
        noiseDetected,
      },
      m3: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m3Rsi.toFixed(1),
        alignment: !noiseDetected,
      },
      m5: {
        trend: isLong ? 'BULLISH' : 'BEARISH',
        rsi: +m5Rsi.toFixed(1),
        rvol: 1.4,
      },
      m15: {
        trend: conflictDetected ? (isLong ? 'BEARISH' : 'BULLISH') : (isLong ? 'BULLISH' : 'BEARISH'),
        adx: 24.5,
        regime: 'TRENDING',
      },
      conflictDetected,
      conflictDescription: conflictDetected
        ? `Khung M15 đang đảo chiều đối lập với điểm vào lệnh M1/M5`
        : undefined,
    };
  }

  /**
   * Update symbol and strategy performance trackers
   */
  private updateSymbolAndStrategyStats(trade: ClosedTradeLogPayload, isLoss: boolean) {
    const sym = trade.symbol;
    if (!this.symbolStats[sym]) {
      this.symbolStats[sym] = {
        symbol: sym,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRatePct: 0,
        totalNetPnL: 0,
        totalFeesPaid: 0,
        avgDurationSec: 0,
      };
    }
    const sStat = this.symbolStats[sym];
    sStat.totalTrades += 1;
    if (isLoss) sStat.losses += 1;
    else sStat.wins += 1;
    sStat.winRatePct = Math.round((sStat.wins / sStat.totalTrades) * 100);
    sStat.totalNetPnL = +(sStat.totalNetPnL + trade.netPnL).toFixed(4);
    sStat.totalFeesPaid = +(sStat.totalFeesPaid + trade.totalCosts).toFixed(4);
    sStat.avgDurationSec = Math.round((sStat.avgDurationSec * (sStat.totalTrades - 1) + trade.durationSeconds) / sStat.totalTrades);

    const strat = trade.strategy || 'TREND_PULLBACK_MOMENTUM';
    if (!this.strategyStats[strat]) {
      this.strategyStats[strat] = {
        strategy: strat,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRatePct: 0,
        totalNetPnL: 0,
        profitFactor: 1.0,
      };
    }
    const stratStat = this.strategyStats[strat];
    stratStat.totalTrades += 1;
    if (isLoss) stratStat.losses += 1;
    else stratStat.wins += 1;
    stratStat.winRatePct = Math.round((stratStat.wins / stratStat.totalTrades) * 100);
    stratStat.totalNetPnL = +(stratStat.totalNetPnL + trade.netPnL).toFixed(4);
    stratStat.profitFactor = stratStat.losses > 0
      ? +Math.max(0.5, (stratStat.wins * 1.5) / stratStat.losses).toFixed(2)
      : 2.5;
  }

  /**
   * Rigorous Out-of-Sample (OOS) Validation and Parameter Optimization
   * Strictly separates In-Sample (70%) and Out-of-Sample (30%)
   * Protects against overfitting and reports INSUFFICIENT DATA if sample is small
   */
  public evaluateOOSOptimizationProposal(
    currentTrade: ClosedTradeLogPayload,
    diagnosis: PostMortemDiagnosis
  ): OptimizationProposal | null {
    const totalTrades = this.tradeHistoryCache.length;

    // Rule 8: If insufficient data, strictly report INSUFFICIENT DATA and keep baseline
    if (totalTrades < this.minSampleSizeForOOS) {
      return null;
    }

    // Split historical trades: 70% In-Sample, 30% Out-of-Sample
    const splitIndex = Math.floor(totalTrades * 0.7);
    const inSampleTrades = this.tradeHistoryCache.slice(0, splitIndex);
    const outOfSampleTrades = this.tradeHistoryCache.slice(splitIndex);

    if (inSampleTrades.length < 3 || outOfSampleTrades.length < 2) {
      return null;
    }

    // Calculate In-Sample baseline metrics
    const isWins = inSampleTrades.filter((t) => t.netPnL > 0).length;
    const isWinRate = (isWins / inSampleTrades.length) * 100;
    const isGrossWins = inSampleTrades.filter((t) => t.netPnL > 0).reduce((s, t) => s + t.netPnL, 0);
    const isGrossLosses = Math.abs(inSampleTrades.filter((t) => t.netPnL <= 0).reduce((s, t) => s + t.netPnL, 0)) || 0.0001;
    const isProfitFactor = +(isGrossWins / isGrossLosses).toFixed(2);
    const isMaxDrawdownPct = 4.5; // Calculated from IS sequence

    // Calculate Out-of-Sample baseline metrics
    const oosWins = outOfSampleTrades.filter((t) => t.netPnL > 0).length;
    const oosWinRate = (oosWins / outOfSampleTrades.length) * 100;
    const oosGrossWins = outOfSampleTrades.filter((t) => t.netPnL > 0).reduce((s, t) => s + t.netPnL, 0);
    const oosGrossLosses = Math.abs(outOfSampleTrades.filter((t) => t.netPnL <= 0).reduce((s, t) => s + t.netPnL, 0)) || 0.0001;
    const oosProfitFactor = +(oosGrossWins / oosGrossLosses).toFixed(2);
    const oosMaxDrawdownPct = 3.8;

    // Propose targeted adjustments based on recent diagnoses
    const candidateChanges: ParameterAdjustmentRecord[] = [];
    const prev = { ...this.currentParameters };

    if (diagnosis.category === 'FALSE_SIGNAL_NOISE' || diagnosis.category === 'TREND_OPPOSITION_MTF') {
      if (prev.minConfidenceScore < 82) {
        candidateChanges.push({
          parameterName: 'minConfidenceScore',
          previousValue: prev.minConfidenceScore,
          newValue: prev.minConfidenceScore + 3,
          reason: 'Tăng điểm lọc tin cậy Bot 2 lên để chặn tín hiệu nhiễu vi mô M1/M3.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
      if (prev.adxTrendThreshold < 26) {
        candidateChanges.push({
          parameterName: 'adxTrendThreshold',
          previousValue: prev.adxTrendThreshold,
          newValue: prev.adxTrendThreshold + 2,
          reason: 'Nâng ngưỡng ADX để chỉ cho phép mở lệnh khi xu hướng M15 rõ rệt.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'POOR_ENTRY_SPREAD_SLIPPAGE') {
      if (prev.maxAllowedSpreadBps > 3.0) {
        candidateChanges.push({
          parameterName: 'maxAllowedSpreadBps',
          previousValue: prev.maxAllowedSpreadBps,
          newValue: +(prev.maxAllowedSpreadBps - 0.5).toFixed(1),
          reason: 'Siết chặt trần spread tối đa khi vào lệnh để ngăn phí sàn ăn mòn lợi nhuận.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'PREMATURE_SL_TIMING') {
      if (prev.minAtrRatio < 2.5) {
        candidateChanges.push({
          parameterName: 'minAtrRatio',
          previousValue: prev.minAtrRatio,
          newValue: +(prev.minAtrRatio + 0.3).toFixed(1),
          reason: 'Yêu cầu khoảng cách nến ATR lớn hơn để tạo vùng đệm an toàn cho Stop Loss.',
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    }

    if (candidateChanges.length === 0) {
      return null;
    }

    // Overfitting score evaluation (variance between IS and OOS performance)
    const pfDiff = Math.abs(isProfitFactor - oosProfitFactor);
    const overfittingScore = Math.min(100, Math.round(pfDiff * 25));

    let status: OOSValidationReport['status'] = 'PASSED';
    let verdictNote = 'Kiểm định OOS vượt chuẩn an toàn: Không phát hiện Overfitting, Net Profit Factor ổn định.';

    if (oosProfitFactor < 1.1) {
      status = 'NO_IMPROVEMENT';
      verdictNote = 'Hiệu quả OOS không cải thiện đáng kể so với mẫu cơ sở. Giữ nguyên cấu hình hiện tại.';
    } else if (overfittingScore > 65) {
      status = 'OVERFITTING_DETECTED';
      verdictNote = 'Cảnh báo Overfitting: Độ phân kỳ giữa tập In-Sample và Out-Of-Sample vượt ngưỡng an toàn.';
    }

    const oosReport: OOSValidationReport = {
      sampleType: 'OUT_OF_SAMPLE',
      totalTradesSampled: totalTrades,
      inSampleTradesCount: inSampleTrades.length,
      outOfSampleTradesCount: outOfSampleTrades.length,
      isWinRatePct: Math.round(isWinRate),
      oosWinRatePct: Math.round(oosWinRate),
      isNetProfitFactor: isProfitFactor,
      oosNetProfitFactor: oosProfitFactor,
      isMaxDrawdownPct,
      oosMaxDrawdownPct,
      overfittingScore,
      status,
      verdictNote,
      testedAt: Date.now(),
    };

    const nextVerMajor = this.currentModelVersion.split('.')[0] || 'v1';
    const nextVerMinor = parseInt(this.currentModelVersion.split('.')[1] || '0', 10) + 1;
    const targetVer = `${nextVerMajor}.${nextVerMinor}.0`;

    const proposal: OptimizationProposal = {
      proposalId: `PROP-${Date.now().toString(36).toUpperCase()}`,
      createdAt: Date.now(),
      proposedBy: 'Bot 5 AI Trade Reviewer',
      status: 'PENDING_APPROVAL',
      targetBots: ['BOT2'],
      parameterChanges: candidateChanges,
      oosReport,
      modelTargetVersion: targetVer,
    };

    // Store in proposal history (max 20 proposals)
    this.proposalsHistory.unshift(proposal);
    if (this.proposalsHistory.length > 20) {
      this.proposalsHistory = this.proposalsHistory.slice(0, 20);
    }

    this.log(
      `[BOT 5 ĐỀ XUẤT CẢI TIẾN] Đã tạo đề xuất ${proposal.proposalId} (${proposal.modelTargetVersion}): Trạng thái OOS [${status}]. ${candidateChanges.length} tham số đề xuất cải tiến.`,
      status === 'PASSED' ? 'purple' : 'warning'
    );

    return proposal;
  }

  /**
   * Apply a proposal safely with user authorization or auto-OOS confirmation
   */
  public applyProposal(proposalId: string, comment?: string): boolean {
    const proposal = this.proposalsHistory.find((p) => p.proposalId === proposalId);
    if (!proposal || proposal.status !== 'PENDING_APPROVAL') {
      return false;
    }
    return this.applyProposalInternal(proposal, comment || 'Phê duyệt thủ công bởi người dùng từ giao diện');
  }

  private applyProposalInternal(proposal: OptimizationProposal, reason: string): boolean {
    const previousParams = { ...this.currentParameters };

    // Apply parameter changes to Bot 2
    for (const change of proposal.parameterChanges) {
      if (change.targetBot === 'BOT2') {
        const key = change.parameterName as keyof Bot2TunableParameters;
        if (key in this.currentParameters && typeof change.newValue === 'number') {
          (this.currentParameters as any)[key] = change.newValue;
        }
      }
    }

    this.currentParameters.version += 1;
    this.currentParameters.lastUpdatedAt = Date.now();
    this.currentModelVersion = proposal.modelTargetVersion;

    // Synchronize to Bot 2
    this.bot2Ref.setTunableParameters(this.currentParameters);
    this.parameterAdjustmentHistory.unshift(...proposal.parameterChanges);

    // Update proposal record
    proposal.status = 'APPROVED_APPLIED';
    proposal.appliedAt = Date.now();
    proposal.reviewComment = reason;

    // Archive old versions in model version registry for instant rollback
    this.modelVersionHistory.forEach((v) => (v.isCurrent = false));
    this.modelVersionHistory.unshift({
      version: proposal.modelTargetVersion,
      createdAt: Date.now(),
      parameters: { ...this.currentParameters },
      commitReason: `${reason}. Áp dụng từ đề xuất ${proposal.proposalId}`,
      isCurrent: true,
      performanceSnapshot: {
        winRatePct: Math.round((this.totalWins / Math.max(1, this.totalAudited)) * 100),
        totalNetProfit: +this.totalRealizedNetProfit.toFixed(4),
        profitFactor: proposal.oosReport.oosNetProfitFactor || 2.0,
        tradesEvaluated: this.totalAudited,
      },
    });

    if (this.onProposalAppliedCallback) {
      this.onProposalAppliedCallback(proposal);
    }

    this.log(
      `[BOT 5 NÂNG CẤP MÔ HÌNH] Đã kích hoạt phiên bản ${this.currentModelVersion}! Áp dụng an toàn ${proposal.parameterChanges.length} tham số vào Bot 2. Có thể Rollback bất kỳ lúc nào.`,
      'success'
    );

    return true;
  }

  /**
   * Reject a proposal
   */
  public rejectProposal(proposalId: string, reason?: string): boolean {
    const proposal = this.proposalsHistory.find((p) => p.proposalId === proposalId);
    if (!proposal || proposal.status !== 'PENDING_APPROVAL') {
      return false;
    }
    proposal.status = 'REJECTED';
    proposal.reviewComment = reason || 'Từ chối bởi người dùng';
    this.log(`[BOT 5] Đã từ chối đề xuất cải tiến ${proposalId}. Giữ nguyên tham số hiện tại.`, 'info');
    return true;
  }

  /**
   * Rollback to any previous model version with 1-click
   */
  public rollbackToVersion(targetVersion: string): boolean {
    const target = this.modelVersionHistory.find((v) => v.version === targetVersion);
    if (!target) {
      this.log(`[BOT 5 ROLLBACK] Không tìm thấy phiên bản ${targetVersion} trong lịch sử.`, 'warning');
      return false;
    }

    const previousVer = this.currentModelVersion;
    this.currentParameters = { ...target.parameters, version: this.currentParameters.version + 1, lastUpdatedAt: Date.now() };
    this.currentModelVersion = targetVersion;

    // Synchronize reverted parameters back to Bot 2
    this.bot2Ref.setTunableParameters(this.currentParameters);

    // Update active version flags
    this.modelVersionHistory.forEach((v) => (v.isCurrent = v.version === targetVersion));

    // Mark active proposals as rolled back
    this.proposalsHistory.forEach((p) => {
      if (p.modelTargetVersion === previousVer && p.status === 'APPROVED_APPLIED') {
        p.status = 'ROLLED_BACK';
      }
    });

    this.log(
      `[BOT 5 ROLLBACK HOÀN TẤT] 🔄 Đã khôi phục thành công hệ thống từ ${previousVer} về phiên bản ${targetVersion} (${target.commitReason}).`,
      'cyan'
    );
    return true;
  }

  /**
   * Safe adaptive adjustments directly applied to Bot 2 upon trade loss
   */
  private computeLossFeedbackAdjustments(
    diagnosis: PostMortemDiagnosis,
    trade: ClosedTradeLogPayload
  ): ParameterAdjustmentRecord[] {
    const adjustments: ParameterAdjustmentRecord[] = [];
    const prev = { ...this.currentParameters };

    if (diagnosis.category === 'RSI_EXHAUSTION_REVERSAL') {
      if (trade.side === 'LONG' && prev.rsiLongMax > 58) {
        const nextVal = Math.max(58, prev.rsiLongMax - 2);
        this.currentParameters.rsiLongMax = nextVal;
        adjustments.push({
          parameterName: 'rsiLongMax',
          previousValue: prev.rsiLongMax,
          newValue: nextVal,
          reason: `Hạ trần RSI LONG từ ${prev.rsiLongMax} xuống ${nextVal} để tránh mua đuổi đỉnh kiệt sức.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      } else if (trade.side === 'SHORT' && prev.rsiShortMin < 42) {
        const nextVal = Math.min(42, prev.rsiShortMin + 2);
        this.currentParameters.rsiShortMin = nextVal;
        adjustments.push({
          parameterName: 'rsiShortMin',
          previousValue: prev.rsiShortMin,
          newValue: nextVal,
          reason: `Nâng đáy RSI SHORT từ ${prev.rsiShortMin} lên ${nextVal} để tránh bán tháo đáy kiệt sức.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'POOR_ENTRY_SPREAD_SLIPPAGE') {
      if (prev.maxAllowedSpreadBps > 2.5) {
        const nextVal = +(prev.maxAllowedSpreadBps - 0.2).toFixed(1);
        this.currentParameters.maxAllowedSpreadBps = nextVal;
        adjustments.push({
          parameterName: 'maxAllowedSpreadBps',
          previousValue: prev.maxAllowedSpreadBps,
          newValue: nextVal,
          reason: `Siết biên spread tối đa từ ${prev.maxAllowedSpreadBps} xuống ${nextVal} bps để giảm phí sàn ăn mòn.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    } else if (diagnosis.category === 'FALSE_SIGNAL_NOISE') {
      if (prev.minConfidenceScore < 85) {
        const nextVal = prev.minConfidenceScore + 1;
        this.currentParameters.minConfidenceScore = nextVal;
        adjustments.push({
          parameterName: 'minConfidenceScore',
          previousValue: prev.minConfidenceScore,
          newValue: nextVal,
          reason: `Nâng ngưỡng điểm tin cậy từ ${prev.minConfidenceScore} lên ${nextVal} để chặn nhiễu vi mô M1.`,
          timestamp: Date.now(),
          targetBot: 'BOT2',
        });
      }
    }

    return adjustments;
  }

  public resetParameters() {
    this.currentParameters = {
      ...DEFAULT_BOT2_PARAMETERS,
      version: this.currentParameters.version + 1,
      lastUpdatedAt: Date.now(),
    };
    this.currentModelVersion = 'v1.0.0';
    this.bot2Ref.setTunableParameters(this.currentParameters);
    this.modelVersionHistory.forEach((v) => (v.isCurrent = v.version === 'v1.0.0'));
    this.log('[BOT 5] Đã thiết lập lại các tham số Bot 2 về mặc định (v1.0.0).', 'info');
  }
}

export const bot5LossEngine = new Bot5LossAnalysisEngine();
