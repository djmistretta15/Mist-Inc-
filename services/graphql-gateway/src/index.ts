import express from 'express';
import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { schema } from './schema';
import { createContext } from './context';

dotenv.config();

const PORT = process.env.PORT || 4000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mist:mist_dev_password@localhost:5432/mist';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const app = express();
  const httpServer = createServer(app);

  const yoga = createYoga({
    schema,
    context: async ({ req }) => createContext({ req, pool, redis }),
    graphiql: {
      subscriptionsProtocol: 'WS'
    },
    landingPage: false
  });

  app.use('/graphql', yoga);

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });

  useServer(
    {
      schema,
      context: async (ctx) => createContext({ pool, redis })
    },
    wsServer
  );

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'graphql-gateway' });
  });

  httpServer.listen(PORT, () => {
    console.log(`GraphQL Gateway running on port ${PORT}`);
    console.log(`GraphiQL: http://localhost:${PORT}/graphql`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await redis.quit();
    await pool.end();
    httpServer.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start GraphQL gateway:', err);
  process.exit(1);
});
