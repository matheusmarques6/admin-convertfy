import { createClient } from '@/lib/supabase/client';
import type { PublishEventParams, SystemEvent } from '@/types/events';

/**
 * Publishes an event to the system event bus
 * Events are stored in Supabase and can trigger automations/notifications
 */
export async function publishEvent<T = Record<string, unknown>>(
  params: PublishEventParams<T>
): Promise<SystemEvent<T> | null> {
  try {
    const supabase = createClient();

    const eventData = {
      event_type: params.event_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      actor_id: params.actor_id,
      actor_type: params.actor_type,
      payload: params.payload,
      metadata: params.metadata || {},
      processed: false,
    };

    const { data, error } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      console.error('[EventPublisher] Failed to publish event:', error);
      return null;
    }

    // Log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Event] ${params.event_type}:`, params.entity_id);
    }

    return data as SystemEvent<T>;
  } catch (err) {
    console.error('[EventPublisher] Unexpected error:', err);
    return null;
  }
}

/**
 * Publishes multiple events in a batch
 */
export async function publishEvents(
  events: PublishEventParams[]
): Promise<number> {
  try {
    const supabase = createClient();

    const eventsData = events.map((params) => ({
      event_type: params.event_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      actor_id: params.actor_id,
      actor_type: params.actor_type,
      payload: params.payload,
      metadata: params.metadata || {},
      processed: false,
    }));

    const { data, error } = await supabase
      .from('events')
      .insert(eventsData)
      .select();

    if (error) {
      console.error('[EventPublisher] Failed to publish batch:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('[EventPublisher] Unexpected error in batch:', err);
    return 0;
  }
}

/**
 * Helper to create activity log from event
 */
export async function logActivity(params: {
  client_id?: string;
  deal_id?: string;
  user_id: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createClient();

    await supabase.from('activities').insert({
      client_id: params.client_id,
      deal_id: params.deal_id,
      user_id: params.user_id,
      type: params.type,
      description: params.description,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error('[Activity] Failed to log activity:', err);
  }
}
