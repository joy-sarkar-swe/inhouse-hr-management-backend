/**
 * @fileoverview User module.
 *
 * Provides self-service user profile management (GET/PATCH /profile/me,
 * avatar upload/remove).
 *
 * Imports SharedAuthModule for guards (no circular dependency with AuthModule).
 * Exports UserService for other modules that need user operations (AuthModule
 * depends on it directly).
 *
 * @module user-service
 */
import { Module } from '@nestjs/common';
import { SharedAuthModule } from '../auth-service/shared-auth.module';
import { UserDAO } from './dao/user.dao';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [SharedAuthModule],
  controllers: [UserController],
  providers: [UserDAO, UserService],
  exports: [UserService],
})
export class UserModule {}
