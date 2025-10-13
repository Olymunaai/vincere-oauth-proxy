#!/bin/bash

# =============================================================================
# PSK Rotation Script
# =============================================================================
#
# Rotates the pre-shared key (PSK) used for proxy authentication
#
# Usage:
#   ./scripts/rotate-psk.sh <key-vault-name>
#
# This should be run every 90 days as part of security best practices
#
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Key Vault name required${NC}"
    echo "Usage: $0 <key-vault-name>"
    exit 1
fi

KEY_VAULT_NAME=$1

# Check Azure CLI
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI not found${NC}"
    exit 1
fi

# Check login
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Azure CLI${NC}"
    exit 1
fi

echo -e "${YELLOW}=== PSK Rotation ===${NC}"
echo "Key Vault: $KEY_VAULT_NAME"
echo "Current time: $(date)"
echo ""

# Generate new PSK
NEW_PSK=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "$(date +%s)-CHANGE-ME")

echo -e "${GREEN}Generated new PSK:${NC} $NEW_PSK"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT STEPS:${NC}"
echo "1. Copy the new PSK above"
echo "2. Update all Fabric pipelines/clients with the new PSK"
echo "3. Confirm PSK has been updated everywhere"
echo "4. This script will then update Key Vault"
echo "5. Old PSK will be immediately invalidated"
echo ""
read -rp "Have you updated all clients with the new PSK? [y/N]: " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled. No changes made.${NC}"
    echo "Save the new PSK for later: $NEW_PSK"
    exit 0
fi

# Set new PSK in Key Vault
echo ""
echo "Updating Key Vault..."
if az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name "infra/proxy-psk" \
    --value "$NEW_PSK" \
    --output none; then
    echo -e "${GREEN}✓ PSK rotated successfully${NC}"
else
    echo -e "${RED}✗ Failed to update Key Vault${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Rotation Complete ===${NC}"
echo "Next rotation due: $(date -d '+90 days' 2>/dev/null || date -v+90d 2>/dev/null || echo 'in 90 days')"
echo ""
echo "Post-rotation checklist:"
echo "  [ ] Test proxy health endpoint"
echo "  [ ] Test authenticated proxy request"
echo "  [ ] Verify Fabric pipeline runs successfully"
echo "  [ ] Document rotation in audit log"
echo "  [ ] Set calendar reminder for next rotation"
echo ""

