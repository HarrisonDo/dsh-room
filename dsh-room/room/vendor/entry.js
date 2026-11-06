/**
 * Coopanion 鲸鱼模型打包入口 —— esbuild 打成 IIFE 经典脚本（file:// 双击可用）。
 * model.json 内联（file:// 下 fetch 被禁），贴图走 Image 加载（file:// 可用），
 * base 由使用方显式传入（createWhaleFigure(base, { model })）。
 *
 * 来源：Pal-AI-Lab/Coopanion · cortico-world-desktop-pet（AGPL-3.0）
 */
import { createPet } from './coopanion/kit/body.js';
import { createWhaleFigure } from './coopanion/whale/figure.js';
import { createSfx } from './coopanion/sound.js';
import model from './coopanion/whale/model.json';

window.CorticoWhale = { createPet, createWhaleFigure, createSfx, model };
