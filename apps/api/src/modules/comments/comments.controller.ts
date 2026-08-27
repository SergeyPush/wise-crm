import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto, ListCommentsQueryDto } from './dto/comment.dto';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  // client:read, а не comment:create — читання коментарів прив'язане до
  // видимості картки, той самий принцип, що й у FilesController.list
  @Get()
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'entityType+entityId або clientId — за зразком GET /files' })
  list(@Query() query: ListCommentsQueryDto) {
    return this.comments.list(query);
  }

  @Post()
  @RequirePermission('comment:create')
  @ApiOperation({ summary: 'entityType + entityId (FR-8.1 «Додати коментар»)' })
  create(@Body() dto: CreateCommentDto, @CurrentUser() actor: AuthUser) {
    return this.comments.create(dto, actor.id);
  }
}
