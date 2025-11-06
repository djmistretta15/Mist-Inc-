import { Pool } from 'pg';
import { EventBus } from '@mist/event-bus';
import {
  Job,
  Resource,
  SchedulingPolicy,
  SchedulingDecision,
  EventType,
  Event,
  JobStatus
} from '@mist/types';
import { PolicyEngine } from './policy-engine';

export class Scheduler {
  private pool: Pool;
  private eventBus: EventBus;
  private policyEngine: PolicyEngine;
  private isRunning: boolean;

  constructor(pool: Pool, eventBus: EventBus) {
    this.pool = pool;
    this.eventBus = eventBus;
    this.policyEngine = new PolicyEngine(pool);
    this.isRunning = false;
  }

  async initialize(): Promise<void> {
    // Load policies
    await this.policyEngine.loadPolicies();

    // Subscribe to job submission events
    this.eventBus.on(EventType.JOB_SUBMITTED, this.handleJobSubmitted.bind(this));
    this.eventBus.on(EventType.RESOURCE_AVAILABLE, this.handleResourceAvailable.bind(this));

    // Start event consumer
    this.eventBus.startConsuming().catch(err => {
      console.error('Error consuming events in scheduler:', err);
    });

    // Start periodic scheduling
    this.startPeriodicScheduling();

    console.log('Scheduler initialized');
  }

  /**
   * Schedule a job to a resource
   */
  async scheduleJob(jobId: string): Promise<SchedulingDecision | null> {
    const client = await this.pool.connect();
    try {
      // Get job details
      const jobResult = await client.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
      if (jobResult.rows.length === 0) {
        throw new Error('Job not found');
      }
      const job: Job = jobResult.rows[0];

      // Find available resources
      const availableResources = await this.findAvailableResources(job);
      if (availableResources.length === 0) {
        console.log(`No available resources for job ${jobId}`);
        return null;
      }

      // Score and rank resources using policy engine
      const scoredResources = await this.policyEngine.scoreResources(job, availableResources);
      if (scoredResources.length === 0) {
        console.log(`No resources passed constraints for job ${jobId}`);
        return null;
      }

      // Select best resource
      const bestMatch = scoredResources[0];
      const resource = availableResources.find(r => r.id === bestMatch.resourceId)!;

      // Create scheduling decision
      const decision: SchedulingDecision = {
        id: crypto.randomUUID(),
        job_id: jobId,
        resource_id: resource.id,
        policy_id: bestMatch.policyId,
        score: bestMatch.score,
        reasoning: bestMatch.reasoning,
        timestamp: new Date()
      };

      // Update job status and resource
      await client.query('BEGIN');

      await client.query(
        'UPDATE jobs SET status = $1, resource_id = $2, updated_at = NOW() WHERE id = $3',
        [JobStatus.SCHEDULED, resource.id, jobId]
      );

      await client.query(
        'UPDATE resources SET capacity_used = capacity_used + 1, updated_at = NOW() WHERE id = $1',
        [resource.id]
      );

      await client.query(
        'INSERT INTO scheduling_decisions (id, job_id, resource_id, policy_id, score, reasoning, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [decision.id, decision.job_id, decision.resource_id, decision.policy_id, decision.score, JSON.stringify(decision.reasoning), decision.timestamp]
      );

      await client.query('COMMIT');

      // Emit event
      await this.eventBus.publish({
        source: 'scheduler',
        type: EventType.JOB_SCHEDULED,
        actor_id: job.user_id,
        resource_id: resource.id,
        data: {
          job_id: jobId,
          resource_id: resource.id,
          score: decision.score,
          reasoning: decision.reasoning
        }
      });

      console.log(`Scheduled job ${jobId} to resource ${resource.id} (score: ${decision.score})`);

      return decision;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error scheduling job:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find available resources that match job constraints
   */
  private async findAvailableResources(job: Job): Promise<Resource[]> {
    const client = await this.pool.connect();
    try {
      const constraints = job.constraints || {};

      // Build query dynamically based on constraints
      let query = `
        SELECT r.*
        FROM resources r
        WHERE r.engine = $1
        AND r.status = 'available'
        AND r.capacity_used < r.capacity_total
      `;
      const params: any[] = [job.engine];
      let paramIndex = 2;

      // Region constraints
      if (constraints.preferred_regions && constraints.preferred_regions.length > 0) {
        query += ` AND r.region = ANY($${paramIndex})`;
        params.push(constraints.preferred_regions);
        paramIndex++;
      }

      if (constraints.exclude_regions && constraints.exclude_regions.length > 0) {
        query += ` AND r.region != ALL($${paramIndex})`;
        params.push(constraints.exclude_regions);
        paramIndex++;
      }

      // Trust score constraint
      if (constraints.min_trust_score) {
        query += ` AND r.trust_score >= $${paramIndex}`;
        params.push(constraints.min_trust_score);
        paramIndex++;
      }

      // Price constraint
      if (constraints.max_price) {
        query += ` AND r.price_per_unit <= $${paramIndex}`;
        params.push(constraints.max_price);
        paramIndex++;
      }

      query += ' ORDER BY r.trust_score DESC, r.price_per_unit ASC LIMIT 50';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Periodic scheduling loop for pending jobs
   */
  private startPeriodicScheduling(): void {
    this.isRunning = true;
    this.schedulePendingJobs();
  }

  private async schedulePendingJobs(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const client = await this.pool.connect();
      try {
        // Get pending jobs
        const result = await client.query(`
          SELECT id FROM jobs
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 10
        `);

        for (const row of result.rows) {
          try {
            await this.scheduleJob(row.id);
          } catch (err) {
            console.error(`Error scheduling job ${row.id}:`, err);
          }
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error in periodic scheduling:', err);
    }

    // Schedule next run
    setTimeout(() => this.schedulePendingJobs(), 5000);  // Every 5 seconds
  }

  // Event handlers

  private async handleJobSubmitted(event: Event): Promise<void> {
    const { job_id } = event.data;
    if (job_id) {
      // Attempt immediate scheduling
      try {
        await this.scheduleJob(job_id);
      } catch (err) {
        console.error(`Failed to schedule job ${job_id}:`, err);
      }
    }
  }

  private async handleResourceAvailable(event: Event): Promise<void> {
    // When a new resource becomes available, try to schedule waiting jobs
    console.log('Resource became available, checking pending jobs...');
    await this.schedulePendingJobs();
  }
}
