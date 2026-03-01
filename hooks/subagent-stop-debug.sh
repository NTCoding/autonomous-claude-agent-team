#!/bin/bash
LOG="/tmp/feature-team-hook-debug.log"
INPUT=$(cat)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SUBAGENT_STOP FIRED" >> "$LOG"
echo "  STDIN=$INPUT" >> "$LOG"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SUBAGENT_STOP DONE" >> "$LOG"

# Pass through to the real handler
echo "$INPUT" | npx tsx "${CLAUDE_PLUGIN_ROOT}/src/autonomous-claude-agent-team-workflow.ts"
