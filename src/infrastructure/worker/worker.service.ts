import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import { ApplicationLogger } from '../../common/observability/application-logger.service';
import { AsyncJobContextService } from '../queue/async-job-context.service';
import type { AsyncJobEnvelope } from '../queue/async-job-context.service';
import { QueueFailureReporter } from '../queue/queue-failure-reporter.service';
import { RedisClientFactory } from '../redis/redis-client.factory';
import { buildWorkerRuntimePolicy } from '../queue/queue-options';
import type { WorkerProcessor } from './worker.types';

type EggShipWorker = Worker<AsyncJobEnvelope<unknown>, void, string>;

@Injectable()
export class WorkerService {
  private workers: Array<{ worker: EggShipWorker; connection: Redis }> = [];
  private stopping = false;
  private activeJobs = 0;
  private activeJobsDrained: Promise<void> = Promise.resolve();
  private resolveActiveJobsDrained?: () => void;
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly redisFactory: RedisClientFactory,
    private readonly context: AsyncJobContextService,
    private readonly failures: QueueFailureReporter,
    private readonly logger: ApplicationLogger,
  ) {}

  async start(processors: readonly WorkerProcessor[]): Promise<void> {
    if (processors.length === 0)
      throw new Error('Worker cannot start without an approved processor.');
    const policy = buildWorkerRuntimePolicy({
      concurrency: this.configuredNumber('WORKER_CONCURRENCY'),
    });
    const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
    try {
      for (const processor of processors) {
        const connection = this.redisFactory.createWorkerClient(redisUrl);
        let worker: EggShipWorker | undefined;
        try {
          // Establish the supplied client before constructing Worker. BullMQ
          // starts its blocking connection during construction; doing this
          // first keeps a failed startup from leaving an internal retry loop.
          await connection.connect();
          worker = new Worker<AsyncJobEnvelope<unknown>, void, string>(
            processor.queueName,
            async (job) => {
              if (
                processor.jobName !== undefined &&
                processor.jobName !== job.name
              )
                return;
              this.beginJob();
              const started = Date.now();
              const correlationId =
                job.data?.metadata?.correlationId ?? 'invalid';
              this.logger.info(
                {
                  module: 'worker',
                  operation: 'job_started',
                  queue: processor.queueName,
                  jobId: job.id,
                  jobName: job.name,
                  correlationId,
                  attemptNumber: job.attemptsMade + 1,
                },
                'Worker job started',
              );
              try {
                await this.context.runWithEnvelope(job.data, () =>
                  processor.process(job),
                );
                this.logger.info(
                  {
                    module: 'worker',
                    operation: 'job_completed',
                    queue: processor.queueName,
                    jobId: job.id,
                    jobName: job.name,
                    correlationId,
                    outboxEventId: (
                      job.data as { data?: { outboxEventId?: string } }
                    )?.data?.outboxEventId,
                    eventType: (job.data as { data?: { eventType?: string } })
                      ?.data?.eventType,
                    eventVersion: (
                      job.data as { data?: { eventVersion?: number } }
                    )?.data?.eventVersion,
                    processorIdentity:
                      processor.identity ??
                      `${processor.queueName}:${processor.jobName ?? job.name}`,
                    durationMs: Date.now() - started,
                  },
                  'Worker job completed',
                );
              } catch (error: unknown) {
                const normalized =
                  error instanceof Error
                    ? error
                    : new Error('Worker processor failed.');
                this.failures.report(
                  {
                    queueName: processor.queueName,
                    jobName: job.name,
                    jobId: job.id,
                    attemptsMade: job.attemptsMade + 1,
                    correlationId,
                    category: failureCategory(error),
                    reasonCode: failureReason(error),
                  },
                  normalized,
                );
                if (isPermanentProcessorFailure(error)) return;
                throw normalized;
              } finally {
                this.finishJob();
              }
            },
            {
              connection,
              // Gate BullMQ's retry loop on readiness. If initialization fails,
              // no background runRetryDelay timer is created before start()
              // reaches its failure cleanup path.
              autorun: false,
              concurrency: policy.concurrency,
              lockDuration: policy.lockDurationMs,
            },
          );
          worker.on('error', (error: Error) => {
            this.logger.error(
              {
                module: 'worker',
                operation: 'worker_error',
                queue: processor.queueName,
              },
              'Worker infrastructure error',
              error,
            );
          });
          this.workers.push({ worker, connection });
          await worker.waitUntilReady();
          void worker
            .run()
            .catch((error: unknown) =>
              worker?.emit(
                'error',
                error instanceof Error
                  ? error
                  : new Error('Worker run failed.'),
              ),
            );
        } catch (error: unknown) {
          if (worker === undefined) {
            connection.disconnect(false);
          }
          throw error;
        }
      }
    } catch (error: unknown) {
      // A worker that fails before readiness can still have an in-flight
      // BullMQ connection initialization. Force-close only this failed-start
      // path so that its partially initialized sockets cannot retry after the
      // composition root has already begun shutting down.
      await this.stop(true);
      throw error;
    }
    this.ready = true;
    this.logger.info(
      {
        module: 'worker',
        operation: 'ready',
        processorCount: processors.length,
        concurrency: policy.concurrency,
      },
      'Worker is ready',
    );
  }

  async stop(force = false): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.ready = false;
    this.logger.info(
      { module: 'worker', operation: 'stopping' },
      'Worker stopping',
    );
    const timeoutMs =
      this.configuredNumber('WORKER_SHUTDOWN_TIMEOUT_MS') ?? 30_000;
    await Promise.all(
      this.workers.map((resource) => resource.worker.pause(true)),
    );
    for (const resource of this.workers) {
      // BullMQ closes its duplicated blocking connection. The raw main
      // connection is shared by BullMQ and remains owned by this service.
      await this.closeWithGrace(resource.worker, timeoutMs, force);
      if (force || resource.connection.status !== 'ready') {
        resource.connection.disconnect(false);
      } else {
        await resource.connection.quit();
      }
    }
    this.workers = [];
    this.logger.info(
      { module: 'worker', operation: 'stopped' },
      'Worker stopped',
    );
  }

  isReady(): boolean {
    return this.ready;
  }

  private async closeWithGrace(
    worker: EggShipWorker,
    timeoutMs: number,
    force = false,
  ): Promise<void> {
    if (force) {
      await worker.close(true);
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.activeJobsDrained.then(() => 'closed' as const),
        new Promise<'timed_out'>((resolve) => {
          timer = setTimeout(() => resolve('timed_out'), timeoutMs);
        }),
      ]);
      if (result === 'timed_out') {
        await worker.close(true);
      } else {
        await worker.close();
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private beginJob(): void {
    if (this.activeJobs === 0) {
      this.activeJobsDrained = new Promise<void>((resolve) => {
        this.resolveActiveJobsDrained = resolve;
      });
    }
    this.activeJobs += 1;
  }

  private finishJob(): void {
    this.activeJobs -= 1;
    if (this.activeJobs === 0) {
      this.resolveActiveJobsDrained?.();
      this.resolveActiveJobsDrained = undefined;
    }
  }

  private configuredNumber(name: string): number | undefined {
    const value = this.config.get<number | string>(name);
    return value === undefined ? undefined : Number(value);
  }
}

function isPermanentProcessorFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    (error as { retryable?: unknown }).retryable === false
  );
}

function failureCategory(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    typeof (error as { category?: unknown }).category === 'string'
    ? (error as { category: string }).category
    : undefined;
}
function failureReason(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'reasonCode' in error &&
    typeof (error as { reasonCode?: unknown }).reasonCode === 'string'
    ? (error as { reasonCode: string }).reasonCode
    : undefined;
}
