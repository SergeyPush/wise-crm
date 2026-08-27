import { Button, Loader, Select, Stack, Textarea } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

function TextareaForm({
  modalId,
  label,
  submitLabel,
  requireValue,
  onSubmit,
}: {
  modalId: string;
  label: string;
  submitLabel: string;
  requireValue: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const error = requireValue && touched && !value.trim() ? "Це поле обов'язкове" : null;

  return (
    <Stack gap="sm">
      <Textarea
        label={label}
        autosize
        minRows={3}
        data-autofocus
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={() => setTouched(true)}
        error={error}
      />
      <Button
        onClick={() => {
          if (requireValue && !value.trim()) {
            setTouched(true);
            return;
          }
          onSubmit(value.trim());
          modals.close(modalId);
        }}
      >
        {submitLabel}
      </Button>
    </Stack>
  );
}

/** «Зафіксувати контакт» з ПКМ (FR-2.2.1, FR-8.1) — доступно з будь-якого рядка, не лише з картки. */
export function openContactLogModal(onSubmit: (result: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({
    modalId: id,
    title: 'Зафіксувати контакт',
    children: <TextareaForm modalId={id} label="Результат розмови" submitLabel="Зафіксувати" requireValue onSubmit={onSubmit} />,
  });
}

/** «Додати коментар» з ПКМ (FR-8.1). */
export function openAddCommentModal(onSubmit: (body: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({
    modalId: id,
    title: 'Додати коментар',
    children: <TextareaForm modalId={id} label="Коментар" submitLabel="Додати" requireValue onSubmit={onSubmit} />,
  });
}

function ReasonForm({ modalId, onSubmit }: { modalId: string; onSubmit: (reasonId: string, comment?: string) => void }) {
  const reasons = useQuery({
    queryKey: ['dictionaries', 'lost-reasons'],
    queryFn: () => api.get<Array<{ id: string; label: string }>>('/dictionaries/lost-reasons'),
  });
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);

  if (reasons.isLoading) return <Loader />;

  return (
    <Stack gap="sm">
      <Select
        label="Причина"
        placeholder="Оберіть причину"
        data={reasons.data?.map((r) => ({ value: r.id, label: r.label })) ?? []}
        value={reasonId}
        onChange={setReasonId}
        error={touched && !reasonId ? "Причина обов'язкова для цього статусу" : null}
        data-autofocus
      />
      <Textarea label="Коментар (необов'язково)" autosize minRows={2} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
      <Button
        onClick={() => {
          if (!reasonId) {
            setTouched(true);
            return;
          }
          onSubmit(reasonId, comment.trim() || undefined);
          modals.close(modalId);
        }}
      >
        Змінити статус
      </Button>
    </Stack>
  );
}

/** Для статусів з requiresReason (FR-2.8) — інакше зміна статусу оптимістична й миттєва. */
export function openStatusReasonModal(onSubmit: (reasonId: string, comment?: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({ modalId: id, title: 'Вкажіть причину', children: <ReasonForm modalId={id} onSubmit={onSubmit} /> });
}
