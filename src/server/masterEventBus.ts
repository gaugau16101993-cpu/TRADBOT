/**
 * MEO AI HYBRID AGENT V1 — MASTER EVENT BUS
 * Centralized asynchronous, strongly-typed event communication bus between
 * Master Agent Orchestrator and the 5 autonomous bots.
 */

import { MasterEvent, MasterEventType, MasterEventListener, BotIdentifier } from '../types/masterAgent';

export class MasterEventBus {
  private listeners: Map<MasterEventType, Set<MasterEventListener>> = new Map();
  private globalListeners: Set<MasterEventListener> = new Set();
  private recentEvents: MasterEvent[] = [];
  private readonly maxEventHistory: number = 200;
  private eventCounter: number = 0;

  constructor() {
    // Initialize standard event categories
  }

  /**
   * Subscribe to a specific Master Event type
   */
  public on(eventType: MasterEventType, listener: MasterEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events passing through the Master Event Bus
   */
  public onAny(listener: MasterEventListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Emit an event across the system with correlation tracking
   */
  public async emit<T = any>(
    type: MasterEventType,
    payload: T,
    sourceBot?: BotIdentifier | 'MASTER_AGENT' | 'RISK_MANAGER',
    correlationCycleId: number = 0
  ): Promise<MasterEvent<T>> {
    this.eventCounter++;
    const event: MasterEvent<T> = {
      id: `EVT-${Date.now()}-${this.eventCounter}`,
      type,
      timestamp: Date.now(),
      sourceBot: sourceBot || 'MASTER_AGENT',
      payload,
      correlationCycleId,
    };

    // Store in recent history
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxEventHistory) {
      this.recentEvents.shift();
    }

    // Dispatch to specific listeners
    const specific = this.listeners.get(type);
    if (specific) {
      for (const listener of specific) {
        try {
          await listener(event);
        } catch (err) {
          console.error(`[EVENT_BUS] Error executing listener for event ${type}:`, err);
        }
      }
    }

    // Dispatch to global listeners
    for (const globalListener of this.globalListeners) {
      try {
        await globalListener(event);
      } catch (err) {
        console.error(`[EVENT_BUS] Error executing global listener for event ${type}:`, err);
      }
    }

    return event;
  }

  /**
   * Get recent event history for audit and frontend inspection
   */
  public getRecentEvents(limit: number = 50, filterType?: MasterEventType): MasterEvent[] {
    const list = filterType
      ? this.recentEvents.filter((e) => e.type === filterType)
      : this.recentEvents;
    return list.slice(-Math.min(limit, list.length));
  }

  /**
   * Clear event history (useful for tests)
   */
  public clear(): void {
    this.recentEvents = [];
    this.eventCounter = 0;
  }
}

export const masterEventBus = new MasterEventBus();
