/**
 * Services Layer
 *
 * Centralized business logic for all entities.
 * All services publish events and log activities automatically.
 *
 * Usage:
 * ```typescript
 * import { clientService, dealService, notificationService } from '@/lib/services';
 *
 * // Create a client
 * const client = await clientService.create({ name, email }, userId);
 *
 * // Mark deal as won
 * const deal = await dealService.markAsWon(dealId, userId, { createContract: true });
 *
 * // Send notification
 * await notificationService.create({ user_id: userId, title: 'Hello!' });
 * ```
 */

export { clientService, type CreateClientData, type UpdateClientData } from './client.service';
export { dealService, type CreateDealData, type UpdateDealData } from './deal.service';
export {
  notificationService,
  type CreateNotificationData,
  type Notification,
  type NotificationType
} from './notification.service';

export {
  rateLimitService,
  type RateLimitAction,
  type RateLimitResult,
  type RateLimitOptions,
  type AuditLogData
} from './rate-limit.service';

export { generateEmailSubjects, generateAdCopy } from './ai.service';

export { emailService } from '@/lib/email';

// Re-export event utilities for convenience
export { publishEvent, logActivity } from '@/lib/events/publisher';
