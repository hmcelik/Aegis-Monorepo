# Database Schema Design - EP4 Data Layer

## Current State Analysis

### Existing SQLite Tables

**Core Telegram Bot Tables:**

- `groups` - Chat group information
- `users` - User profiles and metadata
- `strikes` - User warning/penalty tracking
- `audit_log` - Action history and compliance
- `settings` - Per-group configuration
- `keyword_whitelist` - Group-specific allowed terms

**Budget & AI Management Tables:**

- `tenant_budgets` - Monthly AI spend limits per tenant
- `ai_usage` - AI call tracking for cost accounting

## Target Postgres Schema Design

### Core Design Principles

1. **Normalized Schema**: Proper foreign keys and constraints
2. **Tenant Isolation**: Multi-tenant architecture with row-level security
3. **Event Sourcing**: Comprehensive audit trail with immutable events
4. **Performance**: Proper indexing and partitioning strategy
5. **Observability**: Built-in metrics and usage tracking tables

### Proposed Schema

#### 1. Tenants & Organizations

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    plan_type VARCHAR(50) NOT NULL DEFAULT 'basic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_settings (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, key)
);
```

#### 2. Groups & Users (Telegram Entities)

```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chat_id BIGINT UNIQUE NOT NULL,
    chat_title VARCHAR(255) NOT NULL,
    chat_type VARCHAR(50) NOT NULL,
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    language_code VARCHAR(10),
    is_bot BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'member', -- member, admin, owner, banned
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (group_id, user_id)
);
```

#### 3. Event Sourcing Tables

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    sequence_number BIGSERIAL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_events_tenant_type ON events(tenant_id, event_type);
CREATE INDEX idx_events_aggregate ON events(aggregate_id, aggregate_type);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
```

#### 4. Decision & Action Tracking

```sql
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id BIGINT,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 of normalized content
    verdict VARCHAR(50) NOT NULL, -- allow, block, warn, escalate
    confidence DECIMAL(5,4), -- AI confidence score
    reasoning JSONB, -- AI reasoning or rule matches
    processing_time_ms INTEGER,
    ai_model VARCHAR(100),
    ai_cost DECIMAL(10,6),
    cache_hit BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- delete, warn, ban, restrict
    action_data JSONB NOT NULL DEFAULT '{}',
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT
);

CREATE INDEX idx_decisions_tenant_group ON decisions(tenant_id, group_id);
CREATE INDEX idx_decisions_content_hash ON decisions(content_hash);
CREATE INDEX idx_decisions_created_at ON decisions(created_at);
```

#### 5. Policy Management

```sql
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    policy_data JSONB NOT NULL, -- Rules, thresholds, keywords
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_policies (
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 100,
    overrides JSONB DEFAULT '{}',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, policy_id)
);
```

#### 6. Usage & Budget Tracking

```sql
CREATE TABLE usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- messages, ai_calls, storage_bytes
    metric_value BIGINT NOT NULL,
    cost DECIMAL(10,6),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    limit_type VARCHAR(50) NOT NULL, -- monthly_ai_cost, daily_messages
    limit_value DECIMAL(10,2) NOT NULL,
    current_usage DECIMAL(10,2) NOT NULL DEFAULT 0,
    reset_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
    last_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    degrade_mode VARCHAR(50) NOT NULL DEFAULT 'strict_rules',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned table for high-volume usage data
CREATE TABLE daily_usage_rollups (
    tenant_id UUID NOT NULL,
    usage_date DATE NOT NULL,
    messages_processed BIGINT DEFAULT 0,
    ai_calls_made INTEGER DEFAULT 0,
    ai_cost DECIMAL(10,6) DEFAULT 0,
    cache_hits INTEGER DEFAULT 0,
    cache_misses INTEGER DEFAULT 0,
    avg_processing_time_ms DECIMAL(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, usage_date)
) PARTITION BY RANGE (usage_date);
```

### Migration Strategy

#### Phase 1: Dual-Write Setup

1. Create Postgres schema alongside SQLite
2. Implement repository pattern with database abstraction
3. Add feature flag for dual-write mode
4. Validate data consistency between databases

#### Phase 2: Read Migration

1. Switch reads to Postgres (behind feature flag)
2. Monitor performance and consistency
3. Gradual rollout to all tenants

#### Phase 3: Full Cutover

1. Stop dual-write to SQLite
2. Archive SQLite data
3. Remove SQLite dependencies

### Performance Considerations

#### Indexing Strategy

- Primary keys (UUID) with btree indexes
- Foreign key indexes for joins
- Composite indexes for common query patterns
- Partial indexes for filtered queries

#### Partitioning

- Daily usage rollups partitioned by date
- Events table partitioned by tenant_id
- Consider sharding for very high volume

#### Row-Level Security

```sql
-- Enable RLS for tenant isolation
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

-- Policies ensure users only see their tenant's data
CREATE POLICY tenant_isolation ON tenants FOR ALL
USING (id = current_setting('app.current_tenant_id')::UUID);
```

This design provides a robust foundation for the Aegis system with proper multi-tenancy, event sourcing, and observability built-in.
