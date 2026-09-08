const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class AIRouter {
  async calculateSimScore(simId, service, country) {
    try {
      const { rows: perf } = await pool.query(`
        SELECT success FROM sim_performance 
        WHERE sim_id = $1 AND service = $2 
        ORDER BY timestamp DESC LIMIT 50
      `, [simId, service]);

      if (perf.length === 0) return { score: 75, confidence: 0, successRate: 0.5 };

      const successes = perf.filter(p => p.success).length;
      const total = perf.length;
      const successRate = successes / total;

      const { rows: global } = await pool.query(`
        SELECT success_count, fail_count, last_success_at, fail_count FROM sims WHERE id = $1
      `, [simId]);

      if (!global[0]) return { score: 50, confidence: 0, successRate: 0.5 };

      const globalTotal = global[0].success_count + global[0].fail_count;
      const globalRate = globalTotal > 0 ? global[0].success_count / globalTotal : 0.5;

      let recencyPenalty = 0;
      if (global[0].last_success_at) {
        const hoursSince = (Date.now() - new Date(global[0].last_success_at)) / (1000 * 60 * 60);
        if (hoursSince > 1) recencyPenalty = 10;
        if (hoursSince > 24) recencyPenalty = 25;
        if (hoursSince > 48) recencyPenalty = 40;
      }

      let finalScore = (successRate * 70) + (globalRate * 20) + 10 - recencyPenalty;
      if (total > 10 && successRate < 0.10) finalScore = Math.max(0, finalScore - 30);

      return { 
        score: Math.max(0, Math.min(100, finalScore)), 
        confidence: total, 
        successRate: successRate,
        globalSuccessRate: globalRate
      };
    } catch (error) {
      console.error('[AI Router] Score calculation error:', error);
      return { score: 50, confidence: 0, successRate: 0.5 };
    }
  }

  async getBestSim(agentId, service, country) {
    try {
      const { rows: candidates } = await pool.query(`
        SELECT s.id, s.port, s.signal_db, s.operator, s.device_id
        FROM sims s
        JOIN devices d ON d.id = s.device_id
        WHERE d.agent_id = $1 AND s.status = 'ready'
          AND (s.cooldown_until IS NULL OR s.cooldown_until < NOW())
      `, [agentId]);

      if (candidates.length === 0) {
        throw new Error('No SIMs available for this agent');
      }

      const scoredPromises = candidates.map(async (sim) => {
        const metrics = await this.calculateSimScore(sim.id, service, country);
        return { ...sim, ...metrics };
      });

      const scoredSims = await Promise.all(scoredPromises);
      const viableSims = scoredSims.filter(s => s.score > 20);

      if (viableSims.length === 0) {
        scoredSims.sort((a, b) => b.score - a.score);
        console.warn(`[AI Router] No good SIMs found. Using fallback: ${scoredSims[0].port}`);
        return scoredSims[0];
      }

      viableSims.sort((a, b) => b.score - a.score);
      const topCandidates = viableSims.slice(0, 3);
      
      // Weighted random selection from top 3
      const weights = topCandidates.map(s => s.score);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < topCandidates.length; i++) {
        random -= weights[i];
        if (random <= 0) return topCandidates[i];
      }
      
      return topCandidates[topCandidates.length - 1];
    } catch (error) {
      console.error('[AI Router] Get best SIM error:', error);
      throw error;
    }
  }

  async recordResult(simId, service, country, success) {
    try {
      await pool.query(
        "INSERT INTO sim_performance (sim_id, service, country, success) VALUES ($1, $2, $3, $4)",
        [simId, service, country, success]
      );

      if (success) {
        await pool.query(
          "UPDATE sims SET success_count = success_count + 1, last_success_at = NOW(), status = 'ready' WHERE id = $1",
          [simId]
        );
      } else {
        await pool.query(
          "UPDATE sims SET fail_count = fail_count + 1, last_failure_at = NOW() WHERE id = $1",
          [simId]
        );
      }
    } catch (error) {
      console.error('[AI Router] Record result error:', error);
    }
  }

  async getSimHealthStats(simId) {
    try {
      const { rows } = await pool.query(`
        SELECT 
          success_count, 
          fail_count, 
          (success_count + fail_count) as total_requests,
          CASE 
            WHEN (success_count + fail_count) > 0 
            THEN success_count::float / (success_count + fail_count) 
            ELSE 0 
          END as success_rate
        FROM sims 
        WHERE id = $1
      `, [simId]);

      return rows[0] || null;
    } catch (error) {
      console.error('[AI Router] Get health stats error:', error);
      return null;
    }
  }
}

module.exports = new AIRouter();
