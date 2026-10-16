import { Test } from '@nestjs/testing';
import { RECOVERY_PROCESSORS } from './modules/async-recovery/domain/async-recovery';
import { AsyncRecoveryService } from './modules/async-recovery/application/async-recovery.service';
import { OrderStatusNotificationProcessor } from './modules/notifications/application/order-status-notification.processor';
import { FcmPushDeliveryProvider } from './modules/notifications/infrastructure/fcm-push-delivery.provider';
import { WORKER_PROCESSORS } from './infrastructure/worker/worker.tokens';

const originalWorkerEnvironment = {
  REDIS_URL: process.env['REDIS_URL'],
  FCM_PROJECT_ID: process.env['FCM_PROJECT_ID'],
  FCM_CLIENT_EMAIL: process.env['FCM_CLIENT_EMAIL'],
  FCM_PRIVATE_KEY: process.env['FCM_PRIVATE_KEY'],
};
process.env['REDIS_URL'] = 'redis://worker-test.invalid:6379';
process.env['FCM_PROJECT_ID'] = 'worker-test';
process.env['FCM_CLIENT_EMAIL'] = 'worker-test@example.invalid';
process.env['FCM_PRIVATE_KEY'] =
  '-----BEGIN PRIVATE KEY-----\nworker-test\n-----END PRIVATE KEY-----';

describe('WorkerAppModule recovery wiring', () => {
  afterAll(() => {
    restore('REDIS_URL', originalWorkerEnvironment.REDIS_URL);
    restore('FCM_PROJECT_ID', originalWorkerEnvironment.FCM_PROJECT_ID);
    restore('FCM_CLIENT_EMAIL', originalWorkerEnvironment.FCM_CLIENT_EMAIL);
    restore('FCM_PRIVATE_KEY', originalWorkerEnvironment.FCM_PRIVATE_KEY);
  });

  it('injects the registered notification processor into recovery', async () => {
    const { WorkerAppModule } = await import('./worker.module');
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerAppModule],
    })
      .overrideProvider(FcmPushDeliveryProvider)
      .useValue({ send: jest.fn() })
      .compile();

    try {
      const recovery = moduleRef.get(AsyncRecoveryService);
      const processors = moduleRef.get<readonly unknown[]>(RECOVERY_PROCESSORS);
      const workerProcessors =
        moduleRef.get<readonly unknown[]>(WORKER_PROCESSORS);
      expect(processors).toHaveLength(1);
      expect(processors[0]).toBeInstanceOf(OrderStatusNotificationProcessor);
      expect(workerProcessors).toBe(processors);
      expect(recovery).toBeDefined();
    } finally {
      await moduleRef.close();
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
