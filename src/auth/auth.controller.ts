import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  SetMetadata,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginUserDto, RecoverPasswordDto, UpdateUserDto } from './dto';
import { AuthGuard } from '@nestjs/passport';
import { Auth, GetUser } from './decorators';
import { RawHeaders, GetHeaders } from '../common/decorators';
import { User } from './entities/user.entity';
import { UserRoleGuard } from './guards/user-role.guard';
import { RoleProtected } from './decorators/role-protected.decorator';
import { ValidRoles } from './interfaces';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  createUser(
    @Body() createUserDto: CreateUserDto,
    @GetUser() creatorUser: User,
  ) {
    return this.authService.create(createUserDto, creatorUser);
  }

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('recover-password')
  recoverPassword(@Body() recoverPasswordDto: RecoverPasswordDto) {
    return this.authService.recoverPassword(recoverPasswordDto);
  }

  @Get('users')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  findAllUsers() {
    return this.authService.findAllUsers();
  }

  @Patch('users/:id/toggle-status')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  toggleUserStatus(@Param('id') id: string) {
    return this.authService.toggleUserStatus(id);
  }

  @Patch('users/:id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() editor: User,
  ) {
    return this.authService.updateUser(id, updateUserDto, editor);
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
