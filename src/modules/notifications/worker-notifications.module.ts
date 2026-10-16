import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { NotificationDeliveryRepository } from './infrastructure/notification-delivery.repository';
import { NotificationRepository } from './infrastructure/notification.repository';
import { PushInstallationRepository } from './infrastructure/push-installation.repository';

/**
 * Worker-only notification dependencies. Keep HTTP controllers and AuthModule
 * out of the non-HTTP worker composition root.
 */
@Module({
  imports: [PrismaModule, OutboxModule],
  providers: [
    NotificationRepository,
    NotificationDeliveryRepository,
    PushInstallationRepository,
  ],
  exports: [
    NotificationRepository,
    NotificationDeliveryRepository,
    PushInstallationRepository,
  ],
})
export class WorkerNotificationsModule {}
