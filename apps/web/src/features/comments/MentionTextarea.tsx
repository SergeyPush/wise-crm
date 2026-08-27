import { Paper, ScrollArea, Stack, Text, Textarea, UnstyledButton } from '@mantine/core';
import { useRef, useState } from 'react';
import { UserLite } from './types';

/**
 * @Згадки (FR-2.17): «@» + текст запускає підказку з активних співробітників
 * (/users/lite), вибір вставляє готове ПІБ у текст і додає id в mentionedIds —
 * бек отримує вже готові id, а не парсить текст (див. коментар у comment.dto.ts).
 * Не tiptap і не бібліотека — простий трекінг курсору над звичайним textarea,
 * свідомо без позиціювання підказки біля курсору (не в MVP).
 */
export function MentionTextarea({
  value,
  onChange,
  mentionedIds,
  onMentionedIdsChange,
  users,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  mentionedIds: string[];
  onMentionedIdsChange: (ids: string[]) => void;
  users: UserLite[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null); // null — підказка закрита
  const [mentionStart, setMentionStart] = useState(0);

  const updateMentionState = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      const q = match[1] ?? '';
      setQuery(q);
      setMentionStart(cursor - q.length - 1);
    } else {
      setQuery(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.currentTarget.value);
    updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart);
  };

  const pick = (user: UserLite) => {
    const cursor = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, mentionStart)}@${user.fullName} ${value.slice(cursor)}`;
    onChange(next);
    if (!mentionedIds.includes(user.id)) onMentionedIdsChange([...mentionedIds, user.id]);
    setQuery(null);
    // Курсор — одразу після вставленого імені; без setTimeout React ще не
    // встиг перемалювати textarea з новим value, і виставлення злетить.
    const caret = mentionStart + user.fullName.length + 2;
    setTimeout(() => ref.current?.setSelectionRange(caret, caret), 0);
  };

  const filtered =
    query === null ? [] : users.filter((u) => u.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div style={{ position: 'relative' }}>
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyUp={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
        onClick={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)} // затримка — щоб встиг спрацювати onMouseDown підказки
        placeholder={placeholder}
        disabled={disabled}
        autosize
        minRows={2}
        maxRows={8}
      />
      {query !== null && filtered.length > 0 && (
        <Paper withBorder shadow="md" p={4} style={{ position: 'absolute', zIndex: 200, top: '100%', left: 0, right: 0 }}>
          <ScrollArea.Autosize mah={180}>
            <Stack gap={0}>
              {filtered.map((u) => (
                <UnstyledButton
                  key={u.id}
                  onMouseDown={(e) => {
                    e.preventDefault(); // не дати textarea втратити фокус до onClick
                    pick(u);
                  }}
                  px="xs"
                  py={6}
                  style={{ borderRadius: 4 }}
                >
                  <Text size="sm">{u.fullName}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
      )}
    </div>
  );
}
