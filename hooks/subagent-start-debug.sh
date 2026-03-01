#!/bin/bash
LOG="/tmp/feature-team-hook-debug.log"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SUBAGENT_START FIRED" >> "$LOG"
echo "  PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT:-not set}" >> "$LOG"
echo "  PWD=$(pwd)" >> "$LOG"
echo "  ARGS=$*" >> "$LOG"

INPUT=$(cat)
echo "  STDIN=$INPUT" >> "$LOG"
echo "  STDIN_LENGTH=${#INPUT}" >> "$LOG"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SUBAGENT_START DONE" >> "$LOG"
exit 0
