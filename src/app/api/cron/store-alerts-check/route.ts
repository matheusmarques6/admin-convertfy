import { NextRequest, NextResponse } from 'next/server';
import { runAllChecks } from '@/lib/services/store-alert-checker';
import { requireCronAuth } from '@/lib/api/cron-auth';
import { logger } from '@/lib/logger';

const log = logger.child('CronStoreAlerts');

/**
 * Vercel Cron Job — Weekly store alerts check
 * Configured in vercel.json with schedule: "0 8 * * 1" (Monday 8AM UTC)
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    log.info('Weekly store alerts cron started');

    const results = await runAllChecks();

    const totalCreated = results.reduce((sum, r) => sum + r.alerts_created, 0);
    const totalResolved = results.reduce((sum, r) => sum + r.alerts_resolved, 0);

    log.info(`Weekly cron completed: ${results.length} stores, ${totalCreated} alerts created, ${totalResolved} resolved`);

    return NextResponse.json({
      success: true,
      stores_checked: results.length,
      alerts_created: totalCreated,
      alerts_resolved: totalResolved,
    });
  } catch (error) {
    log.error('Cron store alerts check failed:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
