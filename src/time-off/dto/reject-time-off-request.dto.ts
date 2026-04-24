import { IsString, MaxLength } from 'class-validator';

export class RejectTimeOffRequestDto {
  @IsString()
  @MaxLength(64)
  managerId!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
