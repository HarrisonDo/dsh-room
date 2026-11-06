/**
 * 真模型打包入口：Coopanion 的鲸鱼娘（kit 身体运行时 + Live2D 式分件模型）+ 全部贴图内嵌，
 * esbuild 打成 web/vendor/whale-rig.js（IIFE，全局 RoomKitRig）。
 *
 * 这个文件和它打出来的产物属于 AGPL-3.0（见 room/vendor/coopanion/LICENSE），RoomKit 引擎本身不依赖它：
 * 页面不加载这个脚本时，角色自动用引擎内置的程序化 Q 版鲸鱼娘。
 * 贴图内嵌成 data URL：这样 file:// 双击、DSH 插件里都能上传给 WebGL（外部图片在 file:// 下会被判跨域）。
 */
import { createPet, createRig } from '../../room/vendor/coopanion/kit/body.js';
import { createWhaleFigure } from '../../room/vendor/coopanion/whale/figure.js';
import model from '../../room/vendor/coopanion/whale/model.json';
import { ASSETS } from './whale-assets.gen.js';

const NAMES = new Map(Object.entries(ASSETS).map(([k, v]) => [v, k]));

window.RoomKitRig = {
  createPet, createRig, createWhaleFigure, model,
  base: 'https://roomkit.invalid/',
  asset: (p) => ASSETS[p] || ASSETS[String(p).replace(/^.*?(tex|feat)\//, '$1/')] || p,
  nameOf: (url) => NAMES.get(url) || url,
};
