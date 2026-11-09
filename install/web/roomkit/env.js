/**
 * RoomKit · 环境：时段（按小时插值）、天气、光照参数。
 * 输出给渲染器：sky（窗外天色）、tint（环境色罩）、dark（夜色浓度，灯光在里面挖光斑）、sun（窗光）。
 */
import { lerp, mix, clamp, smooth } from './util.js';

export const PERIODS = [
  { id: 'dawn',  label: '清晨', hour: 6.5,  sky: ['#9fb8e0', '#f6dcc2'], tint: '#d7def2', tintK: 0.18, dark: 0.10, sun: 0.35 },
  { id: 'noon',  label: '中午', hour: 12,   sky: ['#78b8ee', '#dff1ff'], tint: '#ffffff', tintK: 0.00, dark: 0.00, sun: 0.30 },
  { id: 'dusk',  label: '傍晚', hour: 17.8, sky: ['#8c9fd6', '#ffc193'], tint: '#ffd2a8', tintK: 0.22, dark: 0.10, sun: 0.55 },
  { id: 'night', label: '夜晚', hour: 22,   sky: ['#101a36', '#2b3a68'], tint: '#46558c', tintK: 0.30, dark: 0.50, sun: 0.00 },
];

/** 关键帧：同一时段出现两次 = 停留（白天、深夜都要"稳"住，过渡只发生在早晚） */
const KEYS = [
  { h: 4.8, p: 'night' }, { h: 6.5, p: 'dawn' }, { h: 9, p: 'noon' },
  { h: 15.5, p: 'noon' }, { h: 17.8, p: 'dusk' }, { h: 19.6, p: 'night' },
];

export const WEATHERS = {
  clear:  { label: '晴', dark: 0,    sky: 0,    tint: null },
  cloudy: { label: '阴', dark: 0.05, sky: 0.35, tint: '#c9ced8' },
  rain:   { label: '雨', dark: 0.10, sky: 0.45, tint: '#b8c3d6' },
  snow:   { label: '雪', dark: 0.04, sky: 0.30, tint: '#e3ecf7' },
};

const byId = (id) => PERIODS.find((p) => p.id === id) || PERIODS[1];

export function envAt(hour, weatherId) {
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[KEYS.length - 1], b = KEYS[0], t = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const p = KEYS[i], q = KEYS[(i + 1) % KEYS.length];
    const h0 = p.h, h1 = q.h > h0 ? q.h : q.h + 24;
    const hh = h < h0 ? h + 24 : h;
    if (hh >= h0 && hh < h1) { a = p; b = q; t = (hh - h0) / (h1 - h0); break; }
  }
  const A = byId(a.p), B = byId(b.p), k = smooth(clamp(t, 0, 1));
  const w = WEATHERS[weatherId] || WEATHERS.clear;
  const grey = '#9aa6b8';
  const base = k < 0.5 ? A : B;
  const env = {
    id: base.id,
    label: base.label,
    hour: h,
    sky: [mix(mix(A.sky[0], B.sky[0], k), grey, w.sky), mix(mix(A.sky[1], B.sky[1], k), grey, w.sky * 0.8)],
    tint: mix(A.tint, B.tint, k),
    tintK: lerp(A.tintK, B.tintK, k),
    dark: clamp(lerp(A.dark, B.dark, k) + w.dark, 0, 0.7),
    sun: lerp(A.sun, B.sun, k) * (weatherId === 'clear' || !weatherId ? 1 : 0.25),
    weather: weatherId in WEATHERS ? weatherId : 'clear',
  };
  env.night = lerp(A.dark, B.dark, k) > 0.3;
  if (w.tint) { env.tint = mix(env.tint, w.tint, 0.5); env.tintK = Math.max(env.tintK, 0.12); }
  return env;
}

export function periodHour(id) { return byId(id).hour; }
export function nowHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
