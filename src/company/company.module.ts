import { Module, forwardRef } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema } from './entities/company.entity';
import { CounterId, CounterIdSchema } from 'src/common/entities/counter-id.entity';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CounterId.name, schema: CounterIdSchema }
    ])
  ],
  exports: [MongooseModule, CompanyService]
})
export class CompanyModule { }
