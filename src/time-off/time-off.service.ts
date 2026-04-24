import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { BalancesService } from '../balances/balances.service';
import { roundDays } from '../common/day-math.util';
import { HcmClientError } from '../hcm/hcm-client.error';
import { HcmClientService } from '../hcm/hcm-client.service';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { ListTimeOffRequestsQueryDto } from './dto/list-time-off-requests-query.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { TimeOffRequestStatus } from './time-off-request-status.enum';

@Injectable()
export class TimeOffService {
  constructor(
    @InjectRepository(TimeOffRequestEntity)
    private readonly requestsRepository: Repository<TimeOffRequestEntity>,
    private readonly balancesService: BalancesService,
    private readonly hcmClientService: HcmClientService,
    private readonly dataSource: DataSource,
  ) {}

  async createRequest(
    dto: CreateTimeOffRequestDto,
  ): Promise<TimeOffRequestEntity> {
    this.assertDateRange(dto.startDate, dto.endDate);

    if (dto.idempotencyKey) {
      const existing = await this.requestsRepository.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing) {
        this.assertIdempotentPayload(existing, dto);

        return existing;
      }
    }

    const currentBalance = await this.balancesService.findBalance(
      dto.employeeId,
      dto.locationId,
    );

    if (!currentBalance || currentBalance.availableDays < dto.daysRequested) {
      throw new ConflictException(
        'Insufficient local balance for the requested period.',
      );
    }

    const request = this.requestsRepository.create({
      employeeId: dto.employeeId,
      locationId: dto.locationId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      daysRequested: roundDays(dto.daysRequested),
      reason: dto.reason ?? null,
      idempotencyKey: dto.idempotencyKey ?? null,
      status: TimeOffRequestStatus.SUBMITTED,
      managerId: null,
      rejectionReason: null,
      hcmReference: null,
      decidedAt: null,
    });

    return this.requestsRepository.save(request);
  }

  async listRequests(
    query: ListTimeOffRequestsQueryDto,
  ): Promise<TimeOffRequestEntity[]> {
    const where: FindOptionsWhere<TimeOffRequestEntity> = {};

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.locationId) {
      where.locationId = query.locationId;
    }

    if (query.status) {
      where.status = query.status;
    }

    return this.requestsRepository.find({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });
  }

  async getRequestById(id: string): Promise<TimeOffRequestEntity> {
    const request = await this.requestsRepository.findOne({ where: { id } });

    if (!request) {
      throw new NotFoundException('Time-off request not found.');
    }

    return request;
  }

  async approveRequest(
    requestId: string,
    dto: ApproveTimeOffRequestDto,
  ): Promise<TimeOffRequestEntity> {
    const request = await this.getRequestById(requestId);

    if (request.status === TimeOffRequestStatus.APPROVED) {
      return request;
    }

    if (request.status !== TimeOffRequestStatus.SUBMITTED) {
      throw new ConflictException(
        'Only submitted requests can be approved or rejected.',
      );
    }

    const localBalance = await this.balancesService.findBalance(
      request.employeeId,
      request.locationId,
    );

    if (!localBalance || localBalance.availableDays < request.daysRequested) {
      throw new ConflictException(
        'Local balance changed and is now insufficient for approval.',
      );
    }

    let hcmResult: { transactionId: string };

    try {
      hcmResult = await this.hcmClientService.validateAndDeduct({
        requestId: request.id,
        employeeId: request.employeeId,
        locationId: request.locationId,
        daysRequested: request.daysRequested,
      });
    } catch (error) {
      if (error instanceof HcmClientError && error.isValidationError()) {
        request.status = TimeOffRequestStatus.REJECTED;
        request.rejectionReason = `HCM rejected approval: ${error.message}`;
        request.managerId = dto.managerId;
        request.decidedAt = new Date();

        await this.requestsRepository.save(request);

        throw new ConflictException(request.rejectionReason);
      }

      throw new ServiceUnavailableException(
        'Unable to validate request with HCM right now.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const requestsRepository = manager.getRepository(TimeOffRequestEntity);

      const transactionalRequest = await requestsRepository.findOne({
        where: { id: requestId },
      });

      if (!transactionalRequest) {
        throw new NotFoundException('Time-off request not found.');
      }

      if (transactionalRequest.status !== TimeOffRequestStatus.SUBMITTED) {
        throw new ConflictException('Request has already been decided.');
      }

      await this.balancesService.deductBalanceForApprovedRequest(
        manager,
        transactionalRequest.employeeId,
        transactionalRequest.locationId,
        transactionalRequest.daysRequested,
        transactionalRequest.id,
      );

      transactionalRequest.status = TimeOffRequestStatus.APPROVED;
      transactionalRequest.managerId = dto.managerId;
      transactionalRequest.rejectionReason = null;
      transactionalRequest.hcmReference = hcmResult.transactionId;
      transactionalRequest.decidedAt = new Date();

      return requestsRepository.save(transactionalRequest);
    });
  }

  async rejectRequest(
    requestId: string,
    dto: RejectTimeOffRequestDto,
  ): Promise<TimeOffRequestEntity> {
    const request = await this.getRequestById(requestId);

    if (request.status === TimeOffRequestStatus.REJECTED) {
      return request;
    }

    if (request.status === TimeOffRequestStatus.APPROVED) {
      throw new ConflictException('Approved requests cannot be rejected.');
    }

    request.status = TimeOffRequestStatus.REJECTED;
    request.managerId = dto.managerId;
    request.rejectionReason = dto.reason;
    request.decidedAt = new Date();

    return this.requestsRepository.save(request);
  }

  private assertDateRange(startDate: string, endDate: string): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException('startDate cannot be after endDate.');
    }
  }

  private assertIdempotentPayload(
    existing: TimeOffRequestEntity,
    incoming: CreateTimeOffRequestDto,
  ): void {
    const isSamePayload =
      existing.employeeId === incoming.employeeId &&
      existing.locationId === incoming.locationId &&
      existing.startDate === incoming.startDate &&
      existing.endDate === incoming.endDate &&
      existing.daysRequested === roundDays(incoming.daysRequested);

    if (!isSamePayload) {
      throw new ConflictException(
        'idempotencyKey already exists with a different payload.',
      );
    }
  }
}
