import { getVideos } from './videos-api.js';

(function () {
  const MIME_PROBE = document.createElement('video');
  const mimeSupport = new Map();

  function itemPath(item) {
    if (!item || typeof item !== 'object') return null;
    const p = item.path;
    return typeof p === 'string' && p.length > 0 ? p : null;
  }

  function streamUrl(relPath) {
    return '/api/video?p=' + encodeURIComponent(relPath);
  }

  function fileExtLower(p) {
    if (typeof p !== 'string') return '';
    const i = p.lastIndexOf('.');
    return i >= 0 ? p.slice(i).toLowerCase() : '';
  }

  function canPlayMime(mime) {
    if (!mime) return '';
    if (mimeSupport.has(mime)) return mimeSupport.get(mime);
    const level = MIME_PROBE.canPlayType(mime);
    mimeSupport.set(mime, level);
    return level;
  }

  /** Контейнеры, которые в большинстве браузеров не декодируются нативным HTML5. */
  function prefersNativeOrNoHtml5Playback(item) {
    const ext = fileExtLower(itemPath(item));
    if (ext === '.mkv') return true;
    const mime = item && typeof item.mime === 'string' ? item.mime : '';
    if (!mime || mime === 'application/octet-stream') {
      return ext === '.mkv';
    }
    const level = canPlayMime(mime);
    return level !== 'probably' && level !== 'maybe';
  }

  function sourceForVideoJs(item, p) {
    const src = streamUrl(p);
    const mime = item && typeof item.mime === 'string' ? item.mime : '';
    if (!mime || mime === 'application/octet-stream') {
      return { src };
    }
    const level = canPlayMime(mime);
    if (level === 'probably' || level === 'maybe') {
      return { src, type: mime };
    }
    return { src };
  }

  function init() {
    const gridEl = document.getElementById('videoGrid');
    const cellTpl = document.getElementById('video-cell-tpl');
    if (!gridEl || !cellTpl) return;

    /** @type {{ cell: Element, item: object, path: string, mode: 'native'|'vjs', video: HTMLVideoElement, player: object|null, active: boolean, portrait: boolean|null }[]} */
    let cells = [];
    let observer = null;

    function applyOrientation(entry, width, height) {
      if (!width || !height) return;
      entry.portrait = height > width;
      entry.cell.classList.toggle('video-cell--portrait', entry.portrait);
    }

    function bindOrientation(entry, videoEl) {
      const v = videoEl || entry.video;
      if (!v) return;
      const read = () => applyOrientation(entry, v.videoWidth, v.videoHeight);
      if (v.videoWidth && v.videoHeight) {
        read();
        return;
      }
      v.addEventListener('loadedmetadata', read, { once: true });
    }

    function disposeCell(entry) {
      if (!entry.active) return;
      entry.active = false;
      try {
        if (entry.player && !entry.player.isDisposed()) {
          entry.player.dispose();
        }
      } catch (_) {
        /* ignore */
      }
      entry.player = null;

      const v = entry.video;
      if (!v) return;
      try {
        v.pause();
      } catch (_) {
        /* ignore */
      }
      v.removeAttribute('src');
      while (v.firstChild) v.removeChild(v.firstChild);
      try {
        v.load();
      } catch (_) {
        /* ignore */
      }
    }

    function disposeAll() {
      cells.forEach(disposeCell);
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      cells = [];
    }

    function activateNative(entry) {
      const v = entry.video;
      v.className = 'video-cell__player video-cell__player--native';
      v.src = streamUrl(entry.path);
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      v.controls = true;
      v.preload = 'metadata';
      bindOrientation(entry, v);
      v.play().catch(() => {});
      entry.active = true;
    }

    function activateVideoJs(entry) {
      if (typeof window.videojs !== 'function') {
        console.error('test-player: video.js не загружен');
        return;
      }
      const v = entry.video;
      v.className = 'video-js vjs-default-skin video-cell__player';
      const vjsPlayer = window.videojs(v, {
        autoplay: 'muted',
        muted: true,
        loop: true,
        controls: true,
        playsinline: true,
        preload: 'metadata',
        fluid: false,
        fill: true,
        sources: [sourceForVideoJs(entry.item, entry.path)],
      });
      entry.player = vjsPlayer;
      entry.video = vjsPlayer.el()?.querySelector('video') || v;
      bindOrientation(entry, entry.video);
      vjsPlayer.ready(() => {
        const tech = vjsPlayer.el()?.querySelector('video') || entry.video;
        entry.video = tech;
        bindOrientation(entry, tech);
      });
      entry.active = true;
    }

    function activateCell(entry) {
      if (entry.active) {
        if (entry.player && !entry.player.isDisposed()) {
          entry.player.play().catch(() => {});
        } else if (entry.video) {
          entry.video.play().catch(() => {});
        }
        return;
      }
      if (entry.mode === 'native') {
        activateNative(entry);
      } else {
        activateVideoJs(entry);
      }
    }

    function deactivateCell(entry) {
      if (!entry.active) return;
      // Полный dispose освобождает декодеры при скролле.
      disposeCell(entry);
      // Восстановить пустой <video> в ячейке после dispose Video.js
      // (dispose удаляет/заменяет tech-элемент).
      ensureVideoEl(entry);
    }

    function ensureVideoEl(entry) {
      // videojs.dispose() перестраивает DOM — проще собрать чистый <video>.
      entry.cell.innerHTML = '';
      const v = document.createElement('video');
      v.className = 'video-js vjs-default-skin video-cell__player';
      v.setAttribute('playsinline', '');
      v.preload = 'none';
      entry.cell.appendChild(v);
      entry.video = v;
      entry.player = null;
      entry.active = false;
      if (entry.portrait) {
        entry.cell.classList.add('video-cell--portrait');
      }
    }

    function renderGrid(items) {
      disposeAll();
      gridEl.innerHTML = '';

      if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'video-grid__empty';
        li.textContent = 'Нет видеофайлов в каталоге.';
        gridEl.appendChild(li);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          for (const io of entries) {
            const entry = cells.find((c) => c.cell === io.target);
            if (!entry) continue;
            if (io.isIntersecting) {
              activateCell(entry);
            } else {
              deactivateCell(entry);
            }
          }
        },
        {
          root: null,
          rootMargin: '200px 0px',
          threshold: 0.01,
        }
      );

      items.forEach((item) => {
        const p = itemPath(item);
        if (!p) return;

        const fragment = cellTpl.content.cloneNode(true);
        const cell = fragment.querySelector('.video-cell');
        if (!cell) {
          console.error(
            'test-player: в #video-cell-tpl нет корня .video-cell'
          );
          return;
        }
        const v = cell.querySelector('.video-cell__player');
        if (!v) {
          console.error('test-player: в .video-cell нет .video-cell__player');
          return;
        }
        v.preload = 'none';
        v.removeAttribute('src');

        const entry = {
          cell,
          item,
          path: p,
          mode: prefersNativeOrNoHtml5Playback(item) ? 'native' : 'vjs',
          video: v,
          player: null,
          active: false,
          portrait: null,
        };
        cells.push(entry);
        gridEl.appendChild(fragment);
        observer.observe(cell);
      });
    }

    getVideos()
      .then((items) => {
        renderGrid(items);
      })
      .catch((e) => {
        console.error(e);
        gridEl.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'video-grid__empty';
        li.textContent = 'Не удалось загрузить список.';
        gridEl.appendChild(li);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
