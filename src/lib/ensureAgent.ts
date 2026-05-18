import { supabase } from './supabase';

/** Garante um agente ativo para o estabelecimento (usado no onboarding). */
export async function ensureDefaultAgent(establishmentId: string): Promise<{ id: string; token: string } | null> {
  const { data: existing } = await supabase
    .from('agent_configs')
    .select('id, token')
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1);

  if (existing?.[0]?.token) {
    return { id: existing[0].id, token: existing[0].token };
  }

  const { data, error } = await supabase
    .from('agent_configs')
    .insert({
      establishment_id: establishmentId,
      name: 'Computador da loja',
      cameras: [],
    })
    .select('id, token')
    .single();

  if (error || !data?.token) return null;
  return { id: data.id, token: data.token };
}
