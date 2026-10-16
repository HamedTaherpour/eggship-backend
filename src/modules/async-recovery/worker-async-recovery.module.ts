import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueInfrastructureModule } from '../../infrastructure/queue/queue-infrastructure.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';
import { RECOVERY_PROCESSORS } from './domain/async-recovery';
import { AsyncRecoveryService } from './application/async-recovery.service';
import { AsyncRecoveryRepository } from './infrastructure/async-recovery.repository';
import { WorkerNotificationsModule } from '../notifications/worker-notifications.module';
import { OrderStatusNotificationProcessor } from '../notifications/application/order-status-notification.processor';
import { FcmPushDeliveryProvider } from '../notifications/infrastructure/fcm-push-delivery.provider';
import { PUSH_DELIVERY_PROVIDER } from '../notifications/domain/push-delivery-provider';

/**
 * Worker-only async-recovery dependencies. The admin API module imports Auth;
 * the worker needs the service but none of that HTTP/auth composition.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    QueueInfrastructureModule,
    WorkerNotificationsModule,
  ],
  providers: [
    AsyncRecoveryRepository,
    AsyncRecoveryService,
    FcmPushDeliveryProvider,
    { provide: PUSH_DELIVERY_PROVIDER, useExisting: FcmPushDeliveryProvider },
    OrderStatusNotificationProcessor,
    {
      provide: RECOVERY_PROCESSORS,
      useFactory: (
        processor: OrderStatusNotificationProcessor,
      ): OrderStatusNotificationProcessor[] => [processor],
      inject: [OrderStatusNotificationProcessor],
    },
  ],
  exports: [AsyncRecoveryService, RECOVERY_PROCESSORS],
})
export class WorkerAsyncRecoveryModule {}
