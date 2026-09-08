const express = require('express');
const { Pool } = require('pg');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const server = require('http').createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const aiRouter = require('./master-ai-router');
const overrideEngine = require('./master-override-engine');
const { loginLimiter, apiLimiter, securityHeaders, corsOptions } = require('./security-core');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(securityHeaders);
app.use(corsOptions);

// FiveSim API Configuration
const FIVESIM_BASE_URL = 'https://api.fivesim.net/v2';
const FIVESIM_API_KEY = process.env.FIVESIM_API_KEY;

// HeroSMS API Configuration
const HEROSMS_BASE_URL = 'https://api.heroms.com/api/v1';
const HEROSMS_API_KEY = process.env.HEROSMS_API_KEY;

// Middleware for authentication
const authenticateToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const { rows } = await pool.query(
      "SELECT id, email, is_banned, balance FROM agents WHERE email = $1",
      [token]
    );

    if (rows.length === 0) return res.status(403).json({ error: 'Invalid token' });
    
    const agent = rows[0];
    if (agent.is_banned) return res.status(403).json({ error: 'Account banned' });

    req.agent = agent;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ==================== AUTH ROUTES ====================

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, hardwareId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { rows } = await pool.query(
      "SELECT id, email, password_hash, is_verified, is_banned FROM agents WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const agent = rows[0];
    
    if (agent.is_banned) {
      return res.status(403).json({ error: 'Account has been banned' });
    }

    const isValidPassword = await bcrypt.compare(password, agent.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!agent.is_verified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      "UPDATE agents SET hardware_fingerprint = $2 WHERE id = $1",
      [agent.id, hardwareId || 'unknown']
    );

    res.json({
      token,
      balance: agent.balance,
      userId: agent.id,
      email: agent.email
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, parentAgentId } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const agentId = uuidv4();

    await pool.query(
      `INSERT INTO agents (id, email, password_hash, is_sub_agent, parent_agent_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [agentId, email, hashedPassword, !!parentAgentId, parentAgentId || null]
    );

    res.status(201).json({ message: 'Registration successful. Please login.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ==================== AGENT ROUTES ====================

app.get('/api/balance', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT balance, total_earned FROM agents WHERE id = $1",
      [req.agent.id]
    );

    res.json({ balance: rows[0].balance, total_earned: rows[0].total_earned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM devices WHERE agent_id = $1 ORDER BY created_at DESC",
      [req.agent.id]
    );

    res.json({ devices: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

app.post('/api/devices', authenticateToken, async (req, res) => {
  try {
    const { deviceName, totalPorts } = req.body;
    const deviceId = uuidv4();

    await pool.query(
      `INSERT INTO devices (id, agent_id, device_name, total_ports) 
       VALUES ($1, $2, $3, $4)`,
      [deviceId, req.agent.id, deviceName, totalPorts]
    );

    res.status(201).json({ deviceId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create device' });
  }
});

app.post('/api/sims/register', authenticateToken, async (req, res) => {
  try {
    const { deviceId, port, model, operator, simId } = req.body;

    const simIdVal = uuidv4();
    await pool.query(
      `INSERT INTO sims (id, device_id, port, model, operator, sim_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'offline')`,
      [simIdVal, deviceId, port, model, operator, simId]
    );

    res.status(201).json({ simId: simIdVal });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register SIM' });
  }
});

// ==================== ORDER ROUTES ====================

app.post('/api/orders/request', authenticateToken, async (req, res) => {
  try {
    const { service, country, phoneNumber } = req.body;

    const targetSim = await aiRouter.getBestSim(req.agent.id, service, country);
    
    const order = {
      id: uuidv4(),
      agent_id: req.agent.id,
      sim_id: targetSim.id,
      service,
      country,
      provider: 'FiveSim',
      status: 'pending',
      created_at: new Date()
    };

    await pool.query(
      `INSERT INTO orders (id, agent_id, sim_id, service, country, provider, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, order.agent_id, order.sim_id, order.service, order.country, order.provider, order.status]
    );

    // Request SMS from FiveSim
    try {
      const orderResponse = await axios.post(
        `${FIVESIM_BASE_URL}/order/create`,
        {
          phone: phoneNumber,
          service: service,
          country: country
        },
        {
          headers: {
            'Authorization': `Bearer ${FIVESIM_API_KEY}`
          }
        }
      );

      order.provider_order_id = orderResponse.data.order;
      order.status = 'processing';

      await pool.query(
        "UPDATE orders SET provider_order_id = $1, status = $2 WHERE id = $3",
        [order.provider_order_id, order.status, order.id]
      );

      res.json({ orderId: order.id, status: 'processing' });
    } catch (providerError) {
      console.error('Provider API error:', providerError);
      order.status = 'failed';
      order.error_message = providerError.message;
      
      await pool.query(
        "UPDATE orders SET status = $1, error_message = $2 WHERE id = $3",
        [order.status, order.error_message, order.id]
      );

      res.status(500).json({ error: 'Provider request failed', orderId: order.id });
    }
  } catch (error) {
    console.error('Order request error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND agent_id = $2",
      [orderId, req.agent.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.post('/api/orders/activate', authenticateToken, async (req, res) => {
  try {
    const { orderId, activationCode } = req.body;

    const { rows: orderRows } = await pool.query(
      "SELECT id, sim_id, service, country, agent_id, gross_payout FROM orders WHERE id = $1",
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];
    
    // Update order
    await pool.query(
      `UPDATE orders SET activation_code = $1, status = $2, completed_at = NOW() 
       WHERE id = $3`,
      [activationCode, 'completed', orderId]
    );

    // Credit agent balance
    const agentShare = order.gross_payout || 0.5;
    await pool.query(
      "UPDATE agents SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2",
      [agentShare, order.agent_id]
    );

    // Record SIM performance
    await aiRouter.recordResult(order.sim_id, order.service, order.country, true);

    // Distribute commission if sub-agent
    await overrideEngine.distributeCommission(order.agent_id, agentShare, order.service);

    // Emit real-time update
    io.to(order.agent_id).emit('balance_update', agentShare);

    res.json({ success: true, newBalance: agentShare });
  } catch (error) {
    console.error('Activate order error:', error);
    res.status(500).json({ error: 'Failed to activate order' });
  }
});

// ==================== WITHDRAWAL ROUTES ====================

app.post('/api/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, method, wallet } = req.body;
InsufficientBalance' }); }

if (amount < 10) {
  return res.status(400).json({ error: 'Minimum withdrawal is $10' });
}

const withdrawalId = uuidv4();
const fee = amount * 0.02; // 2% withdrawal fee

await pool.query(
  `INSERT INTO withdrawals (id, agent_id, amount, method, wallet_address, status, fee_amount) 
   VALUES ($1, $2, $3, $4, $5, 'pending_review', $6)`,
  [withdrawalId, req.agent.id, amount, method, wallet, fee]
);

// Deduct from balance
await pool.query(
  "UPDATE agents SET balance = balance - $1, pending_withdrawal = pending_withdrawal + $2 WHERE id = $3",
  [amount, amount, req.agent.id]
);

res.status(201).json({ 
  withdrawalId, 
  message: 'Withdrawal request submitted for review',
  fee 
});
} catch (error) { console.error('Withdrawal error:', error); res.status(500).json({ error: 'Failed to process withdrawal' }); } });

app.get('/api/withdrawals', authenticateToken, async (req, res) => { try { const { rows } = await pool.query( "SELECT * FROM withdrawals WHERE agent_id = $1 ORDER BY requested_at DESC LIMIT 50", [req.agent.id] );

res.json({ withdrawals: rows });
} catch (error) { res.status(500).json({ error: 'Failed to fetch withdrawals' }); } });

// ==================== REFERRAL ROUTES ====================

app.get('/api/referral-link', authenticateToken, async (req, res) => { try { const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000'; const referralLink = ${baseUrl}/register?ref=${req.agent.id};

const { rows: stats } = await pool.query(
  `SELECT COUNT(*) as total_referrals, 
          COALESCE(SUM(total_commission_earned), 0) as total_commission 
   FROM agents 
   WHERE parent_agent_id = $1`,
  [req.agent.id]
);

res.json({
  link: referralLink,
  total_referrals: parseInt(stats[0].total_referrals),
  total_commission: parseFloat(stats[0].total_commission)
});
} catch (error) { res.status(500).json({ error: 'Failed to generate referral link' }); } });

app.get('/api/referrals', authenticateToken, async (req, res) => { try { const { rows } = await pool.query( SELECT a.email, a.created_at, a.total_earned,               COALESCE(SUM(c.amount), 0) as commission_earned        FROM agents a        LEFT JOIN commissions c ON c.child_agent_id = a.id        WHERE a.parent_agent_id = $1        GROUP BY a.id, a.email, a.created_at, a.total_earned        ORDER BY a.created_at DESC, [req.agent.id] );

res.json({ referrals: rows });
} catch (error) { res.status(500).json({ error: 'Failed to fetch referrals' }); } });

// ==================== ADMIN ROUTES ====================

app.post('/api/admin/login', loginLimiter, async (req, res) => { try { const { password } = req.body;

if (password !== process.env.ADMIN_PASSWORD) {
  return res.status(401).json({ error: 'Invalid admin password' });
}

const token = crypto.randomBytes(32).toString('hex');
res.json({ token });
} catch (error) { res.status(500).json({ error: 'Admin login failed' }); } });

const authenticateAdmin = (req, res, next) => { const token = req.headers['x-admin-token']; if (token !== process.env.ADMIN_TOKEN) { // Simple check - in production use proper token validation return res.status(403).json({ error: 'Invalid admin token' }); } next(); };

app.get('/api/admin/overview', authenticateAdmin, async (req, res) => { try { const { rows: agents } = await pool.query( "SELECT COUNT(*) as active_agents FROM agents WHERE is_banned = FALSE" );

const { rows: earnings } = await pool.query(
  "SELECT COALESCE(SUM(gross_payout), 0) as total FROM orders WHERE status = 'completed'"
);

const { rows: sims } = await pool.query(
  "SELECT COUNT(*) as ready_sims FROM sims WHERE status = 'ready'"
);

res.json({
  active_agents: parseInt(agents[0].active_agents),
  total_master_earnings: parseFloat(earnings[0].total) * 0.20,
  ready_sims: parseInt(sims[0].ready_sims)
});
} catch (error) { res.status(500).json({ error: 'Failed to fetch admin overview' }); } });

app.get('/api/admin/withdrawals', authenticateAdmin, async (req, res) => { try { const { rows } = await pool.query( SELECT w.*, a.email         FROM withdrawals w         JOIN agents a ON a.id = w.agent_id         WHERE w.status = 'pending_review'         ORDER BY w.requested_at DESC );

res.json({ withdrawals: rows });
} catch (error) { res.status(500).json({ error: 'Failed to fetch withdrawals' }); } });

app.post('/api/admin/withdrawals/:id/approve', authenticateAdmin, async (req, res) => { try { const { id } = req.params; const { admin_notes } = req.body;

await pool.query(
  `UPDATE withdrawals SET status = 'approved', review_at = NOW(), admin_notes = $1 
   WHERE id = $2`,
  [admin_notes || '', id]
);

res.json({ message: 'Withdrawal approved' });
} catch (error) { res.status(500).json({ error: 'Failed to approve withdrawal' }); } });

app.post('/api/admin/withdrawals/:id/reject', authenticateAdmin, async (req, res) => { try { const { id } = req.params; const { admin_notes } = req.body;

const { rows } = await pool.query(
  "SELECT agent_id, amount FROM withdrawals WHERE id = $1",
  [id]
);

if (rows.length > 0) {
  await pool.query(
    "UPDATE agents SET balance = balance + $1, pending_withdrawal = pending_withdrawal - $2 WHERE id = $3",
    [rows[0].amount, rows[0].amount, rows[0].agent_id]
  );
}

await pool.query(
  `UPDATE withdrawals SET status = 'rejected', review_at = NOW(), admin_notes = $1 
   WHERE id = $2`,
  [admin_notes || '', id]
);

res.json({ message: 'Withdrawal rejected' });
} catch (error) { res.status(500).json({ error: 'Failed to reject withdrawal' }); } });

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => { console.log('[Socket] Client connected:', socket.id);

socket.on('authenticate', async (data) => { try { const { token } = data; const { rows } = await pool.query( "SELECT id, email FROM agents WHERE email = $1", [token] );

  if (rows.length > 0) {
    socket.join(rows[0].id);
    console.log(`[Socket] Authenticated: ${rows[0].email}`);
  }
} catch (error) {
  console.error('[Socket] Auth error:', error);
}
});

socket.on('device_heartbeat', async (data) => { try { const { deviceId, activePorts } = data; await pool.query( "UPDATE devices SET last_heartbeat = NOW(), is_online = TRUE, active_ports = $1 WHERE id = $2", [activePorts || 0, deviceId] ); } catch (error) { console.error('[Socket] Heartbeat error:', error); } });

socket.on('sim_status_update', async (data) => { try { const { simId, status, signalDb } = data; await pool.query( "UPDATE sims SET status = $1, signal_db = $2 WHERE id = $3", [status, signalDb, simId] ); } catch (error) { console.error('[Socket] SIM status error:', error); } });

socket.on('code_received', async (data) => { try { const { orderId, code } = data; io.emit(order_${orderId}_code, { code }); } catch (error) { console.error('[Socket] Code received error:', error); } });

socket.on('disconnect', () => { console.log('[Socket] Client disconnected:', socket.id); }); });

// ==================== SERVICE GUARD ====================

async function checkServiceGuard(service) { try { const { rows } = await pool.query( "SELECT * FROM service_guard WHERE service = $1", [service] );

if (rows.length === 0) {
  await pool.query(
    "INSERT INTO service_guard (service) VALUES ($1)",
    [service]
  );
  return { allowed: true };
}

const guard = rows[0];
if (guard.cooldown_until && new Date(guard.cooldown_until) > new Date()) {
  return { allowed: false, reason: 'Service in cooldown' };
}

if (guard.total_failures > 10 && guard.total_requests > 0) {
  const failureRate = guard.total_failures / guard.total_requests;
  if (failureRate > 0.5) {
    await pool.query(
      "UPDATE service_guard SET cooldown_until = NOW() + INTERVAL '1 hour' WHERE service = $1",
      [service]
    );
    return { allowed: false, reason: 'High failure rate - service paused' };
  }
}

return { allowed: true };
} catch (error) { console.error('Service guard error:', error); return { allowed: true }; } }

// ==================== DEVICE MONITORING ====================

async function monitorDevices() { try { await pool.query( UPDATE devices         SET is_online = FALSE         WHERE last_heartbeat < NOW() - INTERVAL '5 minutes' );

await pool.query(
  `UPDATE sims 
   SET status = 'offline' 
   WHERE device_id IN (
     SELECT id FROM devices WHERE is_online = FALSE
   )`
);
} catch (error) { console.error('Device monitor error:', error); } }

setInterval(monitorDevices, 60000);

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000; server.listen(PORT, () => { console.log(✅ SMS Master Server running on port ${PORT}); console.log(📡 Socket.io ready for real-time connections); });

module.exports = { app, server, io };


---

### **Step 5: Admin Panel**

#### **File: admin-panel/index.html**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Admin - SMS Network</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
        .login-box { max-width: 400px; margin: 100px auto; padding: 30px; background: #161b22; border-radius: 8px; border: 1px solid #30363d; }
        .login-box h2 { color: #fff; text-align: center; margin-bottom: 20px; }
        .login-box input { width: 100%; padding: 12px; margin: 10px 0; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 4px; }
        .login-box button { width: 100%; padding: 12px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        .login-box button:hover { background: #2ea043; }
        .panel { margin-top: 20px; padding: 20px; background: #161b22; border-radius: 8px; border: 1px solid #30363d; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #30363d; padding: 12px; text-align: left; }
        th { background: #21262d; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .card { background: #161b22; padding: 20px; border-radius: 6px; border: 1px solid #30363d; text-align: center; }
        .stat-value { font-size: 28px; color: #58a6ff; font-weight: bold; }
        .stat-label { color: #8b949e; margin-top: 5px; }
        .btn-approve { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 5px; }
        .btn-reject { background: #da3633; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        .btn-approve:hover { background: #2ea043; }
        .btn-reject:hover { background: #b62324; }
        #dashboard { display: none; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header h1 { color: #fff; }
        .logout-btn { background: #da3633; color: #fff; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="login-screen">
        <div class="login-box">
            <h2>🔐 Master Admin</h2>
            <input type="password" id="password" placeholder="Admin Password">
            <button onclick="login()">Login</button>
        </div>
    </div>
    
    <div id="dashboard">
        <div class="header">
            <h1>SMS Network Admin Panel</h1>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>
        
        <div class="panel">
            <h2>📊 Overview</h2>
            <div class="stats-grid">
                <div class="card">
                    <div class="stat-value" id="stat-active">0</div>
                    <div class="stat-label">Active Agents</div>
                </div>
                <div class="card">
                    <div class="stat-value" id="stat-earn">$0</div>
                    <div class="stat-label">Total Earnings</div>
                </div>
                <div class="card">
                    <div class="stat-value" id="stat-sims">0</div>
                    <div class="stat-label">Ready SIMs</div>
                </div>
                <div class="card">
                    <div class="stat-value" id="stat-orders">0</div>
                    <div class="stat-label">Total Orders</div>
                </div>
            </div>
    const { rows: agentRows } = await pool.query(
      "SELECT balance FROM agents WHERE id = $1",
      [req.agent.id]
    );

    if (agentRows[0].balance < amount) {
      return res.status(400).json({ error: '
        </div>
        
        <div class="panel">
            <h2>📋 Pending Withdrawals</h2>
            <table>
                <thead>
                    <tr>
                        <th>Agent Email</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Wallet</th>
                        <th>Requested</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="withdraw-table">
                    <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="panel">
            <h2>📈 Recent Orders</h2>
            <table>
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Agent</th>
                        <th>Service</th>
                        <th>Country</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="orders-table">
                    <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="panel">
            <h2>⚙️ System Status</h2>
            <div style="margin-top: 15px;">
                <p><strong>Server Time:</strong> <span id="server-time">--</span></p>
                <p><strong>Total Agents:</strong> <span id="total-agents">--</span></p>
                <p><strong>Active SIMs:</strong> <span id="active-sims">--</span></p>
                <p><strong>Database Status:</strong> <span id="db-status" style="color: #2ea043;">Connected</span></p>
            </div>
        </div>
    </div>
    
    <script>
        let adminToken = '';
        
        async function login() {
            const password = document.getElementById('password').value;
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({password})
                });
                const data = await res.json();
                if(data.token) {
                    adminToken = data.token;
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'block';
                    loadData();
                    setInterval(loadData, 30000); // Auto-refresh every 30 seconds
                } else {
                    alert('Invalid password');
                }
            } catch (error) {
                alert('Login failed: ' + error.message);
            }
        }
        
        function logout() {
            adminToken = '';
            document.getElementById('login-screen').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('password').value = '';
        }
        
        async function loadData() {
            try {
                // Load overview stats
                const overviewRes = await fetch('/api/admin/overview', {
                    headers: {'x-admin-token': adminToken}
                });
                const overview = await overviewRes.json();
                document.getElementById('stat-active').innerText = overview.active_agents;
                document.getElementById('stat-earn').innerText = '$' + (overview.total_master_earnings || 0).toFixed(2);
                document.getElementById('stat-sims').innerText = overview.ready_sims;
                
                // Load pending withdrawals
                const withdrawRes = await fetch('/api/admin/withdrawals', {
                    headers: {'x-admin-token': adminToken}
                });
                const withdrawData = await withdrawRes.json();
                const withdrawTable = document.getElementById('withdraw-table');
                
                if (withdrawData.withdrawals.length === 0) {
                    withdrawTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">No pending withdrawals</td></tr>';
                } else {
                    withdrawTable.innerHTML = withdrawData.withdrawals.map(w => `
                        <tr>
                            <td>${w.email || 'N/A'}</td>
                            <td>$${parseFloat(w.amount).toFixed(2)}</td>
                            <td>${w.method}</td>
                            <td><small>${w.wallet_address || 'N/A'}</small></td>
                            <td>${new Date(w.requested_at).toLocaleString()}</td>
                            <td>
                                <button class="btn-approve" onclick="approveWithdrawal('${w.id}', '${w.email}', ${w.amount})">Approve</button>
                                <button class="btn-reject" onclick="rejectWithdrawal('${w.id}', '${w.email}')">Reject</button>
                            </td>
                        </tr>
                    `).join('');
                }
                
                // Load recent orders (last 10)
                const ordersRes = await fetch('/api/admin/orders', {
                    headers: {'x-admin-token': adminToken}
                });
                const orders = await ordersRes.json();
                const ordersTable = document.getElementById('orders-table');
                
                if (orders.orders.length === 0) {
                    ordersTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">No orders yet</td></tr>';
                } else {
                    ordersTable.innerHTML = orders.orders.map(o => `
                        <tr>
                            <td><small>${o.id.slice(0, 8)}...</small></td>
                            <td>${o.agent_email || 'N/A'}</td>
                            <td>${o.service}</td>
                            <td>${o.country}</td>
                            <td>$${(parseFloat(o.gross_payout) || 0).toFixed(2)}</td>
                            <td><span style="color: ${o.status === 'completed' ? '#2ea043' : o.status === 'failed' ? '#da3633' : '#e3b341'}">${o.status}</span></td>
                        </tr>
                    `).join('');
                }
                
                // Update system status
                document.getElementById('server-time').innerText = new Date().toLocaleString();
                document.getElementById('total-agents').innerText = overview.active_agents;
                document.getElementById('active-sims').innerText = overview.ready_sims;
                
            } catch (error) {
                console.error('Load data error:', error);
            }
        }
        
        async function approveWithdrawal(id, email, amount) {
            const notes = prompt('Add admin notes (optional):');
            try {
                await fetch(`/api/admin/withdrawals/${id}/approve`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({admin_notes: notes || ''})
                });
                alert(`Withdrawal for ${email} approved!`);
                loadData();
            } catch (error) {
                alert('Failed to approve: ' + error.message);
            }
        }
        
        async function rejectWithdrawal(id, email) {
            const notes = prompt('Add rejection reason (optional):');
            try {
                await fetch(`/api/admin/withdrawals/${id}/reject`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({admin_notes: notes || ''})
                });
                alert(`Withdrawal for ${email} rejected!`);
                loadData();
            } catch (error) {
                alert('Failed to reject: ' + error.message);
            }
        }
        
        // Set current time on load
        document.getElementById('server-time').innerText = new Date().toLocaleString();
    </script>
</body>
</html>
