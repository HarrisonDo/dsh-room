#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
room-furnish.py · 房间素材加工（s2.0）
从 furniture/raw/*.jpg 重新生成家具透明贴图，修掉旧 PNG 的抠图破洞/黑渣/画布偏移：
  1) 边缘泛洪抠图（只清与边界连通的背景，内部同色物面不被误抠）
  2) 中值滤波去渣点 + 紧凑裁边（trim）
  3) plant-wardrobe 一图两物 → 拆成 plant.webp + wardrobe.webp
  4) 壳图水印：用邻近底色补掉（不裁图，保持构图）
  5) 输出 WebP（体积约为 PNG 的 1/10）+ 尺寸表 + contact-sheet 供人工核验
用法：python3 tools/room-furnish.py   （在 room/ 目录下运行）
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent   # room/
RAW = ROOT / "packs" / "default" / "furniture" / "raw"
OUT = ROOT / "packs" / "default" / "furniture"
SHELLS = ROOT / "packs" / "default" / "shells"
SHEET = ROOT / "packs" / "default" / "furniture" / "_sheet.png"

SENTINEL = (255, 0, 255)  # 品红哨兵：素材里不存在，安全

# 每张图可手工覆盖的泛洪阈值（0 = 自动）；screen = Seedream 品红幕布版，走确定性抠图
THRESH = {"desk.jpg": 10, "plant-wardrobe.jpg": 12}
SCREENS = {
    "bed": "bed_screen.jpg",
    "desk": "desk_screen.jpg",
    "lamp": "lamp_screen.jpg",
    "plant-wardrobe": "plant-wardrobe_screen.jpg",
}


def key_magenta(im):
    """品红幕布确定性抠图：色相规则硬抠 + 腐蚀去粉边 + 羽化"""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    m_r = r.point(lambda v: 255 if v > 150 else 0)            # 红够高
    m_g = g.point(lambda v: 255 if v < 120 else 0)            # 绿够低
    m_b = b.point(lambda v: 255 if v > 90 else 0)             # 蓝在中段（区别木头的高 R 低 B）
    m_rg = ImageChops.subtract(r, g).point(lambda v: 255 if v > 90 else 0)   # R-G 大
    is_bg = ImageChops.multiply(ImageChops.multiply(m_r, m_g), ImageChops.multiply(m_b, m_rg))
    alpha = is_bg.point(lambda v: 0 if v == 255 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(3))          # 腐蚀 1px，吃掉粉边
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 255 if v > 110 else 0)
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def key_background(im, thresh, est_size=31):
    """局部背景估计 + 连通泛洪：
    1) est = 中值滤波估计“每个像素处的背景色”（AI 底图的渐晕也能跟住）
    2) 与 est 相近的像素 = 背景候选（ Cream 桌面因为内部 est≈自身也是候选，
       但它与外部背景之间隔着一圈非候选边界，连通泛洪进不去 → 不会被误抠）
    3) 从边界做连通泛洪，只清与边界连通的候选区
    """
    rgb = im.convert("RGB")
    est = rgb.filter(ImageFilter.MedianFilter(est_size))
    diff = ImageChops.difference(rgb, est)
    r, g, b = diff.split()
    maxd = ImageChops.lighter(ImageChops.lighter(r, g), b)
    cand = maxd.point(lambda v: 255 if v < thresh else 0)   # 255=背景候选
    # 连通性：在候选图上从边界泛洪（thresh=0 只走 255 连通块）
    mask = cand.copy()
    w, h = mask.size
    step = max(8, w // 40)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + \
            [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for s in seeds:
        if mask.getpixel(s) == 255:
            ImageDraw.floodfill(mask, s, 128, thresh=0)
    alpha = mask.point(lambda v: 0 if v == 128 else 255)
    # 轻羽化 + 收边，去 JPEG 毛边
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 255 if v > 128 else 0)
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def alpha_bbox(im):
    return im.getchannel("A").getbbox()


def trim(im, pad=2):
    bbox = alpha_bbox(im)
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(im.width, r + pad); b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def split_two(im, name_a, name_b, fixed_cut=None):
    """一图两物拆开：优先用指定切线（按构图量好），否则找中间透明谷/最空列"""
    w, h = im.size
    a_ch = im.getchannel("A")
    ap = a_ch.load()
    if fixed_cut is not None:
        cut = fixed_cut
        how = f"固定切线 x={cut}"
    else:
        colsum = [sum(ap[x, y] for y in range(0, h, 4)) for x in range(w)]
        lo, hi = int(w * 0.25), int(w * 0.75)
        cut = min(range(lo, hi), key=lambda x: colsum[x])
        how = f"最空列 x={cut} (colsum={colsum[cut]})"
    left = trim(im.crop((0, 0, cut, h)))
    right = im.crop((cut, 0, w, h))
    # 右半去绿色残留（保留原有的抠图 alpha，只在绿色处置 0）
    r, g, b = right.convert("RGB").split()
    green = ImageChops.multiply(
        ImageChops.subtract(g, r).point(lambda v: 255 if v > 15 else 0),
        ImageChops.subtract(g, b).point(lambda v: 255 if v > 15 else 0))
    ra = ImageChops.subtract(right.getchannel("A"), green)
    right.putalpha(ra)
    right = trim(right)
    print(f"  拆分 {name_a}/{name_b}: {how}，右半去绿 {green.getextrema()}")
    return left, right


def de_watermark(path):
    """右下角水印：用同图邻近底色填充覆盖"""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    # 水印区：右下角 22% 宽 × 8% 高
    rx, ry = int(w * 0.76), int(h * 0.915)
    sample = im.crop((rx - 260, ry - 40, rx - 20, ry + int(h * 0.06)))
    small = sample.resize((1, 1)).getpixel((0, 0))
    patch = Image.new("RGB", (w - rx, h - ry), small)
    # 轻噪点，贴回去不显平
    noise = Image.effect_noise((w - rx, h - ry), 6).point(lambda v: int(v * 0.10))
    patch = Image.composite(patch, patch, Image.new("L", patch.size, 255))
    px = patch.load()
    np_ = noise.load()
    rnd = random.Random(7)
    for y in range(patch.height):
        for x in range(patch.width):
            r, g, b = px[x, y]
            d = (np_[x, y] - 12) // 2
            px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))
    im.paste(patch, (rx, ry))
    im.save(path, quality=92)
    print(f"  水印已除: {path.name} 填充色={small}")


def sheet(items, out):
    """拼核验图：灰白棋盘底，看清透明区"""
    cell = 340
    cols = 4
    rows = (len(items) + cols - 1) // cols
    W, H = cols * cell, rows * (cell + 26)
    canvas = Image.new("RGB", (W, H), (210, 214, 222))
    d = ImageDraw.Draw(canvas)
    for y in range(0, H, 40):
        for x in range(0, W, 40):
            if (x // 40 + y // 40) % 2 == 0:
                d.rectangle([x, y, x + 39, y + 39], fill=(186, 192, 204))
    for i, (im, label) in enumerate(items):
        cx, cy = (i % cols) * cell, (i // cols) * (cell + 26)
        t = im.copy()
        t.thumbnail((cell - 30, cell - 30))
        canvas.paste(t, (cx + (cell - t.width) // 2, cy + (cell - t.height) // 2), t)
        d.text((cx + 10, cy + cell + 4), f"{label} {im.width}x{im.height}", fill=(20, 24, 34))
    canvas.save(out)
    print(f"核验图: {out}")


def defringe_magenta(im):
    """把残留的品红像素改成中性灰（Seedream 偶尔把小物件染上幕布色）"""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    m_r = r.point(lambda v: 255 if v > 150 else 0)
    m_g = g.point(lambda v: 255 if v < 120 else 0)
    m_b = b.point(lambda v: 255 if v > 90 else 0)
    m_rg = ImageChops.subtract(r, g).point(lambda v: 255 if v > 90 else 0)
    is_mag = ImageChops.multiply(ImageChops.multiply(m_r, m_g), ImageChops.multiply(m_b, m_rg))
    neutral = Image.new("RGB", im.size, (196, 202, 214))
    rgb = Image.composite(neutral, rgb, is_mag)
    rgb.putalpha(im.getchannel("A"))
    return rgb


def main():
    report = {}
    items = []

    print("── 壳图去水印 ──")
    for f in ("bedroom.jpg", "study.jpg"):
        de_watermark(SHELLS / f)

    print("── 家具贴图（幕布优先，raw 兕底）──")
    for stem in ("bed", "desk", "lamp", "plant-wardrobe", "rug", "shelf"):
        screen = RAW / SCREENS[stem] if stem in SCREENS else None
        if screen and screen.exists():
            im = Image.open(screen).convert("RGB")
            keyed = key_magenta(im)
            src = screen.name
        else:
            raw = RAW / (stem + ".jpg")
            im = Image.open(raw).convert("RGB")
            t = THRESH.get(raw.name, 14)
            keyed = key_background(im, t)
            src = raw.name
        bbox = alpha_bbox(keyed)
        if stem != "plant-wardrobe":
            keyed = defringe_magenta(keyed)
        print(f"  {stem} <- {src}: bbox={bbox}")
        if stem == "plant-wardrobe":
            a, b = split_two(keyed, "plant", "wardrobe", fixed_cut=868)
            a.save(OUT / "plant.webp", "WEBP", quality=88, method=6)
            b.save(OUT / "wardrobe.webp", "WEBP", quality=88, method=6)
            report["plant"] = a.size; report["wardrobe"] = b.size
            items += [(a, "plant"), (b, "wardrobe")]
        else:
            out = trim(keyed)
            out.save(OUT / (stem + ".webp"), "WEBP", quality=88, method=6)
            report[stem] = out.size
            items.append((out, stem))

    sheet(items, SHEET)
    (OUT / "sizes.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
