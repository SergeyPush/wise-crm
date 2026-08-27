import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

/**
 * Тост «Готово» + кнопка «Скасувати» на 5 секунд (FR-8.8). Запит на сервер
 * уже пішов до виклику цієї функції (оптимістичний UI) — «Скасувати»
 * відправляє звичайний повторний виклик мутації зі старим значенням, а не
 * скасовує вже надісланий запит: два записи в аудиті — очікувана поведінка (FR-7.3).
 */
export function notifyUndo(opts: { message: string; onUndo: () => void }): void {
  const id = crypto.randomUUID();
  notifications.show({
    id,
    color: 'green',
    autoClose: 5000,
    withCloseButton: true,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{opts.message}</Text>
        <Button
          size="xs"
          variant="white"
          onClick={() => {
            notifications.hide(id);
            opts.onUndo();
          }}
        >
          Скасувати
        </Button>
      </Group>
    ),
  });
}
