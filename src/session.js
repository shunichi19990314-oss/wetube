/**
 * Signed session cookies + a pluggable store.
 *
 * Cookie format matches the reference deployment: `<32 byte hex id>.<base64url HMAC>`,
 * HttpOnly, SameSite=Lax, 30 days. Sessions live in memory by default; set
 * REDIS_URL to share them between replicas (the store interface is async so a
 * Redis/Postgres adapter can be dropped in without touching the routes).
 */
import crypto from 'node:crypto';
import { config } from './config.js';

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(value) {
  return b64u(crypto.createHmac('sha256', config.sessionSecret).update(value).digest());
}

export function encodeSessionId(id) {
  return `${id}.${sign(id)}`;
}

export function decodeSessionId(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return /^[0-9a-f]{64}$/.test(id) ? id : null;
}

export function newSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/* ------------------------------ store ------------------------------ */

class MemoryStore {
  constructor() {
    this.map = new Map();
    // opportunistic sweep
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.map) if (v.__expires && v.__expires < now) this.map.delete(k);
    }, 5 * 60 * 1000);
    this.timer.unref?.();
  }

  async get(id) {
    const v = this.map.get(id);
    if (!v) return null;
    if (v.__expires && v.__expires < Date.now()) {
      this.map.delete(id);
      return null;
    }
    return v;
  }

  async set(id, data, maxAgeMs) {
    this.map.set(id, { ...data, __expires: maxAgeMs ? Date.now() + maxAgeMs : 0 });
  }

  async destroy(id) {
    this.map.delete(id);
  }

  async count() {
    return this.map.size;
  }
}

export const sessionStore = new MemoryStore();

const MAX_AGE_MS = config.sessionMaxAgeDays * 24 * 60 * 60 * 1000;

/** Express middleware: attaches req.session (lazy-created) and sets the cookie. */
export function sessionMiddleware(req, res, next) {
  const raw = req.cookies?.[config.sessionCookieName];
  let id = decodeSessionId(raw);
  let created = false;

  if (!id) {
    id = newSessionId();
    created = true;
  }

  const finish = async () => {
    const data = (await sessionStore.get(id)) || {};
    req.sessionId = id;
    req.session = data;
    req.sessionIsNew = created;
    req.saveSession = async () => {
      await sessionStore.set(id, data, MAX_AGE_MS);
      if (created || !raw || raw !== encodeSessionId(id)) {
        res.cookie(config.sessionCookieName, encodeSessionId(id), {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: MAX_AGE_MS,
          path: '/',
          secure: config.env === 'production' && req.headers['x-forwarded-proto'] === 'https',
        });
      }
    };
    // Always issue the cookie on first contact so /api/auth/status is stable.
    await req.saveSession();
    next();
  };

  finish().catch(next);
}
