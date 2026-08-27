import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Priority, SNOOZE_PRESETS, SnoozePreset, TaskType } from 'shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Список статусів через кому в query (?status=OPEN,IN_PROGRESS) — простіше окремого DTO-масиву. */
const STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

export class ListTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'uuid, "me" — поточний користувач, "none" — пул' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskType) })
  @IsOptional()
  @IsIn(Object.values(TaskType))
  type?: TaskType;

  @ApiPropertyOptional({ description: 'Один або декілька через кому: OPEN,IN_PROGRESS' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'dueAt <= це значення (прострочені + сьогоднішні — бейдж у сайдбарі)' })
  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  /** Розбір status="OPEN,IN_PROGRESS" з валідацією значень — щоб сміття в query не впало у where мовчки. */
  parsedStatuses(): string[] | undefined {
    if (!this.status) return undefined;
    const values = this.status.split(',').map((s) => s.trim());
    const invalid = values.filter((v) => !STATUS_VALUES.includes(v));
    if (invalid.length) return undefined;
    return values;
  }
}

/** Швидке додавання («Що зробити? ⏎») і повна форма — одне DTO, решта полів опціональні. */
export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Вкажіть заголовок' })
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskType), default: 'OTHER' })
  @IsOptional()
  @IsIn(Object.values(TaskType))
  type?: TaskType;

  @ApiPropertyOptional({ enum: Object.values(Priority), default: 'NORMAL' })
  @IsOptional()
  @IsIn(Object.values(Priority))
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'За замовчуванням — поточний користувач; null — у пул' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: 'За замовчуванням — кінець сьогоднішнього дня по Києву' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateTaskDto {
  @ApiProperty({ description: 'Для оптимістичної конкурентності (NFR-46)' })
  @IsDateString()
  updatedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskType) })
  @IsOptional()
  @IsIn(Object.values(TaskType))
  type?: TaskType;

  @ApiPropertyOptional({ enum: Object.values(Priority) })
  @IsOptional()
  @IsIn(Object.values(Priority))
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Перепризначення (FR-3.2) — обмежене автором/поточним виконавцем/ADMIN' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

/** FR-3.5: результат обов'язковий лише для ДЗВІНОК/КП/ДОГОВІР — перевіряє сервіс. */
export class CompleteTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  result?: string;
}

/** Причина обов'язкова завжди, для будь-якого типу задачі. */
export class CancelTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Вкажіть причину скасування' })
  @MaxLength(2000)
  reason!: string;
}

export class SnoozeTaskDto {
  @ApiProperty({ enum: SNOOZE_PRESETS })
  @IsIn(SNOOZE_PRESETS)
  preset!: SnoozePreset;

  @ApiPropertyOptional({ description: 'Обов\'язково для preset="custom"' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
