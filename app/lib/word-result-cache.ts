type CacheEntry<Value> = {
  value: Value;
  expiresAt: number;
};

export class WordResultCache<Value> {
  private readonly entries = new Map<string, CacheEntry<Value>>();
  private readonly capacity: number;
  private readonly ttlMs: number;

  constructor(capacity: number, ttlMs: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Cache capacity must be a positive integer.");
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("Cache TTL must be positive.");
    }
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  get size() {
    return this.entries.size;
  }

  get(key: string, now: number): Value | undefined {
    this.removeExpired(now);
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, now: number) {
    this.removeExpired(now);
    const replacing = this.entries.has(key);
    this.entries.delete(key);

    if (!replacing && this.entries.size >= this.capacity) {
      const leastRecentlyUsed = this.entries.keys().next().value;
      if (leastRecentlyUsed !== undefined) this.entries.delete(leastRecentlyUsed);
    }

    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  private removeExpired(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
