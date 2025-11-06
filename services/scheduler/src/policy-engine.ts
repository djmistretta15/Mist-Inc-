import { Pool } from 'pg';
import {
  Job,
  Resource,
  SchedulingPolicy,
  PolicyConstraint,
  PolicyObjective
} from '@mist/types';

interface ScoredResource {
  resourceId: string;
  policyId: string;
  score: number;
  reasoning: {
    constraints_met: boolean;
    constraint_results: Record<string, boolean>;
    objective_scores: Record<string, number>;
    final_score: number;
  };
}

export class PolicyEngine {
  private pool: Pool;
  private policies: SchedulingPolicy[];

  constructor(pool: Pool) {
    this.pool = pool;
    this.policies = [];
  }

  /**
   * Load scheduling policies from database
   */
  async loadPolicies(): Promise<void> {
    const result = await this.pool.query(`
      SELECT * FROM scheduling_policies
      WHERE enabled = true
      ORDER BY priority DESC
    `);

    this.policies = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      constraints: row.constraints,
      objectives: row.objectives,
      enabled: row.enabled
    }));

    console.log(`Loaded ${this.policies.length} scheduling policies`);
  }

  /**
   * Score and rank resources for a job
   */
  async scoreResources(job: Job, resources: Resource[]): Promise<ScoredResource[]> {
    const scoredResources: ScoredResource[] = [];

    // Use highest priority policy
    const policy = this.policies[0];
    if (!policy) {
      console.warn('No scheduling policy found');
      return [];
    }

    for (const resource of resources) {
      // Check constraints
      const constraintResults = this.evaluateConstraints(job, resource, policy.constraints);
      const constraintsMet = Object.values(constraintResults).every(v => v);

      if (!constraintsMet) {
        continue;  // Skip resources that don't meet constraints
      }

      // Calculate objective scores
      const objectiveScores = this.evaluateObjectives(job, resource, policy.objectives);

      // Calculate final weighted score
      const finalScore = this.calculateFinalScore(policy.objectives, objectiveScores);

      scoredResources.push({
        resourceId: resource.id,
        policyId: policy.id,
        score: finalScore,
        reasoning: {
          constraints_met: constraintsMet,
          constraint_results: constraintResults,
          objective_scores: objectiveScores,
          final_score: finalScore
        }
      });
    }

    // Sort by score descending
    scoredResources.sort((a, b) => b.score - a.score);

    return scoredResources;
  }

  /**
   * Evaluate constraints for a resource
   */
  private evaluateConstraints(
    job: Job,
    resource: Resource,
    constraints: PolicyConstraint[]
  ): Record<string, boolean> {
    const results: Record<string, boolean> = {};

    for (const constraint of constraints) {
      let result = false;

      switch (constraint.type) {
        case 'trust':
          result = this.evaluateComparison(
            resource.trust_score,
            constraint.operator,
            constraint.value
          );
          break;

        case 'region':
          if (constraint.operator === 'in') {
            result = (constraint.value as string[]).includes(resource.region);
          } else if (constraint.operator === 'not_in') {
            result = !(constraint.value as string[]).includes(resource.region);
          } else if (constraint.operator === 'eq') {
            result = resource.region === constraint.value;
          }
          break;

        case 'price':
          result = this.evaluateComparison(
            resource.price_per_unit,
            constraint.operator,
            constraint.value
          );
          break;

        case 'availability':
          result = resource.status === 'available' &&
                   resource.capacity_used < resource.capacity_total;
          break;

        case 'compliance':
          // Check data residency, geofencing, etc.
          result = this.evaluateComplianceConstraint(job, resource, constraint);
          break;
      }

      results[constraint.type] = result;

      // If required constraint fails, mark as failed
      if (constraint.required && !result) {
        results[`${constraint.type}_required_failed`] = false;
      }
    }

    return results;
  }

  /**
   * Evaluate objectives for a resource
   */
  private evaluateObjectives(
    job: Job,
    resource: Resource,
    objectives: PolicyObjective[]
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const objective of objectives) {
      let score = 0;

      switch (objective.type) {
        case 'minimize_cost':
          // Normalize price (lower is better, scale 0-100)
          // Assume max price of $10/unit
          score = Math.max(0, 100 - (resource.price_per_unit / 10) * 100);
          break;

        case 'minimize_latency':
          // Latency based on region match (simplified)
          const preferredRegions = job.constraints.preferred_regions || [];
          score = preferredRegions.includes(resource.region) ? 100 : 50;
          break;

        case 'maximize_trust':
          // Trust score is already 0-100
          score = resource.trust_score;
          break;

        case 'maximize_availability':
          // Availability score based on capacity
          const availableCapacity = resource.capacity_total - resource.capacity_used;
          score = (availableCapacity / resource.capacity_total) * 100;
          break;
      }

      scores[objective.type] = score;
    }

    return scores;
  }

  /**
   * Calculate final weighted score
   */
  private calculateFinalScore(
    objectives: PolicyObjective[],
    scores: Record<string, number>
  ): number {
    let finalScore = 0;
    let totalWeight = 0;

    for (const objective of objectives) {
      const score = scores[objective.type] || 0;
      finalScore += score * objective.weight;
      totalWeight += objective.weight;
    }

    return totalWeight > 0 ? finalScore / totalWeight : 0;
  }

  /**
   * Evaluate comparison operators
   */
  private evaluateComparison(
    value: number,
    operator: string,
    target: number
  ): boolean {
    switch (operator) {
      case 'gte': return value >= target;
      case 'lte': return value <= target;
      case 'eq': return value === target;
      default: return false;
    }
  }

  /**
   * Evaluate compliance constraints
   */
  private evaluateComplianceConstraint(
    job: Job,
    resource: Resource,
    constraint: PolicyConstraint
  ): boolean {
    const jobConstraints = job.constraints || {};

    // Data residency check
    if (jobConstraints.data_residency) {
      const allowedRegions = jobConstraints.data_residency as string[];
      if (!allowedRegions.includes(resource.region)) {
        return false;
      }
    }

    // Exclude regions check
    if (jobConstraints.exclude_regions) {
      const excludedRegions = jobConstraints.exclude_regions as string[];
      if (excludedRegions.includes(resource.region)) {
        return false;
      }
    }

    return true;
  }
}
