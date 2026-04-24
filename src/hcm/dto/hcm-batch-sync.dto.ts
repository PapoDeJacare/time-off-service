import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { HcmRealtimeSyncDto } from './hcm-realtime-sync.dto';

export class HcmBatchSyncDto {
  @ValidateNested({ each: true })
  @Type(() => HcmRealtimeSyncDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  balances!: HcmRealtimeSyncDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  snapshotId?: string;
}
