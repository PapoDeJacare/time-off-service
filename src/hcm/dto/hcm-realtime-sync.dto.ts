import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class HcmRealtimeSyncDto {
  @IsString()
  @MaxLength(64)
  employeeId!: string;

  @IsString()
  @MaxLength(64)
  locationId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  availableDays!: number;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
