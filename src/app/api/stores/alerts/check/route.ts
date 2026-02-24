import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runAllChecks } from '@/lib/services/store-alert-checker';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertsCheckAPI');

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') || undefined;

    log.info(`Manual alert check triggered by ${user.id}${storeId ? ` for store ${storeId}` : ' for all stores'}`);

    const results = await runAllChecks(storeId);

    const totalCreated = results.reduce((sum, r) => sum + r.alerts_created, 0);
    const totalResolved = results.reduce((sum, r) => sum + r.alerts_resolved, 0);

    return NextResponse.json({
      success: true,
      stores_checked: results.length,
      alerts_created: totalCreated,
      alerts_resolved: totalResolved,
      details: results,
    });
  } catch (error) {
    log.error('Error in POST /api/stores/alerts/check:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
