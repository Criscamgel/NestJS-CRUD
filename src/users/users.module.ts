import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
    ]),
    CommonModule,
    forwardRef(() => AuthModule),
    forwardRef(() => CompanyModule)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [MongooseModule, UsersService]
})
export class UsersModule {}
