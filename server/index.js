const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { existsSync, statSync } = require('fs');

const PORT = Number(process.env.PORT) || 8082;
const VIDEO_ROOT = path.resolve(
  process.env.VIDEO_ROOT || path.join(__dirname, '..', 'media')
);

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
  const out = [];
  for (const ent of entries) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkVideos(full, rel)));
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
  return out;
}

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/videos', async (req, res) => {
  try {
    if (!existsSync(VIDEO_ROOT)) {
      return res.json([]);
    }
    const list = await walkVideos(VIDEO_ROOT);
    list.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось прочитать каталог' });
  }
});

app.get('/api/video', (req, res) => {
  const rel = req.query.p;
  const full = safeFileUnderRoot(VIDEO_ROOT, rel);
  if (!full || !existsSync(full)) {
    return res.status(404).end();
  }
  try {
    if (!statSync(full).isFile()) {
      return res.status(404).end();
    }
  } catch {
    return res.status(404).end();
  }
  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext];
  if (type) {
    res.type(type);
  }
  res.sendFile(full, (err) => {
    if (err && !res.headersSent) {
      res.status(500).end();
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, root: VIDEO_ROOT });
});

app.listen(PORT, () => {
  console.log(`test-player: http://0.0.0.0:${PORT}`);
  console.log(`VIDEO_ROOT=${VIDEO_ROOT}`);
});
