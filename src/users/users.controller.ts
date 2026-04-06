import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Auth, GetUser } from '../auth/decorators';
import { ValidRoles } from '../auth/interfaces';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  createUser(
    @Body() createUserDto: CreateUserDto,
    @GetUser() creatorUser: User,
  ) {
    return this.usersService.create(createUserDto, creatorUser);
  }

  @Get()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  findAllUsers() {
    return this.usersService.findAllUsers();
  }

  @Patch(':id/toggle-status')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  toggleUserStatus(@Param('id') id: string) {
    return this.usersService.toggleUserStatus(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() editor: User,
  ) {
    return this.usersService.updateUser(id, updateUserDto, editor);
  }
}
