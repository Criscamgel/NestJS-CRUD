import { Controller, Get } from '@nestjs/common';
import { SeedService } from './seed.service';

/**
 * Endpoints de seed para inicialización y datos de prueba.
 * ADVERTENCIA: Restringir acceso en producción.
 */
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Get()
  executedSeed() {
    return this.seedService.executedSeed();
  }

  /** Crea empresa + sede + membresía caducada + usuarios de prueba. */
  @Get('expired-membership')
  seedExpiredMembership() {
    return this.seedService.seedExpiredMembership();
  }
}
