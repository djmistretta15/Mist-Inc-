import dotenv from 'dotenv';
import { GP4UEngine } from './gp4u-engine';
import { createEngineConfig } from '@mist/engine-sdk';

dotenv.config();

async function main() {
  const config = createEngineConfig(
    'gp4u',
    process.env.BACKBONE_URL,
    process.env.MIST_API_KEY,
    process.env.REDIS_URL
  );

  const engine = new GP4UEngine(config);

  await engine.initialize({
    // Engine-specific config
    provider_network_url: process.env.PROVIDER_NETWORK_URL,
    health_check_interval: 60000,  // 1 minute
    price_update_interval: 300000  // 5 minutes
  });

  console.log('GP4U Engine running...');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await engine.shutdown();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start GP4U engine:', err);
  process.exit(1);
});
