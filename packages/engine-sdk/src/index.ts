import axios, { AxiosInstance } from 'axios';
import { EventBus } from '@mist/event-bus';
import {
  ArbitrageEnginePlugin,
  Resource,
  Availability,
  Job,
  JobResult,
  JobConstraints,
  EventType,
  Event,
  ResourceStatus
} from '@mist/types';

export interface MistBackboneConfig {
  backboneUrl: string;
  apiKey: string;
  engineName: string;
  redisUrl: string;
}

/**
 * Base class for Mist arbitrage engine plugins
 *
 * Usage:
 *
 * class MyEngine extends MistEngine {
 *   async listResources() { ... }
 *   async submitJob(job) { ... }
 *   // etc.
 * }
 *
 * const engine = new MyEngine(config);
 * await engine.initialize({});
 */
export abstract class MistEngine implements ArbitrageEnginePlugin {
  abstract name: string;
  abstract version: string;
  abstract description: string;

  protected config: MistBackboneConfig;
  protected api: AxiosInstance;
  protected eventBus: EventBus;

  constructor(config: MistBackboneConfig) {
    this.config = config;
    this.api = axios.create({
      baseURL: config.backboneUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Engine-Name': config.engineName
      }
    });
    this.eventBus = new EventBus(config.redisUrl, config.engineName);
  }

  async initialize(config: Record<string, any>): Promise<void> {
    await this.eventBus.connect();
    console.log(`${this.name} v${this.version} initialized`);
  }

  async shutdown(): Promise<void> {
    await this.eventBus.disconnect();
    console.log(`${this.name} shut down`);
  }

  // Abstract methods that must be implemented
  abstract listResources(): Promise<Resource[]>;
  abstract getResource(resourceId: string): Promise<Resource>;
  abstract getAvailability(resourceId: string): Promise<Availability>;
  abstract submitJob(job: Job): Promise<string>;
  abstract getJobStatus(jobId: string): Promise<Job>;
  abstract cancelJob(jobId: string): Promise<void>;
  abstract reportCompletion(jobId: string, result: JobResult): Promise<void>;
  abstract reportIssue(jobId: string, issue: string): Promise<void>;
  abstract getPrice(resourceId: string, constraints: JobConstraints): Promise<number>;

  // Event methods
  on(event: EventType, handler: (data: Event) => void): void {
    this.eventBus.on(event, handler);
  }

  emit(event: EventType, data: Record<string, any>): void {
    this.eventBus.publish({
      source: this.name,
      type: event,
      data
    });
  }

  // Helper methods for common operations

  /**
   * Register a resource with the backbone
   */
  protected async registerResource(resource: Omit<Resource, 'id' | 'created_at' | 'updated_at'>): Promise<Resource> {
    const response = await this.api.post('/api/v1/resources', resource);
    return response.data;
  }

  /**
   * Update resource status
   */
  protected async updateResourceStatus(resourceId: string, status: ResourceStatus): Promise<void> {
    await this.api.patch(`/api/v1/resources/${resourceId}`, { status });

    // Emit event
    if (status === ResourceStatus.AVAILABLE) {
      this.emit(EventType.RESOURCE_AVAILABLE, { resource_id: resourceId });
    } else if (status === ResourceStatus.OFFLINE) {
      this.emit(EventType.RESOURCE_UNAVAILABLE, { resource_id: resourceId });
    }
  }

  /**
   * Report job completion to trust engine
   */
  protected async reportJobCompletion(job: Job, result: JobResult): Promise<void> {
    this.emit(EventType.JOB_COMPLETED, {
      job_id: job.id,
      user_id: job.user_id,
      resource_id: job.resource_id,
      success: result.success,
      duration_seconds: result.metrics.duration_seconds,
      cost: result.metrics.cost
    });
  }

  /**
   * Report job failure
   */
  protected async reportJobFailure(job: Job, error: string): Promise<void> {
    this.emit(EventType.JOB_FAILED, {
      job_id: job.id,
      user_id: job.user_id,
      resource_id: job.resource_id,
      error
    });
  }

  /**
   * Start consuming events from the backbone
   */
  protected async startEventConsumer(): Promise<void> {
    this.eventBus.startConsuming().catch(err => {
      console.error(`Error consuming events in ${this.name}:`, err);
    });
  }
}

/**
 * Helper function to create a basic engine configuration
 */
export function createEngineConfig(
  engineName: string,
  backboneUrl: string = 'http://localhost:8080',
  apiKey: string = process.env.MIST_API_KEY || '',
  redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379'
): MistBackboneConfig {
  return {
    engineName,
    backboneUrl,
    apiKey,
    redisUrl
  };
}

export * from '@mist/types';
export { EventBus } from '@mist/event-bus';
