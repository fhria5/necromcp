-- 2004 AS/400 MANUFACTURING WAREHOUSE DDL & STORED PROCEDURES
CREATE TABLE TBL_WH_INV_MSTR (
    SKU_CD_V2 VARCHAR(16) NOT NULL PRIMARY KEY, -- Part SKU Identifier
    PART_DESC_TXT VARCHAR(64) NOT NULL,         -- Nomenclature description
    INV_QTY_OH INT NOT NULL DEFAULT 0,          -- Quantity on hand
    REORD_THRSH_NUM INT NOT NULL DEFAULT 25,    -- Minimum reorder threshold
    UNIT_CST_USD DECIMAL(10, 2) NOT NULL,       -- Unit manufacturing cost USD
    LOC_WH_AISLE VARCHAR(12) NOT NULL           -- Physical warehouse bin location
);

-- PROCEDURE: SP_QUERY_STOCK (Inputs: @P_SKU_CD, @P_WH_AISLE)
-- PROCEDURE: SP_AUDIT_LOW_STOCK (Inputs: @P_MAX_RATIO)
-- PROCEDURE: SP_MUTATE_INV_QTY (Inputs: @P_SKU_CD, @P_DELTA_QTY, @P_AUTH_NOTE)
