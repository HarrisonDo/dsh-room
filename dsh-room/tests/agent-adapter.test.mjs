import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentAdapter } from '../web/roomkit/agent-adapter.js';
import { createLocalAgent } from '../scripts/local-agent.mjs';
import { startPreview } from '../scripts/preview.mjs';
import { createChat } from '../lib/chat.js';

const observation = { objects: [{ id: 'beacon-west', points: [{ x: 0.5, y: 1.5 }] }] };
const context = { name: '阿芽', persona: '本机测试人设' };
const request = { kind: 'decide', data: observation, context };
const action = '{"op":"interact","args":{"objectId":"beacon-west"}}';

test('主人侧适配器校验模型动作，取消后丢弃迟到结果', async () => {
  let finish, seen;
  const transport = {
    describeCapabilities: () => ({ available: true, name: 'test model' }),
    generate: (payload, signal) => { seen = { payload, signal }; return new Promise((resolve) => { finish = resolve; }); },
  };
  const adapter = new AgentAdapter(transport);
  const pending = adapter.decide(observation, context);
  await assert.rejects(adapter.decide(observation, context), /上一条/);
  assert.equal(seen.payload.context.persona, context.persona);
  adapter.cancel();
  assert.equal(seen.signal.aborted, true);
  finish(action);
  await assert.rejects(pending, { name: 'AbortError' });
  const next = adapter.decide(observation, context);
  finish(action);
  assert.deepEqual(await next, { op: 'interact', args: { objectId: 'beacon-west' } });
  assert.equal(adapter.describeCapabilities().used, 2);
});

test('独立预览的模型网关要求同源和票据，调用固定模型地址', async (t) => {
  let seen;
  const agent = createLocalAgent({
    env: { ROOMKIT_MODEL_URL: 'http://127.0.0.1:9000/v1/chat/completions', ROOMKIT_MODEL: 'local-test', ROOMKIT_MODEL_KEY: 'fake-provider-key' },
    fetchImpl: async (url, options) => {
      seen = { url: url.href, ...options, body: JSON.parse(options.body) };
      return Response.json({ choices: [{ message: { content: action } }] });
    },
  });
  const server = await startPreview({ port: 0, agent });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const url = origin + '/__roomkit_agent';
  const setup = await (await fetch(url)).json();
  assert.equal(setup.available, true);
  assert.doesNotMatch(JSON.stringify(setup), /fake-provider-key/);
  const send = (site, ticket) => fetch(url, {
    method: 'POST', headers: { origin: site, 'content-type': 'application/json', 'x-roomkit-agent': ticket }, body: JSON.stringify(request),
  });
  assert.equal((await send('http://localhost:1234', setup.ticket)).status, 403);
  assert.equal((await send(origin, 'missing')).status, 403);
  assert.deepEqual(await (await send(origin, setup.ticket)).json(), { text: action });
  assert.equal(seen.url, 'http://127.0.0.1:9000/v1/chat/completions');
  assert.equal(seen.headers.authorization, 'Bearer fake-provider-key');
  assert.equal(seen.body.model, 'local-test');
  assert.match(seen.body.messages[0].content, /本机测试人设/);
  assert.equal(JSON.parse(seen.body.messages[1].content).objects[0].id, 'beacon-west');
});

test('DSH 模型通道保留结构化观察和中性角色提示', async () => {
  let sent;
  const llm = { async *stream(options) { sent = options; yield { type: 'text-delta', text: action }; } };
  const ctx = { get: (name) => name === 'llm' ? llm : { currentSelection: () => ({ provider: 'test', model: 'role' }) } };
  const reply = await createChat(ctx).say({ worldAgent: request }, new AbortController().signal);
  assert.equal(reply.text, action);
  assert.match(sent.system, /阿芽/);
  assert.doesNotMatch(sent.system, /鲸鱼娘/);
  assert.deepEqual(JSON.parse(sent.messages[0].content[0].text), observation);
});
