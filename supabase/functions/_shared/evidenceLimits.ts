/** ~512 KB JPEG em base64 — evita OOM/timeout no Edge. */
export const MAX_EVIDENCE_B64_CHARS = 700_000;

export function evidenceB64TooLarge(b64: string | null | undefined): boolean {
  return typeof b64 === "string" && b64.length > MAX_EVIDENCE_B64_CHARS;
}
