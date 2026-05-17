import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommonModule } from 'src/common/common.module';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from 'src/email/email.module';
import { UsersModule } from '../users/users.module';
import { BlacklistedToken, BlacklistedTokenSchema } from './entities/blacklisted-token.entity';
import { MembershipsModule } from 'src/memberships/memberships.module';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  imports: [
        EmailModule,
        ConfigModule,
        CommonModule,
        forwardRef(() => UsersModule),
        forwardRef(() => MembershipsModule),
        MongooseModule.forFeature([
          {
            name: BlacklistedToken.name,
            schema: BlacklistedTokenSchema
          }
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ ConfigModule ],
          inject: [ ConfigService ],
          useFactory: ( configService: ConfigService ) => {
            return {
              secret: configService.get<string>('JWT_SECRET'),
              signOptions: { expiresIn: '2h' }
            }
          }
        })
      ],
  exports: [MongooseModule, JwtStrategy, PassportModule, JwtModule, AuthService]
})
export class AuthModule {}
