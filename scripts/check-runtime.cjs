#!/usr/bin/env node

const REQUIRED = { major: 18, minor: 14, patch: 1 };

function parseVersion(input) {
  const raw = String(input || '').trim().replace(/^v/i, '');
  const parts = raw.split('.');
  const major = Number(parts[0] || 0);
  const minor = Number(parts[1] || 0);
  const patch = Number(parts[2] || 0);
  return { raw, major, minor, patch };
}

function isVersionAtLeast(current, target) {
  if (current.major !== target.major) {
    return current.major > target.major;
  }
  if (current.minor !== target.minor) {
    return current.minor > target.minor;
  }
  return current.patch >= target.patch;
}

const nodeVersion = parseVersion(process.versions.node);
if (!isVersionAtLeast(nodeVersion, REQUIRED)) {
  const requiredText = `${REQUIRED.major}.${REQUIRED.minor}.${REQUIRED.patch}`;
  const currentText = nodeVersion.raw || 'unknown';
  console.error(`[compat] Node.js >= ${requiredText} is required. Current: ${currentText}`);
  console.error('[compat] Use Node 20 LTS (recommended), then reinstall deps: npm install');
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error(`[compat] This app currently supports macOS only. Current platform: ${process.platform}`);
  process.exit(1);
}
