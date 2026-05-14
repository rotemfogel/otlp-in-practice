#!/bin/bash

# ============================================================
# Loki Cleanup Script
# ============================================================
# This script removes test log data from Loki by deleting
# logs matching the test_app job label.
# ============================================================

set -e  # Exit on any error

echo "🧹 Starting Loki cleanup..."
echo ""

# Configuration
LOKI_URL="http://localhost:3100"
TEST_LABEL="test_app"

# Calculate time range (last 24 hours to now)
# Loki uses RFC3339Nano format for timestamps
START_TIME=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%S.000000000Z")
END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.999999999Z")

echo "📋 Cleanup details:"
echo "   Target: Logs with job=${TEST_LABEL}"
echo "   Time range: ${START_TIME} to ${END_TIME}"
echo ""

# ============================================================
# Step 1: Create a deletion request
# ============================================================
echo "🗑️  Step 1: Sending deletion request to Loki..."

# Loki's delete API requires:
# - query: LogQL selector (e.g., {job="test_app"})
# - start: RFC3339Nano timestamp
# - end: RFC3339Nano timestamp
curl -X POST "${LOKI_URL}/loki/api/v1/delete" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "query={job=\"${TEST_LABEL}\"}" \
  -d "start=${START_TIME}" \
  -d "end=${END_TIME}"

echo ""
echo "✅ Deletion request submitted!"
echo ""

# ============================================================
# Step 2: Verify deletion
# ============================================================
echo "⏳ Waiting 2 seconds for deletion to process..."
sleep 2
echo ""

echo "🔍 Step 2: Verifying logs were deleted..."

# Query with time range (last 60 seconds)
START_NS=$(($(date +%s) - 60))000000000
END_NS=$(date +%s)000000000

QUERY_RESULT=$(curl -s -G "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode "query={job=\"${TEST_LABEL}\"}" \
  --data-urlencode "start=${START_NS}" \
  --data-urlencode "end=${END_NS}" \
  --data-urlencode "limit=10")

# Check if any results remain
RESULT_COUNT=$(echo "$QUERY_RESULT" | jq -r '.data.result | length')

if [ "$RESULT_COUNT" -eq 0 ]; then
  echo "✅ SUCCESS: Test logs have been deleted from Loki!"
else
  echo "⚠️  WARNING: Some logs may still exist (found $RESULT_COUNT streams)"
  echo "   Note: Loki compaction runs periodically, so deletion may take a few minutes"
fi

echo ""
echo "🎉 Cleanup completed!"
