import { ActionIcon, Anchor, Badge, Group, Loader, Paper, Select, Stack, Text } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { IconDownload, IconFile, IconTrash, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { can } from 'shared';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError, api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { useMe } from '../auth/useAuth';
import { downloadUrl, useDeleteFile, useFiles, useUploadFiles } from './api';
import { DocumentCategoryEntry, FileItem } from './types';

/** «Документи» на картці клієнта (FR-F1–F15) — drag-n-drop, категорія, версії, видалення. */
export function FilesPanel({ clientId }: { clientId: string }) {
  const { data: me } = useMe();
  const query = useFiles(clientId);
  const categories = useQuery({
    queryKey: ['dictionaries', 'document-categories'],
    queryFn: () => api.get<DocumentCategoryEntry[]>('/dictionaries/document-categories'),
  });
  const upload = useUploadFiles(clientId);
  const remove = useDeleteFile(clientId);

  const handleDrop = (files: File[], categoryId?: string) => {
    upload.mutate(
      { files, fields: { entityType: 'client', entityId: clientId, categoryId } },
      {
        onSuccess: ({ succeeded, failed }) => {
          const firstFailure = failed[0];
          if (firstFailure) {
            notifications.show({
              color: 'red',
              message: `Завантажено ${succeeded} з ${files.length}. Помилка: ${
                firstFailure.reason instanceof ApiRequestError ? firstFailure.reason.message : 'файл відхилено'
              }`,
            });
          } else {
            notifications.show({ color: 'green', message: `Завантажено файлів: ${succeeded}` });
          }
        },
      },
    );
  };

  return (
    <Stack gap="sm">
      <UploadZone categories={categories.data ?? []} loading={upload.isPending} onDrop={handleDrop} />

      {query.isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити документи'}
          requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
          onRetry={() => query.refetch()}
        />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState title="Документів ще немає" description="Перетягніть файли у зону вище або натисніть на неї" />
      ) : (
        <Paper withBorder radius="md">
          {query.data.map((file, index) => (
            <FileRow
              key={file.id}
              file={file}
              divider={index > 0}
              canDelete={
                !!me &&
                can(me.role, 'file:delete', {
                  isOwner: file.uploadedById === me.id,
                  ageHours: (Date.now() - new Date(file.createdAt).getTime()) / 3_600_000,
                })
              }
              onDelete={() => remove.mutate(file.id)}
            />
          ))}
        </Paper>
      )}
    </Stack>
  );
}

function UploadZone({
  categories,
  loading,
  onDrop,
}: {
  categories: DocumentCategoryEntry[];
  loading: boolean;
  onDrop: (files: File[], categoryId?: string) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  return (
    <Stack gap="xs">
      {categories.length > 0 && (
        <Select
          label="Категорія для нових файлів"
          placeholder="Без категорії"
          clearable
          data={categories.map((c) => ({ value: c.id, label: c.label }))}
          value={categoryId}
          onChange={setCategoryId}
          maw={280}
        />
      )}
      <Dropzone
        onDrop={(files) => onDrop(files, categoryId ?? undefined)}
        // maxSize відхиляє файл ще до onDrop — без цього обробника відхилення
        // проходить мовчки, і користувач не розуміє, чому файл не з'явився
        onReject={(rejections) =>
          notifications.show({
            color: 'red',
            message: `Файл «${rejections[0]?.file.name}» не завантажено: більший за 25 МБ`,
          })
        }
        loading={loading}
        maxSize={25 * 1024 * 1024}
      >
        <Group justify="center" gap="xs" py="md" style={{ pointerEvents: 'none' }}>
          <IconUpload size={24} />
          <Text size="sm" c="dimmed">
            Перетягніть файли сюди або натисніть, щоб обрати. До 25 МБ.
          </Text>
        </Group>
      </Dropzone>
    </Stack>
  );
}

function FileRow({
  file,
  divider,
  canDelete,
  onDelete,
}: {
  file: FileItem;
  divider: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <Group
      p="sm"
      justify="space-between"
      wrap="nowrap"
      style={{ borderTop: divider ? '1px solid var(--mantine-color-gray-2)' : undefined }}
    >
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <IconFile size={20} />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Anchor href={downloadUrl(file.id)} target="_blank" rel="noopener" size="sm" truncate>
            {file.originalName}
          </Anchor>
          <Text size="xs" c="dimmed">
            {file.uploadedBy.fullName} · {formatRelative(file.createdAt)} · {formatSize(file.sizeBytes)}
            {file.version > 1 ? ` · версія ${file.version}` : ''}
          </Text>
        </Stack>
      </Group>
      <Group gap="xs" wrap="nowrap">
        {file.category && (
          <Badge size="sm" variant="light">
            {file.category.label}
          </Badge>
        )}
        <ActionIcon component="a" href={downloadUrl(file.id)} target="_blank" rel="noopener" variant="subtle" color="gray">
          <IconDownload size={16} />
        </ActionIcon>
        {canDelete && (
          <ActionIcon variant="subtle" color="red" onClick={onDelete}>
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
    </Group>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
