/** Общий промис списка видео — один HTTP-запрос на страницу. */

let promise = null;

export function invalidateVideosList() {
  promise = null;
}

export function deleteVideo(relPath) {
  return fetch('/api/video?p=' + encodeURIComponent(relPath), {
    method: 'DELETE',
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    invalidateVideosList();
    window.dispatchEvent(
      new CustomEvent('videos-changed', {
        detail: { action: 'delete', path: relPath },
      })
    );
    return body;
  });
}

export function getVideos() {
  if (!promise) {
    promise = fetch('/api/videos')
      .then(async (res) => {
        if (!res.ok) throw new Error('Ошибка ответа');
        const data = await res.json();
        if (!Array.isArray(data)) {
          console.warn(
            'test-player: /api/videos вернул не массив, список сброшен'
          );
          return [];
        }
        return data;
      })
      .catch((err) => {
        promise = null;
        throw err;
      });
  }
  return promise;
}
