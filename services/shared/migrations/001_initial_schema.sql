-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS & IDENTITY
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  trust_score DECIMAL(5,2) DEFAULT 50.0 CHECK (trust_score >= 0 AND trust_score <= 100),
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  kyc_status TEXT DEFAULT 'none' CHECK (kyc_status IN ('none', 'lite', 'full')),
  password_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_trust_score ON users(trust_score DESC);
CREATE INDEX idx_users_tier ON users(tier);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('crypto', 'fiat')),
  address TEXT,
  balance DECIMAL(20,8) DEFAULT 0 CHECK (balance >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_type ON wallets(type);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  os TEXT,
  browser TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  trusted BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_fingerprint ON devices(fingerprint);

-- ============================================================================
-- RESOURCES
-- ============================================================================

CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine TEXT NOT NULL,  -- 'gp4u', 'mas', 'dpras', etc.
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gpu', 'memory', 'data', 'bandwidth', 'storage')),
  specs JSONB NOT NULL DEFAULT '{}',
  region TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'offline')),
  price_per_unit DECIMAL(10,2) NOT NULL CHECK (price_per_unit >= 0),
  trust_score DECIMAL(5,2) DEFAULT 50.0,
  capacity_total INTEGER NOT NULL DEFAULT 1,
  capacity_used INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_engine ON resources(engine);
CREATE INDEX idx_resources_provider_id ON resources(provider_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_region ON resources(region);
CREATE INDEX idx_resources_price ON resources(price_per_unit);

-- ============================================================================
-- JOBS
-- ============================================================================

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled')),
  constraints JSONB DEFAULT '{}',
  price DECIMAL(10,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_engine ON jobs(engine);
CREATE INDEX idx_jobs_resource_id ON jobs(resource_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- ============================================================================
-- TRANSACTIONS & PAYMENTS
-- ============================================================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  amount DECIMAL(20,8) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'escrowed', 'completed', 'failed', 'refunded', 'disputed')),
  escrow_until TIMESTAMPTZ,
  splits JSONB DEFAULT '[]',  -- Array of {recipient_id, recipient_type, amount, percentage}
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_job_id ON transactions(job_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

CREATE TABLE bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resources JSONB NOT NULL DEFAULT '[]',  -- Array of bundle resources
  total_price DECIMAL(20,8) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  final_price DECIMAL(20,8) NOT NULL,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bundles_user_id ON bundles(user_id);
CREATE INDEX idx_bundles_created_at ON bundles(created_at DESC);

-- ============================================================================
-- TRUST SCORES (TIME-SERIES)
-- ============================================================================

CREATE TABLE trust_scores (
  time TIMESTAMPTZ NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine TEXT,
  score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  components JSONB NOT NULL
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('trust_scores', 'time');

CREATE INDEX idx_trust_scores_user_id ON trust_scores(user_id, time DESC);
CREATE INDEX idx_trust_scores_engine ON trust_scores(engine, time DESC);

-- ============================================================================
-- COMPLIANCE & AUDIT
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID,
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'execute')),
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  metadata JSONB DEFAULT '{}',
  hash TEXT NOT NULL  -- SHA256 hash for tamper detection
);

-- Convert to hypertable
SELECT create_hypertable('audit_logs', 'timestamp');

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id, timestamp DESC);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type, timestamp DESC);

CREATE TABLE compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('geofencing', 'data_residency', 'consent', 'encryption', 'export_control')),
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_rules_type ON compliance_rules(type);
CREATE INDEX idx_compliance_rules_enabled ON compliance_rules(enabled);

-- ============================================================================
-- ANALYTICS (TIME-SERIES)
-- ============================================================================

CREATE TABLE metrics (
  time TIMESTAMPTZ NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  tags JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

SELECT create_hypertable('metrics', 'time');

CREATE INDEX idx_metrics_name_time ON metrics(metric_name, time DESC);
CREATE INDEX idx_metrics_tags ON metrics USING GIN(tags);

CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'resource', 'transaction')),
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('usage_pattern', 'trust_decay', 'price_manipulation', 'fraud')),
  score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
  details JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_anomalies_entity ON anomalies(entity_id, entity_type);
CREATE INDEX idx_anomalies_type ON anomalies(anomaly_type, timestamp DESC);
CREATE INDEX idx_anomalies_unresolved ON anomalies(resolved, timestamp DESC) WHERE resolved = false;

-- ============================================================================
-- SCHEDULING POLICIES
-- ============================================================================

CREATE TABLE scheduling_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  constraints JSONB NOT NULL DEFAULT '[]',
  objectives JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduling_policies_enabled ON scheduling_policies(enabled, priority DESC);

CREATE TABLE scheduling_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES scheduling_policies(id) ON DELETE SET NULL,
  score DOUBLE PRECISION NOT NULL,
  reasoning JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduling_decisions_job ON scheduling_decisions(job_id);
CREATE INDEX idx_scheduling_decisions_timestamp ON scheduling_decisions(timestamp DESC);

-- ============================================================================
-- ENGINE CONFIGURATIONS
-- ============================================================================

CREATE TABLE engine_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  api_url TEXT NOT NULL,
  api_key TEXT,
  webhook_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_engine_configs_name ON engine_configs(name);
CREATE INDEX idx_engine_configs_enabled ON engine_configs(enabled);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_rules_updated_at BEFORE UPDATE ON compliance_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduling_policies_updated_at BEFORE UPDATE ON scheduling_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_engine_configs_updated_at BEFORE UPDATE ON engine_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Default scheduling policy
INSERT INTO scheduling_policies (name, priority, constraints, objectives, enabled)
VALUES (
  'Default Balanced Policy',
  100,
  '[
    {"type": "trust", "operator": "gte", "value": 30, "required": true},
    {"type": "availability", "operator": "eq", "value": true, "required": true}
  ]',
  '[
    {"type": "minimize_cost", "weight": 0.3},
    {"type": "minimize_latency", "weight": 0.2},
    {"type": "maximize_trust", "weight": 0.3},
    {"type": "maximize_availability", "weight": 0.2}
  ]',
  true
);

-- Compliance rules examples
INSERT INTO compliance_rules (name, type, conditions, actions, enabled)
VALUES
  (
    'GDPR Data Residency',
    'data_residency',
    '{"allowed_regions": ["EU", "US", "UK"]}',
    '["block_job", "log_violation"]',
    true
  ),
  (
    'US Export Controls',
    'export_control',
    '{"restricted_countries": ["CN", "RU", "KP", "IR"]}',
    '["block_job", "notify_admin"]',
    true
  );
