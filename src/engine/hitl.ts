// Human-in-the-Loop gate (Phase 2): a mutation whose amount exceeds the
// operation's hitlThreshold is paused and only executes when the caller
// presents the approval token for that exact call. The token is a
// deterministic hash of (artifactId, toolName, arguments), so no server-side
// pending-call store is needed; it cannot approve a different call.
export function computeHitlToken(
  artifactId: string,
  toolName: string,
  args: Record<string, unknown>,
): string {
  const stable = stableStringify(args);
  const text = `${artifactId}|${toolName}|${stable}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return `HITL-${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/** True when the approval token matches this exact call. */
export function verifyHitlToken(
  token: string,
  artifactId: string,
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  return token === computeHitlToken(artifactId, toolName, args);
}
