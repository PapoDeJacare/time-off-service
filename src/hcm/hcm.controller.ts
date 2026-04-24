import { Body, Controller, Param, Post } from '@nestjs/common';
import { BalanceAuditSource } from '../balances/balance-audit-source.enum';
import { BalancesService } from '../balances/balances.service';
import { HcmBatchSyncDto } from './dto/hcm-batch-sync.dto';
import { HcmRealtimeSyncDto } from './dto/hcm-realtime-sync.dto';
import { HcmClientService } from './hcm-client.service';

@Controller('hcm/sync')
export class HcmController {
  constructor(
    private readonly balancesService: BalancesService,
    private readonly hcmClientService: HcmClientService,
  ) {}

  @Post('realtime')
  async realtimeSync(@Body() dto: HcmRealtimeSyncDto) {
    const balance = await this.balancesService.upsertFromHcm(
      dto,
      BalanceAuditSource.HCM_REALTIME,
    );

    return {
      updated: 1,
      balance,
    };
  }

  @Post('batch')
  async batchSync(@Body() dto: HcmBatchSyncDto) {
    return this.balancesService.batchUpsertFromHcm(
      dto.balances,
      dto.snapshotId,
    );
  }

  @Post('reconcile/:employeeId/:locationId')
  async reconcile(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    const hcmBalance = await this.hcmClientService.getBalance(
      employeeId,
      locationId,
    );

    const balance = await this.balancesService.upsertFromHcm(
      hcmBalance,
      BalanceAuditSource.HCM_RECONCILIATION,
      {
        reconciledFrom: 'hcm-api',
      },
    );

    return {
      updated: 1,
      balance,
    };
  }
}
