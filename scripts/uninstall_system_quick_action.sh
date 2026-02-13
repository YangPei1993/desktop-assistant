#!/usr/bin/env bash
set -euo pipefail
for name in "Ask Desktop Assistant" "Ask Desktop Assistant Files"; do
  workflow_dir="$HOME/Library/Services/${name}.workflow"
  if [ -d "$workflow_dir" ]; then
    rm -rf "$workflow_dir"
    echo "Removed: $workflow_dir"
  else
    echo "Not found: $workflow_dir"
  fi
done
/System/Library/CoreServices/pbs -flush >/dev/null 2>&1 || true
/System/Library/CoreServices/pbs -update >/dev/null 2>&1 || true
