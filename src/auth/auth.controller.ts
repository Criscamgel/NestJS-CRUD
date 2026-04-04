import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto, RecoverPasswordDto } from './dto';
import { AuthGuard } from '@nestjs/passport';
import { Auth, GetUser } from './decorators';
import { RawHeaders, GetHeaders } from '../common/decorators';
import { User } from '../users/entities/user.entity';
import { UserRoleGuard } from './guards/user-role.guard';
import { RoleProtected } from './decorators/role-protected.decorator';
import { ValidRoles } from './interfaces';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('logout')
  @UseGuards(AuthGuard())
  logout(@Req() request: any) {
    // We will extract the token from headers and blacklist it
    const authHeader = request.headers.authorization;
    const token = authHeader.split(' ')[1];
    return this.authService.logout(token);
  }

  @Post('recover-password')
  recoverPassword(@Body() recoverPasswordDto: RecoverPasswordDto) {
    return this.authService.recoverPassword(recoverPasswordDto);
  }

  @Get('private')
  @UseGuards(AuthGuard())
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

  // @SetMetadata('roles', ['admin', 'super-user'])

  @Get('private2')
  @RoleProtected(ValidRoles.admin)
  @UseGuards(AuthGuard(), UserRoleGuard)
  privateRoute2(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }

  @Get('private3')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  privateRoute3(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }
}
