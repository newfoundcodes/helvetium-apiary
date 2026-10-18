import type { ApiaryEventMap, EventListener } from './types/events.js';

export class ApiaryEvents {
  private readonly listeners = new Map<keyof ApiaryEventMap, Set<EventListener<never>>>();

  on<K extends keyof ApiaryEventMap>(
    event: K,
    listener: EventListener<ApiaryEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(listener as EventListener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof ApiaryEventMap>(
    event: K,
    listener: EventListener<ApiaryEventMap[K]>,
  ): () => void {
    const off = this.on(event, (value) => {
      off();
      listener(value);
    });
    return off;
  }

  off<K extends keyof ApiaryEventMap>(event: K, listener: EventListener<ApiaryEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as EventListener<never>);
  }

  emit<K extends keyof ApiaryEventMap>(event: K, value: ApiaryEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(value as never);
      } catch {}
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
