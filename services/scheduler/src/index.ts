import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { EventBus } from '@mist/event-bus';
import { Scheduler } from './scheduler';
import { createRoutes } from './routes';

dotenv.config();

const PORT = process.env.PORT || 3002;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mist:mist_dev_password@localhost:5432/mist';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const eventBus = new EventBus(REDIS_URL, 'scheduler');
  await eventBus.connect();

  const scheduler = new Scheduler(pool, eventBus);
  await scheduler.initialize();

  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'scheduler' });
  });

  app.use('/api/v1', createRoutes(scheduler));

  app.listen(PORT, () => {
    console.log(`Scheduler running on port ${PORT}`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await eventBus.disconnect();
    await pool.end();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start scheduler:', err);
  process.exit(1);
});
