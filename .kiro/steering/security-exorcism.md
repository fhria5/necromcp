# Kiro Steering Rules: Sentinel Security & HITL Guardrails

1. **Zero-Trust Legacy Wrapping:**
   - Legacy SOAP and SQL systems lack modern input sanitization. Every synthesized MCP tool MUST pass arguments through `SentinelGuard.inspect()` before wire marshaling.
2. **Forbidden Patterns:**
   - Reject any payload matching XML External Entity declarations (`<!DOCTYPE`, `<!ENTITY`, `SYSTEM`), SQL tautologies (`' OR 1=1`, `UNION SELECT`, `DROP TABLE`), or null-byte injections (`\0`).
3. **Human-in-the-Loop (HITL) Financial Gate:**
   - Any operation marked `riskLevel: 'CRITICAL'` with an amount exceeding `hitlThreshold.maxAllowed` ($10,000 USD) MUST halt execution and require an explicit cryptographic approval token from the operator UI.
