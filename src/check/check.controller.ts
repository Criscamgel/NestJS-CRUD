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
  constructor(private readonly checkService: CheckService) { }

  @Post()
  create(
    @Body() createCheckDto: CreateCheckDto,
    @GetUser() user: User,
  ) {
    return this.checkService.create(createCheckDto, user);
  }

  @Get()
  findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.checkService.findAll(paginationQuery);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checkService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCheckDto: UpdateCheckDto) {
    return this.checkService.update(+id, updateCheckDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checkService.remove(+id);
  }
}
