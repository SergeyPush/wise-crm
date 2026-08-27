import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CommentItem } from './types';

/** Той самий принцип, що й FileScope (features/files/api.ts): clientId бачить
 * усі коментарі клієнта, зокрема лишені під його задачами. */
export type CommentScope = { clientId: string } | { entityType: 'task'; entityId: string };

function scopeKey(scope: CommentScope): string {
  return 'clientId' in scope ? `client:${scope.clientId}` : `${scope.entityType}:${scope.entityId}`;
}

function scopeQuery(scope: CommentScope): string {
  return 'clientId' in scope ? `clientId=${scope.clientId}` : `entityType=${scope.entityType}&entityId=${scope.entityId}`;
}

export function useComments(scope: CommentScope) {
  return useQuery({
    queryKey: ['comments', scopeKey(scope)],
    queryFn: () => api.get<CommentItem[]>(`/comments?${scopeQuery(scope)}`),
  });
}

type CreateFields = { entityType: 'client' | 'task'; entityId: string; body: string; mentionedUserIds?: string[] };

export function useCreateComment(scope: CommentScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: CreateFields) => api.post<CommentItem>('/comments', fields),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comments', scopeKey(scope)] });
      // Коментар до клієнта (прямий чи через задачу) одразу пише подію в
      // activity_events — стрічка на вкладці «Активність» має її підхопити.
      if ('clientId' in scope) {
        void qc.invalidateQueries({ queryKey: ['clients', scope.clientId, 'activity'] });
      }
    },
  });
}
