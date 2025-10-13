-- =====================================================
-- Fabric Warehouse Control Tables for Vincere Ingestion
-- =====================================================

-- Table: ingest_endpoints
-- Defines the configuration for each API endpoint we want to ingest
CREATE TABLE dbo.ingest_endpoints (
    endpoint_key       VARCHAR(100) PRIMARY KEY,
    crm                VARCHAR(50)  NOT NULL,    -- 'vincere' | 'jobadder'
    path               VARCHAR(400) NOT NULL,    -- e.g. 'candidate/search'
    paging_mode        VARCHAR(50)  NOT NULL,    -- 'start_limit' | 'offset_limit' | 'page_size'
    page_size          INT          NOT NULL,    -- 100 for Vincere
    requires_filter_q  BIT          NOT NULL,    -- 1 for Vincere search endpoints
    base_filter_q      VARCHAR(400) NULL,        -- e.g. 'deleted:0' for non-deleted records
    incr_field         VARCHAR(100) NOT NULL,    -- 'updated_at' or 'last_update'
    sort               VARCHAR(200) NULL,        -- e.g. 'updated_at asc' or 'id desc'
    created_at         DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Table: ingest_watermarks
-- Tracks the high-water mark for incremental loads per endpoint and tenant
CREATE TABLE dbo.ingest_watermarks (
    endpoint_key       VARCHAR(100) NOT NULL,
    tenant             VARCHAR(200) NOT NULL,    -- e.g. 'ecigroup.vincere.io'
    watermark_value    VARCHAR(100) NULL,        -- Last processed value (timestamp or ID)
    last_run_utc       DATETIME2    NULL,        -- When the last ingestion ran
    status             VARCHAR(50)  NULL,        -- 'success', 'failed', 'running'
    error_message      NVARCHAR(2000) NULL,      -- Last error if failed
    created_at         DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (endpoint_key, tenant),
    FOREIGN KEY (endpoint_key) REFERENCES dbo.ingest_endpoints(endpoint_key)
);

-- Table: ingest_runs
-- Audit log of all ingestion runs
CREATE TABLE dbo.ingest_runs (
    run_id             BIGINT IDENTITY(1,1) PRIMARY KEY,
    started_utc        DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
    ended_utc          DATETIME2    NULL,
    endpoint_key       VARCHAR(100) NOT NULL,
    tenant             VARCHAR(200) NOT NULL,
    pages_read         INT          NULL,
    rows_landed        INT          NULL,
    status             VARCHAR(50)  NULL,        -- 'success', 'failed', 'running'
    error_details      NVARCHAR(2000) NULL,
    pipeline_run_id    VARCHAR(100) NULL,        -- Fabric pipeline run ID
    watermark_before   VARCHAR(100) NULL,
    watermark_after    VARCHAR(100) NULL,
    FOREIGN KEY (endpoint_key) REFERENCES dbo.ingest_endpoints(endpoint_key)
);

-- Index for faster queries on run history
CREATE INDEX IX_ingest_runs_endpoint_tenant_date 
ON dbo.ingest_runs(endpoint_key, tenant, started_utc DESC);

CREATE INDEX IX_ingest_runs_status_date 
ON dbo.ingest_runs(status, started_utc DESC);

GO

-- =====================================================
-- Insert sample endpoint configurations
-- =====================================================

-- Vincere: Candidates
INSERT INTO dbo.ingest_endpoints (
    endpoint_key, crm, path, paging_mode, page_size, 
    requires_filter_q, base_filter_q, incr_field, sort
) VALUES (
    'vincere_candidates',
    'vincere',
    'candidate/search/fl=id;sort=updated_at asc',
    'start_limit',
    100,
    1,
    'deleted:0',
    'updated_at',
    'updated_at asc'
);

-- Vincere: Companies
INSERT INTO dbo.ingest_endpoints (
    endpoint_key, crm, path, paging_mode, page_size, 
    requires_filter_q, base_filter_q, incr_field, sort
) VALUES (
    'vincere_companies',
    'vincere',
    'company/search/fl=id;sort=updated_at asc',
    'start_limit',
    100,
    1,
    'deleted:0',
    'updated_at',
    'updated_at asc'
);

-- Vincere: Jobs
INSERT INTO dbo.ingest_endpoints (
    endpoint_key, crm, path, paging_mode, page_size, 
    requires_filter_q, base_filter_q, incr_field, sort
) VALUES (
    'vincere_jobs',
    'vincere',
    'job/search/fl=id;sort=updated_at asc',
    'start_limit',
    100,
    1,
    'deleted:0',
    'updated_at',
    'updated_at asc'
);

-- Vincere: Placements
INSERT INTO dbo.ingest_endpoints (
    endpoint_key, crm, path, paging_mode, page_size, 
    requires_filter_q, base_filter_q, incr_field, sort
) VALUES (
    'vincere_placements',
    'vincere',
    'placement/search/fl=id;sort=updated_at asc',
    'start_limit',
    100,
    1,
    'deleted:0',
    'updated_at',
    'updated_at asc'
);

GO

-- =====================================================
-- Initialize watermarks for your tenant
-- Replace 'ecigroup.vincere.io' with your actual tenant
-- =====================================================

DECLARE @tenant VARCHAR(200) = 'ecigroup.vincere.io';

INSERT INTO dbo.ingest_watermarks (endpoint_key, tenant, watermark_value, status)
SELECT 
    endpoint_key,
    @tenant,
    NULL,  -- NULL = full load on first run
    'ready'
FROM dbo.ingest_endpoints
WHERE crm = 'vincere';

GO

