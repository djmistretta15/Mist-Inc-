import { Router } from 'express';
import { Scheduler } from './scheduler';

export function createRoutes(scheduler: Scheduler): Router {
  const router = Router();

  /**
   * POST /schedule/:jobId
   * Manually trigger scheduling for a job
   */
  router.post('/schedule/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const decision = await scheduler.scheduleJob(jobId);

      if (!decision) {
        res.status(404).json({ error: 'No suitable resources found' });
        return;
      }

      res.json(decision);
    } catch (err) {
      console.error('Error scheduling job:', err);
      res.status(500).json({ error: 'Failed to schedule job' });
    }
  });

  return router;
}
