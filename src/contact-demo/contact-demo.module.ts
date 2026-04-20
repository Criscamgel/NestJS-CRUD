import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { ContactDemoController } from './contact-demo.controller';
import { ContactDemoService } from './contact-demo.service';

@Module({
  imports: [ConfigModule, EmailModule],
  controllers: [ContactDemoController],
  providers: [ContactDemoService],
})
export class ContactDemoModule {}
