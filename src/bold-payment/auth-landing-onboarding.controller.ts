import { Body, Controller, Post } from '@nestjs/common';
import { LandingOnboardingService } from './landing-onboarding.service';
import {
  CompleteLandingOnboardingDto,
  VerifyLandingOnboardingDto,
} from './dto/landing-onboarding.dto';

@Controller('auth/landing-onboarding')
export class AuthLandingOnboardingController {
  constructor(
    private readonly landingOnboardingService: LandingOnboardingService,
  ) {}

  @Post('verify')
  verify(@Body() dto: VerifyLandingOnboardingDto) {
    return this.landingOnboardingService.verifyOnboardingToken(dto.token);
  }

  @Post('complete')
  complete(@Body() dto: CompleteLandingOnboardingDto) {
    return this.landingOnboardingService.completeOnboarding(dto);
  }
}
