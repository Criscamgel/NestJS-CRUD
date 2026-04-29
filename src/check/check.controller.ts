import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CheckService } from './check.service';
import { CreateCheckDto } from './dto/create-check.dto';
import { UpdateCheckDto } from './dto/update-check.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { User } from 'src/users/entities/user.entity';

@Controller(['check', 'checks'])
@Auth()
export class CheckController {
  constructor(private readonly checkService: CheckService) {}

  @Post()
  create(
    @Body() createCheckDto: CreateCheckDto,
    @GetUser() user: User,
  ) {
    return this.checkService.create(createCheckDto, user);
  }

  @Get()
  findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @GetUser() user: User,
  ) {
    return this.checkService.findAll(paginationQuery, user);
  }

  @Get(':checkId')
  findOne(@Param('checkId') checkId: string, @GetUser() user: User) {
    return this.checkService.findOneByPublicId(checkId, user);
  }

  @Patch(':checkId')
  update(
    @Param('checkId') checkId: string,
    @Body() updateCheckDto: UpdateCheckDto,
  ) {
    return this.checkService.update(checkId, updateCheckDto);
  }

  @Delete(':checkId')
  remove(@Param('checkId') checkId: string) {
    return this.checkService.remove(checkId);
  }
}
