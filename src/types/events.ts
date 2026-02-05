// Event Types for Convertfy Ecosystem

export type EventType =
  // Client Events
  | 'client.created'
  | 'client.updated'
  | 'client.status_changed'
  | 'client.deleted'
  | 'client.health_changed'

  // Deal Events
  | 'deal.created'
  | 'deal.updated'
  | 'deal.moved'
  | 'deal.won'
  | 'deal.lost'
  | 'deal.value_changed'

  // Meeting Events
  | 'meeting.scheduled'
  | 'meeting.rescheduled'
  | 'meeting.completed'
  | 'meeting.cancelled'
  | 'meeting.no_show'

  // Financial Events
  | 'payment.created'
  | 'payment.received'
  | 'payment.overdue'
  | 'payment.refunded'
  | 'contract.created'
  | 'contract.renewed'
  | 'contract.expiring'
  | 'contract.cancelled'

  // Report Events
  | 'report.created'
  | 'report.sent'

  // Automation Events
  | 'automation.triggered'
  | 'automation.completed'
  | 'automation.failed'

  // User Events
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated';

export type EntityType =
  | 'client'
  | 'deal'
  | 'meeting'
  | 'payment'
  | 'contract'
  | 'report'
  | 'automation'
  | 'user';

export type ActorType = 'admin' | 'agent' | 'client' | 'system';

export interface SystemEvent<T = Record<string, unknown>> {
  id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  actor_id: string | null;
  actor_type: ActorType;
  payload: T;
  metadata: EventMetadata;
  processed: boolean;
  created_at: string;
}

export interface EventMetadata {
  ip?: string;
  user_agent?: string;
  source_app?: 'admin' | 'agent' | 'client';
  correlation_id?: string;
}

export interface PublishEventParams<T = Record<string, unknown>> {
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  actor_id: string | null;
  actor_type: ActorType;
  payload: T;
  metadata?: EventMetadata;
}

// Event Handlers
export type EventHandler<T = Record<string, unknown>> = (
  event: SystemEvent<T>
) => Promise<void>;

// Event Subscription
export interface EventSubscription {
  event_type: EventType | EventType[];
  handler: EventHandler;
}

// Specific Event Payloads
export interface ClientCreatedPayload {
  client: {
    id: string;
    name: string;
    email: string;
    status: string;
    owner_id?: string;
  };
}

export interface ClientStatusChangedPayload {
  client_id: string;
  old_status: string;
  new_status: string;
  changed_by: string;
}

export interface DealMovedPayload {
  deal_id: string;
  old_stage_id: string;
  new_stage_id: string;
  old_stage_name: string;
  new_stage_name: string;
}

export interface DealWonPayload {
  deal: {
    id: string;
    title: string;
    value: number;
    client_id?: string;
  };
  contract_created: boolean;
  invoice_created: boolean;
}

export interface PaymentReceivedPayload {
  invoice_id: string;
  client_id: string;
  amount: number;
  payment_date: string;
}

export interface MeetingScheduledPayload {
  meeting: {
    id: string;
    title: string;
    client_id: string;
    scheduled_at: string;
    meeting_url?: string;
  };
}

export interface ReportCreatedPayload {
  report: {
    id: string;
    client_id: string;
    month: string;
    document_url?: string;
  };
  notify_client: boolean;
}
