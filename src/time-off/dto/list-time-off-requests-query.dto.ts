import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TimeOffRequestStatus } from '../time-off-request-status.enum';

export class ListTimeOffRequestsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locationId?: string;

  @IsOptional()
  @IsEnum(TimeOffRequestStatus)
  status?: TimeOffRequestStatus;
}
