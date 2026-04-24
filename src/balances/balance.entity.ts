import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'balances' })
@Unique('UQ_BALANCE_EMPLOYEE_LOCATION', ['employeeId', 'locationId'])
export class BalanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64 })
  employeeId!: string;

  @Column({ length: 64 })
  locationId!: string;

  @Column('float')
  availableDays!: number;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
