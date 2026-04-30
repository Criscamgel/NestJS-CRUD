import { Check, CheckSchema } from './entities/check.entity';
import { Module } from '@nestjs/common';
import { CheckService } from './check.service';
import { CheckController } from './check.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from 'src/common/common.module';
import { AuthModule } from 'src/auth/auth.module';
import { MembershipsModule } from 'src/memberships/memberships.module';
import { User, UserSchema } from 'src/users/entities/user.entity';

@Module({
  controllers: [CheckController],
  providers: [CheckService],
  imports: [
    ConfigModule,
    CommonModule,
    AuthModule,
    MembershipsModule,
    MongooseModule.forFeature([
      { name: Check.name, schema: CheckSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  exports: [CheckModule]

})
export class CheckModule { }
