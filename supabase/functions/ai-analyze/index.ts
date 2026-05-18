// @ts-nocheck
/**
 * Analista IA Olho Vivo — Gemini via Edge Function (nunca expor API key no front).
 * POST { establishment_id, analysis_type, alert_id?, force_refresh? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { createLogContext, durationMs, logError, logInfo } from "../_shared/log.ts";
import { getUserFromRequest, assertEstablishmentAccess } from "../_shared/tenantAuth.ts";
import { geminiGenerateJson } from "../_shared/gemini.ts";
import { SYSTEM_ANALYST, buildUserPrompt } from "../_shared/aiPrompts.ts";
import {
  buildMetricsSnapshot,
  buildRuleBasedAnalysis,
  contextHash,
} from "../_shared/aiContextBuilder.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, prefer, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_TYPES = new Set([
  "dashboard",
  "shift_summary",
  "alert_investigation",
  "business_insights",
  "executive",
]);

const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT_PER_EST") ?? "40");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function periodKeyFor(type: string, alertId?: string): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  if (type === "alert_investigation" && alertId) return `alert:${alertId}`;
  if (type === "dashboard") return `dash:${hour}`;
  if (type === "business_insights") return `biz:${day}`;
  return `shift:${day}`;
}

function ttlFor(type: string): string {
  const hours =
    type === "dashboard" ? 1 : type === "alert_investigation" ? 12 : 6;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  const ctx = createLogContext(req, "ai-analyze");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!(await checkRateLimit("ai-analyze", req, 15))) {
    return json({ error: "rate_limit_exceeded", request_id: ctx.request_id }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const userResult = await getUserFromRequest(req, supabaseUrl, anonKey);
  if ("error" in userResult) {
    return json({ error: userResult.error, request_id: ctx.request_id }, userResult.status);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const establishmentId = String(body.establishment_id ?? "").trim();
  const analysisType = String(body.analysis_type ?? "dashboard").trim();
  const alertId = body.alert_id ? String(body.alert_id) : undefined;
  const forceRefresh = body.force_refresh === true;

  if (!establishmentId || !VALID_TYPES.has(analysisType)) {
    return json({ error: "invalid_request" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const access = await assertEstablishmentAccess(admin, userResult.user.id, establishmentId);
  if (!access.ok) {
    return json({ error: access.error, request_id: ctx.request_id }, access.status);
  }

  const periodKey = periodKeyFor(analysisType, alertId);

  if (!forceRefresh) {
    const { data: cached } = await admin
      .from("ai_analyses")
      .select("result, risk_score, risk_level, created_at, cached, model")
      .eq("establishment_id", establishmentId)
      .eq("analysis_type", analysisType)
      .eq("period_key", periodKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached?.result) {
      logInfo(ctx, "ai_cache_hit", { establishment_id: establishmentId, analysis_type: analysisType });
      return json({
        ok: true,
        cached: true,
        analysis_type: analysisType,
        period_key: periodKey,
        risk_score: cached.risk_score,
        risk_level: cached.risk_level,
        result: cached.result,
        model: cached.model,
        generated_at: cached.created_at,
        request_id: ctx.request_id,
      });
    }
  }

  const { count: dailyCount } = await admin
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((dailyCount ?? 0) >= DAILY_LIMIT) {
    return json({ error: "daily_ai_limit_reached", limit: DAILY_LIMIT }, 429);
  }

  const snapshot = await buildMetricsSnapshot(admin, establishmentId, 24);
  let alertDetail: Record<string, unknown> | undefined;

  if (analysisType === "alert_investigation" && alertId) {
    const { data: alertRow } = await admin
      .from("alerts")
      .select("type, severity, description, context, created_at")
      .eq("id", alertId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();
    if (alertRow) alertDetail = alertRow as Record<string, unknown>;
  }

  const hash = contextHash(snapshot, alertId ?? "");
  let result: Record<string, unknown>;
  let model: string | null = null;
  let fromGemini = false;

  const gemini = await geminiGenerateJson(
    SYSTEM_ANALYST,
    buildUserPrompt(analysisType, snapshot as unknown as Record<string, unknown>, alertDetail),
  );

  if (gemini) {
    result = { ...gemini.raw, source: "gemini" };
    model = gemini.model;
    fromGemini = true;
    if (typeof result.risk_score !== "number") result.risk_score = snapshot.computed_risk_score;
    if (!result.risk_level) result.risk_level = snapshot.computed_risk_level;
  } else {
    result = buildRuleBasedAnalysis(snapshot, analysisType);
    model = "rules-fallback";
  }

  const riskScore = Number(result.risk_score ?? snapshot.computed_risk_score);
  const riskLevel = String(result.risk_level ?? snapshot.computed_risk_level);

  await admin.from("ai_analyses").upsert({
    establishment_id: establishmentId,
    analysis_type: analysisType,
    period_key: periodKey,
    context_hash: hash,
    risk_score: Math.min(100, Math.max(0, riskScore)),
    risk_level: riskLevel,
    result,
    model,
    cached: fromGemini,
    expires_at: ttlFor(analysisType),
  }, { onConflict: "establishment_id,analysis_type,period_key" });

  logInfo(ctx, "ai_analysis_complete", {
    establishment_id: establishmentId,
    analysis_type: analysisType,
    from_gemini: fromGemini,
    risk_level: riskLevel,
    duration_ms: durationMs(ctx),
  });

  return json({
    ok: true,
    cached: false,
    analysis_type: analysisType,
    period_key: periodKey,
    risk_score: riskScore,
    risk_level: riskLevel,
    result,
    model,
    generated_at: new Date().toISOString(),
    request_id: ctx.request_id,
  });
});
