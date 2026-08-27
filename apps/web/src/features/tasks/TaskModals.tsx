import { Button, Stack, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { useState } from 'react';

/** FR-3.5: результат обов'язковий для ДЗВІНОК/КП/ДОГОВІР — порожній не приймається. */
function CompleteResultForm({ modalId, onSubmit }: { modalId: string; onSubmit: (result: string) => void }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched && !value.trim() ? "Вкажіть результат — інакше історія контактів марна" : null;

  return (
    <Stack gap="sm">
      <Textarea
        label="Результат"
        placeholder="Що зʼясували, домовленості, наступний крок"
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
          if (!value.trim()) {
            setTouched(true);
            return;
          }
          onSubmit(value.trim());
          modals.close(modalId);
        }}
      >
        Завершити
      </Button>
    </Stack>
  );
}

/** Опційний результат для решти типів (ДОКУМЕНТИ/ЗУСТРІЧ/ІНШЕ) — той самий UX, без валідації. */
function CompleteOptionalForm({ modalId, onSubmit }: { modalId: string; onSubmit: (result?: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Stack gap="sm">
      <Textarea
        label="Результат (необов'язково)"
        autosize
        minRows={2}
        data-autofocus
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          onSubmit(value.trim() || undefined);
          modals.close(modalId);
        }}
      >
        Завершити
      </Button>
    </Stack>
  );
}

function CancelReasonForm({ modalId, onSubmit }: { modalId: string; onSubmit: (reason: string) => void }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched && !value.trim() ? 'Вкажіть причину скасування' : null;

  return (
    <Stack gap="sm">
      <Textarea
        label="Причина скасування"
        autosize
        minRows={2}
        data-autofocus
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={() => setTouched(true)}
        error={error}
      />
      <Button
        color="red"
        onClick={() => {
          if (!value.trim()) {
            setTouched(true);
            return;
          }
          onSubmit(value.trim());
          modals.close(modalId);
        }}
      >
        Скасувати задачу
      </Button>
    </Stack>
  );
}

function CustomDateForm({ modalId, onSubmit }: { modalId: string; onSubmit: (date: string) => void }) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <Stack gap="sm">
      <DateInput label="Нова дата" placeholder="Оберіть дату" valueFormat="DD.MM.YYYY" data-autofocus value={value} onChange={setValue} />
      <Button
        disabled={!value}
        onClick={() => {
          if (!value) return;
          onSubmit(value);
          modals.close(modalId);
        }}
      >
        Перенести
      </Button>
    </Stack>
  );
}

export function openCustomSnoozeModal(onSubmit: (date: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({ modalId: id, title: 'Перенести на дату', children: <CustomDateForm modalId={id} onSubmit={onSubmit} /> });
}

/** Результат обов'язковий лише для ДЗВІНОК/КП/ДОГОВІР — той самий список, що й на бекенді (FR-3.5). */
const TYPES_REQUIRING_RESULT = new Set(['CALL', 'PROPOSAL', 'CONTRACT']);

export function openCompleteTaskModal(taskType: string, onSubmit: (result?: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({
    modalId: id,
    title: 'Завершити задачу',
    children: TYPES_REQUIRING_RESULT.has(taskType) ? (
      <CompleteResultForm modalId={id} onSubmit={onSubmit} />
    ) : (
      <CompleteOptionalForm modalId={id} onSubmit={onSubmit} />
    ),
  });
}

export function openCancelTaskModal(onSubmit: (reason: string) => void): void {
  const id = crypto.randomUUID();
  modals.open({ modalId: id, title: 'Скасувати задачу', children: <CancelReasonForm modalId={id} onSubmit={onSubmit} /> });
}
