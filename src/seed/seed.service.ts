import { Injectable } from '@nestjs/common';

@Injectable()
export class SeedService {

  constructor(){}

  async executedSeed() {
    return 'Seed Executed';
  }

}
