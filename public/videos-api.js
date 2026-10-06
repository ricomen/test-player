/** Общий промис списка видео — один HTTP-запрос на страницу. */

let promise = null;

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
