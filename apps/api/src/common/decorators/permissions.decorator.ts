import { SetMetadata } from '@nestjs/common';
import { Permission } from 'shared';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Право на эндпоинте — обязательная защита (NFR-17). Скрытие кнопки во фронте
 * по той же матрице — это UX, а не ограничение доступа.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
