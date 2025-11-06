import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import winston from 'winston';

/**
 * Observability Package
 *
 * Auto-instruments engines with:
 * - Prometheus metrics
 * - Structured logging
 * - Distributed tracing (optional)
 */

export class Observability {
  private registry: Registry;
  private logger: winston.Logger;

  // Metrics
  public jobsTotal: Counter;
  public jobsSuccessful: Counter;
  public jobsFailed: Counter;
  public jobDuration: Histogram;
  public resourcesAvailable: Gauge;
  public trustScoreGauge: Gauge;

  constructor(engineName: string, options: ObservabilityOptions = {}) {
    this.registry = new Registry();
    this.setupMetrics(engineName);
    this.setupLogger(engineName, options.logLevel || 'info');
  }

  private setupMetrics(engineName: string) {
    const labels = { engine: engineName };

    this.jobsTotal = new Counter({
      name: 'mist_jobs_total',
      help: 'Total number of jobs submitted',
      labelNames: ['engine', 'status'],
      registers: [this.registry]
    });

    this.jobsSuccessful = new Counter({
      name: 'mist_jobs_successful_total',
      help: 'Total number of successful jobs',
      labelNames: ['engine'],
      registers: [this.registry]
    });

    this.jobsFailed = new Counter({
      name: 'mist_jobs_failed_total',
      help: 'Total number of failed jobs',
      labelNames: ['engine', 'error_type'],
      registers: [this.registry]
    });

    this.jobDuration = new Histogram({
      name: 'mist_job_duration_seconds',
      help: 'Job execution duration in seconds',
      labelNames: ['engine', 'resource_type'],
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
      registers: [this.registry]
    });

    this.resourcesAvailable = new Gauge({
      name: 'mist_resources_available',
      help: 'Number of available resources',
      labelNames: ['engine', 'type', 'region'],
      registers: [this.registry]
    });

    this.trustScoreGauge = new Gauge({
      name: 'mist_trust_score',
      help: 'Current trust score',
      labelNames: ['engine', 'user_id'],
      registers: [this.registry]
    });
  }

  private setupLogger(engineName: string, logLevel: string) {
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { engine: engineName },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, engine, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} [${engine}] ${level}: ${message} ${metaStr}`;
            })
          )
        })
      ]
    });
  }

  /**
   * Get Prometheus metrics
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Log info message
   */
  info(message: string, meta?: Record<string, any>) {
    this.logger.info(message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: Record<string, any>) {
    this.logger.warn(message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, meta?: Record<string, any>) {
    this.logger.error(message, { ...meta, error: error?.message, stack: error?.stack });
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: Record<string, any>) {
    this.logger.debug(message, meta);
  }

  /**
   * Track job submission
   */
  trackJobSubmitted(status: string = 'pending') {
    this.jobsTotal.inc({ status });
  }

  /**
   * Track job completion
   */
  trackJobCompleted(durationSeconds: number, resourceType: string) {
    this.jobsSuccessful.inc();
    this.jobDuration.observe({ resource_type: resourceType }, durationSeconds);
  }

  /**
   * Track job failure
   */
  trackJobFailed(errorType: string) {
    this.jobsFailed.inc({ error_type: errorType });
  }

  /**
   * Update resource availability gauge
   */
  updateResourceAvailability(count: number, type: string, region: string) {
    this.resourcesAvailable.set({ type, region }, count);
  }

  /**
   * Update trust score gauge
   */
  updateTrustScore(userId: string, score: number) {
    this.trustScoreGauge.set({ user_id: userId }, score);
  }

  /**
   * Time a function execution
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = (Date.now() - start) / 1000;
      this.info(`${label} completed`, { duration_seconds: duration });
      return result;
    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      this.error(`${label} failed`, error as Error, { duration_seconds: duration });
      throw error;
    }
  }
}

export interface ObservabilityOptions {
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  enableTracing?: boolean;
}

export default Observability;
