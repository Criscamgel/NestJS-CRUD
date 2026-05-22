import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveClientIp } from 'src/common/utils/client-ip.util';
import { AuthService } from './auth.service';
import { LoginUserDto, RecoverPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto';
import { Auth, GetUser } from './decorators';
import { RawHeaders, GetHeaders } from '../common/decorators';
import { User } from '../users/entities/user.entity';
import { UserRoleGuard } from './guards/user-role.guard';
import { RoleProtected } from './decorators/role-protected.decorator';
import { ValidRoles } from './interfaces';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto, @Req() req: Request) {
    return this.authService.login(loginUserDto, resolveClientIp(req));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() request: any) {
    // We will extract the token from headers and blacklist it
    const authHeader = request.headers.authorization;
    const token = authHeader.split(' ')[1];
    return this.authService.logout(token);
  }

  @Post('recover-password')
  recoverPassword(
    @Body() recoverPasswordDto: RecoverPasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.recoverPassword(
      recoverPasswordDto,
      resolveClientIp(req),
    );
  }

  @Post('reset-password')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @GetUser() user: User,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, changePasswordDto);
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  testingPrivateRoute(
    //@Req() request: Express.Request
    @GetUser() user: User,
    @GetUser('email') userEmail: string,
    @RawHeaders() rawHeaders: string[],
    @GetHeaders() headers: any,
  ) {
    //console.log({ user: request.user });
    return {
      message: 'Acceso correcto',
      data: {
        user,
        userEmail,
        rawHeaders,
        headers,
      },
    };
  }
}
