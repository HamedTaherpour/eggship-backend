import { PassThrough } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { ApplicationLogger } from '../../common/observability/application-logger.service';
import { RequestContextService } from '../../common/observability/request-context.service';
import { RedisClientFactory } from '../redis/redis-client.factory';
import { QueueFactory } from './queue.factory';

describe('QueueFactory', () => {
  it('rejects queue construction when Redis is disabled', () => {
    const logger = new ApplicationLogger(
      new ConfigService({
        NODE_ENV: 'test',
        APP_VERSION: '0.1.0-test',
        GIT_SHA: 'test',
      }),
      new RequestContextService(),
      new PassThrough(),
    );
    const factory = new QueueFactory(
      new ConfigService(),
      new RedisClientFactory(),
      logger,
    );

    expect(() => factory.create('unconfigured')).toThrow(
      'Cannot create a queue when REDIS_URL is not configured.',
    );
  });

  it('rejects queue names that contain colon separators', () => {
    const logger = new ApplicationLogger(
      new ConfigService({
        NODE_ENV: 'test',
        APP_VERSION: '0.1.0-test',
        GIT_SHA: 'test',
      }),
      new RequestContextService(),
      new PassThrough(),
    );
    const factory = new QueueFactory(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6379' }),
      new RedisClientFactory(),
      logger,
    );

    expect(() => factory.create('eggship:bad')).toThrow(
      'Queue name cannot contain ":"',
    );
  });

  it('force-closes a non-ready owned connection exactly once', async () => {
    const logger = new ApplicationLogger(
      new ConfigService({
        NODE_ENV: 'test',
        APP_VERSION: '0.1.0-test',
        GIT_SHA: 'test',
      }),
      new RequestContextService(),
      new PassThrough(),
    );
    const client = new Redis('redis://127.0.0.1:6379/2', {
      lazyConnect: true,
    });
    const quit = jest.spyOn(client, 'quit');
    const disconnect = jest.spyOn(client, 'disconnect');
    const clientFactory = {
      createQueueClient: jest.fn(() => client),
    } as unknown as RedisClientFactory;
    const factory = new QueueFactory(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6379/2' }),
      clientFactory,
      logger,
    );
    const close = jest
      .spyOn(Queue.prototype, 'close')
      .mockResolvedValue(undefined);

    factory.create('owned-queue');
    await factory.onModuleDestroy();
    await factory.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });

  it('gracefully quits a ready owned connection without duplicate closure', async () => {
    const logger = new ApplicationLogger(
      new ConfigService({
        NODE_ENV: 'test',
        APP_VERSION: '0.1.0-test',
        GIT_SHA: 'test',
      }),
      new RequestContextService(),
      new PassThrough(),
    );
    const client = new Redis('redis://127.0.0.1:6379/2', {
      lazyConnect: true,
    });
    Object.defineProperty(client, 'status', { value: 'ready' });
    const quit = jest.spyOn(client, 'quit').mockResolvedValue('OK');
    const disconnect = jest.spyOn(client, 'disconnect');
    const clientFactory = {
      createQueueClient: jest.fn(() => client),
    } as unknown as RedisClientFactory;
    const factory = new QueueFactory(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6379/2' }),
      clientFactory,
      logger,
    );
    const close = jest
      .spyOn(Queue.prototype, 'close')
      .mockResolvedValue(undefined);

    factory.create('ready-queue');
    await factory.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    close.mockRestore();
  });
});
