export interface LogContext {
  request_id: string;
  function_name: string;
  path: string;
  method: string;
  started_at_ms: number;
}

export function createLogContext(req: Request, functionName: string): LogContext {
  return {
    request_id: crypto.randomUUID(),
    function_name: functionName,
    path: new URL(req.url).pathname,
    method: req.method,
    started_at_ms: Date.now(),
  };
}

export function durationMs(ctx: LogContext): number {
  return Date.now() - ctx.started_at_ms;
}

function emit(level: "info" | "warn" | "error", ctx: LogContext, event: string, data: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    event,
    request_id: ctx.request_id,
    function_name: ctx.function_name,
    path: ctx.path,
    method: ctx.method,
    ...data,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(ctx: LogContext, event: string, data: Record<string, unknown> = {}) {
  emit("info", ctx, event, data);
}

export function logWarn(ctx: LogContext, event: string, data: Record<string, unknown> = {}) {
  emit("warn", ctx, event, data);
}

export function logError(ctx: LogContext, event: string, data: Record<string, unknown> = {}) {
  emit("error", ctx, event, data);
}
