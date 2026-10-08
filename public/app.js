import { deleteVideo, getVideos } from './videos-api.js';

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

  function thumbUrl(relPath, seekSec = 0) {
    let url = '/api/thumbnail?p=' + encodeURIComponent(relPath);
    const t = Math.max(0, Math.floor(seekSec));
    if (t > 0) {
      url += '&t=' + encodeURIComponent(String(t));
    }
    return url;
  }

  const STORAGE_TILE_MODE = 'test-player-tileMode';
  const STORAGE_FRAME_STEP = 'test-player-frameStep';
  const STORAGE_PAGE_SCROLL = 'test-player-pageScroll';
  const GRID_COL_MIN_PX = 280;

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

  function shuffleArray(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function captureVideoFrameUrl(videoEl) {
    return new Promise((resolve) => {
      if (!videoEl || videoEl.readyState < 2) {
        resolve(null);
        return;
      }
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (!w || !h) {
        resolve(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      try {
        ctx.drawImage(videoEl, 0, 0, w, h);
      } catch (err) {
        console.warn('test-player: не удалось снять кадр', err);
        resolve(null);
        return;
      }
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(URL.createObjectURL(blob));
        },
        'image/jpeg',
        0.82
      );
    });
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
    const gridViewport = document.getElementById('videoGridViewport');
    const cellTpl = document.getElementById('video-cell-tpl');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const deleteModeBtn = document.getElementById('deleteModeBtn');
    const deleteModeHint = document.getElementById('deleteModeHint');
    const spotlightEl = document.getElementById('videoSpotlight');
    const spotlightTitle = document.getElementById('spotlightTitle');
    const spotlightClose = document.getElementById('spotlightClose');
    const tileModeSelect = document.getElementById('tileModeSelect');
    const frameStepSelect = document.getElementById('frameStepSelect');
    const frameStepWrap = document.getElementById('frameStepWrap');
    const pageScrollSelect = document.getElementById('pageScrollSelect');
    if (!gridViewport || !cellTpl) return;

    let tileMode =
      localStorage.getItem(STORAGE_TILE_MODE) === 'frames' ? 'frames' : 'video';
    let frameStepSec = Math.max(
      5,
      parseInt(localStorage.getItem(STORAGE_FRAME_STEP) || '60', 10) || 60
    );
    let pagedScroll = localStorage.getItem(STORAGE_PAGE_SCROLL) === 'paged';
    let lastGridItems = [];
    let resizeRenderTimer = null;

    /** @type {{ cell: Element, item: object, path: string, mode: 'native'|'vjs', video: HTMLVideoElement, player: object|null, active: boolean, activeGridKind: 'video'|'frames'|null, portrait: boolean|null, posterUrl: string|null, frameTimer: number|null, frameTimeSec: number, durationSec: number|null, _deactivating: boolean, _inView: boolean }[]} */
    let cells = [];
    let observer = null;
    let deleteMode = false;
    /** @type {typeof cells[0] | null} */
    let spotlightEntry = null;
    let userPlaybackUnlocked = false;
    const prefersTvPlayback =
      window.matchMedia('(pointer: coarse)').matches ||
      /Web0S|webOS|Tizen|SmartTV|BRAVIA|HbbTV/i.test(navigator.userAgent);

    function clearNeedsGesture(entry) {
      entry.cell.classList.remove('video-cell--needs-gesture');
      entry.cell.removeAttribute('title');
    }

    function markNeedsGesture(entry, err) {
      entry.cell.classList.add('video-cell--needs-gesture');
      const name = err && err.name ? err.name : '';
      entry.cell.setAttribute(
        'title',
        name === 'NotAllowedError'
          ? 'Нажмите OK или клик для воспроизведения'
          : 'Не удалось воспроизвести'
      );
      if (err) {
        console.warn('test-player: play', entry.path, err);
      }
    }

    function playVideoElement(entry, videoEl) {
      if (!videoEl) return Promise.resolve();
      return videoEl.play().catch((err) => {
        markNeedsGesture(entry, err);
        return Promise.reject(err);
      });
    }

    function playEntry(entry) {
      if (!entry) return Promise.resolve();
      clearNeedsGesture(entry);
      if (entry.player && !entry.player.isDisposed()) {
        return entry.player.play().catch((err) => {
          markNeedsGesture(entry, err);
          return Promise.reject(err);
        });
      }
      if (entry.video) {
        return playVideoElement(entry, entry.video);
      }
      return Promise.resolve();
    }

    function entryEligibleForUnlockPlay(entry) {
      if (entry._inView || entry === spotlightEntry) return true;
      if (!prefersTvPlayback) return false;
      const cell = entry.cell;
      return (
        cell === document.activeElement || cell.contains(document.activeElement)
      );
    }

    function unlockUserPlayback() {
      const first = !userPlaybackUnlocked;
      userPlaybackUnlocked = true;
      if (!first) return;
      for (const entry of cells) {
        clearNeedsGesture(entry);
        if (!entryEligibleForUnlockPlay(entry)) continue;
        if (!entry.active) activateForGrid(entry);
        if (tileMode === 'video') void playEntry(entry);
      }
    }

    function setDeleteMode(on) {
      deleteMode = Boolean(on);
      gridViewport.classList.toggle('video-grid--delete-mode', deleteMode);
      if (deleteModeBtn) {
        deleteModeBtn.setAttribute('aria-pressed', deleteMode ? 'true' : 'false');
        deleteModeBtn.classList.toggle('btn--toggle-on', deleteMode);
      }
      if (deleteModeHint) {
        deleteModeHint.hidden = !deleteMode;
      }
    }

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', async () => {
        shuffleBtn.disabled = true;
        try {
          const items = await getVideos();
          renderGrid(shuffleArray(items));
        } catch (e) {
          console.error(e);
        } finally {
          shuffleBtn.disabled = false;
        }
      });
    }

    if (deleteModeBtn) {
      deleteModeBtn.addEventListener('click', () => {
        setDeleteMode(!deleteMode);
      });
    }

    document.addEventListener('pointerdown', unlockUserPlayback, {
      capture: true,
      passive: true,
    });
    document.addEventListener('keydown', unlockUserPlayback, {
      capture: true,
      passive: true,
    });

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
      entry.activeGridKind = null;
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

    function posterEl(entry) {
      return entry.cell.querySelector('.video-cell__poster');
    }

    function syncTileToolbar() {
      if (tileModeSelect) {
        tileModeSelect.value = tileMode;
      }
      if (frameStepSelect) {
        const opt = [...frameStepSelect.options].find(
          (o) => Number(o.value) === frameStepSec
        );
        frameStepSelect.value = opt ? opt.value : String(frameStepSec);
      }
      if (frameStepWrap) {
        frameStepWrap.hidden = tileMode !== 'frames';
      }
      gridViewport.classList.toggle(
        'video-grid--tile-frames',
        tileMode === 'frames'
      );
      gridViewport.classList.toggle(
        'video-grid-viewport--paged',
        pagedScroll
      );
      if (pageScrollSelect) {
        pageScrollSelect.value = pagedScroll ? 'paged' : 'continuous';
      }
    }

    function computeItemsPerPage() {
      const toolbar = document.querySelector('.grid-toolbar');
      const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 88;
      const availH = Math.max(200, window.innerHeight - toolbarH);
      const availW = window.innerWidth;
      const cols = Math.max(1, Math.floor(availW / GRID_COL_MIN_PX));
      const colWidth = availW / cols;
      const cellH = colWidth * (9 / 16);
      const rows = Math.max(1, Math.floor(availH / cellH));
      return Math.max(1, cols * rows);
    }

    function chunkItems(items, size) {
      const pages = [];
      for (let i = 0; i < items.length; i += size) {
        pages.push(items.slice(i, i + size));
      }
      return pages;
    }

    async function fetchDuration(entry) {
      if (entry.durationSec != null) {
        return entry.durationSec;
      }
      try {
        const res = await fetch(
          '/api/duration?p=' + encodeURIComponent(entry.path)
        );
        if (!res.ok) {
          entry.durationSec = null;
          return null;
        }
        const data = await res.json();
        const d = data && data.duration;
        entry.durationSec =
          typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null;
        return entry.durationSec;
      } catch (err) {
        console.warn('test-player: duration', entry.path, err);
        entry.durationSec = null;
        return null;
      }
    }

    function showFrameAt(entry, sec) {
      const img = posterEl(entry);
      const v = entry.video;
      if (!img) return;
      if (v) {
        v.hidden = true;
      }
      const t = Math.max(0, Math.floor(sec));
      entry.frameTimeSec = t;
      img.hidden = false;
      img.alt = entry.path;
      img.src = thumbUrl(entry.path, t);
      img.onload = () => {
        applyOrientation(entry, img.naturalWidth, img.naturalHeight);
      };
    }

    function stopFrameSlideshow(entry) {
      if (entry.frameTimer) {
        clearInterval(entry.frameTimer);
        entry.frameTimer = null;
      }
      if (entry.activeGridKind !== 'frames') return;
      entry.activeGridKind = null;
      entry.active = false;
      entry.cell.classList.remove('video-cell--frames');
      const img = posterEl(entry);
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
        img.removeAttribute('alt');
      }
      if (entry.video) {
        entry.video.hidden = false;
      }
    }

    function pauseSlideshowTimer(entry) {
      if (entry.frameTimer) {
        clearInterval(entry.frameTimer);
        entry.frameTimer = null;
      }
    }

    function resumeSlideshowTimer(entry) {
      if (tileMode !== 'frames' || entry.activeGridKind !== 'frames') return;
      if (entry.frameTimer || !entry._inView) return;
      const step = frameStepSec;
      entry.frameTimer = window.setInterval(() => {
        let next = (entry.frameTimeSec || 0) + step;
        const dur = entry.durationSec;
        if (dur != null && next >= dur) {
          next = 0;
        } else if (dur == null && next > 3600) {
          next = 0;
        }
        showFrameAt(entry, next);
      }, step * 1000);
    }

    async function activateFrameSlideshow(entry) {
      if (spotlightEntry === entry) return;
      if (entry.activeGridKind === 'frames') return;
      if (entry.active) {
        disposeCell(entry);
      }
      await fetchDuration(entry);
      entry.active = true;
      entry.activeGridKind = 'frames';
      entry.cell.classList.add('video-cell--frames');
      showFrameAt(entry, 0);
      resumeSlideshowTimer(entry);
    }

    function beginTileScrub(entry) {
      if (entry._scrubbing) return;
      entry._scrubbing = true;
      entry.cell.classList.add('video-cell--scrubbing');
      pauseSlideshowTimer(entry);
      if (tileMode === 'video' && entry.active) {
        if (entry.player && !entry.player.isDisposed()) {
          entry.player.pause();
        } else if (entry.video) {
          entry.video.pause();
        }
      }
    }

    function endTileScrub(entry) {
      if (!entry._scrubbing) return;
      entry._scrubbing = false;
      entry.cell.classList.remove('video-cell--scrubbing');
      entry.cell.style.removeProperty('--scrub-ratio');
      if (tileMode === 'frames') {
        resumeSlideshowTimer(entry);
        return;
      }
      if (tileMode === 'video' && entry._inView) {
        if (!entry.active) {
          const imgIdle = posterEl(entry);
          if (imgIdle) {
            imgIdle.hidden = true;
            imgIdle.removeAttribute('src');
          }
          entry.cell.classList.remove('video-cell--frames');
          entry.cell.style.removeProperty('--scrub-ratio');
          return;
        }
        const img = posterEl(entry);
        if (img) {
          img.hidden = true;
          img.removeAttribute('src');
        }
        entry.cell.classList.remove('video-cell--frames');
        if (entry.video) {
          entry.video.hidden = false;
        }
        entry.cell.style.removeProperty('--scrub-ratio');
        void playEntry(entry);
      }
    }

    async function updateScrubFrame(entry, media, clientX) {
      let dur = entry.durationSec;
      if (dur == null) {
        dur = await fetchDuration(entry);
      }
      if (
        dur == null &&
        entry.video &&
        Number.isFinite(entry.video.duration) &&
        entry.video.duration > 0
      ) {
        dur = entry.video.duration;
      }
      if (dur == null) {
        dur = 3600;
      }
      const rect = media.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width)
      );
      const now = Date.now();
      if (now - (entry._lastScrubAt || 0) < 120) {
        return;
      }
      entry._lastScrubAt = now;
      const t = Math.floor(ratio * dur);
      entry.cell.classList.add('video-cell--frames');
      showFrameAt(entry, t);
      entry.cell.style.setProperty('--scrub-ratio', String(ratio));
    }

    function bindTileScrub(entry, media) {
      entry._scrubDownX = 0;
      entry._scrubDownY = 0;
      entry._scrubDrag = false;
      entry._suppressSpotlightClick = false;

      media.addEventListener('pointerdown', (ev) => {
        if (deleteMode) return;
        entry._scrubDownX = ev.clientX;
        entry._scrubDownY = ev.clientY;
        entry._scrubDrag = false;
      });

      media.addEventListener('pointermove', (ev) => {
        if (deleteMode || spotlightEntry === entry || !entry._inView) return;
        const hoverScrub = ev.pointerType === 'mouse';
        if (!hoverScrub && ev.buttons === 0) return;
        if (!hoverScrub) {
          const dx = Math.abs(ev.clientX - entry._scrubDownX);
          const dy = Math.abs(ev.clientY - entry._scrubDownY);
          if (dx > 5 || dy > 5) {
            entry._scrubDrag = true;
          }
        }
        beginTileScrub(entry);
        void updateScrubFrame(entry, media, ev.clientX);
      });

      media.addEventListener('pointerleave', () => {
        endTileScrub(entry);
      });

      media.addEventListener('pointerup', () => {
        if (entry._scrubDrag) {
          entry._suppressSpotlightClick = true;
        }
        endTileScrub(entry);
      });

      media.addEventListener('pointercancel', () => {
        endTileScrub(entry);
      });
    }

    function activateForGrid(entry) {
      if (spotlightEntry === entry) return;
      if (tileMode === 'frames') {
        void activateFrameSlideshow(entry);
        return;
      }
      stopFrameSlideshow(entry);
      activateCell(entry);
    }

    function readResumeTime(entry) {
      const raw = entry.cell.dataset.resumeTime;
      if (raw == null || raw === '') return 0;
      const t = parseFloat(raw);
      return Number.isFinite(t) && t > 0.05 ? t : 0;
    }

    function saveResumeTime(entry, videoEl) {
      if (!videoEl) return;
      const t = videoEl.currentTime;
      if (Number.isFinite(t) && t > 0.05) {
        entry.cell.dataset.resumeTime = String(t);
      }
    }

    function playFromResumeTime(entry, videoEl) {
      if (!videoEl) return;
      const t = readResumeTime(entry);
      if (t <= 0) {
        void playVideoElement(entry, videoEl);
        return;
      }

      const seekAndPlay = () => {
        let target = t;
        const d = videoEl.duration;
        if (Number.isFinite(d) && d > 0) {
          target = Math.min(t, Math.max(0, d - 0.05));
        }
        try {
          videoEl.currentTime = target;
        } catch (_) {
          void playVideoElement(entry, videoEl);
          return;
        }
        videoEl.addEventListener(
          'seeked',
          () => {
            void playVideoElement(entry, videoEl);
          },
          { once: true }
        );
      };

      if (videoEl.readyState >= 1) {
        seekAndPlay();
      } else {
        videoEl.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      }
    }

    function revokePosterUrl(entry) {
      if (entry.posterUrl) {
        URL.revokeObjectURL(entry.posterUrl);
        entry.posterUrl = null;
      }
    }

    function syncPosterDisplay(entry) {
      const img = posterEl(entry);
      if (!img) return;
      if (entry.posterUrl) {
        img.src = entry.posterUrl;
        img.hidden = false;
      } else {
        img.removeAttribute('src');
        img.hidden = true;
      }
    }

    function bindRevealOnPlay(entry, videoEl) {
      if (!videoEl) return;
      if (!entry.posterUrl) {
        entry.cell.classList.remove('video-cell--loading-video');
        return;
      }
      entry.cell.classList.add('video-cell--loading-video');
      syncPosterDisplay(entry);

      const reveal = () => {
        entry.cell.classList.remove('video-cell--loading-video');
        const img = posterEl(entry);
        if (img) img.hidden = true;
      };

      if (!videoEl.paused && videoEl.readyState >= 3) {
        reveal();
        return;
      }

      videoEl.addEventListener('playing', reveal, { once: true });
      videoEl.addEventListener(
        'error',
        () => {
          entry.cell.classList.remove('video-cell--loading-video');
        },
        { once: true }
      );
    }

    function setSpotlightOpen(open) {
      if (!spotlightEl) return;
      if (open) {
        spotlightEl.hidden = false;
        spotlightEl.classList.add('is-open');
      } else {
        spotlightEl.classList.remove('is-open');
        spotlightEl.hidden = true;
      }
    }

    function setEntryMutedForGrid(entry, gridMuted) {
      const v = entry.video;
      if (v) v.muted = gridMuted;
      if (entry.player && !entry.player.isDisposed()) {
        entry.player.muted(gridMuted);
      }
    }

    function setSpotlightVisual(entry, on) {
      const media = entry.cell.querySelector('.video-cell__media');
      if (!media) return false;
      media.classList.toggle('is-spotlight', on);
      entry.cell.classList.toggle('is-spotlight-active', on);
      document.body.classList.toggle('spotlight-open', on);
      return true;
    }

    async function ensureEntryActiveOnly(entry) {
      stopFrameSlideshow(entry);
      if (!entry.active || entry.activeGridKind !== 'video') {
        activateCell(entry);
      }
      if (entry.player && !entry.player.isDisposed()) {
        await new Promise((resolve) => {
          entry.player.ready(resolve);
        });
      }
    }

    function closeSpotlight() {
      const entry = spotlightEntry;
      if (!entry) {
        setSpotlightOpen(false);
        document.body.classList.remove('spotlight-open');
        return;
      }

      if (entry.video) saveResumeTime(entry, entry.video);
      setSpotlightVisual(entry, false);
      setEntryMutedForGrid(entry, true);
      spotlightEntry = null;
      setSpotlightOpen(false);

      if (!entry._inView) {
        void deactivateCell(entry);
      } else if (tileMode === 'frames') {
        activateForGrid(entry);
      } else {
        disposeCell(entry);
        activateCell(entry);
      }
    }

    async function openSpotlight(entry) {
      if (deleteMode || !spotlightEl) return;

      if (spotlightEntry === entry) {
        closeSpotlight();
        return;
      }

      if (spotlightEntry) {
        const prev = spotlightEntry;
        if (prev.video) saveResumeTime(prev, prev.video);
        setSpotlightVisual(prev, false);
        setEntryMutedForGrid(prev, true);
        spotlightEntry = null;
      }

      await ensureEntryActiveOnly(entry);
      if (!setSpotlightVisual(entry, true)) return;

      spotlightEntry = entry;
      if (spotlightTitle) {
        spotlightTitle.textContent = entry.path;
      }
      setEntryMutedForGrid(entry, false);
      setSpotlightOpen(true);
      userPlaybackUnlocked = true;
      clearNeedsGesture(entry);
      void playEntry(entry);
    }

    if (spotlightClose) {
      spotlightClose.addEventListener('click', () => closeSpotlight());
    }

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && spotlightEntry) {
        closeSpotlight();
      }
    });

    function disposeAll() {
      closeSpotlight();
      cells.forEach((entry) => {
        stopFrameSlideshow(entry);
        disposeCell(entry);
        revokePosterUrl(entry);
      });
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
      bindRevealOnPlay(entry, v);
      playFromResumeTime(entry, v);
      entry.active = true;
      entry.activeGridKind = 'video';
    }

    function activateVideoJs(entry) {
      if (typeof window.videojs !== 'function') {
        console.error('test-player: video.js не загружен');
        return;
      }
      if (entry.posterUrl) {
        entry.cell.classList.add('video-cell--loading-video');
        syncPosterDisplay(entry);
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
        bindRevealOnPlay(entry, tech);
        playFromResumeTime(entry, tech);
      });
      entry.active = true;
      entry.activeGridKind = 'video';
    }

    function activateCell(entry) {
      if (spotlightEntry === entry) {
        return;
      }
      if (entry.active) {
        void playEntry(entry);
        return;
      }
      if (entry.mode === 'native') {
        activateNative(entry);
      } else {
        activateVideoJs(entry);
      }
    }

    async function deactivateCell(entry) {
      if (spotlightEntry === entry) return;
      if (entry.activeGridKind === 'frames') {
        if (entry._inView) return;
        stopFrameSlideshow(entry);
        return;
      }
      if (!entry.active || entry._deactivating) return;
      entry._deactivating = true;
      const videoEl = entry.video;
      try {
        if (videoEl) saveResumeTime(entry, videoEl);
        const frameUrl = videoEl ? await captureVideoFrameUrl(videoEl) : null;
        if (entry._inView) {
          if (frameUrl) {
            revokePosterUrl(entry);
            entry.posterUrl = frameUrl;
          }
          return;
        }
        if (!entry.active) return;
        if (frameUrl) {
          revokePosterUrl(entry);
          entry.posterUrl = frameUrl;
        }
        disposeCell(entry);
        ensureVideoEl(entry);
        syncPosterDisplay(entry);
        entry.cell.classList.remove('video-cell--loading-video');
      } finally {
        entry._deactivating = false;
      }
    }

    function mediaRoot(entry) {
      return entry.cell.querySelector('.video-cell__media');
    }

    function ensureVideoEl(entry) {
      const media = mediaRoot(entry);
      if (!media) return;
      const poster = posterEl(entry);
      const oldV = media.querySelector('.video-cell__player');
      if (oldV) oldV.remove();
      const v = document.createElement('video');
      v.className = 'video-js vjs-default-skin video-cell__player';
      v.setAttribute('playsinline', '');
      v.preload = 'none';
      media.appendChild(v);
      if (poster && poster.parentNode !== media) {
        media.insertBefore(poster, v);
      }
      entry.video = v;
      entry.player = null;
      entry.active = false;
      entry.activeGridKind = null;
      if (entry.portrait) {
        entry.cell.classList.add('video-cell--portrait');
      }
    }

    function showGridEmpty() {
      const wrap = document.createElement('div');
      wrap.className = pagedScroll ? 'video-grid-page' : 'video-grid-continuous';
      const ul = document.createElement('ul');
      ul.className = 'video-grid';
      const li = document.createElement('li');
      li.className = 'video-grid__empty';
      li.textContent = 'Нет видеофайлов в каталоге.';
      ul.appendChild(li);
      wrap.appendChild(ul);
      gridViewport.appendChild(wrap);
    }

    function removeCellEntry(entry) {
      if (spotlightEntry === entry) {
        closeSpotlight();
      }
      if (observer) {
        observer.unobserve(entry.cell);
      }
      stopFrameSlideshow(entry);
      disposeCell(entry);
      revokePosterUrl(entry);
      entry.cell.remove();
      cells = cells.filter((c) => c !== entry);
      if (cells.length === 0) {
        showGridEmpty();
      }
    }

    async function onDeleteClick(entry, btn) {
      const name =
        (entry.item && entry.item.name) || entry.path || 'этот файл';
      const ok = window.confirm(
        `Удалить «${name}» с диска?\n\nОтменить будет нельзя.`
      );
      if (!ok) return;

      btn.disabled = true;
      try {
        await deleteVideo(entry.path);
        removeCellEntry(entry);
      } catch (e) {
        console.error(e);
        window.alert(
          'Не удалось удалить: ' + (e && e.message ? e.message : e)
        );
        btn.disabled = false;
      }
    }

    function appendCellToGrid(item, ul) {
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
        const deleteBtn = cell.querySelector('.video-cell__delete');
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
          activeGridKind: null,
          portrait: null,
          posterUrl: null,
          frameTimer: null,
          frameTimeSec: 0,
          durationSec: null,
          _deactivating: false,
          _inView: false,
          _scrubbing: false,
          _lastScrubAt: 0,
          _scrubDownX: 0,
          _scrubDownY: 0,
          _scrubDrag: false,
          _suppressSpotlightClick: false,
        };
        cells.push(entry);
        cell.setAttribute('tabindex', '0');
        cell.addEventListener('focusin', () => {
          if (deleteMode) return;
          activateForGrid(entry);
          if (
            tileMode === 'video' &&
            prefersTvPlayback &&
            userPlaybackUnlocked
          ) {
            void playEntry(entry);
          }
        });
        cell.addEventListener('keydown', (ev) => {
          if (deleteMode) return;
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          unlockUserPlayback();
          void openSpotlight(entry);
        });
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onDeleteClick(entry, deleteBtn);
          });
        }
        const media = cell.querySelector('.video-cell__media');
        if (media) {
          bindTileScrub(entry, media);
          media.addEventListener(
            'click',
            (ev) => {
              if (deleteMode) return;
              if (ev.target.closest('.video-cell__delete')) return;
              if (ev.target.closest('.vjs-control-bar')) return;
              if (entry._suppressSpotlightClick) {
                entry._suppressSpotlightClick = false;
                entry._scrubDrag = false;
                ev.preventDefault();
                ev.stopPropagation();
                return;
              }
              ev.preventDefault();
              ev.stopPropagation();
              unlockUserPlayback();
              void openSpotlight(entry);
            },
            true
          );
        }
        ul.appendChild(fragment);
        observer.observe(cell);
    }

    function renderGrid(items) {
      lastGridItems = items;
      disposeAll();
      gridViewport.innerHTML = '';
      syncTileToolbar();

      if (items.length === 0) {
        showGridEmpty();
        return;
      }

      const pageChunks = pagedScroll
        ? chunkItems(items, computeItemsPerPage())
        : [items];

      observer = new IntersectionObserver(
        (entries) => {
          for (const io of entries) {
            const entry = cells.find((c) => c.cell === io.target);
            if (!entry) continue;
            if (io.isIntersecting) {
              entry._inView = true;
              activateForGrid(entry);
            } else {
              entry._inView = false;
              void deactivateCell(entry);
            }
          }
        },
        {
          root: pagedScroll ? gridViewport : null,
          rootMargin: pagedScroll ? '0px' : '200px 0px',
          threshold: 0.01,
        }
      );

      for (const pageItems of pageChunks) {
        const wrap = document.createElement('div');
        wrap.className = pagedScroll
          ? 'video-grid-page'
          : 'video-grid-continuous';
        const ul = document.createElement('ul');
        ul.className = 'video-grid';
        for (const item of pageItems) {
          appendCellToGrid(item, ul);
        }
        wrap.appendChild(ul);
        gridViewport.appendChild(wrap);
      }
    }

    if (tileModeSelect) {
      tileModeSelect.addEventListener('change', () => {
        tileMode =
          tileModeSelect.value === 'frames' ? 'frames' : 'video';
        localStorage.setItem(STORAGE_TILE_MODE, tileMode);
        syncTileToolbar();
        if (lastGridItems.length) {
          renderGrid(lastGridItems);
        }
      });
    }

    if (frameStepSelect) {
      frameStepSelect.addEventListener('change', () => {
        frameStepSec = Math.max(
          5,
          parseInt(frameStepSelect.value, 10) || 60
        );
        localStorage.setItem(STORAGE_FRAME_STEP, String(frameStepSec));
        if (tileMode === 'frames' && lastGridItems.length) {
          renderGrid(lastGridItems);
        }
      });
    }

    if (pageScrollSelect) {
      pageScrollSelect.addEventListener('change', () => {
        pagedScroll = pageScrollSelect.value === 'paged';
        localStorage.setItem(
          STORAGE_PAGE_SCROLL,
          pagedScroll ? 'paged' : 'continuous'
        );
        syncTileToolbar();
        if (lastGridItems.length) {
          renderGrid(lastGridItems);
        }
      });
    }

    window.addEventListener('resize', () => {
      if (!pagedScroll || !lastGridItems.length) return;
      if (resizeRenderTimer) {
        clearTimeout(resizeRenderTimer);
      }
      resizeRenderTimer = window.setTimeout(() => {
        resizeRenderTimer = null;
        renderGrid(lastGridItems);
      }, 250);
    });

    syncTileToolbar();

    async function loadGrid() {
      try {
        const items = await getVideos();
        renderGrid(items);
      } catch (e) {
        console.error(e);
        disposeAll();
        gridViewport.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'video-grid-continuous';
        const ul = document.createElement('ul');
        ul.className = 'video-grid';
        const li = document.createElement('li');
        li.className = 'video-grid__empty';
        li.textContent = 'Не удалось загрузить список.';
        ul.appendChild(li);
        wrap.appendChild(ul);
        gridViewport.appendChild(wrap);
      }
    }

    loadGrid();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
