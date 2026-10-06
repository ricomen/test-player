const express = require('express');
const compression = require('compression');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT) || 8082;
const VIDEO_ROOT = path.resolve(
  process.env.VIDEO_ROOT || path.join(__dirname, '..', 'media')
);
const THUMB_CACHE = path.resolve(
  process.env.THUMB_CACHE || path.join(os.tmpdir(), 'test-player-thumbs')
);
const VIDEOS_CACHE_TTL_MS = Number(process.env.VIDEOS_CACHE_TTL_MS) || 5000;

const VIDEO_EXT = new Set([
  '.mp4',
  '.webm',
  '.ogg',
  '.ogv',
  '.mov',
  '.m4v',
  '.mkv',
]);

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
};

function safeFileUnderRoot(root, relPath) {
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    return null;
  }
  const normalized = relPath
    .replace(/^[/\\]+/, '')
    .split(/[/\\]+/)
    .filter((p) => p && p !== '..')
    .join(path.sep);
  if (!normalized) {
    return null;
  }
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, normalized);
  const prefix =
    rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (!full.startsWith(prefix)) {
    return null;
  }
  return full;
}

async function walkVideos(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = [];
  const out = [];

  for (const ent of entries) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      nested.push(walkVideos(full, rel));
    } else {
      const ext = path.extname(ent.name).toLowerCase();
      if (VIDEO_EXT.has(ext)) {
        out.push({
          name: ent.name,
          path: rel.replace(/\\/g, '/'),
          mime: MIME[ext] || 'application/octet-stream',
        });
      }
    }
  }

  const children = await Promise.all(nested);
  for (const list of children) {
    out.push(...list);
  }
  return out;
}

/** Кэш списка видео: TTL + инвалидация по mtime корня. */
let videosCache = { at: 0, mtimeMs: null, list: null };

async function getVideosCached() {
  const now = Date.now();
  let mtimeMs = null;
  try {
    mtimeMs = (await fs.stat(VIDEO_ROOT)).mtimeMs;
  } catch {
    return [];
  }

  if (
    videosCache.list &&
    now - videosCache.at < VIDEOS_CACHE_TTL_MS &&
    videosCache.mtimeMs === mtimeMs
  ) {
    return videosCache.list;
  }

  const list = await walkVideos(VIDEO_ROOT);
  list.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  );
  videosCache = { at: now, mtimeMs, list };
  return list;
}

let ffmpegAvailable = null;

async function ensureFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function thumbCacheKey(fullPath, mtimeMs, size) {
  return crypto
    .createHash('sha1')
    .update(`${fullPath}|${mtimeMs}|${size}`)
    .digest('hex');
}

function runFfmpegThumb(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '0',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-y',
      outputPath,
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exit ${code}`));
    });
  });
}

const app = express();
const projectRoot = path.join(__dirname, '..');

app.use(compression());
app.use(express.static(path.join(projectRoot, 'public'), { maxAge: '5m' }));

app.get('/api/videos', async (_req, res) => {
  try {
    if (!(await fs.stat(VIDEO_ROOT).catch(() => null))) {
      return res.json([]);
    }
    const list = await getVideosCached();
    res.set('Cache-Control', 'private, max-age=5');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось прочитать каталог' });
  }
});

app.get('/api/video', async (req, res) => {
  const full = safeFileUnderRoot(VIDEO_ROOT, req.query.p);
  if (!full) {
    return res.status(404).end();
  }

  let st;
  try {
    st = await fs.stat(full);
  } catch {
    return res.status(404).end();
  }
  if (!st.isFile()) {
    return res.status(404).end();
  }

  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext];
  if (type) {
    res.type(type);
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(full, (err) => {
    if (err && !res.headersSent) {
      res.status(500).end();
    }
  });
});

app.get('/api/thumbnail', async (req, res) => {
  const full = safeFileUnderRoot(VIDEO_ROOT, req.query.p);
  if (!full) {
    return res.status(404).end();
  }

  let st;
  try {
    st = await fs.stat(full);
  } catch {
    return res.status(404).end();
  }
  if (!st.isFile()) {
    return res.status(404).end();
  }

  if (!(await ensureFfmpeg())) {
    return res.status(503).json({
      error: 'ffmpeg не установлен на сервере',
      hint: 'Установите ffmpeg (например: brew install ffmpeg)',
    });
  }

  try {
    await fs.mkdir(THUMB_CACHE, { recursive: true });
    const key = thumbCacheKey(full, st.mtimeMs, st.size);
    const cached = path.join(THUMB_CACHE, `${key}.jpg`);

    try {
      await fs.access(cached);
    } catch {
      const tmp = path.join(THUMB_CACHE, `${key}.${process.pid}.tmp.jpg`);
      try {
        await runFfmpegThumb(full, tmp);
        await fs.rename(tmp, cached);
      } catch (err) {
        await fs.unlink(tmp).catch(() => {});
        throw err;
      }
    }

    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/jpeg');
    res.sendFile(cached, (err) => {
      if (err && !res.headersSent) {
        res.status(500).end();
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Не удалось извлечь кадр',
      detail: err && err.message ? err.message : String(err),
    });
  }
});

app.get('/api/health', async (_req, res) => {
  const hasFfmpeg = await ensureFfmpeg();
  res.json({
    ok: true,
    root: VIDEO_ROOT,
    thumbCache: THUMB_CACHE,
    ffmpeg: hasFfmpeg,
  });
});

app.listen(PORT, () => {
  console.log(`test-player: http://0.0.0.0:${PORT}`);
  console.log(`VIDEO_ROOT=${VIDEO_ROOT}`);
  console.log(`THUMB_CACHE=${THUMB_CACHE}`);
  ensureFfmpeg().then((ok) => {
    console.log(`ffmpeg=${ok ? 'ok' : 'missing (thumbnail → 503)'}`);
  });
});
