import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TaskType } from 'shared';

/** FR-E1: той самий набір фільтрів, що на екрані списку клієнтів — «що бачить, те й отримує». */
export class ExportClientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ description: 'LEAD | IN_WORK | WON | LOST' })
  @IsOptional()
  @IsIn(['LEAD', 'IN_WORK', 'WON', 'LOST'])
  stage?: string;

  @ApiPropertyOptional({ description: 'uuid або "none"' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;
}

export class ExportTasksQueryDto {
  @ApiPropertyOptional({ description: 'uuid або "none"' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskType) })
  @IsOptional()
  @IsIn(Object.values(TaskType))
  type?: string;

  @ApiPropertyOptional({ description: 'OPEN | IN_PROGRESS | DONE | CANCELLED' })
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'])
  status?: string;
}
