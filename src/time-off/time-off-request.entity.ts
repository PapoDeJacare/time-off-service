import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TimeOffRequestStatus } from './time-off-request-status.enum';

@Entity({ name: 'time_off_requests' })
export class TimeOffRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64 })
  employeeId!: string;

  @Column({ length: 64 })
  locationId!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column('float')
  daysRequested!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: TimeOffRequestStatus.SUBMITTED,
  })
  status!: TimeOffRequestStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  managerId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  hcmReference!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true, unique: true })
  idempotencyKey!: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
