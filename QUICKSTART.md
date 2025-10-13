# Quick Start Guide

Get the Vincere OAuth Proxy running in Azure in under 30 minutes.

## Prerequisites Checklist

- [ ] Azure subscription with Contributor access
- [ ] GitHub account
- [ ] Vincere OAuth Client ID (request from Vincere support)
- [ ] Azure CLI installed locally
- [ ] Git installed

## Step 1: Fork & Configure Repository (5 minutes)

```bash
# Fork this repository on GitHub, then clone
git clone https://github.com/YOUR-USERNAME/vincere-oauth-proxy.git
cd vincere-oauth-proxy

# Install dependencies (optional, for local testing)
npm install
```

## Step 2: Setup Azure & GitHub OIDC (10 minutes)

### Create Service Principal for GitHub Actions

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription "YOUR-SUBSCRIPTION-ID"

# Get subscription details
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# Create service principal
az ad sp create-for-rbac \
  --name "github-actions-vincere-proxy" \
  --role contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID \
  --sdk-auth

# Copy the JSON output - you'll need clientId, tenantId, subscriptionId
```

### Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:
- `AZURE_CLIENT_ID` - from service principal JSON
- `AZURE_TENANT_ID` - from service principal JSON  
- `AZURE_SUBSCRIPTION_ID` - from service principal JSON
- `AZURE_RESOURCE_GROUP` - e.g., `rg-vincere-proxy`

### Configure OIDC in Azure

```bash
# Get your repo details
GITHUB_ORG="YOUR-USERNAME"
REPO_NAME="vincere-oauth-proxy"
APP_ID=$(az ad sp list --display-name "github-actions-vincere-proxy" --query "[0].appId" -o tsv)

# Add federated credential
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG/$REPO_NAME"':ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

## Step 3: Configure Deployment Parameters (5 minutes)

Edit `infra/params.prod.json`:

```json
{
  "vincereClientId": {
    "value": "YOUR_VINCERE_CLIENT_ID"
  }
}
```

Optional: Adjust location, SKU, or other parameters.

## Step 4: Deploy to Azure (10 minutes)

### Option A: Via GitHub Actions (Recommended)

```bash
# Commit and push
git add infra/params.prod.json
git commit -m "chore: configure deployment parameters"
git push origin main

# Watch deployment in GitHub Actions tab
# URL: https://github.com/YOUR-USERNAME/vincere-oauth-proxy/actions
```

### Option B: Manual Deployment

```bash
# Create resource group
az group create \
  --name rg-vincere-proxy \
  --location australiaeast

# Deploy infrastructure
az deployment group create \
  --resource-group rg-vincere-proxy \
  --template-file infra/main.bicep \
  --parameters @infra/params.prod.json

# Get outputs
az deployment group show \
  --resource-group rg-vincere-proxy \
  --name main \
  --query properties.outputs

# Deploy application
npm run build
az webapp deployment source config-zip \
  --resource-group rg-vincere-proxy \
  --name <webAppName-from-outputs> \
  --src deploy.zip  # Create zip of dist/ folder
```

## Step 5: Test Deployment (5 minutes)

### Test Health Endpoint

```bash
# Get your app URL from outputs
APP_URL="https://vincere-proxy-app-XXXXX.azurewebsites.net"

# Test health
curl $APP_URL/healthz

# Expected response:
# {"status":"ok","timeUtc":"...","appVersion":"1.0.0"}
```

### Authorize Your Tenant

```bash
# Open in browser
open "$APP_URL/auth/start?tenantHost=yourcompany.vincere.io"

# Follow OAuth flow
# On success, you'll see "Authorization Complete"
```

### Test Proxy Endpoint

```bash
# Test API call
curl "$APP_URL/vincere/yourcompany.vincere.io/candidate/search/fl=id?q=deleted:0&limit=5&start=0"

# You should get JSON with candidate IDs
```

## Step 6: Integrate with Fabric (Optional)

See detailed guide: [fabric/README.md](fabric/README.md)

Quick steps:
1. Create control tables in Fabric Warehouse
2. Create REST Linked Service pointing to `$APP_URL/vincere`
3. Import example pipeline
4. Set tenant parameter and run

## Troubleshooting

### Deployment fails with "Key Vault name already exists"

The Key Vault name is globally unique. Wait 90 days for purge, or modify `namePrefix` in params.

```json
{
  "namePrefix": {
    "value": "vincere-proxy-v2"
  }
}
```

### 401 Unauthorized on proxy call

Tenant not authorized. Visit `/auth/start?tenantHost=...` again.

### 403 Forbidden

If `REQUIRE_PSK=1`, you need to set PSK and include `X-Proxy-Token` header:

```bash
# Set PSK
az keyvault secret set \
  --vault-name vincere-proxy-kv-XXXXX \
  --name "infra/proxy-psk" \
  --value "$(uuidgen)"

# Use in request
curl -H "X-Proxy-Token: YOUR-PSK" "$APP_URL/vincere/..."
```

### App not starting

Check logs:
```bash
az webapp log tail \
  --resource-group rg-vincere-proxy \
  --name vincere-proxy-app-XXXXX
```

Common issues:
- Missing `VINCERE_CLIENT_ID` in App Settings
- Key Vault URI incorrect
- Managed Identity not assigned

## Next Steps

- [ ] Configure monitoring alerts in Azure
- [ ] Set up Fabric pipelines for incremental loads
- [ ] Schedule pipeline runs (hourly/daily)
- [ ] Add more tenants (repeat Step 5 for each)
- [ ] Enable PSK authentication for production
- [ ] Review SECURITY.md for hardening options

## Support

- Documentation: [README.md](README.md)
- Security: [SECURITY.md](SECURITY.md)
- Issues: https://github.com/YOUR-ORG/vincere-oauth-proxy/issues

---

**Total Time:** ~30 minutes  
**Status:** ✅ Production-ready  
**What you've deployed:** Secure, scalable OAuth proxy with automatic token refresh, retry logic, observability, and CI/CD

