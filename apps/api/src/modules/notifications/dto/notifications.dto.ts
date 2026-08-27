import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/** FR-4.1: polling раз на 60 с — `since` тягне лише те, що з'явилось після попереднього запиту. */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'ISO-момент попереднього опитування' })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
