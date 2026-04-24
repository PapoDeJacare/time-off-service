import { IsString, MaxLength } from 'class-validator';

export class ApproveTimeOffRequestDto {
  @IsString()
  @MaxLength(64)
  managerId!: string;
}
