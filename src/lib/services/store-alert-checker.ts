/**
 * Store Alert Checker Engine
 *
 * Verifies 4 conditions for each store and creates alerts when needed:
 * 1. Low revenue (below configured threshold vs 3-month average)
 * 2. Klaviyo account errors (API connection failure)
 * 3. Campaign failures (campaigns with error status)
 * 4. Low recovery rate (result % below 10%)
 */

import { createAdminClient } from '@/lib/supabase/server';
import { storeAlertService, type CreateAlertData } from './store-alert.service';
import { getStoreCredentials } from '@/lib/services/credentials.service';
import { getKlaviyoRevenueForStore } from '@/lib/integrations/klaviyo/report-summary';
import { getOmnisendRevenueForStore } from '@/lib/integrations/omnisend/report-summary';
import { getShopifyReportForStore } from '@/lib/integrations/shopify/report';
import { testApiConnection as testKlaviyoConnection } from '@/lib/integrations/klaviyo/account';
import { omnisendRequest } from '@/lib/integrations/omnisend/client';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertChecker');

export interface CheckResult {
  store_id: string;
  store_name: string;
  alerts_created: number;
  alerts_resolved: number;
  checks: {
    revenue: 'ok' | 'alert' | 'skipped' | 'error';
    klaviyo_health: 'ok' | 'alert' | 'skipped' | 'error';
    omnisend_health: 'ok' | 'alert' | 'skipped' | 'error';
    campaign_failures: 'ok' | 'alert' | 'skipped' | 'error';
    recovery_rate: 'ok' | 'alert' | 'skipped' | 'error';
  };
}

interface StoreForCheck {
  id: string;
  client_id: string | null;
  store_name: string;
  is_active: boolean;
  alert_revenue_threshold: number;
  email_platform: 'klaviyo' | 'omnisend' | null;
  klaviyo_private_key: string | null;
  klaviyo_api_key: string | null;
  omnisend_api_key: string | null;
  shopify_access_token: string | null;
}

/**
 * Run all checks for a single store or all active stores
 */
export async function runAllChecks(storeId?: string): Promise<CheckResult[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('client_stores')
    .select('id, client_id, store_name, is_active, alert_revenue_threshold, email_platform, klaviyo_private_key, klaviyo_api_key, omnisend_api_key, shopify_access_token')
    .eq('is_active', true);

  if (storeId) {
    query = query.eq('id', storeId);
  }

  const { data: stores, error } = await query;

  if (error) {
    log.error('Failed to fetch stores for alert check:', error);
    return [];
  }

  if (!stores || stores.length === 0) {
    log.info('No active stores found for alert check');
    return [];
  }

  const results: CheckResult[] = [];

  // Process stores sequentially to avoid rate limits on external APIs
  for (const store of stores as StoreForCheck[]) {
    try {
      const result = await checkStore(store);
      results.push(result);
    } catch (err) {
      log.error(`Error checking store ${store.id}:`, err);
      results.push({
        store_id: store.id,
        store_name: store.store_name,
        alerts_created: 0,
        alerts_resolved: 0,
        checks: {
          revenue: 'error',
          klaviyo_health: 'error',
          omnisend_health: 'error',
          campaign_failures: 'error',
          recovery_rate: 'error',
        },
      });
    }
  }

  const totalCreated = results.reduce((sum, r) => sum + r.alerts_created, 0);
  const totalResolved = results.reduce((sum, r) => sum + r.alerts_resolved, 0);
  log.info(`Alert check completed: ${results.length} stores checked, ${totalCreated} alerts created, ${totalResolved} auto-resolved`);

  return results;
}

/**
 * Run all 4 checks for a single store
 */
async function checkStore(store: StoreForCheck): Promise<CheckResult> {
  const result: CheckResult = {
    store_id: store.id,
    store_name: store.store_name,
    alerts_created: 0,
    alerts_resolved: 0,
    checks: {
      revenue: 'skipped',
      klaviyo_health: 'skipped',
      omnisend_health: 'skipped',
      campaign_failures: 'skipped',
      recovery_rate: 'skipped',
    },
  };

  const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key);
  const hasOmnisend = !!store.omnisend_api_key;
  const hasEmailPlatform = hasKlaviyo || hasOmnisend;
  const hasShopify = !!store.shopify_access_token;

  // Run checks in parallel where possible
  const [revenueResult, klaviyoHealthResult, omnisendHealthResult, campaignResult, recoveryResult] = await Promise.allSettled([
    hasEmailPlatform || hasShopify ? checkRevenue(store) : Promise.resolve(null),
    hasKlaviyo ? checkKlaviyoHealth(store) : Promise.resolve(null),
    hasOmnisend ? checkOmnisendHealth(store) : Promise.resolve(null),
    hasEmailPlatform ? checkCampaignFailures(store) : Promise.resolve(null),
    hasEmailPlatform || hasShopify ? checkRecoveryRate(store) : Promise.resolve(null),
  ]);

  // Process revenue check
  if (revenueResult.status === 'fulfilled' && revenueResult.value !== null) {
    result.checks.revenue = revenueResult.value.status;
    result.alerts_created += revenueResult.value.created;
    result.alerts_resolved += revenueResult.value.resolved;
  } else if (revenueResult.status === 'rejected') {
    result.checks.revenue = 'error';
  }

  // Process Klaviyo health check
  if (klaviyoHealthResult.status === 'fulfilled' && klaviyoHealthResult.value !== null) {
    result.checks.klaviyo_health = klaviyoHealthResult.value.status;
    result.alerts_created += klaviyoHealthResult.value.created;
    result.alerts_resolved += klaviyoHealthResult.value.resolved;
  } else if (klaviyoHealthResult.status === 'rejected') {
    result.checks.klaviyo_health = 'error';
  }

  // Process Omnisend health check
  if (omnisendHealthResult.status === 'fulfilled' && omnisendHealthResult.value !== null) {
    result.checks.omnisend_health = omnisendHealthResult.value.status;
    result.alerts_created += omnisendHealthResult.value.created;
    result.alerts_resolved += omnisendHealthResult.value.resolved;
  } else if (omnisendHealthResult.status === 'rejected') {
    result.checks.omnisend_health = 'error';
  }

  // Process campaign failures check
  if (campaignResult.status === 'fulfilled' && campaignResult.value !== null) {
    result.checks.campaign_failures = campaignResult.value.status;
    result.alerts_created += campaignResult.value.created;
    result.alerts_resolved += campaignResult.value.resolved;
  } else if (campaignResult.status === 'rejected') {
    result.checks.campaign_failures = 'error';
  }

  // Process recovery rate check
  if (recoveryResult.status === 'fulfilled' && recoveryResult.value !== null) {
    result.checks.recovery_rate = recoveryResult.value.status;
    result.alerts_created += recoveryResult.value.created;
    result.alerts_resolved += recoveryResult.value.resolved;
  } else if (recoveryResult.status === 'rejected') {
    result.checks.recovery_rate = 'error';
  }

  return result;
}

interface SingleCheckResult {
  status: 'ok' | 'alert' | 'error';
  created: number;
  resolved: number;
}

/**
 * Check 1: Revenue drop vs 3-month average
 */
async function checkRevenue(store: StoreForCheck): Promise<SingleCheckResult> {
  try {
    const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key);
    const hasOmnisend = !!store.omnisend_api_key;
    const hasShopify = !!store.shopify_access_token;

    const getEmailRevenue = (period: string) => {
      if (store.email_platform === 'omnisend' && hasOmnisend) {
        return getOmnisendRevenueForStore(store.id, period).catch(() => null);
      }
      if (hasKlaviyo) {
        return getKlaviyoRevenueForStore(store.id, period).catch(() => null);
      }
      if (hasOmnisend) {
        return getOmnisendRevenueForStore(store.id, period).catch(() => null);
      }
      return Promise.resolve(null);
    };

    // Get current 30-day revenue
    const [shopifyCurrent, emailCurrentResult] = await Promise.all([
      hasShopify ? getShopifyReportForStore(store.id, '30d').catch(() => null) : Promise.resolve(null),
      getEmailRevenue('30d'),
    ]);

    // Get 90-day revenue (to calculate 3-month average)
    const [shopify90d, email90dResult] = await Promise.all([
      hasShopify ? getShopifyReportForStore(store.id, '90d').catch(() => null) : Promise.resolve(null),
      getEmailRevenue('90d'),
    ]);

    const emailCurrent = emailCurrentResult?.success ? emailCurrentResult.data : null;
    const email90d = email90dResult?.success ? email90dResult.data : null;

    // Calculate current total revenue
    let currentRevenue = 0;
    if (shopifyCurrent?.connected && shopifyCurrent.summary) {
      currentRevenue = shopifyCurrent.summary.totalRevenue || 0;
    } else if (emailCurrent) {
      currentRevenue = emailCurrent.totalRevenue || 0;
    }

    // Calculate 3-month average (90d total / 3)
    let revenue90d = 0;
    if (shopify90d?.connected && shopify90d.summary) {
      revenue90d = shopify90d.summary.totalRevenue || 0;
    } else if (email90d) {
      revenue90d = email90d.totalRevenue || 0;
    }

    const monthlyAverage = revenue90d / 3;

    // Skip if no historical data
    if (monthlyAverage <= 0) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    const dropPercent = ((monthlyAverage - currentRevenue) / monthlyAverage) * 100;
    const threshold = store.alert_revenue_threshold || 30;

    if (dropPercent >= threshold) {
      // Revenue is below threshold
      const alertData: CreateAlertData = {
        store_id: store.id,
        client_id: store.client_id,
        type: 'low_revenue',
        severity: 'critical',
        title: `Faturamento ${dropPercent.toFixed(0)}% abaixo da média`,
        message: `A loja ${store.store_name} está com faturamento de R$ ${currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} nos últimos 30 dias, ${dropPercent.toFixed(0)}% abaixo da média mensal de R$ ${monthlyAverage.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (limiar: ${threshold}%).`,
        metadata: {
          current_revenue: currentRevenue,
          monthly_average: monthlyAverage,
          drop_percent: Math.round(dropPercent * 10) / 10,
          threshold,
        },
      };

      const alert = await storeAlertService.createAlert(alertData);
      return { status: 'alert', created: alert ? 1 : 0, resolved: 0 };
    }

    // Revenue is OK — auto-resolve any existing low_revenue alerts
    const resolved = await storeAlertService.autoResolveAlerts(store.id, 'low_revenue');
    return { status: 'ok', created: 0, resolved };
  } catch (err) {
    log.error(`Revenue check error for store ${store.id}:`, err);
    return { status: 'error', created: 0, resolved: 0 };
  }
}

/**
 * Check 2: Klaviyo API connection health
 */
async function checkKlaviyoHealth(store: StoreForCheck): Promise<SingleCheckResult> {
  try {
    const creds = await getStoreCredentials(store.id);
    const apiKey = creds.klaviyo_private_key || creds.klaviyo_api_key;

    if (!apiKey) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    const isConnected = await testKlaviyoConnection(apiKey);

    if (!isConnected) {
      const alertData: CreateAlertData = {
        store_id: store.id,
        client_id: store.client_id,
        type: 'klaviyo_account_error',
        severity: 'critical',
        title: 'Erro na conta Klaviyo',
        message: `A conexão com a API da Klaviyo falhou para a loja ${store.store_name}. Verifique se a chave API está válida e a conta está ativa.`,
        metadata: { tested_at: new Date().toISOString() },
      };

      const alert = await storeAlertService.createAlert(alertData);
      return { status: 'alert', created: alert ? 1 : 0, resolved: 0 };
    }

    // Connection OK — auto-resolve any existing klaviyo_account_error alerts
    const resolved = await storeAlertService.autoResolveAlerts(store.id, 'klaviyo_account_error');
    return { status: 'ok', created: 0, resolved };
  } catch (err) {
    log.error(`Klaviyo health check error for store ${store.id}:`, err);
    return { status: 'error', created: 0, resolved: 0 };
  }
}

/**
 * Check 2b: Omnisend API connection health (via /v3/brands)
 */
async function checkOmnisendHealth(store: StoreForCheck): Promise<SingleCheckResult> {
  try {
    const creds = await getStoreCredentials(store.id);
    const apiKey = creds.omnisend_api_key;

    if (!apiKey) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    let isConnected = true;
    try {
      // /v3/brands is a lightweight endpoint that validates the key
      const resp = await omnisendRequest<{ brandID?: string }>(apiKey, '/v3/brands', {
        logTag: 'AlertChecker.Omnisend',
      });
      isConnected = !!resp;
    } catch {
      isConnected = false;
    }

    if (!isConnected) {
      const alertData: CreateAlertData = {
        store_id: store.id,
        client_id: store.client_id,
        type: 'omnisend_account_error',
        severity: 'critical',
        title: 'Erro na conta Omnisend',
        message: `A conexão com a API da Omnisend falhou para a loja ${store.store_name}. Verifique se a chave API está válida e a conta está ativa.`,
        metadata: { tested_at: new Date().toISOString() },
      };

      const alert = await storeAlertService.createAlert(alertData);
      return { status: 'alert', created: alert ? 1 : 0, resolved: 0 };
    }

    const resolved = await storeAlertService.autoResolveAlerts(store.id, 'omnisend_account_error');
    return { status: 'ok', created: 0, resolved };
  } catch (err) {
    log.error(`Omnisend health check error for store ${store.id}:`, err);
    return { status: 'error', created: 0, resolved: 0 };
  }
}

/**
 * Check 3: Campaign failures in the last 7 days
 */
async function checkCampaignFailures(store: StoreForCheck): Promise<SingleCheckResult> {
  try {
    const creds = await getStoreCredentials(store.id);
    const klaviyoKey = creds.klaviyo_private_key || creds.klaviyo_api_key;
    const omnisendKey = creds.omnisend_api_key;
    const useOmnisend = store.email_platform === 'omnisend' && !!omnisendKey;
    const useKlaviyo = !useOmnisend && !!klaviyoKey;

    if (!useOmnisend && !useKlaviyo) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentFailures: Array<{ id: string; name: string; status: string }> = [];

    if (useKlaviyo) {
      const { klaviyoRequest } = await import('@/lib/integrations/klaviyo/client');

      const response = await klaviyoRequest<{
        data: Array<{
          id: string;
          attributes: { name: string; status: string; send_time: string | null };
        }>;
      }>(klaviyoKey, `/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at&page[size]=20`, {
        logTag: 'AlertChecker',
      });

      const campaigns = response?.data || [];
      const failedCampaigns = campaigns.filter(
        (c) => c.attributes.status === 'cancelled' || c.attributes.status === 'failed'
      );

      for (const c of failedCampaigns) {
        const sendTime = c.attributes.send_time;
        if (sendTime && new Date(sendTime) >= sevenDaysAgo) {
          recentFailures.push({ id: c.id, name: c.attributes.name, status: c.attributes.status });
        }
      }
    } else {
      // Omnisend: /v3/campaigns lista campanhas com status; usar status "error"/"paused"
      const response = await omnisendRequest<{
        campaigns?: Array<{ campaignID: string; name: string; status: string; sentDate?: string; createdDate?: string }>;
      }>(omnisendKey!, `/v3/campaigns?limit=50`, { logTag: 'AlertChecker.Omnisend' });

      const campaigns = response?.campaigns || [];
      const failedCampaigns = campaigns.filter(
        (c) => c.status === 'error' || c.status === 'failed' || c.status === 'canceled'
      );

      for (const c of failedCampaigns) {
        const sendTime = c.sentDate || c.createdDate;
        if (sendTime && new Date(sendTime) >= sevenDaysAgo) {
          recentFailures.push({ id: c.campaignID, name: c.name, status: c.status });
        }
      }
    }

    if (recentFailures.length > 0) {
      const names = recentFailures.map((c) => c.name).join(', ');
      const alertData: CreateAlertData = {
        store_id: store.id,
        client_id: store.client_id,
        type: 'campaign_failure',
        severity: 'warning',
        title: `${recentFailures.length} campanha(s) com falha`,
        message: `A loja ${store.store_name} tem ${recentFailures.length} campanha(s) com falha nos últimos 7 dias: ${names}`,
        metadata: {
          failed_campaigns: recentFailures,
          platform: useOmnisend ? 'omnisend' : 'klaviyo',
          checked_at: new Date().toISOString(),
        },
      };

      const alert = await storeAlertService.createAlert(alertData);
      return { status: 'alert', created: alert ? 1 : 0, resolved: 0 };
    }

    // No failures — auto-resolve
    const resolved = await storeAlertService.autoResolveAlerts(store.id, 'campaign_failure');
    return { status: 'ok', created: 0, resolved };
  } catch (err) {
    log.error(`Campaign failure check error for store ${store.id}:`, err);
    return { status: 'error', created: 0, resolved: 0 };
  }
}

/**
 * Check 4: Recovery rate below 10%
 * Recovery rate = Klaviyo Revenue / Total Revenue (Shopify)
 */
async function checkRecoveryRate(store: StoreForCheck): Promise<SingleCheckResult> {
  try {
    const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key);
    const hasOmnisend = !!store.omnisend_api_key;
    const hasShopify = !!store.shopify_access_token;

    if (!hasKlaviyo && !hasOmnisend) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    const useOmnisend = store.email_platform === 'omnisend' && hasOmnisend;
    const platformLabel = useOmnisend ? 'Omnisend' : 'Klaviyo';

    // Get 30-day revenue data
    const [shopifyResult, emailResultRaw] = await Promise.all([
      hasShopify ? getShopifyReportForStore(store.id, '30d').catch(() => null) : Promise.resolve(null),
      useOmnisend
        ? getOmnisendRevenueForStore(store.id, '30d').catch(() => null)
        : getKlaviyoRevenueForStore(store.id, '30d').catch(() => null),
    ]);

    let totalRevenue = 0;
    if (shopifyResult?.connected && shopifyResult.summary) {
      totalRevenue = shopifyResult.summary.totalRevenue || 0;
    }

    const emailData = emailResultRaw?.success ? emailResultRaw.data : null;
    const emailRevenue = emailData?.totalRevenue || 0;

    // Skip if no total revenue (can't calculate rate)
    if (totalRevenue <= 0) {
      return { status: 'ok', created: 0, resolved: 0 };
    }

    const recoveryRate = (emailRevenue / totalRevenue) * 100;

    if (recoveryRate < 10) {
      const alertData: CreateAlertData = {
        store_id: store.id,
        client_id: store.client_id,
        type: 'low_recovery_rate',
        severity: 'warning',
        title: `Taxa de recuperação em ${recoveryRate.toFixed(1)}%`,
        message: `A loja ${store.store_name} está com taxa de recuperação de email de ${recoveryRate.toFixed(1)}% (abaixo de 10%). Receita ${platformLabel}: R$ ${emailRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        metadata: {
          recovery_rate: Math.round(recoveryRate * 10) / 10,
          email_platform: useOmnisend ? 'omnisend' : 'klaviyo',
          email_revenue: emailRevenue,
          total_revenue: totalRevenue,
          threshold: 10,
        },
      };

      const alert = await storeAlertService.createAlert(alertData);
      return { status: 'alert', created: alert ? 1 : 0, resolved: 0 };
    }

    // Rate OK — auto-resolve
    const resolved = await storeAlertService.autoResolveAlerts(store.id, 'low_recovery_rate');
    return { status: 'ok', created: 0, resolved };
  } catch (err) {
    log.error(`Recovery rate check error for store ${store.id}:`, err);
    return { status: 'error', created: 0, resolved: 0 };
  }
}
