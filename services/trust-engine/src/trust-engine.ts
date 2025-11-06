import { Pool } from 'pg';
import { EventBus } from '@mist/event-bus';
import {
  TrustScore,
  TrustComponents,
  TrustUpdate,
  EventType,
  Event
} from '@mist/types';

interface TrustConfig {
  decay_rate: number;  // 0.005 = 0.5% per week
  min_transactions: number;
  weights: {
    completion_rate: number;
    user_ratings: number;
    uptime: number;
    transaction_volume: number;
    dispute_rate: number;
    compliance_score: number;
    tenure: number;
  };
}

const DEFAULT_CONFIG: TrustConfig = {
  decay_rate: parseFloat(process.env.TRUST_DECAY_RATE || '0.005'),
  min_transactions: parseInt(process.env.TRUST_MIN_TRANSACTIONS || '5'),
  weights: {
    completion_rate: 0.25,
    user_ratings: 0.20,
    uptime: 0.15,
    transaction_volume: 0.10,
    dispute_rate: -0.15,  // Negative impact
    compliance_score: 0.20,
    tenure: 0.15
  }
};

export class TrustEngine {
  private pool: Pool;
  private eventBus: EventBus;
  private config: TrustConfig;

  constructor(pool: Pool, eventBus: EventBus, config: TrustConfig = DEFAULT_CONFIG) {
    this.pool = pool;
    this.eventBus = eventBus;
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Subscribe to relevant events
    this.eventBus.on(EventType.JOB_COMPLETED, this.handleJobCompleted.bind(this));
    this.eventBus.on(EventType.JOB_FAILED, this.handleJobFailed.bind(this));
    this.eventBus.on(EventType.PAYMENT_RELEASED, this.handlePaymentReleased.bind(this));
    this.eventBus.on(EventType.COMPLIANCE_VIOLATION, this.handleComplianceViolation.bind(this));

    // Start event consumer
    this.eventBus.startConsuming().catch(err => {
      console.error('Error consuming events in trust engine:', err);
    });

    // Start decay scheduler (every hour)
    setInterval(() => this.applyDecay(), 3600000);

    console.log('Trust Engine initialized');
  }

  /**
   * Calculate trust score for a user
   */
  async calculateTrustScore(userId: string, engine?: string): Promise<TrustScore> {
    const components = await this.getTrustComponents(userId, engine);
    const score = this.computeScore(components);

    const trustScore: TrustScore = {
      user_id: userId,
      engine,
      score: Math.max(0, Math.min(100, score)),
      components,
      computed_at: new Date()
    };

    // Store in database
    await this.storeTrustScore(trustScore);

    return trustScore;
  }

  /**
   * Get trust components for a user
   */
  private async getTrustComponents(userId: string, engine?: string): Promise<TrustComponents> {
    const client = await this.pool.connect();
    try {
      // Build query with optional engine filter
      const engineFilter = engine ? `AND engine = $2` : '';
      const params = engine ? [userId, engine] : [userId];

      // Get job statistics
      const jobStats = await client.query(`
        SELECT
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
        FROM jobs
        WHERE user_id = $1 ${engineFilter}
      `, params);

      // Get user ratings (stored in metadata for now)
      const ratingsResult = await client.query(`
        SELECT AVG((metadata->>'rating')::float) as avg_rating
        FROM jobs
        WHERE user_id = $1 ${engineFilter}
        AND metadata->>'rating' IS NOT NULL
      `, params);

      // Get uptime for resources provided by this user
      const uptimeResult = await client.query(`
        SELECT AVG(
          CASE
            WHEN status = 'available' THEN 1.0
            WHEN status = 'in_use' THEN 1.0
            ELSE 0.0
          END
        ) as uptime
        FROM resources
        WHERE provider_id = $1 ${engineFilter}
      `, params);

      // Get transaction volume
      const txVolume = await client.query(`
        SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(amount), 0) as total_amount
        FROM transactions
        WHERE user_id = $1
        AND status = 'completed'
      `, [userId]);

      // Get dispute rate
      const disputes = await client.query(`
        SELECT COUNT(*) as dispute_count
        FROM transactions
        WHERE user_id = $1
        AND status = 'disputed'
      `, [userId]);

      // Get compliance score (from audit logs)
      const compliance = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE result = 'success') as success_count,
          COUNT(*) as total_count
        FROM audit_logs
        WHERE actor_id = $1
      `, [userId]);

      // Get tenure (days since account creation)
      const tenure = await client.query(`
        SELECT EXTRACT(DAYS FROM NOW() - created_at) as tenure_days
        FROM users
        WHERE id = $1
      `, [userId]);

      const totalJobs = parseInt(jobStats.rows[0].total_jobs) || 0;
      const completedJobs = parseInt(jobStats.rows[0].completed_jobs) || 0;
      const totalTx = parseInt(txVolume.rows[0].tx_count) || 0;
      const disputeCount = parseInt(disputes.rows[0].dispute_count) || 0;
      const complianceSuccess = parseInt(compliance.rows[0].success_count) || 0;
      const complianceTotal = parseInt(compliance.rows[0].total_count) || 1;

      return {
        completion_rate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 50,
        user_ratings: parseFloat(ratingsResult.rows[0].avg_rating) || 50,
        uptime: (parseFloat(uptimeResult.rows[0].uptime) || 0.5) * 100,
        transaction_volume: Math.min(100, Math.log10(totalTx + 1) * 20),  // Logarithmic scale
        dispute_rate: totalTx > 0 ? (disputeCount / totalTx) * 100 : 0,
        compliance_score: (complianceSuccess / complianceTotal) * 100,
        tenure_days: parseInt(tenure.rows[0].tenure_days) || 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Compute weighted trust score from components
   */
  private computeScore(components: TrustComponents): number {
    const { weights } = this.config;

    let score = 0;
    score += components.completion_rate * weights.completion_rate;
    score += components.user_ratings * weights.user_ratings;
    score += components.uptime * weights.uptime;
    score += components.transaction_volume * weights.transaction_volume;
    score += components.dispute_rate * weights.dispute_rate;  // Negative
    score += components.compliance_score * weights.compliance_score;
    score += Math.min(100, components.tenure_days / 365 * 100) * weights.tenure;

    return score;
  }

  /**
   * Store trust score in database
   */
  private async storeTrustScore(trustScore: TrustScore): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update user's trust score
      await client.query(`
        UPDATE users
        SET trust_score = $1, updated_at = NOW()
        WHERE id = $2
      `, [trustScore.score, trustScore.user_id]);

      // Store in time-series table
      await client.query(`
        INSERT INTO trust_scores (time, user_id, engine, score, components)
        VALUES (NOW(), $1, $2, $3, $4)
      `, [
        trustScore.user_id,
        trustScore.engine,
        trustScore.score,
        JSON.stringify(trustScore.components)
      ]);

      // Emit event
      await this.eventBus.publish({
        source: 'trust-engine',
        type: EventType.TRUST_UPDATED,
        actor_id: trustScore.user_id,
        data: {
          score: trustScore.score,
          engine: trustScore.engine,
          components: trustScore.components
        }
      });
    } finally {
      client.release();
    }
  }

  /**
   * Apply decay to inactive users
   */
  private async applyDecay(): Promise<void> {
    console.log('Applying trust decay to inactive users...');

    const client = await this.pool.connect();
    try {
      // Find users with no activity in the past week
      const result = await client.query(`
        UPDATE users
        SET
          trust_score = GREATEST(0, trust_score * (1 - $1)),
          updated_at = NOW()
        WHERE
          updated_at < NOW() - INTERVAL '7 days'
          AND trust_score > 0
        RETURNING id, trust_score
      `, [this.config.decay_rate]);

      console.log(`Applied decay to ${result.rowCount} users`);

      // Emit events for significant drops
      for (const row of result.rows) {
        if (row.trust_score < 50) {
          await this.eventBus.publish({
            source: 'trust-engine',
            type: EventType.TRUST_THRESHOLD_CROSSED,
            actor_id: row.id,
            data: {
              score: row.trust_score,
              threshold: 50,
              direction: 'below'
            }
          });
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Get trust score for a user
   */
  async getTrustScore(userId: string, engine?: string): Promise<TrustScore | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT time, user_id, engine, score, components
        FROM trust_scores
        WHERE user_id = $1 ${engine ? 'AND engine = $2' : ''}
        ORDER BY time DESC
        LIMIT 1
      `, engine ? [userId, engine] : [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        user_id: row.user_id,
        engine: row.engine,
        score: parseFloat(row.score),
        components: row.components,
        computed_at: row.time
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get trust score history
   */
  async getTrustHistory(userId: string, days: number = 30): Promise<TrustScore[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT time, user_id, engine, score, components
        FROM trust_scores
        WHERE user_id = $1
        AND time > NOW() - INTERVAL '${days} days'
        ORDER BY time ASC
      `, [userId]);

      return result.rows.map(row => ({
        user_id: row.user_id,
        engine: row.engine,
        score: parseFloat(row.score),
        components: row.components,
        computed_at: row.time
      }));
    } finally {
      client.release();
    }
  }

  // Event handlers

  private async handleJobCompleted(event: Event): Promise<void> {
    const { user_id } = event.data;
    if (user_id) {
      await this.calculateTrustScore(user_id);
    }
  }

  private async handleJobFailed(event: Event): Promise<void> {
    const { user_id } = event.data;
    if (user_id) {
      await this.calculateTrustScore(user_id);
    }
  }

  private async handlePaymentReleased(event: Event): Promise<void> {
    const { user_id } = event.data;
    if (user_id) {
      await this.calculateTrustScore(user_id);
    }
  }

  private async handleComplianceViolation(event: Event): Promise<void> {
    const { user_id } = event.data;
    if (user_id) {
      // Immediate recalculation on compliance violations
      await this.calculateTrustScore(user_id);
    }
  }
}
