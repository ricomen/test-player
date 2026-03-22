(function () {
  function itemPath(item) {
    if (!item || typeof item !== 'object') return null;
    const p = item.path;
    return typeof p === 'string' && p.length > 0 ? p : null;
  }

  function init() {
    const listEl = document.getElementById('list');
    const gridEl = document.getElementById('videoGrid');
    const player = document.getElementById('player');
    const nowPlayingEl = document.getElementById('nowPlaying');
    const cellTpl = document.getElementById('video-cell-tpl');

    let items = [];
    let activePath = null;

    function streamUrl(relPath) {
      return '/api/video?p=' + encodeURIComponent(relPath);
    }

    function play(item) {
      const p = itemPath(item);
      if (!p || !player || !nowPlayingEl || !listEl) return;
      activePath = p;
      const url = streamUrl(p);
      if (player.getAttribute('src') !== url) {
        player.src = url;
      }
      player.play().catch(() => {});
      nowPlayingEl.textContent = p;
      renderList();
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'video-list__empty';
        li.textContent = 'Нет видеофайлов в каталоге.';
        listEl.appendChild(li);
        return;
      }

      items.forEach((item) => {
        const p = itemPath(item);
        if (!p) return;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'video-item';
        if (p === activePath) {
          btn.classList.add('video-item--active');
        }
        btn.textContent = p;
        btn.addEventListener('click', () => play(item));
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    }

    function renderGrid() {
      if (!gridEl || !cellTpl) return;
      gridEl.innerHTML = '';
      if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'video-grid__empty';
        li.textContent = 'Нет видеофайлов в каталоге.';
        gridEl.appendChild(li);
        return;
      }

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

        v.src = streamUrl(p);
        v.autoplay = true;
        v.loop = true;
        v.muted = true;
        v.playsinline = true;
        v.preload = 'metadata';
        v.controls = false;
        v.poster = '';
        // v.style.width = '100%';
        // v.style.height = '100%';
        gridEl.appendChild(fragment);
      });
    }

    async function load() {
      try {
        const res = await fetch('/api/videos');
        if (!res.ok) throw new Error('Ошибка ответа');
        const data = await res.json();
        items = Array.isArray(data) ? data : [];
        if (!Array.isArray(data)) {
          console.warn('test-player: /api/videos вернул не массив, список сброшен');
        }
        // setStatus(items.length ? `${items.length} файл(ов)` : 'Каталог пуст');
        renderList();
        renderGrid();
        if (items.length && !activePath) {
          const first = items.find((x) => itemPath(x));
          if (first) play(first);
        }
      } catch (e) {
        console.error(e);
        // setStatus('Не удалось загрузить список', true);
      }
    }

    // player.addEventListener('ended', () => {
    //   const i = items.findIndex((x) => itemPath(x) === activePath);
    //   if (i < 0 || i >= items.length - 1) return;
    //   let next = null;
    //   for (let j = i + 1; j < items.length; j += 1) {
    //     if (itemPath(items[j])) {
    //       next = items[j];
    //       break;
    //     }
    //   }
    //   if (next) play(next);
    // });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
