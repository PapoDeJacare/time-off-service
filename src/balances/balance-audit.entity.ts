import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BalanceAuditSource } from './balance-audit-source.enum';

@Entity({ name: 'balance_audits' })
export class BalanceAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64 })
  employeeId!: string;

  @Column({ length: 64 })
  locationId!: string;

  @Column({ type: 'varchar', length: 40 })
  source!: BalanceAuditSource;

  @Column('float')
  resultingBalance!: number;

  @Column('float', { nullable: true })
  delta!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
