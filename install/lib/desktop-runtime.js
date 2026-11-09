import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = '45.2.3';
const MAX_BYTES = 400 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 12 * 60 * 1000;
// https://github.com/electron/electron/releases/download/v45.2.3/SHASUMS256.txt
const CHECKSUMS = {
  'darwin-arm64': '4d7c429064087a47b855d9bd06c76ead4819b7f02b385de232d4a5c37ecef55f',
  'darwin-x64': 'd87323533cc8750ef177e5b48058f7a8b381f677d4e103cc63360006c08829c2',
  'win32-arm64': 'f664bd7a4adfc45ac237a6f5fbf6c8e041b71b174466e9cb6fc9416c918e249d',
  'win32-x64': '489cd061908e697394b004298bf5ffd345c935d10e8ca197ba819f019ab2dec0',
};

const target = process.platform + '-' + process.arch;
const mac = process.platform === 'darwin';
const binary = mac ? 'Electron.app/Contents/MacOS/Electron' : 'electron.exe';
export const supportsDesktopRuntime = Object.hasOwn(CHECKSUMS, target);

async function executableIn(dir) {
  const file = path.join(dir, binary);
  try {
    await access(file, constants.X_OK);
    return file;
  } catch {
    return null;
  }
}

function unpack(archive, dir, signal) {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const executable = mac ? '/usr/bin/ditto' : path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = mac ? ['-x', '-k', archive, dir] : [
    '-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:ROOMKIT_ARCHIVE -DestinationPath $env:ROOMKIT_UNPACK',
  ];
  const env = {
    PATH: mac ? '/usr/bin:/bin' : path.join(systemRoot, 'System32'),
    SystemRoot: systemRoot,
    ROOMKIT_ARCHIVE: archive,
    ROOMKIT_UNPACK: dir,
  };
  for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, signal, stdio: 'ignore', windowsHide: true });
    let error;
    child.on('error', (cause) => { error = cause; });
    child.once('close', (code) => {
      if (error) reject(error);
      else if (code !== 0) reject(new Error('桌面运行时解压失败'));
      else resolve();
    });
  });
}

/** cache is owned by this plugin. An interrupted install never becomes a cached runtime. */
export async function prepareDesktopRuntime(cache, { signal, onProgress = () => {}, fetchRuntime = fetch } = {}) {
  if (!supportsDesktopRuntime) throw new Error('此系统暂不支持插件桌面窗口');
  signal?.throwIfAborted();
  const dir = path.join(cache, 'electron-' + VERSION + '-' + target);
  const existing = await executableIn(dir);
  signal?.throwIfAborted();
  if (existing) return existing;

  await mkdir(cache, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(cache, '.install-'));
  const archive = path.join(staging, 'electron.zip');
  const unpacked = path.join(staging, 'runtime');
  const file = 'electron-v' + VERSION + '-' + target + '.zip';
  const url = 'https://github.com/electron/electron/releases/download/v' + VERSION + '/' + file;
  const downloadSignal = AbortSignal.any([AbortSignal.timeout(DOWNLOAD_TIMEOUT), ...(signal ? [signal] : [])]);
  try {
    const response = await fetchRuntime(url, { signal: downloadSignal });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('桌面运行时下载失败（HTTP ' + response.status + '）');
    }
    const total = Number(response.headers.get('content-length')) || null;
    if (total > MAX_BYTES) {
      await response.body.cancel();
      throw new Error('桌面运行时文件过大');
    }
    const hash = createHash('sha256');
    let bytes = 0;
    onProgress({ phase: 'downloading', bytes, total });
    const meter = new Transform({
      transform(chunk, _, callback) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) return callback(new Error('桌面运行时文件过大'));
        hash.update(chunk);
        onProgress({ phase: 'downloading', bytes, total });
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(archive, { mode: 0o600 }), { signal: downloadSignal });
    if (hash.digest('hex') !== CHECKSUMS[target]) throw new Error('桌面运行时校验失败，请重试');
    onProgress({ phase: 'extracting', bytes, total });
    await unpack(archive, unpacked, signal);
    signal?.throwIfAborted();
    if (!await executableIn(unpacked)) throw new Error('桌面运行时缺少可执行文件');
    try {
      await rename(unpacked, dir);
    } catch (error) {
      if (!await executableIn(dir)) throw error;
    }
    return path.join(dir, binary);
  } finally {
    await rm(staging, { recursive: true, force: true, maxRetries: 3 });
  }
}
