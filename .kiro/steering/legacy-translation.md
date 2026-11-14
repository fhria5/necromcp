# Kiro Steering Rules: Legacy Protocol Translation Standards

1. **Cryptic Identifier Normalization:**
   - Always map archaic uppercase identifiers (e.g., `INV_QTY_OH`, `ACCT_BAL_CENTS`, `PT_CLM_AMT`) to camelCase semantic names (`quantityOnHand`, `balanceUsd`, `claimAmountUsd`) in MCP tool schemas while preserving exact original names in the internal wire marshaler.
2. **COBOL Implied Decimal Handling (`PIC 9(n)V99`):**
   - Never use IEEE-754 floating-point division without rounding. Always convert currency values using `Math.round((value + Number.EPSILON) * 100)` before formatting fixed-width zero-padded strings.
3. **Julian Date Conversion (`YYDDD`):**
   - Convert 5-digit mainframe Julian dates (`89245`) into ISO-8601 strings (`1989-09-02`) before returning responses to MCP agents.
