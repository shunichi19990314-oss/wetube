/**
 * In-process TTL + LRU cache. Small on purpose: Railway gives each replica its
 * own memory, and every cached value is re-fetchable from YouTube.
 */
export class TtlCache {
  constructor({ max = 4000, ttlSeconds = 300 } = {}) {
    this.max = max;
    this.defaultTtl = ttlSeconds * 1000;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    const ttl = ttlSeconds === undefined ? this.defaultTtl : ttlSeconds * 1000;
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: ttl ? Date.now() + ttl : 0 });
    return value;
  }

  async wrap(key, ttlSeconds, producer) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await producer();
    if (value !== undefined && value !== null) this.set(key, value, ttlSeconds);
    return value;
  }

  /** Serve stale data while refreshing in the background (stale-while-revalidate). */
  async wrapSwr(key, ttlSeconds, producer, { staleSeconds = 3600 } = {}) {
    const entry = this.map.get(key);
    const now = Date.now();
    if (entry && entry.expires > now) return entry.value;
    if (entry && entry.expires + staleSeconds * 1000 > now) {
      // stale but usable
      if (!entry.refreshing) {
        entry.refreshing = true;
        producer()
          .then((v) => {
            if (v !== undefined && v !== null) this.set(key, v, ttlSeconds);
          })
          .catch(() => {})
          .finally(() => {
            entry.refreshing = false;
          });
      }
      return entry.value;
    }
    const value = await producer();
    if (value !== undefined && value !== null) this.set(key, value, ttlSeconds);
    return value;
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

/** Single-flight: collapse concurrent identical requests into one upstream call. */
export class SingleFlight {
  constructor() {
    this.inflight = new Map();
  }

  async run(key, fn) {
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => fn())().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
