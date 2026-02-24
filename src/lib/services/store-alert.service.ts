import { createAdminClient } from '@/lib/supabase/server';
import { notificationService } from '@/lib/services/notification.service';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertService');

export type AlertType = 'low_revenue' | 'klaviyo_account_error' | 'campaign_failure' | 'low_recovery_rate';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface StoreAlert {
  id: string;
  store_id: string;
  client_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  status: AlertStatus;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  store_name?: string;
  client_name?: string;
}

export interface CreateAlertData {
  store_id: string;
  client_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AlertFilters {
  store_id?: string;
  client_id?: string;
  status?: AlertStatus;
  type?: AlertType;
  severity?: AlertSeverity;
  limit?: number;
}

export interface AlertsSummary {
  total_active: number;
  critical: number;
  warning: number;
  by_type: Record<AlertType, number>;
}

class StoreAlertService {
  /**
   * Create a new alert (with duplicate check)
   * Also sends in-app notification to admins
   */
  async createAlert(data: CreateAlertData): Promise<StoreAlert | null> {
    // Check for duplicate active alert of same type for same store
    const isDuplicate = await this.checkDuplicateAlert(data.store_id, data.type);
    if (isDuplicate) {
      log.info(`Skipping duplicate alert: ${data.type} for store ${data.store_id}`);
      return null;
    }

    const supabase = createAdminClient();

    const { data: alert, error } = await supabase
      .from('store_alerts')
      .insert({
        store_id: data.store_id,
        client_id: data.client_id,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      log.error('Failed to create alert:', error);
      return null;
    }

    // Send in-app notification to all admins
    try {
      await notificationService.notifyByRole(['admin', 'manager'], {
        title: `🚨 ${data.title}`,
        body: data.message,
        type: data.severity === 'critical' ? 'error' : 'warning',
        link: `/stores/${data.store_id}`,
        metadata: {
          alert_id: alert.id,
          alert_type: data.type,
          store_id: data.store_id,
        },
      });
    } catch (err) {
      log.error('Failed to send in-app notification for alert:', err);
    }

    // TODO: WhatsApp notification via Evolution API (Task 4)

    log.info(`Alert created: ${data.type} for store ${data.store_id} [${data.severity}]`);
    return alert;
  }

  /**
   * Check if there's already an active alert of the same type for a store
   */
  async checkDuplicateAlert(storeId: string, type: AlertType): Promise<boolean> {
    const supabase = createAdminClient();

    const { count, error } = await supabase
      .from('store_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('type', type)
      .in('status', ['active', 'acknowledged']);

    if (error) {
      log.error('Failed to check duplicate alert:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Get alerts with optional filters
   */
  async getAlerts(filters: AlertFilters = {}): Promise<StoreAlert[]> {
    const supabase = createAdminClient();

    let query = supabase
      .from('store_alerts')
      .select(`
        *,
        client_stores!inner(store_name),
        clients!inner(name)
      `)
      .order('created_at', { ascending: false })
      .limit(filters.limit || 50);

    if (filters.store_id) query = query.eq('store_id', filters.store_id);
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.severity) query = query.eq('severity', filters.severity);

    const { data, error } = await query;

    if (error) {
      log.error('Failed to get alerts:', error);
      return [];
    }

    return (data || []).map((row) => {
      const storeData = row.client_stores as unknown as { store_name: string } | null;
      const clientData = row.clients as unknown as { name: string } | null;
      return {
        ...row,
        store_name: storeData?.store_name || 'N/A',
        client_name: clientData?.name || 'N/A',
        client_stores: undefined,
        clients: undefined,
      } as StoreAlert;
    });
  }

  /**
   * Get alerts for a specific store
   */
  async getAlertsByStore(storeId: string, filters?: Partial<AlertFilters>): Promise<StoreAlert[]> {
    return this.getAlerts({ ...filters, store_id: storeId });
  }

  /**
   * Get all active alerts
   */
  async getActiveAlerts(): Promise<StoreAlert[]> {
    return this.getAlerts({ status: 'active' });
  }

  /**
   * Get alerts summary (counts by type and severity)
   */
  async getAlertsSummary(storeId?: string): Promise<AlertsSummary> {
    const supabase = createAdminClient();

    let query = supabase
      .from('store_alerts')
      .select('type, severity')
      .eq('status', 'active');

    if (storeId) query = query.eq('store_id', storeId);

    const { data, error } = await query;

    if (error) {
      log.error('Failed to get alerts summary:', error);
      return {
        total_active: 0,
        critical: 0,
        warning: 0,
        by_type: {
          low_revenue: 0,
          klaviyo_account_error: 0,
          campaign_failure: 0,
          low_recovery_rate: 0,
        },
      };
    }

    const alerts = data || [];
    const byType: Record<AlertType, number> = {
      low_revenue: 0,
      klaviyo_account_error: 0,
      campaign_failure: 0,
      low_recovery_rate: 0,
    };

    for (const alert of alerts) {
      byType[alert.type as AlertType] = (byType[alert.type as AlertType] || 0) + 1;
    }

    return {
      total_active: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      by_type: byType,
    };
  }

  /**
   * Acknowledge an alert (mark as seen)
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('store_alerts')
      .update({ status: 'acknowledged' })
      .eq('id', alertId)
      .eq('status', 'active');

    if (error) {
      log.error('Failed to acknowledge alert:', error);
      return false;
    }

    log.info(`Alert ${alertId} acknowledged by ${userId}`);
    return true;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string): Promise<boolean> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('store_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq('id', alertId)
      .in('status', ['active', 'acknowledged']);

    if (error) {
      log.error('Failed to resolve alert:', error);
      return false;
    }

    log.info(`Alert ${alertId} resolved by ${userId}`);
    return true;
  }

  /**
   * Auto-resolve active alerts of a given type for a store
   * Used when a check detects the condition has been fixed
   */
  async autoResolveAlerts(storeId: string, type: AlertType): Promise<number> {
    const supabase = createAdminClient();

    // First get existing alerts to preserve their metadata
    const { data: existing } = await supabase
      .from('store_alerts')
      .select('id, metadata')
      .eq('store_id', storeId)
      .eq('type', type)
      .in('status', ['active', 'acknowledged']);

    if (!existing || existing.length === 0) {
      return 0;
    }

    // Update each alert preserving original metadata
    const { data, error } = await supabase
      .from('store_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .in('id', existing.map((a) => a.id))
      .select('id');

    if (error) {
      log.error('Failed to auto-resolve alerts:', error);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      log.info(`Auto-resolved ${count} alert(s) of type ${type} for store ${storeId}`);
    }
    return count;
  }
}

export const storeAlertService = new StoreAlertService();
