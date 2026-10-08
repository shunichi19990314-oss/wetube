/**
 * Dependency-free HTTP layer.
 *
 * Node's global fetch cannot be pointed at an HTTP proxy without undici
 * internals, and a proxy is the single most effective fix for YouTube blocking
 * data-centre IPs (Railway / Render). This module therefore implements the
 * few requests we need with node:http / node:https, including CONNECT
 * tunnelling for http:// and https:// proxies.
 *
 * The returned object mimics the parts of the fetch Response API we use.
 */
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';

export class ProxyConfig {
  constructor(proxyUrl) {
    if (!proxyUrl) return null;
    const u = new URL(proxyUrl);
    this.protocol = u.protocol;
    this.host = u.hostname;
    this.port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    this.authHeader = u.username
      ? `Basic ${Buffer.from(
          `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password || '')}`
        ).toString('base64')}`
      : null;
    this.href = proxyUrl;
  }
}

let defaultProxy = null;
export function setDefaultProxy(proxyUrl) {
  defaultProxy = proxyUrl ? new ProxyConfig(proxyUrl) : null;
  return defaultProxy;
}
export function getDefaultProxy() {
  return defaultProxy;
}

function connectTunnel(proxy, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const transport = proxy.protocol === 'https:' ? https : http;
    const req = transport.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: proxy.authHeader ? { 'Proxy-Authorization': proxy.authHeader } : {},
      timeout: timeoutMs,
    });
    req.once('connect', (res, socket) => {
      if (res.statusCode === 200) {
        socket.setTimeout(0);
        resolve(socket);
      } else {
        socket.destroy();
        reject(new Error(`proxy CONNECT rejected: ${res.statusCode}`));
      }
    });
    req.once('timeout', () => req.destroy(new Error('proxy CONNECT timeout')));
    req.once('error', reject);
    req.end();
  });
}

/**
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string,string>} [options.headers]
 * @param {string|Buffer} [options.body]
 * @param {number} [options.timeoutMs]
 * @param {ProxyConfig|null} [options.proxy]
 * @param {boolean} [options.followRedirects]
 * @param {boolean} [options.raw] resolve with the stream instead of buffering
 */
export async function httpRequest(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20000,
    followRedirects = true,
    raw = false,
  } = options;
  const proxy = options.proxy === undefined ? defaultProxy : options.proxy;

  let currentUrl = new URL(url);
  let redirects = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const isHttps = currentUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const port = Number(currentUrl.port || (isHttps ? 443 : 80));

    let socket = null;
    if (proxy && isHttps) {
      socket = await connectTunnel(proxy, currentUrl.hostname, port, timeoutMs);
    }

    const reqOptions = {
      method,
      headers: { ...headers },
      timeout: timeoutMs,
    };
    if (proxy && !isHttps) {
      // Forward proxy style: absolute URI in the request line.
      reqOptions.host = proxy.host;
      reqOptions.port = proxy.port;
      reqOptions.path = currentUrl.href;
      if (proxy.authHeader) reqOptions.headers['Proxy-Authorization'] = proxy.authHeader;
    } else {
      reqOptions.hostname = currentUrl.hostname;
      reqOptions.port = port;
      reqOptions.path = `${currentUrl.pathname}${currentUrl.search}`;
      reqOptions.servername = isHttps ? currentUrl.hostname : undefined;
      if (socket) reqOptions.createConnection = () => socket;
    }
    if (!reqOptions.headers.Host) reqOptions.headers.Host = currentUrl.host;

    const res = await new Promise((resolve, reject) => {
      const req = transport.request(reqOptions, resolve);
      req.once('timeout', () => req.destroy(new Error(`request timeout: ${method} ${currentUrl.pathname}`)));
      req.once('error', reject);
      if (body) req.write(body);
      req.end();
    });

    const location = res.headers.location;
    if (followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode) && location && redirects < 5) {
      redirects += 1;
      res.resume();
      currentUrl = new URL(location, currentUrl);
      if (res.statusCode === 303) {
        options.method = 'GET';
        // eslint-disable-next-line no-param-reassign
        body = undefined;
      }
      continue;
    }

    if (raw) {
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: res.headers,
        stream: res,
      };
    }

    const chunks = [];
    let size = 0;
    const maxBytes = options.maxBytes || 64 * 1024 * 1024;
    await once(
      res
        .on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            return;
          }
          chunks.push(c);
        })
        .on('error', () => {}),
      'end'
    ).catch(() => {});

    const buffer = Buffer.concat(chunks);
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      headers: res.headers,
      buffer,
      text: () => buffer.toString('utf8'),
      json: () => JSON.parse(buffer.toString('utf8')),
    };
  }
}

/** Convenience JSON POST. */
export async function jsonRequest(url, payload, options = {}) {
  return httpRequest(url, {
    ...options,
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(payload),
  });
}
