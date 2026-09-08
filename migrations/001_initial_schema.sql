CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6),
    otp_expires_at TIMESTAMPTZ,
    is_verified BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    balance DECIMAL(12,4) DEFAULT 0,
    pending_withdrawal DECIMAL(12,4) DEFAULT 0,
    total_earned DECIMAL(12,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    hardware_fingerprint VARCHAR(255),
    agreed_tos_at TIMESTAMPTZ,
    parent_agent_id UUID REFERENCES agents(id),
    is_sub_agent BOOLEAN DEFAULT FALSE,
    commission_rate DECIMAL(5,4) DEFAULT 0.05,
    total_commission_earned DECIMAL(12,4) DEFAULT 0,
    kyc_status VARCHAR(20) DEFAULT 'pending',
    kyc_document_url TEXT,
    kyc_verified_at TIMESTAMPTZ,
    fraud_score INT DEFAULT 0
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    device_name VARCHAR(100),
    total_ports INT DEFAULT 0,
    active_ports INT DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    is_online BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    port VARCHAR(20) NOT NULL,
    model VARCHAR(50),
    operator VARCHAR(50),
    phone_number VARCHAR(20),
    sim_id VARCHAR(50),
    signal_db INT,
    status VARCHAR(20) DEFAULT 'offline',
    profit_avg DECIMAL(10,4),
    cooldown_until TIMESTAMPTZ,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    last_service VARCHAR(100),
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, port)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    sim_id UUID REFERENCES sims(id),
    service VARCHAR(100) NOT NULL,
    country VARCHAR(5) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_order_id VARCHAR(100),
    gross_payout DECIMAL(10,4),
    agent_share DECIMAL(10,4),
    master_share DECIMAL(10,4),
    status VARCHAR(30),
    activation_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE TABLE service_guard (
    service VARCHAR(100) PRIMARY KEY,
    total_requests INT DEFAULT 0,
    total_failures INT DEFAULT 0,
    cooldown_until TIMESTAMPTZ,
    last_reset TIMESTAMPTZ DEFAULT NOW(),
    max_daily_limit INT DEFAULT 1000
);

CREATE TABLE withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    amount DECIMAL(12,4) NOT NULL,
    method VARCHAR(50) NOT NULL,
    wallet_address TEXT,
    status VARCHAR(30) DEFAULT 'pending_review',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    review_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    admin_notes TEXT,
    payment_status VARCHAR(20) DEFAULT 'pending',
    external_tx_id VARCHAR(255),
    fee_amount DECIMAL(10,4) DEFAULT 0
);

CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    amount DECIMAL(12,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    method VARCHAR(20) NOT NULL,
    payment_address TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    external_tx_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    agent_id UUID,
    action VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sim_performance (
    id BIGSERIAL PRIMARY KEY,
    sim_id UUID REFERENCES sims(id) ON DELETE CASCADE,
    service VARCHAR(100) NOT NULL,
    country VARCHAR(5) NOT NULL,
    success BOOLEAN NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    child_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount DECIMAL(10,4) NOT NULL,
    percentage DECIMAL(5,4) NOT NULL,
    source_service VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    subject VARCHAR(200),
    message TEXT,
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(10) DEFAULT 'normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    admin_response TEXT
);

-- Indexes for performance
CREATE INDEX idx_sims_status ON sims(status);
CREATE INDEX idx_sims_device ON sims(device_id);
CREATE INDEX idx_orders_agent ON orders(agent_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_withdrawals_status ON withdrawals(status, requested_at);
CREATE INDEX idx_sim_perf_lookup ON sim_performance(sim_id, service, success, timestamp DESC);
CREATE INDEX idx_commissions_parent ON commissions(parent_agent_id, created_at DESC);
CREATE INDEX idx_agents_parent ON agents(parent_agent_id);
CREATE INDEX idx_devices_agent ON devices(agent_id);
CREATE INDEX idx_audit_logs_agent ON audit_logs(agent_id, created_at DESC);

-- Create admin user table
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);
