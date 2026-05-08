import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { COMPANY_CITY_IDS } from 'src/common/constants/company-city-ids';

/** Listado global/inter-empresa de sedes (`GET catalog`). */
export class BranchCatalogQueryDto extends PaginationQueryDto {
  /** Filtro exacto por id de empresa (solo superAdmin). */
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'companyId inválido' })
  companyId?: string;

  @IsOptional()
  @IsString()
  @IsIn([...COMPANY_CITY_IDS])
  city?: string;
}
