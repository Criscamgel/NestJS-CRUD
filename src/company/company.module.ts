import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
  imports: [
    AuthModule,
  ]
})
export class CompanyModule { }
