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

    const { rows: agentRows } = await pool.query(
      "SELECT balance FROM agents WHERE id = $1",
      [req.agent.id]
    );

    if (agentRows[0].balance < amount) {
      return res.status(400).json({ error: '
