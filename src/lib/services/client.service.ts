import { createClient } from '@/lib/supabase/client';
import { publishEvent, logActivity } from '@/lib/events/publisher';
import type { Client, ClientStatus } from '@/types';

export interface CreateClientData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  website?: string;
  status?: ClientStatus;
  tags?: string[];
  owner_id?: string;
}

export interface UpdateClientData {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  status?: ClientStatus;
  health_score?: number;
  tags?: string[];
  owner_id?: string;
  custom_fields?: Record<string, unknown>;
}

class ClientService {
  /**
   * Create a new client
   */
  async create(data: CreateClientData, actorId: string): Promise<Client> {
    const supabase = createClient();

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        ...data,
        status: data.status || 'prospect',
        health_score: 100,
        tags: data.tags || [],
        custom_fields: {},
      })
      .select()
      .single();

    if (error) throw error;

    // Publish event
    await publishEvent({
      event_type: 'client.created',
      entity_type: 'client',
      entity_id: client.id,
      actor_id: actorId,
      actor_type: 'admin',
      payload: { client },
    });

    // Log activity
    await logActivity({
      client_id: client.id,
      user_id: actorId,
      type: 'client_created',
      description: `Cliente ${client.name} foi criado`,
      metadata: { client_email: client.email },
    });

    return client;
  }

  /**
   * Update a client
   */
  async update(
    clientId: string,
    data: UpdateClientData,
    actorId: string
  ): Promise<Client> {
    const supabase = createClient();

    // Get current client for comparison
    const { data: currentClient } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    const { data: client, error } = await supabase
      .from('clients')
      .update(data)
      .eq('id', clientId)
      .select()
      .single();

    if (error) throw error;

    // Check if status changed
    if (currentClient && data.status && currentClient.status !== data.status) {
      await publishEvent({
        event_type: 'client.status_changed',
        entity_type: 'client',
        entity_id: clientId,
        actor_id: actorId,
        actor_type: 'admin',
        payload: {
          old_status: currentClient.status,
          new_status: data.status,
          client_id: clientId,
          changed_by: actorId,
        },
      });

      await logActivity({
        client_id: clientId,
        user_id: actorId,
        type: 'status_changed',
        description: `Status alterado de ${currentClient.status} para ${data.status}`,
        metadata: { old_status: currentClient.status, new_status: data.status },
      });
    } else {
      await publishEvent({
        event_type: 'client.updated',
        entity_type: 'client',
        entity_id: clientId,
        actor_id: actorId,
        actor_type: 'admin',
        payload: { client, changes: data },
      });

      await logActivity({
        client_id: clientId,
        user_id: actorId,
        type: 'client_updated',
        description: `Cliente ${client.name} foi atualizado`,
      });
    }

    return client;
  }

  /**
   * Update client status
   */
  async updateStatus(
    clientId: string,
    newStatus: ClientStatus,
    actorId: string
  ): Promise<Client> {
    return this.update(clientId, { status: newStatus }, actorId);
  }

  /**
   * Delete a client
   */
  async delete(clientId: string, actorId: string): Promise<void> {
    const supabase = createClient();

    // Get client info before deletion
    const { data: client } = await supabase
      .from('clients')
      .select('name, email')
      .eq('id', clientId)
      .single();

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (error) throw error;

    // Publish event
    await publishEvent({
      event_type: 'client.deleted',
      entity_type: 'client',
      entity_id: clientId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: { client_name: client?.name, client_email: client?.email },
    });
  }

  /**
   * Get client by ID with relations
   */
  async getById(clientId: string): Promise<Client | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        contracts(*),
        owner:profiles!clients_owner_id_fkey(id, name, email, avatar_url)
      `)
      .eq('id', clientId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get all clients with optional filters
   */
  async getAll(filters?: {
    status?: ClientStatus;
    owner_id?: string;
    search?: string;
  }): Promise<Client[]> {
    const supabase = createClient();

    let query = supabase
      .from('clients')
      .select(`
        *,
        contracts(*),
        owner:profiles!clients_owner_id_fkey(id, name, email, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }

    if (filters?.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Add tag to client
   */
  async addTag(clientId: string, tag: string, actorId: string): Promise<void> {
    const supabase = createClient();

    const { data: client } = await supabase
      .from('clients')
      .select('tags')
      .eq('id', clientId)
      .single();

    const currentTags = client?.tags || [];
    if (currentTags.includes(tag)) return;

    await supabase
      .from('clients')
      .update({ tags: [...currentTags, tag] })
      .eq('id', clientId);

    await logActivity({
      client_id: clientId,
      user_id: actorId,
      type: 'client_updated',
      description: `Tag "${tag}" adicionada`,
    });
  }

  /**
   * Remove tag from client
   */
  async removeTag(clientId: string, tag: string, actorId: string): Promise<void> {
    const supabase = createClient();

    const { data: client } = await supabase
      .from('clients')
      .select('tags')
      .eq('id', clientId)
      .single();

    const currentTags = client?.tags || [];
    const newTags = currentTags.filter((t: string) => t !== tag);

    await supabase
      .from('clients')
      .update({ tags: newTags })
      .eq('id', clientId);

    await logActivity({
      client_id: clientId,
      user_id: actorId,
      type: 'client_updated',
      description: `Tag "${tag}" removida`,
    });
  }
}

export const clientService = new ClientService();
