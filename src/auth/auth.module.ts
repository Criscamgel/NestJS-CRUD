import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommonModule } from 'src/common/common.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from 'src/email/email.module';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  imports: [
        EmailModule,
        ConfigModule,
        CommonModule,
        MongooseModule.forFeature([
          {
            name: User.name,
            schema: UserSchema
          }
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ ConfigModule ],
          inject: [ ConfigService ],
          useFactory: ( configService: ConfigService ) => {
            return {
              // secret: process.env.JWT_SECRET,
              secret: configService.get<string>('JWT_SECRET'),
              signOptions: { expiresIn: '2h' }
            }
          }
        })
      ],
  exports: [MongooseModule, JwtStrategy, PassportModule, JwtModule]
})
export class AuthModule {}
