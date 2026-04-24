import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppController } from './app.controller';
import { BalancesModule } from './balances/balances.module';
import { HcmModule } from './hcm/hcm.module';
import { TimeOffModule } from './time-off/time-off.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databasePath =
          configService.get<string>('DB_PATH') ?? 'data/timeoff.sqlite';
        const shouldSynchronize =
          (configService.get<string>('DB_SYNCHRONIZE') ?? 'true') === 'true';

        if (databasePath !== ':memory:') {
          mkdirSync(dirname(databasePath), { recursive: true });
        }

        return {
          type: 'sqlite' as const,
          database: databasePath,
          autoLoadEntities: true,
          synchronize: shouldSynchronize,
        };
      },
    }),
    BalancesModule,
    HcmModule,
    TimeOffModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
