#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_MODULES_ROOT="$ROOT_DIR/node_modules"
TARGET_REL="native-devtools-mcp/bin/cli.js"
TARGET_SCRIPT="$NODE_MODULES_ROOT/$TARGET_REL"
if [[ "$ROOT_DIR" == *.asar.unpacked ]]; then
  APP_ASAR_ROOT="${ROOT_DIR%.unpacked}"
  TARGET_SCRIPT="$APP_ASAR_ROOT/node_modules/$TARGET_REL"
  if [[ -f "$NODE_MODULES_ROOT/$TARGET_REL" ]]; then
    TARGET_SCRIPT="$NODE_MODULES_ROOT/$TARGET_REL"
  fi
fi
NODE_BIN="${MCP_NODE_BIN:-$(command -v node || true)}"
USE_EMBEDDED_NODE="${MCP_USE_EMBEDDED_NODE:-0}"

if [[ -n "$NODE_BIN" && ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
  USE_EMBEDDED_NODE=0
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js >= 18 is required for native-devtools-mcp." >&2
  exit 1
fi

run_node() {
  if [[ "$USE_EMBEDDED_NODE" == "1" ]]; then
    ELECTRON_RUN_AS_NODE=1 "$NODE_BIN" "$@"
    return
  fi
  "$NODE_BIN" "$@"
}

NODE_MAJOR="$(run_node -p "String(process.versions.node).split('.')[0]" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node.js >= 18 is required. Current: $(run_node -v 2>/dev/null || echo unknown)" >&2
  exit 1
fi

if [[ "$USE_EMBEDDED_NODE" == "1" ]]; then
  exec env ELECTRON_RUN_AS_NODE=1 "$NODE_BIN" "$TARGET_SCRIPT" "$@"
fi

exec "$NODE_BIN" "$TARGET_SCRIPT" "$@"
