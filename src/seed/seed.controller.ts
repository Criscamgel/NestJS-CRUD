import { Controller, Get } from '@nestjs/common';
import { SeedService } from './seed.service';

/**
 * ADVERTENCIA: Este endpoint debe ejecutarse UNA SOLA VEZ para inicializar
 * los superAdmins del sistema. Después de ejecutarlo exitosamente,
 * se recomienda deshabilitar o restringir el acceso a este endpoint.
 *
 * Los datos de los superAdmins son leídos exclusivamente desde variables
 * de entorno (SEED_ADMIN1_*, SEED_ADMIN2_*) para proteger información sensible.
 */
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Get()
  executedSeed() {
    return this.seedService.executedSeed();
  }
}
