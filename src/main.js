import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
} from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DESKTOP_ASSISTANT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : PROJECT_ROOT;
const APP_DISPLAY_NAME = 'Desktop Assistant';

dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
app.setName(APP_DISPLAY_NAME);

function expandHomeDir(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const home = os.homedir();
  if (raw === '~') {
    return home;
  }
  if (raw.startsWith('~/')) {
    return path.join(home, raw.slice(2));
  }
  return raw;
}

function normalizeLegacyProjectPath(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/\\/g, '/');
  const marker = '/desktop-assistant';
  if (normalized === marker || normalized.endsWith(marker)) {
    return DESKTOP_ASSISTANT_ROOT;
  }
  const idx = normalized.indexOf(`${marker}/`);
  if (idx >= 0) {
    return path.join(DESKTOP_ASSISTANT_ROOT, normalized.slice(idx + marker.length + 1));
  }
  return raw;
}

function getBundledClaudeMcpConfigPath() {
  return path.join(DESKTOP_ASSISTANT_ROOT, 'mcp', 'desktop-control.mcp.json');
}

function parseClaudeMcpConfigs(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return [getBundledClaudeMcpConfigPath()];
  }
  if (/^(?:none|off|false)$/i.test(raw)) {
    return [];
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return [raw];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\$\{?DESKTOP_ASSISTANT_ROOT\}?/g, DESKTOP_ASSISTANT_ROOT))
    .map((item) => expandHomeDir(item))
    .map((item) => normalizeLegacyProjectPath(item));
}

const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const CODEX_MODEL = process.env.CODEX_MODEL || '';
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 300000);
const CODEX_WORKDIR = process.env.CODEX_WORKDIR || os.homedir();
const CLOUD_API_BASE_URL = String(process.env.CLOUD_API_BASE_URL || 'https://api.openai.com/v1').trim();
const CLOUD_API_MODEL = String(process.env.CLOUD_API_MODEL || 'gpt-4.1-mini').trim();
const CLOUD_API_KEY = String(process.env.CLOUD_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const CLOUD_API_TEMPLATE = String(process.env.CLOUD_API_TEMPLATE || 'openai').trim().toLowerCase();
const CLOUD_API_TIMEOUT_MS = Number(process.env.CLOUD_API_TIMEOUT_MS || 120000);
const CLOUD_API_AUDIO_MODEL = String(process.env.CLOUD_API_AUDIO_MODEL || 'whisper-1').trim();
const CLOUD_API_AUDIO_MAX_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.CLOUD_API_AUDIO_MAX_BYTES || 25 * 1024 * 1024)
);
const CLOUD_API_REALTIME_ENABLED = String(process.env.CLOUD_API_REALTIME_ENABLED || 'true')
  .trim()
  .toLowerCase() !== 'false';
const CLOUD_API_REALTIME_CONNECT_TIMEOUT_MS = Math.max(
  2000,
  Number(process.env.CLOUD_API_REALTIME_CONNECT_TIMEOUT_MS || 8000)
);
const CLOUD_API_REALTIME_IDLE_CLOSE_MS = Math.max(
  5000,
  Number(process.env.CLOUD_API_REALTIME_IDLE_CLOSE_MS || 45000)
);
const CLOUD_API_IMAGE_MAX_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.CLOUD_API_IMAGE_MAX_BYTES || 8 * 1024 * 1024)
);
const DEFAULT_RUNTIME_MODE = String(process.env.RUNTIME_MODE || 'cli').trim().toLowerCase();
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || '';
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || CODEX_TIMEOUT_MS);
const CLAUDE_CHAT_TIMEOUT_MS = Number(
  process.env.CLAUDE_CHAT_TIMEOUT_MS || Math.min(CLAUDE_TIMEOUT_MS, 120000)
);
const CLAUDE_TOOLS = process.env.CLAUDE_TOOLS ?? '';
const CLAUDE_PERMISSION_MODE = String(process.env.CLAUDE_PERMISSION_MODE || '').trim();
const CLAUDE_AUTOMATION_PERMISSION_MODE = String(
  process.env.CLAUDE_AUTOMATION_PERMISSION_MODE || 'bypassPermissions'
).trim();
const CLAUDE_CHAT_USE_MCP = String(process.env.CLAUDE_CHAT_USE_MCP || 'false')
  .trim()
  .toLowerCase() === 'true';
const CLAUDE_MCP_CONFIGS = parseClaudeMcpConfigs(process.env.CLAUDE_MCP_CONFIG || '');
const COMMON_CLI_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.cargo', 'bin'),
  path.join(os.homedir(), '.bun', 'bin'),
];
const CLI_BIN_CACHE = new Map();
const DEFAULT_PROVIDER = (process.env.CLI_PROVIDER || 'codex').toLowerCase();
const AUTOMATION_ENGINE = String(process.env.AUTOMATION_ENGINE || 'auto')
  .trim()
  .toLowerCase();
const MAX_TEXT_CHARS = Number(process.env.CLI_MAX_TEXT_CHARS || 12000);
const SUPPORTED_PROVIDERS = new Set(['codex', 'claude']);
const SUPPORTED_RUNTIME_MODES = new Set(['cli', 'api']);
const SUPPORTED_API_TEMPLATES = new Set(['openai', 'azure', 'custom']);
const AUTOMATION_BIN_PATH = path.join(PROJECT_ROOT, '.runtime', 'macos-control');
const AUTOMATION_SWIFT_SOURCE = path.join(__dirname, 'automation', 'macos_control.swift');
const AUTOMATION_PLAN_TIMEOUT_MS = Number(process.env.AUTOMATION_PLAN_TIMEOUT_MS || 180000);
const AUTOMATION_MCP_TIMEOUT_MS = Number(process.env.AUTOMATION_MCP_TIMEOUT_MS || 120000);
const AUTOMATION_PLAN_BATCH_STEPS = Math.max(1, Math.min(5, Number(process.env.AUTOMATION_PLAN_BATCH_STEPS || 3)));
const AUTOMATION_UNREAD_MAX_CLICKS = Math.max(1, Math.min(12, Number(process.env.AUTOMATION_UNREAD_MAX_CLICKS || 6)));
const AUTOMATION_CAPTURE_SCOPE = String(process.env.AUTOMATION_CAPTURE_SCOPE || 'window')
  .trim()
  .toLowerCase();
const LIVE_WATCH_INTERVAL_MS = Math.max(2000, Number(process.env.LIVE_WATCH_INTERVAL_MS || 2500));
const LIVE_WATCH_ANALYZE_TIMEOUT_MS = Math.max(20000, Number(process.env.LIVE_WATCH_ANALYZE_TIMEOUT_MS || 90000));
const LIVE_WATCH_NOTIFY_COOLDOWN_MS = Math.max(3000, Number(process.env.LIVE_WATCH_NOTIFY_COOLDOWN_MS || 8000));
const LIVE_WATCH_IDLE_STATUS_COOLDOWN_MS = Math.max(
  5000,
  Number(process.env.LIVE_WATCH_IDLE_STATUS_COOLDOWN_MS || 12000)
);
const LIVE_WATCH_MIN_CHANGE_DISTANCE = Math.max(0, Math.min(1, Number(process.env.LIVE_WATCH_MIN_CHANGE_DISTANCE || 0.015)));
const LIVE_WATCH_MIN_CHANGE_RATIO = Math.max(0, Math.min(1, Number(process.env.LIVE_WATCH_MIN_CHANGE_RATIO || 0.06)));
const LIVE_WATCH_MAX_DIALOG_ITEMS = Math.max(4, Math.min(24, Number(process.env.LIVE_WATCH_MAX_DIALOG_ITEMS || 10)));
const LIVE_WATCH_MAX_MEMORY_ITEMS = Math.max(6, Math.min(40, Number(process.env.LIVE_WATCH_MAX_MEMORY_ITEMS || 16)));
const LIVE_WATCH_SUMMARY_FRAMES = Math.max(2, Math.min(12, Number(process.env.LIVE_WATCH_SUMMARY_FRAMES || 3)));
const LIVE_WATCH_MAX_IMAGE_MEMORY = Math.max(6, Math.min(60, Number(process.env.LIVE_WATCH_MAX_IMAGE_MEMORY || 30)));
const LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS = Math.max(
  1,
  Math.min(12, Number(process.env.LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS || Math.min(6, LIVE_WATCH_SUMMARY_FRAMES)))
);
const LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS = Math.max(
  1,
  Math.min(10, Number(process.env.LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS || 4))
);
const LIVE_WATCH_ATTACHMENT_MAX_WIDTH = Math.max(
  640,
  Math.min(1920, Number(process.env.LIVE_WATCH_ATTACHMENT_MAX_WIDTH || 1280))
);
const LIVE_WATCH_ATTACHMENT_JPEG_QUALITY = Math.max(
  45,
  Math.min(90, Number(process.env.LIVE_WATCH_ATTACHMENT_JPEG_QUALITY || 68))
);

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.csv',
  '.tsv',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.sh',
  '.zsh',
  '.bash',
  '.log',
  '.ini',
  '.conf',
  '.toml',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.sql',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff']);
const UNREAD_GOAL_PATTERN =
  /(?:\u672a\u8bfb|\u65b0\u6d88\u606f|\u6700\u65b0\u6d88\u606f|\u7ea2\u70b9|\u7ea2\u8272\u6570\u5b57|\u7ea2\u8272\u6807\u8bb0|unread|new\s*message|latest\s*message)/i;
const CHAT_APP_PATTERN =
  /(?:\u4f01\u4e1a\u5fae\u4fe1|\u5fae\u4fe1|wecom|wxwork|wechat|\u9489\u9489|dingtalk|\u98de\u4e66|lark|slack|teams)/i;
const MESSAGE_INTENT_PATTERN = /(?:\u6d88\u606f|message|\u804a\u5929|\u4f1a\u8bdd|\u901a\u77e5|\u7fa4)/i;
const CHECK_LATEST_PATTERN = /(?:\u6700\u65b0|\u6709\u65e0|\u6709\u6ca1\u6709|\u67e5\u770b|\u770b\u770b|\u68c0\u67e5|\u603b\u7ed3|summary|\u5185\u5bb9)/i;

let bubbleWindow = null;
let bubbleToastWindow = null;
let quickReplyWindow = null;
let chatWindow = null;
let chatWindowLoaded = false;
const pendingChatEvents = [];
const APP_PROTOCOL = 'desktopassistant';
let appReadyForDeepLinks = false;
const pendingDeepLinks = [];
const BUBBLE_SIZE = 64;
const BUBBLE_EDGE_MARGIN = 8;
const BUBBLE_TOAST_WIDTH = 280;
const BUBBLE_TOAST_ITEM_HEIGHT = 108;
const BUBBLE_TOAST_ITEM_GAP = 8;
const BUBBLE_TOAST_WINDOW_PADDING = 8;
const BUBBLE_TOAST_MAX_ITEMS = 3;
const QUICK_REPLY_WIDTH = 360;
const QUICK_REPLY_HEIGHT = 140;
let pendingBubbleToastPayload = null;
let bubbleToastItems = [];
let bubbleToastSequence = 0;
let pendingQuickReplyContextPayload = null;
const bubbleBusySources = new Set();
let embeddedNodeShimDir = '';
let preferredNodeBinary = '';
let codexThreadId = null;
let claudeSessionId = null;
let currentWorkdir = path.resolve(CODEX_WORKDIR);
let currentProvider = SUPPORTED_PROVIDERS.has(DEFAULT_PROVIDER) ? DEFAULT_PROVIDER : 'codex';
let currentRuntimeMode = SUPPORTED_RUNTIME_MODES.has(DEFAULT_RUNTIME_MODE) ? DEFAULT_RUNTIME_MODE : 'cli';
let defaultChannelId = '';
let defaultChannelApplied = false;
let cloudApiConfig = {
  baseUrl: CLOUD_API_BASE_URL,
  model: CLOUD_API_MODEL,
  apiKey: CLOUD_API_KEY,
  template: SUPPORTED_API_TEMPLATES.has(CLOUD_API_TEMPLATE) ? CLOUD_API_TEMPLATE : 'openai',
};
let activeSendCancel = null;
let activeAutomationController = null;
let bubbleDragState = null;
let bubblePositionState = null;
let bubbleStateSaveTimer = null;
const liveWatchState = {
  running: false,
  busy: false,
  intervalMs: LIVE_WATCH_INTERVAL_MS,
  timer: null,
  engineRuntimeMode: 'cli',
  engineProvider: 'codex',
  focusHint: '',
  dialog: [],
  visualMemory: [],
  frameImages: [],
  framesSinceAnalysis: 0,
  summaryEveryFrames: LIVE_WATCH_SUMMARY_FRAMES,
  maxImageFrames: LIVE_WATCH_MAX_IMAGE_MEMORY,
  maxImagesPerAnalysis: LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS,
  textOnlyMaxRounds: LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS,
  forceAnalyze: false,
  lastUserMessage: '',
  lastUserMessageAt: 0,
  lastQuestionKey: '',
  lastQuestionAt: 0,
  lastFrameHash: '',
  lastFrameSignature: null,
  lastObservationKey: '',
  lastObservationSummaryKey: '',
  lastNotifiedAt: 0,
  lastIdleStatusAt: 0,
  lastError: '',
  lastSummary: '',
  activeRequestCancel: null,
  textOnlyRoundsAfterVision: 0,
  noChangeStreak: 0,
  lastVisionAnalyzeAt: 0,
};
let channelOptionsCache = {
  expiresAt: 0,
  channels: [],
};
const realtimeState = {
  socket: null,
  connecting: null,
  active: null,
  idleCloseTimer: null,
  endpoint: '',
  model: '',
};
const ASSISTANT_MEDIA_PERMISSIONS = new Set(['media', 'microphone', 'audiocapture', 'audio-capture']);
const PERMISSION_KINDS = new Set(['microphone', 'screen', 'accessibility', 'automation']);
const PERMISSION_SETTINGS_URLS = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
};

function isAssistantWebContents(webContents) {
  if (!webContents || typeof webContents.id !== 'number') {
    return false;
  }
  const bubbleContents = bubbleWindow && !bubbleWindow.isDestroyed() ? bubbleWindow.webContents : null;
  const quickReplyContents =
    quickReplyWindow && !quickReplyWindow.isDestroyed() ? quickReplyWindow.webContents : null;
  const chatContents = chatWindow && !chatWindow.isDestroyed() ? chatWindow.webContents : null;
  return (
    webContents.id === bubbleContents?.id ||
    webContents.id === quickReplyContents?.id ||
    webContents.id === chatContents?.id
  );
}

function shouldAllowAssistantPermission(permission) {
  return ASSISTANT_MEDIA_PERMISSIONS.has(String(permission || '').trim().toLowerCase());
}

function configureAssistantPermissionHandlers() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) {
    return;
  }

  if (typeof defaultSession.setPermissionCheckHandler === 'function') {
    defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (!isAssistantWebContents(webContents)) {
        return false;
      }
      return shouldAllowAssistantPermission(permission);
    });
  }

  if (typeof defaultSession.setPermissionRequestHandler === 'function') {
    defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allow = isAssistantWebContents(webContents) && shouldAllowAssistantPermission(permission);
      callback(Boolean(allow));
    });
  }
}

async function ensureMicrophonePermission() {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
      status: 'unknown',
    };
  }
  if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
    return {
      ok: true,
      status: 'unknown',
    };
  }

  const status = String(systemPreferences.getMediaAccessStatus('microphone') || 'unknown').toLowerCase();
  if (status === 'granted') {
    return { ok: true, status };
  }
  if (status === 'denied' || status === 'restricted') {
    void openPermissionSettings('microphone').catch(() => {});
    return {
      ok: false,
      status,
      error:
        `Microphone permission is denied. Open System Settings > Privacy & Security > Microphone and enable ${permissionListAppLabel()}.`,
    };
  }

  if (typeof systemPreferences.askForMediaAccess !== 'function') {
    return {
      ok: false,
      status,
      error: 'Microphone permission API is unavailable on this system.',
    };
  }

  let granted = false;
  try {
    granted = await systemPreferences.askForMediaAccess('microphone');
  } catch (error) {
    return {
      ok: false,
      status,
      error: `Unable to request microphone permission: ${String(error?.message || error)}`,
    };
  }
  if (!granted) {
    return {
      ok: false,
      status: 'denied',
      error: 'Microphone permission was not granted.',
    };
  }
  return {
    ok: true,
    status: 'granted',
  };
}

function normalizePermissionKind(rawKind) {
  const kind = String(rawKind || '')
    .trim()
    .toLowerCase();
  if (!PERMISSION_KINDS.has(kind)) {
    throw new Error(`Unsupported permission kind: ${rawKind}`);
  }
  return kind;
}

function normalizePermissionStatus(rawStatus) {
  const status = String(rawStatus || '')
    .trim()
    .toLowerCase();
  if (!status) {
    return 'unknown';
  }
  return status;
}

function permissionListAppLabel() {
  return app.isPackaged ? APP_DISPLAY_NAME : `${APP_DISPLAY_NAME} (dev build may display as Electron)`;
}

function getMacMediaAccessStatus(mediaType) {
  if (process.platform !== 'darwin') {
    return 'unknown';
  }
  if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
    return 'unknown';
  }
  try {
    return normalizePermissionStatus(systemPreferences.getMediaAccessStatus(mediaType));
  } catch (_error) {
    return 'unknown';
  }
}

function getAccessibilityStatus() {
  if (process.platform !== 'darwin') {
    return 'unknown';
  }
  if (!systemPreferences || typeof systemPreferences.isTrustedAccessibilityClient !== 'function') {
    return 'unknown';
  }
  try {
    return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
  } catch (_error) {
    return 'unknown';
  }
}

function buildPermissionItem(kind, status, extras = {}) {
  const normalized = normalizePermissionStatus(status);
  return {
    kind,
    status: normalized,
    granted: normalized === 'granted',
    canRequest: Boolean(extras.canRequest),
    canOpenSettings: Boolean(PERMISSION_SETTINGS_URLS[kind]),
    note: String(extras.note || ''),
    updatedAt: new Date().toISOString(),
  };
}

function getPermissionSnapshot() {
  const microphoneStatus = getMacMediaAccessStatus('microphone');
  const screenStatus = getMacMediaAccessStatus('screen');
  const accessibilityStatus = getAccessibilityStatus();
  const automationStatus = 'unknown';
  return {
    platform: process.platform,
    items: {
      microphone: buildPermissionItem('microphone', microphoneStatus, {
        canRequest: process.platform === 'darwin',
        note:
          'Voice input needs this permission. If denied, open System Settings and enable Desktop Assistant manually.',
      }),
      screen: buildPermissionItem('screen', screenStatus, {
        canRequest: process.platform === 'darwin',
        note: 'Desktop automation and live watch need screen recording.',
      }),
      accessibility: buildPermissionItem('accessibility', accessibilityStatus, {
        canRequest: process.platform === 'darwin',
        note: 'Desktop automation click/type needs Accessibility trust.',
      }),
      automation: buildPermissionItem('automation', automationStatus, {
        canRequest: process.platform === 'darwin',
        note: 'AppleScript control permission is granted by macOS per target app. Click Request to trigger prompt seed.',
      }),
    },
    updatedAt: new Date().toISOString(),
  };
}

async function requestScreenPermission() {
  const before = getMacMediaAccessStatus('screen');
  if (before === 'granted') {
    return {
      ok: true,
      kind: 'screen',
      status: 'granted',
      snapshot: getPermissionSnapshot(),
    };
  }
  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 16, height: 16 },
      fetchWindowIcons: false,
    });
  } catch (_error) {
    // no-op: macOS may still require manual user action in Settings.
  }
  const after = getMacMediaAccessStatus('screen');
  if (after === 'granted') {
    return {
      ok: true,
      kind: 'screen',
      status: 'granted',
      snapshot: getPermissionSnapshot(),
    };
  }
  void openPermissionSettings('screen').catch(() => {});
  return {
    ok: false,
    kind: 'screen',
    status: after,
    error:
      `Screen Recording is not granted yet. Open System Settings > Privacy & Security > Screen Recording and enable ${permissionListAppLabel()}.`,
    snapshot: getPermissionSnapshot(),
  };
}

async function requestAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
      kind: 'accessibility',
      status: 'unknown',
      snapshot: getPermissionSnapshot(),
    };
  }
  if (!systemPreferences || typeof systemPreferences.isTrustedAccessibilityClient !== 'function') {
    return {
      ok: false,
      kind: 'accessibility',
      status: 'unknown',
      error: 'Accessibility permission API is unavailable on this system.',
      snapshot: getPermissionSnapshot(),
    };
  }
  try {
    const granted = systemPreferences.isTrustedAccessibilityClient(true);
    if (granted) {
      return {
        ok: true,
        kind: 'accessibility',
        status: 'granted',
        snapshot: getPermissionSnapshot(),
      };
    }
    void openPermissionSettings('accessibility').catch(() => {});
    return {
      ok: false,
      kind: 'accessibility',
      status: 'denied',
      error:
        `Accessibility permission is not granted. Open System Settings > Privacy & Security > Accessibility and enable ${permissionListAppLabel()}.`,
      snapshot: getPermissionSnapshot(),
    };
  } catch (error) {
    return {
      ok: false,
      kind: 'accessibility',
      status: 'error',
      error: `Unable to request Accessibility permission: ${String(error?.message || error)}`,
      snapshot: getPermissionSnapshot(),
    };
  }
}

async function requestAutomationPermission() {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
      kind: 'automation',
      status: 'unknown',
      snapshot: getPermissionSnapshot(),
    };
  }
  try {
    await runShell(
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
      12000,
      currentWorkdir
    );
    return {
      ok: true,
      kind: 'automation',
      status: 'unknown',
      error: '',
      snapshot: getPermissionSnapshot(),
    };
  } catch (error) {
    return {
      ok: false,
      kind: 'automation',
      status: 'denied',
      error: `Automation permission prompt failed or was denied: ${String(error?.message || error)}`,
      snapshot: getPermissionSnapshot(),
    };
  }
}

async function requestPermission(kind) {
  const normalized = normalizePermissionKind(kind);
  if (normalized === 'microphone') {
    const result = await ensureMicrophonePermission();
    return {
      ok: Boolean(result?.ok),
      kind: normalized,
      status: normalizePermissionStatus(result?.status || (result?.ok ? 'granted' : 'unknown')),
      error: result?.ok ? '' : String(result?.error || 'Microphone permission was not granted.'),
      snapshot: getPermissionSnapshot(),
    };
  }
  if (normalized === 'screen') {
    return requestScreenPermission();
  }
  if (normalized === 'accessibility') {
    return requestAccessibilityPermission();
  }
  return requestAutomationPermission();
}

async function openPermissionSettings(kind) {
  const normalized = normalizePermissionKind(kind);
  const url = PERMISSION_SETTINGS_URLS[normalized];
  if (!url) {
    return {
      ok: false,
      error: `No settings deep-link for permission kind: ${normalized}`,
    };
  }
  try {
    await shell.openExternal(url);
    return {
      ok: true,
      kind: normalized,
      snapshot: getPermissionSnapshot(),
    };
  } catch (_error) {
    try {
      await runShell('/usr/bin/open', [url], 8000, currentWorkdir);
      return {
        ok: true,
        kind: normalized,
        snapshot: getPermissionSnapshot(),
      };
    } catch (error) {
      return {
        ok: false,
        kind: normalized,
        error: `Failed to open System Settings: ${String(error?.message || error)}`,
        snapshot: getPermissionSnapshot(),
      };
    }
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function getRuntimeHealthSnapshot() {
  const mcpConfigPath = getBundledClaudeMcpConfigPath();
  const nativeMcpScript = path.join(DESKTOP_ASSISTANT_ROOT, 'scripts', 'mcp', 'run-native-devtools-mcp.sh');
  const appleMcpScript = path.join(DESKTOP_ASSISTANT_ROOT, 'scripts', 'mcp', 'run-applescript-mcp.sh');
  const playwrightMcpScript = path.join(DESKTOP_ASSISTANT_ROOT, 'scripts', 'mcp', 'run-playwright-mcp.sh');
  const codexHome = String(process.env.CODEX_HOME || path.join(os.homedir(), '.codex')).trim();
  const codexSkillsDir = path.join(codexHome, 'skills');
  const [hasMcpConfig, hasNativeScript, hasAppleScript, hasPlaywrightScript, hasCodexSkills] = await Promise.all([
    pathExists(mcpConfigPath),
    pathExists(nativeMcpScript),
    pathExists(appleMcpScript),
    pathExists(playwrightMcpScript),
    pathExists(codexSkillsDir),
  ]);
  return {
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    electronVersion: String(process.versions.electron || ''),
    embeddedNodeVersion: String(process.versions.node || ''),
    appRoot: DESKTOP_ASSISTANT_ROOT,
    bundledMcpConfigPath: mcpConfigPath,
    usingEmbeddedNode: !process.env.MCP_NODE_BIN,
    embeddedNodeBin: process.execPath,
    preferredNodeBinary,
    codexHome,
    codexSkillsDir,
    hasCodexSkills,
    hasMcpConfig,
    hasNativeScript,
    hasAppleScript,
    hasPlaywrightScript,
  };
}

function prettyBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function safeBasename(filePath, fallbackName = 'file') {
  if (!filePath || typeof filePath !== 'string') {
    return fallbackName;
  }
  return path.basename(filePath);
}

function isLikelyText(filePath, mime) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  return typeof mime === 'string' && mime.startsWith('text/');
}

function isLikelyImage(filePath, mime) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return true;
  }
  return typeof mime === 'string' && mime.startsWith('image/');
}

function normalizeProvider(rawProvider) {
  const value = String(rawProvider || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(value)) {
    throw new Error(`Unsupported provider: ${rawProvider}`);
  }
  return value;
}

function normalizeRuntimeMode(rawMode) {
  const value = String(rawMode || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_RUNTIME_MODES.has(value)) {
    throw new Error(`Unsupported runtime mode: ${rawMode}`);
  }
  return value;
}

function normalizeChannelId(rawChannelId) {
  const value = String(rawChannelId || '')
    .trim()
    .toLowerCase();
  if (value === 'api') {
    return 'api';
  }
  if (value === 'cli:claude') {
    return 'cli:claude';
  }
  if (value === 'cli:codex') {
    return 'cli:codex';
  }
  throw new Error(`Unsupported channel: ${rawChannelId}`);
}

function normalizeChannelIdOrEmpty(rawChannelId) {
  try {
    return normalizeChannelId(rawChannelId);
  } catch (_error) {
    return '';
  }
}

function applyChannelSelection(channelId) {
  const id = normalizeChannelId(channelId);
  if (id === 'api') {
    currentRuntimeMode = 'api';
    return;
  }
  currentRuntimeMode = 'cli';
  currentProvider = id === 'cli:claude' ? 'claude' : 'codex';
}

function normalizeApiTemplate(rawTemplate) {
  const value = String(rawTemplate || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_API_TEMPLATES.has(value)) {
    throw new Error(`Unsupported API template: ${rawTemplate}`);
  }
  return value;
}

function normalizeCloudApiBaseUrl(rawBaseUrl) {
  const trimmed = String(rawBaseUrl || '').trim();
  if (!trimmed) {
    throw new Error('API base URL cannot be empty.');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    throw new Error(`Invalid API base URL: ${trimmed}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('API base URL must use http or https.');
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = normalizedPath || '/';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeCloudApiModel(rawModel) {
  const model = String(rawModel || '').trim();
  if (!model) {
    throw new Error('API model cannot be empty.');
  }
  return model;
}

function normalizeCloudApiConfig(rawConfig = {}, options = {}) {
  const next = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const allowKeepEmptyKey = options.allowKeepEmptyKey !== false;
  const template = normalizeApiTemplate(
    Object.prototype.hasOwnProperty.call(next, 'template') ? next.template : cloudApiConfig.template
  );
  const normalized = {
    template,
    baseUrl: normalizeCloudApiBaseUrl(
      Object.prototype.hasOwnProperty.call(next, 'baseUrl') ? next.baseUrl : cloudApiConfig.baseUrl
    ),
    model: normalizeCloudApiModel(
      Object.prototype.hasOwnProperty.call(next, 'model') ? next.model : cloudApiConfig.model
    ),
    apiKey: cloudApiConfig.apiKey,
  };

  if (Object.prototype.hasOwnProperty.call(next, 'apiKey')) {
    const incoming = String(next.apiKey || '').trim();
    if (incoming) {
      normalized.apiKey = incoming;
    } else if (!allowKeepEmptyKey) {
      normalized.apiKey = '';
    }
  }

  return normalized;
}

function maskApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) {
    return '';
  }
  if (key.length <= 8) {
    return `${'*'.repeat(Math.max(1, key.length - 2))}${key.slice(-2)}`;
  }
  return `${key.slice(0, 3)}***${key.slice(-4)}`;
}

function buildPublicApiConfig(config = cloudApiConfig) {
  const key = String(config?.apiKey || '').trim();
  const template = SUPPORTED_API_TEMPLATES.has(String(config?.template || '').toLowerCase())
    ? String(config.template).toLowerCase()
    : 'openai';
  return {
    template,
    baseUrl: String(config?.baseUrl || '').trim(),
    model: String(config?.model || '').trim(),
    hasApiKey: Boolean(key),
    keyPreview: maskApiKey(key),
  };
}

function assertCloudApiReady(config = cloudApiConfig) {
  const baseUrl = String(config?.baseUrl || '').trim();
  const model = String(config?.model || '').trim();
  const apiKey = String(config?.apiKey || '').trim();
  if (!baseUrl) {
    throw new Error('Cloud API base URL is not configured.');
  }
  if (!model) {
    throw new Error('Cloud API model is not configured.');
  }
  if (!apiKey) {
    throw new Error('Cloud API key is not configured.');
  }
}

function getApiTemplateDisplayName(template) {
  const key = normalizeApiTemplate(template || 'openai');
  if (key === 'azure') {
    return 'Azure';
  }
  if (key === 'custom') {
    return 'Custom';
  }
  return 'OpenAI';
}

function getActiveChannelId() {
  if (currentRuntimeMode === 'api') {
    return 'api';
  }
  return `cli:${currentProvider === 'claude' ? 'claude' : 'codex'}`;
}

function clearChannelOptionsCache() {
  channelOptionsCache = {
    expiresAt: 0,
    channels: [],
  };
}

function isCloudApiConfigured(config = cloudApiConfig) {
  try {
    assertCloudApiReady(config);
    return true;
  } catch (_error) {
    return false;
  }
}

async function isCliProviderReady(provider) {
  try {
    await assertProviderReady(provider);
    return true;
  } catch (_error) {
    return false;
  }
}

async function isCliProviderDetected(provider) {
  try {
    const bin = await getProviderCommand(provider, { refresh: true });
    const normalized = normalizeCommandPath(bin);
    if (!normalized) {
      return false;
    }
    if (path.isAbsolute(normalized) || normalized.includes('/')) {
      return pathExists(normalized);
    }
    const resolved = await discoverCommandInLoginShell(normalized);
    return Boolean(resolved);
  } catch (_error) {
    return false;
  }
}

async function assertProviderReadyOrDetected(provider) {
  try {
    await assertProviderReady(provider);
    return;
  } catch (error) {
    const detected = await isCliProviderDetected(provider);
    if (detected) {
      return;
    }
    throw error;
  }
}

async function listAvailableChannels({ force = false } = {}) {
  const now = Date.now();
  if (!force && channelOptionsCache.expiresAt > now && Array.isArray(channelOptionsCache.channels)) {
    return channelOptionsCache.channels;
  }

  const [codexReady, claudeReady, codexDetected, claudeDetected] = await Promise.all([
    isCliProviderReady('codex'),
    isCliProviderReady('claude'),
    isCliProviderDetected('codex'),
    isCliProviderDetected('claude'),
  ]);
  const channels = [];
  if (codexReady || codexDetected) {
    channels.push({
      id: 'cli:codex',
      label: 'CLI · Codex',
      available: true,
    });
  }
  if (claudeReady || claudeDetected) {
    channels.push({
      id: 'cli:claude',
      label: 'CLI · Claude',
      available: true,
    });
  }
  if (isCloudApiConfigured(cloudApiConfig)) {
    channels.push({
      id: 'api',
      label: `API · ${getApiTemplateDisplayName(cloudApiConfig.template)}`,
      available: true,
    });
  }

  channelOptionsCache = {
    expiresAt: now + 15000,
    channels,
  };
  return channels;
}

function getClaudePermissionMode({ automation = false } = {}) {
  if (automation) {
    return CLAUDE_AUTOMATION_PERMISSION_MODE || CLAUDE_PERMISSION_MODE || '';
  }
  return CLAUDE_PERMISSION_MODE || '';
}

async function assertClaudeMcpConfigsReady() {
  for (const entry of CLAUDE_MCP_CONFIGS) {
    const value = String(entry || '').trim();
    if (!value) {
      continue;
    }
    if (value.startsWith('{') || value.startsWith('[')) {
      continue;
    }
    const exists = await pathExists(value);
    if (!exists) {
      throw new Error(`Claude MCP config not found: ${value}`);
    }
  }
}

function isUnreadMessageGoal(goal) {
  const text = String(goal || '');
  if (!text) {
    return false;
  }
  if (UNREAD_GOAL_PATTERN.test(text)) {
    return true;
  }
  const chatLike = CHAT_APP_PATTERN.test(text);
  const messageIntent = MESSAGE_INTENT_PATTERN.test(text);
  const latestIntent = CHECK_LATEST_PATTERN.test(text);
  return chatLike && messageIntent && latestIntent;
}

function isChatLikeAppContext(captureInfo) {
  const appName = String(captureInfo?.appName || '').trim();
  const windowTitle = String(captureInfo?.windowTitle || '').trim();
  return CHAT_APP_PATTERN.test(`${appName} ${windowTitle}`);
}

function inferAutomationTarget(goal, frontContext = null) {
  const rawGoal = String(goal || '');
  const lowerGoal = rawGoal.toLowerCase();
  const frontApp = String(frontContext?.appName || '').trim();
  const frontWindow = String(frontContext?.windowTitle || '').trim();

  const appMappings = [
    {
      name: 'wecom',
      pattern: /(?:\u4f01\u4e1a\u5fae\u4fe1|wecom|wxwork)/i,
      candidates: ['\u4f01\u4e1a\u5fae\u4fe1', 'WeCom'],
    },
    {
      name: 'wechat',
      pattern: /(?:\u5fae\u4fe1|wechat)/i,
      candidates: ['\u5fae\u4fe1', 'WeChat'],
    },
    {
      name: 'dingtalk',
      pattern: /(?:\u9489\u9489|dingtalk)/i,
      candidates: ['\u9489\u9489', 'DingTalk'],
    },
    {
      name: 'lark',
      pattern: /(?:\u98de\u4e66|lark)/i,
      candidates: ['\u98de\u4e66', 'Lark'],
    },
    {
      name: 'slack',
      pattern: /(?:slack)/i,
      candidates: ['Slack'],
    },
    {
      name: 'safari',
      pattern: /(?:safari)/i,
      candidates: ['Safari'],
    },
    {
      name: 'chrome',
      pattern: /(?:chrome|google\s*chrome|\u8c37\u6b4c\u6d4f\u89c8\u5668)/i,
      candidates: ['Google Chrome', 'Chrome'],
    },
  ];

  const webGoal = /(?:\u7f51\u9875|\u7f51\u7ad9|\u6d4f\u89c8\u5668|http|https|url|web|chrome|safari|edge)/i.test(lowerGoal);
  const currentWindowGoal = /(?:\u5f53\u524d|\u8fd9\u4e2a|\u672c\u7a97\u53e3|\u5f53\u524d\u7a97\u53e3|\u73b0\u5728\u7a97\u53e3)/i.test(
    lowerGoal
  );

  let target = {
    app: '',
    candidates: [],
    reason: '',
    frontApp,
    frontWindow,
    webGoal,
  };

  for (const mapping of appMappings) {
    if (mapping.pattern.test(rawGoal)) {
      target = {
        ...target,
        app: mapping.candidates[0],
        candidates: mapping.candidates,
        reason: `Matched app keyword: ${mapping.name}`,
      };
      break;
    }
  }

  if (!target.app && currentWindowGoal && frontApp) {
    target = {
      ...target,
      app: frontApp,
      candidates: [frontApp],
      reason: 'Goal references current window, use current front app.',
    };
  }

  if (!target.app && !webGoal && frontApp) {
    target = {
      ...target,
      app: frontApp,
      candidates: [frontApp],
      reason: 'No explicit app in goal, default to current front app.',
    };
  }

  return target;
}

async function activateTargetApp(target, controller = null) {
  const candidates = Array.isArray(target?.candidates) ? target.candidates : [];
  for (const appName of candidates) {
    const name = String(appName || '').trim();
    if (!name) {
      continue;
    }
    try {
      await runAppleScript(
        [`tell application "${appleScriptEscapeString(name)}" to activate`],
        10000,
        withAutomationCancelOptions(controller)
      );
      return { ok: true, app: name };
    } catch (_error) {
      // continue
    }
  }
  return { ok: false, app: '' };
}

function shouldUseClaudeMcpAutomation(provider) {
  if (provider !== 'claude') {
    return false;
  }
  if (CLAUDE_MCP_CONFIGS.length === 0) {
    return false;
  }
  if (AUTOMATION_ENGINE === 'screen') {
    return false;
  }
  return AUTOMATION_ENGINE === 'auto' || AUTOMATION_ENGINE === 'mcp';
}

function clearCliBinaryCache() {
  CLI_BIN_CACHE.clear();
}

function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function isPathLikeCommand(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  return text.includes('/') || text.startsWith('.');
}

function normalizeCommandPath(rawCommand) {
  const text = String(rawCommand || '').trim();
  if (!text) {
    return '';
  }
  const expanded = expandHomeDir(text);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  if (expanded.startsWith('./') || expanded.startsWith('../')) {
    return path.resolve(currentWorkdir, expanded);
  }
  return expanded;
}

async function ensureEmbeddedNodeShim() {
  if (!app.isReady()) {
    return '';
  }
  if (embeddedNodeShimDir) {
    return embeddedNodeShimDir;
  }
  const runtimeBinDir = path.join(app.getPath('userData'), 'runtime-bin');
  const shimPath = path.join(runtimeBinDir, 'node');
  const preferredNode = await detectPreferredNodeBinary();
  preferredNodeBinary = preferredNode || '';
  const escapedPreferredNode = String(preferredNode || '').replace(/"/g, '\\"');
  const escapedExecPath = String(process.execPath || '').replace(/"/g, '\\"');
  const script = preferredNode
    ? `#!/bin/sh\nif [ -x "${escapedPreferredNode}" ]; then\n  exec "${escapedPreferredNode}" "$@"\nfi\nexport ELECTRON_RUN_AS_NODE=1\nexec "${escapedExecPath}" "$@"\n`
    : `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${escapedExecPath}" "$@"\n`;
  await fs.mkdir(runtimeBinDir, { recursive: true });
  let shouldWrite = true;
  try {
    const existing = await fs.readFile(shimPath, 'utf8');
    if (existing === script) {
      shouldWrite = false;
    }
  } catch (_error) {
    shouldWrite = true;
  }
  if (shouldWrite) {
    await fs.writeFile(shimPath, script, 'utf8');
  }
  await fs.chmod(shimPath, 0o755);
  embeddedNodeShimDir = runtimeBinDir;
  return embeddedNodeShimDir;
}

async function listNvmBinDirs() {
  const root = path.join(os.homedir(), '.nvm', 'versions', 'node');
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, 'bin'))
      .reverse();
    return dirs;
  } catch (_error) {
    return [];
  }
}

async function readNodeMajorVersion(nodeBin) {
  const candidate = String(nodeBin || '').trim();
  if (!candidate) {
    return 0;
  }
  try {
    const result = await runProcess(candidate, ['-p', 'process.versions.node'], 8000, currentWorkdir, {
      env: {
        MCP_NODE_BIN: '',
        MCP_USE_EMBEDDED_NODE: '0',
      },
    });
    const version = String(result.stdout || '')
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    const major = Number(String(version || '').split('.')[0]);
    if (!Number.isFinite(major)) {
      return 0;
    }
    return major;
  } catch (_error) {
    return 0;
  }
}

async function detectPreferredNodeBinary() {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const normalized = normalizeCommandPath(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(process.env.MCP_NODE_BIN || '');
  if (process.env.NVM_BIN) {
    pushCandidate(path.join(process.env.NVM_BIN, 'node'));
  }
  const nvmDirs = await listNvmBinDirs();
  for (const dir of nvmDirs) {
    pushCandidate(path.join(dir, 'node'));
  }
  for (const dir of COMMON_CLI_BIN_DIRS) {
    pushCandidate(path.join(dir, 'node'));
  }

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }
    const major = await readNodeMajorVersion(candidate);
    if (major >= 18) {
      return candidate;
    }
  }
  return '';
}

async function discoverCommandInLoginShell(commandName) {
  const text = String(commandName || '').trim();
  if (!text) {
    return '';
  }
  const script = `command -v ${shellQuote(text)} || true`;
  for (const shellMode of ['-ilc', '-lc']) {
    try {
      const result = await runProcess('/bin/zsh', [shellMode, script], 10000, currentWorkdir, {
        env: {
          MCP_NODE_BIN: '',
          MCP_USE_EMBEDDED_NODE: '0',
        },
      });
      const resolved = String(result.stdout || '')
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (resolved) {
        return resolved;
      }
    } catch (_error) {
      // continue
    }
  }
  return '';
}

async function resolveCliCommand(rawCommand) {
  const command = String(rawCommand || '').trim();
  if (!command) {
    return '';
  }

  if (isPathLikeCommand(command)) {
    return normalizeCommandPath(command);
  }

  const nvmDirs = await listNvmBinDirs();
  const candidatePaths = [
    ...COMMON_CLI_BIN_DIRS.map((dir) => path.join(dir, command)),
    ...nvmDirs.map((dir) => path.join(dir, command)),
  ];

  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  const fromLoginShell = await discoverCommandInLoginShell(command);
  if (fromLoginShell) {
    return fromLoginShell;
  }

  return command;
}

async function getProviderCommand(provider, { refresh = false } = {}) {
  const normalized = normalizeProvider(provider);
  const raw = normalized === 'claude' ? CLAUDE_BIN : CODEX_BIN;
  const cacheKey = `${normalized}::${raw}`;
  if (!refresh && CLI_BIN_CACHE.has(cacheKey)) {
    return CLI_BIN_CACHE.get(cacheKey);
  }
  const resolved = await resolveCliCommand(raw);
  CLI_BIN_CACHE.set(cacheKey, resolved);
  return resolved;
}

async function assertProviderReady(provider) {
  if (app.isReady() && !embeddedNodeShimDir) {
    try {
      await ensureEmbeddedNodeShim();
    } catch (_error) {
      // ignore shim bootstrap failure; continue with existing PATH
    }
  }
  if (provider === 'codex') {
    let bin = await getProviderCommand('codex');
    try {
      await runShell(bin, ['--version'], 15000, currentWorkdir);
    } catch (error) {
      bin = await getProviderCommand('codex', { refresh: true });
      try {
        await runShell(bin, ['--version'], 15000, currentWorkdir);
      } catch (innerError) {
        throw new Error(`Codex CLI is unavailable (${bin}). ${String(innerError?.message || innerError)}`);
      }
    }
    return;
  }
  if (provider === 'claude') {
    let bin = await getProviderCommand('claude');
    try {
      await runShell(bin, ['--version'], 15000, currentWorkdir);
    } catch (error) {
      bin = await getProviderCommand('claude', { refresh: true });
      try {
        await runShell(bin, ['--version'], 15000, currentWorkdir);
      } catch (innerError) {
        throw new Error(`Claude CLI is unavailable (${bin}). ${String(innerError?.message || innerError)}`);
      }
    }
  }
}

function resetConversationState() {
  codexThreadId = null;
  claudeSessionId = null;
  closeCloudRealtimeSocket('conversation reset');
}

function appleScriptEscapeString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function extractJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('No JSON text returned.');
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch (_firstError) {
    // Try to locate the first valid JSON object/array in the text.
  }

  const starts = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '{' || raw[i] === '[') {
      starts.push(i);
    }
  }

  for (const start of starts) {
    for (let end = raw.length; end > start + 1; end -= 1) {
      const snippet = raw.slice(start, end).trim();
      if (!snippet) {
        continue;
      }
      try {
        return JSON.parse(snippet);
      } catch (_error) {
        // continue
      }
    }
  }

  throw new Error('Failed to parse JSON from model output.');
}

async function runShell(command, args, timeoutMs, cwdPath, options = {}) {
  return runProcess(command, args, timeoutMs, cwdPath, options);
}

function createAutomationController() {
  let cancelled = false;
  let currentCancel = null;
  let waitCancel = null;

  return {
    isCancelled() {
      return cancelled;
    },
    requestCancel() {
      if (cancelled) {
        return false;
      }
      cancelled = true;
      if (typeof currentCancel === 'function') {
        try {
          currentCancel();
        } catch (_error) {
          // no-op
        }
      }
      if (typeof waitCancel === 'function') {
        try {
          waitCancel();
        } catch (_error) {
          // no-op
        }
      }
      return true;
    },
    setCurrentCancel(cancel) {
      currentCancel = typeof cancel === 'function' ? cancel : null;
      if (cancelled && typeof currentCancel === 'function') {
        try {
          currentCancel();
        } catch (_error) {
          // no-op
        }
      }
    },
    clearCurrentCancel(cancel) {
      if (!cancel || currentCancel === cancel) {
        currentCancel = null;
      }
    },
    setWaitCancel(cancel) {
      waitCancel = typeof cancel === 'function' ? cancel : null;
      if (cancelled && typeof waitCancel === 'function') {
        try {
          waitCancel();
        } catch (_error) {
          // no-op
        }
      }
    },
    clearWaitCancel(cancel) {
      if (!cancel || waitCancel === cancel) {
        waitCancel = null;
      }
    },
  };
}

function throwIfAutomationCancelled(controller) {
  if (controller && typeof controller.isCancelled === 'function' && controller.isCancelled()) {
    throw new Error('Automation paused by user.');
  }
}

function withAutomationCancelOptions(controller, options = {}) {
  if (!controller || typeof controller.setCurrentCancel !== 'function') {
    return options;
  }
  const previousOnSpawn = typeof options.onSpawn === 'function' ? options.onSpawn : null;
  return {
    ...options,
    onSpawn(info) {
      const cancel = typeof info?.cancel === 'function' ? info.cancel : null;
      if (cancel) {
        controller.setCurrentCancel(cancel);
      }
      if (previousOnSpawn) {
        previousOnSpawn(info);
      }
    },
  };
}

async function runShellWithAutomationControl(command, args, timeoutMs, cwdPath, controller, options = {}) {
  throwIfAutomationCancelled(controller);
  let spawnedCancel = null;
  const previousOnSpawn = typeof options.onSpawn === 'function' ? options.onSpawn : null;
  const wrappedOptions = {
    ...options,
    onSpawn(info) {
      const cancel = typeof info?.cancel === 'function' ? info.cancel : null;
      spawnedCancel = cancel;
      if (cancel && controller && typeof controller.setCurrentCancel === 'function') {
        controller.setCurrentCancel(cancel);
      }
      if (previousOnSpawn) {
        previousOnSpawn(info);
      }
    },
  };
  try {
    const result = await runShell(command, args, timeoutMs, cwdPath, wrappedOptions);
    throwIfAutomationCancelled(controller);
    return result;
  } finally {
    if (controller && typeof controller.clearCurrentCancel === 'function') {
      controller.clearCurrentCancel(spawnedCancel);
    }
  }
}

async function runCloudApiWithAutomationControl(payload, timeoutMs, controller, options = {}) {
  throwIfAutomationCancelled(controller);
  let spawnedCancel = null;
  let detachCancelListener = null;
  const previousOnSpawn = typeof options.onSpawn === 'function' ? options.onSpawn : null;
  const wrappedOptions = {
    ...options,
    timeoutMs,
    onSpawn(info) {
      const cancel = typeof info?.cancel === 'function' ? info.cancel : null;
      spawnedCancel = cancel;
      if (cancel && controller && typeof controller.setCurrentCancel === 'function') {
        controller.setCurrentCancel(cancel);
      }
      if (cancel && controller && typeof controller.onCancelRequest === 'function') {
        detachCancelListener = controller.onCancelRequest(() => {
          try {
            cancel();
          } catch (_error) {
            // no-op
          }
        });
      }
      if (previousOnSpawn) {
        previousOnSpawn(info);
      }
    },
  };
  try {
    const result = await runCloudApiTurn(payload, wrappedOptions);
    throwIfAutomationCancelled(controller);
    return result;
  } finally {
    if (typeof detachCancelListener === 'function') {
      try {
        detachCancelListener();
      } catch (_error) {
        // no-op
      }
    }
    if (controller && typeof controller.clearCurrentCancel === 'function') {
      controller.clearCurrentCancel(spawnedCancel);
    }
  }
}

async function waitWithAutomationControl(ms, controller) {
  const waitMs = Math.max(0, Math.min(10000, Number(ms || 0)));
  throwIfAutomationCancelled(controller);
  if (!controller || typeof controller.setWaitCancel !== 'function') {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return;
  }
  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = (fn) => {
      if (finished) {
        return;
      }
      finished = true;
      controller.clearWaitCancel(cancelWait);
      fn();
    };
    const timer = setTimeout(() => {
      finish(resolve);
    }, waitMs);
    const cancelWait = () => {
      clearTimeout(timer);
      finish(() => reject(new Error('Automation paused by user.')));
      return true;
    };
    controller.setWaitCancel(cancelWait);
  });
  throwIfAutomationCancelled(controller);
}

async function runAppleScript(lines, timeoutMs = 10000, options = {}) {
  const scriptLines = Array.isArray(lines) ? lines : [String(lines || '')];
  const args = [];
  for (const line of scriptLines) {
    args.push('-e', line);
  }
  return runShell('/usr/bin/osascript', args, timeoutMs, currentWorkdir, options);
}

async function ensureAutomationBinary() {
  try {
    const [srcStat, binStat] = await Promise.all([
      fs.stat(AUTOMATION_SWIFT_SOURCE),
      fs.stat(AUTOMATION_BIN_PATH).catch(() => null),
    ]);
    if (binStat && binStat.mtimeMs >= srcStat.mtimeMs) {
      return AUTOMATION_BIN_PATH;
    }
  } catch (_error) {
    // Build below.
  }

  await fs.mkdir(path.dirname(AUTOMATION_BIN_PATH), { recursive: true });
  await runShell(
    '/usr/bin/xcrun',
    ['swiftc', AUTOMATION_SWIFT_SOURCE, '-O', '-o', AUTOMATION_BIN_PATH],
    120000,
    PROJECT_ROOT
  );
  return AUTOMATION_BIN_PATH;
}

function parseBoundsCsv(text) {
  const parts = String(text || '')
    .trim()
    .split(',')
    .map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [x, y, width, height] = parts;
  if (width < 120 || height < 120) {
    return null;
  }
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

async function getFrontWindowContext(controller = null) {
  try {
    const result = await runAppleScript(
      [
        'tell application "System Events"',
        '  try',
        '    set frontProc to first application process whose frontmost is true',
        '    set appName to name of frontProc',
        '    set winTitle to ""',
        '    set boundsText to ""',
        '    if (count of windows of frontProc) > 0 then',
        '      set frontWin to front window of frontProc',
        '      set winTitle to name of frontWin',
        '      set p to position of frontWin',
        '      set s to size of frontWin',
        '      set boundsText to (item 1 of p as string) & "," & (item 2 of p as string) & "," & (item 1 of s as string) & "," & (item 2 of s as string)',
        '    end if',
        '    return appName & "\\n" & winTitle & "\\n" & boundsText',
        '  on error',
        '    return ""',
        '  end try',
        'end tell',
      ],
      10000,
      withAutomationCancelOptions(controller)
    );
    const lines = String(result.stdout || '')
      .split(/\r?\n/)
      .map((x) => x.trim());
    return {
      appName: lines[0] || '',
      windowTitle: lines[1] || '',
      bounds: parseBoundsCsv(lines[2] || ''),
    };
  } catch (_error) {
    return {
      appName: '',
      windowTitle: '',
      bounds: null,
    };
  }
}

function buildFrameSignatureFromNativeImage(image) {
  if (!image || typeof image.isEmpty !== 'function' || image.isEmpty()) {
    return null;
  }
  const size = image.getSize();
  const width = Number(size.width || 0);
  const height = Number(size.height || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }
  const bitmap = image.toBitmap();
  if (!bitmap || bitmap.length < width * height * 4) {
    return null;
  }

  const cols = 24;
  const rows = 14;
  const vector = new Uint8Array(cols * rows);
  let idx = 0;
  for (let ry = 0; ry < rows; ry += 1) {
    const py = Math.min(height - 1, Math.round(((ry + 0.5) / rows) * height));
    for (let rx = 0; rx < cols; rx += 1) {
      const px = Math.min(width - 1, Math.round(((rx + 0.5) / cols) * width));
      const off = (py * width + px) * 4;
      const b = bitmap[off];
      const g = bitmap[off + 1];
      const r = bitmap[off + 2];
      const luminance = Math.max(0, Math.min(255, Math.round((r * 30 + g * 59 + b * 11) / 100)));
      vector[idx] = luminance;
      idx += 1;
    }
  }
  return {
    cols,
    rows,
    vector,
  };
}

function compareFrameSignatures(previousSignature, currentSignature) {
  if (!previousSignature || !currentSignature) {
    return {
      distance: 1,
      changedRatio: 1,
      changedCells: 0,
      totalCells: 0,
    };
  }
  const prev = previousSignature.vector;
  const curr = currentSignature.vector;
  if (!prev || !curr || prev.length === 0 || prev.length !== curr.length) {
    return {
      distance: 1,
      changedRatio: 1,
      changedCells: 0,
      totalCells: 0,
    };
  }

  let sumAbs = 0;
  let changedCells = 0;
  const totalCells = prev.length;
  for (let i = 0; i < totalCells; i += 1) {
    const diff = Math.abs(Number(curr[i] || 0) - Number(prev[i] || 0));
    sumAbs += diff;
    if (diff >= 22) {
      changedCells += 1;
    }
  }
  return {
    distance: sumAbs / (totalCells * 255),
    changedRatio: changedCells / totalCells,
    changedCells,
    totalCells,
  };
}

async function captureScreenFrameInMemory(controller = null) {
  const context = await getFrontWindowContext(controller);
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  let targetDisplay = primaryDisplay;
  if (context.bounds) {
    const centerPoint = {
      x: Math.round(Number(context.bounds.x || 0) + Number(context.bounds.width || 0) / 2),
      y: Math.round(Number(context.bounds.y || 0) + Number(context.bounds.height || 0) / 2),
    };
    targetDisplay = screen.getDisplayNearestPoint(centerPoint) || primaryDisplay;
  } else if (allDisplays.length > 0) {
    targetDisplay = allDisplays[0];
  }

  const captureWidth = Math.max(640, Math.round(Number(targetDisplay?.size?.width || 0) || 1440));
  const captureHeight = Math.max(480, Math.round(Number(targetDisplay?.size?.height || 0) || 900));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    fetchWindowIcons: false,
    thumbnailSize: {
      width: captureWidth,
      height: captureHeight,
    },
  });
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('No screen source available for live watch.');
  }

  const targetDisplayId = String(targetDisplay?.id || '');
  let source = sources.find((item) => String(item?.display_id || '') === targetDisplayId);
  if (!source) {
    source = sources[0];
  }
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Screen capture thumbnail is empty.');
  }

  let image = source.thumbnail;
  let scope = 'full';
  let usedBounds = null;

  const allowWindowScope = AUTOMATION_CAPTURE_SCOPE === 'window';
  if (allowWindowScope && context.bounds && targetDisplay && targetDisplay.bounds) {
    const imageSize = image.getSize();
    const displayBounds = targetDisplay.bounds;
    const displayWidthPoints = Math.max(1, Number(displayBounds.width || 0));
    const displayHeightPoints = Math.max(1, Number(displayBounds.height || 0));
    const scaleX = imageSize.width / displayWidthPoints;
    const scaleY = imageSize.height / displayHeightPoints;

    const localX = Number(context.bounds.x || 0) - Number(displayBounds.x || 0);
    const localY = Number(context.bounds.y || 0) - Number(displayBounds.y || 0);
    const localW = Number(context.bounds.width || 0);
    const localH = Number(context.bounds.height || 0);

    if (localW > 40 && localH > 40) {
      const rawCropX = Math.round(localX * scaleX);
      const rawCropY = Math.round(localY * scaleY);
      const rawCropW = Math.round(localW * scaleX);
      const rawCropH = Math.round(localH * scaleY);
      const cropX = Math.max(0, Math.min(imageSize.width - 1, rawCropX));
      const cropY = Math.max(0, Math.min(imageSize.height - 1, rawCropY));
      const cropMaxW = Math.max(1, imageSize.width - cropX);
      const cropMaxH = Math.max(1, imageSize.height - cropY);
      const cropW = Math.max(1, Math.min(cropMaxW, rawCropW));
      const cropH = Math.max(1, Math.min(cropMaxH, rawCropH));
      if (cropW > 20 && cropH > 20) {
        try {
          image = image.crop({
            x: cropX,
            y: cropY,
            width: cropW,
            height: cropH,
          });
          scope = 'window';
          usedBounds = context.bounds;
        } catch (_error) {
          // Ignore crop failure and fallback to full screen frame.
        }
      }
    }
  }

  const signature = buildFrameSignatureFromNativeImage(image);
  const png = image.toPNG();
  const finalSize = image.getSize();
  return {
    data: png,
    mime: 'image/png',
    signature,
    scope,
    appName: context.appName || '',
    windowTitle: context.windowTitle || '',
    bounds: usedBounds,
    pixelWidth: Number(finalSize.width || 0),
    pixelHeight: Number(finalSize.height || 0),
  };
}

function decodeImageBitmapFromBuffer(rawData) {
  if (!rawData || (!Buffer.isBuffer(rawData) && !(rawData instanceof Uint8Array))) {
    return null;
  }
  const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  if (!data || data.length === 0) {
    return null;
  }
  let image;
  try {
    image = nativeImage.createFromBuffer(data);
  } catch (_error) {
    return null;
  }
  if (!image || image.isEmpty()) {
    return null;
  }
  const size = image.getSize();
  const width = Number(size.width || 0);
  const height = Number(size.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const bitmap = image.toBitmap();
  if (!bitmap || bitmap.length < width * height * 4) {
    return null;
  }
  return {
    width,
    height,
    bitmap,
  };
}

async function detectUnreadBadgeCandidate({ screenshotPath = '', captureInfo = null, controller = null }) {
  throwIfAutomationCancelled(controller);

  let decoded = null;
  if (captureInfo && captureInfo.data) {
    decoded = decodeImageBitmapFromBuffer(captureInfo.data);
  }
  if (!decoded && screenshotPath) {
    try {
      const data = await fs.readFile(screenshotPath);
      decoded = decodeImageBitmapFromBuffer(data);
    } catch (_error) {
      decoded = null;
    }
  }
  if (!decoded) {
    return null;
  }

  const width = Number(decoded.width);
  const height = Number(decoded.height);
  const bitmap = decoded.bitmap;

  const isWindowScope = captureInfo?.scope === 'window';
  const leftRatio = isWindowScope ? 0.38 : 0.34;
  const topPadPx = Math.round(Math.max(38, Math.min(130, height * (isWindowScope ? 0.08 : 0.06))));
  const bottomPadPx = Math.round(Math.max(10, Math.min(70, height * 0.03)));
  const x0 = Math.max(0, Math.min(width - 1, Math.round(width * 0.006)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.round(width * leftRatio)));
  const y0 = Math.max(0, Math.min(height - 1, topPadPx));
  const y1 = Math.max(y0 + 1, Math.min(height, height - bottomPadPx));

  const visited = new Uint8Array(width * height);
  const candidates = [];
  const queueX = [];
  const queueY = [];

  const isRed = (r, g, b) => r >= 145 && g <= 150 && b <= 150 && r - Math.max(g, b) >= 25 && r - g >= 10;
  const isWhite = (r, g, b) => r >= 200 && g >= 200 && b >= 200;
  const indexOf = (x, y) => y * width + x;
  const rgbaOffset = (x, y) => (y * width + x) * 4;

  for (let y = y0; y < y1; y += 1) {
    throwIfAutomationCancelled(controller);
    for (let x = x0; x < x1; x += 1) {
      const idx = indexOf(x, y);
      if (visited[idx]) {
        continue;
      }
      const off = rgbaOffset(x, y);
      const b = bitmap[off];
      const g = bitmap[off + 1];
      const r = bitmap[off + 2];
      if (!isRed(r, g, b)) {
        continue;
      }

      let head = 0;
      queueX.length = 0;
      queueY.length = 0;
      queueX.push(x);
      queueY.push(y);
      visited[idx] = 1;

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < queueX.length) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;

        area += 1;
        sumX += cx;
        sumY += cy;
        if (cx < minX) {
          minX = cx;
        }
        if (cx > maxX) {
          maxX = cx;
        }
        if (cy < minY) {
          minY = cy;
        }
        if (cy > maxY) {
          maxY = cy;
        }

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) {
            continue;
          }
          const nIdx = indexOf(nx, ny);
          if (visited[nIdx]) {
            continue;
          }
          const nOff = rgbaOffset(nx, ny);
          const nb = bitmap[nOff];
          const ng = bitmap[nOff + 1];
          const nr = bitmap[nOff + 2];
          if (!isRed(nr, ng, nb)) {
            continue;
          }
          visited[nIdx] = 1;
          queueX.push(nx);
          queueY.push(ny);
        }
      }

      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      if (area < 12 || area > 4200) {
        continue;
      }
      if (boxW < 4 || boxH < 4 || boxW > 128 || boxH > 128) {
        continue;
      }
      const fillRatio = area / (boxW * boxH);
      if (fillRatio < 0.18) {
        continue;
      }
      const aspect = Math.min(boxW, boxH) / Math.max(boxW, boxH);
      if (aspect < 0.28) {
        continue;
      }

      const sampleStep = boxW * boxH <= 5000 ? 1 : 2;
      let whitePixels = 0;
      let sampled = 0;
      for (let sy = minY; sy <= maxY; sy += sampleStep) {
        for (let sx = minX; sx <= maxX; sx += sampleStep) {
          sampled += 1;
          const sOff = rgbaOffset(sx, sy);
          const sb = bitmap[sOff];
          const sg = bitmap[sOff + 1];
          const sr = bitmap[sOff + 2];
          if (isWhite(sr, sg, sb)) {
            whitePixels += 1;
          }
        }
      }

      candidates.push({
        x: Math.round(sumX / area),
        y: Math.round(sumY / area),
        area,
        bbox: [minX, minY, boxW, boxH],
        whiteRatio: whitePixels / Math.max(1, sampled),
        boxW,
        boxH,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const idealX = Math.round(width * (isWindowScope ? 0.11 : 0.08));
  const minListY = Math.round(height * (isWindowScope ? 0.1 : 0.08));
  for (const candidate of candidates) {
    const relX = candidate.x / Math.max(1, width);
    const relY = candidate.y / Math.max(1, height);
    const xDistance = Math.abs(candidate.x - idealX);
    const shape = Math.min(candidate.boxW, candidate.boxH) / Math.max(candidate.boxW, candidate.boxH);
    let score = 0;
    score += Math.max(0, 120 - xDistance * 0.9);
    if (relX >= 0.02 && relX <= 0.24) {
      score += 60;
    }
    if (candidate.y >= minListY) {
      score += 60;
    } else {
      score -= Math.min(120, (minListY - candidate.y) * 1.4);
    }
    if (candidate.whiteRatio >= 0.03 && candidate.whiteRatio <= 0.75) {
      score += 30;
    }
    if (candidate.area >= 20 && candidate.area <= 1800) {
      score += 35;
    } else if (candidate.area <= 2600) {
      score += 10;
    } else {
      score -= 15;
    }
    score += shape * 24;
    if (candidate.minX <= x0 + 2 || candidate.maxX >= x1 - 3) {
      score -= 25;
    }
    if (candidate.minY <= y0 + 2) {
      score -= 20;
    }
    if (relY > 0.9) {
      score -= 15;
    }
    candidate.score = score;
  }

  candidates.sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (Math.abs(scoreDiff) > 0.001) {
      return scoreDiff;
    }
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    return b.area - a.area;
  });

  const best = candidates[0];
  return {
    x: best.x,
    y: best.y,
    area: Number(best.area || 0),
    count: candidates.length,
    bbox: Array.isArray(best.bbox) ? best.bbox : null,
    score: Number.isFinite(best.score) ? Math.round(best.score * 100) / 100 : null,
  };
}

function computeUnreadRowClickPoint(candidate, captureInfo = null, extraShift = 0) {
  const baseX = Number(candidate?.x || 0);
  const baseY = Number(candidate?.y || 0);
  const imageWidth = Number(captureInfo?.pixelWidth || 0);
  const panelMaxX = imageWidth > 0 ? Math.round(imageWidth * 0.34) : Math.round(baseX + 220);
  const preferredRowX = imageWidth > 0 ? Math.round(imageWidth * 0.16) : Math.round(baseX + 96);
  const shift = Math.max(56, Math.round((imageWidth > 0 ? imageWidth : 1100) * 0.08)) + Math.max(0, extraShift);
  const shiftedX = baseX + shift;
  const x = Math.min(panelMaxX, Math.max(preferredRowX, shiftedX));
  return {
    x: Math.max(6, Math.round(x)),
    y: Math.max(6, Math.round(baseY)),
  };
}

function remapClickPointFromCapture(point, captureInfo) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return {
      x,
      y,
      mapped: false,
      reason: 'invalid point',
      scaleX: 1,
      scaleY: 1,
    };
  }

  const bounds = captureInfo?.bounds;
  if (!bounds || captureInfo?.scope !== 'window') {
    return {
      x,
      y,
      mapped: false,
      reason: 'no window bounds',
      scaleX: 1,
      scaleY: 1,
    };
  }

  const imageWidth = Number(captureInfo?.pixelWidth || 0);
  const imageHeight = Number(captureInfo?.pixelHeight || 0);
  const boundsWidth = Number(bounds.width || 0);
  const boundsHeight = Number(bounds.height || 0);

  const relativeByImage =
    imageWidth > 0 &&
    imageHeight > 0 &&
    x >= -2 &&
    y >= -2 &&
    x <= imageWidth + 2 &&
    y <= imageHeight + 2;
  const relativeByBounds =
    boundsWidth > 0 &&
    boundsHeight > 0 &&
    x >= -2 &&
    y >= -2 &&
    x <= boundsWidth + 2 &&
    y <= boundsHeight + 2;

  const likelyRelative = relativeByImage || relativeByBounds;
  if (!likelyRelative) {
    return {
      x,
      y,
      mapped: false,
      reason: 'already absolute',
      scaleX: 1,
      scaleY: 1,
    };
  }

  const scaleX = imageWidth > 0 ? boundsWidth / imageWidth : 1;
  const scaleY = imageHeight > 0 ? boundsHeight / imageHeight : 1;
  const mappedX = Number(bounds.x || 0) + x * scaleX;
  const mappedY = Number(bounds.y || 0) + y * scaleY;
  return {
    x: mappedX,
    y: mappedY,
    mapped: true,
    reason: 'capture-relative',
    scaleX,
    scaleY,
  };
}

function normalizeAutomationPlan(rawPlan) {
  const plan = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
  const actionsRaw = Array.isArray(plan.actions) ? plan.actions : [];
  const actions = actionsRaw
    .map((item) => (item && typeof item === 'object' ? item : {}))
    .map((item) => ({
      action: String(item.action || '').trim().toLowerCase(),
      reason: typeof item.reason === 'string' ? item.reason : '',
      app: typeof item.app === 'string' ? item.app : '',
      text: typeof item.text === 'string' ? item.text : '',
      keys: typeof item.keys === 'string' ? item.keys : '',
      x: Number(item.x),
      y: Number(item.y),
      ms: Number(item.ms || item.wait_ms || 0),
    }))
    .filter((item) => item.action);

  return {
    goal: typeof plan.goal === 'string' ? plan.goal : '',
    analysis: typeof plan.analysis === 'string' ? plan.analysis : '',
    actions,
  };
}

function deriveAutomationFinalAnswer(goal, plan, logs) {
  const doneLog = logs.find((log) => log.action === 'done' && typeof log.reason === 'string' && log.reason.trim());
  if (doneLog) {
    return doneLog.reason.trim();
  }

  const failedLog = logs.find((log) => !log.ok);
  if (failedLog) {
    return `Failed at step #${failedLog.index} (${failedLog.action}): ${failedLog.detail}`;
  }

  const meaningfulDetail = logs.find(
    (log) => typeof log.detail === 'string' && log.detail.trim() && !/^marked as done\.?$/i.test(log.detail.trim())
  );
  if (meaningfulDetail) {
    return meaningfulDetail.detail.trim();
  }

  const analysis = String(plan?.analysis || '').trim();
  if (analysis) {
    return analysis;
  }

  return `Automation finished for goal: ${goal}`;
}

function buildAutomationHistoryText(historyLogs, maxItems = 8) {
  const logs = Array.isArray(historyLogs) ? historyLogs : [];
  if (logs.length === 0) {
    return 'No previous actions.';
  }
  return logs
    .slice(-maxItems)
    .map((log) => {
      const idx = Number(log?.index || 0);
      const action = String(log?.action || '').trim() || 'unknown';
      const ok = Boolean(log?.ok);
      const detail = String(log?.detail || '').trim();
      const reason = String(log?.reason || '').trim();
      return `#${idx} ${action} ${ok ? 'OK' : 'FAIL'}${reason ? ` | reason=${reason}` : ''}${detail ? ` | detail=${detail}` : ''}`;
    })
    .join('\n');
}

function buildAutomationExecutionSummary(goal, logs, completed) {
  const historyText = buildAutomationHistoryText(logs, 20);
  return [
    `Goal: ${goal}`,
    `Completed: ${completed ? 'yes' : 'no'}`,
    'Executed steps:',
    historyText,
  ].join('\n');
}

function buildInMemoryImageAttachment(captureInfo, fallbackName = 'screen.png') {
  if (!captureInfo || !captureInfo.data) {
    return null;
  }
  let buffer = null;
  if (Buffer.isBuffer(captureInfo.data)) {
    buffer = captureInfo.data;
  } else if (captureInfo.data instanceof Uint8Array) {
    buffer = Buffer.from(captureInfo.data);
  }
  if (!buffer || buffer.length === 0) {
    return null;
  }
  const mime = guessImageMimeType('', captureInfo.mime || 'image/png');
  return {
    name: fallbackName,
    mime,
    size: Number(buffer.length || 0),
    inlineData: buffer.toString('base64'),
  };
}

async function summarizeAutomationResult({ goal, provider, logs, completed, fallbackAnswer, captureInfo, controller }) {
  throwIfAutomationCancelled(controller);
  const executionSummary = buildAutomationExecutionSummary(goal, logs, completed);
  const scope = String(captureInfo?.scope || '').trim() || 'full';
  const width = Number(captureInfo?.pixelWidth || 0);
  const height = Number(captureInfo?.pixelHeight || 0);
  const imageAttachment = buildInMemoryImageAttachment(captureInfo, 'automation-final.png');
  const imageAttachedToModel = currentRuntimeMode === 'api' && Boolean(imageAttachment);
  const prompt = [
    'You are producing the final user-facing result for a desktop automation run.',
    '',
    executionSummary,
    '',
    `Final frame source: in-memory (${scope}${width > 0 && height > 0 ? `, ${width}x${height}` : ''}).`,
    `Final frame attached to model: ${imageAttachedToModel ? 'yes' : 'no'}.`,
    'Return ONLY the final answer text for the user.',
    '- If completed, provide the requested result directly.',
    '- If not completed, clearly state what is done and what remains.',
    '- Be specific and concise, max 3 sentences.',
    '- No markdown.',
  ].join('\n');

  if (currentRuntimeMode === 'api') {
    const result = await runCloudApiWithAutomationControl(
      {
        text: prompt,
        attachments: imageAttachment ? [imageAttachment] : [],
      },
      AUTOMATION_PLAN_TIMEOUT_MS,
      controller
    );
    const text = String(result?.text || '').trim();
    return text || fallbackAnswer;
  }

  if (provider === 'claude') {
    const claudeBin = await getProviderCommand('claude');
    const args = ['-p', '--output-format=json'];
    const permissionMode = getClaudePermissionMode({ automation: true });
    if (permissionMode) {
      args.push('--permission-mode', permissionMode);
    }
    if (CLAUDE_TOOLS.trim()) {
      args.push(`--tools=${CLAUDE_TOOLS}`);
    }
    if (CLAUDE_MODEL) {
      args.push('--model', CLAUDE_MODEL);
    }
    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }
    args.push(prompt);
    const result = await runShellWithAutomationControl(
      claudeBin,
      args,
      AUTOMATION_PLAN_TIMEOUT_MS,
      currentWorkdir,
      controller
    );
    const parsed = parseClaudeJson(result.stdout);
    if (parsed.sessionId) {
      claudeSessionId = parsed.sessionId;
    }
    const text = String(parsed.text || '').trim();
    return text || fallbackAnswer;
  }

  const codexBin = await getProviderCommand('codex');
  const baseArgs = ['--skip-git-repo-check', '--json'];
  if (CODEX_MODEL) {
    baseArgs.push('--model', CODEX_MODEL);
  }
  let args;
  if (codexThreadId) {
    args = ['exec', 'resume', ...baseArgs, codexThreadId, prompt];
  } else {
    args = ['exec', ...baseArgs, '-C', currentWorkdir, prompt];
  }
  const result = await runShellWithAutomationControl(
    codexBin,
    args,
    AUTOMATION_PLAN_TIMEOUT_MS,
    currentWorkdir,
    controller
  );
  const parsed = parseCodexJsonl(result.stdout);
  if (parsed.threadId) {
    codexThreadId = parsed.threadId;
  }
  const text = String(parsed.text || '').trim();
  return text || fallbackAnswer;
}

async function runAutomationGoalViaClaudeMcp(payload, notify = () => {}, controller = null) {
  const goal = String(payload?.goal || '').trim();
  if (!goal) {
    throw new Error('Automation goal is empty.');
  }
  if (CLAUDE_MCP_CONFIGS.length === 0) {
    throw new Error('CLAUDE_MCP_CONFIG is not set. Cannot run MCP automation.');
  }
  await assertClaudeMcpConfigsReady();

  throwIfAutomationCancelled(controller);
  const provider = 'claude';
  notify({
    phase: 'start',
    goal,
    provider,
    mode: 'mcp',
  });
  notify({
    phase: 'planning',
    provider,
    mode: 'mcp',
  });

  let frontContext = await getFrontWindowContext(controller);
  const target = inferAutomationTarget(goal, frontContext);
  notify({
    phase: 'planning_target',
    provider,
    mode: 'mcp',
    frontApp: target.frontApp || '',
    frontWindow: target.frontWindow || '',
    targetApp: target.app || '',
    reason: target.reason || '',
    webGoal: Boolean(target.webGoal),
  });

  if (!target.webGoal && Array.isArray(target.candidates) && target.candidates.length > 0) {
    const activated = await activateTargetApp(target, controller);
    if (activated.ok) {
      frontContext = await getFrontWindowContext(controller);
      notify({
        phase: 'planning_target',
        provider,
        mode: 'mcp',
        frontApp: String(frontContext?.appName || '').trim(),
        frontWindow: String(frontContext?.windowTitle || '').trim(),
        targetApp: activated.app,
        reason: 'Target app activated before MCP run.',
        webGoal: Boolean(target.webGoal),
      });
    }
  }

  const frontAppName = String(frontContext?.appName || '').trim() || 'unknown';
  const frontWindowTitle = String(frontContext?.windowTitle || '').trim() || 'unknown';
  const targetAppName = String(target.app || '').trim();
  const targetCandidates = Array.isArray(target.candidates) ? target.candidates.filter(Boolean) : [];
  const targetCandidatesText = targetCandidates.length > 0 ? targetCandidates.join(' | ') : 'none';

  const prompt = [
    'You are controlling macOS via MCP tools.',
    `Goal: ${goal}`,
    '',
    'Window targeting (critical):',
    `- Current front app: ${frontAppName}`,
    `- Current front window: ${frontWindowTitle}`,
    `- Target app hint: ${targetAppName || 'none'}`,
    `- Target app aliases: ${targetCandidatesText}`,
    `- Goal likely web/browser task: ${target.webGoal ? 'yes' : 'no'}`,
    '- First lock target window before any click/type (activate app and verify it is frontmost).',
    '- If target app hint exists, ONLY operate that app/window unless user explicitly asks to switch.',
    '- If tools support app/window scope (app_name/window_id), always use scoped operations over full-screen operations.',
    '- Before each click, verify target text/element exists in the same target window via screenshot/OCR/find_text/find_image.',
    '- If verification fails twice, stop and return blocked instead of blind clicking.',
    '- Do NOT use browser/playwright tools unless goal explicitly requires web browsing.',
    '',
    'Execution rules:',
    '- Operate software directly via MCP tools when possible.',
    '- Continue until task is complete or blocked by missing permissions/data.',
    '- If blocked, still provide what has been completed and what is missing.',
    '',
    'Return JSON only:',
    '{',
    '  "completed": true,',
    '  "confidence": 0.9,',
    '  "target_app": "app name actually operated",',
    '  "summary": "final result for user",',
    '  "blocked_reason": "",',
    '  "steps": ["short step 1", "short step 2"]',
    '}',
  ].join('\n');

  const args = ['-p', '--output-format=json', '--strict-mcp-config', '--mcp-config', ...CLAUDE_MCP_CONFIGS];
  const permissionMode = getClaudePermissionMode({ automation: true });
  if (permissionMode) {
    args.push('--permission-mode', permissionMode);
  }
  if (CLAUDE_TOOLS.trim()) {
    args.push(`--tools=${CLAUDE_TOOLS}`);
  }
  if (CLAUDE_MODEL) {
    args.push('--model', CLAUDE_MODEL);
  }
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }
  args.push(prompt);

  const mcpTimeoutMs =
    Number.isFinite(AUTOMATION_MCP_TIMEOUT_MS) && AUTOMATION_MCP_TIMEOUT_MS > 0
      ? AUTOMATION_MCP_TIMEOUT_MS
      : Math.max(CLAUDE_TIMEOUT_MS, AUTOMATION_PLAN_TIMEOUT_MS);
  const planningStartedAt = Date.now();
  const heartbeat = setInterval(() => {
    notify({
      phase: 'planning',
      provider,
      mode: 'mcp',
      elapsedMs: Date.now() - planningStartedAt,
    });
  }, 1500);
  let result;
  try {
    const claudeBin = await getProviderCommand('claude');
    result = await runShellWithAutomationControl(claudeBin, args, mcpTimeoutMs, currentWorkdir, controller);
  } finally {
    clearInterval(heartbeat);
  }
  const parsed = parseClaudeJson(result.stdout);
  if (parsed.sessionId) {
    claudeSessionId = parsed.sessionId;
  }
  const permissionDenials = Array.isArray(parsed.permissionDenials) ? parsed.permissionDenials : [];
  if (permissionDenials.length > 0) {
    const deniedTools = permissionDenials
      .map((item) => String(item?.tool_name || '').trim())
      .filter(Boolean);
    const toolList = deniedTools.length > 0 ? deniedTools.join(', ') : `${permissionDenials.length} tool call(s)`;
    throw new Error(
      `Claude MCP permission denied for: ${toolList}. Try CLAUDE_AUTOMATION_PERMISSION_MODE=bypassPermissions.`
    );
  }

  let completed = false;
  let finalAnswer = String(parsed.text || '').trim();
  let steps = [];
  let confidence = null;
  let actualTargetApp = '';
  let blockedReason = '';

  try {
    const json = extractJsonFromText(parsed.text);
    if (json && typeof json === 'object') {
      completed = Boolean(json.completed);
      const conf = Number(json.confidence);
      confidence = Number.isFinite(conf) ? conf : null;
      if (typeof json.target_app === 'string' && json.target_app.trim()) {
        actualTargetApp = json.target_app.trim();
      }
      if (typeof json.summary === 'string' && json.summary.trim()) {
        finalAnswer = json.summary.trim();
      }
      if (typeof json.blocked_reason === 'string' && json.blocked_reason.trim()) {
        blockedReason = json.blocked_reason.trim();
      }
      if (Array.isArray(json.steps)) {
        steps = json.steps.map((s) => String(s || '').trim()).filter(Boolean);
      }
    }
  } catch (_error) {
    // fall back to raw text
  }

  if (!finalAnswer) {
    finalAnswer = completed ? 'Task completed.' : 'Task finished with incomplete result.';
  }
  if (confidence !== null && confidence < 0.7) {
    throw new Error(`MCP result confidence too low (${confidence}). ${blockedReason || 'Window targeting may be unreliable.'}`);
  }
  if (targetAppName && actualTargetApp && targetCandidates.length > 0) {
    const matched = targetCandidates.some((candidate) => actualTargetApp.toLowerCase().includes(candidate.toLowerCase()));
    if (!matched) {
      throw new Error(
        `MCP operated unexpected app (${actualTargetApp}), expected one of: ${targetCandidates.join(', ')}.`
      );
    }
  }
  throwIfAutomationCancelled(controller);

  const logs =
    steps.length > 0
      ? steps.map((s, i) => ({
          index: i + 1,
          action: 'mcp',
          reason: '',
          ok: true,
          detail: s,
        }))
      : [
          {
            index: 1,
            action: completed ? 'done' : 'mcp',
            reason: '',
            ok: completed,
            detail: finalAnswer,
          },
        ];

  notify({
    phase: 'done',
    executed: logs.length,
    totalPlanned: null,
    failed: !completed,
  });
  notify({ phase: 'finalizing' });
  notify({
    phase: 'result',
    finalAnswer,
  });

  return {
    goal,
    provider,
    screenshotPath: '',
    plan: { goal, analysis: 'MCP direct automation', actions: [] },
    plans: [],
    logs,
    finalAnswer,
    completed,
    mode: 'mcp',
  };
}

async function planAutomationSteps({ goal, provider, historyLogs = [], captureInfo = null, controller = null }) {
  const normalizedGoal = String(goal || '').trim();
  if (!normalizedGoal) {
    throw new Error('Automation goal is empty.');
  }
  throwIfAutomationCancelled(controller);
  const unreadGoal = isUnreadMessageGoal(normalizedGoal);
  const historyText = buildAutomationHistoryText(historyLogs);
  const appName = String(captureInfo?.appName || '').trim() || 'unknown';
  const windowTitle = String(captureInfo?.windowTitle || '').trim() || 'unknown';
  const scope = String(captureInfo?.scope || '').trim() || 'full';
  const pixelWidth = Number(captureInfo?.pixelWidth || 0);
  const pixelHeight = Number(captureInfo?.pixelHeight || 0);
  const imageAttachment = buildInMemoryImageAttachment(captureInfo, 'automation-frame.png');
  const imageAttachedToModel = currentRuntimeMode === 'api' && Boolean(imageAttachment);

  const prompt = [
    'You are a macOS UI automation planner.',
    `Goal: ${normalizedGoal}`,
    '',
    'Output JSON ONLY with this schema:',
    '{',
    '  "goal": "string",',
    '  "analysis": "short text",',
    '  "actions": [',
    '    {',
    '      "action": "open_app|activate_app|click|double_click|type_text|shortcut|wait|done",',
    '      "reason": "short reason",',
    '      "app": "App name (for open/activate)",',
    '      "x": 100,',
    '      "y": 200,',
    '      "text": "text to type",',
    '      "keys": "cmd+shift+p",',
    '      "ms": 500',
    '    }',
    '  ]',
    '}',
    '',
    'Previous executed actions:',
    historyText,
    '',
    `Front app: ${appName}`,
    `Front window: ${windowTitle}`,
    `Capture scope: ${scope}`,
    `Capture image available in memory: ${imageAttachment ? 'yes' : 'no'}`,
    `Capture image attached to model: ${imageAttachedToModel ? 'yes' : 'no'}`,
    pixelWidth > 0 && pixelHeight > 0 ? `Capture image size: ${pixelWidth}x${pixelHeight}` : '',
    `Unread task: ${unreadGoal ? 'yes' : 'no'}`,
    '',
    'Current screenshot source: in-memory only (no disk file path).',
    '',
    `Rules:`,
    `- Return 1 to ${AUTOMATION_PLAN_BATCH_STEPS} actions in actions[].`,
    '- Keep each action safe and deterministic.',
    '- Prefer short, safe plans.',
    '- If and only if goal is fully completed, return one action: {"action":"done","reason":"final answer for user"}',
    '- Do not mark done when information is uncertain; continue with the next best action.',
    '- For click/double_click, provide numeric x/y in CURRENT SCREENSHOT IMAGE coordinates (origin is top-left of this image).',
    '- For shortcut, provide keys like cmd+f or cmd+v.',
    '- Use click coordinates based on screenshot when possible.',
    unreadGoal
      ? '- This goal is about unread/new messages: click a conversation row with a red unread badge/dot first, not an already-selected read row.'
      : '',
    unreadGoal ? '- If any red unread badge/dot is visible in list, do not output done.' : '',
    unreadGoal ? '- Only output done after opening unread conversation(s) and summarizing message content requested by goal.' : '',
    '- No markdown, no prose outside JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  if (currentRuntimeMode === 'api') {
    const result = await runCloudApiWithAutomationControl(
      {
        text: prompt,
        attachments: imageAttachment ? [imageAttachment] : [],
      },
      AUTOMATION_PLAN_TIMEOUT_MS,
      controller
    );
    return normalizeAutomationPlan(extractJsonFromText(result.text));
  }

  if (provider === 'claude') {
    const claudeBin = await getProviderCommand('claude');
    const args = ['-p', '--output-format=json'];
    const permissionMode = getClaudePermissionMode({ automation: true });
    if (permissionMode) {
      args.push('--permission-mode', permissionMode);
    }
    if (CLAUDE_TOOLS.trim()) {
      args.push(`--tools=${CLAUDE_TOOLS}`);
    }
    if (CLAUDE_MODEL) {
      args.push('--model', CLAUDE_MODEL);
    }
    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }
    args.push(prompt);
    const result = await runShellWithAutomationControl(
      claudeBin,
      args,
      AUTOMATION_PLAN_TIMEOUT_MS,
      currentWorkdir,
      controller
    );
    const parsed = parseClaudeJson(result.stdout);
    if (parsed.sessionId) {
      claudeSessionId = parsed.sessionId;
    }
    return normalizeAutomationPlan(extractJsonFromText(parsed.text));
  }

  const codexBin = await getProviderCommand('codex');
  const baseArgs = ['--skip-git-repo-check', '--json'];
  if (CODEX_MODEL) {
    baseArgs.push('--model', CODEX_MODEL);
  }
  let args;
  if (codexThreadId) {
    args = ['exec', 'resume', ...baseArgs, codexThreadId, prompt];
  } else {
    args = ['exec', ...baseArgs, '-C', currentWorkdir, prompt];
  }
  const result = await runShellWithAutomationControl(
    codexBin,
    args,
    AUTOMATION_PLAN_TIMEOUT_MS,
    currentWorkdir,
    controller
  );
  const parsed = parseCodexJsonl(result.stdout);
  if (parsed.threadId) {
    codexThreadId = parsed.threadId;
  }
  return normalizeAutomationPlan(extractJsonFromText(parsed.text));
}

function normalizeShortcutSpec(spec) {
  const raw = String(spec || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    throw new Error('Shortcut keys is empty.');
  }
  const parts = raw
    .split('+')
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Shortcut keys is invalid.');
  }
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const modifierMap = {
    cmd: 'command down',
    command: 'command down',
    ctrl: 'control down',
    control: 'control down',
    shift: 'shift down',
    alt: 'option down',
    option: 'option down',
  };
  const mappedModifiers = modifiers.map((m) => modifierMap[m]).filter(Boolean);
  return { key, modifiers: mappedModifiers };
}

async function executeAutomationAction(step, runtimeContext = null) {
  const action = String(step?.action || '').trim().toLowerCase();
  if (!action) {
    return { ok: false, detail: 'Empty action.' };
  }
  const controller = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext.controller : null;
  throwIfAutomationCancelled(controller);

  if (action === 'done') {
    return { ok: true, detail: 'Marked as done.' };
  }

  if (action === 'wait') {
    const ms = Math.max(0, Math.min(10000, Number(step.ms || 500)));
    await waitWithAutomationControl(ms, controller);
    return { ok: true, detail: `Waited ${ms} ms.` };
  }

  if (action === 'open_app') {
    const appName = String(step.app || '').trim();
    if (!appName) {
      return { ok: false, detail: 'open_app missing app name.' };
    }
    await runShellWithAutomationControl('/usr/bin/open', ['-a', appName], 15000, currentWorkdir, controller);
    return { ok: true, detail: `Opened app: ${appName}` };
  }

  if (action === 'activate_app') {
    const appName = String(step.app || '').trim();
    if (!appName) {
      return { ok: false, detail: 'activate_app missing app name.' };
    }
    await runAppleScript(
      [`tell application "${appleScriptEscapeString(appName)}" to activate`],
      10000,
      withAutomationCancelOptions(controller)
    );
    return { ok: true, detail: `Activated app: ${appName}` };
  }

  if (action === 'type_text') {
    const text = String(step.text || '');
    if (!text) {
      return { ok: false, detail: 'type_text missing text.' };
    }
    const bin = await ensureAutomationBinary();
    await runShellWithAutomationControl(bin, ['type', text], 15000, currentWorkdir, controller);
    return { ok: true, detail: `Typed ${text.length} characters.` };
  }

  if (action === 'shortcut') {
    const { key, modifiers } = normalizeShortcutSpec(step.keys);
    const keyCodeMap = {
      enter: 36,
      return: 36,
      tab: 48,
      esc: 53,
      escape: 53,
      space: 49,
      up: 126,
      down: 125,
      left: 123,
      right: 124,
    };
    const modifierPart = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
    const keyCode = keyCodeMap[key];
    if (keyCode) {
      await runAppleScript(
        [`tell application "System Events" to key code ${keyCode}${modifierPart}`],
        10000,
        withAutomationCancelOptions(controller)
      );
    } else {
      const safeKey = key.length === 1 ? key : key.slice(0, 1);
      await runAppleScript(
        [`tell application "System Events" to keystroke "${appleScriptEscapeString(safeKey)}"${modifierPart}`],
        10000,
        withAutomationCancelOptions(controller)
      );
    }
    return { ok: true, detail: `Shortcut executed: ${step.keys}` };
  }

  if (action === 'click' || action === 'double_click') {
    const rawX = Number(step.x);
    const rawY = Number(step.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return { ok: false, detail: `${action} requires numeric x/y.` };
    }
    const mappedPoint = remapClickPointFromCapture(
      { x: rawX, y: rawY },
      runtimeContext && typeof runtimeContext === 'object' ? runtimeContext.captureInfo : null
    );
    const x = Number.isFinite(mappedPoint.x) ? mappedPoint.x : rawX;
    const y = Number.isFinite(mappedPoint.y) ? mappedPoint.y : rawY;
    const bin = await ensureAutomationBinary();
    const cmd = action === 'double_click' ? 'double-click' : 'click';
    await runShellWithAutomationControl(bin, [cmd, String(Math.round(x)), String(Math.round(y))], 15000, currentWorkdir, controller);
    const mappedDetail = mappedPoint.mapped
      ? ` from screenshot (${Math.round(rawX)}, ${Math.round(rawY)}) to screen (${Math.round(x)}, ${Math.round(y)})`
      : '';
    return { ok: true, detail: `${action} at (${Math.round(x)}, ${Math.round(y)}).${mappedDetail}` };
  }

  return { ok: false, detail: `Unsupported action: ${action}` };
}

async function runAutomationGoal(payload, notify = () => {}, controller = null) {
  const goal = String(payload?.goal || '').trim();
  if (!goal) {
    throw new Error('Automation goal is empty.');
  }
  throwIfAutomationCancelled(controller);

  const provider = normalizeProvider(payload?.provider || currentProvider);
  const unreadGoal = isUnreadMessageGoal(goal);
  const forceMcpOnly = AUTOMATION_ENGINE === 'mcp';
  if (shouldUseClaudeMcpAutomation(provider) && (!unreadGoal || forceMcpOnly)) {
    try {
      return await runAutomationGoalViaClaudeMcp(payload, notify, controller);
    } catch (error) {
      const message = String(error?.message || error);
      if (/paused by user/i.test(message) || AUTOMATION_ENGINE === 'mcp') {
        throw error;
      }
      notify({
        phase: 'mcp_fallback',
        error: message,
      });
    }
  }
  if (shouldUseClaudeMcpAutomation(provider) && unreadGoal && !forceMcpOnly) {
    notify({
      phase: 'mcp_fallback',
      error: 'Unread-message goal detected, use in-memory unread-badge detector for higher click precision.',
    });
  }
  notify({
    phase: 'start',
    goal,
    provider,
  });
  const logs = [];
  const plans = [];
  let lastCaptureInfo = null;
  let lastPlan = { goal, analysis: '', actions: [] };
  let stepIndex = 0;
  let done = false;
  let failed = false;
  let round = 0;
  let unreadHeuristicClicks = 0;
  while (true) {
    throwIfAutomationCancelled(controller);
    round += 1;
    notify({
      phase: 'capturing',
      round,
    });
    const captureInfo = await captureScreenFrameInMemory(controller);
    lastCaptureInfo = captureInfo;
    notify({
      phase: 'captured',
      round,
      screenshotPath: '',
      captureMode: 'memory',
      captureScope: captureInfo.scope,
      appName: captureInfo.appName,
      windowTitle: captureInfo.windowTitle,
      pixelWidth: captureInfo.pixelWidth,
      pixelHeight: captureInfo.pixelHeight,
    });

    const tryUnreadHeuristic =
      unreadGoal && unreadHeuristicClicks < AUTOMATION_UNREAD_MAX_CLICKS && isChatLikeAppContext(captureInfo);
    if (tryUnreadHeuristic) {
      notify({
        phase: 'unread_scan',
        round,
        status: 'scanning',
        attempts: unreadHeuristicClicks,
      });
      const unreadCandidate = await detectUnreadBadgeCandidate({
        captureInfo,
        controller,
      });
      if (unreadCandidate) {
        const rowPoint = computeUnreadRowClickPoint(unreadCandidate, captureInfo, 0);
        stepIndex += 1;
        notify({
          phase: 'unread_scan',
          round,
          status: 'found',
          x: unreadCandidate.x,
          y: unreadCandidate.y,
          rowX: rowPoint.x,
          rowY: rowPoint.y,
          count: unreadCandidate.count,
          area: unreadCandidate.area,
          score: unreadCandidate.score,
        });
        const unreadStep = {
          action: 'click',
          x: rowPoint.x,
          y: rowPoint.y,
          reason: 'Open unread conversation row by badge anchor',
        };
        notify({
          phase: 'step_start',
          index: stepIndex,
          round,
          action: 'click_unread_badge',
          reason: unreadStep.reason,
        });
        const result = await executeAutomationAction(unreadStep, { captureInfo, controller });
        notify({
          phase: 'step_done',
          index: stepIndex,
          round,
          action: 'click_unread_badge',
          ok: result.ok,
          detail: result.detail,
          reason: unreadStep.reason,
        });
        logs.push({
          index: stepIndex,
          action: 'click_unread_badge',
          reason: unreadStep.reason,
          ok: result.ok,
          detail: `${result.detail} detector_count=${unreadCandidate.count} detector_score=${String(
            unreadCandidate.score ?? ''
          )}`,
        });
        unreadHeuristicClicks += 1;
        if (!result.ok) {
          failed = true;
          break;
        }
        await waitWithAutomationControl(450, controller);

        const verifyCapture = await captureScreenFrameInMemory(controller);
        lastCaptureInfo = verifyCapture;
        const verifyCandidate = await detectUnreadBadgeCandidate({
          captureInfo: verifyCapture,
          controller,
        });
        const sameCandidateLikely =
          verifyCandidate &&
          Math.abs(Number(verifyCandidate.x || 0) - Number(unreadCandidate.x || 0)) <= 28 &&
          Math.abs(Number(verifyCandidate.y || 0) - Number(unreadCandidate.y || 0)) <= 18;
        if (sameCandidateLikely && unreadHeuristicClicks < AUTOMATION_UNREAD_MAX_CLICKS) {
          const retryPoint = computeUnreadRowClickPoint(unreadCandidate, captureInfo, 72);
          stepIndex += 1;
          const retryStep = {
            action: 'double_click',
            x: retryPoint.x,
            y: retryPoint.y,
            reason: 'Retry unread row focus (same unread badge remained)',
          };
          notify({
            phase: 'step_start',
            index: stepIndex,
            round,
            action: 'click_unread_retry',
            reason: retryStep.reason,
          });
          const retryResult = await executeAutomationAction(retryStep, { captureInfo, controller });
          notify({
            phase: 'step_done',
            index: stepIndex,
            round,
            action: 'click_unread_retry',
            ok: retryResult.ok,
            detail: retryResult.detail,
            reason: retryStep.reason,
          });
          logs.push({
            index: stepIndex,
            action: 'click_unread_retry',
            reason: retryStep.reason,
            ok: retryResult.ok,
            detail: retryResult.detail,
          });
          unreadHeuristicClicks += 1;
          if (!retryResult.ok) {
            failed = true;
            break;
          }
          await waitWithAutomationControl(350, controller);
        }
        continue;
      }
      notify({
        phase: 'unread_scan',
        round,
        status: 'none',
        attempts: unreadHeuristicClicks,
      });
    }

    notify({
      phase: 'planning',
      provider,
      round,
    });
    const plan = await planAutomationSteps({
      goal,
      provider,
      historyLogs: logs,
      captureInfo,
      controller,
    });
    lastPlan = plan;
    plans.push(plan);

    notify({
      phase: 'plan_ready',
      round,
      actionCount: plan.actions.length,
      analysis: plan.analysis || '',
    });

    if (plan.actions.length === 0) {
      failed = true;
      logs.push({
        index: stepIndex + 1,
        action: 'done',
        reason: '',
        ok: false,
        detail: 'Automation planner returned no actions.',
      });
      break;
    }

    const batch = plan.actions.slice(0, AUTOMATION_PLAN_BATCH_STEPS);
    for (const step of batch) {
      throwIfAutomationCancelled(controller);
      stepIndex += 1;
      notify({
        phase: 'step_start',
        index: stepIndex,
        round,
        action: step.action,
        reason: step.reason || '',
      });
      const result = await executeAutomationAction(step, { captureInfo, controller });
      notify({
        phase: 'step_done',
        index: stepIndex,
        round,
        action: step.action,
        ok: result.ok,
        detail: result.detail,
        reason: step.reason || '',
      });
      logs.push({
        index: stepIndex,
        action: step.action,
        reason: step.reason || '',
        ok: result.ok,
        detail: result.detail,
      });
      if (!result.ok) {
        failed = true;
        break;
      }
      if (step.action === 'done') {
        done = true;
        break;
      }
    }
    if (failed || done) {
      break;
    }
  }

  notify({
    phase: 'done',
    executed: logs.length,
    totalPlanned: null,
    failed,
  });

  const fallbackAnswer = deriveAutomationFinalAnswer(goal, lastPlan, logs);
  let finalAnswer = fallbackAnswer;
  notify({ phase: 'finalizing' });
  try {
    finalAnswer = await summarizeAutomationResult({
      goal,
      provider,
      logs,
      completed: done && !failed,
      fallbackAnswer,
      captureInfo: lastCaptureInfo,
      controller,
    });
  } catch (_error) {
    finalAnswer = fallbackAnswer;
  }
  notify({
    phase: 'result',
    finalAnswer,
  });

  return {
    goal,
    provider,
    screenshotPath: '',
    captureMode: 'memory',
    plan: lastPlan,
    plans,
    logs,
    finalAnswer,
    completed: done && !failed,
  };
}

function normalizeWorkdirPath(rawPath) {
  if (typeof rawPath !== 'string') {
    throw new Error('Workdir must be a string.');
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error('Workdir cannot be empty.');
  }

  let expanded = trimmed;
  const home = os.homedir();
  if (expanded === '~') {
    expanded = home;
  } else if (expanded.startsWith('~/')) {
    expanded = path.join(home, expanded.slice(2));
  }

  return path.resolve(currentWorkdir, expanded);
}

async function validateWorkdirPath(workdirPath) {
  const stat = await fs.stat(workdirPath);
  if (!stat.isDirectory()) {
    throw new Error('Workdir must be a directory.');
  }
}

async function extractTextFromFile(filePath, fileName, mime, maxChars = MAX_TEXT_CHARS) {
  const name = fileName || safeBasename(filePath);

  if (!filePath) {
    return `[Attached file: ${name}]`;
  }

  if (!isLikelyText(filePath, mime)) {
    const stat = await fs.stat(filePath);
    return `[Attached file: ${name} (${prettyBytes(stat.size)}, ${mime || 'unknown'}). Binary content is not inlined.]`;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const clipped = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n[...truncated ${raw.length - maxChars} chars]` : raw;

  return `Attached text file: ${name}\n\n${clipped}`;
}

async function buildCliPrompt(payload, provider) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  const parts = [];
  if (text) {
    parts.push(text);
  }

  const imagePaths = [];

  for (const item of attachments) {
    const filePath = typeof item?.path === 'string' ? item.path : '';
    const fileName = typeof item?.name === 'string' ? item.name : safeBasename(filePath);
    const mime = typeof item?.mime === 'string' ? item.mime : '';
    const size = Number(item?.size || 0);

    if (!filePath) {
      parts.push(`[Attachment metadata only: ${fileName} (${prettyBytes(size)}, ${mime || 'unknown'})]`);
      continue;
    }

    if (isLikelyImage(filePath, mime)) {
      if (provider === 'codex') {
        imagePaths.push(filePath);
        parts.push(`[Attached image: ${fileName}]`);
      } else {
        parts.push(`[Attached image metadata: ${fileName} (${prettyBytes(size)}), path: ${filePath}]`);
      }
      continue;
    }

    if (mime.startsWith('audio/')) {
      parts.push(`[Attached audio file: ${fileName} (${prettyBytes(size)}). Please ask user to use Voice button (speech-to-text) for transcript.]`);
      continue;
    }

    try {
      const extracted = await extractTextFromFile(filePath, fileName, mime, MAX_TEXT_CHARS);
      parts.push(extracted);
    } catch (error) {
      parts.push(`[Attached file unreadable: ${fileName}. ${String(error?.message || error)}]`);
    }
  }

  if (parts.length === 0) {
    parts.push('Hello');
  }

  return {
    prompt: parts.join('\n\n'),
    imagePaths,
  };
}

function guessImageMimeType(filePath, fallbackMime = '') {
  const mime = String(fallbackMime || '').trim().toLowerCase();
  if (mime.startsWith('image/')) {
    return mime;
  }
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  if (ext === '.gif') {
    return 'image/gif';
  }
  if (ext === '.bmp') {
    return 'image/bmp';
  }
  if (ext === '.tiff' || ext === '.tif') {
    return 'image/tiff';
  }
  return 'image/png';
}

function guessAudioMimeType(filePath, fallbackMime = '') {
  const mime = String(fallbackMime || '').trim().toLowerCase();
  if (mime.startsWith('audio/')) {
    return mime;
  }
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.webm') {
    return 'audio/webm';
  }
  if (ext === '.mp3') {
    return 'audio/mpeg';
  }
  if (ext === '.wav') {
    return 'audio/wav';
  }
  if (ext === '.ogg' || ext === '.oga') {
    return 'audio/ogg';
  }
  if (ext === '.m4a' || ext === '.aac' || ext === '.mp4') {
    return 'audio/mp4';
  }
  return 'audio/webm';
}

async function buildCloudApiUserContent(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  const content = [];

  if (text) {
    content.push({
      type: 'text',
      text,
    });
  }

  for (const item of attachments) {
    const filePath = typeof item?.path === 'string' ? item.path : '';
    const fileName = typeof item?.name === 'string' ? item.name : safeBasename(filePath);
    const mime = typeof item?.mime === 'string' ? item.mime : '';
    const size = Number(item?.size || 0);
    const inlineData = typeof item?.inlineData === 'string' ? item.inlineData.trim() : '';

    if (inlineData && (mime.startsWith('image/') || !filePath)) {
      const estimatedBytes = Math.max(0, Math.floor((inlineData.length * 3) / 4));
      if (estimatedBytes > CLOUD_API_IMAGE_MAX_BYTES) {
        content.push({
          type: 'text',
          text: `[Attached image too large for inline API payload: ${fileName || 'inline-image'} (${prettyBytes(
            estimatedBytes
          )}).]`,
        });
        continue;
      }
      const mimeType = guessImageMimeType(filePath, mime);
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${inlineData}`,
        },
      });
      content.push({
        type: 'text',
        text: `[Attached image: ${fileName || 'inline-image'}]`,
      });
      continue;
    }

    if (!filePath) {
      content.push({
        type: 'text',
        text: `[Attachment metadata only: ${fileName} (${prettyBytes(size)}, ${mime || 'unknown'})]`,
      });
      continue;
    }

    if (isLikelyImage(filePath, mime)) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > CLOUD_API_IMAGE_MAX_BYTES) {
          content.push({
            type: 'text',
            text: `[Attached image too large for inline API payload: ${fileName} (${prettyBytes(stat.size)}).]`,
          });
          continue;
        }
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');
        const mimeType = guessImageMimeType(filePath, mime);
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
          },
        });
        content.push({
          type: 'text',
          text: `[Attached image: ${fileName}]`,
        });
      } catch (error) {
        content.push({
          type: 'text',
          text: `[Attached image unreadable: ${fileName}. ${String(error?.message || error)}]`,
        });
      }
      continue;
    }

    if (mime.startsWith('audio/')) {
      content.push({
        type: 'text',
        text: `[Attached audio file: ${fileName} (${prettyBytes(size)}). Please use Voice button for speech-to-text input.]`,
      });
      continue;
    }

    try {
      const extracted = await extractTextFromFile(filePath, fileName, mime, MAX_TEXT_CHARS);
      content.push({
        type: 'text',
        text: extracted,
      });
    } catch (error) {
      content.push({
        type: 'text',
        text: `[Attached file unreadable: ${fileName}. ${String(error?.message || error)}]`,
      });
    }
  }

  if (content.length === 0) {
    content.push({
      type: 'text',
      text: 'Hello',
    });
  }

  return content;
}

function extractApiResponseText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (typeof item.text === 'string' && item.text.trim()) {
      parts.push(item.text.trim());
      continue;
    }
    if (item.type === 'output_text' && typeof item.output_text === 'string' && item.output_text.trim()) {
      parts.push(item.output_text.trim());
    }
  }
  return parts.join('\n').trim();
}

function payloadHasImageAttachment(payload = {}) {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  for (const item of attachments) {
    const filePath = typeof item?.path === 'string' ? item.path : '';
    const mime = String(item?.mime || '').toLowerCase();
    const inlineData = typeof item?.inlineData === 'string' ? item.inlineData.trim() : '';
    if (mime.startsWith('image/')) {
      return true;
    }
    if (inlineData && (mime.startsWith('image/') || !filePath)) {
      return true;
    }
    if (isLikelyImage(filePath, mime)) {
      return true;
    }
  }
  return false;
}

function cloudApiSupportsRealtime(config = cloudApiConfig) {
  if (!CLOUD_API_REALTIME_ENABLED) {
    return false;
  }
  const template = normalizeApiTemplate(config.template || 'openai');
  if (template !== 'openai') {
    return false;
  }
  const model = String(config.model || '')
    .trim()
    .toLowerCase();
  return Boolean(model) && model.includes('realtime');
}

function shouldUseCloudRealtimeTransport(payload = {}, options = {}) {
  if (options?.forceHttp) {
    return false;
  }
  if (!cloudApiSupportsRealtime(cloudApiConfig)) {
    return false;
  }
  if (payloadHasImageAttachment(payload)) {
    return false;
  }
  return true;
}

function buildCloudRealtimeWsEndpoint(config = cloudApiConfig) {
  const normalizedBaseUrl = normalizeCloudApiBaseUrl(config.baseUrl || CLOUD_API_BASE_URL);
  const parsed = new URL(normalizedBaseUrl);
  parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
  const pathName = parsed.pathname.replace(/\/+$/, '');
  if (/\/v1$/i.test(pathName)) {
    parsed.pathname = `${pathName}/realtime`;
  } else if (/\/realtime$/i.test(pathName)) {
    parsed.pathname = pathName;
  } else {
    parsed.pathname = `${pathName || ''}/realtime`;
  }
  parsed.search = '';
  const model = String(config.model || '').trim();
  parsed.searchParams.set('model', model);
  return parsed.toString();
}

function buildCloudRealtimeProtocols(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Cloud API key is required for realtime mode.');
  }
  return ['realtime', `openai-insecure-api-key.${key}`, 'openai-beta.realtime-v1'];
}

function clearRealtimeIdleCloseTimer() {
  if (realtimeState.idleCloseTimer) {
    clearTimeout(realtimeState.idleCloseTimer);
    realtimeState.idleCloseTimer = null;
  }
}

function finalizeRealtimeActive(active, error = null, result = null) {
  if (!active || active.finished) {
    return;
  }
  active.finished = true;
  if (active.timeoutTimer) {
    clearTimeout(active.timeoutTimer);
    active.timeoutTimer = null;
  }
  if (realtimeState.active === active) {
    realtimeState.active = null;
  }
  if (error) {
    active.reject(error instanceof Error ? error : new Error(String(error)));
  } else {
    active.resolve(result || {});
  }
  if (typeof active.markDone === 'function') {
    active.markDone();
  }
}

function closeCloudRealtimeSocket(reason = '') {
  clearRealtimeIdleCloseTimer();
  const socket = realtimeState.socket;
  realtimeState.socket = null;
  realtimeState.connecting = null;
  realtimeState.endpoint = '';
  realtimeState.model = '';
  if (realtimeState.active) {
    finalizeRealtimeActive(
      realtimeState.active,
      new Error(reason || 'Realtime connection closed before response completed.')
    );
  }
  if (!socket) {
    return;
  }
  try {
    if (socket.readyState === 0 || socket.readyState === 1) {
      socket.close(1000, reason || 'normal');
    }
  } catch (_error) {
    // no-op
  }
}

function sendCloudRealtimeEvent(payload) {
  const socket = realtimeState.socket;
  if (!socket || socket.readyState !== 1) {
    throw new Error('Realtime connection is not open.');
  }
  socket.send(JSON.stringify(payload));
}

function extractTextFromRealtimeResponse(response) {
  if (!response || typeof response !== 'object') {
    return '';
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const node of content) {
      const text = String(node?.text || node?.transcript || '').trim();
      if (text) {
        chunks.push(text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractRealtimeEventResponseId(event) {
  if (!event || typeof event !== 'object') {
    return '';
  }
  return String(
    event.response_id ||
      event.response?.id ||
      event.item?.response_id ||
      event.output?.response_id ||
      ''
  ).trim();
}

function parseRealtimeEventPayload(rawData) {
  const value = rawData?.data ?? rawData;
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  if (value instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(value).toString('utf8'));
  }
  if (ArrayBuffer.isView(value)) {
    return JSON.parse(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8'));
  }
  throw new Error('Unsupported realtime event payload.');
}

function handleCloudRealtimeEvent(event) {
  if (!event || typeof event !== 'object') {
    return;
  }

  const active = realtimeState.active;
  if (!active) {
    return;
  }

  const eventType = String(event.type || '').trim();
  const eventResponseId = extractRealtimeEventResponseId(event);
  if (active.responseId && eventResponseId && eventResponseId !== active.responseId) {
    return;
  }

  if (eventType === 'response.created') {
    const responseId = String(event.response?.id || eventResponseId || '').trim();
    if (responseId) {
      active.responseId = responseId;
    }
    return;
  }

  if (eventType === 'response.output_text.delta' || eventType === 'response.text.delta') {
    const delta = String(event.delta || event.text || '');
    if (!delta) {
      return;
    }
    active.text += delta;
    if (typeof active.onDelta === 'function') {
      try {
        active.onDelta(delta, {
          transport: 'realtime',
          responseId: active.responseId || '',
        });
      } catch (_error) {
        // ignore stream callback errors
      }
    }
    return;
  }

  if (eventType === 'response.output_text.done' || eventType === 'response.text.done') {
    const doneText = String(event.text || '').trim();
    if (doneText && !active.text.trim()) {
      active.text = doneText;
    }
    return;
  }

  if (eventType === 'error') {
    const message =
      String(event.error?.message || '').trim() ||
      String(event.message || '').trim() ||
      'Cloud realtime request failed.';
    finalizeRealtimeActive(active, new Error(message));
    return;
  }

  if (eventType === 'response.done') {
    const status = String(event.response?.status || '').trim().toLowerCase();
    if (status === 'failed' || status === 'cancelled') {
      const message =
        String(event.response?.status_details?.error?.message || '').trim() ||
        (status === 'cancelled' ? 'Request paused by user.' : 'Cloud realtime response failed.');
      finalizeRealtimeActive(active, new Error(message));
      return;
    }
    const text = String(active.text || '').trim() || extractTextFromRealtimeResponse(event.response);
    finalizeRealtimeActive(active, null, {
      text: text || 'No text response from Cloud Realtime.',
      model: String(event.response?.model || realtimeState.model || cloudApiConfig.model || 'gpt-realtime'),
      usage: event.response?.usage || null,
      provider: currentProvider,
      runtimeMode: 'api',
      apiTemplate: 'openai',
      transport: 'realtime',
      workdir: currentWorkdir,
    });
  }
}

async function ensureCloudRealtimeSocket() {
  if (realtimeState.socket && realtimeState.socket.readyState === 1 && !realtimeState.connecting) {
    return realtimeState.socket;
  }
  if (realtimeState.connecting) {
    return realtimeState.connecting;
  }

  const template = normalizeApiTemplate(cloudApiConfig.template || 'openai');
  if (template !== 'openai') {
    throw new Error('Realtime transport currently supports OpenAI template only.');
  }
  const endpoint = buildCloudRealtimeWsEndpoint(cloudApiConfig);
  const protocols = buildCloudRealtimeProtocols(cloudApiConfig.apiKey);
  realtimeState.endpoint = endpoint;
  realtimeState.model = String(cloudApiConfig.model || '').trim();

  realtimeState.connecting = new Promise((resolve, reject) => {
    let settled = false;
    let connectTimer = null;
    let socket = null;
    try {
      socket = new WebSocket(endpoint, protocols);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const cleanupConnect = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };

    const onMessage = (raw) => {
      try {
        const parsed = parseRealtimeEventPayload(raw);
        handleCloudRealtimeEvent(parsed);
      } catch (_error) {
        // Ignore malformed event payloads.
      }
    };

    const onOpen = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupConnect();
      realtimeState.socket = socket;
      clearRealtimeIdleCloseTimer();
      resolve(socket);
    };

    const onError = (event) => {
      const errorMessage = String(event?.message || event?.error?.message || '').trim() || 'Realtime connection failed.';
      if (!settled) {
        settled = true;
        cleanupConnect();
        try {
          socket.close();
        } catch (_closeError) {
          // no-op
        }
        reject(new Error(errorMessage));
        return;
      }
      closeCloudRealtimeSocket(errorMessage);
    };

    const onClose = (event) => {
      const reason = String(event?.reason || '').trim() || 'Realtime connection closed.';
      if (!settled) {
        settled = true;
        cleanupConnect();
        reject(new Error(reason));
        return;
      }
      realtimeState.socket = null;
      realtimeState.connecting = null;
      if (realtimeState.active) {
        finalizeRealtimeActive(realtimeState.active, new Error(reason));
      }
    };

    connectTimer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.close();
      } catch (_error) {
        // no-op
      }
      reject(new Error(`Realtime connect timed out after ${CLOUD_API_REALTIME_CONNECT_TIMEOUT_MS} ms.`));
    }, CLOUD_API_REALTIME_CONNECT_TIMEOUT_MS);

    socket.addEventListener('message', onMessage);
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
  }).finally(() => {
    realtimeState.connecting = null;
  });

  return realtimeState.connecting;
}

function scheduleCloudRealtimeIdleClose() {
  clearRealtimeIdleCloseTimer();
  if (!realtimeState.socket || realtimeState.socket.readyState !== 1) {
    return;
  }
  realtimeState.idleCloseTimer = setTimeout(() => {
    if (realtimeState.active) {
      return;
    }
    closeCloudRealtimeSocket('realtime idle timeout');
  }, CLOUD_API_REALTIME_IDLE_CLOSE_MS);
}

function waitForRealtimeActiveDone(active) {
  if (!active || !active.done) {
    return Promise.resolve();
  }
  return active.done;
}

async function waitForCloudRealtimeSlot(priority = 50) {
  while (realtimeState.active) {
    const active = realtimeState.active;
    const activePriority = Number(active.priority || 0);
    if (Number.isFinite(priority) && priority > activePriority && typeof active.cancel === 'function') {
      active.cancel('Preempted by higher-priority request.');
    }
    await waitForRealtimeActiveDone(active);
  }
}

async function runCloudRealtimeTurn(payload, options = {}) {
  assertCloudApiReady(cloudApiConfig);
  if (!cloudApiSupportsRealtime(cloudApiConfig)) {
    throw new Error('Realtime transport is not enabled for current API config.');
  }
  if (payloadHasImageAttachment(payload || {})) {
    throw new Error('Realtime transport currently supports text-only payload.');
  }

  const timeoutOverride = Number(options?.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutOverride) && timeoutOverride > 0
      ? Math.round(timeoutOverride)
      : Number.isFinite(CLOUD_API_TIMEOUT_MS) && CLOUD_API_TIMEOUT_MS > 0
        ? CLOUD_API_TIMEOUT_MS
        : 120000;

  const priority = Number(options?.priority);
  await waitForCloudRealtimeSlot(Number.isFinite(priority) ? priority : 50);
  const socket = await ensureCloudRealtimeSocket();
  if (!socket || socket.readyState !== 1) {
    throw new Error('Realtime connection is unavailable.');
  }

  const { prompt } = await buildCliPrompt(payload || {}, 'claude');
  const source = String(options?.source || 'chat').trim() || 'chat';
  const requestId = String(options?.requestId || '').trim();

  return new Promise((resolve, reject) => {
    const active = {
      text: '',
      responseId: '',
      priority: Number.isFinite(priority) ? priority : 50,
      onDelta: typeof options?.onDelta === 'function' ? options.onDelta : null,
      resolve,
      reject,
      finished: false,
      timeoutTimer: null,
      cancel: null,
      done: null,
      markDone: null,
    };
    active.done = new Promise((doneResolve) => {
      active.markDone = doneResolve;
    });
    active.cancel = (reason = 'Request paused by user.') => {
      if (active.finished) {
        return false;
      }
      try {
        if (active.responseId) {
          sendCloudRealtimeEvent({
            type: 'response.cancel',
            response_id: active.responseId,
          });
        } else {
          sendCloudRealtimeEvent({
            type: 'response.cancel',
          });
        }
      } catch (_error) {
        // no-op
      }
      finalizeRealtimeActive(active, new Error(reason));
      return true;
    };

    realtimeState.active = active;
    clearRealtimeIdleCloseTimer();

    if (typeof options?.onSpawn === 'function') {
      try {
        options.onSpawn({
          bin: 'cloud-realtime',
          args: [realtimeState.endpoint || 'realtime', realtimeState.model || cloudApiConfig.model],
          pid: null,
          cancel: active.cancel,
        });
      } catch (_error) {
        // no-op
      }
    }

    active.timeoutTimer = setTimeout(() => {
      if (active.finished) {
        return;
      }
      active.cancel(`Cloud realtime timed out after ${timeoutMs} ms.`);
    }, timeoutMs);

    try {
      sendCloudRealtimeEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      });
      sendCloudRealtimeEvent({
        type: 'response.create',
        response: {
          modalities: ['text'],
          metadata: {
            source,
            request_id: requestId || '',
          },
        },
      });
    } catch (error) {
      finalizeRealtimeActive(active, error);
      return;
    }

    active.done.finally(() => {
      scheduleCloudRealtimeIdleClose();
    });
  });
}

function parseCodexJsonl(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let threadId = codexThreadId;
  let usage = null;
  const chunks = [];
  const rawEvents = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      rawEvents.push(event);

      if (event?.type === 'thread.started' && typeof event.thread_id === 'string') {
        threadId = event.thread_id;
      }

      if (event?.type === 'item.completed' && event?.item?.type === 'agent_message' && typeof event?.item?.text === 'string') {
        chunks.push(event.item.text);
      }

      if (event?.type === 'turn.completed' && event?.usage) {
        usage = event.usage;
      }
    } catch (_error) {
      // Ignore non-JSON lines from codex output.
    }
  }

  return {
    threadId,
    text: chunks.join('\n').trim(),
    usage,
    rawEvents,
  };
}

function parseClaudeJson(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let parsed = null;
  for (const line of lines) {
    try {
      parsed = JSON.parse(line);
    } catch (_error) {
      // Ignore non-JSON lines.
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Failed to parse Claude output.');
  }

  const text =
    (typeof parsed.result === 'string' ? parsed.result : '') ||
    (typeof parsed.structured_output === 'string' ? parsed.structured_output : '');

  let modelName = CLAUDE_MODEL || 'claude';
  if (parsed.modelUsage && typeof parsed.modelUsage === 'object') {
    const modelKeys = Object.keys(parsed.modelUsage);
    if (modelKeys.length > 0) {
      modelName = modelKeys[0];
    }
  }

  return {
    text: text.trim(),
    sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : claudeSessionId,
    usage: parsed.usage || null,
    model: modelName,
    permissionDenials: Array.isArray(parsed.permission_denials) ? parsed.permission_denials : [],
  };
}

function runProcess(bin, args, timeoutMs, cwdPath, options = {}) {
  return new Promise((resolve, reject) => {
    const projectNodeBin = path.join(PROJECT_ROOT, 'node_modules', '.bin');
    const unpackedNodeBin = path.join(DESKTOP_ASSISTANT_ROOT, 'node_modules', '.bin');
    const asarNodeBin = DESKTOP_ASSISTANT_ROOT.endsWith('app.asar.unpacked')
      ? path.join(DESKTOP_ASSISTANT_ROOT.replace(/app\.asar\.unpacked$/, 'app.asar'), 'node_modules', '.bin')
      : '';
    const envPath = String(process.env.PATH || '');
    const pathParts = envPath
      ? envPath
          .split(path.delimiter)
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : [];
    const pathCandidates = [
      embeddedNodeShimDir,
      preferredNodeBinary ? path.dirname(preferredNodeBinary) : '',
      path.isAbsolute(String(bin || '')) ? path.dirname(String(bin || '')) : '',
      ...COMMON_CLI_BIN_DIRS,
      projectNodeBin,
      unpackedNodeBin,
      asarNodeBin,
    ];
    const normalizedCandidates = [];
    const candidateSeen = new Set();
    for (const candidate of pathCandidates) {
      const value = String(candidate || '').trim();
      if (!value || candidateSeen.has(value)) {
        continue;
      }
      candidateSeen.add(value);
      normalizedCandidates.push(value);
    }
    const prioritized = normalizedCandidates;
    const prioritizedSet = new Set(prioritized);
    const existingTail = [];
    const existingSeen = new Set();
    for (const existing of pathParts) {
      if (prioritizedSet.has(existing) || existingSeen.has(existing)) {
        continue;
      }
      existingSeen.add(existing);
      existingTail.push(existing);
    }
    const mergedPath = [...prioritized, ...existingTail].join(path.delimiter);
    const preferredMcpNodeBin = String(process.env.MCP_NODE_BIN || preferredNodeBinary || '').trim();
    const injectedEnv = {
      ...process.env,
      PATH: mergedPath,
      DESKTOP_ASSISTANT_ROOT,
      ...(options?.env && typeof options.env === 'object' ? options.env : {}),
    };
    if (preferredMcpNodeBin) {
      injectedEnv.MCP_NODE_BIN = preferredMcpNodeBin;
      injectedEnv.MCP_USE_EMBEDDED_NODE = '0';
    }
    const child = spawn(bin, args, {
      cwd: cwdPath,
      env: injectedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let cancelled = false;
    let timedOut = false;
    let forceKillTimer = null;

    const clearForceKillTimer = () => {
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
    };

    const terminateChild = () => {
      if (finished) {
        return;
      }
      try {
        child.kill('SIGTERM');
      } catch (_error) {
        // no-op
      }
      clearForceKillTimer();
      forceKillTimer = setTimeout(() => {
        if (finished) {
          return;
        }
        try {
          child.kill('SIGKILL');
        } catch (_error) {
          // no-op
        }
      }, 3000);
    };

    const cancel = () => {
      if (finished) {
        return false;
      }
      cancelled = true;
      terminateChild();
      return true;
    };

    if (typeof options?.onSpawn === 'function') {
      try {
        options.onSpawn({
          bin,
          args,
          pid: child.pid,
          cancel,
        });
      } catch (_error) {
        // no-op
      }
    }

    const timeout = setTimeout(() => {
      if (!finished) {
        timedOut = true;
        terminateChild();
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      clearForceKillTimer();
      finished = true;
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      clearForceKillTimer();
      finished = true;

      if (cancelled) {
        reject(new Error('Request paused by user.'));
        return;
      }

      if (timedOut) {
        reject(new Error(`${path.basename(bin)} timed out after ${timeoutMs} ms.`));
        return;
      }

      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      if (signal) {
        reject(new Error(`${path.basename(bin)} exited by signal ${signal}.\n${stderr || stdout}`));
        return;
      }
      reject(new Error(`${path.basename(bin)} exited with code ${code}.\n${stderr || stdout}`));
    });
  });
}

async function runCodexTurn(payload, options = {}) {
  const { prompt, imagePaths } = await buildCliPrompt(payload || {}, 'codex');
  const workdir = currentWorkdir;
  const codexBin = await getProviderCommand('codex');

  const baseArgs = ['--skip-git-repo-check', '--json'];
  if (CODEX_MODEL) {
    baseArgs.push('--model', CODEX_MODEL);
  }

  const imageArgs = [];
  for (const imagePath of imagePaths) {
    imageArgs.push('-i', imagePath);
  }

  let args;
  if (codexThreadId) {
    args = ['exec', 'resume', ...baseArgs, codexThreadId, prompt, ...imageArgs];
  } else {
    args = ['exec', ...baseArgs, '-C', workdir, prompt, ...imageArgs];
  }

  const result = await runProcess(codexBin, args, CODEX_TIMEOUT_MS, workdir, options);
  const parsed = parseCodexJsonl(result.stdout);

  if (parsed.threadId) {
    codexThreadId = parsed.threadId;
  }

  const text = parsed.text || 'No text response from Codex.';

  return {
    text,
    usage: parsed.usage,
    threadId: codexThreadId,
    workdir,
    model: CODEX_MODEL || 'codex',
    provider: 'codex',
  };
}

async function runClaudeTurn(payload, options = {}) {
  const { prompt } = await buildCliPrompt(payload || {}, 'claude');
  const workdir = currentWorkdir;
  const claudeBin = await getProviderCommand('claude');

  const args = ['-p', '--output-format=json'];
  const permissionMode = getClaudePermissionMode({ automation: false });
  if (permissionMode) {
    args.push('--permission-mode', permissionMode);
  }
  if (CLAUDE_TOOLS.trim()) {
    args.push(`--tools=${CLAUDE_TOOLS}`);
  }
  if (CLAUDE_CHAT_USE_MCP && CLAUDE_MCP_CONFIGS.length > 0) {
    await assertClaudeMcpConfigsReady();
    args.push('--mcp-config', ...CLAUDE_MCP_CONFIGS);
  }

  if (CLAUDE_MODEL) {
    args.push('--model', CLAUDE_MODEL);
  }

  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }

  args.push(prompt);

  const timeoutMs =
    Number.isFinite(CLAUDE_CHAT_TIMEOUT_MS) && CLAUDE_CHAT_TIMEOUT_MS > 0
      ? CLAUDE_CHAT_TIMEOUT_MS
      : CLAUDE_TIMEOUT_MS;
  const result = await runProcess(claudeBin, args, timeoutMs, workdir, options);
  const parsed = parseClaudeJson(result.stdout);
  if (parsed.sessionId) {
    claudeSessionId = parsed.sessionId;
  }

  return {
    text: parsed.text || 'No text response from Claude.',
    usage: parsed.usage,
    sessionId: claudeSessionId,
    workdir,
    model: parsed.model,
    provider: 'claude',
  };
}

async function runCloudApiTurn(payload, options = {}) {
  assertCloudApiReady(cloudApiConfig);
  const workdir = currentWorkdir;
  const template = normalizeApiTemplate(cloudApiConfig.template || 'openai');
  const model = String(cloudApiConfig.model || '').trim();
  const timeoutOverride = Number(options && options.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutOverride) && timeoutOverride > 0
      ? Math.round(timeoutOverride)
      : Number.isFinite(CLOUD_API_TIMEOUT_MS) && CLOUD_API_TIMEOUT_MS > 0
        ? CLOUD_API_TIMEOUT_MS
        : 120000;

  const tryRealtime = shouldUseCloudRealtimeTransport(payload || {}, options);
  if (tryRealtime) {
    try {
      return await runCloudRealtimeTurn(payload || {}, options);
    } catch (error) {
      const message = String(error?.message || error);
      if (/paused by user|preempted by higher-priority request|timed out/i.test(message)) {
        throw error;
      }
      // Realtime can fail due network/protocol compatibility; fallback to chat completions.
    }
  }

  const content = await buildCloudApiUserContent(payload || {});
  const base = String(cloudApiConfig.baseUrl || '').trim().replace(/\/+$/, '');
  const endpoint = `${base}/chat/completions`;
  const apiKey = String(cloudApiConfig.apiKey || '').trim();
  const abortController = new AbortController();
  let cancelled = false;
  let timeoutTimer = null;
  let timedOut = false;
  const shouldStream = options?.stream !== false;

  const cancel = () => {
    if (cancelled) {
      return false;
    }
    cancelled = true;
    try {
      abortController.abort();
    } catch (_error) {
      // no-op
    }
    return true;
  };

  if (typeof options?.onSpawn === 'function') {
    try {
      options.onSpawn({
        bin: shouldStream ? 'cloud-api-stream' : 'cloud-api',
        args: [endpoint, model],
        pid: null,
        cancel,
      });
    } catch (_error) {
      // no-op
    }
  }

  try {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      cancel();
    }, timeoutMs);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    if (template === 'azure') {
      delete headers.Authorization;
      headers['api-key'] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        stream: shouldStream,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let failedPayload = null;
      let failedText = '';
      try {
        failedText = await response.text();
        failedPayload = failedText ? JSON.parse(failedText) : null;
      } catch (_error) {
        failedPayload = null;
      }
      const errorMessage =
        String(failedPayload?.error?.message || '').trim() ||
        String(failedText || '').trim() ||
        `Cloud API request failed (${response.status}).`;
      throw new Error(errorMessage);
    }

    if (!shouldStream || !response.body) {
      let payloadJson = null;
      try {
        payloadJson = await response.json();
      } catch (_error) {
        payloadJson = null;
      }
      const apiText = extractApiResponseText(payloadJson?.choices?.[0]?.message?.content);
      return {
        text: apiText || 'No text response from Cloud API.',
        usage: payloadJson?.usage || null,
        threadId: null,
        workdir,
        model: String(payloadJson?.model || model || 'cloud-api'),
        provider: currentProvider,
        runtimeMode: 'api',
        apiTemplate: template,
        transport: 'http',
      };
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    let rawCollected = '';
    let fullText = '';
    let usage = null;
    let modelName = model || 'cloud-api';
    let streamEnded = false;

    const handleDeltaText = (deltaText) => {
      if (!deltaText) {
        return;
      }
      fullText += deltaText;
      if (typeof options?.onDelta === 'function') {
        try {
          options.onDelta(deltaText, {
            transport: 'http-stream',
          });
        } catch (_error) {
          // ignore UI stream callback errors
        }
      }
    };

    const processSseDataLine = (line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || !trimmed.startsWith('data:')) {
        return;
      }
      const data = trimmed.slice(5).trim();
      if (!data) {
        return;
      }
      if (data === '[DONE]') {
        streamEnded = true;
        return;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(data);
      } catch (_error) {
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        return;
      }
      if (parsed.usage) {
        usage = parsed.usage;
      }
      if (typeof parsed.model === 'string' && parsed.model.trim()) {
        modelName = parsed.model.trim();
      }
      const delta = parsed?.choices?.[0]?.delta;
      if (typeof delta?.content === 'string') {
        handleDeltaText(delta.content);
        return;
      }
      if (Array.isArray(delta?.content)) {
        for (const node of delta.content) {
          if (typeof node?.text === 'string' && node.text) {
            handleDeltaText(node.text);
          } else if (typeof node?.content === 'string' && node.content) {
            handleDeltaText(node.content);
          }
        }
      }
      const fallbackChunk = extractApiResponseText(parsed?.choices?.[0]?.message?.content);
      if (fallbackChunk && !fullText.trim()) {
        handleDeltaText(fallbackChunk);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const decoded = decoder.decode(value, { stream: true });
      rawCollected += decoded;
      buffer += decoded;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        processSseDataLine(line);
      }
    }
    if (buffer.trim()) {
      processSseDataLine(buffer);
    }
    if (!streamEnded && !fullText.trim()) {
      const fallbackRaw = `${rawCollected}\n${buffer}`.trim();
      if (fallbackRaw) {
        let parsedFallback = null;
        try {
          parsedFallback = JSON.parse(fallbackRaw);
        } catch (_error) {
          parsedFallback = null;
        }
        if (parsedFallback) {
          const fallbackText = extractApiResponseText(parsedFallback?.choices?.[0]?.message?.content);
          if (fallbackText) {
            fullText = fallbackText;
          }
          if (!usage && parsedFallback?.usage) {
            usage = parsedFallback.usage;
          }
          if (typeof parsedFallback?.model === 'string' && parsedFallback.model.trim()) {
            modelName = parsedFallback.model.trim();
          }
        }
      }
    }
    if (!fullText.trim()) {
      throw new Error('Cloud API streaming ended without response text.');
    }

    return {
      text: fullText.trim() || 'No text response from Cloud API.',
      usage: usage || null,
      threadId: null,
      workdir,
      model: String(modelName || model || 'cloud-api'),
      provider: currentProvider,
      runtimeMode: 'api',
      apiTemplate: template,
      transport: 'http-stream',
    };
  } catch (error) {
    const errorName = String(error?.name || '');
    const errorMessage = String(error?.message || error);
    if (timedOut) {
      throw new Error(`Cloud API timed out after ${timeoutMs} ms.`);
    }
    if (cancelled || errorName === 'AbortError' || /aborted|abort/i.test(errorMessage)) {
      throw new Error('Request paused by user.');
    }
    throw error;
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }
}

async function runCloudAudioTranscription(payload = {}, options = {}) {
  assertCloudApiReady(cloudApiConfig);

  const template = normalizeApiTemplate(cloudApiConfig.template || 'openai');

  const rawBase64 = typeof payload?.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
  if (!rawBase64) {
    throw new Error('Audio data is empty.');
  }

  let audioBuffer = null;
  try {
    audioBuffer = Buffer.from(rawBase64, 'base64');
  } catch (_error) {
    audioBuffer = null;
  }
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio payload is invalid.');
  }
  if (audioBuffer.length > CLOUD_API_AUDIO_MAX_BYTES) {
    throw new Error(`Audio too large: ${prettyBytes(audioBuffer.length)} (max ${prettyBytes(CLOUD_API_AUDIO_MAX_BYTES)}).`);
  }

  const rawFileName = String(payload?.fileName || payload?.filename || '').trim();
  const safeFileName = rawFileName
    ? rawFileName.replace(/[^\w.\-]/g, '_').slice(0, 80) || 'voice.webm'
    : 'voice.webm';
  const mimeType = guessAudioMimeType(safeFileName, payload?.mime || '');
  const model = String(payload?.model || CLOUD_API_AUDIO_MODEL || 'whisper-1').trim() || 'whisper-1';
  const languageRaw = String(payload?.language || '').trim().toLowerCase();
  const languageCode = languageRaw.includes('-') ? languageRaw.split('-')[0] : languageRaw;
  const prompt = String(payload?.prompt || '').trim();

  const base = String(cloudApiConfig.baseUrl || '').trim().replace(/\/+$/, '');
  const endpoint = `${base}/audio/transcriptions`;
  const apiKey = String(cloudApiConfig.apiKey || '').trim();
  const headers = {};
  if (template === 'azure') {
    headers['api-key'] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType }), safeFileName);
  form.append('model', model);
  form.append('response_format', 'json');
  if (/^[a-z]{2,3}$/.test(languageCode)) {
    form.append('language', languageCode);
  }
  if (prompt) {
    form.append('prompt', prompt.slice(0, 300));
  }

  const abortController = new AbortController();
  let timeoutTimer = null;
  let timedOut = false;
  const timeoutOverride = Number(options && options.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutOverride) && timeoutOverride > 0
      ? Math.round(timeoutOverride)
      : Number.isFinite(CLOUD_API_TIMEOUT_MS) && CLOUD_API_TIMEOUT_MS > 0
        ? CLOUD_API_TIMEOUT_MS
        : 120000;

  try {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        abortController.abort();
      } catch (_error) {
        // no-op
      }
    }, timeoutMs);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal: abortController.signal,
    });

    const rawBody = await response.text();
    let payloadJson = null;
    if (rawBody) {
      try {
        payloadJson = JSON.parse(rawBody);
      } catch (_jsonError) {
        payloadJson = null;
      }
    }

    if (!response.ok) {
      const errorMessage =
        String(payloadJson?.error?.message || '').trim() ||
        String(rawBody || '').trim() ||
        `Cloud audio transcription failed (${response.status}).`;
      throw new Error(errorMessage);
    }

    const text = String(payloadJson?.text || payloadJson?.output_text || payloadJson?.transcript || rawBody || '').trim();
    if (!text) {
      throw new Error('No speech recognized from audio.');
    }

    return {
      text,
      model: String(payloadJson?.model || model || 'audio-transcription'),
      bytes: Number(audioBuffer.length || 0),
    };
  } catch (error) {
    const errorName = String(error?.name || '');
    const errorMessage = String(error?.message || error);
    if (timedOut) {
      throw new Error(`Cloud audio transcription timed out after ${timeoutMs} ms.`);
    }
    if (errorName === 'AbortError' || /aborted|abort/i.test(errorMessage)) {
      throw new Error('Voice transcription interrupted.');
    }
    throw error;
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }
}

async function runActiveProviderTurn(payload, options = {}) {
  if (currentRuntimeMode === 'api') {
    return runCloudApiTurn(payload, options);
  }
  if (currentProvider === 'claude') {
    return runClaudeTurn(payload, options);
  }
  return runCodexTurn(payload, options);
}

function toLocalPathFromFileUrl(rawUrl) {
  const urlText = String(rawUrl || '').trim();
  if (!urlText) {
    return '';
  }
  try {
    const parsed = new URL(urlText);
    if (parsed.protocol !== 'file:') {
      return '';
    }
    return fileURLToPath(parsed);
  } catch (_error) {
    return '';
  }
}

function parseFilePathsFromText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return [];
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const filePaths = [];
  for (const line of lines) {
    const fromUrl = toLocalPathFromFileUrl(line);
    if (fromUrl) {
      filePaths.push(fromUrl);
      continue;
    }
    if (line.startsWith('/')) {
      filePaths.push(line);
    }
  }
  return filePaths;
}

function inferMimeFromPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  if (ext === '.gif') {
    return 'image/gif';
  }
  if (ext === '.bmp') {
    return 'image/bmp';
  }
  if (ext === '.tif' || ext === '.tiff') {
    return 'image/tiff';
  }
  if (isLikelyText(filePath, '')) {
    return 'text/plain';
  }
  return 'application/octet-stream';
}

async function createAttachmentFromPath(filePath) {
  const resolved = path.resolve(String(filePath || '').trim());
  if (!resolved) {
    return null;
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    return null;
  }
  return {
    path: resolved,
    name: path.basename(resolved),
    mime: inferMimeFromPath(resolved),
    size: Number(stat.size || 0),
  };
}

async function readFilePathsFromClipboard() {
  const candidates = new Set();
  const formats = clipboard.availableFormats('clipboard');

  if (formats.includes('public.file-url')) {
    const rawFileUrl = String(clipboard.read('public.file-url') || '').trim();
    for (const item of parseFilePathsFromText(rawFileUrl)) {
      candidates.add(item);
    }
  }

  if (formats.includes('public.utf8-plain-text') || formats.includes('text/plain')) {
    const text = clipboard.readText('clipboard');
    for (const item of parseFilePathsFromText(text)) {
      candidates.add(item);
    }
  }

  if (candidates.size === 0) {
    try {
      const result = await runAppleScript(
        [
          'try',
          '  set itemsList to the clipboard as alias list',
          '  set outText to ""',
          '  repeat with oneItem in itemsList',
          '    try',
          '      set outText to outText & POSIX path of oneItem & linefeed',
          '    end try',
          '  end repeat',
          '  return outText',
          'on error',
          '  return ""',
          'end try',
        ],
        5000
      );
      const raw = String(result.stdout || '').trim();
      for (const item of raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
        candidates.add(item);
      }
    } catch (_error) {
      // Ignore alias-list conversion errors.
    }
  }

  const list = [];
  for (const item of candidates) {
    try {
      const stat = await fs.stat(item);
      if (stat.isFile()) {
        list.push(path.resolve(item));
      }
    } catch (_error) {
      // Ignore missing files.
    }
  }
  return list;
}

async function extractClipboardQuickAskPayload() {
  const attachments = [];
  let text = String(clipboard.readText('clipboard') || '').trim();

  const filePaths = await readFilePathsFromClipboard();
  for (const onePath of filePaths) {
    try {
      const attachment = await createAttachmentFromPath(onePath);
      if (attachment) {
        attachments.push(attachment);
      }
    } catch (_error) {
      // Ignore invalid file entries.
    }
  }

  const image = clipboard.readImage('clipboard');
  if (!image.isEmpty()) {
    const png = image.toPNG();
    if (png && png.length > 0) {
      const imagePath = path.join(
        os.tmpdir(),
        `desktop-assistant-clipboard-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.png`
      );
      await fs.writeFile(imagePath, png);
      attachments.push({
        path: imagePath,
        name: path.basename(imagePath),
        mime: 'image/png',
        size: Number(png.length || 0),
      });
      if (!text) {
        text = '请根据这张图片回答我的问题。';
      }
    }
  }

  if (attachments.length > 0 && text) {
    const textLooksLikeFileList = parseFilePathsFromText(text).length > 0;
    if (textLooksLikeFileList) {
      text = '';
    }
  }

  if (!text && attachments.length === 0) {
    return null;
  }
  return { text, attachments };
}

function queueChatEvent(channel, payload) {
  pendingChatEvents.push({
    channel: String(channel || ''),
    payload: payload && typeof payload === 'object' ? payload : {},
  });
}

function flushPendingChatEvents() {
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindowLoaded) {
    return;
  }
  while (pendingChatEvents.length > 0) {
    const next = pendingChatEvents.shift();
    if (!next || !next.channel) {
      continue;
    }
    try {
      chatWindow.webContents.send(next.channel, next.payload);
    } catch (_error) {
      // Ignore send failures.
    }
  }
}

function sendChatEvent(channel, payload) {
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindowLoaded) {
    queueChatEvent(channel, payload);
    return false;
  }
  try {
    chatWindow.webContents.send(channel, payload);
    return true;
  } catch (_error) {
    queueChatEvent(channel, payload);
    return false;
  }
}

function isSenderWebContents(sender, targetWindow) {
  if (!sender || !targetWindow || targetWindow.isDestroyed()) {
    return false;
  }
  try {
    return sender.id === targetWindow.webContents.id;
  } catch (_error) {
    return false;
  }
}

function buildUserTranscriptTextFromPayload(payload = {}) {
  const text = String(payload?.text || '').trim();
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  const fileLines = attachments
    .map((item) => String(item?.name || item?.path || '').trim())
    .filter(Boolean)
    .map((name) => `[file] ${name}`);
  const parts = [text, ...fileLines].filter(Boolean);
  return parts.join('\n').trim();
}

function syncConversationMessageToChat(role, text, meta = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole) {
    return;
  }
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return;
  }
  sendChatEvent('assistant:conversation-sync', {
    role: normalizedRole,
    text: normalizedText,
    source: String(meta.source || ''),
    requestId: String(meta.requestId || ''),
  });
}

function notifyQuickAskStatus(message, isError = false) {
  sendChatEvent('assistant:quick-ask-status', {
    message: String(message || ''),
    isError: Boolean(isError),
  });
}

async function dispatchQuickAsk(payload) {
  if (!chatWindow || chatWindow.isDestroyed()) {
    createChatWindow();
  }
  showChatWindow();
  sendChatEvent('assistant:quick-ask', payload && typeof payload === 'object' ? payload : {});
}

function normalizeLiveWatchInterval(rawIntervalMs) {
  const n = Number(rawIntervalMs);
  if (!Number.isFinite(n)) {
    return LIVE_WATCH_INTERVAL_MS;
  }
  return Math.max(2000, Math.min(30000, Math.round(n)));
}

function normalizeLiveWatchSummaryFrames(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return LIVE_WATCH_SUMMARY_FRAMES;
  }
  return Math.max(2, Math.min(12, Math.round(n)));
}

function normalizeLiveWatchMaxImageFrames(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return LIVE_WATCH_MAX_IMAGE_MEMORY;
  }
  return Math.max(6, Math.min(60, Math.round(n)));
}

function normalizeLiveWatchMaxImagesPerAnalysis(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS;
  }
  return Math.max(1, Math.min(12, Math.round(n)));
}

function normalizeLiveWatchTextOnlyMaxRounds(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS;
  }
  return Math.max(1, Math.min(10, Math.round(n)));
}

function getLiveWatchSettingsSnapshot() {
  return {
    intervalMs: Number(liveWatchState.intervalMs || LIVE_WATCH_INTERVAL_MS),
    summaryEveryFrames: Number(liveWatchState.summaryEveryFrames || LIVE_WATCH_SUMMARY_FRAMES),
    maxImageFrames: Number(liveWatchState.maxImageFrames || LIVE_WATCH_MAX_IMAGE_MEMORY),
    maxImagesPerAnalysis: Number(liveWatchState.maxImagesPerAnalysis || LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS),
    textOnlyMaxRounds: Number(liveWatchState.textOnlyMaxRounds || LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS),
    focusHint: String(liveWatchState.focusHint || ''),
    bufferedFrames: Array.isArray(liveWatchState.frameImages) ? liveWatchState.frameImages.length : 0,
    framesSinceAnalysis: Number(liveWatchState.framesSinceAnalysis || 0),
    textOnlyRoundsAfterVision: Number(liveWatchState.textOnlyRoundsAfterVision || 0),
    noChangeStreak: Number(liveWatchState.noChangeStreak || 0),
  };
}

function applyLiveWatchSettings(rawConfig = {}, options = {}) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const preserveFrames = options.preserveFrames !== false;
  if (Object.prototype.hasOwnProperty.call(config, 'intervalMs')) {
    liveWatchState.intervalMs = normalizeLiveWatchInterval(config.intervalMs);
  }
  if (Object.prototype.hasOwnProperty.call(config, 'summaryEveryFrames')) {
    liveWatchState.summaryEveryFrames = normalizeLiveWatchSummaryFrames(config.summaryEveryFrames);
  }
  if (Object.prototype.hasOwnProperty.call(config, 'maxImageFrames')) {
    liveWatchState.maxImageFrames = normalizeLiveWatchMaxImageFrames(config.maxImageFrames);
  }
  if (Object.prototype.hasOwnProperty.call(config, 'maxImagesPerAnalysis')) {
    const normalized = normalizeLiveWatchMaxImagesPerAnalysis(config.maxImagesPerAnalysis);
    liveWatchState.maxImagesPerAnalysis = Math.min(normalized, Number(liveWatchState.maxImageFrames || normalized));
  }
  if (Object.prototype.hasOwnProperty.call(config, 'textOnlyMaxRounds')) {
    liveWatchState.textOnlyMaxRounds = normalizeLiveWatchTextOnlyMaxRounds(config.textOnlyMaxRounds);
  }
  if (!preserveFrames) {
    liveWatchState.frameImages = [];
    liveWatchState.framesSinceAnalysis = 0;
  } else {
    const maxFrames = Math.max(6, Number(liveWatchState.maxImageFrames || LIVE_WATCH_MAX_IMAGE_MEMORY));
    if (Array.isArray(liveWatchState.frameImages) && liveWatchState.frameImages.length > maxFrames) {
      liveWatchState.frameImages = liveWatchState.frameImages.slice(-maxFrames);
    }
  }
}

function normalizeLiveWatchFocusHint(rawText) {
  const normalized = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, 500);
}

function formatLiveWatchClock(timestamp) {
  const d = new Date(Number(timestamp || Date.now()));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeLiveDialogText(rawText, maxLen = 260) {
  const text = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) {
    return '';
  }
  return text.slice(0, Math.max(60, maxLen));
}

function appendLiveWatchDialog(role, rawText, at = Date.now()) {
  const text = normalizeLiveDialogText(rawText);
  if (!text) {
    return;
  }
  const speaker = String(role || '').trim().toLowerCase() === 'user' ? 'user' : 'live';
  const previous = liveWatchState.dialog[liveWatchState.dialog.length - 1];
  if (previous && previous.role === speaker && previous.text === text) {
    return;
  }
  liveWatchState.dialog.push({
    role: speaker,
    text,
    at: Number(at || Date.now()),
  });
  if (liveWatchState.dialog.length > LIVE_WATCH_MAX_DIALOG_ITEMS) {
    liveWatchState.dialog = liveWatchState.dialog.slice(-LIVE_WATCH_MAX_DIALOG_ITEMS);
  }
}

function buildLiveWatchDialogContext(maxItems = 6) {
  const dialog = Array.isArray(liveWatchState.dialog) ? liveWatchState.dialog : [];
  if (dialog.length === 0) {
    return '无';
  }
  return dialog
    .slice(-Math.max(1, maxItems))
    .map((item) => {
      const role = item.role === 'user' ? '用户' : 'Live';
      return `[${role} ${formatLiveWatchClock(item.at)}] ${item.text}`;
    })
    .join('\n');
}

function normalizeLiveVisualMemoryText(rawText, maxLen = 240) {
  const text = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '';
  }
  return text.slice(0, Math.max(80, maxLen));
}

function appendLiveWatchVisualMemory(captureInfo, observation, at = Date.now()) {
  const primary = normalizeLiveVisualMemoryText(observation?.memoryUpdate || '', 220);
  const fallback = normalizeLiveVisualMemoryText(observation?.summary || '', 220);
  const text = primary || fallback;
  if (!text) {
    return;
  }
  const appName = normalizeLiveVisualMemoryText(captureInfo?.appName || '', 64);
  const windowTitle = normalizeLiveVisualMemoryText(captureInfo?.windowTitle || '', 90);
  const key = createHash('sha1')
    .update(`${appName}|${windowTitle}|${text}`)
    .digest('hex')
    .slice(0, 16);
  const previous = liveWatchState.visualMemory[liveWatchState.visualMemory.length - 1];
  if (previous && previous.key === key) {
    return;
  }
  liveWatchState.visualMemory.push({
    key,
    at: Number(at || Date.now()),
    appName,
    windowTitle,
    text,
  });
  if (liveWatchState.visualMemory.length > LIVE_WATCH_MAX_MEMORY_ITEMS) {
    liveWatchState.visualMemory = liveWatchState.visualMemory.slice(-LIVE_WATCH_MAX_MEMORY_ITEMS);
  }
}

function appendLiveWatchFrameImage(captureInfo, at = Date.now()) {
  if (!captureInfo || !captureInfo.data) {
    return;
  }
  let buffer = null;
  if (Buffer.isBuffer(captureInfo.data)) {
    buffer = captureInfo.data;
  } else if (captureInfo.data instanceof Uint8Array) {
    buffer = Buffer.from(captureInfo.data);
  } else {
    return;
  }
  if (!buffer || buffer.length === 0) {
    return;
  }
  const optimized = optimizeLiveWatchFrameData(buffer, captureInfo.mime || 'image/png');
  if (optimized && optimized.data) {
    buffer = optimized.data;
  }
  const entry = {
    at: Number(at || Date.now()),
    data: buffer,
    mime: optimized?.mime || guessImageMimeType('', captureInfo.mime || 'image/png'),
    appName: normalizeLiveVisualMemoryText(captureInfo.appName || '', 64),
    windowTitle: normalizeLiveVisualMemoryText(captureInfo.windowTitle || '', 90),
    scope: String(captureInfo.scope || '').trim() || 'full',
    hash: computeImageFingerprintFromBuffer(buffer),
  };
  liveWatchState.frameImages.push(entry);
  const maxFrames = Math.max(6, Number(liveWatchState.maxImageFrames || LIVE_WATCH_MAX_IMAGE_MEMORY));
  if (liveWatchState.frameImages.length > maxFrames) {
    liveWatchState.frameImages = liveWatchState.frameImages.slice(-maxFrames);
  }
  liveWatchState.framesSinceAnalysis = Math.max(0, Number(liveWatchState.framesSinceAnalysis || 0)) + 1;
}

function pickLiveWatchBatchFrames() {
  const all = Array.isArray(liveWatchState.frameImages) ? liveWatchState.frameImages : [];
  if (all.length === 0) {
    return [];
  }
  const summaryFrames = Math.max(2, Number(liveWatchState.summaryEveryFrames || LIVE_WATCH_SUMMARY_FRAMES));
  const maxForAnalysis = Math.max(1, Number(liveWatchState.maxImagesPerAnalysis || LIVE_WATCH_MAX_IMAGES_PER_ANALYSIS));
  const lookback = Math.max(summaryFrames, maxForAnalysis * 2);
  const recent = all.slice(-lookback);
  const deduped = [];
  let previousHash = '';
  for (const frame of recent) {
    const hash = String(frame?.hash || '');
    if (hash && hash === previousHash) {
      continue;
    }
    deduped.push(frame);
    if (hash) {
      previousHash = hash;
    }
  }
  const source = deduped.length > 0 ? deduped : recent;
  const targetCount = Math.max(1, Math.min(source.length, summaryFrames, maxForAnalysis));
  if (source.length <= targetCount) {
    return source.slice(-targetCount);
  }

  const sampled = [];
  const sampledIndexSet = new Set();
  for (let i = 0; i < targetCount; i += 1) {
    const idx = Math.round((i * (source.length - 1)) / Math.max(1, targetCount - 1));
    if (sampledIndexSet.has(idx)) {
      continue;
    }
    sampledIndexSet.add(idx);
    sampled.push(source[idx]);
  }
  for (let i = source.length - 1; i >= 0 && sampled.length < targetCount; i -= 1) {
    if (!sampled.includes(source[i])) {
      sampled.unshift(source[i]);
    }
  }
  const lastFrame = source[source.length - 1];
  if (sampled[sampled.length - 1] !== lastFrame) {
    sampled[sampled.length - 1] = lastFrame;
  }
  return sampled.slice(-targetCount);
}

function buildLiveWatchFrameBatchContext(batchFrames) {
  const list = Array.isArray(batchFrames) ? batchFrames : [];
  if (list.length === 0) {
    return '无';
  }
  return list
    .map((item, index) => {
      const at = formatLiveWatchClock(item.at);
      const context = [String(item.appName || '').trim(), String(item.windowTitle || '').trim()]
        .filter(Boolean)
        .join(' / ');
      const scope = String(item.scope || '').trim() || 'full';
      return `#${index + 1} ${at} ${scope}${context ? ` ${context}` : ''}`;
    })
    .join('\n');
}

function optimizeLiveWatchFrameData(rawData, rawMime = 'image/png') {
  let buffer = null;
  if (Buffer.isBuffer(rawData)) {
    buffer = rawData;
  } else if (rawData instanceof Uint8Array) {
    buffer = Buffer.from(rawData);
  }
  if (!buffer || buffer.length === 0) {
    return null;
  }

  let mime = guessImageMimeType('', rawMime || 'image/png');
  let image = null;
  try {
    image = nativeImage.createFromBuffer(buffer);
  } catch (_error) {
    image = null;
  }
  if (!image || image.isEmpty()) {
    return {
      data: buffer,
      mime,
    };
  }

  const size = image.getSize();
  const width = Math.max(1, Number(size.width || 0));
  const height = Math.max(1, Number(size.height || 0));
  const targetWidth = width > LIVE_WATCH_ATTACHMENT_MAX_WIDTH ? LIVE_WATCH_ATTACHMENT_MAX_WIDTH : width;
  const targetHeight = Math.max(1, Math.round((height * targetWidth) / Math.max(1, width)));
  let processed = image;
  if (targetWidth !== width || targetHeight !== height) {
    try {
      processed = image.resize({
        width: targetWidth,
        height: targetHeight,
        quality: 'good',
      });
    } catch (_error) {
      processed = image;
    }
  }

  let bestBuffer = null;
  const jpeg = processed.toJPEG(LIVE_WATCH_ATTACHMENT_JPEG_QUALITY);
  if (jpeg && jpeg.length > 0) {
    bestBuffer = jpeg;
    mime = 'image/jpeg';
  } else {
    const png = processed.toPNG();
    if (png && png.length > 0) {
      bestBuffer = png;
      mime = 'image/png';
    }
  }
  if (!bestBuffer) {
    return {
      data: buffer,
      mime,
    };
  }

  if (bestBuffer.length > CLOUD_API_IMAGE_MAX_BYTES) {
    const shrinkCandidates = [1024, 900, 800, 720, 640];
    for (const candidateWidth of shrinkCandidates) {
      if (candidateWidth >= targetWidth) {
        continue;
      }
      const candidateHeight = Math.max(1, Math.round((height * candidateWidth) / Math.max(1, width)));
      let resized = processed;
      try {
        resized = image.resize({
          width: candidateWidth,
          height: candidateHeight,
          quality: 'good',
        });
      } catch (_error) {
        resized = null;
      }
      if (!resized || resized.isEmpty()) {
        continue;
      }
      const candidateJpeg = resized.toJPEG(LIVE_WATCH_ATTACHMENT_JPEG_QUALITY);
      if (candidateJpeg && candidateJpeg.length > 0) {
        bestBuffer = candidateJpeg;
        mime = 'image/jpeg';
        if (bestBuffer.length <= CLOUD_API_IMAGE_MAX_BYTES) {
          break;
        }
      }
    }
  }

  return {
    data: bestBuffer,
    mime,
  };
}

function buildLiveWatchFrameAttachment(frame, index = 0) {
  if (!frame || !frame.data) {
    return null;
  }
  let buffer = null;
  if (Buffer.isBuffer(frame.data)) {
    buffer = frame.data;
  } else if (frame.data instanceof Uint8Array) {
    buffer = Buffer.from(frame.data);
  }
  if (!buffer || buffer.length === 0) {
    return null;
  }
  const mime = guessImageMimeType('', frame.mime || 'image/png');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  return {
    name: `live-frame-${index + 1}.${ext}`,
    mime,
    size: Number(buffer.length || 0),
    inlineData: buffer.toString('base64'),
  };
}

function buildLiveWatchBatchAttachments(batchFrames) {
  const list = Array.isArray(batchFrames) ? batchFrames : [];
  const attachments = [];
  for (let i = 0; i < list.length; i += 1) {
    const attachment = buildLiveWatchFrameAttachment(list[i], i);
    if (attachment) {
      attachments.push(attachment);
    }
  }
  return attachments;
}

function buildLiveWatchVisualMemoryContext(maxItems = 8) {
  const list = Array.isArray(liveWatchState.visualMemory) ? liveWatchState.visualMemory : [];
  if (list.length === 0) {
    return '无';
  }
  return list
    .slice(-Math.max(1, maxItems))
    .map((item) => {
      const at = formatLiveWatchClock(item.at);
      const context = [String(item.appName || '').trim(), String(item.windowTitle || '').trim()]
        .filter(Boolean)
        .join(' / ');
      return `[${at}] ${context ? `${context}: ` : ''}${item.text}`;
    })
    .join('\n');
}

function normalizeLiveQuestionKey(rawQuestion) {
  return String(rawQuestion || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;:：；"'`“”‘’()\[\]{}<>《》]/g, '')
    .slice(0, 160);
}

function extractLiveUserMessageFromPayload(payload) {
  const text = normalizeLiveDialogText(payload?.text || '', 360);
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  if (text) {
    if (attachments.length > 0) {
      return `${text}\n[附带 ${attachments.length} 个附件]`;
    }
    return text;
  }
  if (attachments.length > 0) {
    return `[用户发送了 ${attachments.length} 个附件]`;
  }
  return '';
}

function noteLiveWatchUserMessageFromPayload(payload) {
  if (!liveWatchState.running) {
    return;
  }
  const note = extractLiveUserMessageFromPayload(payload);
  if (!note) {
    return;
  }
  const now = Date.now();
  liveWatchState.lastUserMessage = note;
  liveWatchState.lastUserMessageAt = now;
  liveWatchState.forceAnalyze = true;
  setBubbleBusy('live-user', true, 'Watching...');
  appendLiveWatchDialog('user', note, now);
  if (liveWatchState.busy && typeof liveWatchState.activeRequestCancel === 'function') {
    try {
      liveWatchState.activeRequestCancel();
    } catch (_error) {
      // no-op
    }
  }
  emitLiveWatchStatus({
    phase: 'context',
    message: 'Live received your message and queued immediate rolling analysis...',
  });
  scheduleNextLiveWatchTick(120);
}

function liveWatchIsAvailable() {
  return currentRuntimeMode === 'api' && isCloudApiConfigured(cloudApiConfig);
}

async function pickLiveWatchEngine() {
  if (!isCloudApiConfigured(cloudApiConfig)) {
    throw new Error('Live watch requires cloud API configuration.');
  }
  if (currentRuntimeMode !== 'api') {
    const runLabel = currentProvider === 'claude' ? 'CLI · Claude' : 'CLI · Codex';
    throw new Error(`Live watch follows current Run channel. Current: ${runLabel}. Switch Run to API first.`);
  }
  return { runtimeMode: 'api', provider: currentProvider };
}

function emitLiveWatchStatus(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  sendChatEvent('assistant:live-watch-status', {
    available: liveWatchIsAvailable(),
    running: Boolean(liveWatchState.running),
    busy: Boolean(liveWatchState.busy),
    ...getLiveWatchSettingsSnapshot(),
    ...data,
  });
}

function computeImageFingerprintFromBuffer(rawData) {
  const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData || '');
  return createHash('sha1').update(buffer).digest('hex').slice(0, 16);
}

function normalizeLiveWatchObservation(rawText) {
  const fallbackText = String(rawText || '').trim();
  if (!fallbackText) {
    return {
      shouldNotify: false,
      severity: 'info',
      summary: '',
      reply: '',
      memoryUpdate: '',
      question: '',
      issue: false,
      confidence: 0,
      dedupeKey: '',
    };
  }

  const parseLooseField = (text, key) => {
    const lines = String(text || '').split(/\r?\n/);
    const pattern = new RegExp(`["']?${key}["']?\\s*:`, 'i');
    for (const line of lines) {
      if (!pattern.test(line)) {
        continue;
      }
      let value = line.replace(/^.*?:/, '').trim();
      value = value.replace(/,\s*$/, '').trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('`') && value.endsWith('`'))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
    return '';
  };

  const parseLooseBoolean = (text, key, fallbackValue = false) => {
    const raw = parseLooseField(text, key).toLowerCase();
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return Boolean(fallbackValue);
  };

  const parseLooseNumber = (text, key, fallbackValue = 0) => {
    const raw = parseLooseField(text, key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number(fallbackValue || 0);
  };

  try {
    const parsed = extractJsonFromText(fallbackText);
    if (parsed && typeof parsed === 'object') {
      const summary = String(parsed.summary || parsed.observation || '').trim();
      const reply = String(parsed.reply || parsed.answer || '').trim();
      const memoryUpdate = String(parsed.memory_update || parsed.memoryUpdate || '').trim();
      const question = String(parsed.question || '').trim();
      const severityRaw = String(parsed.severity || '').trim().toLowerCase();
      const severity = severityRaw === 'critical' || severityRaw === 'warn' || severityRaw === 'warning' ? 'warn' : 'info';
      const issue = Boolean(parsed.issue || parsed.has_issue);
      const shouldNotify = Boolean(parsed.should_notify) || issue || Boolean(question) || Boolean(reply);
      const confidence = Number(parsed.confidence);
      const dedupeSource = String(parsed.dedupe_key || `${severity}|${summary}|${reply}|${question}`).trim();
      return {
        shouldNotify,
        severity,
        summary,
        reply,
        memoryUpdate,
        question,
        issue,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        dedupeKey: createHash('sha1').update(dedupeSource || fallbackText).digest('hex').slice(0, 16),
      };
    }
  } catch (_error) {
    // Fallback to plain text below.
  }

  const looseSummary = parseLooseField(fallbackText, 'summary');
  const looseReply = parseLooseField(fallbackText, 'reply') || parseLooseField(fallbackText, 'answer');
  const looseMemoryUpdate = parseLooseField(fallbackText, 'memory_update') || parseLooseField(fallbackText, 'memoryUpdate');
  const looseQuestion = parseLooseField(fallbackText, 'question');
  const looseSeverity = parseLooseField(fallbackText, 'severity').toLowerCase();
  const hasLoose = Boolean(looseSummary || looseReply || looseQuestion);
  if (hasLoose) {
    const severity = looseSeverity === 'warn' || looseSeverity === 'warning' || looseSeverity === 'critical' ? 'warn' : 'info';
    const issue = parseLooseBoolean(fallbackText, 'issue', false);
    const shouldNotify =
      parseLooseBoolean(fallbackText, 'should_notify', false) || issue || Boolean(looseReply) || Boolean(looseQuestion);
    const confidence = parseLooseNumber(fallbackText, 'confidence', 0.5);
    const dedupeSource = `${severity}|${looseSummary}|${looseReply}|${looseQuestion}`;
    return {
      shouldNotify,
      severity,
      summary: looseSummary,
      reply: looseReply,
      memoryUpdate: looseMemoryUpdate,
      question: looseQuestion,
      issue,
      confidence,
      dedupeKey: createHash('sha1').update(dedupeSource).digest('hex').slice(0, 16),
    };
  }

  return {
    shouldNotify: true,
    severity: 'info',
    summary: '',
    reply: fallbackText,
    memoryUpdate: '',
    question: '',
    issue: false,
    confidence: 0.4,
    dedupeKey: createHash('sha1').update(fallbackText).digest('hex').slice(0, 16),
  };
}

async function runLiveWatchObserverTurn(payload, engine, options = {}) {
  if (engine.runtimeMode !== 'api') {
    throw new Error('Live watch in-memory mode only supports cloud API.');
  }
  const mode = String(options.mode || 'vision').trim().toLowerCase() === 'incremental' ? 'incremental' : 'vision';
  const source = mode === 'incremental' ? 'live-incremental' : 'live-watch';
  let localCancel = null;
  try {
    const result = await runCloudApiTurn(payload || {}, {
      timeoutMs: LIVE_WATCH_ANALYZE_TIMEOUT_MS,
      stream: false,
      priority: 60,
      source,
      onSpawn: ({ cancel }) => {
        localCancel = typeof cancel === 'function' ? cancel : null;
        liveWatchState.activeRequestCancel = localCancel;
      },
    });
    return {
      text: String(result.text || '').trim(),
      model: result.model || cloudApiConfig.model || 'cloud-api',
      provider: currentProvider,
      runtimeMode: 'api',
      transport: String(result.transport || ''),
      mode,
    };
  } finally {
    if (liveWatchState.activeRequestCancel === localCancel) {
      liveWatchState.activeRequestCancel = null;
    }
  }
}

function buildLiveWatchPrompt(captureInfo, watchState, diffMetrics = null, batchFrames = []) {
  const appName = String(captureInfo?.appName || '').trim() || 'unknown';
  const windowTitle = String(captureInfo?.windowTitle || '').trim() || 'unknown';
  const scope = String(captureInfo?.scope || '').trim() || 'full';
  const lastSummary = String(watchState.lastSummary || '').trim();
  const distancePct = Number(diffMetrics?.distance || 0) * 100;
  const changedRatioPct = Number(diffMetrics?.changedRatio || 0) * 100;
  const focusHint = String(watchState.focusHint || '').trim();
  const lastUserMessage = normalizeLiveDialogText(watchState.lastUserMessage || '', 320);
  const lastUserMessageAt = Number(watchState.lastUserMessageAt || 0);
  const userMessageAgeSec = lastUserMessageAt > 0 ? Math.max(0, Math.floor((Date.now() - lastUserMessageAt) / 1000)) : null;
  const recentDialog = buildLiveWatchDialogContext(6);
  const visualTimeline = buildLiveWatchVisualMemoryContext(8);
  const frameBatchContext = buildLiveWatchFrameBatchContext(batchFrames);
  const summaryEveryFrames = Math.max(2, Number(watchState.summaryEveryFrames || LIVE_WATCH_SUMMARY_FRAMES));
  const maxImageFrames = Math.max(6, Number(watchState.maxImageFrames || LIVE_WATCH_MAX_IMAGE_MEMORY));
  const bufferedImages = Array.isArray(watchState.frameImages) ? watchState.frameImages.length : 0;
  const forceAnalyze = Boolean(watchState.forceAnalyze);

  return [
    '你正在和用户实时同屏。请基于当前截图主动发现问题，并在用户提问时直接回答。',
    `当前前台应用: ${appName}`,
    `当前窗口标题: ${windowTitle}`,
    `截图范围: ${scope}`,
    `与上一帧像素差异强度: ${distancePct.toFixed(2)}%`,
    `与上一帧显著变化区域占比: ${changedRatioPct.toFixed(2)}%`,
    focusHint ? `用户关注重点: ${focusHint}` : '用户关注重点: 无（按常规质量和风险优先）',
    lastUserMessage
      ? `用户最新消息(${userMessageAgeSec === null ? '未知' : `${userMessageAgeSec}秒前`}): ${lastUserMessage}`
      : '用户最新消息: 无',
    `本轮是否因用户消息强制分析: ${forceAnalyze ? '是' : '否'}`,
    `本轮滚动上下文帧数: ${Array.isArray(batchFrames) ? batchFrames.length : 0}（窗口目标${summaryEveryFrames}帧）`,
    `图片内存缓存: ${bufferedImages}/${maxImageFrames}`,
    `本轮帧时间线:\n${frameBatchContext}`,
    `最近对话上下文:\n${recentDialog}`,
    `历史画面记忆(按时间):\n${visualTimeline}`,
    lastSummary ? `上一次提醒: ${lastSummary}` : '上一次提醒: 无',
    '',
    '返回 JSON，且只能返回 JSON：',
    '{',
    '  "should_notify": true/false,',
    '  "issue": true/false,',
    '  "severity": "info|warn",',
    '  "reply": "给用户的直接回复（有用户问题时必须非空）",',
    '  "summary": "一句话说明你看到的重点（必须具体）",',
    '  "memory_update": "把当前画面新增事实写成一句可复用记忆；若无新增可空",',
    '  "question": "若需要用户确认，给一个简短追问，否则空字符串",',
    '  "confidence": 0~1,',
    '  "dedupe_key": "用于去重的短key"',
    '}',
    '',
    '规则：',
    '- 优先围绕“用户关注重点”输出；若与重点无关，仅在高风险异常时提醒。',
    '- 用户最新消息优先级高于你之前的猜测；如果用户刚回答了你的问题，不要重复问同一句。',
    '- 若本轮是因用户消息强制分析，且用户问了问题，即使画面变化很小也要给针对性回复。',
    '- 不要写“正在查询/稍后返回”这类过程描述。能答就直接答，不能答就明确缺少什么信息并给一个追问。',
    '- 结合“历史画面记忆”回答涉及“刚才/之前/前面”的问题，不能忽略历史上下文。',
    '- memory_update 只写新增事实，不重复旧内容。',
    '- 只有在发现真实风险/异常/明显可优化点时 should_notify=true。',
    '- 如果画面正常且没有新变化，should_notify=false。',
    '- 当用户有明确问题时：reply 必须非空。',
    '- 不要臆测看不到的信息。',
    '- summary 必须基于可见内容，禁止空话。',
  ].join('\n');
}

function hasMeaningfulLiveScreenChange(diffMetrics = null) {
  const distance = Number(diffMetrics?.distance || 0);
  const changedRatio = Number(diffMetrics?.changedRatio || 0);
  return distance >= LIVE_WATCH_MIN_CHANGE_DISTANCE || changedRatio >= LIVE_WATCH_MIN_CHANGE_RATIO;
}

function shouldUseLiveVisionAnalyze({ forceAnalyze = false, hasChange = false } = {}) {
  if (forceAnalyze) {
    return true;
  }
  if (!Number(liveWatchState.lastVisionAnalyzeAt || 0)) {
    return true;
  }
  if (hasChange) {
    return true;
  }
  const textOnlyRounds = Math.max(0, Number(liveWatchState.textOnlyRoundsAfterVision || 0));
  const maxRounds = Math.max(1, Number(liveWatchState.textOnlyMaxRounds || LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS));
  if (textOnlyRounds >= maxRounds) {
    return true;
  }
  return false;
}

function buildLiveWatchIncrementalPrompt(captureInfo, watchState, diffMetrics = null) {
  const appName = String(captureInfo?.appName || '').trim() || 'unknown';
  const windowTitle = String(captureInfo?.windowTitle || '').trim() || 'unknown';
  const scope = String(captureInfo?.scope || '').trim() || 'full';
  const focusHint = String(watchState.focusHint || '').trim();
  const lastSummary = String(watchState.lastSummary || '').trim();
  const lastUserMessage = normalizeLiveDialogText(watchState.lastUserMessage || '', 320);
  const lastUserMessageAt = Number(watchState.lastUserMessageAt || 0);
  const userMessageAgeSec = lastUserMessageAt > 0 ? Math.max(0, Math.floor((Date.now() - lastUserMessageAt) / 1000)) : null;
  const distancePct = Number(diffMetrics?.distance || 0) * 100;
  const changedRatioPct = Number(diffMetrics?.changedRatio || 0) * 100;
  const noChangeStreak = Math.max(0, Number(watchState.noChangeStreak || 0));
  const textOnlyRounds = Math.max(0, Number(watchState.textOnlyRoundsAfterVision || 0));
  const recentDialog = buildLiveWatchDialogContext(6);
  const visualTimeline = buildLiveWatchVisualMemoryContext(8);

  return [
    '你在实时同屏模式下执行“增量分析”。本轮没有上传新截图，请严格基于历史视觉记忆 + 本地变化信号回答。',
    '如果信息不足，明确说“需要新截图确认”，但仍先给最可能结论与下一步建议。',
    `当前前台应用: ${appName}`,
    `当前窗口标题: ${windowTitle}`,
    `截图范围: ${scope}`,
    `本地变化信号: 差异强度 ${distancePct.toFixed(2)}%，变化区域占比 ${changedRatioPct.toFixed(2)}%`,
    `连续低变化轮数: ${noChangeStreak}`,
    `自上次视觉分析后的文本增量轮数: ${textOnlyRounds}`,
    focusHint ? `用户关注重点: ${focusHint}` : '用户关注重点: 无',
    lastUserMessage
      ? `用户最新消息(${userMessageAgeSec === null ? '未知' : `${userMessageAgeSec}秒前`}): ${lastUserMessage}`
      : '用户最新消息: 无',
    lastSummary ? `上一次提醒: ${lastSummary}` : '上一次提醒: 无',
    `最近对话上下文:\n${recentDialog}`,
    `历史画面记忆:\n${visualTimeline}`,
    '',
    '返回 JSON，且只能返回 JSON：',
    '{',
    '  "should_notify": true/false,',
    '  "issue": true/false,',
    '  "severity": "info|warn",',
    '  "reply": "给用户的直接回复（有用户问题时必须非空）",',
    '  "summary": "一句话重点结论（结合增量上下文）",',
    '  "memory_update": "新增事实；无新增可空",',
    '  "question": "若需要用户确认，给一个简短追问，否则空字符串",',
    '  "confidence": 0~1,',
    '  "dedupe_key": "用于去重的短key"',
    '}',
    '',
    '规则：',
    '- 不要编造本轮未看到的新视觉细节。',
    '- 若用户在问“当前画面是谁/是什么”，且历史记忆不足，reply 中直接说明需要新截图确认。',
    '- 用户最新消息优先级最高，直接回应，不要忽略。',
  ].join('\n');
}

function scheduleNextLiveWatchTick(delayMs = null) {
  if (!liveWatchState.running) {
    return;
  }
  if (liveWatchState.timer) {
    clearTimeout(liveWatchState.timer);
    liveWatchState.timer = null;
  }
  const waitMs = Number.isFinite(Number(delayMs)) ? Math.max(80, Number(delayMs)) : liveWatchState.intervalMs;
  liveWatchState.timer = setTimeout(() => {
    void runLiveWatchTick();
  }, waitMs);
}

async function runLiveWatchTick() {
  if (!liveWatchState.running || liveWatchState.busy) {
    return;
  }
  if (activeAutomationController) {
    scheduleNextLiveWatchTick(liveWatchState.intervalMs);
    return;
  }
  if (!liveWatchIsAvailable()) {
    emitLiveWatchStatus({
      phase: 'error',
      message: 'Live watch requires configured cloud API.',
      isError: true,
    });
    scheduleNextLiveWatchTick(liveWatchState.intervalMs);
    return;
  }

  liveWatchState.busy = true;
  const forceAnalyze = Boolean(liveWatchState.forceAnalyze);
  liveWatchState.forceAnalyze = false;
  emitLiveWatchStatus({
    phase: 'analyzing',
    message: forceAnalyze
      ? 'Live watch analyzing with your latest message...'
      : 'Live watch analyzing current screen...',
  });

  try {
    const captureInfo = await captureScreenFrameInMemory();
    const frontApp = String(captureInfo.appName || '').trim().toLowerCase();
    if (!forceAnalyze && frontApp.includes('desktop assistant')) {
      emitLiveWatchStatus({
        phase: 'idle',
        message: 'Live watch waiting for non-assistant window...',
      });
      return;
    }

    const fingerprint = computeImageFingerprintFromBuffer(captureInfo.data);
    const diffMetrics = compareFrameSignatures(liveWatchState.lastFrameSignature, captureInfo.signature);
    liveWatchState.lastFrameHash = fingerprint;
    liveWatchState.lastFrameSignature = captureInfo.signature;
    appendLiveWatchFrameImage(captureInfo, Date.now());
    const hasChange = hasMeaningfulLiveScreenChange(diffMetrics);
    if (hasChange) {
      liveWatchState.noChangeStreak = 0;
    } else {
      liveWatchState.noChangeStreak = Math.max(0, Number(liveWatchState.noChangeStreak || 0)) + 1;
    }

    const summaryFrames = Math.max(2, Number(liveWatchState.summaryEveryFrames || LIVE_WATCH_SUMMARY_FRAMES));
    const framesSinceAnalysis = Math.max(0, Number(liveWatchState.framesSinceAnalysis || 0));
    if (!forceAnalyze && !hasChange && framesSinceAnalysis < summaryFrames) {
      emitLiveWatchStatus({
        phase: 'collecting',
        message: `Live watch collecting incremental frames ${framesSinceAnalysis}/${summaryFrames}...`,
      });
      return;
    }

    const useVisionAnalyze = shouldUseLiveVisionAnalyze({
      forceAnalyze,
      hasChange,
    });
    const analysisMode = useVisionAnalyze ? 'vision' : 'incremental';
    const maxTextRounds = Math.max(1, Number(liveWatchState.textOnlyMaxRounds || LIVE_WATCH_TEXT_ONLY_MAX_ROUNDS));
    const batchFrames = useVisionAnalyze ? pickLiveWatchBatchFrames() : [];
    const prompt = useVisionAnalyze
      ? buildLiveWatchPrompt(captureInfo, liveWatchState, diffMetrics, batchFrames)
      : buildLiveWatchIncrementalPrompt(captureInfo, liveWatchState, diffMetrics);
    const attachments = useVisionAnalyze ? buildLiveWatchBatchAttachments(batchFrames) : [];
    liveWatchState.framesSinceAnalysis = 0;
    emitLiveWatchStatus({
      phase: 'summarizing',
      message: useVisionAnalyze
        ? forceAnalyze
          ? `Live watch visual analysis now (${batchFrames.length} frame(s))...`
          : `Live watch visual analysis with ${batchFrames.length} frame(s)...`
        : forceAnalyze
          ? 'Live watch incremental analysis now (text + memory)...'
          : `Live watch incremental analysis (${Math.max(0, Number(liveWatchState.textOnlyRoundsAfterVision || 0)) + 1}/${maxTextRounds})...`,
    });

    const payload = {
      text: prompt,
      attachments,
    };
    const result = await runLiveWatchObserverTurn(payload, {
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
    }, {
      mode: analysisMode,
    });
    if (useVisionAnalyze) {
      liveWatchState.lastVisionAnalyzeAt = Date.now();
      liveWatchState.textOnlyRoundsAfterVision = 0;
    } else {
      liveWatchState.textOnlyRoundsAfterVision = Math.min(
        999,
        Math.max(0, Number(liveWatchState.textOnlyRoundsAfterVision || 0)) + 1
      );
    }
    const observation = normalizeLiveWatchObservation(result.text);
    if (!observation.shouldNotify && forceAnalyze && String(liveWatchState.lastUserMessage || '').trim()) {
      observation.shouldNotify = true;
      observation.severity = 'info';
      if (!String(observation.reply || '').trim()) {
        observation.reply = `收到你的问题：${normalizeLiveDialogText(
          liveWatchState.lastUserMessage,
          120
        )}。我已继续结合当前画面分析，若你希望我直接给结论，请补充更明确目标（例如剧名/角色名）。`;
      }
      if (!String(observation.summary || '').trim()) {
        observation.summary = `已处理用户消息：${normalizeLiveDialogText(liveWatchState.lastUserMessage, 120)}。`;
      }
      if (!String(observation.dedupeKey || '').trim()) {
        observation.dedupeKey = createHash('sha1')
          .update(`force:${String(liveWatchState.lastUserMessage || '').trim()}`)
          .digest('hex')
          .slice(0, 16);
      }
    }
    const now = Date.now();
    appendLiveWatchVisualMemory(captureInfo, observation, now);
    if (!observation.shouldNotify) {
      if (forceAnalyze) {
        emitLiveWatchStatus({
          phase: 'idle',
          message: 'Live watch: received your message, no new issue on screen.',
        });
      } else if (now - Number(liveWatchState.lastIdleStatusAt || 0) >= LIVE_WATCH_IDLE_STATUS_COOLDOWN_MS) {
        liveWatchState.lastIdleStatusAt = now;
        emitLiveWatchStatus({
          phase: 'idle',
          message: 'Live watch running.',
        });
      }
      return;
    }

    let reply = String(observation.reply || '').trim();
    if (forceAnalyze && !reply && String(liveWatchState.lastUserMessage || '').trim()) {
      reply = `收到你的问题：${normalizeLiveDialogText(liveWatchState.lastUserMessage, 120)}。请再给我一个更明确线索（如作品名或角色名），我就直接给你结论。`;
      observation.reply = reply;
    }

    let question = String(observation.question || '').trim();
    const questionKey = normalizeLiveQuestionKey(question);
    const userRepliedAfterQuestion =
      Number(liveWatchState.lastUserMessageAt || 0) > Number(liveWatchState.lastQuestionAt || 0);
    if (
      question &&
      questionKey &&
      questionKey === String(liveWatchState.lastQuestionKey || '') &&
      userRepliedAfterQuestion
    ) {
      question = '';
      observation.question = '';
    }
    if (question && questionKey) {
      liveWatchState.lastQuestionKey = questionKey;
      liveWatchState.lastQuestionAt = now;
    }

    const summaryKey = createHash('sha1')
      .update(
        `${String(observation.severity || '')}|${String(observation.summary || '').trim()}|${String(
          observation.reply || ''
        ).trim()}|${String(observation.question || '').trim()}`
      )
      .digest('hex')
      .slice(0, 16);
    const userContextIsNew = forceAnalyze && Number(liveWatchState.lastUserMessageAt || 0) > Number(liveWatchState.lastNotifiedAt || 0);
    if (!userContextIsNew) {
      if (
        observation.dedupeKey &&
        observation.dedupeKey === liveWatchState.lastObservationKey &&
        now - liveWatchState.lastNotifiedAt < LIVE_WATCH_NOTIFY_COOLDOWN_MS
      ) {
        emitLiveWatchStatus({
          phase: 'idle',
          message: 'Live watch: duplicate observation skipped.',
        });
        return;
      }
      if (
        summaryKey &&
        summaryKey === liveWatchState.lastObservationSummaryKey &&
        now - liveWatchState.lastNotifiedAt < LIVE_WATCH_NOTIFY_COOLDOWN_MS * 2 &&
        diffMetrics.distance < 0.12
      ) {
        emitLiveWatchStatus({
          phase: 'idle',
          message: 'Live watch: repeated conclusion skipped.',
        });
        return;
      }
    }
    liveWatchState.lastObservationKey = observation.dedupeKey || liveWatchState.lastObservationKey;
    liveWatchState.lastObservationSummaryKey = summaryKey;
    liveWatchState.lastNotifiedAt = now;
    liveWatchState.lastSummary = observation.summary || '';
    appendLiveWatchDialog(
      'live',
      `${String(observation.reply || '').trim() || String(observation.summary || '').trim()}${
        observation.question ? `\nQuestion: ${String(observation.question).trim()}` : ''
      }`,
      now
    );

    sendChatEvent('assistant:live-watch-observation', {
      summary: observation.summary,
      reply: observation.reply,
      question: observation.question,
      severity: observation.severity,
      issue: observation.issue,
      confidence: observation.confidence,
      appName: captureInfo.appName || '',
      windowTitle: captureInfo.windowTitle || '',
      provider: result.provider,
      runtimeMode: result.runtimeMode,
      model: result.model,
      screenshotPath: '',
    });
    const bubbleText = String(observation.reply || '').trim() || String(observation.summary || '').trim();
    if (bubbleText) {
      showBubbleToast(bubbleText, {
        type: observation.severity === 'warn' ? 'warn' : 'info',
      });
    }
    emitLiveWatchStatus({
      phase: 'notified',
      message: 'Live watch found something and replied.',
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (/preempted by higher-priority request|paused by user|request paused|interrupted/i.test(message)) {
      emitLiveWatchStatus({
        phase: 'idle',
        message: 'Live watch yielding to interactive request...',
      });
      return;
    }
    liveWatchState.lastError = message;
    emitLiveWatchStatus({
      phase: 'error',
      message: `Live watch error: ${message}`,
      isError: true,
    });
  } finally {
    if (forceAnalyze) {
      setBubbleBusy('live-user', false);
    }
    liveWatchState.activeRequestCancel = null;
    liveWatchState.busy = false;
    if (liveWatchState.running) {
      const immediate = Boolean(liveWatchState.forceAnalyze);
      scheduleNextLiveWatchTick(immediate ? 100 : liveWatchState.intervalMs);
    }
  }
}

async function startLiveWatch(payload = {}) {
  if (liveWatchState.running) {
    return {
      ok: true,
      available: liveWatchIsAvailable(),
      running: true,
      busy: liveWatchState.busy,
      ...getLiveWatchSettingsSnapshot(),
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
    };
  }
  if (!liveWatchIsAvailable()) {
    throw new Error('Live watch requires configured cloud API.');
  }
  const engine = await pickLiveWatchEngine();
  assertCloudApiReady(cloudApiConfig);
  liveWatchState.running = true;
  liveWatchState.busy = false;
  applyLiveWatchSettings(payload || {}, { preserveFrames: false });
  liveWatchState.engineRuntimeMode = engine.runtimeMode;
  liveWatchState.engineProvider = engine.provider;
  liveWatchState.dialog = [];
  liveWatchState.visualMemory = [];
  liveWatchState.frameImages = [];
  liveWatchState.framesSinceAnalysis = 0;
  liveWatchState.forceAnalyze = false;
  liveWatchState.lastUserMessage = '';
  liveWatchState.lastUserMessageAt = 0;
  liveWatchState.lastQuestionKey = '';
  liveWatchState.lastQuestionAt = 0;
  liveWatchState.lastFrameHash = '';
  liveWatchState.lastFrameSignature = null;
  liveWatchState.lastObservationKey = '';
  liveWatchState.lastObservationSummaryKey = '';
  liveWatchState.lastNotifiedAt = 0;
  liveWatchState.lastIdleStatusAt = 0;
  liveWatchState.lastSummary = '';
  liveWatchState.lastError = '';
  liveWatchState.activeRequestCancel = null;
  liveWatchState.textOnlyRoundsAfterVision = 0;
  liveWatchState.noChangeStreak = 0;
  liveWatchState.lastVisionAnalyzeAt = 0;
  setBubbleBusy('live-user', false);
  emitLiveWatchStatus({
    phase: 'started',
    message: 'Live watch started (in-memory API mode).',
  });
  scheduleNextLiveWatchTick(80);
  return {
    ok: true,
    available: liveWatchIsAvailable(),
    running: true,
    busy: false,
    ...getLiveWatchSettingsSnapshot(),
    runtimeMode: liveWatchState.engineRuntimeMode,
    provider: liveWatchState.engineProvider,
  };
}

async function stopLiveWatch() {
  if (!liveWatchState.running) {
    return {
      ok: true,
      available: liveWatchIsAvailable(),
      running: false,
      busy: false,
      ...getLiveWatchSettingsSnapshot(),
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
    };
  }
  liveWatchState.running = false;
  if (liveWatchState.timer) {
    clearTimeout(liveWatchState.timer);
    liveWatchState.timer = null;
  }
  liveWatchState.forceAnalyze = false;
  if (typeof liveWatchState.activeRequestCancel === 'function') {
    try {
      liveWatchState.activeRequestCancel();
    } catch (_error) {
      // no-op
    }
  }
  liveWatchState.activeRequestCancel = null;
  liveWatchState.frameImages = [];
  liveWatchState.framesSinceAnalysis = 0;
  liveWatchState.lastFrameSignature = null;
  liveWatchState.lastIdleStatusAt = 0;
  liveWatchState.textOnlyRoundsAfterVision = 0;
  liveWatchState.noChangeStreak = 0;
  liveWatchState.lastVisionAnalyzeAt = 0;
  setBubbleBusy('live-user', false);
  emitLiveWatchStatus({
    phase: 'stopped',
    message: 'Live watch stopped.',
  });
  return {
    ok: true,
    available: liveWatchIsAvailable(),
    running: false,
    busy: liveWatchState.busy,
    ...getLiveWatchSettingsSnapshot(),
    runtimeMode: liveWatchState.engineRuntimeMode,
    provider: liveWatchState.engineProvider,
  };
}

async function quickAskFromClipboard() {
  const payload = await extractClipboardQuickAskPayload();
  if (!payload) {
    notifyQuickAskStatus('Clipboard has no usable text/image/file.', true);
    return;
  }
  await dispatchQuickAsk({
    ...payload,
    autoSend: true,
    source: 'clipboard',
  });
}

async function quickAskFromChatContext(params) {
  const rawSelection = String(params?.selectionText || '').trim();
  const srcURL = String(params?.srcURL || '').trim();
  const linkURL = String(params?.linkURL || '').trim();
  const mediaType = String(params?.mediaType || '').trim().toLowerCase();

  const attachments = [];
  let text = '';

  if (rawSelection) {
    text = rawSelection;
    for (const maybePath of parseFilePathsFromText(rawSelection)) {
      try {
        const attachment = await createAttachmentFromPath(maybePath);
        if (attachment) {
          attachments.push(attachment);
        }
      } catch (_error) {
        // ignore
      }
    }
  }

  const fileFromSrc = toLocalPathFromFileUrl(srcURL);
  if (fileFromSrc) {
    try {
      const attachment = await createAttachmentFromPath(fileFromSrc);
      if (attachment) {
        attachments.push(attachment);
      }
    } catch (_error) {
      // ignore
    }
  } else if (srcURL && mediaType === 'image') {
    text = text ? `${text}\nImage URL: ${srcURL}` : `请帮我分析这张图片：${srcURL}`;
  }

  const fileFromLink = toLocalPathFromFileUrl(linkURL);
  if (fileFromLink) {
    try {
      const attachment = await createAttachmentFromPath(fileFromLink);
      if (attachment) {
        attachments.push(attachment);
      }
    } catch (_error) {
      // ignore
    }
  } else if (linkURL) {
    text = text ? `${text}\nLink: ${linkURL}` : `请基于这个链接回答：${linkURL}`;
  }

  if (!text && attachments.length === 0) {
    notifyQuickAskStatus('Nothing to ask from current right-click target.', true);
    return;
  }

  await dispatchQuickAsk({
    text,
    attachments,
    autoSend: true,
    source: 'context-menu',
  });
}

function buildChatContextMenuTemplate(params) {
  const template = [];
  const selectionText = String(params?.selectionText || '').trim();
  const hasSelection = Boolean(selectionText);
  const hasMediaImage = String(params?.mediaType || '').toLowerCase() === 'image';
  const hasSrcURL = Boolean(String(params?.srcURL || '').trim());
  const hasLinkURL = Boolean(String(params?.linkURL || '').trim());

  if (hasSelection || hasMediaImage || hasSrcURL || hasLinkURL) {
    template.push({
      label: 'Ask Selected Content',
      click: () => {
        void quickAskFromChatContext(params).catch((error) => {
          notifyQuickAskStatus(String(error?.message || error), true);
        });
      },
    });
    template.push({ type: 'separator' });
  }

  if (params?.isEditable) {
    template.push({ role: 'undo' });
    template.push({ role: 'redo' });
    template.push({ type: 'separator' });
    template.push({ role: 'cut' });
    template.push({ role: 'copy' });
    template.push({ role: 'paste' });
    template.push({ role: 'selectAll' });
  } else {
    template.push({ role: 'copy' });
    template.push({ role: 'selectAll' });
  }

  return template;
}

function showBubbleContextMenu() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return;
  }
  const template = [
    {
      label: 'Ask Clipboard Content',
      click: () => {
        void quickAskFromClipboard().catch((error) => {
          notifyQuickAskStatus(String(error?.message || error), true);
        });
      },
    },
    { type: 'separator' },
    {
      label: chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible() ? 'Hide Assistant' : 'Show Assistant',
      click: () => {
        toggleChatWindow();
      },
    },
    {
      label: 'Settings',
      click: () => {
        openChatSettings();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: bubbleWindow });
}

function parseDeepLinkEndpoint(parsedUrl) {
  const host = String(parsedUrl?.hostname || '').trim().toLowerCase();
  const pathname = String(parsedUrl?.pathname || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
  if (host) {
    return host;
  }
  if (pathname) {
    return pathname;
  }
  return '';
}

async function buildQuickAskPayloadFromExternal(rawPayload) {
  const data = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  let text = String(data.text || '').trim();
  const fileItems = Array.isArray(data.files) ? data.files : [];
  const attachments = [];

  for (const item of fileItems) {
    try {
      const fromUrl = toLocalPathFromFileUrl(item);
      const filePath = fromUrl || String(item || '').trim();
      if (!filePath) {
        continue;
      }
      const attachment = await createAttachmentFromPath(filePath);
      if (attachment) {
        attachments.push(attachment);
      }
    } catch (_error) {
      // Ignore invalid files.
    }
  }

  if (attachments.length > 0 && text) {
    const lines = parseFilePathsFromText(text);
    if (lines.length > 0) {
      text = '';
    }
  }

  if (!text && attachments.length === 0) {
    return null;
  }
  return { text, attachments };
}

async function quickAskFromPayloadFile(rawPath) {
  const filePath = String(rawPath || '').trim();
  if (!filePath) {
    throw new Error('Payload file path is empty.');
  }
  const resolvedPath = path.resolve(filePath);
  const raw = await fs.readFile(resolvedPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error('Payload JSON is invalid.');
  }
  const payload = await buildQuickAskPayloadFromExternal(parsed);
  if (!payload) {
    throw new Error('Payload has no usable text/file content.');
  }
  await dispatchQuickAsk({
    ...payload,
    autoSend: true,
    source: 'system-service',
  });
  await fs.unlink(resolvedPath).catch(() => {});
}

async function quickAskFromDeepLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch (_error) {
    return false;
  }
  if (String(parsed.protocol || '').toLowerCase() !== `${APP_PROTOCOL}:`) {
    return false;
  }

  const endpoint = parseDeepLinkEndpoint(parsed);
  if (!endpoint) {
    return false;
  }

  if (endpoint === 'quick-ask-clipboard') {
    await quickAskFromClipboard();
    return true;
  }

  if (endpoint === 'quick-ask-file' || endpoint === 'quick-ask-payload') {
    const payloadPathRaw = parsed.searchParams.get('path') || parsed.searchParams.get('payload') || '';
    const decodedPath = decodeURIComponent(String(payloadPathRaw || '').trim());
    if (!decodedPath) {
      throw new Error('Quick ask payload path is missing.');
    }
    await quickAskFromPayloadFile(decodedPath);
    return true;
  }

  if (endpoint === 'quick-ask') {
    const text = String(parsed.searchParams.get('text') || '').trim();
    const files = parsed.searchParams
      .getAll('file')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const payload = await buildQuickAskPayloadFromExternal({ text, files });
    if (!payload) {
      throw new Error('Quick ask URL has no usable text/file content.');
    }
    await dispatchQuickAsk({
      ...payload,
      autoSend: true,
      source: 'deep-link',
    });
    return true;
  }

  return false;
}

function enqueueDeepLink(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return;
  }
  pendingDeepLinks.push(value);
}

function registerProtocolClient() {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
      return;
    }
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
  } catch (_error) {
    // Ignore protocol registration failures.
  }
}

async function flushPendingDeepLinks() {
  while (pendingDeepLinks.length > 0) {
    const rawUrl = pendingDeepLinks.shift();
    if (!rawUrl) {
      continue;
    }
    try {
      await quickAskFromDeepLink(rawUrl);
    } catch (error) {
      notifyQuickAskStatus(String(error?.message || error), true);
    }
  }
}

function getAppSettingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getReadmeCandidatePaths() {
  const candidates = [
    path.join(DESKTOP_ASSISTANT_ROOT, 'README.md'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'README.md'),
    path.join(process.resourcesPath || '', 'README.md'),
    path.join(PROJECT_ROOT, 'README.md'),
  ];
  const deduped = [];
  const seen = new Set();
  for (const item of candidates) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }
  return deduped;
}

async function openReadmeDocument() {
  const candidates = getReadmeCandidatePaths();
  for (const filePath of candidates) {
    if (!(await pathExists(filePath))) {
      continue;
    }
    const result = await shell.openPath(filePath);
    if (!result) {
      return {
        ok: true,
        path: filePath,
      };
    }
  }
  return {
    ok: false,
    error: 'README document is unavailable in current build.',
  };
}

async function removeLegacyAppSettingsFile() {
  try {
    await fs.unlink(getAppSettingsFilePath());
  } catch (_error) {
    // Ignore missing/locked files.
  }
}

async function loadAppSettings() {
  // User-level persisted settings are intentionally disabled.
  defaultChannelId = '';
  defaultChannelApplied = false;
}

async function persistAppSettings() {
  // Keep API/provider/runtime config in-memory only.
}

function getBubbleStateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

async function loadBubblePositionState() {
  try {
    const filePath = getBubbleStateFilePath();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.bubble?.x);
    const y = Number(parsed?.bubble?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      bubblePositionState = { x: Math.round(x), y: Math.round(y) };
      return;
    }
  } catch (_error) {
    // Ignore missing/corrupt state.
  }
  bubblePositionState = null;
}

async function persistBubblePositionState(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  const payload = {
    bubble: {
      x: Math.round(x),
      y: Math.round(y),
    },
  };
  const filePath = getBubbleStateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function schedulePersistBubblePosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  bubblePositionState = { x: Math.round(x), y: Math.round(y) };
  if (bubbleStateSaveTimer) {
    clearTimeout(bubbleStateSaveTimer);
  }
  bubbleStateSaveTimer = setTimeout(() => {
    bubbleStateSaveTimer = null;
    void persistBubblePositionState(bubblePositionState).catch(() => {});
  }, 180);
}

function clampBubblePosition(rawX, rawY) {
  const x = Number(rawX);
  const y = Number(rawY);
  const bubbleWidth =
    bubbleWindow && !bubbleWindow.isDestroyed() ? Math.round(bubbleWindow.getBounds().width || BUBBLE_SIZE) : BUBBLE_SIZE;
  const bubbleHeight =
    bubbleWindow && !bubbleWindow.isDestroyed() ? Math.round(bubbleWindow.getBounds().height || BUBBLE_SIZE) : BUBBLE_SIZE;
  const fallbackDisplay = screen.getPrimaryDisplay();
  const display = Number.isFinite(x) && Number.isFinite(y)
    ? screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }) || fallbackDisplay
    : fallbackDisplay;
  const workArea = display.workArea;
  const minX = workArea.x + BUBBLE_EDGE_MARGIN;
  const maxX = workArea.x + workArea.width - bubbleWidth - BUBBLE_EDGE_MARGIN;
  const minY = workArea.y + BUBBLE_EDGE_MARGIN;
  const maxY = workArea.y + workArea.height - bubbleHeight - BUBBLE_EDGE_MARGIN;
  return {
    x: Math.round(Math.min(Math.max(x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(y, minY), Math.max(minY, maxY))),
  };
}

function getInitialBubblePosition() {
  if (bubblePositionState && Number.isFinite(bubblePositionState.x) && Number.isFinite(bubblePositionState.y)) {
    return clampBubblePosition(bubblePositionState.x, bubblePositionState.y);
  }
  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.workArea.x + display.workArea.width - BUBBLE_SIZE - 12);
  const y = Math.round(display.workArea.y + 120);
  return clampBubblePosition(x, y);
}

function onBubbleWindowMoved() {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return;
  }
  const bounds = bubbleWindow.getBounds();
  schedulePersistBubblePosition({ x: bounds.x, y: bounds.y });
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    positionChatWindowNearBubble();
  }
  if (bubbleToastWindow && !bubbleToastWindow.isDestroyed() && bubbleToastWindow.isVisible()) {
    positionBubbleToastWindowNearBubble();
  }
  if (quickReplyWindow && !quickReplyWindow.isDestroyed() && quickReplyWindow.isVisible()) {
    positionQuickReplyWindowNearBubble();
  }
}

function sendBubbleEvent(channel, payload) {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return false;
  }
  try {
    bubbleWindow.webContents.send(channel, payload && typeof payload === 'object' ? payload : {});
    return true;
  } catch (_error) {
    return false;
  }
}

function emitBubbleState(label = '') {
  sendBubbleEvent('assistant:bubble-state', {
    busy: bubbleBusySources.size > 0,
    label: String(label || ''),
  });
}

function setBubbleBusy(source, busy, label = '') {
  const key = String(source || '').trim() || 'general';
  if (busy) {
    bubbleBusySources.add(key);
  } else {
    bubbleBusySources.delete(key);
  }
  emitBubbleState(label);
}

function normalizeBubbleToastText(rawText) {
  const text = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!text) {
    return '';
  }
  // Keep full text so the toast can be scrolled for long replies.
  return text;
}

function shouldShowBubbleToast() {
  const chatVisible = Boolean(chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible());
  return !chatVisible;
}

function getBubbleToastWindowHeight(count = bubbleToastItems.length) {
  const safeCount = Math.max(1, Math.min(BUBBLE_TOAST_MAX_ITEMS, Number(count || 1)));
  const itemsHeight = safeCount * BUBBLE_TOAST_ITEM_HEIGHT;
  const gapsHeight = (safeCount - 1) * BUBBLE_TOAST_ITEM_GAP;
  return itemsHeight + gapsHeight + BUBBLE_TOAST_WINDOW_PADDING * 2;
}

function buildBubbleToastPayload() {
  const sorted = [...bubbleToastItems].sort((a, b) => {
    const at = Number(a?.createdAt || 0);
    const bt = Number(b?.createdAt || 0);
    if (at !== bt) {
      return at - bt;
    }
    const as = Number(a?.seq || 0);
    const bs = Number(b?.seq || 0);
    return as - bs;
  });
  return {
    items: sorted.slice(0, BUBBLE_TOAST_MAX_ITEMS).map((item) => ({
      id: String(item.id || ''),
      text: String(item.text || ''),
      type: String(item.type || 'info'),
      createdAt: Number(item.createdAt || Date.now()),
    })),
  };
}

function buildQuickReplyContextPayloadFromToast(item) {
  return {
    source: 'bubble-toast',
    id: String(item?.id || ''),
    text: String(item?.text || ''),
    createdAt: Number(item?.createdAt || Date.now()),
  };
}

function sendQuickReplyContext(payload) {
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    return false;
  }
  try {
    quickReplyWindow.webContents.send('assistant:quick-reply-context', payload);
    return true;
  } catch (_error) {
    return false;
  }
}

function getBubbleToastItemById(rawId) {
  const id = String(rawId || '').trim();
  if (!id) {
    return null;
  }
  return bubbleToastItems.find((item) => String(item?.id || '') === id) || null;
}

function positionBubbleToastWindowNearBubble() {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || !bubbleToastWindow || bubbleToastWindow.isDestroyed()) {
    return;
  }
  const bubbleBounds = bubbleWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bubbleBounds.x, y: bubbleBounds.y });
  const workArea = display.workArea;
  const toastWidth = BUBBLE_TOAST_WIDTH;
  const toastBounds = bubbleToastWindow.getBounds();
  const toastHeight = Math.max(88, Number(toastBounds?.height || getBubbleToastWindowHeight()));

  let x = bubbleBounds.x + bubbleBounds.width + 10;
  if (x + toastWidth > workArea.x + workArea.width - 8) {
    x = bubbleBounds.x - toastWidth - 10;
  }
  x = Math.min(Math.max(x, workArea.x + 8), workArea.x + workArea.width - toastWidth - 8);

  let y = bubbleBounds.y - Math.round((toastHeight - bubbleBounds.height) / 2);
  y = Math.min(Math.max(y, workArea.y + 8), workArea.y + workArea.height - toastHeight - 8);

  bubbleToastWindow.setPosition(Math.round(x), Math.round(y), false);
}

function createBubbleToastWindow() {
  bubbleToastWindow = new BrowserWindow({
    width: BUBBLE_TOAST_WIDTH,
    height: getBubbleToastWindowHeight(),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  bubbleToastWindow.setAlwaysOnTop(true, 'screen-saver');
  bubbleToastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleToastWindow.setFullScreenable(false);
  bubbleToastWindow.loadFile(path.join(__dirname, 'renderer', 'bubble-toast.html'));
  bubbleToastWindow.webContents.on('did-finish-load', () => {
    if (!pendingBubbleToastPayload) {
      return;
    }
    try {
      bubbleToastWindow.webContents.send('assistant:bubble-toast', pendingBubbleToastPayload);
    } catch (_error) {
      // no-op
    }
  });
  bubbleToastWindow.on('closed', () => {
    bubbleToastWindow = null;
  });
}

function hideBubbleToastWindow() {
  if (!bubbleToastWindow || bubbleToastWindow.isDestroyed()) {
    return;
  }
  try {
    bubbleToastWindow.hide();
  } catch (_error) {
    // no-op
  }
}

function syncBubbleToastWindow() {
  if (!bubbleToastItems.length || !shouldShowBubbleToast()) {
    hideBubbleToastWindow();
    return;
  }
  if (!bubbleToastWindow || bubbleToastWindow.isDestroyed()) {
    createBubbleToastWindow();
  }
  if (!bubbleToastWindow || bubbleToastWindow.isDestroyed()) {
    return;
  }
  const targetHeight = getBubbleToastWindowHeight(bubbleToastItems.length);
  const bounds = bubbleToastWindow.getBounds();
  if (Math.round(bounds.width || 0) !== BUBBLE_TOAST_WIDTH || Math.round(bounds.height || 0) !== targetHeight) {
    bubbleToastWindow.setSize(BUBBLE_TOAST_WIDTH, targetHeight, false);
  }
  positionBubbleToastWindowNearBubble();
  const payload = buildBubbleToastPayload();
  pendingBubbleToastPayload = payload;
  try {
    bubbleToastWindow.webContents.send('assistant:bubble-toast', payload);
  } catch (_error) {
    // The renderer may still be loading; pending payload will be sent on did-finish-load.
  }
  bubbleToastWindow.showInactive();
  bubbleToastWindow.moveTop();
  if (quickReplyWindow && !quickReplyWindow.isDestroyed() && quickReplyWindow.isVisible()) {
    positionQuickReplyWindowNearBubble();
    quickReplyWindow.moveTop();
  }
}

function dismissBubbleToastItem(rawId) {
  const id = String(rawId || '').trim();
  if (!id) {
    return;
  }
  const nextItems = bubbleToastItems.filter((item) => String(item.id || '') !== id);
  if (nextItems.length === bubbleToastItems.length) {
    return;
  }
  bubbleToastItems = nextItems;
  pendingBubbleToastPayload = buildBubbleToastPayload();
  if (!bubbleToastItems.length) {
    hideBubbleToastWindow();
    return;
  }
  syncBubbleToastWindow();
}

function openQuickReplyFromBubbleToast(rawId) {
  const item = getBubbleToastItemById(rawId);
  if (!item) {
    return;
  }
  const payload = buildQuickReplyContextPayloadFromToast(item);
  showQuickReplyWindow({
    contextPayload: payload,
  });
}

function showBubbleToast(rawText, options = {}) {
  const text = normalizeBubbleToastText(rawText);
  if (!text) {
    return;
  }
  const typeValue = String(options.type || 'info').trim().toLowerCase();
  const type = typeValue === 'warn' || typeValue === 'error' ? typeValue : 'info';
  const seq = (bubbleToastSequence += 1);
  const createdAt = Date.now();
  const item = {
    id: `${createdAt}-${seq}`,
    text,
    type,
    createdAt,
    seq,
  };
  bubbleToastItems = [...bubbleToastItems, item].sort((a, b) => {
    const at = Number(a?.createdAt || 0);
    const bt = Number(b?.createdAt || 0);
    if (at !== bt) {
      return at - bt;
    }
    return Number(a?.seq || 0) - Number(b?.seq || 0);
  });
  while (bubbleToastItems.length > BUBBLE_TOAST_MAX_ITEMS) {
    bubbleToastItems.shift();
  }
  pendingBubbleToastPayload = buildBubbleToastPayload();
  syncBubbleToastWindow();
}

function createBubbleWindow() {
  bubbleWindow = new BrowserWindow({
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const initial = getInitialBubblePosition();
  bubbleWindow.setPosition(initial.x, initial.y);

  bubbleWindow.setAlwaysOnTop(true, 'screen-saver');
  bubbleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWindow.setFullScreenable(false);

  bubbleWindow.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
  bubbleWindow.webContents.on('did-finish-load', () => {
    emitBubbleState();
  });
  bubbleWindow.on('moved', () => {
    onBubbleWindowMoved();
  });
  bubbleWindow.on('closed', () => {
    hideQuickReplyWindow({ syncToast: false });
    bubbleWindow = null;
    if (quickReplyWindow && !quickReplyWindow.isDestroyed()) {
      try {
        quickReplyWindow.destroy();
      } catch (_error) {
        // no-op
      }
    }
    hideBubbleToastWindow();
    if (bubbleToastWindow && !bubbleToastWindow.isDestroyed()) {
      try {
        bubbleToastWindow.destroy();
      } catch (_error) {
        // no-op
      }
    }
  });
}

function createQuickReplyWindow() {
  quickReplyWindow = new BrowserWindow({
    width: QUICK_REPLY_WIDTH,
    height: QUICK_REPLY_HEIGHT,
    minWidth: QUICK_REPLY_WIDTH,
    minHeight: QUICK_REPLY_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#0e1218',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickReplyWindow.setAlwaysOnTop(true, 'floating');
  quickReplyWindow.setFullScreenable(false);
  if (process.platform === 'darwin') {
    quickReplyWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
  }
  quickReplyWindow.loadFile(path.join(__dirname, 'renderer', 'quick-reply.html'));
  quickReplyWindow.webContents.on('did-finish-load', () => {
    if (!pendingQuickReplyContextPayload) {
      return;
    }
    sendQuickReplyContext(pendingQuickReplyContextPayload);
  });
  quickReplyWindow.webContents.on('render-process-gone', () => {
    try {
      if (quickReplyWindow && !quickReplyWindow.isDestroyed()) {
        quickReplyWindow.destroy();
      }
    } catch (_error) {
      // no-op
    }
    quickReplyWindow = null;
  });
  quickReplyWindow.on('closed', () => {
    quickReplyWindow = null;
  });
}

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#0e1218',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  chatWindowLoaded = false;
  chatWindow.setAlwaysOnTop(true, 'floating');
  chatWindow.setFullScreenable(false);
  if (process.platform === 'darwin') {
    // Keep helper windows available across spaces to avoid forced desktop switches.
    chatWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
  }
  chatWindow.loadFile(path.join(__dirname, 'renderer', 'chat.html'));
  chatWindow.webContents.on('did-finish-load', () => {
    chatWindowLoaded = true;
    flushPendingChatEvents();
  });

  chatWindow.webContents.on('render-process-gone', () => {
    try {
      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.destroy();
      }
    } catch (_error) {
      // no-op
    }
    chatWindowLoaded = false;
    chatWindow = null;
  });

  chatWindow.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    const template = buildChatContextMenuTemplate(params || {});
    if (!Array.isArray(template) || template.length === 0) {
      return;
    }
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: chatWindow });
  });
}

function positionChatWindowNearBubble() {
  if (!bubbleWindow || !chatWindow) {
    return;
  }

  const bubbleBounds = bubbleWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bubbleBounds.x, y: bubbleBounds.y });
  const workArea = display.workArea;

  const [chatWidth, chatHeight] = chatWindow.getSize();
  let x = bubbleBounds.x - chatWidth - 12;
  if (x < workArea.x + 8) {
    x = bubbleBounds.x + bubbleBounds.width + 12;
  }
  if (x + chatWidth > workArea.x + workArea.width - 8) {
    x = workArea.x + workArea.width - chatWidth - 8;
  }

  let y = bubbleBounds.y;
  if (y + chatHeight > workArea.y + workArea.height - 8) {
    y = workArea.y + workArea.height - chatHeight - 8;
  }
  if (y < workArea.y + 8) {
    y = workArea.y + 8;
  }

  chatWindow.setPosition(Math.round(x), Math.round(y), false);
}

function positionQuickReplyWindowNearBubble() {
  if (!bubbleWindow || !quickReplyWindow) {
    return;
  }

  const bubbleBounds = bubbleWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bubbleBounds.x, y: bubbleBounds.y });
  const workArea = display.workArea;

  const [replyWidth, replyHeight] = quickReplyWindow.getSize();
  const canAnchorToToast =
    bubbleToastWindow &&
    !bubbleToastWindow.isDestroyed() &&
    bubbleToastWindow.isVisible() &&
    bubbleToastItems.length > 0 &&
    shouldShowBubbleToast();

  let x = 0;
  let y = 0;
  if (canAnchorToToast) {
    const toastBounds = bubbleToastWindow.getBounds();
    x = toastBounds.x + toastBounds.width - replyWidth;
    y = toastBounds.y + toastBounds.height + 8;
    if (y + replyHeight > workArea.y + workArea.height - 8) {
      const aboveY = toastBounds.y - replyHeight - 8;
      if (aboveY >= workArea.y + 8) {
        y = aboveY;
      } else {
        y = workArea.y + workArea.height - replyHeight - 8;
      }
    }
  } else {
    x = bubbleBounds.x + bubbleBounds.width + 12;
    if (x + replyWidth > workArea.x + workArea.width - 8) {
      x = bubbleBounds.x - replyWidth - 12;
    }
    y = bubbleBounds.y - Math.round((replyHeight - bubbleBounds.height) / 2);
    if (y + replyHeight > workArea.y + workArea.height - 8) {
      y = workArea.y + workArea.height - replyHeight - 8;
    }
    if (y < workArea.y + 8) {
      y = workArea.y + 8;
    }
  }

  if (x < workArea.x + 8) {
    x = workArea.x + 8;
  }
  if (x + replyWidth > workArea.x + workArea.width - 8) {
    x = workArea.x + workArea.width - replyWidth - 8;
  }
  if (y < workArea.y + 8) {
    y = workArea.y + 8;
  }
  if (y + replyHeight > workArea.y + workArea.height - 8) {
    y = workArea.y + workArea.height - replyHeight - 8;
  }
  quickReplyWindow.setPosition(Math.round(x), Math.round(y), false);
}

function showChatWindow() {
  if (!chatWindow) {
    return;
  }
  hideQuickReplyWindow({ syncToast: false });
  hideBubbleToastWindow();
  positionChatWindowNearBubble();
  // Avoid forcing focus change, which can trigger macOS to jump to another desktop.
  if (chatWindow.isVisible()) {
    chatWindow.moveTop();
    chatWindow.webContents.send('assistant:focus-input');
    return;
  }
  chatWindow.showInactive();
  chatWindow.moveTop();
  chatWindow.webContents.send('assistant:focus-input');
}

function openChatSettings(tab = '') {
  if (!chatWindow || chatWindow.isDestroyed()) {
    createChatWindow();
  }
  showChatWindow();
  const normalizedTab = String(tab || '').trim().toLowerCase();
  sendChatEvent('assistant:open-settings', normalizedTab ? { tab: normalizedTab } : {});
}

function showQuickReplyWindow(options = {}) {
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    hideChatWindow();
  }
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    createQuickReplyWindow();
  }
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    return;
  }
  const contextPayload =
    options?.contextPayload && typeof options.contextPayload === 'object' ? options.contextPayload : null;
  if (contextPayload) {
    pendingQuickReplyContextPayload = contextPayload;
  } else if (options?.clearContext) {
    pendingQuickReplyContextPayload = {
      source: '',
      id: '',
      text: '',
      createdAt: Date.now(),
    };
  }
  positionQuickReplyWindowNearBubble();
  if (quickReplyWindow.isVisible()) {
    quickReplyWindow.moveTop();
    if (pendingQuickReplyContextPayload) {
      sendQuickReplyContext(pendingQuickReplyContextPayload);
    }
    quickReplyWindow.webContents.send('assistant:focus-quick-reply');
    return;
  }
  quickReplyWindow.showInactive();
  quickReplyWindow.moveTop();
  if (pendingQuickReplyContextPayload) {
    sendQuickReplyContext(pendingQuickReplyContextPayload);
  }
  quickReplyWindow.webContents.send('assistant:focus-quick-reply');
}

function hideQuickReplyWindow(options = {}) {
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    return;
  }
  const shouldSyncToast = options?.syncToast !== false;
  quickReplyWindow.hide();
  if (shouldSyncToast) {
    syncBubbleToastWindow();
  }
}

function toggleQuickReplyWindow() {
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    createQuickReplyWindow();
  }
  if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
    return;
  }
  if (quickReplyWindow.isVisible()) {
    hideQuickReplyWindow();
    return;
  }
  showQuickReplyWindow({
    clearContext: true,
  });
}

function hideChatWindow() {
  if (!chatWindow) {
    return;
  }
  chatWindow.hide();
  syncBubbleToastWindow();
}

function toggleChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    createChatWindow();
  }
  if (chatWindow.isVisible()) {
    hideChatWindow();
    return;
  }
  showChatWindow();
}

ipcMain.on('bubble:toggle-chat', () => {
  toggleChatWindow();
});

ipcMain.on('bubble:toggle-quick-reply', () => {
  toggleQuickReplyWindow();
});

ipcMain.on('quick-reply:show', () => {
  showQuickReplyWindow({
    clearContext: true,
  });
});

ipcMain.on('bubble:context-menu', () => {
  showBubbleContextMenu();
});

ipcMain.on('assistant:bubble-toast-close', (_event, payload) => {
  dismissBubbleToastItem(payload?.id);
});

ipcMain.on('assistant:bubble-toast-quick-reply', (_event, payload) => {
  openQuickReplyFromBubbleToast(payload?.id);
});

ipcMain.on('bubble:drag-start', (_event, payload) => {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    return;
  }
  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return;
  }
  const bounds = bubbleWindow.getBounds();
  bubbleDragState = {
    offsetX: screenX - bounds.x,
    offsetY: screenY - bounds.y,
  };
});

ipcMain.on('bubble:drag-move', (_event, payload) => {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || !bubbleDragState) {
    return;
  }
  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return;
  }
  const x = screenX - bubbleDragState.offsetX;
  const y = screenY - bubbleDragState.offsetY;
  const clamped = clampBubblePosition(x, y);
  bubbleWindow.setPosition(clamped.x, clamped.y, false);
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    positionChatWindowNearBubble();
  }
  if (bubbleToastWindow && !bubbleToastWindow.isDestroyed() && bubbleToastWindow.isVisible()) {
    positionBubbleToastWindowNearBubble();
  }
  if (quickReplyWindow && !quickReplyWindow.isDestroyed() && quickReplyWindow.isVisible()) {
    positionQuickReplyWindowNearBubble();
  }
});

ipcMain.on('bubble:drag-end', () => {
  bubbleDragState = null;
  onBubbleWindowMoved();
});

ipcMain.on('chat:hide', () => {
  hideChatWindow();
});

ipcMain.on('chat:show', () => {
  showChatWindow();
});

ipcMain.on('quick-reply:hide', () => {
  hideQuickReplyWindow();
});

ipcMain.on('quick-reply:open-chat', () => {
  showChatWindow();
});

ipcMain.on('chat:clear', () => {
  resetConversationState();
});

ipcMain.on('app:quit', () => {
  app.quit();
});

ipcMain.handle('assistant:get-config', async () => {
  const channels = await listAvailableChannels({ force: true });
  const [permissions, runtimeHealth, resolvedCodexBin, resolvedClaudeBin] = await Promise.all([
    Promise.resolve(getPermissionSnapshot()),
    getRuntimeHealthSnapshot(),
    getProviderCommand('codex').catch(() => CODEX_BIN),
    getProviderCommand('claude').catch(() => CLAUDE_BIN),
  ]);
  if (!defaultChannelApplied) {
    defaultChannelApplied = true;
    const configuredDefaultChannelId = normalizeChannelIdOrEmpty(defaultChannelId);
    if (configuredDefaultChannelId) {
      const defaultAvailable = channels.some(
        (item) => String(item?.id || '').toLowerCase() === configuredDefaultChannelId
      );
      if (defaultAvailable && configuredDefaultChannelId !== getActiveChannelId()) {
        applyChannelSelection(configuredDefaultChannelId);
        void persistAppSettings().catch(() => {});
      }
    }
  }
  let activeChannelId = getActiveChannelId();
  if (channels.length === 0) {
    activeChannelId = '';
  } else {
    const hasActive = channels.some((item) => String(item?.id || '').toLowerCase() === activeChannelId);
    if (!hasActive) {
      const fallbackId = normalizeChannelId(channels[0].id);
      applyChannelSelection(fallbackId);
      activeChannelId = getActiveChannelId();
      void persistAppSettings().catch(() => {});
    }
  }
  return {
    ok: true,
    provider: currentProvider,
    providers: Array.from(SUPPORTED_PROVIDERS),
    runtimeMode: currentRuntimeMode,
    runtimeModes: Array.from(SUPPORTED_RUNTIME_MODES),
    apiTemplates: Array.from(SUPPORTED_API_TEMPLATES),
    apiConfig: buildPublicApiConfig(cloudApiConfig),
    cloudRealtime: {
      enabled: CLOUD_API_REALTIME_ENABLED,
      supported: cloudApiSupportsRealtime(cloudApiConfig),
      connected: Boolean(realtimeState.socket && realtimeState.socket.readyState === 1),
      active: Boolean(realtimeState.active),
    },
    channels,
    activeChannelId,
    defaultChannelId: defaultChannelId || '',
    codexBin: resolvedCodexBin,
    claudeBin: resolvedClaudeBin,
    model: currentProvider === 'claude' ? CLAUDE_MODEL || null : CODEX_MODEL || null,
    workdir: currentWorkdir,
    hasThread: Boolean(codexThreadId || claudeSessionId),
    automationUnlimited: true,
    automationEngine: AUTOMATION_ENGINE,
    hasClaudeMcp: CLAUDE_MCP_CONFIGS.length > 0,
    permissions,
    runtimeHealth,
    liveWatch: {
      available: liveWatchIsAvailable(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
      ...getLiveWatchSettingsSnapshot(),
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
      lastError: String(liveWatchState.lastError || ''),
    },
  };
});

ipcMain.handle('assistant:live-watch-start', async (_event, payload) => {
  try {
    return await startLiveWatch(payload || {});
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      available: liveWatchIsAvailable(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
      ...getLiveWatchSettingsSnapshot(),
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
    };
  }
});

ipcMain.handle('assistant:live-watch-stop', async () => {
  try {
    return await stopLiveWatch();
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      available: liveWatchIsAvailable(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
      ...getLiveWatchSettingsSnapshot(),
      runtimeMode: liveWatchState.engineRuntimeMode,
      provider: liveWatchState.engineProvider,
    };
  }
});

ipcMain.handle('assistant:live-watch-focus', async (_event, payload) => {
  try {
    const action = String(payload?.action || 'set')
      .trim()
      .toLowerCase();
    if (action === 'clear') {
      liveWatchState.focusHint = '';
    } else {
      liveWatchState.focusHint = normalizeLiveWatchFocusHint(payload?.focus || '');
    }
    emitLiveWatchStatus({
      phase: 'focus',
      message: liveWatchState.focusHint ? `Live focus updated: ${liveWatchState.focusHint}` : 'Live focus cleared.',
    });
    return {
      ok: true,
      ...getLiveWatchSettingsSnapshot(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      ...getLiveWatchSettingsSnapshot(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
    };
  }
});

ipcMain.handle('assistant:set-live-watch-config', async (_event, payload) => {
  try {
    applyLiveWatchSettings(payload || {}, { preserveFrames: true });
    if (liveWatchState.running) {
      scheduleNextLiveWatchTick(80);
      emitLiveWatchStatus({
        phase: 'config',
        message: 'Live watch config updated.',
      });
    }
    await persistAppSettings();
    return {
      ok: true,
      ...getLiveWatchSettingsSnapshot(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
      available: liveWatchIsAvailable(),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      ...getLiveWatchSettingsSnapshot(),
      running: Boolean(liveWatchState.running),
      busy: Boolean(liveWatchState.busy),
      available: liveWatchIsAvailable(),
    };
  }
});

ipcMain.handle('assistant:switch-channel', async (_event, payload) => {
  try {
    const channelId = normalizeChannelId(payload?.channelId);
    const channels = await listAvailableChannels({ force: true });
    const isAvailable = channels.some((item) => String(item?.id || '').toLowerCase() === channelId);
    if (!isAvailable) {
      throw new Error(`Channel is unavailable: ${channelId}`);
    }

    if (channelId === 'api') {
      assertCloudApiReady(cloudApiConfig);
    } else if (channelId === 'cli:claude') {
      await assertProviderReadyOrDetected('claude');
    } else {
      await assertProviderReadyOrDetected('codex');
    }
    applyChannelSelection(channelId);

    if (liveWatchState.running) {
      await stopLiveWatch();
    }
    resetConversationState();
    clearChannelOptionsCache();
    await persistAppSettings();
    const refreshedChannels = await listAvailableChannels({ force: true });
    return {
      ok: true,
      provider: currentProvider,
      runtimeMode: currentRuntimeMode,
      activeChannelId: getActiveChannelId(),
      apiConfig: buildPublicApiConfig(cloudApiConfig),
      channels: refreshedChannels,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:set-default-channel', async (_event, payload) => {
  try {
    const requested = normalizeChannelIdOrEmpty(payload?.channelId);
    if (requested) {
      const channels = await listAvailableChannels({ force: true });
      const available = channels.some((item) => String(item?.id || '').toLowerCase() === requested);
      if (!available) {
        throw new Error(`Default channel is unavailable: ${requested}`);
      }
    }
    defaultChannelId = requested;
    await persistAppSettings();
    return {
      ok: true,
      defaultChannelId: defaultChannelId || '',
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:set-runtime-mode', async (_event, payload) => {
  try {
    const mode = normalizeRuntimeMode(payload?.runtimeMode);
    if (mode === 'api') {
      assertCloudApiReady(cloudApiConfig);
    }
    currentRuntimeMode = mode;
    if (liveWatchState.running) {
      await stopLiveWatch();
    }
    resetConversationState();
    clearChannelOptionsCache();
    await persistAppSettings();
    const channels = await listAvailableChannels({ force: true });
    return {
      ok: true,
      runtimeMode: currentRuntimeMode,
      activeChannelId: getActiveChannelId(),
      apiConfig: buildPublicApiConfig(cloudApiConfig),
      channels,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:set-api-config', async (_event, payload) => {
  try {
    const next = normalizeCloudApiConfig(payload || {}, { allowKeepEmptyKey: true });
    cloudApiConfig = next;
    closeCloudRealtimeSocket('api config updated');
    clearChannelOptionsCache();
    await persistAppSettings();
    const channels = await listAvailableChannels({ force: true });
    return {
      ok: true,
      apiConfig: buildPublicApiConfig(cloudApiConfig),
      channels,
      activeChannelId: getActiveChannelId(),
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:request-microphone-access', async () => {
  try {
    return await ensureMicrophonePermission();
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      error: String(error?.message || error),
    };
  }
});

ipcMain.handle('assistant:get-permissions', async () => {
  try {
    return {
      ok: true,
      permissions: getPermissionSnapshot(),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      permissions: getPermissionSnapshot(),
    };
  }
});

ipcMain.handle('assistant:request-permission', async (_event, payload) => {
  try {
    return await requestPermission(payload?.kind);
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      snapshot: getPermissionSnapshot(),
    };
  }
});

ipcMain.handle('assistant:open-permission-settings', async (_event, payload) => {
  try {
    return await openPermissionSettings(payload?.kind);
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      snapshot: getPermissionSnapshot(),
    };
  }
});

ipcMain.handle('assistant:get-runtime-health', async () => {
  try {
    return {
      ok: true,
      runtimeHealth: await getRuntimeHealthSnapshot(),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
    };
  }
});

ipcMain.handle('assistant:open-readme', async () => {
  try {
    return await openReadmeDocument();
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
    };
  }
});

ipcMain.handle('assistant:transcribe-audio', async (_event, payload) => {
  try {
    const result = await runCloudAudioTranscription(payload || {});
    return {
      ok: true,
      text: result.text,
      model: result.model,
      bytes: result.bytes,
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
    };
  }
});

ipcMain.handle('assistant:set-provider', async (_event, payload) => {
  try {
    const provider = normalizeProvider(payload?.provider);
    await assertProviderReadyOrDetected(provider);
    currentProvider = provider;
    currentRuntimeMode = 'cli';
    if (liveWatchState.running) {
      await stopLiveWatch();
    }
    resetConversationState();
    clearChannelOptionsCache();
    await persistAppSettings();
    const channels = await listAvailableChannels({ force: true });
    return {
      ok: true,
      provider: currentProvider,
      runtimeMode: currentRuntimeMode,
      activeChannelId: getActiveChannelId(),
      channels,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:set-workdir', async (_event, payload) => {
  try {
    const next = normalizeWorkdirPath(payload?.workdir);
    await validateWorkdirPath(next);
    currentWorkdir = next;
    resetConversationState();
    return { ok: true, workdir: currentWorkdir };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:pick-workdir', async () => {
  try {
    const ownerWindow = chatWindow && !chatWindow.isDestroyed() ? chatWindow : bubbleWindow;
    const result = await dialog.showOpenDialog(ownerWindow || undefined, {
      title: 'Select Codex Work Directory',
      defaultPath: currentWorkdir,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return { ok: true, canceled: true };
    }

    const picked = normalizeWorkdirPath(result.filePaths[0]);
    await validateWorkdirPath(picked);

    return { ok: true, canceled: false, workdir: picked };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('assistant:send', async (_event, payload) => {
  let localCancel = null;
  const senderContents = _event?.sender || null;
  const fromQuickReply = isSenderWebContents(senderContents, quickReplyWindow);
  const requestedMode = String(payload?.mode || '').trim().toLowerCase();
  const liveOnlyMode = (requestedMode === 'live_only' || requestedMode === '') && liveWatchState.running;
  const requestId = String(payload?.requestId || '').trim();
  const userTranscriptText = buildUserTranscriptTextFromPayload(payload || {});
  const emitStream = (data) => {
    if (!requestId) {
      return;
    }
    try {
      _event.sender.send('assistant:response-stream', {
        requestId,
        ...(data && typeof data === 'object' ? data : {}),
      });
    } catch (_error) {
      // ignore renderer send failures
    }
  };
  try {
    if (fromQuickReply && userTranscriptText) {
      syncConversationMessageToChat('user', userTranscriptText, {
        source: 'quick-reply',
        requestId,
      });
    }
    if (liveOnlyMode) {
      noteLiveWatchUserMessageFromPayload(payload || {});
      if (fromQuickReply) {
        syncConversationMessageToChat('system', 'Message queued to Live watch.', {
          source: 'quick-reply',
          requestId,
        });
      }
      return {
        ok: true,
        liveOnly: true,
        text: '',
        usage: null,
        model: null,
        provider: currentProvider,
        runtimeMode: currentRuntimeMode,
        threadId: null,
        workdir: currentWorkdir,
      };
    }
    setBubbleBusy('send', true, 'Thinking...');
    emitStream({
      phase: 'start',
    });
    const result = await runActiveProviderTurn(payload || {}, {
      onSpawn: ({ cancel }) => {
        localCancel = cancel;
        activeSendCancel = cancel;
      },
      onDelta: (delta, meta = {}) => {
        emitStream({
          phase: 'delta',
          delta: String(delta || ''),
          transport: String(meta.transport || ''),
        });
      },
      priority: 100,
      source: 'chat',
      requestId,
    });
    emitStream({
      phase: 'done',
      text: String(result.text || ''),
      transport: String(result.transport || ''),
    });
    showBubbleToast(result.text || '', {
      type: 'info',
    });
    if (fromQuickReply) {
      syncConversationMessageToChat('assistant', result.text || '(empty response)', {
        source: 'quick-reply',
        requestId,
      });
    }
    return {
      ok: true,
      text: result.text,
      usage: result.usage || null,
      model: result.model || (result.provider === 'claude' ? 'claude' : 'codex'),
      provider: result.provider || currentProvider,
      runtimeMode: result.runtimeMode || currentRuntimeMode,
      threadId: result.threadId || result.sessionId || null,
      workdir: result.workdir,
    };
  } catch (error) {
    const message = String(error?.message || error);
    emitStream({
      phase: 'error',
      error: message,
    });
    showBubbleToast(`Error: ${message}`, {
      type: 'error',
    });
    if (fromQuickReply) {
      syncConversationMessageToChat('system', `Error: ${message}`, {
        source: 'quick-reply',
        requestId,
      });
    }
    return {
      ok: false,
      error: message,
    };
  } finally {
    setBubbleBusy('send', false);
    if (activeSendCancel === localCancel) {
      activeSendCancel = null;
    }
  }
});

ipcMain.handle('assistant:interrupt-send', async () => {
  if (typeof activeSendCancel !== 'function') {
    return { ok: false, error: 'No active send request.' };
  }
  const cancelled = activeSendCancel();
  return cancelled ? { ok: true } : { ok: false, error: 'No active send request.' };
});

ipcMain.handle('assistant:automation-run', async (_event, payload) => {
  if (activeAutomationController) {
    return { ok: false, error: 'Automation is already running.' };
  }
  const controller = createAutomationController();
  activeAutomationController = controller;
  setBubbleBusy('auto', true, 'Running...');
  const notify = (update) => {
    try {
      _event.sender.send('assistant:automation-status', update);
    } catch (_error) {
      // Ignore renderer send failures.
    }
  };
  try {
    const result = await runAutomationGoal(payload || {}, notify, controller);
    showBubbleToast(result?.finalAnswer || 'Automation completed.', {
      type: result?.completed ? 'info' : 'warn',
    });
    return { ok: true, ...result };
  } catch (error) {
    const message = String(error?.message || error);
    if (/paused by user/i.test(message)) {
      notify({
        phase: 'paused',
        detail: message,
      });
    } else {
      notify({
        phase: 'error',
        error: message,
      });
    }
    showBubbleToast(`Automation error: ${message}`, {
      type: 'error',
    });
    return { ok: false, error: message };
  } finally {
    setBubbleBusy('auto', false);
    if (activeAutomationController === controller) {
      activeAutomationController = null;
    }
  }
});

ipcMain.handle('assistant:interrupt-automation', async () => {
  if (!activeAutomationController || typeof activeAutomationController.requestCancel !== 'function') {
    return { ok: false, error: 'No active automation run.' };
  }
  const accepted = activeAutomationController.requestCancel();
  if (!accepted) {
    return { ok: false, error: 'Pause already requested.' };
  }
  return { ok: true };
});

app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  if (!appReadyForDeepLinks) {
    enqueueDeepLink(rawUrl);
    return;
  }
  void quickAskFromDeepLink(rawUrl).catch((error) => {
    notifyQuickAskStatus(String(error?.message || error), true);
  });
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  configureAssistantPermissionHandlers();
  registerProtocolClient();
  try {
    await ensureEmbeddedNodeShim();
  } catch (_error) {
    embeddedNodeShimDir = '';
  }
  for (const arg of process.argv) {
    if (String(arg || '').toLowerCase().startsWith(`${APP_PROTOCOL}://`)) {
      enqueueDeepLink(arg);
    }
  }

  await Promise.all([loadBubblePositionState(), removeLegacyAppSettingsFile(), loadAppSettings()]);
  createBubbleWindow();
  createQuickReplyWindow();
  createChatWindow();
  appReadyForDeepLinks = true;
  await flushPendingDeepLinks();

  app.on('activate', () => {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) {
      createBubbleWindow();
    }
    if (!chatWindow || chatWindow.isDestroyed()) {
      createChatWindow();
    }
    if (!quickReplyWindow || quickReplyWindow.isDestroyed()) {
      createQuickReplyWindow();
    }
  });
});

app.on('before-quit', () => {
  bubbleToastItems = [];
  pendingBubbleToastPayload = null;
  hideBubbleToastWindow();
  bubbleBusySources.clear();
  closeCloudRealtimeSocket('app quitting');
  liveWatchState.running = false;
  if (liveWatchState.timer) {
    clearTimeout(liveWatchState.timer);
    liveWatchState.timer = null;
  }
  if (bubbleStateSaveTimer) {
    clearTimeout(bubbleStateSaveTimer);
    bubbleStateSaveTimer = null;
  }
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    const bounds = bubbleWindow.getBounds();
    void persistBubblePositionState({ x: bounds.x, y: bounds.y }).catch(() => {});
  }
  void persistAppSettings().catch(() => {});
});

app.on('window-all-closed', () => {
  // Keep running as a desktop helper unless explicitly quit.
});
