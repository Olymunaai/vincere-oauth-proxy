# Vincere OAuth Proxy for Microsoft Fabric

[![CI](https://github.com/YOUR-ORG/vincere-oauth-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR-ORG/vincere-oauth-proxy/actions/workflows/ci.yml)
[![Deploy](https://github.com/YOUR-ORG/vincere-oauth-proxy/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR-ORG/vincere-oauth-proxy/actions/workflows/deploy.yml)

Production-ready OAuth2 proxy service for Vincere API, designed for seamless integration with Microsoft Fabric data pipelines.

## Why This Exists

Microsoft Fabric's REST Copy activity doesn't natively support OAuth2 Authorization Code flow with refresh tokens. This proxy:

- **Handles OAuth2** authorization code exchange with Vincere
- **Manages tokens** securely in Azure Key Vault (no manual refresh needed)
- **Injects credentials** (`id-token`, optional `x-api-key`) on every upstream request
- **Simplifies Fabric** - pipelines just call the proxy as a simple REST endpoint
- **Production-grade** - staging slots, health checks, observability, security hardening

## Architecture

```
┌─────────────────┐
│ Fabric Pipeline │
└────────┬────────┘
         │ HTTPS (GET/POST)
         │
         ▼
┌─────────────────────────────────┐
│   Azure App Service (Proxy)     │
│  ┌──────────────────────────┐   │
│  │  /vincere/:tenant/*      │   │
│  │  - Validate request      │   │
│  │  - Get refresh_token     │◄──┼───► Azure Key Vault
│  │  - Refresh id_token      │   │     (Managed Identity)
│  │  - Inject headers        │   │
│  │  - Proxy to Vincere      │   │
│  └──────────┬───────────────┘   │
└─────────────┼───────────────────┘
              │ HTTPS
              │ + id-token
              │ + x-api-key (optional)
              ▼
     ┌────────────────────┐
     │  Vincere API       │
     │  tenant.vincere.io │
     └────────────────────┘
```

## Features

- ✅ **OAuth2 Authorization Code** flow with Vincere
- ✅ **Automatic token refresh** with in-memory caching (50s default)
- ✅ **Secure storage** - refresh tokens in Azure Key Vault with RBAC
- ✅ **Retry logic** - exponential backoff + jitter on 429/5xx
- ✅ **Security hardened** - HSTS, CSP, SSRF protection, optional PSK, IP allow-list
- ✅ **Observability** - Application Insights, structured logging (Pino), correlation IDs
- ✅ **IaC** - full Bicep templates for Azure resources
- ✅ **CI/CD** - GitHub Actions with OIDC, staging slot deployment
- ✅ **Fabric integration** - example pipelines, control tables, incremental loading

## Quick Start

### Prerequisites

- Azure subscription
- GitHub repository with OIDC configured
- Vincere OAuth2 credentials (Client ID)
- Node.js 18+ (for local development)

### 1. Deploy Infrastructure

```bash
# Clone repository
git clone https://github.com/YOUR-ORG/vincere-oauth-proxy.git
cd vincere-oauth-proxy

# Update parameters
# Edit infra/params.prod.json - set vincereClientId

# Create resource group
az group create --name rg-vincere-proxy --location australiaeast

# Deploy via GitHub Actions (recommended)
git push origin main

# OR deploy manually
az deployment group create \
  --resource-group rg-vincere-proxy \
  --template-file infra/main.bicep \
  --parameters @infra/params.prod.json
```

### 2. Configure GitHub Secrets

Set these repository secrets for GitHub Actions OIDC:

```bash
AZURE_CLIENT_ID=<service-principal-client-id>
AZURE_TENANT_ID=<azure-tenant-id>
AZURE_SUBSCRIPTION_ID=<azure-subscription-id>
AZURE_RESOURCE_GROUP=rg-vincere-proxy
```

[Setup guide for OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure)

### 3. Authorize Tenant

Navigate to:
```
https://YOUR-APP.azurewebsites.net/auth/start?tenantHost=ecigroup.vincere.io
```

Follow OAuth flow → refresh token stored in Key Vault.

### 4. Test Proxy

```bash
# Health check
curl https://YOUR-APP.azurewebsites.net/healthz

# Test API call (candidates)
curl "https://YOUR-APP.azurewebsites.net/vincere/ecigroup.vincere.io/candidate/search/fl=id?q=deleted:0&limit=5&start=0"
```

### 5. Configure Fabric

See [fabric/README.md](fabric/README.md) for detailed integration steps:
1. Create control tables in Warehouse
2. Set up REST Linked Service
3. Import example pipeline
4. Schedule incremental loads

## Configuration

### Environment Variables

Set in Azure App Service → Configuration:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Environment |
| `PORT` | No | `8080` | Server port |
| `VINCERE_ID_BASE` | Yes | `https://id.vincere.io` | Vincere OAuth base URL |
| `VINCERE_CLIENT_ID` | Yes | - | Your Vincere OAuth2 Client ID |
| `VINCERE_REDIRECT_URI` | Yes | - | Callback URL (App Service URL + `/auth/callback`) |
| `KEY_VAULT_URI` | Yes | - | Azure Key Vault URI |
| `ID_TOKEN_CACHE_SECONDS` | No | `50` | Cache id_token per tenant (recommend < 60s) |
| `ALLOWED_IPS` | No | - | Comma-separated IP allow-list (empty = no restriction) |
| `REQUIRE_PSK` | No | `0` | Set to `1` to require `X-Proxy-Token` header |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Yes | - | App Insights connection string |

### Key Vault Secrets

Managed by the application:

| Secret Name | Purpose |
|-------------|---------|
| `vincere/<tenantHost>/refresh_token` | OAuth2 refresh token (auto-stored after auth) |
| `vincere/<tenantHost>/api_key` | Optional x-api-key header |
| `infra/proxy-psk` | Pre-shared key (if `REQUIRE_PSK=1`) |

## Usage

### Proxy Endpoint

```
ALL /vincere/:tenantHost/*
```

**Parameters:**
- `:tenantHost` - Vincere tenant (e.g., `ecigroup.vincere.io`)
- `*` - API path (e.g., `candidate/search`)

**Example:**
```bash
# Search candidates
curl "https://YOUR-APP.azurewebsites.net/vincere/ecigroup.vincere.io/candidate/search/fl=id,name?q=deleted:0&limit=100&start=0"

# Get candidate by ID
curl "https://YOUR-APP.azurewebsites.net/vincere/ecigroup.vincere.io/candidate/12345"
```

The proxy automatically:
- Validates tenant host (SSRF protection)
- Retrieves/refreshes id_token
- Injects `id-token` and optional `x-api-key` headers
- Proxies to `https://{tenantHost}/api/v2/{path}`
- Returns response with additional headers:
  - `x-proxy-tenant`
  - `x-proxy-target`
  - `x-proxy-duration-ms`
  - `x-proxy-row-count` (if applicable)

### OAuth Flow

**1. Start Authorization:**
```
GET /auth/start?tenantHost=<tenant.vincere.io>
```

**2. Callback (handled automatically):**
```
GET /auth/callback?code=...&state=...
```

Stores refresh token in Key Vault and displays success page.

**3. Re-authorize:**
To refresh authorization (e.g., after revoking tokens), simply repeat step 1.

## Security

See [SECURITY.md](SECURITY.md) for comprehensive security documentation.

### Highlights

- **HTTPS-only** with HSTS (1 year, includeSubDomains, preload)
- **Helmet** - CSP, XSS protection, no-sniff, referrer policy
- **SSRF protection** - strict tenant host validation, blocklist
- **Rate limiting** - per endpoint (100/min proxy, 10/15min auth)
- **IP allow-list** - optional perimeter security
- **PSK authentication** - optional `X-Proxy-Token` header check
- **Key Vault RBAC** - Managed Identity, soft-delete, purge protection
- **Secrets redaction** - never logged in Application Insights

## Operations

### View Logs

```bash
# Azure CLI
az webapp log tail --name YOUR-APP --resource-group rg-vincere-proxy

# Application Insights
# Go to Azure Portal → App Insights → Logs
traces
| where message contains "Proxy request"
| project timestamp, message, customDimensions
| order by timestamp desc
```

### Rotate PSK

```bash
# Generate new PSK
NEW_PSK=$(uuidgen)

# Update Key Vault
az keyvault secret set \
  --vault-name YOUR-KEYVAULT \
  --name "infra/proxy-psk" \
  --value "$NEW_PSK"

# Update Fabric (wherever PSK is used)
# No app restart needed - fetched per request
```

**Recommendation:** Rotate every 90 days. Set calendar reminder.

### Add API Key for Tenant

```bash
az keyvault secret set \
  --vault-name YOUR-KEYVAULT \
  --name "vincere/ecigroup.vincere.io/api-key" \
  --value "YOUR_VINCERE_API_KEY"
```

### Monitor Health

```bash
# Health endpoint
curl https://YOUR-APP.azurewebsites.net/healthz

# Response:
{
  "status": "ok",
  "timeUtc": "2025-01-15T10:30:00.000Z",
  "appVersion": "1.0.0"
}
```

Azure App Service automatically uses `/healthz` for health checks.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Re-run OAuth: `/auth/start?tenantHost=...` |
| 429 Rate Limit | Retry after delay (exponential backoff built-in) |
| 502 Bad Gateway | Check App Insights logs; verify tenant host |
| SSRF detected | Ensure `tenantHost` matches `*.vincere.io` |
| Timeout | Check Vincere API status; increase query timeout |

## Development

### Local Setup

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with local values

# Run in dev mode
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```

### Local Key Vault

For local dev, use Azure CLI authentication:
```bash
az login
# DefaultAzureCredential will use your Azure CLI session
```

### Pre-commit Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

## Project Structure

```
├── src/
│   ├── config/          # Configuration and validation
│   ├── infra/           # Infrastructure clients (KV, App Insights, logging)
│   ├── security/        # Validators, guards, SSRF protection
│   ├── oauth/           # OAuth2 flow (routes, service)
│   ├── proxy/           # Proxy logic (routes, Vincere client)
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entrypoint
├── test/                # Jest tests
├── infra/               # Bicep IaC templates
├── fabric/              # Fabric artefacts (SQL, pipelines)
├── .github/workflows/   # CI/CD pipelines
└── scripts/             # Helper scripts
```

## Contributing

1. Create feature branch from `develop`
2. Make changes, add tests
3. Ensure CI passes (`npm run lint && npm test`)
4. Open PR to `develop`
5. Merge to `main` triggers production deployment

## License

MIT - see [LICENSE](LICENSE)

## Support

- **Issues:** https://github.com/YOUR-ORG/vincere-oauth-proxy/issues
- **Vincere API:** https://api.vincere.io/
- **Microsoft Fabric:** https://learn.microsoft.com/fabric/

## Acknowledgments

Built for seamless Vincere integration with Microsoft Fabric data pipelines.

