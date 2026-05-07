import { Body, Controller, Post } from '@nestjs/common';
import { LandingOnboardingService } from './landing-onboarding.service';
import { RequestLandingAdminOnboardingDto } from './dto/landing-onboarding.dto';

@Controller('public/landing')
export class PublicLandingController {
  constructor(
    private readonly landingOnboardingService: LandingOnboardingService,
  ) {}

  @Post('request-admin-onboarding')
  requestAdminOnboarding(@Body() dto: RequestLandingAdminOnboardingDto) {
    return this.landingOnboardingService.requestAdminOnboarding(dto);
  }
}
