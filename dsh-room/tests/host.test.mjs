import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalRequest } from '../lib/index.js';
import { WorkStatus, reduceEvent, taskFromTodos, TERMINAL_MS } from '../lib/work-status.js';
import { cleanRequest, systemPrompt, createChat, friendlyError } from '../lib/chat.js';
import { RoomLink, roomTools, PAGE_TTL_MS } from '../lib/agent-tools.js';

test('本机来源校验：非本机 Host、跨站 Origin 一律拒绝', () => {
  const ok = (headers) => isLocalRequest({ headers });
  assert.equal(ok({ host: '127.0.0.1:3000' }), true, '桌面版转发：没有 Origin');
  assert.equal(ok({ host: 'localhost:3000', origin: 'http://localhost:3000' }), true);
  assert.equal(ok({ host: '[::1]:3000' }), true);
  assert.equal(ok({ host: 'evil.example:3000' }), false, 'DNS 重绑定：Host 是攻击者的域名');
  assert.equal(ok({ host: '127.0.0.1:3000', origin: 'https://evil.example' }), false);
  assert.equal(ok({ host: '127.0.0.1:3000', origin: 'null' }), false);
  assert.equal(ok({ host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(ok({}), false);
});

test('工作状态：事件压缩成六档，回合被打断时回空闲', () => {
  assert.equal(reduceEvent({ type: 'turn/start' }), 'thinking');
  assert.equal(reduceEvent({ type: 'tool/call', data: { name: 'bash' } }), 'working');
  assert.equal(reduceEvent({ type: 'tool/call', data: { name: 'ask_user_question' } }), 'waiting');
  assert.equal(reduceEvent({ type: 'tool/result' }), 'result');
  assert.equal(reduceEvent({ type: 'approval/asked' }), 'waiting');
  assert.equal(reduceEvent({ type: 'turn/end', data: { reason: { kind: 'completed' } } }), 'success');
  assert.equal(reduceEvent({ type: 'turn/end', data: { reason: { kind: 'timeout' } } }), 'error');
  assert.equal(reduceEvent({ type: 'turn/end', data: { reason: { kind: 'aborted' } } }), null);
  assert.equal(reduceEvent({ type: 'user/message' }), undefined);
});

test('工作状态：按会话聚合，等待优先于干活，完成后自动回空闲', () => {
  let now = 1000;
  const w = new WorkStatus(() => now);
  assert.equal(w.display().state, null);
  w.observe('a', { type: 'turn/start' });
  w.observe('a', { type: 'tool/call', data: { name: 'bash' } });
  w.observe('a', { type: 'todo/write', data: { todos: [{ status: 'completed', content: '一' }, { status: 'in_progress', content: '写测试' }] } });
  assert.deepEqual([w.display().state, w.display().task, w.display().sessionId], ['working', '写测试', 'a']);
  w.observe('b', { type: 'approval/asked' });
  assert.equal(w.display().sessionId, 'b');
  assert.equal(Object.keys(w.snapshot().sessions).length, 2);
  w.observe('b', { type: 'turn/end', data: { reason: { kind: 'aborted' } } });
  assert.equal(w.display().sessionId, 'a');
  w.observe('a', { type: 'turn/end', data: { reason: { kind: 'completed' } } });
  assert.equal(w.display().state, 'success');
  assert.equal(w.display().task, '写测试', '回合结束时保留任务文案');
  now += TERMINAL_MS + 1;
  assert.equal(w.display().state, null);
  w.observe('a', { type: 'turn/start' });
  assert.equal(w.display().task, null, '新一轮清掉上一轮的任务');
  assert.ok(w.events >= 6);
});

test('工作状态：todo 文案取最后一个进行中的，超长按码点截断', () => {
  assert.equal(taskFromTodos({ data: { todos: [{ status: 'pending', content: '下一步' }] } }), '下一步');
  assert.equal(taskFromTodos({ data: { todos: [{ status: 'completed', content: 'x' }] } }), null);
  const long = taskFromTodos({ data: { todos: [{ status: 'in_progress', content: '🐋'.repeat(50) }] } });
  assert.equal(Array.from(long).length, 41);
});

test('聊天：页面传来的内容按上限截断，只取已知字段', () => {
  assert.equal(cleanRequest({ text: '   ' }), null);
  const q = cleanRequest({ text: 'x'.repeat(999), history: Array.from({ length: 40 }, () => ({ role: 'system', text: 'hi' })), character: { persona: 'p'.repeat(9999), evil: 1 }, room: { furniture: Array(99).fill('床') } });
  assert.equal(q.text.length, 300);
  assert.equal(q.history.length, 12);
  assert.ok(q.history.every((m) => m.role === 'assistant'), '不接受页面伪造 system 角色');
  assert.equal(q.persona.length, 4000);
  assert.equal(q.room.furniture.length, 40);
  const sys = systemPrompt(cleanRequest({ text: 'hi', agent: { name: '大肥鱼' }, room: { scene: '卧室', floor: '2F', furniture: ['大床'], rooms: ['2F 卧室', '1F 客厅'], agents: [{ name: '大肥鱼', doing: '看书' }, { name: '泡泡', doing: '发呆' }] } }));
  assert.match(sys, /你是「大肥鱼」/);
  assert.match(sys, /2F 卧室/);
  assert.match(sys, /泡泡（发呆）/);
  assert.match(sys, /\[\[room:房间名\]\]/);
});

function fakeCtx(chunks, extra) {
  const calls = [];
  const llm = Object.assign({ stream(o) { calls.push(o); return (async function* () { yield* chunks; })(); } }, extra);
  return { calls, ctx: { get: (n) => (n === 'llm' ? llm : n === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : undefined) } };
}

test('聊天：拼好消息调用当前模型，只收正文', async () => {
  const { ctx, calls } = fakeCtx([{ type: 'reasoning-delta', text: '嗯', index: 0 }, { type: 'text-delta', text: '好呀~', index: 1 }, { type: 'text-delta', text: ' [[sleep]]', index: 1 }, { type: 'finish', reason: { kind: 'completed' } }]);
  const chat = createChat(ctx);
  assert.deepEqual(chat.status(), { available: true, model: 'p/m' });
  const r = await chat.say({ text: '去睡觉吧', history: [{ role: 'user', text: '在吗' }, { role: 'assistant', text: '在呢' }] });
  assert.deepEqual(r, { ok: true, text: '好呀~ [[sleep]]', model: 'p/m' });
  const o = calls[0];
  assert.equal(o.sessionId, 'dsh-room');
  assert.deepEqual(o.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(o.messages.every((m) => m.id && Array.isArray(m.content)));
  assert.equal('reasoningEffort' in o, false, '模型没声明支持时不传');
});

test('聊天：服务商报错翻成能照着做的话', () => {
  assert.match(friendlyError('Insufficient Balance (request_id: x)'), /余额不足/);
  assert.match(friendlyError('HTTP 401 Unauthorized'), /API key/);
  assert.match(friendlyError('429 Too Many Requests'), /限流/);
  assert.equal(friendlyError('别的错'), '别的错');
});

test('聊天：模型声明支持时关深度思考；空回复说明原因；没有模型时不调用', async () => {
  const a = fakeCtx([{ type: 'finish', reason: { kind: 'error', failure: { message: 'Insufficient Balance' } } }], { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'off' }] } }) });
  assert.deepEqual(await createChat(a.ctx).say({ text: 'hi' }), { ok: false, error: '模型账户余额不足：去服务商充值，或在 DSH 里换一个模型' });
  assert.equal(a.calls[0].reasoningEffort, 'off');
  const none = createChat({ get: () => undefined });
  assert.equal(none.status().available, false);
  assert.equal((await none.say({ text: 'hi' })).ok, false);
});

test('聊天：每分钟次数有上限，同时只跑一个', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const llm = { async *stream() { await gate; yield { type: 'text-delta', text: 'ok', index: 0 }; } };
  const chat = createChat({ get: (n) => (n === 'llm' ? llm : { currentSelection: () => ({ provider: 'p', model: 'm' }) }) });
  const first = chat.say({ text: 'a' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await chat.say({ text: 'b' })).error, '上一句还没说完');
  release();
  assert.equal((await first).ok, true);
  for (let i = 0; i < 19; i++) assert.equal((await chat.say({ text: 'c' })).ok, true);
  assert.match((await chat.say({ text: 'd' })).error, /太快/);
});

test('Agent 工具：房间没打开时如实返回，打开后命令进队列由页面领走', async () => {
  let now = 0;
  const link = new RoomLink(() => now);
  const [look, say, act] = roomTools(link);
  assert.deepEqual([look.name, say.name, act.name], ['room_look', 'room_say', 'room_do']);
  assert.match(await say.execute({ text: '嗨' }), /没有打开/);
  assert.deepEqual(link.queue, []);
  link.poll({ scene: '卧室', floor: '2F', agents: [{ name: '大肥鱼', doing: '看书' }], furniture: ['大床'], rooms: ['2F 卧室'] });
  assert.match(await look.execute({}), /2F 卧室[\s\S]*大肥鱼（看书）/);
  await say.execute({ text: '嗨' });
  await act.execute({ action: 'room', target: '客厅' });
  assert.match(await act.execute({ action: 'goto' }), /需要 target/);
  assert.match(await act.execute({ action: 'rm -rf' }), /不认识/);
  assert.deepEqual(link.poll(), [{ op: 'agent.say', text: '嗨' }, { op: 'room.act', act: 'room:客厅' }]);
  assert.deepEqual(link.poll(), []);
  now += PAGE_TTL_MS + 1;
  assert.match(await look.execute({}), /没有打开/);
  for (const t of [look, say, act]) { assert.equal(typeof t.output.render, 'function'); assert.equal(t.parameters.type, 'object'); }
});

test('group chat adds the group rule only when asked', () => {
  assert.equal(cleanRequest({ text: 'hi' }).group, false);
  assert.match(systemPrompt(cleanRequest({ text: 'hi', group: 1 })), /群聊/);
  assert.doesNotMatch(systemPrompt(cleanRequest({ text: 'hi' })), /群聊/);
});
