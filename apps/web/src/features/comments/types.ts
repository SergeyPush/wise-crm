/** Форма відповіді GET/POST /comments (apps/api/src/modules/comments). */
export type CommentItem = {
  id: string;
  entityType: string;
  entityId: string;
  clientId: string | null;
  taskId: string | null;
  authorId: string | null;
  author: { id: string; fullName: string } | null; // null — системний коментар (заявка з сайту)
  body: string;
  mentions: string[];
  createdAt: string;
};

export type UserLite = { id: string; fullName: string };
