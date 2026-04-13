import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/users/entities/user.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('memberships')
@Auth(ValidRoles.superAdmin)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  create(
    @Body() dto: CreateMembershipDto,
    @GetUser() actor: User,
  ) {
    return this.membershipsService.create(dto, actor.id);
  }

  @Get()
  findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.membershipsService.findAll(paginationQuery);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.membershipsService.findOne(id);
  }

  @Patch(':id/suspend')
  suspend(
    @Param('id') id: string,
    @GetUser() actor: User,
    @Body('reason') reason?: string,
  ) {
    return this.membershipsService.suspend(id, actor.id, reason);
  }
}
