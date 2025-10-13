# Security Policy

## Overview

This OAuth proxy is designed as a **production-ready, security-hardened** service handling sensitive authentication tokens for Vincere API access. Security is a primary design consideration, not an afterthought.

## Threat Model

### Assets Protected

1. **OAuth Refresh Tokens** - Long-lived credentials stored in Azure Key Vault
2. **ID Tokens** - Short-lived (cached in memory, 50s default)
3. **API Keys** - Optional tenant-specific keys in Key Vault
4. **Pre-Shared Key** - Optional perimeter authentication token

### Threat Actors

- **External attackers** - Attempting to access Vincere data without authorization
- **Malicious Fabric users** - Attempting to abuse proxy for unintended targets
- **Compromised credentials** - Stolen PSK or Azure identities

### Attack Vectors Considered

| Attack | Mitigation |
|--------|------------|
| SSRF (Server-Side Request Forgery) | Strict tenant host validation, blocklist of internal IPs |
| Path Traversal | Path sanitization, null-byte detection |
| Credential theft | Key Vault with RBAC, Managed Identity, no secrets in code |
| Token replay | Short-lived id_token (50s cache), refresh on expiry |
| Rate limit abuse | express-rate-limit (100/min proxy, 10/15min auth) |
| Injection attacks | Input validation, query param sanitization |
| Man-in-the-Middle | HTTPS-only, HSTS with preload |
| Unauthorized access | Optional PSK, IP allow-list, Azure AD authentication |
| Dependency vulnerabilities | Dependabot, npm audit in CI, CodeQL scanning |

## Security Controls

### 1. Transport Security

**Implementation:**
- HTTPS enforced in production
- HSTS header: `max-age=31536000; includeSubDomains; preload`
- TLS 1.2+ only (Azure App Service default)
- HTTP/2 enabled

**Configuration:**
```bicep
// infra/main.bicep
properties: {
  httpsOnly: true
  siteConfig: {
    minTlsVersion: '1.2'
    http20Enabled: true
  }
}
```

### 2. HTTP Security Headers

**Implementation via Helmet:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `Content-Security-Policy` | `default-src 'self'` | Prevent XSS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Referrer-Policy` | `no-referrer` | Don't leak referrer |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |

**Code:** `src/app.ts`

### 3. Input Validation

**Tenant Host Validation:**
```typescript
// Only allow *.vincere.io hosts
const VINCERE_HOST_PATTERN = /^[a-z0-9-]+\.vincere\.io$/i;

// Blocklist
['localhost', '127.0.0.1', '::1', '169.254.169.254', ...]
```

**Path Validation:**
- No `..` (path traversal)
- No `//` (scheme injection)
- No null bytes (`\0`)
- No absolute URLs

**Code:** `src/security/validators.ts`

### 4. SSRF Protection

**Mechanisms:**
1. **Strict host validation** - only `*.vincere.io`
2. **Blocklist** - localhost, metadata endpoints, link-local
3. **Private IP ranges** - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
4. **Construct URLs internally** - never use client-supplied absolute URLs

**Code:** `src/security/validators.ts`, `src/proxy/vincereClient.ts`

### 5. Authentication & Authorization

**OAuth2 Flow:**
- **State parameter** - cryptographic nonce (32 bytes, base64url)
- **Single-use** - state validation prevents replay
- **CSRF protection** - state ties callback to initiating request

**Optional Perimeter Security:**
- **IP Allow-list** - `ALLOWED_IPS` environment variable
- **Pre-Shared Key** - `X-Proxy-Token` header, stored in Key Vault
- **Azure AD Integration** - (not implemented, future enhancement)

**Code:** `src/security/guards.ts`

### 6. Secrets Management

**Azure Key Vault:**
- **RBAC authorization** (not access policies)
- **Soft delete** enabled (90-day retention)
- **Purge protection** enabled
- **Managed Identity** - no connection strings in code
- **Audit logging** via Azure Monitor

**Key Vault Secrets:**
```
vincere/<tenant>/refresh_token    # Auto-managed by proxy
vincere/<tenant>/api_key          # Optional, set manually
infra/proxy-psk                   # Optional, rotate every 90 days
```

**Code:** `src/infra/keyvault.ts`

### 7. Logging & Redaction

**What's Logged:**
- Request metadata (method, path, tenant, status, duration)
- Error details (sanitized)
- Correlation IDs for tracing

**What's NEVER Logged:**
- `id-token`, `x-api-key`, `authorization` headers
- Request/response bodies (may contain PII)
- Passwords, secrets, refresh tokens

**Redaction Paths:**
```typescript
redact: {
  paths: [
    'req.headers.authorization',
    'req.headers["id-token"]',
    '*.password',
    '*.token',
    '*.refresh_token',
    ...
  ]
}
```

**Code:** `src/infra/logger.ts`

### 8. Rate Limiting

**Tiers:**
- **OAuth endpoints** (`/auth/*`): 10 requests per 15 minutes per IP
- **Proxy endpoints** (`/vincere/*`): 100 requests per minute per IP

**Note:** Vincere API has separate limits (10/sec, 50k/day) - see user rules.

**Code:** `src/infra/rateLimit.ts`

### 9. Dependency Security

**Automated Scanning:**
- **Dependabot** - automatic PRs for outdated deps
- **npm audit** - fails CI on high/critical vulnerabilities
- **CodeQL** - static analysis on every PR

**Manual Review:**
```bash
# Check vulnerabilities
npm audit

# Update dependencies
npm update
npm audit fix
```

**Configuration:** `.github/dependabot.yml`, `.github/workflows/ci.yml`

### 10. Runtime Security

**Dockerfile Hardening:**
- **Non-root user** - runs as `nodejs:1001`
- **Minimal base image** - Alpine Linux
- **Multi-stage build** - no dev dependencies in final image
- **HEALTHCHECK** - container health monitoring
- **dumb-init** - proper signal handling (PID 1)

**Azure App Service:**
- **System-assigned Managed Identity** - no credentials in app
- **Health check path** - `/healthz` (30s interval)
- **Always On** enabled (prod)
- **FTP disabled** - `ftpsState: 'Disabled'`

## Incident Response

### Detection

**Indicators of Compromise:**
1. Unusual rate of 401/403 responses
2. Requests to non-Vincere hosts (SSRF attempts)
3. High rate of OAuth authorization attempts
4. Unexpected Key Vault access patterns
5. Proxy requests from unauthorized IPs

**Monitoring:**
```kql
// Application Insights - Suspicious activity
traces
| where message contains "SSRF attempt" or message contains "Invalid tenant host"
| summarize count() by bin(timestamp, 1h), customDimensions.tenantHost
| where count_ > 10
```

### Response Procedure

**1. Immediate Actions (< 1 hour):**

```bash
# Disable staging slot (if under attack)
az webapp deployment slot swap \
  --resource-group rg-vincere-proxy \
  --name vincere-proxy-app \
  --slot staging \
  --target-slot production \
  --preserve-vnet true

# OR stop app entirely
az webapp stop --name vincere-proxy-app --resource-group rg-vincere-proxy

# Rotate PSK immediately
az keyvault secret set \
  --vault-name vincere-proxy-kv \
  --name "infra/proxy-psk" \
  --value "$(uuidgen)"

# Enable IP restrictions (if not already set)
az webapp config access-restriction add \
  --resource-group rg-vincere-proxy \
  --name vincere-proxy-app \
  --rule-name "Emergency-Block" \
  --action Deny \
  --ip-address 0.0.0.0/0 \
  --priority 100
```

**2. Investigation (< 4 hours):**

- Review Application Insights logs
- Check Key Vault audit logs
- Analyze access patterns
- Identify compromised credentials/tenants

**3. Remediation:**

```bash
# Revoke tenant authorization (forces re-auth)
az keyvault secret delete \
  --vault-name vincere-proxy-kv \
  --name "vincere/TENANT.vincere.io/refresh-token"

# Rotate all secrets
# See scripts/rotate-secrets.sh

# Re-deploy app from known-good commit
git checkout <last-known-good-commit>
git push origin main --force  # Triggers deploy

# Update Vincere OAuth app (if client_id compromised)
# Contact Vincere support to rotate client_id/secret
```

**4. Recovery:**

- Restore service with tightened controls
- Re-authorize affected tenants
- Update documentation/runbooks
- Conduct post-mortem

### Notification

**Internal:**
- Security team via email/Slack
- DevOps/SRE team
- Affected business units

**External:**
- If data breach confirmed, follow GDPR/compliance requirements
- Notify affected tenants
- Vincere support (if platform-wide issue suspected)

## Compliance

### Data Protection

**GDPR Considerations:**
- **Data minimization** - proxy doesn't store Vincere data, only tokens
- **Right to erasure** - delete tenant secrets from Key Vault
- **Logging retention** - Application Insights 30 days (configurable)
- **Cross-border transfers** - Azure region selection (australiaeast default)

**PII Handling:**
- Proxy doesn't inspect/log request/response bodies
- Tokens are opaque identifiers, not PII themselves
- Tenant host may be logged (not considered PII)

### Audit Trail

**Key Vault Audit:**
```bash
# Enable diagnostic settings → Log Analytics
az monitor diagnostic-settings create \
  --resource $(az keyvault show --name vincere-proxy-kv --query id -o tsv) \
  --name "KeyVaultAudit" \
  --workspace $(az monitor log-analytics workspace show --name vincere-proxy-law --query id -o tsv) \
  --logs '[{"category": "AuditEvent", "enabled": true}]'

# Query audit logs
AzureDiagnostics
| where ResourceType == "VAULTS"
| where OperationName == "SecretGet"
| project TimeGenerated, identity_claim_upn_s, requestUri_s
```

**App Service Audit:**
- All requests logged to Application Insights
- Correlation IDs for end-to-end tracing
- Structured logs (JSON) for easy querying

## Security Best Practices

### Deployment

1. **Never commit secrets** to Git (use `.gitignore`)
2. **Use OIDC** for GitHub Actions (no long-lived credentials)
3. **Deploy via staging slot** with smoke tests before swap
4. **Enable soft delete** on Key Vault (already in Bicep)
5. **Restrict Key Vault network** (if deploying behind VNet)

### Operations

1. **Rotate PSK every 90 days** (set calendar reminder)
2. **Review audit logs weekly** (Key Vault, App Insights)
3. **Update dependencies monthly** (`npm update`)
4. **Test disaster recovery** quarterly (delete/restore Key Vault secret)
5. **Review RBAC assignments** annually (least privilege)

### Development

1. **Run tests before push** (`npm test`)
2. **Use branch protection** (require PR reviews, CI pass)
3. **Never log secrets** (use redaction paths)
4. **Validate all inputs** (user-provided data is untrusted)
5. **Follow secure coding guidelines** (OWASP Top 10)

## Reporting Vulnerabilities

**Please do NOT open public GitHub issues for security vulnerabilities.**

Instead:
1. Email: security@YOUR-ORG.com
2. Include: description, impact, reproduction steps, proof-of-concept
3. Allow 48 hours for initial response
4. We'll coordinate disclosure timeline

**Bug Bounty:** Not currently offered.

## Security Roadmap

**Planned Enhancements:**
- [ ] Azure Front Door with WAF (DDoS, bot protection)
- [ ] Key Vault firewall (restrict to App Service + CI/CD)
- [ ] Azure AD authentication (replace/augment PSK)
- [ ] Mutual TLS for proxy → Vincere
- [ ] Automated secrets rotation (Azure Functions)
- [ ] Enhanced anomaly detection (ML-based)

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Azure Key Vault Security](https://learn.microsoft.com/azure/key-vault/general/security-features)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Last Updated:** 2025-01-15  
**Security Contact:** security@YOUR-ORG.com

