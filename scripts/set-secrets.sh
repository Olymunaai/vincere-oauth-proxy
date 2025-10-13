#!/bin/bash

# =============================================================================
# Helper script to set secrets in Azure Key Vault
# =============================================================================
#
# Usage:
#   ./scripts/set-secrets.sh <key-vault-name>
#
# This script helps you set common secrets needed by the proxy:
#   1. Tenant refresh tokens (set via OAuth flow, not manually)
#   2. Tenant API keys (optional)
#   3. Pre-shared key for proxy authentication (optional)
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Key Vault Secrets Officer role on the Key Vault
#
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Key Vault name is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Key Vault name required${NC}"
    echo "Usage: $0 <key-vault-name>"
    echo "Example: $0 vincere-proxy-kv-abc123"
    exit 1
fi

KEY_VAULT_NAME=$1

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI not found. Please install it first.${NC}"
    echo "See: https://learn.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Azure CLI${NC}"
    echo "Run: az login"
    exit 1
fi

# Check if Key Vault exists
if ! az keyvault show --name "$KEY_VAULT_NAME" &> /dev/null; then
    echo -e "${RED}Error: Key Vault '$KEY_VAULT_NAME' not found${NC}"
    exit 1
fi

echo -e "${GREEN}=== Azure Key Vault Secret Manager ===${NC}"
echo "Key Vault: $KEY_VAULT_NAME"
echo ""

# Function to set a secret
set_secret() {
    local secret_name=$1
    local secret_value=$2
    local description=$3

    echo -e "${YELLOW}Setting secret:${NC} $secret_name"
    echo "Description: $description"
    
    if az keyvault secret set \
        --vault-name "$KEY_VAULT_NAME" \
        --name "$secret_name" \
        --value "$secret_value" \
        --output none; then
        echo -e "${GREEN}✓ Success${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
        return 1
    fi
    echo ""
}

# Function to generate UUID
generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen
    else
        # Fallback for systems without uuidgen
        cat /proc/sys/kernel/random/uuid 2>/dev/null || \
        python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || \
        echo "$(date +%s)-$(shuf -i 10000-99999 -n 1)"
    fi
}

# Menu
echo "What would you like to do?"
echo "1. Set Pre-Shared Key (PSK) for proxy authentication"
echo "2. Set API Key for a Vincere tenant"
echo "3. Generate and set new PSK (rotates existing)"
echo "4. List all secrets (names only)"
echo "5. Delete a tenant's secrets"
echo "0. Exit"
echo ""
read -rp "Enter choice [0-5]: " choice

case $choice in
    1)
        echo ""
        echo "The PSK is used for authentication when REQUIRE_PSK=1"
        echo "This should be a strong, random value (e.g., UUID)"
        echo ""
        read -rp "Enter PSK value (or press Enter to generate): " psk_value
        
        if [ -z "$psk_value" ]; then
            psk_value=$(generate_uuid)
            echo "Generated PSK: $psk_value"
        fi
        
        set_secret "infra/proxy-psk" "$psk_value" "Pre-shared key for proxy authentication"
        
        echo -e "${GREEN}Remember to:${NC}"
        echo "1. Set REQUIRE_PSK=1 in App Service configuration"
        echo "2. Update Fabric pipelines to include X-Proxy-Token header"
        echo "3. Document this key securely"
        ;;
    
    2)
        echo ""
        read -rp "Enter tenant host (e.g., ecigroup.vincere.io): " tenant_host
        read -rp "Enter Vincere API key: " api_key
        
        if [ -z "$tenant_host" ] || [ -z "$api_key" ]; then
            echo -e "${RED}Error: Both tenant host and API key are required${NC}"
            exit 1
        fi
        
        # Clean tenant host for secret name
        clean_tenant=$(echo "$tenant_host" | sed 's/[^a-zA-Z0-9-]/-/g')
        secret_name="vincere/${clean_tenant}/api-key"
        
        set_secret "$secret_name" "$api_key" "API key for tenant $tenant_host"
        
        echo -e "${GREEN}API key set successfully${NC}"
        echo "The proxy will now include x-api-key header for this tenant"
        ;;
    
    3)
        echo ""
        echo "Generating new PSK..."
        new_psk=$(generate_uuid)
        echo "New PSK: $new_psk"
        echo ""
        read -rp "Set this as the new PSK? [y/N]: " confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            set_secret "infra/proxy-psk" "$new_psk" "Pre-shared key for proxy authentication (rotated)"
            
            echo -e "${YELLOW}Important:${NC}"
            echo "1. Update Fabric pipelines with new PSK"
            echo "2. Old PSK is immediately invalidated"
            echo "3. Test all pipelines after rotation"
        else
            echo "Cancelled"
        fi
        ;;
    
    4)
        echo ""
        echo "Listing all secrets in Key Vault..."
        echo ""
        az keyvault secret list \
            --vault-name "$KEY_VAULT_NAME" \
            --query "[].{Name:name, Updated:attributes.updated}" \
            --output table
        ;;
    
    5)
        echo ""
        read -rp "Enter tenant host to delete secrets for: " tenant_host
        
        if [ -z "$tenant_host" ]; then
            echo -e "${RED}Error: Tenant host required${NC}"
            exit 1
        fi
        
        clean_tenant=$(echo "$tenant_host" | sed 's/[^a-zA-Z0-9-]/-/g')
        
        echo -e "${YELLOW}WARNING: This will delete:${NC}"
        echo "  - vincere/${clean_tenant}/refresh-token"
        echo "  - vincere/${clean_tenant}/api-key"
        echo ""
        read -rp "Are you sure? [y/N]: " confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            for secret_type in "refresh-token" "api-key"; do
                secret_name="vincere/${clean_tenant}/${secret_type}"
                echo "Deleting $secret_name..."
                if az keyvault secret delete \
                    --vault-name "$KEY_VAULT_NAME" \
                    --name "$secret_name" \
                    --output none 2>/dev/null; then
                    echo -e "${GREEN}✓ Deleted${NC}"
                else
                    echo -e "${YELLOW}✓ Not found or already deleted${NC}"
                fi
            done
            
            echo ""
            echo -e "${GREEN}Tenant secrets deleted${NC}"
            echo "Note: Secrets are soft-deleted (recoverable for 90 days)"
            echo "To re-authorize: /auth/start?tenantHost=$tenant_host"
        else
            echo "Cancelled"
        fi
        ;;
    
    0)
        echo "Exiting"
        exit 0
        ;;
    
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"

