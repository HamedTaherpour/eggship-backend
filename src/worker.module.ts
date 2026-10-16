import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createWorkerConfigModuleOptions } from './config/worker-config-module.options';
import { ObservabilityModule } from './common/observability/observability.module';
import { QueueInfrastructureModule } from './infrastructure/queue/queue-infrastructure.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { WorkerModule } from './infrastructure/worker/worker.module';
import { WorkerAsyncRecoveryModule } from './modules/async-recovery/worker-async-recovery.module';
import { WORKER_PROCESSORS } from './infrastructure/worker/worker.tokens';
import { RECOVERY_PROCESSORS } from './modules/async-recovery/domain/async-recovery';

@Module({
  imports: [
    ConfigModule.forRoot(createWorkerConfigModuleOptions()),
    ObservabilityModule,
    RedisModule,
    QueueInfrastructureModule,
    WorkerModule.register(),
    WorkerAsyncRecoveryModule,
  ],
  providers: [{ provide: WORKER_PROCESSORS, useExisting: RECOVERY_PROCESSORS }],
})
export class WorkerAppModule {}
