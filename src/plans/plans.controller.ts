import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { User } from 'src/users/entities/user.entity';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @Auth(ValidRoles.superAdmin)
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  /** Catálogo público (landing). Debe declararse antes de `@Get(':id')`. */
  @Get('public/catalog')
  findPublicCatalog(@Query() paginationQuery: PaginationQueryDto) {
    return this.plansService.findPublicCatalog(paginationQuery);
  }

  @Get()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @GetUser() requester: User,
  ) {
    return this.plansService.findAll(paginationQuery, requester);
  }

  @Get(':id')
  @Auth(ValidRoles.superAdmin)
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.superAdmin)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Patch(':id/toggle-status')
  @Auth(ValidRoles.superAdmin)
  toggleStatus(@Param('id') id: string) {
    return this.plansService.toggleStatus(id);
  }

  @Patch(':id/toggle-visibility')
  @Auth(ValidRoles.superAdmin)
  toggleVisibility(@Param('id') id: string) {
    return this.plansService.toggleVisibility(id);
  }
}
