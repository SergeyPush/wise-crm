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
