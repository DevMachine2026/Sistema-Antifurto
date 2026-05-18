export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AiAnalysisType =
  | 'dashboard'
  | 'shift_summary'
  | 'alert_investigation'
  | 'business_insights'
  | 'executive';

export interface AiAlertInvestigation {
  hypothesis: string;
  investigation_steps: string[];
  operational_action: string;
}

export interface AiShiftSummary {
  executive_summary: string;
  critical_periods: string[];
  key_events: string[];
  suspicious_operators?: string[];
}

export interface AiAnalysisResult {
  risk_score: number;
  risk_level: AiRiskLevel;
  headline: string;
  insights: string[];
  business_insights?: string[];
  critical_hours?: string[];
  suspicious_operators?: string[];
  recommended_actions?: string[];
  executive_summary?: string;
  shift_summary?: AiShiftSummary;
  alert_investigation?: AiAlertInvestigation;
  source?: 'gemini' | 'rules';
}

export interface AiAnalyzeResponse {
  ok: boolean;
  cached: boolean;
  analysis_type: AiAnalysisType;
  risk_score: number;
  risk_level: AiRiskLevel;
  result: AiAnalysisResult;
  model?: string | null;
  generated_at?: string;
  error?: string;
}
