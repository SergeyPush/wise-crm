import { createTheme } from '@mantine/core';

/**
 * Весь «брендинг» — 20 строк (06-ui-layout.md). Mantine и есть дизайн-система:
 * строить свою поверх для десяти внутренних пользователей — недели с нулевой отдачей.
 * Тёмная тема — v1.1: бейджи статусов берут цвет из справочника, и контраст
 * пришлось бы проверять на каждом экране в обеих схемах.
 */
export const theme = createTheme({
  primaryColor: 'brand',
  colors: {
    // Акцент с wisexpert.com.ua; уточняется при подключении реальной палитры
    brand: [
      '#e7f5ff',
      '#d0ebff',
      '#a5d8ff',
      '#74c0fc',
      '#4dabf7',
      '#339af0',
      '#228be6',
      '#1c7ed6',
      '#1971c2',
      '#1864ab',
    ],
  },
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  headings: { fontWeight: '600' },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
    PasswordInput: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Modal: { defaultProps: { centered: true } },
  },
});
