#!/bin/bash

# ============================================================
# Loki Validation Script
# ============================================================
# This script sends sample log data to Loki and verifies
# that the logs are successfully stored and queryable.
# ============================================================

set -e  # Exit on any error

echo "🚀 Starting Loki validation..."
echo ""

# Configuration
LOKI_URL="http://localhost:3100"
TEST_LABEL="test_app"
TEST_MESSAGE="Hello from Loki validation script"
TIMESTAMP=$(date +%s)000000000  # Current time in nanoseconds

# ============================================================
# Step 1: Send log data to Loki
# ============================================================
echo "📤 Step 1: Sending test log to Loki..."

# Loki expects logs in a specific JSON format with:
# - streams: array of log streams
# - labels: key-value pairs to identify the log source
# - entries: array of log entries with timestamp and line
curl -X POST "${LOKI_URL}/loki/api/v1/push" \
  -H "Content-Type: application/json" \
  -d "{
    \"streams\": [
      {
        \"stream\": {
          \"job\": \"${TEST_LABEL}\",
          \"environment\": \"test\"
        },
        \"values\": [
          [\"${TIMESTAMP}\", \"${TEST_MESSAGE}\"]
        ]
      }
    ]
  }"

echo ""
echo "✅ Log data sent successfully!"
echo ""

# Wait a moment for Loki to process and index the log
echo "⏳ Waiting 2 seconds for Loki to process the log..."
sleep 2
echo ""

# ============================================================
# Step 2: Query Loki to verify the log was stored
# ============================================================
echo "🔍 Step 2: Querying Loki to verify log storage..."

# Query using LogQL (Loki Query Language)
# {job="test_app"} selects all logs with job label = test_app
# Loki requires a time range for queries (start and end in nanoseconds)
START_NS=$(($(date +%s) - 60))000000000  # 60 seconds ago
END_NS=$(date +%s)000000000              # Now

QUERY_RESULT=$(curl -s -G "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode "query={job=\"${TEST_LABEL}\"}" \
  --data-urlencode "start=${START_NS}" \
  --data-urlencode "end=${END_NS}" \
  --data-urlencode "limit=10")

echo "Query result:"
echo "$QUERY_RESULT" | jq '.'
echo ""

# ============================================================
# Step 3: Verify the result
# ============================================================
echo "✨ Step 3: Validating results..."

# Check if our test message appears in the results
if echo "$QUERY_RESULT" | grep -q "$TEST_MESSAGE"; then
  echo "✅ SUCCESS: Log was successfully stored and retrieved from Loki!"
  echo "   Message found: ${TEST_MESSAGE}"
else
  echo "❌ FAILED: Log was not found in Loki"
  exit 1
fi

echo ""
echo "🎉 Loki validation completed successfully!"
