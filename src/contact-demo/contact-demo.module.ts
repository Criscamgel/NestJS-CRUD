import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { ContactDemoController } from './contact-demo.controller';
import { ContactDemoService } from './contact-demo.service';

@Module({
  imports: [EmailModule],
  controllers: [ContactDemoController],
  providers: [ContactDemoService],
})
export class ContactDemoModule {}
