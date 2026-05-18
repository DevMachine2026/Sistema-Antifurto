/**
 * Purge do bucket evidence — por estabelecimento (rotação diária).
 * Cron: header x-cron-secret = CRON_SECRET
 * Query: ?est_per_run=20
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
};

const DEFAULT_RETENTION_DAYS = 90;
const MAX_DELETE_PER_RUN = 500;
const DEFAULT_EST_PER_RUN = 20;

type ListedObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function parseTimestampFromPath(name: string): number | null {
  const base = name.split("/").pop() ?? "";
  const match = /^(\d+)\.jpg$/i.exec(base);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function objectCreatedMs(fullPath: string, entry: ListedObject): number {
  const fromName = parseTimestampFromPath(fullPath);
  if (fromName) return fromName;
  const raw = entry.updated_at ?? entry.created_at;
  if (raw) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

function isFolder(entry: ListedObject): boolean {
  if (entry.id != null) return false;
  return !/\.[a-z0-9]+$/i.test(entry.name);
}

async function collectExpiredUnderPrefix(
  supabase: ReturnType<typeof createClient>,
  prefix: string,
  cutoffMs: number,
  out: string[],
  max: number,
): Promise<void> {
  if (out.length >= max) return;

  let offset = 0;
  const pageSize = 200;

  while (out.length < max) {
    const { data: page, error } = await supabase.storage.from("evidence").list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn("evidence-purge list:", prefix, error.message);
      return;
    }
    if (!page?.length) return;

    for (const entry of page as ListedObject[]) {
      if (!entry.name) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (isFolder(entry)) {
        await collectExpiredUnderPrefix(supabase, path, cutoffMs, out, max);
        if (out.length >= max) return;
        continue;
      }

      const created = objectCreatedMs(path, entry);
      if (Number.isFinite(created) && created < cutoffMs) {
        out.push(path);
        if (out.length >= max) return;
      }
    }

    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();
  const provided = req.headers.get("x-cron-secret")?.trim();
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const estPerRun = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("est_per_run") ?? DEFAULT_EST_PER_RUN)),
  );

  const retentionDays = Number(Deno.env.get("EVIDENCE_RETENTION_DAYS") ?? DEFAULT_RETENTION_DAYS);
  const days = Number.isFinite(retentionDays) && retentionDays >= 7 ? retentionDays : DEFAULT_RETENTION_DAYS;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: establishments, error: estErr } = await supabase
    .from("establishments")
    .select("id")
    .eq("active", true)
    .order("id", { ascending: true });

  if (estErr) {
    return new Response(JSON.stringify({ error: "db_error", detail: estErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const estIds = (establishments ?? []).map((e: { id: string }) => e.id);
  const toDelete: string[] = [];
  const processedEstablishments: string[] = [];

  if (estIds.length > 0) {
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const startIdx = (dayIndex * estPerRun) % estIds.length;

    for (let i = 0; i < estPerRun && toDelete.length < MAX_DELETE_PER_RUN; i++) {
      const estId = estIds[(startIdx + i) % estIds.length];
      processedEstablishments.push(estId);
      await collectExpiredUnderPrefix(
        supabase,
        estId,
        cutoffMs,
        toDelete,
        MAX_DELETE_PER_RUN,
      );
    }
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 50) {
    const chunk = toDelete.slice(i, i + 50);
    const { error } = await supabase.storage.from("evidence").remove(chunk);
    if (error) {
      console.error("evidence-purge remove:", error.message);
    } else {
      deleted += chunk.length;
    }
  }

  const result = {
    ok: true,
    retention_days: days,
    establishments_total: estIds.length,
    establishments_processed: processedEstablishments.length,
    rotation_start_index: estIds.length
      ? (Math.floor(Date.now() / 86_400_000) * estPerRun) % estIds.length
      : 0,
    candidates: toDelete.length,
    deleted,
    truncated: toDelete.length >= MAX_DELETE_PER_RUN,
  };
  console.info(JSON.stringify({ event: "evidence_purge_completed", ...result }));

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
