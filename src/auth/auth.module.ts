import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from 'src/common/common.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  imports: [
        ConfigModule,
        CommonModule,
        MongooseModule.forFeature([
          {
            name: User.name,
            schema: UserSchema
          }
        ])
      ],
  exports: [AuthModule]
})
export class AuthModule {}
