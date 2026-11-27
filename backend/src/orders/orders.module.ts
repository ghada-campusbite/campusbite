import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { CatalogController, MenuController, OrdersController, UniversitiesController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [AuthModule, PushModule], controllers: [OrdersController, MenuController, CatalogController, UniversitiesController], providers: [OrdersService] })
export class OrdersModule {}
