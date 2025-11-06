# Mist Backbone Integration Guide

**Everything you need to integrate ANY arbitrage engine in < 1 hour.**

---

## 🚀 Quick Start (30 Seconds)

```bash
# 1. Create new engine
npx create-mist-engine my-arbitrage-engine

# 2. Install and run
cd my-arbitrage-engine
npm install
npm run dev
```

**That's it.** You now have a working engine connected to the backbone.

---

## 🎯 Integration Paths

Choose your path:

### **Path A: Greenfield Engine** (Start from scratch)
- Use CLI tool: `npx create-mist-engine`
- Implement 6 methods
- Deploy

**Time: 1-2 hours**

### **Path B: Existing System** (You have providers/jobs already)
- Install SDK: `npm install @mist/engine-sdk`
- Wrap your existing code in `MistEngine`
- Connect to backbone

**Time: 2-4 hours**

### **Path C: Just Testing** (No real integration yet)
- Use Mock Backbone
- Test locally without infrastructure
- Validate your idea

**Time: 15 minutes**

---

## 📦 What You Get for Free

When you integrate with Mist, you automatically get:

### **1. Cross-System Trust**
- Your users' reputation carries across all engines
- Higher trust = lower prices, priority access
- Automatic trust updates on job completion
- Trust decay for inactive users

### **2. Intelligent Scheduling**
- Jobs routed to best resources automatically
- Policies balance cost, latency, trust, availability
- Multi-objective optimization
- Pluggable constraints (region, compliance, etc.)

### **3. Event-Driven Architecture**
- Subscribe to events (job scheduled, trust updated, etc.)
- Emit events (job completed, resource available, etc.)
- No polling, everything is real-time
- Built-in retry and failure handling

### **4. Payments & Escrow**
- Automatic escrow on job start
- Instant payouts on completion
- Referral tracking
- Royalty splits

### **5. Compliance & Audit**
- GDPR/CCPA compliant by default
- Geofencing and data residency
- Tamper-evident audit logs
- 7-year retention

### **6. Observability**
- Prometheus metrics (job count, duration, success rate)
- Structured logging (Winston)
- Distributed tracing (OpenTelemetry)
- Grafana dashboards (coming soon)

### **7. GraphQL API**
- Query exactly what you need
- Real-time subscriptions (job status, trust scores)
- No over-fetching
- Auto-generated types

### **8. Developer Tools**
- Mock backbone for local testing
- CLI for scaffolding
- Testing harness
- Hot reload

---

## 🔌 The 6 Methods You Must Implement

Every engine implements these 6 core methods:

```typescript
class MyEngine extends MistEngine {
  // 1. List available resources (GPUs, memory, data, etc.)
  async listResources(): Promise<Resource[]>

  // 2. Get availability for a resource
  async getAvailability(resourceId: string): Promise<Availability>

  // 3. Submit a job for execution
  async submitJob(job: Job): Promise<string>

  // 4. Get job status
  async getJobStatus(jobId: string): Promise<Job>

  // 5. Cancel a running job
  async cancelJob(jobId: string): Promise<void>

  // 6. Get price for a resource
  async getPrice(resourceId: string, constraints: JobConstraints): Promise<number>
}
```

**That's it.** The SDK handles everything else.

---

## 🛠️ Integration Patterns

### **Pattern 1: Provider Network**

You have a network of resource providers (e.g., GPU owners, data sellers).

```typescript
class MyEngine extends MistEngine {
  async initialize(config: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // 1. Connect to your provider network
    await this.connectToProviders(config.provider_network_url);

    // 2. Register resources with backbone
    for (const provider of this.providers) {
      await this.registerResource({
        engine: this.name,
        provider_id: provider.id,
        type: ResourceType.GPU,
        specs: provider.specs,
        region: provider.region,
        status: ResourceStatus.AVAILABLE,
        price_per_unit: provider.price,
        trust_score: 50.0,
        capacity_total: provider.capacity,
        capacity_used: 0,
        metadata: {}
      });
    }

    // 3. Start health checks
    this.startHealthChecks();

    // 4. Listen for job assignments
    this.on(EventType.JOB_SCHEDULED, this.handleJobScheduled.bind(this));
    await this.startEventConsumer();
  }

  private async handleJobScheduled(event: any): Promise<void> {
    const { job_id, resource_id } = event.data;

    // Execute job on your provider network
    const result = await this.executeOnProvider(job_id, resource_id);

    // Report completion (updates trust scores)
    await this.reportJobCompletion(job, result);
  }
}
```

### **Pattern 2: API Wrapper**

You have an existing API (e.g., cloud GPU service, data marketplace).

```typescript
class MyEngine extends MistEngine {
  async listResources(): Promise<Resource[]> {
    // Call your existing API
    const response = await fetch(`${this.config.api_url}/resources`);
    const apiResources = await response.json();

    // Transform to Mist format
    return apiResources.map(r => ({
      id: r.id,
      engine: this.name,
      provider_id: r.owner_id,
      type: this.mapResourceType(r.type),
      specs: r.specs,
      region: r.region,
      status: this.mapStatus(r.status),
      price_per_unit: r.price,
      trust_score: 50.0,
      capacity_total: 1,
      capacity_used: r.in_use ? 1 : 0,
      availability: {
        is_available: !r.in_use,
        capacity_used: r.in_use ? 1 : 0,
        capacity_total: 1
      },
      metadata: {},
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at)
    }));
  }

  async submitJob(job: Job): Promise<string> {
    // Submit to your API
    const response = await fetch(`${this.config.api_url}/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        resource_id: job.resource_id,
        user_id: job.user_id,
        constraints: job.constraints
      })
    });

    const { job_id } = await response.json();
    return job_id;
  }
}
```

### **Pattern 3: Marketplace**

You're building a marketplace (e.g., data marketplace, GPU marketplace).

```typescript
class MyEngine extends MistEngine {
  async initialize(config: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Sellers list resources
    this.app.post('/api/list-resource', async (req, res) => {
      const resource = await this.registerResource({
        engine: this.name,
        provider_id: req.user.id,
        type: ResourceType.DATA,
        specs: req.body.specs,
        region: req.body.region,
        status: ResourceStatus.AVAILABLE,
        price_per_unit: req.body.price,
        trust_score: req.user.trust_score, // From backbone
        capacity_total: 1,
        capacity_used: 0,
        metadata: req.body.metadata
      });

      res.json(resource);
    });

    // Buyers purchase resources
    this.app.post('/api/purchase', async (req, res) => {
      const job = await this.submitJob({
        id: crypto.randomUUID(),
        user_id: req.user.id,
        engine: this.name,
        resource_id: req.body.resource_id,
        status: JobStatus.PENDING,
        constraints: req.body.constraints,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date()
      });

      res.json(job);
    });
  }
}
```

---

## 🧪 Testing Your Engine

### **Option 1: Mock Backbone** (Fastest)

```typescript
import { MockBackbone } from '@mist/mock-backbone';

describe('MyEngine', () => {
  let mockBackbone: MockBackbone;
  let engine: MyEngine;

  beforeAll(async () => {
    // Start mock backbone
    mockBackbone = new MockBackbone(8081);
    await mockBackbone.start();

    // Connect your engine
    const config = createEngineConfig('my-engine', 'http://localhost:8081');
    engine = new MyEngine(config);
    await engine.initialize({});
  });

  afterAll(async () => {
    await engine.shutdown();
    await mockBackbone.stop();
  });

  test('should register resources', async () => {
    const resources = await engine.listResources();
    expect(resources.length).toBeGreaterThan(0);

    // Verify resource was registered with backbone
    const registered = mockBackbone.getResource(resources[0].id);
    expect(registered).toBeDefined();
  });

  test('should submit and complete job', async () => {
    const jobId = await engine.submitJob({
      id: 'test-job',
      user_id: 'test-user',
      engine: 'my-engine',
      resource_id: 'test-resource',
      status: JobStatus.PENDING,
      constraints: {},
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    });

    expect(jobId).toBeDefined();

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 100));

    const job = await engine.getJobStatus(jobId);
    expect(job.status).toBe(JobStatus.COMPLETED);
  });
});
```

### **Option 2: Docker Compose** (Full stack)

```bash
# Start full backbone
docker-compose up -d

# Run your engine
npm run dev

# Test against real backbone
npm test
```

### **Option 3: Staging Environment** (Pre-production)

```bash
# Point to staging backbone
export BACKBONE_URL=https://staging.mist.com
export MIST_API_KEY=<your-staging-key>

npm run dev
```

---

## 📊 Observability Out of the Box

Every engine automatically gets metrics, logs, and traces.

### **Metrics (Prometheus)**

```typescript
import { Observability } from '@mist/observability';

const obs = new Observability('my-engine');

// Metrics are tracked automatically
obs.trackJobSubmitted();
obs.trackJobCompleted(durationSeconds, resourceType);
obs.trackJobFailed(errorType);
obs.updateResourceAvailability(count, type, region);
obs.updateTrustScore(userId, score);

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(await obs.getMetrics());
});
```

### **Logs (Winston)**

```typescript
obs.info('Job started', { job_id, resource_id });
obs.warn('Resource slow to respond', { resource_id, latency_ms });
obs.error('Job failed', error, { job_id, resource_id });
obs.debug('Scheduler decision', { score, reasoning });
```

### **Grafana Dashboard** (Coming soon)

Pre-built dashboard for:
- Job throughput
- Success rate
- Duration (p50, p95, p99)
- Resource utilization
- Trust score distribution

---

## 🔄 Auto-Discovery & Registration

Resources are automatically discovered and registered with the backbone.

### **Manual Registration**

```typescript
const resource = await this.registerResource({
  engine: this.name,
  provider_id: provider.id,
  type: ResourceType.GPU,
  specs: { gpu_model: 'A100', gpu_count: 8 },
  region: 'us-east-1',
  status: ResourceStatus.AVAILABLE,
  price_per_unit: 5.00,
  trust_score: 50.0,
  capacity_total: 8,
  capacity_used: 0,
  metadata: {}
});
```

### **Automatic Registration** (Coming soon)

Service registry will auto-discover engines and resources:

```typescript
// Engine announces itself
this.registry.announce({
  engine: this.name,
  version: this.version,
  endpoints: {
    api: 'http://my-engine:3000',
    metrics: 'http://my-engine:3000/metrics'
  },
  capabilities: ['gpu', 'vram', 'scheduling']
});

// Backbone discovers resources
this.registry.onResourceDiscovered(async (resource) => {
  console.log(`New resource discovered: ${resource.id}`);
});
```

---

## 🎨 GraphQL API (Alternative to REST)

Use GraphQL for more flexible queries:

```graphql
# Query resources with filters
query GetResources {
  resources(
    engine: "gp4u"
    type: GPU
    region: "us-east-1"
    minTrustScore: 70
    maxPrice: 5.00
    limit: 10
  ) {
    id
    specs
    pricePerUnit
    trustScore
    availability {
      isAvailable
      capacityUsed
      capacityTotal
    }
  }
}

# Submit job
mutation SubmitJob {
  submitJob(input: {
    engine: "gp4u"
    resourceId: "resource-123"
    constraints: {
      duration_hours: 10
      min_trust_score: 80
    }
  }) {
    id
    status
    price
  }
}

# Subscribe to real-time updates
subscription JobUpdates {
  jobUpdated(jobId: "job-123") {
    id
    status
    result
  }
}
```

**GraphQL Endpoint**: `http://localhost:4000/graphql`

---

## ⚡ Performance Optimizations

### **1. Caching**

The backbone caches frequently accessed data:

```typescript
// Trust scores cached for 1 hour
// Resource availability cached for 5 minutes
// Scheduling policies cached for 10 minutes
```

You can extend caching to your engine:

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

// Cache resource list
const cached = await redis.get(`resources:${this.name}`);
if (cached) {
  return JSON.parse(cached);
}

const resources = await this.fetchResourcesFromProvider();
await redis.setEx(`resources:${this.name}`, 300, JSON.stringify(resources)); // 5 min TTL
return resources;
```

### **2. Connection Pooling**

Database connections are pooled automatically:

```typescript
// PostgreSQL pool (max 20 connections)
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
});
```

### **3. Batch Operations**

Register multiple resources at once:

```typescript
// Instead of N individual calls
for (const resource of resources) {
  await this.registerResource(resource); // Slow
}

// Do batch registration (coming soon)
await this.registerResourcesBatch(resources); // Fast
```

### **4. Event Batching**

Events are batched and sent in groups:

```typescript
// Events are batched every 100ms or 10 events, whichever comes first
this.emit(EventType.JOB_COMPLETED, { job_id: '1' });
this.emit(EventType.JOB_COMPLETED, { job_id: '2' });
this.emit(EventType.JOB_COMPLETED, { job_id: '3' });
// All 3 sent together
```

---

## 🔐 Security Best Practices

### **1. API Keys**

Every engine needs an API key to authenticate with the backbone:

```bash
# .env
MIST_API_KEY=mist_live_abc123...
```

**Never commit API keys to git.**

### **2. mTLS** (Coming soon)

Mutual TLS between engines and backbone:

```typescript
const config = createEngineConfig('my-engine', 'https://backbone.mist.com', apiKey, redisUrl, {
  tls: {
    cert: fs.readFileSync('/path/to/cert.pem'),
    key: fs.readFileSync('/path/to/key.pem'),
    ca: fs.readFileSync('/path/to/ca.pem')
  }
});
```

### **3. Rate Limiting**

API calls are rate-limited by tier:

- **Free**: 100 req/min
- **Pro**: 1,000 req/min
- **Enterprise**: Unlimited

### **4. Input Validation**

Always validate inputs:

```typescript
import { z } from 'zod';

const JobInputSchema = z.object({
  resource_id: z.string().uuid(),
  user_id: z.string().uuid(),
  constraints: z.object({
    duration_hours: z.number().min(1).max(100)
  })
});

async submitJob(input: unknown): Promise<string> {
  const validated = JobInputSchema.parse(input); // Throws if invalid
  // ... proceed with validated data
}
```

---

## 🚢 Deployment

### **Development**

```bash
npm run dev
```

### **Production (Docker)**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

```bash
docker build -t my-engine .
docker run -e BACKBONE_URL=https://api.mist.com -e MIST_API_KEY=xxx my-engine
```

### **Production (Kubernetes)**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-engine
  template:
    metadata:
      labels:
        app: my-engine
    spec:
      containers:
      - name: my-engine
        image: my-engine:latest
        env:
        - name: BACKBONE_URL
          value: "https://api.mist.com"
        - name: MIST_API_KEY
          valueFrom:
            secretKeyRef:
              name: mist-credentials
              key: api-key
```

---

## 📚 API Reference

See full API docs: [ARCHITECTURE.md](./ARCHITECTURE.md)

**Key Endpoints:**

- `GET /api/v1/trust/:userId` - Get trust score
- `POST /api/v1/schedule/:jobId` - Schedule job
- `POST /api/v1/resources` - Register resource
- `GET /api/v1/resources` - List resources
- `GET /health` - Health check

**GraphQL Endpoint:**

- `http://localhost:4000/graphql` - GraphQL API

---

## 🆘 Troubleshooting

### **"Engine can't connect to backbone"**

```bash
# Check backbone is running
curl http://localhost:8080/health

# Check Redis is running
redis-cli ping

# Check PostgreSQL is running
psql postgresql://mist:mist_dev_password@localhost:5432/mist
```

### **"Trust scores not updating"**

```bash
# Check Trust Engine is running
curl http://localhost:8080/api/v1/trust/550e8400-e29b-41d4-a716-446655440000

# Check event bus
# Events should flow: job completed → trust updated
```

### **"Jobs not being scheduled"**

```bash
# Check Scheduler is running
curl http://localhost:3002/health

# Check if resources are available
curl http://localhost:8080/api/v1/resources

# Check scheduling policies
psql ... -c "SELECT * FROM scheduling_policies WHERE enabled = true"
```

### **"Metrics not showing up"**

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Should see Prometheus format:
# mist_jobs_total{engine="my-engine",status="pending"} 10
```

---

## 🎯 Next Steps

1. **Build your first engine**: `npx create-mist-engine`
2. **Read the architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Explore examples**: [examples/gp4u-engine](./examples/gp4u-engine)
4. **Join the community**: (Coming soon)

---

## 💬 Support

- **Docs**: [README.md](./README.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/Mist-Inc-/issues)
- **Email**: support@mist.com (Coming soon)

---

**Built an engine? Share it with us!**
