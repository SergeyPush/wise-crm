/** Форма відповіді files-ендпоінтів (apps/api/src/modules/files). */
export type FileItem = {
  id: string;
  entityType: string;
  entityId: string;
  clientId: string | null;
  categoryId: string | null;
  category: { id: string; code: string; label: string } | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  period: string | null;
  isPinned: boolean;
  version: number;
  uploadedById: string;
  uploadedBy: { id: string; fullName: string };
  createdAt: string;
};

export type DocumentCategoryEntry = { id: string; code: string; label: string };
