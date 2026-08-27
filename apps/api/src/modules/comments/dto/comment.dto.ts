import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * «Додати коментар» з ПКМ (FR-8.1). @Згадки (FR-2.17): автодоповнення на
 * фронті вставляє чіп конкретного користувача, тому бек отримує вже готові
 * id, а не парсить ПІБ із тексту — українські імена-омоніми зробили б парсинг
 * за текстом ненадійним. Форматування (tiptap) — не в MVP.
 */
export class CreateCommentDto {
  @ApiProperty({ enum: ['client', 'task'] })
  @IsIn(['client', 'task'])
  entityType!: 'client' | 'task';

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ type: [String], description: 'Id користувачів, згаданих через @ (FR-2.17)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

/**
 * Той самий принцип, що й у ListFilesQueryDto: пряма пара entityType+entityId
 * (коментарі саме цієї задачі) або clientId (усі коментарі клієнта, зокрема
 * лишені під його задачами — Comment.clientId для цього й денормалізовано).
 */
export class ListCommentsQueryDto {
  @ApiPropertyOptional({ enum: ['client', 'task'] })
  @IsOptional()
  @IsIn(['client', 'task'])
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
