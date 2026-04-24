import { Controller, Get, Param } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get('employee/:employeeId')
  listByEmployee(@Param('employeeId') employeeId: string) {
    return this.balancesService.listByEmployee(employeeId);
  }

  @Get(':employeeId/:locationId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balancesService.getBalance(employeeId, locationId);
  }
}
