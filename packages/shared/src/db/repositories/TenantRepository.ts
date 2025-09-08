import { BaseRepository, DatabaseConnection } from '../index.js';

export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  planType: 'basic' | 'premium' | 'enterprise';
  createdAt: string;
  updatedAt: string;
}

export interface TenantSetting {
  tenantId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput {
  name: string;
  status?: 'active' | 'suspended' | 'deleted';
  planType?: 'basic' | 'premium' | 'enterprise';
}

export interface UpdateTenantInput {
  name?: string;
  status?: 'active' | 'suspended' | 'deleted';
  planType?: 'basic' | 'premium' | 'enterprise';
}

/**
 * Repository for tenant management operations
 */
export class TenantRepository extends BaseRepository {
  constructor(db: DatabaseConnection) {
    super(db);
  }

  /**
   * Create a new tenant
   */
  async create(input: CreateTenantInput): Promise<Tenant> {
    const { name, status = 'active', planType = 'basic' } = input;

    // Generate a UUID for the tenant
    const tenantId = require('crypto').randomUUID();

    await this.run(
      `
      INSERT INTO tenants (id, name, status, plan_type)
      VALUES (?, ?, ?, ?)
    `,
      [tenantId, name, status, planType]
    );

    const tenant = await this.findById(tenantId);
    if (!tenant) {
      throw new Error('Failed to create tenant');
    }

    this.emit('tenant-created', { tenant });
    return tenant;
  }

  /**
   * Find tenant by ID
   */
  async findById(id: string): Promise<Tenant | null> {
    const results = await this.query<Tenant>(
      `
      SELECT id, name, status, plan_type as planType, created_at as createdAt, updated_at as updatedAt
      FROM tenants 
      WHERE id = ?
    `,
      [id]
    );

    return results[0] || null;
  }

  /**
   * Find tenant by name
   */
  async findByName(name: string): Promise<Tenant | null> {
    const results = await this.query<Tenant>(
      `
      SELECT id, name, status, plan_type as planType, created_at as createdAt, updated_at as updatedAt
      FROM tenants 
      WHERE name = ?
    `,
      [name]
    );

    return results[0] || null;
  }

  /**
   * List all tenants with optional filtering
   */
  async list(
    options: {
      status?: string;
      planType?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Tenant[]> {
    const { status, planType, limit = 100, offset = 0 } = options;

    let sql = `
      SELECT id, name, status, plan_type as planType, created_at as createdAt, updated_at as updatedAt
      FROM tenants
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (planType) {
      conditions.push('plan_type = ?');
      params.push(planType);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.query<Tenant>(sql, params);
  }

  /**
   * Update tenant
   */
  async update(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
    const updates: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (input.planType !== undefined) {
      updates.push('plan_type = ?');
      params.push(input.planType);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.run(
      `
      UPDATE tenants 
      SET ${updates.join(', ')}
      WHERE id = ?
    `,
      params
    );

    const updatedTenant = await this.findById(id);
    if (updatedTenant) {
      this.emit('tenant-updated', { tenant: updatedTenant });
    }

    return updatedTenant;
  }

  /**
   * Delete tenant (soft delete by setting status)
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.run(
      `
      UPDATE tenants 
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'deleted'
    `,
      [id]
    );

    const success = result.changes > 0;
    if (success) {
      this.emit('tenant-deleted', { tenantId: id });
    }

    return success;
  }

  /**
   * Get tenant setting
   */
  async getSetting(tenantId: string, key: string): Promise<string | null> {
    const results = await this.query<{ value: string }>(
      `
      SELECT value 
      FROM tenant_settings 
      WHERE tenant_id = ? AND key = ?
    `,
      [tenantId, key]
    );

    return results[0]?.value || null;
  }

  /**
   * Set tenant setting
   */
  async setSetting(tenantId: string, key: string, value: string): Promise<void> {
    await this.run(
      `
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
      [tenantId, key, value]
    );

    this.emit('setting-updated', { tenantId, key, value });
  }

  /**
   * Get all settings for a tenant
   */
  async getSettings(tenantId: string): Promise<Record<string, string>> {
    const results = await this.query<{ key: string; value: string }>(
      `
      SELECT key, value 
      FROM tenant_settings 
      WHERE tenant_id = ?
    `,
      [tenantId]
    );

    const settings: Record<string, string> = {};
    for (const row of results) {
      settings[row.key] = row.value;
    }

    return settings;
  }

  /**
   * Delete tenant setting
   */
  async deleteSetting(tenantId: string, key: string): Promise<boolean> {
    const result = await this.run(
      `
      DELETE FROM tenant_settings 
      WHERE tenant_id = ? AND key = ?
    `,
      [tenantId, key]
    );

    const success = result.changes > 0;
    if (success) {
      this.emit('setting-deleted', { tenantId, key });
    }

    return success;
  }

  /**
   * Get tenant statistics
   */
  async getStats(tenantId: string): Promise<{
    totalGroups: number;
    totalUsers: number;
    totalDecisions: number;
    activePolicies: number;
  }> {
    const [groups, users, decisions, policies] = await Promise.all([
      this.query<{ count: number }>('SELECT COUNT(*) as count FROM groups WHERE tenant_id = ?', [
        tenantId,
      ]),
      this.query<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [
        tenantId,
      ]),
      this.query<{ count: number }>('SELECT COUNT(*) as count FROM decisions WHERE tenant_id = ?', [
        tenantId,
      ]),
      this.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM policies WHERE tenant_id = ? AND is_active = 1',
        [tenantId]
      ),
    ]);

    return {
      totalGroups: groups[0]?.count || 0,
      totalUsers: users[0]?.count || 0,
      totalDecisions: decisions[0]?.count || 0,
      activePolicies: policies[0]?.count || 0,
    };
  }
}
