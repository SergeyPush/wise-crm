import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSRF_HEADER } from 'shared';
import { ApiRequestError, BASE, api, csrfToken } from '../../lib/api';
import { FileItem } from './types';

export function useFiles(clientId: string) {
  return useQuery({
    queryKey: ['files', 'client', clientId],
    queryFn: () => api.get<FileItem[]>(`/files?clientId=${clientId}`),
  });
}

type UploadFields = { entityType: 'client' | 'task' | 'comment'; entityId: string; categoryId?: string };

/**
 * Multipart через fetch напряму: тонкий JSON-клієнт (`lib/api.ts`) не вміє
 * FormData. Один файл = один запит (FR-F7) — виклик один раз на файл.
 */
async function uploadOne(file: File, fields: UploadFields): Promise<FileItem> {
  const form = new FormData();
  form.set('entityType', fields.entityType);
  form.set('entityId', fields.entityId);
  if (fields.categoryId) form.set('categoryId', fields.categoryId);
  form.set('file', file, file.name);

  const res = await fetch(`${BASE}/files`, {
    method: 'POST',
    credentials: 'include',
    headers: { [CSRF_HEADER]: csrfToken() },
    body: form,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (payload ?? {}) as { code?: string; message?: string; requestId?: string; details?: unknown };
    throw new ApiRequestError(res.status, err.code ?? 'INTERNAL', err.message ?? 'Не вдалося завантажити файл', err.requestId, err.details);
  }
  return payload as FileItem;
}

export function useUploadFiles(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Кожен файл — окремий запит, результати незалежні: один поганий файл
    // не повинен блокувати решту (allSettled, а не all)
    mutationFn: async ({ files, fields }: { files: File[]; fields: UploadFields }) => {
      const results = await Promise.allSettled(files.map((f) => uploadOne(f, fields)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      return { succeeded: results.length - failed.length, failed };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['files', 'client', clientId] }),
  });
}

export function useDeleteFile(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['files', 'client', clientId] }),
  });
}

export function downloadUrl(id: string): string {
  return `${BASE}/files/${id}/download`;
}
