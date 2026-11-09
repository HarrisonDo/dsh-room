import { randomBytes, timingSafeEqual } from 'node:crypto';
import { worldAgentPrompt } from '../shared/agent-request.js';

const BODY_LIMIT = 96 * 1024;
const REPLY_LIMIT = 256 * 1024;
const WINDOW = 3600_000;
const BUDGET = 12;

function modelConfig(env) {
  if (!env.ROOMKIT_MODEL_URL || !env.ROOMKIT_MODEL) return null;
  const url = URL.parse(env.ROOMKIT_MODEL_URL);
  if (!url || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('/chat/completions')) return null;
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  return { url, model: env.ROOMKIT_MODEL.trim().slice(0, 120), key: env.ROOMKIT_MODEL_KEY || '' };
}

async function upstreamJSON(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > REPLY_LIMIT) throw new Error('模型响应过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

export function createLocalAgent({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = modelConfig(env);
  const secret = randomBytes(24).toString('base64url');
  const key = Buffer.from(secret);
  let stamps = [];
  let busy = false;

  return async function handle(req, res) {
    const send = (status, data, close = false) => {
      if (!res.writable || req.socket.destroyed) return;
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', ...(close ? { connection: 'close' } : {}) });
      res.end(JSON.stringify(data));
    };
    const host = req.headers.host;
    const port = req.socket.localPort;
    const origin = 'http://' + host;
    if (![('127.0.0.1:' + port), ('localhost:' + port)].includes(host) || (req.headers.origin && req.headers.origin !== origin)
      || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
      return send(403, { error: '本机模型入口只接受同源请求' }, true);
    }
    if (req.method === 'GET') return send(200, { available: Boolean(config?.model), model: config?.model || null, ticket: config?.model ? secret : null });
    if (req.method !== 'POST') return send(405, { error: '请求方法不支持' }, true);
    const supplied = Buffer.from(req.headers['x-roomkit-agent'] || '');
    if (req.headers.origin !== origin || supplied.length !== key.length || !timingSafeEqual(supplied, key)) return send(403, { error: '模型请求身份无效' }, true);
    if (!config?.model) return send(503, { error: '本机尚未配置模型' }, true);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: '需要 JSON 请求' }, true);
    if (Number(req.headers['content-length']) > BODY_LIMIT) return send(413, { error: '模型请求太大' }, true);
    if (busy) return send(429, { error: '模型正在处理上一条请求' }, true);
    stamps = stamps.filter((stamp) => stamp > Date.now() - WINDOW);
    if (stamps.length >= BUDGET) return send(429, { error: '本小时模型额度已用完' }, true);

    busy = true;
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > BODY_LIMIT) return send(413, { error: '模型请求太大' }, true);
        chunks.push(chunk);
      }
      let prompt;
      try { prompt = worldAgentPrompt(JSON.parse(Buffer.concat(chunks, size).toString('utf8'))); }
      catch { return send(400, { error: '模型请求格式不合法' }); }
      if (controller.signal.aborted) return;
      stamps.push(Date.now());
      const reply = await fetchImpl(config.url, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', ...(config.key ? { authorization: 'Bearer ' + config.key } : {}) },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
        body: JSON.stringify({ model: config.model, stream: false, max_tokens: 768,
          messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
      });
      if (!reply.ok) {
        await reply.body?.cancel();
        const error = [401, 403].includes(reply.status) ? '模型凭据无效或过期' : reply.status === 429 ? '模型服务限流，请稍后重试' : '模型服务返回错误';
        return send(502, { error });
      }
      const data = await upstreamJSON(reply);
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) return send(502, { error: '模型没有返回正文' });
      return send(200, { text: text.slice(0, 4000) });
    } catch {
      if (!controller.signal.aborted) return send(502, { error: '模型暂时无法连接或响应超时' });
    } finally { busy = false; }
  };
}
