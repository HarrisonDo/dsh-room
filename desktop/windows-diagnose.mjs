#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const usage = '用法：node desktop/windows-diagnose.mjs <DSH profile 目录> [候选 .tgz] [预期 SHA-256]';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(usage);
} else {
  try {
    const [profile, archive, expected] = args;
    if (!profile || args.length > 3 || (expected && !/^[a-f\d]{64}$/i.test(expected))) throw new Error(usage);
    if (process.platform !== 'win32') throw new Error('此诊断需在实际 Windows 用户会话中运行');
    const report = await diagnose(profile, archive, expected);
    console.log(JSON.stringify(report, null, 2));
    if (report.archiveHashMatches === false) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function diagnose(profile, archive, expected) {
  const root = await realpath(profile);
  if (!(await stat(root)).isDirectory()) throw new Error('请传入 DSH profile 目录');
  const plugin = path.join(root, 'storages', 'dsh-room');
  const runtime = path.join(plugin, 'desktop', 'runtime');
  const dirs = (await readdir(runtime, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })).filter(item => item.isDirectory()).map(item => item.name);
  const report = {
    platform: process.platform,
    nodeArch: process.arch,
    nodeVersion: process.version,
    windowsArch: process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || null,
    homePresent: await fileExists(path.join(plugin, 'home.json')),
    windowPrefsPresent: await fileExists(path.join(plugin, 'desktop', 'window', 'desk.json')),
    stagingCount: dirs.filter(name => name.startsWith('.install-')).length,
    runtimeReady: [],
  };
  for (const name of dirs.filter(name => /^electron-[\d.]+-win32-(arm64|x64)$/.test(name)).sort()) {
    if (await fileExists(path.join(runtime, name, 'electron.exe'))) report.runtimeReady.push(name);
  }
  if (archive) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    report.archiveSha256 = hash.digest('hex');
    if (expected) report.archiveHashMatches = report.archiveSha256 === expected.toLowerCase();
  }
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $items = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
      Select-Object ProcessId, ExecutablePath)
    [pscustomobject]@{
      elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
      processes = $items
    } | ConvertTo-Json -Depth 3 -Compress
  `;
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 12000 });
  const { elevated, processes } = JSON.parse(stdout.trim());
  report.elevated = elevated;
  report.managedElectronPids = processes.filter(({ ExecutablePath }) => {
    if (!ExecutablePath) return false;
    const relative = path.relative(runtime, ExecutablePath);
    return /^electron-[\d.]+-win32-(arm64|x64)\\electron\.exe$/i.test(relative);
  }).map(({ ProcessId }) => ProcessId);
  report.electronProcessesWithoutReadablePath = processes.filter(item => !item.ExecutablePath).length;
  return report;
}

async function fileExists(file) {
  return stat(file).then(value => value.isFile(), error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
}
