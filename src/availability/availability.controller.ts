import { Controller, Get, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('free-users')
  async getFreeUsers(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tags') tags?: string | string[],
  ) {
    return await this.availabilityService.getFreeUsers({ from, to, tags });
  }
}
