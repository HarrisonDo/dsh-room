import { mount } from '../web/roomkit/index.js';

const rig = window.RoomKitRig;
const colors = __ROOMKIT_SHOWCASE_LOOKS__.filter(id => id !== 'rose');
const schemes = new Map(rig.model.schemes.map(scheme => [scheme.id, scheme]));
const schemeId = id => id === 'blue' ? 'deepseek' : id;
const colorName = id => id === 'blue' ? '蓝发分件版' : '分件版 · ' + schemes.get(id).label;
const select = document.getElementById('rig-colors');
const requested = new URLSearchParams(location.search).get('color');
const color = colors.includes(requested) ? requested : colors[0];
for (const id of colors) select.add(new Option(colorName(id), id, false, id === color));
select.parentElement.hidden = colors.length < 2;
select.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('color', select.value);
  location.assign(url);
});

function openRoom() {
  const cabin = window.RoomKitPacks.flatMap(pack => pack.scenes).find(scene => scene.id === 'cabin');
  const base = cabin.agents[0];
  const q = { ...base, name: 'Q 版大肥鱼', brain: 'manual', x: 3.15, y: 4.2, look: { ...base.look, rig: false } };
  const agents = [
    q,
    { id: 'showcase-whale', name: '小鲸鱼 · 球球', kind: 'whale', brain: 'manual', x: 2.55, y: 5.2, look: { body: '#7ec8e3', belly: '#f2fbff', size: 1.1 } },
    { id: 'showcase-legacy', name: '旧版走路鲸鱼', kind: 'token', brain: 'manual', x: 3.55, y: 5.1, look: { body: '#7fb8d8', accent: '#8fd28f' } },
  ];
  const addRig = (id, name, x, y, look) => agents.push({
    id: 'showcase-' + id, name, kind: 'girl', brain: 'manual', x, y, look: { hat: 'maid', rig: true, size: 1.12, ...look },
  });
  if (color) addRig(color, colorName(color), 4.2, 4.15, { rigScheme: schemeId(color) });
  if (__ROOMKIT_SHOWCASE_LOOKS__.includes('rose')) addRig('rose', '红发分件版', 5.1, 3.9, { body: '#e5576a' });

  const app = window.room = mount(document.getElementById('room'), {
    scene: { ...cabin, agents, env: { ...cabin.env, period: 'noon' } },
    storageKey: 'roomkit-whale-showcase',
    autosave: false,
    packStore: false,
    coach: false,
    stories: false,
    rigLooks: __ROOMKIT_SHOWCASE_LOOKS__,
  });
  const walk = document.getElementById('legacy-walk');
  walk.disabled = false;
  walk.addEventListener('click', () => {
    const legacy = app.agents.get('showcase-legacy');
    legacy?.walkTo(legacy.x < 4.05 ? 4.55 : 3.55, 4.9);
  });
}

openRoom();
