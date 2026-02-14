import { createClient } from '@/lib/supabase/client';
import { publishEvent, logActivity } from '@/lib/events/publisher';
import type { Deal } from '@/types';

export interface CreateDealData {
  pipeline_id: string;
  stage_id: string;
  client_id?: string;
  title: string;
  value: number;
  probability?: number;
  expected_close_date?: string;
  owner_id: string;
  notes?: string;
}

export interface UpdateDealData {
  stage_id?: string;
  client_id?: string;
  title?: string;
  value?: number;
  probability?: number;
  expected_close_date?: string;
  owner_id?: string;
  notes?: string;
  custom_fields?: Record<string, unknown>;
}

class DealService {
  /**
   * Create a new deal
   */
  async create(data: CreateDealData, actorId: string): Promise<Deal> {
    const supabase = createClient();

    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        ...data,
        probability: data.probability || 0,
        custom_fields: {},
      })
      .select()
      .single();

    if (error) throw error;

    // Publish event
    await publishEvent({
      event_type: 'deal.created',
      entity_type: 'deal',
      entity_id: deal.id,
      actor_id: actorId,
      actor_type: 'admin',
      payload: { deal },
    });

    // Log activity
    await logActivity({
      deal_id: deal.id,
      client_id: deal.client_id,
      user_id: actorId,
      type: 'deal_created',
      description: `Deal "${deal.title}" criado com valor de R$ ${deal.value.toLocaleString('pt-BR')}`,
    });

    return deal;
  }

  /**
   * Update a deal
   */
  async update(
    dealId: string,
    data: UpdateDealData,
    actorId: string
  ): Promise<Deal> {
    const supabase = createClient();

    const { data: deal, error } = await supabase
      .from('deals')
      .update(data)
      .eq('id', dealId)
      .select()
      .single();

    if (error) throw error;

    await publishEvent({
      event_type: 'deal.updated',
      entity_type: 'deal',
      entity_id: dealId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: { deal, changes: data },
    });

    await logActivity({
      deal_id: dealId,
      client_id: deal.client_id,
      user_id: actorId,
      type: 'deal_updated',
      description: `Deal "${deal.title}" foi atualizado`,
    });

    return deal;
  }

  /**
   * Move deal to a different stage
   */
  async moveToStage(
    dealId: string,
    newStageId: string,
    actorId: string
  ): Promise<Deal> {
    const supabase = createClient();

    // Get current deal and stages info
    const { data: currentDeal } = await supabase
      .from('deals')
      .select(`
        *,
        current_stage:pipeline_stages!deals_stage_id_fkey(id, name)
      `)
      .eq('id', dealId)
      .single();

    const { data: newStage } = await supabase
      .from('pipeline_stages')
      .select('id, name')
      .eq('id', newStageId)
      .single();

    // Update deal
    const { data: deal, error } = await supabase
      .from('deals')
      .update({ stage_id: newStageId })
      .eq('id', dealId)
      .select()
      .single();

    if (error) throw error;

    // Get stage info for event
    const oldStage = Array.isArray(currentDeal?.current_stage)
      ? currentDeal?.current_stage[0]
      : currentDeal?.current_stage;

    // Publish event
    await publishEvent({
      event_type: 'deal.moved',
      entity_type: 'deal',
      entity_id: dealId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: {
        deal_id: dealId,
        old_stage_id: currentDeal?.stage_id,
        new_stage_id: newStageId,
        old_stage_name: oldStage?.name || 'Unknown',
        new_stage_name: newStage?.name || 'Unknown',
      },
    });

    // Log activity
    await logActivity({
      deal_id: dealId,
      client_id: deal.client_id,
      user_id: actorId,
      type: 'deal_updated',
      description: `Deal movido de "${oldStage?.name}" para "${newStage?.name}"`,
    });

    return deal;
  }

  /**
   * Mark deal as won
   */
  async markAsWon(
    dealId: string,
    actorId: string,
    options?: { createContract?: boolean; createInvoice?: boolean }
  ): Promise<Deal> {
    const supabase = createClient();

    // Get deal info
    const { data: deal, error: fetchError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    if (fetchError) throw fetchError;

    // Get "won" stage (last stage) for the pipeline
    const { data: wonStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', deal.pipeline_id)
      .order('order', { ascending: false })
      .limit(1)
      .single();

    // Update deal to won stage with 100% probability
    const { data: updatedDeal, error: updateError } = await supabase
      .from('deals')
      .update({
        stage_id: wonStage?.id || deal.stage_id,
        probability: 100,
      })
      .eq('id', dealId)
      .select()
      .single();

    if (updateError) throw updateError;

    let contractCreated = false;
    let invoiceCreated = false;

    // Optionally create contract
    if (options?.createContract && deal.client_id) {
      const { error: contractError } = await supabase.from('contracts').insert({
        client_id: deal.client_id,
        plan_name: deal.title,
        monthly_value: deal.value,
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
      });
      contractCreated = !contractError;
    }

    // Optionally create invoice
    if (options?.createInvoice && deal.client_id) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const { error: invoiceError } = await supabase.from('invoices').insert({
        client_id: deal.client_id,
        amount: deal.value,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending',
        description: `Pagamento referente a: ${deal.title}`,
      });
      invoiceCreated = !invoiceError;
    }

    // Publish event
    await publishEvent({
      event_type: 'deal.won',
      entity_type: 'deal',
      entity_id: dealId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: {
        deal: {
          id: deal.id,
          title: deal.title,
          value: deal.value,
          client_id: deal.client_id,
        },
        contract_created: contractCreated,
        invoice_created: invoiceCreated,
      },
    });

    // Log activity
    await logActivity({
      deal_id: dealId,
      client_id: deal.client_id,
      user_id: actorId,
      type: 'deal_won',
      description: `Deal "${deal.title}" foi ganho! Valor: R$ ${deal.value.toLocaleString('pt-BR')}`,
      metadata: { value: deal.value, contract_created: contractCreated },
    });

    return updatedDeal;
  }

  /**
   * Mark deal as lost
   */
  async markAsLost(
    dealId: string,
    actorId: string,
    reason?: string
  ): Promise<Deal> {
    const supabase = createClient();

    // Get deal info
    const { data: deal } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    // Update deal probability to 0
    const { data: updatedDeal, error } = await supabase
      .from('deals')
      .update({
        probability: 0,
        notes: reason ? `${deal?.notes || ''}\n\nMotivo da perda: ${reason}`.trim() : deal?.notes,
      })
      .eq('id', dealId)
      .select()
      .single();

    if (error) throw error;

    // Publish event
    await publishEvent({
      event_type: 'deal.lost',
      entity_type: 'deal',
      entity_id: dealId,
      actor_id: actorId,
      actor_type: 'admin',
      payload: {
        deal: { id: deal?.id, title: deal?.title, value: deal?.value },
        reason,
      },
    });

    // Log activity
    await logActivity({
      deal_id: dealId,
      client_id: deal?.client_id,
      user_id: actorId,
      type: 'deal_lost',
      description: `Deal "${deal?.title}" foi perdido${reason ? `: ${reason}` : ''}`,
    });

    return updatedDeal;
  }

  /**
   * Delete a deal
   */
  async delete(dealId: string, actorId: string): Promise<void> {
    const supabase = createClient();

    const { data: deal } = await supabase
      .from('deals')
      .select('title, client_id')
      .eq('id', dealId)
      .single();

    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', dealId);

    if (error) throw error;

    await logActivity({
      deal_id: dealId,
      client_id: deal?.client_id,
      user_id: actorId,
      type: 'deal_updated',
      description: `Deal "${deal?.title}" foi excluído`,
    });
  }

  /**
   * Get deal by ID
   */
  async getById(dealId: string): Promise<Deal | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        stage:pipeline_stages!deals_stage_id_fkey(*),
        client:clients(*),
        owner:profiles!deals_owner_id_fkey(id, name, email, avatar_url)
      `)
      .eq('id', dealId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get deals by pipeline
   */
  async getByPipeline(pipelineId: string): Promise<Deal[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        stage:pipeline_stages!deals_stage_id_fkey(*),
        client:clients(id, name, email),
        owner:profiles!deals_owner_id_fkey(id, name, avatar_url)
      `)
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

export const dealService = new DealService();
