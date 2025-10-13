# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added

**Core Features**
- OAuth2 Authorization Code flow with Vincere
- Automatic token refresh with in-memory caching (50s default)
- Proxy endpoints for Vincere API with header injection
- Health check endpoint (`/healthz`)

**Infrastructure**
- Azure Key Vault integration for secure token storage
- Managed Identity authentication (no secrets in code)
- Application Insights telemetry and logging
- Bicep templates for full Azure infrastructure
- Development and production parameter files

**Security**
- HTTPS-only with HSTS header (1 year, preload)
- Helmet security headers (CSP, XSS protection, etc.)
- SSRF protection with strict tenant validation
- Optional pre-shared key (PSK) authentication
- Optional IP allow-list
- Rate limiting (100/min proxy, 10/15min auth)
- Secrets redaction in logs

**CI/CD**
- GitHub Actions workflow for continuous integration
- CodeQL security scanning
- npm audit on every PR
- OIDC authentication for Azure deployments
- Staging slot deployment with smoke tests
- Automated production slot swap

**Fabric Integration**
- Warehouse SQL scripts for control tables
- Example Data Pipeline for incremental candidate loads
- REST Linked Service template
- Comprehensive Fabric integration guide

**Observability**
- Structured JSON logging (Pino)
- Correlation IDs for request tracing
- Custom metrics (duration, row count, etc.)
- Application Insights integration

**Developer Experience**
- TypeScript with strict mode
- Comprehensive test suite (Jest)
- ESLint and Prettier configuration
- Local development setup
- Docker support with multi-stage builds

**Documentation**
- Comprehensive README with setup instructions
- SECURITY.md with threat model and controls
- QUICKSTART.md for rapid deployment
- Fabric integration guide
- Helper scripts for secret management

### Dependencies

**Runtime**
- Node.js 18 LTS
- Express 4.18
- Azure SDK (Identity, Key Vault)
- Application Insights 2.9
- Axios with retry logic
- Helmet 7.1
- Pino logging

**Development**
- TypeScript 5.3
- Jest 29
- ESLint 8 with security plugin
- Prettier 3

### Infrastructure

**Azure Resources**
- App Service (Linux, Node 18)
- App Service Plan (B1 dev, P1v2 prod)
- Staging slot for blue-green deployments
- Key Vault with RBAC, soft-delete, purge protection
- Application Insights (workspace-based)
- Log Analytics workspace

### Security Notes

- All secrets stored in Azure Key Vault
- Managed Identity for authentication
- RBAC on all resources
- No secrets in code or logs
- Regular security scans (Dependabot, CodeQL, npm audit)

---

## [Unreleased]

### Planned

- Azure Front Door with WAF
- Key Vault network restrictions
- Azure AD authentication option
- Enhanced retry strategies
- Support for additional Vincere endpoints
- JobAdder proxy support (separate routes)

---

## Release Process

1. Update CHANGELOG.md with changes
2. Bump version in package.json
3. Merge to main branch
4. GitHub Actions automatically deploys
5. Tag release: `git tag v1.0.0 && git push --tags`
6. Create GitHub release with notes

---

**Legend:**
- `Added` - new features
- `Changed` - changes in existing functionality
- `Deprecated` - soon-to-be removed features
- `Removed` - removed features
- `Fixed` - bug fixes
- `Security` - vulnerability fixes

