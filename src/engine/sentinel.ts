// Sentinel guardrails (Phase 2): inspect MCP tool arguments BEFORE any wire
// marshaling happens. A blocked call never reaches the legacy simulator and
// never produces a wire payload. This is demo-application input filtering,
// not a security certification.
export interface SentinelVerdict {
  blocked: boolean;
  ruleId?: 'SENTINEL_XXE' | 'SENTINEL_SQLI' | 'SENTINEL_CMDI';
  severity?: 'CRITICAL' | 'HIGH';
  reason?: string;
  /** The offending argument field and a truncated snippet of its value. */
  field?: string;
  matched?: string;
}

interface Rule {
  ruleId: NonNullable<SentinelVerdict['ruleId']>;
  severity: NonNullable<SentinelVerdict['severity']>;
  reason: string;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    ruleId: 'SENTINEL_XXE',
    severity: 'CRITICAL',
    reason: 'XML External Entity declaration blocked (XXE).',
    patterns: [/<!entity/i, /<!doctype/i],
  },
  {
    ruleId: 'SENTINEL_SQLI',
    severity: 'CRITICAL',
    reason: 'SQL injection pattern blocked.',
    patterns: [
      /'\s*or\s+1\s*=\s*1/i,
      /\bor\s+1\s*=\s*1/i,
      /or\s+'[^']+'\s*=\s*'[^']+'/i,
      /drop\s+table/i,
      /union\s+select/i,
      /'\s*--/,
      /\/\*/,
      /;\s*(drop|delete|update|insert|alter)\b/i,
    ],
  },
  {
    ruleId: 'SENTINEL_CMDI',
    severity: 'HIGH',
    reason: 'Command injection pattern blocked.',
    patterns: [
      /\$\(/,
      /`[^`]*`/,
      /\0/,
      /;\s*(rm|curl|wget|sh|bash|nc|chmod)\b/i,
      /&&\s*(rm|curl|wget|sh|bash)\b/i,
      /\|\s*(rm|curl|wget|sh|bash|cat)\b/i,
    ],
  },
];

/** Collect every string value in args (recursively), with its field path. */
function stringValues(
  value: unknown,
  path: string,
  out: { field: string; value: string }[],
): void {
  if (typeof value === 'string') {
    out.push({ field: path, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => stringValues(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      stringValues(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/**
 * Inspect tool arguments. Returns { blocked: false } when clean, otherwise
 * the first matching rule with the offending field and a truncated snippet.
 * Only string values are inspected; numbers and booleans cannot carry payloads.
 */
export function inspect(args: Record<string, unknown>): SentinelVerdict {
  const values: { field: string; value: string }[] = [];
  stringValues(args, '', values);
  for (const { field, value } of values) {
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(value)) {
          return {
            blocked: true,
            ruleId: rule.ruleId,
            severity: rule.severity,
            reason: rule.reason,
            field,
            matched: value.length > 80 ? value.slice(0, 80) + '…' : value,
          };
        }
      }
    }
  }
  return { blocked: false };
}
