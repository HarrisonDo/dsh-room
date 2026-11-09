import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import test from 'node:test';
import { format } from 'node:util';
import { createTown, LIMIT, serve } from '../scripts/town.mjs';
import { hashToken } from '../scripts/town-auth.mjs';
import { openStore } from '../scripts/town-store.mjs';

const HOST = '127.0.0.1';
const POST = 'POST /api/config HTTP/1.1\r\nHost: localhost\r\n';
const PARTIAL_BODY = POST + 'Content-Length: 32\r\n\r\n{';

async function startTown(t, timeouts, options) {
  const store = await openStore();
  const town = createTown(store, options);
  const server = serve(town, 0, HOST);
  Object.assign(server, timeouts);
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    store.close();
  });
  const { port } = server.address();
  const post = (body, name = 'config') => fetch(`http://${HOST}:${port}/api/${name}`, {
    method: 'POST', body, signal: AbortSignal.timeout(3000),
  });
  return { server, town, port, post };
}

async function rawRequest(port, request) {
  const socket = createConnection(port, HOST);
  socket.setTimeout(3000, () => socket.destroy(new Error('HTTP 测试连接超时')));
  socket.setEncoding('utf8');
  let response = '';
  socket.on('data', (chunk) => { response += chunk; });
  const closed = once(socket, 'close');
  socket.write(request);
  await closed;
  return response;
}

test('半截 POST 断开后，小镇继续处理正常请求', { timeout: 5000 }, async (t) => {
  const { server, town, port, post } = await startTown(t);
  const config = t.mock.method(town.api, 'config');
  const socket = createConnection(port, HOST);
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const started = once(server, 'request');
  socket.write(PARTIAL_BODY);
  const [, response] = await started;
  const closed = once(response, 'close');
  socket.destroy();
  await closed;

  const normal = await post('{}');
  assert.equal(normal.status, 200);
  assert.equal((await normal.json()).maxCharacters, LIMIT.characters);
  assert.equal(config.mock.callCount(), 1);
});

test('小镇拒绝非法 JSON、非对象和超限请求体', async (t) => {
  const { port, post } = await startTown(t);
  for (const body of ['{', 'null', '[]', '42', 'false', '"text"']) {
    const response = await post(body);
    assert.equal(response.status, 400, body);
    assert.match((await response.json()).error, /JSON/);
  }
  const empty = await post();
  assert.equal(empty.status, 200);
  await empty.json();

  const size = LIMIT.body + 1;
  assert.match(await rawRequest(port, POST + `Content-Length: ${size}\r\n\r\n`), /^HTTP\/1\.1 413 /);
  const oversizedChunk = `${size.toString(16)}\r\n${'x'.repeat(size)}\r\n`;
  assert.match(await rawRequest(port, POST + 'Transfer-Encoding: chunked\r\n\r\n' + oversizedChunk), /^HTTP\/1\.1 413 /);
});

test('小镇分别限制不完整的请求头和请求体', async (t) => {
  const { port } = await startTown(t, { headersTimeout: 120, requestTimeout: 300, connectionsCheckingInterval: 20 });
  assert.match(await rawRequest(port, POST), /^HTTP\/1\.1 408 /);
  assert.match(await rawRequest(port, PARTIAL_BODY), /^HTTP\/1\.1 408 /);
});

test('响应序列化失败时返回 500，日志不含请求正文', async (t) => {
  const { town, post } = await startTown(t);
  const log = t.mock.method(console, 'error', () => {});
  town.api.badResult = (body) => ({ toJSON() { throw new Error(body.privateText); } });

  const response = await post('{"privateText":"http-test-secret"}', 'badResult');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: '服务器出错了' });
  assert.equal(log.mock.callCount(), 1);
  assert.doesNotMatch(format(...log.mock.calls[0].arguments), /http-test-secret/);
});

async function readUntil(reader, marker) {
  let text = '';
  while (!text.includes(marker)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += Buffer.from(value).toString('utf8');
  }
  assert.ok(text.includes(marker));
  return text;
}

test('SSE 认证、私有内容、连接上限及释放', async (t) => {
  const { town, port } = await startTown(t, {}, {
    streamLimit: { account: 1, bytes: 4096 },
    moderator: { check: async (text) => ({ action: 'review', text, labels: [] }) },
  });
  for (const id of ['alice', 'bobby']) {
    town.store.putMember({ id, name: id, kind: 'girl', account: id });
    town.store.createSession(hashToken(`test-${id}`), id, Date.now() + 30_000);
  }
  const connect = (me, token = `test-${me}`) => fetch(`http://${HOST}:${port}/events?${new URLSearchParams({ me, token })}`, {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal((await connect('alice', 'invalid')).status, 401);
  const a = (await connect('alice')).body.getReader();
  const b = (await connect('bobby')).body.getReader();
  await readUntil(a, 'retry:');
  await readUntil(b, 'retry:');
  assert.equal((await connect('alice')).status, 429);

  for (const me of ['alice', 'bobby']) town.api.join({ me, thread: 'plaza' }, { token: `test-${me}` });
  await town.api.post({ me: 'alice', thread: 'plaza', text: 'private-message' }, { token: 'test-alice' });
  town.pingStreams();
  assert.match(await readUntil(a, 'private-message'), /event: post/);
  assert.doesNotMatch(await readUntil(b, ': ping'), /private-message/);

  const closed = (me) => once([...town.clients].find((client) => client.me === me).res, 'close');
  const closedA = closed('alice');
  town.api.logout({}, { token: 'test-alice' });
  await readUntil(a, 'sessionEnded');
  await closedA;
  assert.deepEqual(town.api.get({ thread: 'plaza' }).thread.here.map(({ id }) => id), ['bobby']);
  const closedB = closed('bobby');
  town.send('probe', { text: 'x'.repeat(8192) });
  await closedB;
  assert.equal(town.clients.size, 0);
  assert.deepEqual(town.api.get({ thread: 'plaza' }).thread.here, []);
});
