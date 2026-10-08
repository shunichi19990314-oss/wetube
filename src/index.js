/**
 * App entry point: express wiring, image proxy, static assets, page + API
 * routes, rate limiting and graceful shutdown.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { sessionMiddleware } from './session.js';
import { httpRequest } from './http.js';
import { refreshContexts } from './youtube/innertube.js';
import { router as pagesRouter, notFoundHandler, errorHandler } from './routes/pages.js';
import { router as apiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(sessionMiddleware);

/* ---------------- naive rate limiting ---------------- */
const hits = new Map();
app.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = hits.get(key) || { count: 0, reset: now + config.rateLimitWindowMs };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + config.rateLimitWindowMs;
  }
  bucket.count += 1;
  hits.set(key, bucket);
  if (bucket.count > config.rateLimitMax) {
    res.status(429).json({ error: 'リクエストが多すぎます。少し待ってから再試行してください。' });
    return;
  }
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}, 60_000).unref?.();

/* ---------------- security headers ---------------- */
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'autoplay=(self "https://www.youtube.com" "https://www.youtube-nocookie.com"), fullscreen=(self), picture-in-picture=(self)'
  );
  next();
});

/* ---------------- image proxy ---------------- */

const IMG_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.get('/image-proxy', async (req, res) => {
  const raw = String(req.query.url || '');
  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).send('bad url');
    return;
  }
  if (!/^https?:$/.test(target.protocol)) {
    res.status(400).send('bad protocol');
    return;
  }
  const host = target.hostname.toLowerCase();
  const allowed =
    config.allowOpenImageProxy ||
    config.imageProxyAllowHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) {
    res.status(403).send('host not allowed');
    return;
  }

  try {
    const upstream = await httpRequest(target.href, {
      headers: {
        'User-Agent': IMG_UA,
        Referer: 'https://www.youtube.com/',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      timeoutMs: 15000,
      maxBytes: config.imageProxyMaxBytes,
    });
    if (!upstream.ok || !upstream.buffer?.length) {
      res.status(upstream.status || 502).send('upstream error');
      return;
    }
    const type = upstream.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(upstream.buffer);
  } catch (e) {
    res.status(502).send('proxy failed');
  }
});

/* ---------------- static ---------------- */

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '7d',
    immutable: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

/* ---------------- routes ---------------- */

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/api', apiRouter);
app.use(pagesRouter);
app.use(notFoundHandler);
app.use(errorHandler);

/* ---------------- boot ---------------- */

const server = app.listen(config.port, config.host, () => {
  console.log(`${config.brandName} listening on http://${config.host}:${config.port} (${config.env})`);
  console.log(`  hl/gl: ${config.hl}/${config.gl} · stream provider: ${config.streamProvider} · proxy: ${config.proxy ? 'on' : 'off'}`);
});

refreshContexts()
  .then(({ contexts, oauthClient }) => {
    console.log(`  innerTube: WEB ${contexts.web.clientVersion} · TVHTML5 ${contexts.tv.clientVersion}`);
    console.log(`  oauth: ${oauthClient.clientId ? 'ready' : 'unavailable'}`);
  })
  .catch((e) => console.error('context refresh failed:', e.message));

const shutdown = (signal) => {
  console.log(`${signal} received, closing…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason?.message || reason));

export default app;
