import { HttpException } from '@nestjs/common';
import { ErrorCode } from 'shared';

/**
 * Ошибка с машиночитаемым кодом. Обычный HttpException оставляет фронту
 * только текст сообщения — по нему нельзя ветвить логику (показать «пароль
 * протух», предложить обновить устаревшие данные).
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, status);
  }
}
