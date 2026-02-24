import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeAlertService } from '@/lib/services/store-alert.service';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertsSummaryAPI');

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') || undefined;

    const summary = await storeAlertService.getAlertsSummary(storeId);

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    log.error('Error in GET /api/stores/alerts/summary:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
