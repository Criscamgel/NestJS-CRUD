import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from 'src/common/common.module';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [ConfigModule, CommonModule],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class TurnstileModule {}
