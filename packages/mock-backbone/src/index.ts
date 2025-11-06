import express from 'express';
import { User, Resource, Job, TrustScore, Transaction } from '@mist/types';

/**
 * Mock Backbone for Testing
 *
 * This provides a fake backbone that engines can test against locally
 * without needing the full infrastructure stack.
 */
export class MockBackbone {
  private app: express.Application;
  private server: any;
  private port: number;

  private users: Map<string, User> = new Map();
  private resources: Map<string, Resource> = new Map();
  private jobs: Map<string, Job> = new Map();
  private trustScores: Map<string, TrustScore> = new Map();
  private transactions: Map<string, Transaction> = new Map();

  constructor(port: number = 8081) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
    this.seedData();
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Mock Backbone running on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock Backbone stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'mock-backbone', mode: 'test' });
    });

    // Trust Engine APIs
    this.app.get('/api/v1/trust/:userId', (req, res) => {
      const trustScore = this.trustScores.get(req.params.userId);
      if (!trustScore) {
        return res.status(404).json({ error: 'Trust score not found' });
      }
      res.json(trustScore);
    });

    this.app.get('/api/v1/trust/:userId/history', (req, res) => {
      // Return mock history
      const trustScore = this.trustScores.get(req.params.userId);
      if (!trustScore) {
        return res.status(404).json({ error: 'Trust score not found' });
      }
      res.json([trustScore]); // Simplified
    });

    this.app.post('/api/v1/trust/:userId/recalculate', (req, res) => {
      const trustScore = this.trustScores.get(req.params.userId);
      if (!trustScore) {
        return res.status(404).json({ error: 'Trust score not found' });
      }
      // Mock recalculation
      trustScore.score = Math.min(100, trustScore.score + 1);
      trustScore.computed_at = new Date();
      res.json(trustScore);
    });

    // Scheduler APIs
    this.app.post('/api/v1/schedule/:jobId', (req, res) => {
      const job = this.jobs.get(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Mock scheduling decision
      const resources = Array.from(this.resources.values());
      if (resources.length === 0) {
        return res.status(404).json({ error: 'No resources available' });
      }

      const resource = resources[0];
      job.resource_id = resource.id;
      job.status = 'scheduled' as any;

      res.json({
        job_id: job.id,
        resource_id: resource.id,
        score: 85.0,
        reasoning: {
          constraints_met: true,
          objective_scores: {
            minimize_cost: 80,
            minimize_latency: 90,
            maximize_trust: 85,
            maximize_availability: 90
          },
          final_score: 85.0
        }
      });
    });

    // Resource APIs
    this.app.post('/api/v1/resources', (req, res) => {
      const resource: Resource = {
        id: crypto.randomUUID(),
        ...req.body,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.resources.set(resource.id, resource);
      res.status(201).json(resource);
    });

    this.app.get('/api/v1/resources', (req, res) => {
      const resources = Array.from(this.resources.values());
      res.json(resources);
    });

    this.app.get('/api/v1/resources/:id', (req, res) => {
      const resource = this.resources.get(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json(resource);
    });

    this.app.patch('/api/v1/resources/:id', (req, res) => {
      const resource = this.resources.get(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      Object.assign(resource, req.body, { updated_at: new Date() });
      res.json(resource);
    });

    // Job APIs
    this.app.post('/api/v1/jobs', (req, res) => {
      const job: Job = {
        id: crypto.randomUUID(),
        ...req.body,
        status: 'pending' as any,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.jobs.set(job.id, job);
      res.status(201).json(job);
    });

    this.app.get('/api/v1/jobs/:id', (req, res) => {
      const job = this.jobs.get(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    });

    // Catch-all
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Mock endpoint ${req.method} ${req.path} not implemented`
      });
    });
  }

  private seedData() {
    // Seed test user
    const testUser: User = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      trust_score: 75.0,
      tier: 'pro' as any,
      kyc_status: 'lite' as any,
      wallets: [],
      devices: [],
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };
    this.users.set(testUser.id, testUser);

    // Seed trust score
    const trustScore: TrustScore = {
      user_id: testUser.id,
      score: 75.0,
      components: {
        completion_rate: 80,
        user_ratings: 75,
        uptime: 70,
        transaction_volume: 60,
        dispute_rate: 5,
        compliance_score: 90,
        tenure_days: 30
      },
      computed_at: new Date()
    };
    this.trustScores.set(testUser.id, trustScore);
  }

  // Test helpers
  getResource(id: string): Resource | undefined {
    return this.resources.get(id);
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getTrustScore(userId: string): TrustScore | undefined {
    return this.trustScores.get(userId);
  }

  clearData() {
    this.resources.clear();
    this.jobs.clear();
    this.transactions.clear();
    this.seedData(); // Re-seed test user
  }
}

export default MockBackbone;
