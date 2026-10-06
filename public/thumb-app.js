import { getVideos } from './videos-api.js';

function thumbUrl(relPath) {
  return '/api/thumbnail?p=' + encodeURIComponent(relPath);
}

function setStatus(el, text, isError) {
  el.textContent = text;
  el.classList.toggle('thumb-section__status--error', Boolean(isError));
}

async function fillVideoSelect(selectEl, statusEl) {
  try {
    const items = await getVideos();
    selectEl.innerHTML = '';
    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Нет видео';
      selectEl.appendChild(opt);
      selectEl.disabled = true;
      return;
    }
    items.forEach((item) => {
      const p = item && typeof item.path === 'string' ? item.path : '';
      if (!p) return;
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus(statusEl, 'Не удалось загрузить список видео.', true);
  }
}

let previewObjectUrl = null;

async function main() {
  const statusEl = document.getElementById('thumbStatus');
  const thumbBtn = document.getElementById('thumbBtn');
  const selectEl = document.getElementById('thumbVideoSelect');
  const previewWrap = document.getElementById('thumbPreviewWrap');
  const previewImg = document.getElementById('thumbPreviewImg');

  if (!statusEl || !thumbBtn || !selectEl || !previewWrap || !previewImg) {
    return;
  }

  await fillVideoSelect(selectEl, statusEl);
  thumbBtn.disabled = selectEl.disabled || !selectEl.value;

  selectEl.addEventListener('change', () => {
    thumbBtn.disabled = !selectEl.value;
  });

  thumbBtn.addEventListener('click', async () => {
    const rel = selectEl.value;
    if (!rel) return;

    thumbBtn.disabled = true;
    setStatus(statusEl, 'Извлечение кадра…');

    try {
      const res = await fetch(thumbUrl(rel));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ||
            (res.status === 503
              ? 'ffmpeg не установлен на сервере'
              : `HTTP ${res.status}`)
        );
      }
      const blob = await res.blob();
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
      previewObjectUrl = URL.createObjectURL(blob);
      previewImg.src = previewObjectUrl;
      previewWrap.hidden = false;
      setStatus(statusEl, 'Готово.');
    } catch (e) {
      console.error(e);
      setStatus(
        statusEl,
        'Ошибка: ' + (e && e.message ? e.message : e),
        true
      );
    } finally {
      thumbBtn.disabled = !selectEl.value;
    }
  });
}

main();
