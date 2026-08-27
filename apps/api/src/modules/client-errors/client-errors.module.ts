import { Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller';

@Module({ controllers: [ClientErrorsController] })
export class ClientErrorsModule {}
