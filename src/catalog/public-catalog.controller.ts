import { Controller, Get } from '@nestjs/common';
import { COMPANY_CITIES_CATALOG } from 'src/common/catalog/company-cities.catalog';
import { COMPANY_SECTORS_CATALOG } from 'src/common/catalog/company-sectors.catalog';

@Controller('public/catalog')
export class PublicCatalogController {
  @Get('cities')
  getCities() {
    return { data: COMPANY_CITIES_CATALOG };
  }

  @Get('sectors')
  getSectors() {
    return { data: COMPANY_SECTORS_CATALOG };
  }
}
