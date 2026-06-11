import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { CommonModule } from 'src/common/common.module';
import { UsersModule } from 'src/users/users.module';
import { Company, CompanySchema } from 'src/company/entities/company.entity';
import { CompanyBranch, CompanyBranchSchema } from 'src/company-branch/entities/company-branch.entity';
import { Membership, MembershipSchema } from 'src/memberships/entities/membership.entity';

@Module({
  controllers: [SeedController],
  providers: [SeedService],
  imports: [
    CommonModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyBranch.name, schema: CompanyBranchSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
})
export class SeedModule {}
