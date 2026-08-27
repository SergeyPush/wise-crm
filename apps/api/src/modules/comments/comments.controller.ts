import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  @RequirePermission('comment:create')
  @ApiOperation({ summary: 'entityType + entityId (FR-8.1 «Додати коментар»)' })
  create(@Body() dto: CreateCommentDto, @CurrentUser() actor: AuthUser) {
    return this.comments.create(dto, actor.id);
  }
}
