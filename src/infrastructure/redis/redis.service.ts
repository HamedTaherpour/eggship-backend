import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { ApplicationLogger } from '../../common/observability/application-logger.service';
import { RedisClientFactory } from './redis-client.factory';

export interface RedisReadiness {
  configured: boolean;
  ready: boolean;
}

const REDIS_STARTUP_CONNECT_TIMEOUT_MS = 1_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: ApplicationLogger,
    private readonly clientFactory: RedisClientFactory,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (url === undefined) {
      this.logger.info(
        { module: 'redis', operation: 'bootstrap', enabled: false },
        'Redis infrastructure is disabled',
      );
      return;
    }

    this.client = this.clientFactory.createLifecycleClient(url);
    this.client.on('error', () => {
      this.logger.warn(
        { module: 'redis', operation: 'connection_degraded' },
        'Redis connection is unavailable; Redis-backed capabilities are disabled',
      );
    });
    let startupConnection: Promise<void> | undefined;
    try {
      startupConnection = this.client.connect();
      // A timeout may return before ioredis settles its connection promise.
      // Observe the eventual rejection so it cannot become unhandled.
      startupConnection.catch(() => undefined);
      await this.withStartupTimeout(startupConnection);
      if (this.client.status === 'ready') {
        this.logger.info(
          { module: 'redis', operation: 'connect', enabled: true },
          'Redis connection established',
        );
      }
    } catch {
      // A failed startup is a terminal degraded state for this lifecycle
      // client. Stop the in-flight ioredis attempt now so it cannot continue
      // opening/retrying after Nest teardown; successful clients retain their
      // normal reconnect behavior during application operation.
      this.client.disconnect(false);
      this.client = undefined;
      this.logger.warn(
        { module: 'redis', operation: 'connect', enabled: true },
        'Redis connection unavailable; API will start degraded',
      );
    }
  }

  isConfigured(): boolean {
    return this.config.get<string>('REDIS_URL') !== undefined;
  }

  /**
   * Returns the connected Redis command client, or undefined when Redis is
   * disabled or not ready. OTP and other Redis-backed capabilities must fail
   * closed when this is undefined—never fall back to in-memory state.
   */
  getCommandClient(): Redis | undefined {
    if (this.client === undefined || this.client.status !== 'ready') {
      return undefined;
    }
    return this.client;
  }

  async readiness(): Promise<RedisReadiness> {
    if (this.client === undefined) {
      return { configured: this.isConfigured(), ready: false };
    }
    if (this.client.status !== 'ready') {
      return { configured: true, ready: false };
    }
    try {
      return {
        configured: true,
        ready: (await this.client.ping()) === 'PONG',
      };
    } catch {
      this.logger.warn(
        { module: 'redis', operation: 'readiness' },
        'Redis readiness check failed',
      );
      return { configured: true, ready: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client === undefined) {
      return;
    }
    try {
      if (client.status === 'ready') {
        await client.quit();
      } else {
        client.disconnect(false);
      }
    } catch {
      client.disconnect(false);
      this.logger.warn(
        { module: 'redis', operation: 'disconnect' },
        'Redis connection required forced shutdown',
      );
    }
  }

  private async withStartupTimeout(connection: Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        connection,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Redis startup connection timed out.')),
            REDIS_STARTUP_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
