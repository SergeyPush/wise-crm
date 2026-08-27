import { Avatar, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError, api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { useMe } from '../auth/useAuth';
import { useComments, useCreateComment, CommentScope } from './api';
import { MentionTextarea } from './MentionTextarea';
import { CommentItem, UserLite } from './types';
import { useQuery } from '@tanstack/react-query';

type EntityTarget = { entityType: 'client' | 'task'; entityId: string };

/** «Коментарі» на картці клієнта і на картці задачі (FR-8.1, FR-2.17) — за
 * зразком FilesPanel: зона вводу зверху, стрічка знизу. */
export function CommentsPanel({ scope, target }: { scope: CommentScope; target: EntityTarget }) {
  const query = useComments(scope);
  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<UserLite[]>('/users/lite'),
    staleTime: 60_000,
  });
  const create = useCreateComment(scope);

  const [body, setBody] = useState('');
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    create.mutate(
      { ...target, body: text, mentionedUserIds: mentionedIds },
      {
        onSuccess: () => {
          setBody('');
          setMentionedIds([]);
        },
      },
    );
  };

  return (
    <Stack gap="sm">
      <Stack gap={4}>
        <MentionTextarea
          value={body}
          onChange={setBody}
          mentionedIds={mentionedIds}
          onMentionedIdsChange={setMentionedIds}
          users={users.data ?? []}
          placeholder="Написати коментар… @ — згадати колегу"
          disabled={create.isPending}
        />
        <Group justify="flex-end">
          <Button size="xs" onClick={submit} loading={create.isPending} disabled={!body.trim()}>
            Надіслати
          </Button>
        </Group>
      </Stack>

      {query.isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити коментарі'}
          requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
          onRetry={() => query.refetch()}
        />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState title="Коментарів ще немає" description="Напишіть перший коментар вище" />
      ) : (
        <Stack gap="xs">
          {query.data.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CommentRow({ comment }: { comment: CommentItem }) {
  const { data: me } = useMe();
  const isMine = !!me && comment.authorId === me.id;
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="xs" mb={4}>
        <Avatar size={24} radius="xl" color={isMine ? 'blue' : 'gray'}>
          {(comment.author?.fullName ?? 'С').slice(0, 1)}
        </Avatar>
        <Text size="sm" fw={500}>
          {comment.author?.fullName ?? 'Система'}
        </Text>
        <Text size="xs" c="dimmed">
          {formatRelative(comment.createdAt)}
        </Text>
      </Group>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {comment.body}
      </Text>
    </Paper>
  );
}
