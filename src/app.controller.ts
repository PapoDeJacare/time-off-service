import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'time-off-service',
      timestamp: new Date().toISOString(),
    };
  }
}
