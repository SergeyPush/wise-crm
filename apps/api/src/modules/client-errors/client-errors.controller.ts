import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ClientErrorDto } from './dto/client-error.dto';

/**
 * NFR-32.2: помилка фронтенда (наприклад, зловлена React error boundary)
 * потрапляє в логи так само, як 5xx на бекенді (`AllExceptionsFilter`) —
 * шукається тим самим інструментом, окремого сховища не заводимо.
 *
 * `@Public()`: помилка може статись і до логіну (наприклад, на екрані входу),
 * тому авторизація тут — зайва умова, яка тільки заглушить репорт.
 */
@ApiExcludeController()
@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('ClientError');

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  report(@Body() body: ClientErrorDto): void {
    this.logger.warn(
      { url: body.url, stack: body.stack, componentStack: body.componentStack, userAgent: body.userAgent },
      body.message,
    );
  }
}
