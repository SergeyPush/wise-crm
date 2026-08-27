import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** «Додати коментар» з ПКМ (FR-8.1). @згадки і форматування — етап 4 (FR-2.17, tiptap). */
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
}
