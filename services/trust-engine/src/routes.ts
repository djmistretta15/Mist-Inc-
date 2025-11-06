import { Router } from 'express';
import { TrustEngine } from './trust-engine';

export function createRoutes(trustEngine: TrustEngine): Router {
  const router = Router();

  /**
   * GET /trust/:userId
   * Get current trust score for a user
   */
  router.get('/trust/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { engine } = req.query;

      let trustScore = await trustEngine.getTrustScore(userId, engine as string);

      // Calculate if not found or stale
      if (!trustScore || Date.now() - trustScore.computed_at.getTime() > 3600000) {
        trustScore = await trustEngine.calculateTrustScore(userId, engine as string);
      }

      res.json(trustScore);
    } catch (err) {
      console.error('Error getting trust score:', err);
      res.status(500).json({ error: 'Failed to get trust score' });
    }
  });

  /**
   * GET /trust/:userId/history
   * Get trust score history
   */
  router.get('/trust/:userId/history', async (req, res) => {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const history = await trustEngine.getTrustHistory(userId, days);

      res.json(history);
    } catch (err) {
      console.error('Error getting trust history:', err);
      res.status(500).json({ error: 'Failed to get trust history' });
    }
  });

  /**
   * POST /trust/:userId/recalculate
   * Force recalculation of trust score
   */
  router.post('/trust/:userId/recalculate', async (req, res) => {
    try {
      const { userId } = req.params;
      const { engine } = req.body;

      const trustScore = await trustEngine.calculateTrustScore(userId, engine);

      res.json(trustScore);
    } catch (err) {
      console.error('Error recalculating trust score:', err);
      res.status(500).json({ error: 'Failed to recalculate trust score' });
    }
  });

  return router;
}
