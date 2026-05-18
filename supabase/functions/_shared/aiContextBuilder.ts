import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface MetricsSnapshot {
  establishment_name: string;
  period_hours: number;
  people_inside_now: number;
  people_peak: number;
  sales_st_total: number;
  sales_pagbank_total: number;
  financial_gap: number;
  open_alerts: Array<{ type: string; severity: string; description: string; created_at: string; operator_hint?: string }>;
  hourly: Array<{ hour: string; people: number; sales: number }>;
  alert_counts_by_type: Record<string, number>;
  operators_with_alerts: string[];
  cash_ghost_count: number;
  crowd_no_sales_count: number;
  transactions_count: number;
  computed_risk_score: number;
  computed_risk_level: RiskLevel;
}

function hourKey(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

function riskFromMetrics(m: Omit<MetricsSnapshot, "computed_risk_score" | "computed_risk_level">): {
  score: number;
  level: RiskLevel;
} {
  let score = 0;
  const openHigh = m.open_alerts.filter((a) => a.severity === "high").length;
  score += openHigh * 22;
  score += m.cash_ghost_count * 18;
  score += m.crowd_no_sales_count * 15;
  if (m.financial_gap > 500) score += 25;
  else if (m.financial_gap > 200) score += 12;
  if (m.people_inside_now > 40 && m.sales_st_total < 100) score += 20;

  const level: RiskLevel =
    score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score: Math.min(100, score), level };
}

export async function buildMetricsSnapshot(
  admin: SupabaseClient,
  establishmentId: string,
  hours = 24,
): Promise<MetricsSnapshot> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const [estRes, txRes, pplRes, alertRes, cashRes] = await Promise.all([
    admin.from("establishments").select("name").eq("id", establishmentId).single(),
    admin.from("transactions").select("amount, source, occurred_at, operator_id, payment_method")
      .eq("establishment_id", establishmentId).gte("occurred_at", since).order("occurred_at", { ascending: true }).limit(800),
    admin.from("people_count_events").select("people_inside, recorded_at, camera_id")
      .eq("establishment_id", establishmentId).gte("recorded_at", since).order("recorded_at", { ascending: true }).limit(2000),
    admin.from("alerts").select("type, severity, description, context, created_at, resolved")
      .eq("establishment_id", establishmentId).eq("resolved", false).order("created_at", { ascending: false }).limit(30),
    admin.from("cash_payment_events").select("id, detected_at, matched, camera_id")
      .eq("establishment_id", establishmentId).gte("detected_at", since).eq("matched", false).limit(100),
  ]);

  const txs = txRes.data ?? [];
  const people = pplRes.data ?? [];
  const alerts = alertRes.data ?? [];

  let peopleInsideNow = 0;
  const perCam = new Map<string, number>();
  for (const p of people) {
    perCam.set(p.camera_id, p.people_inside);
  }
  for (const v of perCam.values()) peopleInsideNow += v;
  const peoplePeak = Math.max(0, ...people.map((p) => p.people_inside));

  const salesSt = txs.filter((t) => t.source === "st_ingressos").reduce((a, t) => a + Number(t.amount), 0);
  const salesPb = txs.filter((t) => t.source === "pagbank").reduce((a, t) => a + Number(t.amount), 0);
  const gap = Math.abs(salesSt - salesPb);

  const hourlyMap = new Map<string, { people: number; sales: number }>();
  for (const t of txs) {
    const h = hourKey(t.occurred_at);
    const row = hourlyMap.get(h) ?? { people: 0, sales: 0 };
    row.sales += Number(t.amount);
    hourlyMap.set(h, row);
  }
  for (const p of people) {
    const h = hourKey(p.recorded_at);
    const row = hourlyMap.get(h) ?? { people: 0, sales: 0 };
    row.people = Math.max(row.people, p.people_inside);
    hourlyMap.set(h, row);
  }
  const hourly = Array.from(hourlyMap.entries())
    .map(([hour, v]) => ({ hour, ...v }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const alertCounts: Record<string, number> = {};
  const operators = new Set<string>();
  for (const a of alerts) {
    alertCounts[a.type] = (alertCounts[a.type] ?? 0) + 1;
    const op = (a.context as { operator_id?: string })?.operator_id;
    if (op) operators.add(op);
  }

  const openAlerts = alerts.map((a) => ({
    type: a.type,
    severity: a.severity,
    description: a.description,
    created_at: a.created_at,
    operator_hint: (a.context as { operator_id?: string })?.operator_id,
  }));

  const base = {
    establishment_name: estRes.data?.name ?? "Estabelecimento",
    period_hours: hours,
    people_inside_now: peopleInsideNow,
    people_peak: peoplePeak,
    sales_st_total: Math.round(salesSt * 100) / 100,
    sales_pagbank_total: Math.round(salesPb * 100) / 100,
    financial_gap: Math.round(gap * 100) / 100,
    open_alerts: openAlerts,
    hourly,
    alert_counts_by_type: alertCounts,
    operators_with_alerts: Array.from(operators),
    cash_ghost_count: alertCounts.cash_ghost ?? 0,
    crowd_no_sales_count: alertCounts.crowd_no_sales ?? 0,
    transactions_count: txs.length,
  };

  const { score, level } = riskFromMetrics(base);

  return {
    ...base,
    computed_risk_score: score,
    computed_risk_level: level,
  };
}

export function contextHash(snapshot: MetricsSnapshot, extra = ""): string {
  const payload = JSON.stringify({
    p: snapshot.people_inside_now,
    g: snapshot.financial_gap,
    a: snapshot.open_alerts.length,
    t: snapshot.transactions_count,
    e: extra,
  });
  return payload;
}

/** Fallback determinístico quando Gemini indisponível */
export function buildRuleBasedAnalysis(
  snapshot: MetricsSnapshot,
  analysisType: string,
): Record<string, unknown> {
  const insights: string[] = [];

  if (snapshot.crowd_no_sales_count > 0) {
    insights.push(
      `ATENÇÃO: há ${snapshot.crowd_no_sales_count} alerta(s) de salão com movimento sem vendas proporcionais no período.`,
    );
  }
  if (snapshot.financial_gap > 200) {
    insights.push(
      `Divergência financeira de R$ ${snapshot.financial_gap.toLocaleString("pt-BR")} entre bilheteria e maquineta — priorize conciliação.`,
    );
  }
  if (snapshot.cash_ghost_count > 0) {
    insights.push(
      `Detectado(s) ${snapshot.cash_ghost_count} indício(s) de espécie no caixa sem lançamento correspondente.`,
    );
  }

  const peakHour = snapshot.hourly.reduce(
    (best, h) => (h.people > (best?.people ?? 0) ? h : best),
    snapshot.hourly[0] as { hour: string; people: number; sales: number } | undefined,
  );
  if (peakHour && peakHour.people > 0) {
    const conv = peakHour.sales > 0 ? (peakHour.sales / peakHour.people).toFixed(0) : "0";
    insights.push(
      `Pico de fluxo por volta das ${peakHour.hour} (${peakHour.people} pessoas). Conversão estimada ~R$ ${conv}/pessoa no horário.`,
    );
  }
  if (insights.length === 0) {
    insights.push("Operação dentro dos parâmetros nas últimas horas. Continue monitorando picos de fluxo e fechamento de caixa.");
  }

  const result: Record<string, unknown> = {
    risk_score: snapshot.computed_risk_score,
    risk_level: snapshot.computed_risk_level,
    headline: snapshot.computed_risk_level === "low"
      ? "Operação estável no período analisado"
      : "Pontos de atenção identificados na operação",
    insights,
    business_insights: [
      snapshot.sales_st_total > snapshot.sales_pagbank_total
        ? "Bilheteria acima da maquineta no período — validar lançamentos tardios."
        : "Maquineta acima da bilheteria — conferir vendas não registradas no sistema de ingressos.",
    ],
    recommended_actions: snapshot.computed_risk_level === "low"
      ? ["Manter rotina de fechamento e importação de extratos."]
      : ["Revisar alertas abertos", "Conferir operadores no POS × Vídeo", "Validar importações ST/PagBank"],
    executive_summary:
      `${snapshot.establishment_name}: ${snapshot.people_inside_now} pessoas agora, gap financeiro R$ ${snapshot.financial_gap}, ${snapshot.open_alerts.length} alerta(s) aberto(s).`,
    source: "rules",
  };

  if (analysisType === "alert_investigation" && snapshot.open_alerts[0]) {
    const a = snapshot.open_alerts[0];
    result.alert_investigation = {
      hypothesis: a.description,
      investigation_steps: [
        "Conferir POS × Vídeo no horário do alerta",
        "Validar operador e turno",
        "Cruzar com extrato PagBank e ST Ingressos",
      ],
      operational_action: "Registrar decisão no alerta após verificação no caixa.",
    };
  }

  if (analysisType === "shift_summary" || analysisType === "executive") {
    result.shift_summary = {
      executive_summary: result.executive_summary,
      critical_periods: snapshot.hourly.filter((h) => h.people > 20 && h.sales < 50).map((h) => h.hour),
      key_events: snapshot.open_alerts.slice(0, 5).map((a) => a.description),
    };
  }

  return result;
}
