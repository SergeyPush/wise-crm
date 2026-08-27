import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Поля multipart-запиту (FR-F1) — приходять рядками, тому boolean розбирається
 * вручну: enableImplicitConversion тут не рятує, Boolean('false') === true.
 */
export class UploadFileFieldsDto {
  @IsIn(['client', 'task', 'comment'])
  entityType!: 'client' | 'task' | 'comment';

  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  period?: string;
}

export class ListFilesQueryDto {
  @ApiPropertyOptional({ enum: ['client', 'task', 'comment'] })
  @IsOptional()
  @IsIn(['client', 'task', 'comment'])
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: "Документи клієнта незалежно від того, до якої задачі прикріплені (FR-F2)" })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Пошук за оригінальним іменем файлу (FR-F5)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
