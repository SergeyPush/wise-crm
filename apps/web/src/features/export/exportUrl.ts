import { BASE } from '../../lib/api';

/**
 * Кнопки експорту (беклог: «бекенд готовий, немає кнопки на фронті») —
 * GET-посилання, а не fetch+blob: сесія в httpOnly cookie (як і для
 * /files/:id/download, features/files/api.ts), браузер сам качає файл
 * за Content-Disposition: attachment із бекенда.
 *
 * Право export:run з 01.09.2026 має лише ADMIN (packages/shared/permissions.ts) —
 * кнопки ставляться під useCan(me)('export:run'), сервер все одно перевірить 403.
 */
function qs(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Набір полів = ExportClientsQueryDto (apps/api/.../export/dto/export.dto.ts):
// deleted/page/limit там немає, тому «Архів» кнопку не показує (ClientsPage).
export function exportClientsUrl(params: { q?: string; assigneeId?: string; stage?: string }): string {
  return `${BASE}/export/clients.xlsx${qs(params)}`;
}

// ExportTasksQueryDto.status приймає лише одне значення (не CSV-список, як
// у GET /tasks) — навмисно не намагаємось повторити групування «Всі/Завершені»
// звідси, лише відповідальний.
export function exportTasksUrl(params: { assigneeId?: string }): string {
  return `${BASE}/export/tasks.xlsx${qs(params)}`;
}
