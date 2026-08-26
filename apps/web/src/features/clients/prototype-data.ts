/**
 * Фейковые данные кликабельного прототипа (09-implementation-plan.md, этап 1,
 * дни 3–4). Клиентские экраны перешли на настоящий API на этапе 2 —
 * здесь остались только задачи: экран задач переезжает на этапе 3.
 */

export type ProtoTask = {
  id: string;
  title: string;
  type: string;
  client: string;
  assignee: string;
  group: 'Прострочені' | 'Сьогодні' | 'Завтра' | 'Цього тижня';
  done: boolean;
};

export const PROTO_TASKS: ProtoTask[] = [
  { id: 't1', title: 'Подзвонити за заявкою', type: 'Дзвінок', client: 'ФОП · +380 97 555-11-22', assignee: 'Нерозподілена', group: 'Прострочені', done: false },
  { id: 't2', title: 'Передзвонити щодо КП', type: 'Дзвінок', client: 'ФОП Петренко І. В.', assignee: 'Ігор К.', group: 'Сьогодні', done: false },
  { id: 't3', title: 'Надіслати договір на підпис', type: 'Договір', client: 'ТОВ «Ромашка»', assignee: 'Олена П.', group: 'Сьогодні', done: false },
  { id: 't4', title: 'Отримати установчі документи', type: 'Документи', client: 'ТОВ «Ромашка»', assignee: 'Олена П.', group: 'Завтра', done: false },
  { id: 't5', title: 'Зустріч в офісі', type: 'Зустріч', client: 'ТОВ «Будмайстер»', assignee: 'Олена П.', group: 'Цього тижня', done: false },
];
