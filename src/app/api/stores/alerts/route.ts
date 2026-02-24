import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeAlertService, type AlertFilters } from '@/lib/services/store-alert.service';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertsAPI');

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const filters: AlertFilters = {};
    if (searchParams.get('store_id')) filters.store_id = searchParams.get('store_id')!;
    if (searchParams.get('client_id')) filters.client_id = searchParams.get('client_id')!;
    if (searchParams.get('status')) filters.status = searchParams.get('status') as AlertFilters['status'];
    if (searchParams.get('type')) filters.type = searchParams.get('type') as AlertFilters['type'];
    if (searchParams.get('severity')) filters.severity = searchParams.get('severity') as AlertFilters['severity'];
    if (searchParams.get('limit')) filters.limit = parseInt(searchParams.get('limit')!);

    const alerts = await storeAlertService.getAlerts(filters);

    return NextResponse.json({ success: true, alerts });
  } catch (error) {
    log.error('Error in GET /api/stores/alerts:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
