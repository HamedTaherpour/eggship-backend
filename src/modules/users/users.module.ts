import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './api/users.controller';
import { CustomerProfileService } from './application/customer-profile.service';
import { StoreProfileRepository } from './infrastructure/store-profile.repository';
import { UserRepository } from './infrastructure/user.repository';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UserRepository, StoreProfileRepository, CustomerProfileService],
  exports: [UserRepository, StoreProfileRepository, CustomerProfileService],
})
export class UsersModule {}
