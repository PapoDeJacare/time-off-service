import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { roundDays } from '../common/day-math.util';
import { BalanceAuditEntity } from './balance-audit.entity';
import { BalanceAuditSource } from './balance-audit-source.enum';
import { BalanceEntity } from './balance.entity';
import { BalanceSyncPayload } from './balances.types';

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(BalanceEntity)
    private readonly balancesRepository: Repository<BalanceEntity>,
    @InjectRepository(BalanceAuditEntity)
    private readonly auditsRepository: Repository<BalanceAuditEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async getBalance(
    employeeId: string,
    locationId: string,
  ): Promise<BalanceEntity> {
    const balance = await this.findBalance(employeeId, locationId);

    if (!balance) {
      throw new NotFoundException('Balance not found for employee/location.');
    }

    return balance;
  }

  async findBalance(
    employeeId: string,
    locationId: string,
  ): Promise<BalanceEntity | null> {
    return this.balancesRepository.findOne({
      where: { employeeId, locationId },
    });
  }

  async listByEmployee(employeeId: string): Promise<BalanceEntity[]> {
    return this.balancesRepository.find({
      where: { employeeId },
      order: { updatedAt: 'DESC' },
    });
  }

  async upsertFromHcm(
    payload: BalanceSyncPayload,
    source: BalanceAuditSource,
    metadata?: Record<string, unknown>,
  ): Promise<BalanceEntity> {
    return this.dataSource.transaction(async (manager) =>
      this.upsertWithManager(manager, payload, source, metadata),
    );
  }

  async batchUpsertFromHcm(
    payloads: BalanceSyncPayload[],
    snapshotId?: string,
  ): Promise<{ updatedCount: number }> {
    const deduplicated = new Map<string, BalanceSyncPayload>();

    for (const payload of payloads) {
      deduplicated.set(`${payload.employeeId}::${payload.locationId}`, payload);
    }

    const normalized = [...deduplicated.values()];

    await this.dataSource.transaction(async (manager) => {
      for (const payload of normalized) {
        await this.upsertWithManager(
          manager,
          payload,
          BalanceAuditSource.HCM_BATCH,
          {
            snapshotId,
          },
        );
      }
    });

    return { updatedCount: normalized.length };
  }

  async deductBalanceForApprovedRequest(
    manager: EntityManager,
    employeeId: string,
    locationId: string,
    daysRequested: number,
    requestId: string,
  ): Promise<BalanceEntity> {
    const balancesRepository = manager.getRepository(BalanceEntity);
    const auditsRepository = manager.getRepository(BalanceAuditEntity);

    const balance = await balancesRepository.findOne({
      where: { employeeId, locationId },
    });

    if (!balance) {
      throw new ConflictException(
        'Unable to approve request because no balance exists for employee/location.',
      );
    }

    if (balance.availableDays < daysRequested) {
      throw new ConflictException(
        'Insufficient local balance at approval time.',
      );
    }

    balance.availableDays = roundDays(balance.availableDays - daysRequested);
    balance.lastSyncedAt = new Date();

    const savedBalance = await balancesRepository.save(balance);

    const audit = auditsRepository.create({
      employeeId,
      locationId,
      source: BalanceAuditSource.TIME_OFF_APPROVED,
      delta: roundDays(daysRequested * -1),
      resultingBalance: savedBalance.availableDays,
      requestId,
      metadata: null,
    });

    await auditsRepository.save(audit);

    return savedBalance;
  }

  private async upsertWithManager(
    manager: EntityManager,
    payload: BalanceSyncPayload,
    source: BalanceAuditSource,
    metadata?: Record<string, unknown>,
  ): Promise<BalanceEntity> {
    const balancesRepository = manager.getRepository(BalanceEntity);
    const auditsRepository = manager.getRepository(BalanceAuditEntity);

    const current = await balancesRepository.findOne({
      where: {
        employeeId: payload.employeeId,
        locationId: payload.locationId,
      },
    });

    const previousValue = current?.availableDays ?? 0;
    const nextValue = roundDays(payload.availableDays);

    const balance =
      current ??
      balancesRepository.create({
        employeeId: payload.employeeId,
        locationId: payload.locationId,
        availableDays: nextValue,
        lastSyncedAt: null,
      });

    balance.availableDays = nextValue;
    balance.lastSyncedAt = payload.effectiveAt
      ? new Date(payload.effectiveAt)
      : new Date();

    const savedBalance = await balancesRepository.save(balance);

    const audit = auditsRepository.create({
      employeeId: payload.employeeId,
      locationId: payload.locationId,
      source,
      delta: roundDays(nextValue - previousValue),
      resultingBalance: savedBalance.availableDays,
      requestId: null,
      metadata: metadata ?? null,
    });

    await auditsRepository.save(audit);

    return savedBalance;
  }
}
