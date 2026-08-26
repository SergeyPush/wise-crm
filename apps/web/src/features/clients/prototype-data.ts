/**
 * Фейковые данные кликабельного прототипа (09-implementation-plan.md, этап 1,
 * дни 3–4). Прототип показывается менеджеру до написания бизнес-логики:
 * правки компоновки здесь стоят часы, после написания логики — недели.
 *
 * Файл удаляется на этапе 2, когда экраны переходят на настоящий API.
 */

export type ProtoClient = {
  id: string;
  displayName: string;
  type: 'ТОВ' | 'ФОП' | 'Фізособа';
  status: { label: string; color: string };
  taxSystem: string;
  assignee: string;
  phone: string;
  nextTask: string | null;
  lastActivity: string;
};

export const PROTO_CLIENTS: ProtoClient[] = [
  {
    id: 'a1',
    displayName: 'ТОВ «Ромашка»',
    type: 'ТОВ',
    status: { label: 'Договір підписано', color: 'green' },
    taxSystem: 'ЄП 3 гр. 5%',
    assignee: 'Олена П.',
    phone: '+380 67 123-45-67',
    nextTask: 'Отримати установчі документи — завтра',
    lastActivity: 'сьогодні, 11:20',
  },
  {
    id: 'a2',
    displayName: 'ФОП Петренко І. В.',
    type: 'ФОП',
    status: { label: 'КП надіслано', color: 'indigo' },
    taxSystem: 'ЄП 2 гр.',
    assignee: 'Ігор К.',
    phone: '+380 63 740-35-99',
    nextTask: 'Передзвонити щодо КП — сьогодні',
    lastActivity: 'вчора, 16:04',
  },
  {
    id: 'a3',
    displayName: 'ТОВ «Будмайстер»',
    type: 'ТОВ',
    status: { label: 'Переговори', color: 'blue' },
    taxSystem: 'Загальна, платник ПДВ',
    assignee: 'Олена П.',
    phone: '+380 50 987-65-43',
    nextTask: 'Зустріч в офісі — п’ятниця',
    lastActivity: '2 дні тому',
  },
  {
    id: 'a4',
    displayName: 'ФОП · +380 97 555-11-22',
    type: 'ФОП',
    status: { label: 'Лід', color: 'gray' },
    taxSystem: '—',
    assignee: 'Нерозподілений',
    phone: '+380 97 555-11-22',
    nextTask: 'Подзвонити за заявкою — сьогодні',
    lastActivity: 'сьогодні, 09:12',
  },
  {
    id: 'a5',
    displayName: 'ТОВ «Світанок»',
    type: 'ТОВ',
    status: { label: 'Відмова', color: 'red' },
    taxSystem: 'ЄП 3 гр. 3% + ПДВ',
    assignee: 'Ігор К.',
    phone: '+380 44 222-33-44',
    nextTask: null,
    lastActivity: 'тиждень тому',
  },
];

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
