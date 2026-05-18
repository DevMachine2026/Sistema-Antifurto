import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';
import type { AiAnalysisType, AiAnalyzeResponse } from '../lib/aiTypes';

class AiService {
  async analyze(
    analysisType: AiAnalysisType,
    options?: { alertId?: string; forceRefresh?: boolean },
  ): Promise<AiAnalyzeResponse> {
    const { data, error } = await supabase.functions.invoke('ai-analyze', {
      body: {
        establishment_id: getCurrentEstablishmentId(),
        analysis_type: analysisType,
        alert_id: options?.alertId,
        force_refresh: options?.forceRefresh ?? false,
      },
    });

    if (error) {
      throw new Error(error.message ?? 'Falha ao consultar analista IA');
    }

    const payload = data as AiAnalyzeResponse;
    if (!payload?.ok) {
      throw new Error(payload?.error ?? 'Análise indisponível');
    }
    return payload;
  }
}

export const aiService = new AiService();
