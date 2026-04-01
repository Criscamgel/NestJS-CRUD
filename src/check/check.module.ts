import { Check, CheckSchema } from './entities/check.entity';
import { Module } from '@nestjs/common';
import { CheckService } from './check.service';
import { CheckController } from './check.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from 'src/common/common.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [CheckController],
  providers: [CheckService],
  imports: [
    ConfigModule,
    CommonModule,
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Check.name,
        schema: CheckSchema
      }
    ])
  ],
  exports: [CheckModule]

})
export class CheckModule { }
