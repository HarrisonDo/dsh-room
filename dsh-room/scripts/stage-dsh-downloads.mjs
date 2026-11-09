#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , releaseDir, outputDir] = process.argv;
if (!releaseDir || !outputDir || process.argv.length !== 4) {
  throw new Error('用法：node scripts/stage-dsh-downloads.mjs <候选目录> <新的静态资源目录>');
}

const sums = await readFile(path.join(releaseDir, 'SHA256SUMS'), 'utf8');
const release = /^([a-f0-9]{64}) {2}(dsh-room-(\d+\.\d+\.\d+-r\d+[a-z]*\.\d+))\.tgz\n([a-f0-9]{64}) {2}\2-source\.tar\.gz\n$/.exec(sums);
if (!release) throw new Error('候选校验清单缺少同版本的安装包和源码');
const [, packageHash, name, version, sourceHash] = release;
const plugin = name + '.tgz';
const source = name + '-source.tar.gz';
const checksums = name + '-SHA256SUMS.txt';
const archives = await Promise.all([[plugin, packageHash], [source, sourceHash]].map(async ([file, expected]) => {
  const data = await readFile(path.join(releaseDir, file));
  if (createHash('sha256').update(data).digest('hex') !== expected) throw new Error('候选校验失败 ' + file);
  return [file, data];
}));

const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>安装 RoomKit · DSH 房间插件</title>
<style>
  body { margin: 2rem auto; padding: 0 1rem; max-width: 38rem; font: 1rem/1.7 system-ui, sans-serif; }
  pre { overflow-x: auto; padding: 1rem; background: #edf3f8; }
</style>
<main>
  <nav><a href="/">网页试玩</a> · <a href="/guide">创作指南</a> · <a href="https://github.com/HarrisonDo/dsh-room">共建仓库</a> · <a href="https://github.com/HarrisonDo/dsh-room/issues">问题反馈</a></nav>
  <h1>给你的 AI 一个房间</h1>
  <p>打开 Harness → 插件 → 添加插件，把下面的仓库地址粘贴进去，点击「安装」。</p>
  <pre><code>https://github.com/HarrisonDo/dsh-room</code></pre>
  <p>安装后点「立即启用」，打开「大肥鱼的房间」。试试换房、点灯和聊天，然后点击「放到桌面」。不用下载源码或自己构建。</p>
  <p>房间聊天使用你在 Harness 中选好的模型；没有模型时仍可布置和手动互动。首次放到桌面会下载并校验运行组件，显示进度，可取消或重试；之后使用缓存。桌面与 DSH 接续同一个家，DSH 需要保持运行。</p>
  <p>当前版本 ${version}。Windows 桌面仍待实机验收。网页试玩和本机 DSH 存档各自保存。</p>
  <p><a href="https://github.com/HarrisonDo/dsh-room/blob/main/docs/17-%E5%AE%89%E8%A3%85%E4%B8%8E%E6%A1%8C%E9%9D%A2%E4%BD%BF%E7%94%A8.md">完整安装与桌面使用指南</a></p>
  <h2>GitHub 连不上时</h2>
  <p>也可以把下面这个固定版本地址粘贴到同一个「添加插件」框：</p>
  <pre><code>https://mu2a.penguingugu.com/assets/${plugin}</code></pre>
  <p>DSH 的 npm 镜像选项不能替代 GitHub 连接。已经安装旧版时，按 DSH 的插件管理提示卸载后再装；更新前先导出自己的场景。</p>
  <h2>下载与共建</h2>
  <ul>
    <li><a href="${plugin}" download>下载插件 ${version}</a></li>
    <li><a href="${source}" download>下载同版本源码和许可证</a></li>
    <li><a href="${checksums}" download>下载 SHA-256 校验值</a></li>
  </ul>
  <p>这些文件对应同一验收版本。GitHub 根目录提供可直接安装的构建，开发源码和参与方式见仓库说明。首次使用不需要终端命令。</p>
</main>
</html>
`;

await mkdir(outputDir);
for (const [file, data] of [...archives, [checksums, sums], ['dsh-install.html', html]]) {
  await writeFile(path.join(outputDir, file), data);
}
