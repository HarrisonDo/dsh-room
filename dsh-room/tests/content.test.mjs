/**
 * 内容包 / 角色卡 / 剧情条件 单测（无 DOM）：node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePack, exportPack } from '../web/roomkit/packs.js';
import { normalizeCharacter } from '../web/roomkit/character.js';
import { Stories, normalizeStory } from '../web/roomkit/story.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const samplePack = () => ({
  format: 'roomkit.pack', v: 1, id: 'Alice-Cafe', name: '咖啡店', author: 'alice',
  images: { counter: PNG, bad: 'https://evil.example/x.png' },
  furniture: [
    { id: 'counter', name: '吧台', size: [2, 1], height: 90, art: { kind: 'sprite', src: '@counter', fit: 1.1 }, act: 'play:brew', slots: [{ id: 'work', pose: 'work', at: [1, 1.5], face: [0, -1], need: { fun: 0.3 } }] },
    { id: 'stool', name: '高脚凳', size: [1, 1], height: 60, art: { kind: 'proc', parts: [{ t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.2, h: 50, c: 'main' }, { t: 'script', x: 1 }] }, palette: { main: '#c99', 'bad key': '#fff' }, act: 'javascript:alert(1)' },
    { id: 'remote', name: '外链图', size: [1, 1], art: { kind: 'sprite', src: 'https://evil.example/y.png' } },
    { id: 'note', name: '告示', mount: 'wall', wsize: [1, 60], art: { kind: 'wall', draw: 'image', src: '@counter' }, info: { title: '告示', html: '<img onerror=alert(1)>', lines: [['营业', '9:00']] } },
  ],
  plays: [{ id: 'brew', name: '煮咖啡', steps: [{ do: 'say', text: '咖啡好啦' }, { do: 'eval', code: 'x' }] }],
  scenes: [{ id: 'shop', name: '咖啡馆', room: { w: 6, h: 5 }, objects: [{ id: 'c1', def: 'counter', x: 1, y: 0 }, { id: 'w1', def: 'window', wall: 'right', at: 3 }], agents: [{ id: 'barista', name: '店长', brain: 'evil', x: 2, y: 2, look: { body: 'red', hat: 'maid' } }] }],
  stories: [{ id: 'open', name: '开店', trigger: { on: 'start', scene: 'shop' }, roles: { boss: 'barista' }, nodes: { start: [{ do: 'line', who: 'boss', text: '欢迎光临' }, { do: 'cmd', cmd: { op: 'scene.load', scene: {} } }, { do: 'cmd', cmd: { op: 'agent.say', id: '$boss', text: 'hi' } }] } }],
});

test('内容包：命名空间、图片引用、白名单与外链拦截', () => {
  const v = validatePack(samplePack());
  assert.equal(v.ok, true, v.errors.join(';'));
  const p = v.pack;
  assert.equal(p.id, 'alice-cafe');
  const ids = p.furniture.map((d) => d.id);
  assert.deepEqual(ids, ['alice-cafe/counter', 'alice-cafe/stool', 'alice-cafe/note'], '外链贴图的家具被丢掉');
  const counter = p.furniture[0];
  assert.match(counter.art.src, /^data:image\/png;base64,/);
  assert.equal(counter.act, 'play:alice-cafe/brew', '包内剧场引用跟着改名');
  const stool = p.furniture[1];
  assert.equal(stool.art.parts.length, 1, '未知零件类型被丢掉');
  assert.equal(stool.act, undefined, '非法动作被丢掉');
  assert.deepEqual(Object.keys(stool.palette), ['main']);
  const note = p.furniture[2];
  assert.equal(note.art.draw, 'image');
  assert.equal(note.info.html, undefined, 'html 不允许');
  assert.deepEqual(note.info.lines, [['营业', '9:00']]);
  assert.equal(p.plays[0].id, 'alice-cafe/brew');
  assert.equal(p.plays[0].steps.length, 1, '未知步骤被丢掉');
  const sc = p.scenes[0];
  assert.equal(sc.id, 'alice-cafe/shop');
  assert.equal(sc.objects[0].def, 'alice-cafe/counter', '场景里的包内家具跟着改名');
  assert.equal(sc.objects[1].def, 'window', '引用默认包的家具保持原样');
  assert.equal(sc.agents[0].brain, 'auto');
  assert.equal(sc.agents[0].look.body, undefined, '非 #色值 被丢掉');
  const st = p.stories[0];
  assert.equal(st.id, 'alice-cafe/open');
  assert.equal(st.trigger.scene, 'alice-cafe/shop', '限定的包内场景跟着改名，剧情才能触发');
  assert.equal(st.nodes.start.length, 2, '不在白名单的 cmd（scene.load）被丢掉');
  assert.ok(v.warnings.length >= 2);
});

test('内容包：拒绝明显不合格的输入', () => {
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack({ format: 'roomkit.scene', id: 'x' }).ok, false);
  assert.equal(validatePack({ format: 'roomkit.pack', id: '../etc' }).ok, false);
  assert.equal(validatePack({ format: 'roomkit.pack', id: 'empty', furniture: [] }).ok, false, '空包');
  const big = 'data:image/png;base64,' + 'A'.repeat(3.6e6);
  assert.equal(validatePack({ format: 'roomkit.pack', id: 'big', images: { a: big }, furniture: [{ id: 'x', art: { kind: 'sprite', src: '@a' } }] }).ok, false, '图片超限');
});

test('内容包：导出 → 再导入，id 不会重复加前缀', () => {
  const v1 = validatePack(samplePack());
  const out = exportPack(v1.pack);
  assert.equal(out.furniture[0].id, 'counter');
  assert.match(out.furniture[0].art.src, /^@img\d+$/);
  assert.ok(out.images[out.furniture[0].art.src.slice(1)]);
  const v2 = validatePack(out);
  assert.equal(v2.ok, true, v2.errors.join(';'));
  assert.deepEqual(v2.pack.furniture.map((d) => d.id), v1.pack.furniture.map((d) => d.id));
  assert.equal(v2.pack.scenes[0].objects[0].def, 'alice-cafe/counter');
  assert.equal(v2.pack.stories[0].trigger.scene, 'alice-cafe/shop');
  assert.equal(v2.pack.furniture[0].act, 'play:alice-cafe/brew');
});

test('角色卡：SillyTavern v2 → 台词与人设', () => {
  const c = normalizeCharacter({
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
      name: '鲸鱼娘', description: '{{char}}是一只住在海边的鲸鱼娘。', personality: '温柔、嘴馋',
      first_mes: '*探出头* 你好呀，{{user}}！今天想吃什么？', alternate_greetings: ['欢迎回来！'],
      mes_example: '<START>\n{{user}}: 在干嘛\n{{char}}: 在数海浪！一、二、三……\n{{char}}: 要一起吗？', tags: ['whale'],
    },
  });
  assert.equal(c.format, 'roomkit.character');
  assert.equal(c.name, '鲸鱼娘');
  assert.ok(c.persona.includes('鲸鱼娘是一只住在海边的鲸鱼娘'));
  assert.deepEqual(c.phrases.greet, ['你好呀，你！', '欢迎回来！']);
  assert.deepEqual(c.phrases.idle, ['在数海浪！', '要一起吗？']);
  assert.throws(() => normalizeCharacter({ hello: 1 }));
});

test('剧情：条件、只演一次、角色缺席时不演', () => {
  const prefs = {};
  const agents = new Map([['whale', { id: 'whale', name: '大肥鱼' }]]);
  const app = {
    world: { scene: { id: 'home', stories: [] } },
    storage: { pref: (k, v) => { if (v === undefined) return prefs[k]; prefs[k] = v; return v; } },
    isNight: () => true, hour: () => 23, mode: 'play',
    director: { resolveWho: (who) => agents.get(who) || null },
    agents,
  };
  const S = new Stories(app);
  assert.equal(S.test('night'), true);
  assert.equal(S.test('hour:22-2'), true);
  assert.equal(S.test('hour:9-12'), false);
  assert.equal(S.test('flag:x'), false);
  S.setFlag('x', 3);
  assert.equal(S.test({ flag: 'x', gte: 3 }), true);
  assert.equal(S.test(['night', '!flag:y']), true);
  const s = normalizeStory({ id: 'a', once: true, trigger: { on: 'start' }, roles: { fish: 'whale' }, nodes: { start: [] } });
  assert.equal(S.ready(s), true);
  S.setFlag('done:a', true);
  assert.equal(S.ready(s), false, '只演一次');
  const s2 = normalizeStory({ id: 'b', trigger: { on: 'start' }, roles: { pao: 'paopao' }, nodes: { start: [] } });
  assert.equal(S.ready(s2), false, '角色不在场');
  const s3 = normalizeStory({ id: 'c', trigger: { on: 'start', scene: 'other' }, nodes: { start: [] } });
  assert.equal(S.ready(s3), false, '限定了别的场景');
  app.world.scene.template = 'other';
  assert.equal(S.ready(s3), true, '从模板新建的场景也算');
});
