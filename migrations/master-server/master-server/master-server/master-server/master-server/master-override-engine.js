const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class OverrideEngine {
  async distributeCommission(agentId, orderAmount, service) {
    try {
      const { rows } = await pool.query(
        `SELECT id, commission_rate, parent_agent_id 
         FROM agents 
         WHERE id = $1 AND is_sub_agent = TRUE AND parent_agent_id IS NOT NULL`,
        [agentId]
      );

      if (!rows.length) return;

      const agent = rows[0];
      const commissionAmount = orderAmount * agent.commission_rate;

      await pool.query(
        "UPDATE agents SET balance = balance + $1, total_commission_earned = total_commission_earned + $1 WHERE id = $2",
        [commissionAmount, agent.parent_agent_id]
      );

      await pool.query(
        `INSERT INTO commissions (parent_agent_id, child_agent_id, amount, percentage, source_service, order_id)
         SELECT $1, $2, $3, $4, $5, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM commissions WHERE child_agent_id = $2 AND order_id = $6
         )`,
        [agent.parent_agent_id, agentId, commissionAmount, agent.commission_rate, service, null]
      );

      console.log(`[Override Engine] Commission distributed: $${commissionAmount.toFixed(4)} to parent agent`);
    } catch (error) {
      console.error('[Override Engine] Commission distribution error:', error);
    }
  }

  async calculateAgentShare(agentId, grossAmount, service) {
    try {
      const { rows: agents } = await pool.query(
        "SELECT commission_rate, is_sub_agent FROM agents WHERE id = $1",
        [agentId]
      );

      if (!agents.length) return { agentShare: grossAmount, masterShare: 0 };

      const agent = agents[0];
      const masterShare = grossAmount * 0.20; // 20% to master
      const agentShare = grossAmount - masterShare;

      return { agentShare, masterShare, commission: agentShare * agent.commission_rate };
    } catch (error) {
      console.error('[Override Engine] Calculate share error:', error);
      return { agentShare: grossAmount, masterShare: 0 };
    }
  }
}

module.exports = new OverrideEngine();
