/**
 * MEO AI HYBRID AGENT V1 — MASTER AGENT TYPE DEFINITIONS
 * Standardized APIs, Lifecycle States, Shared State Bus, Event Communication,
 * Heartbeat, Watchdog, Recovery, and Inviolable Safety Configurations.
 */

import { CompletePipelineSnapshot } from './pipeline';
import { Position, ClosedTrade, TickerData, LogMessage } from './engine';

export type MasterLifecyclePhase =
  | 'INITIALIZING'
  | 'IDLE'
  | 'SCANNING'       // Bot 1
  | 'ANALYZING'      // Bot 2
  | 'SIGNALING'      // Bot 3
  | 'VALIDATING_RISK'// Independent Risk Manager
  | 'EXECUTING'      // Bot 4
  | 'LEARNING'       // Bot 5
  | 'RECOVERING'     // Auto-recovery
  | 'EMERGENCY_HALT';// Safety kill-switch

export type BotIdentifier = 'BOT1_SCANNER' | 'BOT2_ANALYST' | 'BOT3_SIGNAL' | 'BOT4_EXECUTION' | 'BOT5_LEARNING';

export type BotHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'STALLED' | 'RECOVERING';

export interface BotRegistration {
  id: BotIdentifier;
  name: string;
  version: string;
  status: BotHealthStatus;
  lastHeartbeat: number;
  lastSuccessfulExecution: number;
  errorCount: number;
  lastErrorMessage?: string;
  capabilities: string[];
}

/**
 * FIXED CONFIGURATION (Directive Section A)
 * Immutable Safety Configuration Enforced by Master Agent.
 * AI or API is strictly prohibited from modifying these bounds.
 */
export interface CentralSafetyConfig {
  exchange: 'Bitget USDT-M Futures';
  paperCapitalUsdt: number;        // Fixed: 100 USDT
  defaultMarginPerOrder: number;   // Fixed: 2.0 USDT
  maxConcurrentPositions: number;  // Fixed: 3 positions
  maxTotalMarginUsdt: number;      // Fixed: 6.0 USDT
  suggestedDailyLossLimitUsdt: number; // Fixed: 2.0 USDT
  suggestedMaxDrawdownUsdt: number;    // Fixed: 5.0 USDT
  paperTradingEnabled: boolean;    // Fixed: true
  liveApiPreparation: boolean;     // Fixed: true
  liveTradingEnabled: boolean;     // Fixed: false (ABSOLUTELY LOCKED)
  aiSelfResearchEnabled: boolean;  // Fixed: true
  paperChallengerDeployment: boolean; // Fixed: true
}

export const IMMUTABLE_SAFETY_CONFIG: Readonly<CentralSafetyConfig> = Object.freeze({
  exchange: 'Bitget USDT-M Futures',
  paperCapitalUsdt: 100.0,
  defaultMarginPerOrder: 2.0,
  maxConcurrentPositions: 10,
  maxTotalMarginUsdt: 50.0,
  suggestedDailyLossLimitUsdt: 10.0,
  suggestedMaxDrawdownUsdt: 20.0,
  paperTradingEnabled: true,
  liveApiPreparation: true,
  liveTradingEnabled: false, // Locked at backend compile time
  aiSelfResearchEnabled: true,
  paperChallengerDeployment: true,
});

export type MasterEventType =
  | 'MASTER_INITIALIZED'
  | 'CYCLE_STARTED'
  | 'MARKET_SCANNED'          // Bot 1 finished
  | 'ANALYSIS_COMPLETED'       // Bot 2 finished
  | 'SIGNAL_GENERATED'         // Bot 3 finished
  | 'RISK_VALIDATION_PASSED'   // Risk Manager approved
  | 'RISK_VALIDATION_REJECTED' // Risk Manager rejected
  | 'ORDER_REQUESTED'
  | 'ORDER_FILLED'             // Bot 4 filled
  | 'ORDER_REJECTED'
  | 'POSITION_UPDATED'
  | 'TRADE_CLOSED'             // Net-TP / SL closed
  | 'LEARNING_CYCLE_COMPLETED' // Bot 5 finished
  | 'HEARTBEAT_PULSE'
  | 'WATCHDOG_ALERT'
  | 'BOT_DEGRADED'
  | 'BOT_RECOVERED'
  | 'EMERGENCY_HALT_TRIGGERED'
  | 'CYCLE_COMPLETED';

export interface MasterEvent<T = any> {
  id: string;
  type: MasterEventType;
  timestamp: number;
  sourceBot?: BotIdentifier | 'MASTER_AGENT' | 'RISK_MANAGER';
  payload: T;
  correlationCycleId: number;
}

export type MasterEventListener = (event: MasterEvent) => void | Promise<void>;

export interface MasterAgentStatus {
  masterStatus: 'RUNNING' | 'PAUSED' | 'HALTED';
  currentPhase: MasterLifecyclePhase;
  cycleCount: number;
  lastCycleDurationMs: number;
  activePositionsCount: number;
  maxPositionsLimit: number;
  totalAllocatedMargin: number;
  maxTotalMarginLimit: number;
  paperBalance: number;
  paperEquity: number;
  dailyRealizedPnL: number;
  currentDrawdown: number;
  safetyConfig: CentralSafetyConfig;
  bots: Record<BotIdentifier, BotRegistration>;
  watchdog: {
    lastPulse: number;
    isHealthy: boolean;
    consecutiveStalls: number;
    stalledBots: BotIdentifier[];
  };
  liveExecutionLock: {
    locked: boolean;
    reason: string;
  };
}
