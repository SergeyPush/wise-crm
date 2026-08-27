// Спільне число для реєстрації @fastify/multipart (main.ts, test/helpers/app.ts)
// і перевірки в сервісі — щоб межа не розповзлася на два місця.
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // FR-F7: 25 МБ на файл

// FR-F7: «загальна квота на клієнта — лічильник, м'яке попередження адміну».
export const CLIENT_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 ГБ
