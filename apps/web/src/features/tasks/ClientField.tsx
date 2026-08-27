import { Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Paginated } from 'shared';
import { api } from '../../lib/api';

export type ClientOption = { id: string; displayName: string };

/**
 * Пошук клієнта за назвою/телефоном (той самий `GET /clients?q=`, що й у
 * GlobalSearch) — винесено з `TaskCardPage.tsx` (форма редагування задачі),
 * бо той самий пошук потрібен і в повній формі створення (backlog 27.08.2026).
 */
export function ClientField({ client, onChange }: { client: ClientOption | null; onChange: (client: ClientOption | null) => void }) {
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['clients', 'picker', search],
    queryFn: () => api.get<Paginated<ClientOption>>(`/clients?limit=10&q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2,
  });

  const options = new Map<string, string>();
  if (client) options.set(client.id, client.displayName);
  for (const c of query.data?.items ?? []) options.set(c.id, c.displayName);

  return (
    <Select
      label="Клієнт"
      placeholder="Пошук за назвою, телефоном…"
      searchable
      clearable
      searchValue={search}
      onSearchChange={setSearch}
      data={[...options.entries()].map(([value, label]) => ({ value, label }))}
      value={client?.id ?? null}
      onChange={(id) => onChange(id ? { id, displayName: options.get(id) ?? '' } : null)}
      nothingFoundMessage={search.length < 2 ? 'Введіть мінімум 2 символи' : query.isFetching ? 'Пошук…' : 'Нічого не знайдено'}
    />
  );
}
