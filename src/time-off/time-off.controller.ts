import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { ListTimeOffRequestsQueryDto } from './dto/list-time-off-requests-query.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { TimeOffService } from './time-off.service';

@Controller('time-off/requests')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post()
  createRequest(@Body() dto: CreateTimeOffRequestDto) {
    return this.timeOffService.createRequest(dto);
  }

  @Get()
  listRequests(@Query() query: ListTimeOffRequestsQueryDto) {
    return this.timeOffService.listRequests(query);
  }

  @Get(':id')
  getRequestById(@Param('id') id: string) {
    return this.timeOffService.getRequestById(id);
  }

  @Post(':id/approve')
  approveRequest(
    @Param('id') id: string,
    @Body() dto: ApproveTimeOffRequestDto,
  ) {
    return this.timeOffService.approveRequest(id, dto);
  }

  @Post(':id/reject')
  rejectRequest(@Param('id') id: string, @Body() dto: RejectTimeOffRequestDto) {
    return this.timeOffService.rejectRequest(id, dto);
  }
}
