import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeAlertService } from '@/lib/services/store-alert.service';
import { logger } from '@/lib/logger';

const log = logger.child('StoreAlertUpdateAPI');

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: alertId } = await params;
    const body = await request.json();
    const { action } = body as { action: 'acknowledge' | 'resolve' };

    if (!action || !['acknowledge', 'resolve'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "acknowledge" or "resolve".' },
        { status: 400 }
      );
    }

    let success = false;

    if (action === 'acknowledge') {
      success = await storeAlertService.acknowledgeAlert(alertId, user.id);
    } else if (action === 'resolve') {
      success = await storeAlertService.resolveAlert(alertId, user.id);
    }

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to update alert' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in PATCH /api/stores/alerts/[id]:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
