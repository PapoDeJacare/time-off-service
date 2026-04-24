import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BalancesModule } from '../balances/balances.module';
import { HcmController } from './hcm.controller';
import { HcmClientService } from './hcm-client.service';

@Module({
  imports: [ConfigModule, BalancesModule],
  controllers: [HcmController],
  providers: [HcmClientService],
  exports: [HcmClientService],
})
export class HcmModule {}
