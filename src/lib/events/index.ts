/**
 * Event System
 *
 * Provides event publishing and activity logging for the Convertfy ecosystem.
 *
 * Usage:
 * ```typescript
 * import { publishEvent, logActivity } from '@/lib/events';
 *
 * // Publish an event
 * await publishEvent({
 *   event_type: 'client.created',
 *   entity_type: 'client',
 *   entity_id: client.id,
 *   actor_id: userId,
 *   actor_type: 'admin',
 *   payload: { client }
 * });
 *
 * // Log an activity
 * await logActivity({
 *   client_id: clientId,
 *   user_id: userId,
 *   type: 'client_created',
 *   description: 'Client was created'
 * });
 * ```
 */

export { publishEvent, publishEvents, logActivity } from './publisher';
