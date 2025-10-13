#!/bin/bash

# =============================================================================
# Proxy Test Script
# =============================================================================
#
# Tests the deployed proxy endpoints
#
# Usage:
#   ./scripts/test-proxy.sh <proxy-url> [tenant-host] [psk]
#
# Example:
#   ./scripts/test-proxy.sh https://vincere-proxy-app.azurewebsites.net
#   ./scripts/test-proxy.sh https://vincere-proxy-app.azurewebsites.net ecigroup.vincere.io
#   ./scripts/test-proxy.sh https://vincere-proxy-app.azurewebsites.net ecigroup.vincere.io "your-psk-here"
#
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Proxy URL required${NC}"
    echo "Usage: $0 <proxy-url> [tenant-host] [psk]"
    exit 1
fi

PROXY_URL=$1
TENANT_HOST=${2:-}
PSK=${3:-}

echo -e "${YELLOW}=== Proxy Test Suite ===${NC}"
echo "Proxy URL: $PROXY_URL"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "Endpoint: GET /healthz"
echo ""

HEALTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${PROXY_URL}/healthz")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$HEALTH_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}✗ Health check failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi

echo ""
echo "----------------------------------------"
echo ""

# Test 2: OAuth Start (if tenant provided)
if [ -n "$TENANT_HOST" ]; then
    echo "Test 2: OAuth Authorization Start"
    echo "Endpoint: GET /auth/start?tenantHost=$TENANT_HOST"
    echo ""
    
    AUTH_URL="${PROXY_URL}/auth/start?tenantHost=${TENANT_HOST}"
    AUTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -L -I "$AUTH_URL")
    AUTH_HTTP_CODE=$(echo "$AUTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    
    if [ "$AUTH_HTTP_CODE" = "302" ] || [ "$AUTH_HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ OAuth start successful (redirecting)${NC}"
        LOCATION=$(echo "$AUTH_RESPONSE" | grep -i "location:" | cut -d' ' -f2 | tr -d '\r')
        echo "Redirect to: $LOCATION"
        echo ""
        echo "To complete authorization, visit:"
        echo "$AUTH_URL"
    else
        echo -e "${RED}✗ OAuth start failed (HTTP $AUTH_HTTP_CODE)${NC}"
    fi
    
    echo ""
    echo "----------------------------------------"
    echo ""
    
    # Test 3: Proxy Request
    echo "Test 3: Proxy API Request"
    echo "Endpoint: GET /vincere/$TENANT_HOST/candidate/search"
    echo ""
    
    HEADERS=()
    if [ -n "$PSK" ]; then
        HEADERS+=("-H" "X-Proxy-Token: $PSK")
        echo "Using PSK authentication"
    fi
    
    PROXY_ENDPOINT="${PROXY_URL}/vincere/${TENANT_HOST}/candidate/search/fl=id?q=deleted:0&limit=5&start=0"
    PROXY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${HEADERS[@]}" "$PROXY_ENDPOINT")
    PROXY_HTTP_CODE=$(echo "$PROXY_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    PROXY_BODY=$(echo "$PROXY_RESPONSE" | grep -v "HTTP_CODE:")
    
    if [ "$PROXY_HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Proxy request successful${NC}"
        echo "Response preview:"
        echo "$PROXY_BODY" | head -n 10
        
        # Count results if JSON
        if command -v jq &> /dev/null; then
            RESULT_COUNT=$(echo "$PROXY_BODY" | jq '.results | length' 2>/dev/null || echo "N/A")
            echo ""
            echo "Results returned: $RESULT_COUNT"
        fi
    elif [ "$PROXY_HTTP_CODE" = "401" ]; then
        echo -e "${YELLOW}✗ Unauthorized (HTTP $PROXY_HTTP_CODE)${NC}"
        echo "Tenant may not be authorized yet."
        echo "Run OAuth flow: $AUTH_URL"
    elif [ "$PROXY_HTTP_CODE" = "403" ]; then
        echo -e "${RED}✗ Forbidden (HTTP $PROXY_HTTP_CODE)${NC}"
        echo "Check PSK or IP restrictions"
    else
        echo -e "${RED}✗ Proxy request failed (HTTP $PROXY_HTTP_CODE)${NC}"
        echo "Response: $PROXY_BODY"
    fi
else
    echo "Skipping OAuth and proxy tests (no tenant host provided)"
    echo "To test fully: $0 $PROXY_URL <tenant-host> [psk]"
fi

echo ""
echo "----------------------------------------"
echo ""
echo -e "${GREEN}=== Test Suite Complete ===${NC}"
echo ""

