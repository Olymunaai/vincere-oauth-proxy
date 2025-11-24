@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Prefix for resource names')
param namePrefix string = 'vincere-proxy'

@description('Environment name (dev, prod)')
param environment string = 'dev'

@description('App Service Plan SKU')
param skuAppServicePlan string = 'B1'

@description('Enable staging slot')
param enableStagingSlot bool = true

@description('Key Vault SKU')
param kvSku string = 'standard'

@description('Log Analytics workspace SKU')
param workspaceSku string = 'PerGB2018'

@description('Vincere Client ID')
param vincereClientId string

@description('Vincere Redirect URI (will be set to web app URL if empty)')
param vincereRedirectUri string = ''

@description('Allowed IPs for proxy access (comma-separated)')
param allowedIps string = ''

@description('Require pre-shared key')
param requirePsk bool = false

@description('Skip RBAC role assignments (set to true if service principal lacks User Access Administrator role)')
param skipRoleAssignments bool = false

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id)
var appServicePlanName = '${namePrefix}-plan-${environment}'
var webAppName = '${namePrefix}-app-${environment}-${uniqueSuffix}'
var keyVaultName = '${namePrefix}-kv-${uniqueSuffix}'
var appInsightsName = '${namePrefix}-ai-${environment}'
var workspaceName = '${namePrefix}-law-${environment}'
var stagingSlotName = 'staging'

// Log Analytics Workspace
resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: workspaceSku
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: skuAppServicePlan
  }
  properties: {
    reserved: true
  }
}

// Web App
resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/healthz'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'VINCERE_ID_BASE'
          value: 'https://id.vincere.io'
        }
        {
          name: 'VINCERE_CLIENT_ID'
          value: vincereClientId
        }
        {
          name: 'VINCERE_REDIRECT_URI'
          value: empty(vincereRedirectUri) ? 'https://${webAppName}.azurewebsites.net/auth/callback' : vincereRedirectUri
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'ID_TOKEN_CACHE_SECONDS'
          value: '50'
        }
        {
          name: 'ALLOWED_IPS'
          value: allowedIps
        }
        {
          name: 'REQUIRE_PSK'
          value: requirePsk ? '1' : '0'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~18'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
      ]
    }
  }
}

// Staging Slot
resource stagingSlot 'Microsoft.Web/sites/slots@2022-09-01' = if (enableStagingSlot) {
  name: stagingSlotName
  parent: webApp
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/healthz'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'VINCERE_ID_BASE'
          value: 'https://id.vincere.io'
        }
        {
          name: 'VINCERE_CLIENT_ID'
          value: vincereClientId
        }
        {
          name: 'VINCERE_REDIRECT_URI'
          value: empty(vincereRedirectUri) ? 'https://${webAppName}-${stagingSlotName}.azurewebsites.net/auth/callback' : vincereRedirectUri
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'ID_TOKEN_CACHE_SECONDS'
          value: '50'
        }
        {
          name: 'ALLOWED_IPS'
          value: allowedIps
        }
        {
          name: 'REQUIRE_PSK'
          value: requirePsk ? '1' : '0'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~18'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
      ]
    }
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: kvSku
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// RBAC: Key Vault Secrets User role for Web App
resource keyVaultRoleAssignmentWebApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!skipRoleAssignments) {
  name: guid(keyVault.id, webApp.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Key Vault Secrets User role for Staging Slot
resource keyVaultRoleAssignmentStaging 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStagingSlot && !skipRoleAssignments) {
  name: guid(keyVault.id, stagingSlot.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: stagingSlot.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output stagingSlotName string = enableStagingSlot ? stagingSlotName : ''
output stagingUrl string = enableStagingSlot ? 'https://${webApp.name}-${stagingSlotName}.azurewebsites.net' : ''
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsName string = appInsights.name
output workspaceName string = workspace.name
output resourceGroupName string = resourceGroup().name
output webAppPrincipalId string = webApp.identity.principalId
output stagingSlotPrincipalId string = enableStagingSlot && stagingSlot != null ? stagingSlot.identity.principalId : ''
output roleAssignmentNote string = skipRoleAssignments ? 'Role assignments were skipped. Manually assign "Key Vault Secrets User" role to the web app and staging slot principals on the Key Vault.' : 'Role assignments completed automatically.'

