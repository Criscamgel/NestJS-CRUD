import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CompanyBranch,
  CompanyBranchSchema,
} from './entities/company-branch.entity';
import { Company, CompanySchema } from 'src/company/entities/company.entity';
import { CounterId, CounterIdSchema } from 'src/common/entities/counter-id.entity';
import { CompanyBranchService } from './company-branch.service';
import { CompanyBranchController } from './company-branch.controller';
import { CompanyBranchCatalogController } from './company-branch-catalog.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: CompanyBranch.name, schema: CompanyBranchSchema },
      { name: Company.name, schema: CompanySchema },
      { name: CounterId.name, schema: CounterIdSchema },
    ]),
  ],
  controllers: [CompanyBranchController, CompanyBranchCatalogController],
  providers: [CompanyBranchService],
  exports: [CompanyBranchService, MongooseModule],
})
export class CompanyBranchModule {}
