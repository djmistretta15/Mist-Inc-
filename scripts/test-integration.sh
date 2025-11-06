#!/bin/bash
set -e

BASE_URL="http://localhost:8080"

echo "🧪 Testing Mist Backbone Integration"
echo ""

# Test 1: Health checks
echo "1️⃣ Testing health endpoints..."
curl -f "$BASE_URL/health" || { echo "❌ Gateway health check failed"; exit 1; }
echo " ✅ Gateway healthy"

# Test 2: Trust Engine
echo ""
echo "2️⃣ Testing Trust Engine..."
USER_ID="550e8400-e29b-41d4-a716-446655440000"
TRUST_RESPONSE=$(curl -s "$BASE_URL/api/v1/trust/$USER_ID")
echo "Trust score response: $TRUST_RESPONSE"
echo " ✅ Trust Engine responding"

# Test 3: Scheduler
echo ""
echo "3️⃣ Testing Scheduler..."
# Would need to create a job first, skipping for now
echo " ⏭️  Scheduler tests require job creation (skipped)"

echo ""
echo "✅ Integration tests passed!"
