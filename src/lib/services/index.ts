/**
 * Services Layer
 *
 * Centralized business logic for all entities.
 * All services publish events and log activities automatically.
 *
 * Usage:
 * ```typescript
 * import { clientService, dealService } from '@/lib/services';
 *
 * // Create a client
 * const client = await clientService.create({ name, email }, userId);
 *
 * // Mark deal as won
 * const deal = await dealService.markAsWon(dealId, userId, { createContract: true });
 * ```
 */

export { clientService, type CreateClientData, type UpdateClientData } from './client.service';
export { dealService, type CreateDealData, type UpdateDealData } from './deal.service';

// Re-export event utilities for convenience
export { publishEvent, logActivity } from '@/lib/events/publisher';
