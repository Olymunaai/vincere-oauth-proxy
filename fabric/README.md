# Fabric Integration Artefacts

This directory contains artefacts for integrating Vincere data into Microsoft Fabric via the OAuth proxy.

## Contents

### Warehouse SQL Scripts

**`warehouse-sql/01-control-tables.sql`**

Creates control tables in your Fabric Warehouse for managing incremental loads:

- `dbo.ingest_endpoints` - Configuration for each API endpoint
- `dbo.ingest_watermarks` - High-water marks for incremental loads
- `dbo.ingest_runs` - Audit log of all ingestion runs

**Usage:**
1. Open your Fabric Warehouse
2. Execute the script to create tables
3. Update the `@tenant` variable to match your Vincere tenant
4. Tables are pre-populated with common Vincere endpoints

### Pipeline Examples

**`examples/pipeline.vincere.candidates.json`**

A complete Fabric Data Pipeline that:
1. Reads endpoint configuration from control tables
2. Retrieves the last watermark (for incremental loading)
3. Paginates through Vincere API results (100 records per page)
4. Lands data in Lakehouse bronze layer (Parquet format)
5. Computes new watermark from loaded data
6. Updates control tables

**Key Features:**
- **Incremental loading**: Only fetches records updated since last run
- **Pagination**: Handles Vincere's `start/limit` pagination automatically
- **Idempotent**: Safe to re-run; tracks state in control tables
- **Audit trail**: Logs every run in `ingest_runs`

**`examples/rest-linked-service.json`**

Template for creating a REST Linked Service in Fabric pointing to your proxy.

## Setup Instructions

### 1. Deploy the OAuth Proxy

Follow the main README to deploy the proxy to Azure and complete OAuth authorization for your tenant.

### 2. Create Warehouse Tables

```sql
-- In your Fabric Warehouse
-- Execute: warehouse-sql/01-control-tables.sql
-- Update the tenant variable to match yours
```

### 3. Configure REST Linked Service

1. In Fabric, create a new REST Linked Service
2. Set URL to: `https://YOUR-APP.azurewebsites.net/vincere`
3. Authentication: Anonymous (proxy handles OAuth)
4. Test connection

### 4. Import Pipeline

1. Import `pipeline.vincere.candidates.json` into Fabric
2. Update dataset references to match your environment:
   - `WarehouseControlTables` → your warehouse
   - `LakehouseBronze` → your lakehouse bronze layer
3. Set pipeline parameter `tenantHost` to your Vincere tenant

### 5. Test End-to-End

```bash
# Test proxy directly
curl https://YOUR-APP.azurewebsites.net/vincere/TENANT.vincere.io/candidate/search/fl=id?q=deleted:0&limit=5&start=0

# Run pipeline in Fabric
# Check ingest_runs table for results
SELECT * FROM dbo.ingest_runs ORDER BY started_utc DESC;
```

## Incremental Loading Strategy

### Vincere Specifics

1. **Filter Query Required**: Vincere search endpoints need `q=` parameter
   - Base filter: `deleted:0` (non-archived records)
   - Date range: `updated_at:[2024-01-01T00:00:00Z TO *]`
   - Combined: `q=deleted:0#updated_at:[2024-01-01T00:00:00Z TO *]`

2. **Pagination**: Use `start` and `limit`
   - Start at 0, increment by page_size (100)
   - Stop when returned count < page_size

3. **Sorting**: Always sort by the incremental field
   - Example: `sort=updated_at asc`
   - Embedded in path: `candidate/search/fl=id;sort=updated_at asc`

### Watermark Management

**First Run (Full Load)**
- `watermark_value` = NULL
- Query: `q=deleted:0` (all non-deleted records)
- After load: compute `MAX(updated_at)`, store as watermark

**Subsequent Runs (Incremental)**
- `watermark_value` = `2024-12-01T15:30:00Z`
- Query: `q=deleted:0#updated_at:[2024-12-01T15:30:00Z TO *]`
- After load: compute new `MAX(updated_at)`, update watermark

### Error Handling

Pipeline automatically:
- Retries failed copy activities (3 attempts)
- Logs errors to `ingest_runs.error_details`
- Preserves watermark on failure (only updates on success)

## Customization

### Adding New Endpoints

```sql
-- Example: Add notes endpoint
INSERT INTO dbo.ingest_endpoints (
    endpoint_key, crm, path, paging_mode, page_size,
    requires_filter_q, base_filter_q, incr_field, sort
) VALUES (
    'vincere_notes',
    'vincere',
    'note/search/fl=id;sort=created_at asc',
    'start_limit',
    100,
    1,
    '',  -- No deleted filter for notes
    'created_at',
    'created_at asc'
);

-- Initialize watermark
INSERT INTO dbo.ingest_watermarks (endpoint_key, tenant, status)
VALUES ('vincere_notes', 'YOUR-TENANT.vincere.io', 'ready');
```

### Scheduling

In Fabric:
1. Open your pipeline
2. Click "Schedule"
3. Set frequency (e.g., hourly, daily)
4. Pipeline will automatically load new/changed records

## Monitoring

### Check Run History

```sql
-- Recent runs
SELECT TOP 10
    endpoint_key,
    tenant,
    started_utc,
    DATEDIFF(SECOND, started_utc, ended_utc) AS duration_sec,
    pages_read,
    rows_landed,
    status
FROM dbo.ingest_runs
ORDER BY started_utc DESC;

-- Failed runs
SELECT * FROM dbo.ingest_runs
WHERE status = 'failed'
ORDER BY started_utc DESC;
```

### Check Watermarks

```sql
SELECT 
    w.endpoint_key,
    w.tenant,
    w.watermark_value,
    w.last_run_utc,
    w.status,
    DATEDIFF(HOUR, w.last_run_utc, SYSUTCDATETIME()) AS hours_since_last_run
FROM dbo.ingest_watermarks w
ORDER BY w.last_run_utc DESC;
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Re-run OAuth flow: `/auth/start?tenantHost=TENANT.vincere.io` |
| 429 Rate Limit | Reduce pipeline frequency or page_size |
| Empty results | Check watermark isn't in future; verify filter query |
| Timeout | Increase copy activity timeout in pipeline |

## Performance Tips

1. **Parallel Pipelines**: Run multiple endpoints simultaneously (mind Vincere rate limits)
2. **Optimal Page Size**: 100 is recommended by Vincere
3. **Filter Smartly**: Use `fl=id,name,updated_at` to fetch only needed fields initially
4. **Bronze → Silver**: Transform in Fabric after landing (keep bronze raw)

## Support

- Proxy issues: Check `/healthz` endpoint and Application Insights
- Vincere API: https://api.vincere.io/
- Fabric: Microsoft Fabric documentation

