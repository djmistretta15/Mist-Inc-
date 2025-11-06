import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { EventBus } from '@mist/event-bus';
import { TrustEngine } from './trust-engine';
import { createRoutes } from './routes';

dotenv.config();

const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mist:mist_dev_password@localhost:5432/mist';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  // Initialize database
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Initialize event bus
  const eventBus = new EventBus(REDIS_URL, 'trust-engine');
  await eventBus.connect();

  // Initialize trust engine
  const trustEngine = new TrustEngine(pool, eventBus);
  await trustEngine.initialize();

  // Create Express app
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'trust-engine' });
  });

  // API routes
  app.use('/api/v1', createRoutes(trustEngine));

  // Start server
  app.listen(PORT, () => {
    console.log(`Trust Engine running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await eventBus.disconnect();
    await pool.end();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start trust engine:', err);
  process.exit(1);
});
