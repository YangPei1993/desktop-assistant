const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const autoBtn = document.getElementById('auto-btn');
const hideBtn = document.getElementById('hide-btn');
const clearBtn = document.getElementById('clear-btn');
const fileInput = document.getElementById('file-input');
const attachmentList = document.getElementById('attachment-list');
const statusLine = document.getElementById('status-line');
const voiceBtn = document.getElementById('voice-btn');
const liveBtn = document.getElementById('live-btn');
const composerEl = document.querySelector('.composer');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const channelSelect = document.getElementById('channel-select');
const channelSwitchBtn = document.getElementById('channel-switch-btn');
const workdirInput = document.getElementById('workdir-input');
const workdirPickBtn = document.getElementById('workdir-pick-btn');
const workdirApplyBtn = document.getElementById('workdir-apply-btn');
const defaultChannelSelect = document.getElementById('default-channel-select');
const defaultChannelSaveBtn = document.getElementById('default-channel-save-btn');
const apiTemplateSelect = document.getElementById('api-template-select');
const apiTemplateFillBtn = document.getElementById('api-template-fill-btn');
const apiBaseInput = document.getElementById('api-base-input');
const apiModelInput = document.getElementById('api-model-input');
const apiKeyInput = document.getElementById('api-key-input');
const apiSaveBtn = document.getElementById('api-save-btn');
const liveIntervalInput = document.getElementById('live-interval-input');
const liveSummaryFramesInput = document.getElementById('live-summary-frames-input');
const liveMaxImageFramesInput = document.getElementById('live-max-image-frames-input');
const liveMaxImagesAnalysisInput = document.getElementById('live-max-images-analysis-input');
const liveTextOnlyRoundsInput = document.getElementById('live-text-only-rounds-input');
const liveSaveBtn = document.getElementById('live-save-btn');
const runtimeHealthNote = document.getElementById('runtime-health-note');
const permissionRefreshBtn = document.getElementById('permission-refresh-btn');
const permissionStatusMic = document.getElementById('permission-status-microphone');
const permissionStatusScreen = document.getElementById('permission-status-screen');
const permissionStatusAccessibility = document.getElementById('permission-status-accessibility');
const permissionStatusAutomation = document.getElementById('permission-status-automation');
const permissionRequestMicBtn = document.getElementById('permission-request-microphone');
const permissionOpenMicBtn = document.getElementById('permission-open-microphone');
const permissionRequestScreenBtn = document.getElementById('permission-request-screen');
const permissionOpenScreenBtn = document.getElementById('permission-open-screen');
const permissionRequestAccessibilityBtn = document.getElementById('permission-request-accessibility');
const permissionOpenAccessibilityBtn = document.getElementById('permission-open-accessibility');
const permissionRequestAutomationBtn = document.getElementById('permission-request-automation');
const permissionOpenAutomationBtn = document.getElementById('permission-open-automation');
const aboutReadmeLink = document.getElementById('about-readme-link');
const settingsTabButtons = Array.from(document.querySelectorAll('[data-settings-tab]'));
const settingsTabPanels = Array.from(document.querySelectorAll('[data-settings-panel]'));

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const MediaRecorderCtor = window.MediaRecorder || null;

const state = {
  sending: false,
  activeRequestId: '',
  streamMessageEl: null,
  streamMessageBodyEl: null,
  streamText: '',
  streamUsedForActiveRequest: false,
  pausingSend: false,
  pausingAutomation: false,
  attachments: [],
  listening: false,
  transcribingVoice: false,
  voiceMode: '',
  recognition: null,
  mediaRecorder: null,
  mediaStream: null,
  mediaMimeType: '',
  mediaChunks: [],
  voiceTicker: null,
  voiceStartedAt: 0,
  finalVoiceText: '',
  provider: 'codex',
  runtimeMode: 'cli',
  activeChannelId: 'cli:codex',
  defaultChannelId: '',
  channels: [],
  settingsOpen: false,
  settingsTab: 'api',
  permissionsLoading: false,
  permissions: {
    items: {
      microphone: { status: 'unknown', canRequest: true, canOpenSettings: true },
      screen: { status: 'unknown', canRequest: true, canOpenSettings: true },
      accessibility: { status: 'unknown', canRequest: true, canOpenSettings: true },
      automation: { status: 'unknown', canRequest: true, canOpenSettings: true },
    },
    updatedAt: '',
  },
  runtimeHealth: null,
  apiConfig: {
    template: 'openai',
    baseUrl: '',
    model: '',
    hasApiKey: false,
    keyPreview: '',
  },
  workdir: '',
  automationBusy: false,
  automationProgressEvents: 0,
  automationResultShown: false,
  lastAutomationResult: '',
  liveWatchRunning: false,
  liveWatchBusy: false,
  liveWatchIntervalMs: 2500,
  liveWatchSummaryEveryFrames: 3,
  liveWatchMaxImageFrames: 30,
  liveWatchMaxImagesPerAnalysis: 3,
  liveWatchTextOnlyMaxRounds: 4,
  liveWatchAvailable: false,
  liveWatchFocusHint: '',
};

function setSendButtonMode(mode) {
  // mode: idle | sending | pausing
  if (mode === 'sending') {
    sendBtn.textContent = 'Pause';
    sendBtn.disabled = false;
    sendBtn.classList.add('pause-mode');
    return;
  }
  if (mode === 'pausing') {
    sendBtn.textContent = 'Pausing...';
    sendBtn.disabled = true;
    sendBtn.classList.add('pause-mode');
    return;
  }
  sendBtn.textContent = 'Send';
  sendBtn.disabled = false;
  sendBtn.classList.remove('pause-mode');
}

function setAutoButtonMode(mode) {
  // mode: idle | running | pausing
  if (mode === 'running') {
    autoBtn.textContent = 'Pause';
    autoBtn.disabled = false;
    autoBtn.classList.add('pause-mode');
    return;
  }
  if (mode === 'pausing') {
    autoBtn.textContent = 'Pausing...';
    autoBtn.disabled = true;
    autoBtn.classList.add('pause-mode');
    return;
  }
  autoBtn.textContent = 'Auto';
  autoBtn.disabled = false;
  autoBtn.classList.remove('pause-mode');
}

function setLiveButtonMode(mode) {
  // mode: idle | running | stopping
  if (mode === 'running') {
    liveBtn.textContent = 'Watching';
    liveBtn.disabled = false;
    liveBtn.classList.add('pause-mode');
    return;
  }
  if (mode === 'stopping') {
    liveBtn.textContent = 'Stopping...';
    liveBtn.disabled = true;
    liveBtn.classList.add('pause-mode');
    return;
  }
  liveBtn.textContent = 'Live';
  liveBtn.disabled = false;
  liveBtn.classList.remove('pause-mode');
}

function providerLabel(provider) {
  return String(provider || '').toLowerCase() === 'claude' ? 'Claude' : 'Codex';
}

function buildChannelId(runtimeMode, provider) {
  if (String(runtimeMode || '').toLowerCase() === 'api') {
    return 'api';
  }
  return `cli:${String(provider || 'codex').toLowerCase() === 'claude' ? 'claude' : 'codex'}`;
}

function normalizeChannelId(rawChannelId) {
  const value = String(rawChannelId || '')
    .trim()
    .toLowerCase();
  if (!value) {
    return '';
  }
  if (value === 'api') {
    return 'api';
  }
  if (value === 'cli:claude') {
    return 'cli:claude';
  }
  if (value === 'cli:codex') {
    return 'cli:codex';
  }
  return '';
}

function channelLabel(channelId) {
  const id = normalizeChannelId(channelId);
  if (!id) {
    return 'No channel';
  }
  if (id === 'api') {
    const template = normalizeApiTemplate(state.apiConfig.template || 'openai');
    return `API · ${template === 'azure' ? 'Azure' : template === 'custom' ? 'Custom' : 'OpenAI'}`;
  }
  return id === 'cli:claude' ? 'CLI · Claude' : 'CLI · Codex';
}

function normalizeApiConfig(rawConfig) {
  const api = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  return {
    template: normalizeApiTemplate(api.template || 'openai'),
    baseUrl: String(api.baseUrl || ''),
    model: String(api.model || ''),
    hasApiKey: Boolean(api.hasApiKey),
    keyPreview: String(api.keyPreview || ''),
  };
}

function normalizeSettingsTab(rawTab) {
  const tab = String(rawTab || '')
    .trim()
    .toLowerCase();
  if (tab === 'live' || tab === 'permissions' || tab === 'about') {
    return tab;
  }
  return 'api';
}

function focusCurrentSettingsTab() {
  if (!state.settingsOpen) {
    return;
  }
  if (state.settingsTab === 'live') {
    liveIntervalInput.focus();
    return;
  }
  if (state.settingsTab === 'permissions') {
    if (permissionRefreshBtn) {
      permissionRefreshBtn.focus();
    }
    return;
  }
  if (state.settingsTab === 'about') {
    if (aboutReadmeLink) {
      aboutReadmeLink.focus();
      return;
    }
  }
  apiBaseInput.focus();
}

function setSettingsTab(rawTab, options = {}) {
  const tab = normalizeSettingsTab(rawTab);
  const focus = options.focus === true;
  state.settingsTab = tab;

  settingsTabButtons.forEach((button) => {
    const buttonTab = normalizeSettingsTab(button.dataset.settingsTab || '');
    const active = buttonTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });

  settingsTabPanels.forEach((panel) => {
    const panelTab = normalizeSettingsTab(panel.dataset.settingsPanel || '');
    const active = panelTab === tab;
    panel.classList.toggle('active', active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  updateRuntimeUiState();
  if (state.settingsOpen && tab === 'permissions') {
    void refreshPermissionPanel({ silent: true });
  }
  if (focus) {
    focusCurrentSettingsTab();
  }
}

function moveSettingsTabBy(step) {
  const enabledTabs = settingsTabButtons.filter((button) => !button.disabled);
  if (enabledTabs.length === 0) {
    return;
  }
  const currentIndex = Math.max(
    0,
    enabledTabs.findIndex((button) => normalizeSettingsTab(button.dataset.settingsTab || '') === state.settingsTab)
  );
  const nextIndex = (currentIndex + step + enabledTabs.length) % enabledTabs.length;
  const nextTab = normalizeSettingsTab(enabledTabs[nextIndex].dataset.settingsTab || 'api');
  setSettingsTab(nextTab, { focus: true });
}

function normalizePermissionSnapshot(rawSnapshot) {
  const snapshot = rawSnapshot && typeof rawSnapshot === 'object' ? rawSnapshot : {};
  const items = snapshot.items && typeof snapshot.items === 'object' ? snapshot.items : {};
  const normalizeItem = (rawItem, defaults = {}) => {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
    return {
      kind: String(item.kind || defaults.kind || ''),
      status: String(item.status || 'unknown'),
      granted: Boolean(item.granted),
      canRequest: Boolean(Object.prototype.hasOwnProperty.call(item, 'canRequest') ? item.canRequest : defaults.canRequest),
      canOpenSettings: Boolean(
        Object.prototype.hasOwnProperty.call(item, 'canOpenSettings') ? item.canOpenSettings : defaults.canOpenSettings
      ),
      note: String(item.note || ''),
      updatedAt: String(item.updatedAt || ''),
    };
  };
  return {
    items: {
      microphone: normalizeItem(items.microphone, { kind: 'microphone', canRequest: true, canOpenSettings: true }),
      screen: normalizeItem(items.screen, { kind: 'screen', canRequest: true, canOpenSettings: true }),
      accessibility: normalizeItem(items.accessibility, { kind: 'accessibility', canRequest: true, canOpenSettings: true }),
      automation: normalizeItem(items.automation, { kind: 'automation', canRequest: true, canOpenSettings: true }),
    },
    updatedAt: String(snapshot.updatedAt || ''),
  };
}

function normalizeRuntimeHealth(rawRuntime) {
  const runtime = rawRuntime && typeof rawRuntime === 'object' ? rawRuntime : {};
  return {
    platform: String(runtime.platform || ''),
    arch: String(runtime.arch || ''),
    appVersion: String(runtime.appVersion || ''),
    electronVersion: String(runtime.electronVersion || ''),
    embeddedNodeVersion: String(runtime.embeddedNodeVersion || ''),
    appRoot: String(runtime.appRoot || ''),
    bundledMcpConfigPath: String(runtime.bundledMcpConfigPath || ''),
    usingEmbeddedNode: Boolean(runtime.usingEmbeddedNode),
    embeddedNodeBin: String(runtime.embeddedNodeBin || ''),
    preferredNodeBinary: String(runtime.preferredNodeBinary || ''),
    codexHome: String(runtime.codexHome || ''),
    codexSkillsDir: String(runtime.codexSkillsDir || ''),
    hasCodexSkills: Boolean(runtime.hasCodexSkills),
    hasMcpConfig: Boolean(runtime.hasMcpConfig),
    hasNativeScript: Boolean(runtime.hasNativeScript),
    hasAppleScript: Boolean(runtime.hasAppleScript),
    hasPlaywrightScript: Boolean(runtime.hasPlaywrightScript),
  };
}

function statusLabel(rawStatus) {
  const status = String(rawStatus || '')
    .trim()
    .toLowerCase();
  if (!status) {
    return 'Unknown';
  }
  return status.replace(/-/g, ' ');
}

function applyPermissionStatus(el, rawStatus) {
  if (!el) {
    return;
  }
  const status = String(rawStatus || '')
    .trim()
    .toLowerCase();
  el.classList.remove('granted', 'denied', 'restricted', 'unknown', 'not-determined');
  el.classList.add(status || 'unknown');
  el.textContent = statusLabel(status);
}

function renderPermissionPanel() {
  const items = state.permissions?.items || {};
  applyPermissionStatus(permissionStatusMic, items.microphone?.status || 'unknown');
  applyPermissionStatus(permissionStatusScreen, items.screen?.status || 'unknown');
  applyPermissionStatus(permissionStatusAccessibility, items.accessibility?.status || 'unknown');
  applyPermissionStatus(permissionStatusAutomation, items.automation?.status || 'unknown');

  const runtime = state.runtimeHealth || {};
  if (runtimeHealthNote) {
    const lines = [
      `App ${runtime.appVersion || '-'} · macOS/${runtime.platform || '-'} · ${runtime.arch || '-'}`,
      `Electron ${runtime.electronVersion || '-'} · Embedded Node ${runtime.embeddedNodeVersion || '-'}`,
      `Bundled MCP: ${runtime.hasMcpConfig ? 'ok' : 'missing'} · Scripts: native=${runtime.hasNativeScript ? 'ok' : 'missing'}, applescript=${runtime.hasAppleScript ? 'ok' : 'missing'}, playwright=${runtime.hasPlaywrightScript ? 'ok' : 'missing'}`,
      `MCP Node source: ${runtime.usingEmbeddedNode ? 'embedded' : 'external override'}`,
      `CLI Node: ${runtime.preferredNodeBinary || '-'}`,
      `Codex skills: ${runtime.hasCodexSkills ? 'ok' : 'missing'} (${runtime.codexSkillsDir || '-'})`,
    ];
    runtimeHealthNote.textContent = lines.join('\n');
    runtimeHealthNote.title = runtime.appRoot || '';
  }
}

async function refreshPermissionPanel({ silent = false } = {}) {
  if (!window.assistantAPI?.getPermissions || !window.assistantAPI?.getRuntimeHealth) {
    return false;
  }
  state.permissionsLoading = true;
  updateRuntimeUiState();
  try {
    const [permissionsResult, runtimeResult] = await Promise.all([
      window.assistantAPI.getPermissions(),
      window.assistantAPI.getRuntimeHealth(),
    ]);
    if (permissionsResult?.permissions) {
      state.permissions = normalizePermissionSnapshot(permissionsResult.permissions);
    }
    if (runtimeResult?.runtimeHealth) {
      state.runtimeHealth = normalizeRuntimeHealth(runtimeResult.runtimeHealth);
    }
    renderPermissionPanel();
    if (!silent) {
      setStatus('Permission status refreshed');
    }
    return true;
  } catch (error) {
    if (!silent) {
      setStatus(`Permission refresh failed: ${String(error.message || error)}`, true);
    }
    return false;
  } finally {
    state.permissionsLoading = false;
    updateRuntimeUiState();
  }
}

function normalizeLiveWatchIntervalMs(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return state.liveWatchIntervalMs;
  }
  return Math.max(2000, Math.min(30000, Math.round(n)));
}

function normalizeLiveWatchSummaryEveryFrames(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return state.liveWatchSummaryEveryFrames;
  }
  return Math.max(2, Math.min(12, Math.round(n)));
}

function normalizeLiveWatchMaxImageFrames(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return state.liveWatchMaxImageFrames;
  }
  return Math.max(6, Math.min(60, Math.round(n)));
}

function normalizeLiveWatchMaxImagesPerAnalysis(rawValue, maxImageFrames = state.liveWatchMaxImageFrames) {
  const n = Number(rawValue);
  const fallback = Number(state.liveWatchMaxImagesPerAnalysis || 4);
  const normalized = Number.isFinite(n) ? Math.max(1, Math.min(12, Math.round(n))) : fallback;
  return Math.min(normalized, Math.max(1, Number(maxImageFrames || normalized)));
}

function normalizeLiveWatchTextOnlyMaxRounds(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) {
    return Number(state.liveWatchTextOnlyMaxRounds || 4);
  }
  return Math.max(1, Math.min(10, Math.round(n)));
}

function syncLiveWatchSettingsInputs() {
  if (liveIntervalInput) {
    liveIntervalInput.value = String(state.liveWatchIntervalMs);
  }
  if (liveSummaryFramesInput) {
    liveSummaryFramesInput.value = String(state.liveWatchSummaryEveryFrames);
  }
  if (liveMaxImageFramesInput) {
    liveMaxImageFramesInput.value = String(state.liveWatchMaxImageFrames);
  }
  if (liveMaxImagesAnalysisInput) {
    liveMaxImagesAnalysisInput.value = String(state.liveWatchMaxImagesPerAnalysis);
  }
  if (liveTextOnlyRoundsInput) {
    liveTextOnlyRoundsInput.value = String(state.liveWatchTextOnlyMaxRounds);
  }
}

function readLiveWatchConfigFromInputs() {
  const intervalRaw = String(liveIntervalInput?.value || '').trim();
  const summaryRaw = String(liveSummaryFramesInput?.value || '').trim();
  const maxFramesRaw = String(liveMaxImageFramesInput?.value || '').trim();
  const maxAnalysisRaw = String(liveMaxImagesAnalysisInput?.value || '').trim();
  const textOnlyRoundsRaw = String(liveTextOnlyRoundsInput?.value || '').trim();

  if (!intervalRaw || !summaryRaw || !maxFramesRaw || !maxAnalysisRaw || !textOnlyRoundsRaw) {
    throw new Error('Live watch config fields cannot be empty');
  }

  const intervalNum = Number(intervalRaw);
  const summaryNum = Number(summaryRaw);
  const maxFramesNum = Number(maxFramesRaw);
  const maxAnalysisNum = Number(maxAnalysisRaw);
  const textOnlyRoundsNum = Number(textOnlyRoundsRaw);
  if (!Number.isFinite(intervalNum)) {
    throw new Error('Capture interval must be a number');
  }
  if (!Number.isFinite(summaryNum)) {
    throw new Error('Rolling context frames must be a number');
  }
  if (!Number.isFinite(maxFramesNum)) {
    throw new Error('Max in-memory images must be a number');
  }
  if (!Number.isFinite(maxAnalysisNum)) {
    throw new Error('Max images per analysis must be a number');
  }
  if (!Number.isFinite(textOnlyRoundsNum)) {
    throw new Error('Text-only rounds must be a number');
  }

  const intervalMs = normalizeLiveWatchIntervalMs(intervalNum);
  const summaryEveryFrames = normalizeLiveWatchSummaryEveryFrames(summaryNum);
  const maxImageFrames = normalizeLiveWatchMaxImageFrames(maxFramesNum);
  const maxImagesPerAnalysis = normalizeLiveWatchMaxImagesPerAnalysis(maxAnalysisNum, maxImageFrames);
  const textOnlyMaxRounds = normalizeLiveWatchTextOnlyMaxRounds(textOnlyRoundsNum);

  return {
    intervalMs,
    summaryEveryFrames,
    maxImageFrames,
    maxImagesPerAnalysis,
    textOnlyMaxRounds,
  };
}

function openSettingsModal() {
  state.settingsOpen = true;
  settingsModal.classList.remove('hidden');
  syncDefaultChannelOptions();
  apiTemplateSelect.value = normalizeApiTemplate(state.apiConfig.template || 'openai');
  apiBaseInput.value = state.apiConfig.baseUrl;
  apiModelInput.value = state.apiConfig.model;
  apiKeyInput.value = '';
  syncLiveWatchSettingsInputs();
  setSettingsTab(state.settingsTab || 'api', { focus: true });
}

function openSettingsModalWithTab(rawTab) {
  const tab = normalizeSettingsTab(rawTab);
  state.settingsTab = tab;
  openSettingsModal();
  setSettingsTab(tab, { focus: true });
}

function closeSettingsModal() {
  state.settingsOpen = false;
  settingsModal.classList.add('hidden');
  updateRuntimeUiState();
  inputEl.focus();
}

function setChannels(channels, activeChannelId = '') {
  const list = Array.isArray(channels) ? channels : [];
  const available = list.filter((item) => item && item.available !== false);
  state.channels = available;

  channelSelect.innerHTML = '';
  if (state.channels.length === 0) {
    state.activeChannelId = '';
    state.liveWatchAvailable = false;
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No available channel';
    channelSelect.appendChild(option);
    channelSelect.value = '';
    syncDefaultChannelOptions();
    return;
  }

  const previous = normalizeChannelId(activeChannelId || state.activeChannelId);
  const exists = state.channels.some((item) => normalizeChannelId(item.id) === previous);
  state.activeChannelId = exists
    ? previous
    : normalizeChannelId(state.channels[0].id || buildChannelId(state.runtimeMode, state.provider));
  if (state.activeChannelId === 'api') {
    state.runtimeMode = 'api';
  } else if (state.activeChannelId === 'cli:claude') {
    state.runtimeMode = 'cli';
    state.provider = 'claude';
  } else {
    state.runtimeMode = 'cli';
    state.provider = 'codex';
  }

  for (const item of state.channels) {
    const option = document.createElement('option');
    option.value = normalizeChannelId(item.id);
    option.textContent = String(item.label || channelLabel(item.id));
    channelSelect.appendChild(option);
  }
  channelSelect.value = state.activeChannelId;
  state.liveWatchAvailable = state.activeChannelId === 'api';

  syncDefaultChannelOptions();
}

function normalizeApiTemplate(template) {
  const value = String(template || '')
    .trim()
    .toLowerCase();
  if (value === 'azure' || value === 'custom') {
    return value;
  }
  return 'openai';
}

function getApiTemplatePreset(template) {
  const key = normalizeApiTemplate(template);
  if (key === 'azure') {
    return {
      template: 'azure',
      baseUrl: 'https://YOUR_RESOURCE_NAME.openai.azure.com/openai/v1',
      model: 'YOUR_DEPLOYMENT_NAME',
      note: 'Azure OpenAI template filled. Replace resource and deployment.',
    };
  }
  if (key === 'custom') {
    return {
      template: 'custom',
      baseUrl: 'https://your-openai-compatible-endpoint/v1',
      model: 'your-model-name',
      note: 'Custom OpenAI-compatible template filled. Update to your endpoint/model.',
    };
  }
  return {
    template: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    note: 'OpenAI template filled.',
  };
}

function syncDefaultChannelOptions() {
  if (!defaultChannelSelect) {
    return;
  }
  const configured = normalizeChannelId(state.defaultChannelId);
  const available = Array.isArray(state.channels) ? state.channels : [];

  defaultChannelSelect.innerHTML = '';

  const follow = document.createElement('option');
  follow.value = '';
  follow.textContent = 'Follow last used';
  defaultChannelSelect.appendChild(follow);

  for (const item of available) {
    const id = normalizeChannelId(item?.id);
    if (!id) continue;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = String(item.label || channelLabel(id));
    defaultChannelSelect.appendChild(option);
  }

  if (configured && !available.some((item) => normalizeChannelId(item?.id) === configured)) {
    const option = document.createElement('option');
    option.value = configured;
    option.textContent = `${channelLabel(configured)} (Unavailable)`;
    defaultChannelSelect.appendChild(option);
  }

  defaultChannelSelect.value = configured;
}

function updateRuntimeUiState() {
  const hasChannel = state.channels.length > 0 && Boolean(normalizeChannelId(state.activeChannelId));
  if (channelSelect) {
    channelSelect.value = hasChannel ? normalizeChannelId(state.activeChannelId) : '';
  }
  apiTemplateSelect.value = normalizeApiTemplate(state.apiConfig.template || 'openai');
  const busy = state.sending || state.automationBusy;
  const permissionItems = state.permissions?.items || {};
  channelSelect.disabled = busy || !hasChannel;
  channelSwitchBtn.disabled = busy || !hasChannel;
  settingsBtn.disabled = busy;
  const settingsFieldsDisabled = busy || !state.settingsOpen;
  const permissionFieldsDisabled = settingsFieldsDisabled || state.permissionsLoading;
  settingsTabButtons.forEach((button) => {
    button.disabled = settingsFieldsDisabled;
  });
  if (defaultChannelSelect) {
    defaultChannelSelect.disabled = settingsFieldsDisabled;
  }
  if (defaultChannelSaveBtn) {
    defaultChannelSaveBtn.disabled = settingsFieldsDisabled;
  }
  apiTemplateSelect.disabled = settingsFieldsDisabled;
  apiTemplateFillBtn.disabled = settingsFieldsDisabled;
  apiBaseInput.disabled = settingsFieldsDisabled;
  apiModelInput.disabled = settingsFieldsDisabled;
  apiKeyInput.disabled = settingsFieldsDisabled;
  apiSaveBtn.disabled = settingsFieldsDisabled;
  if (liveIntervalInput) {
    liveIntervalInput.disabled = settingsFieldsDisabled;
  }
  if (liveSummaryFramesInput) {
    liveSummaryFramesInput.disabled = settingsFieldsDisabled;
  }
  if (liveMaxImageFramesInput) {
    liveMaxImageFramesInput.disabled = settingsFieldsDisabled;
  }
  if (liveMaxImagesAnalysisInput) {
    liveMaxImagesAnalysisInput.disabled = settingsFieldsDisabled;
  }
  if (liveTextOnlyRoundsInput) {
    liveTextOnlyRoundsInput.disabled = settingsFieldsDisabled;
  }
  if (liveSaveBtn) {
    liveSaveBtn.disabled = settingsFieldsDisabled;
  }
  if (permissionRefreshBtn) {
    permissionRefreshBtn.disabled = permissionFieldsDisabled;
  }
  if (permissionRequestMicBtn) {
    permissionRequestMicBtn.disabled = permissionFieldsDisabled || !permissionItems.microphone?.canRequest;
  }
  if (permissionOpenMicBtn) {
    permissionOpenMicBtn.disabled = permissionFieldsDisabled || !permissionItems.microphone?.canOpenSettings;
  }
  if (permissionRequestScreenBtn) {
    permissionRequestScreenBtn.disabled = permissionFieldsDisabled || !permissionItems.screen?.canRequest;
  }
  if (permissionOpenScreenBtn) {
    permissionOpenScreenBtn.disabled = permissionFieldsDisabled || !permissionItems.screen?.canOpenSettings;
  }
  if (permissionRequestAccessibilityBtn) {
    permissionRequestAccessibilityBtn.disabled = permissionFieldsDisabled || !permissionItems.accessibility?.canRequest;
  }
  if (permissionOpenAccessibilityBtn) {
    permissionOpenAccessibilityBtn.disabled = permissionFieldsDisabled || !permissionItems.accessibility?.canOpenSettings;
  }
  if (permissionRequestAutomationBtn) {
    permissionRequestAutomationBtn.disabled = permissionFieldsDisabled || !permissionItems.automation?.canRequest;
  }
  if (permissionOpenAutomationBtn) {
    permissionOpenAutomationBtn.disabled = permissionFieldsDisabled || !permissionItems.automation?.canOpenSettings;
  }
  settingsCloseBtn.disabled = busy;
  if (!state.sending) {
    sendBtn.disabled = !hasChannel;
  }
  if (!state.automationBusy) {
    autoBtn.disabled = !hasChannel;
  }
  if (state.liveWatchRunning) {
    setLiveButtonMode('running');
  } else {
    setLiveButtonMode('idle');
    liveBtn.disabled = !hasChannel || !state.liveWatchAvailable || state.sending || state.automationBusy;
  }
  const template = normalizeApiTemplate(state.apiConfig.template || apiTemplateSelect.value || 'openai');
  if (state.apiConfig.hasApiKey) {
    apiKeyInput.placeholder = `Configured (${state.apiConfig.keyPreview || 'saved'})`;
  } else if (template === 'azure') {
    apiKeyInput.placeholder = 'Azure API key (leave empty to keep)';
  } else {
    apiKeyInput.placeholder = 'API key (leave empty to keep)';
  }
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? '#ffb7b7' : '#90a9c5';
}

function formatMessageTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function appendMessage(role, text) {
  const message = document.createElement('div');
  message.className = `msg ${role}`;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatMessageTime(new Date());
  meta.appendChild(timeEl);

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text;

  message.appendChild(meta);
  message.appendChild(body);
  messagesEl.appendChild(message);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function startAssistantStream() {
  if (state.streamMessageEl && state.streamMessageBodyEl) {
    return;
  }
  const message = document.createElement('div');
  message.className = 'msg assistant';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatMessageTime(new Date());
  meta.appendChild(timeEl);

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = '...';

  message.appendChild(meta);
  message.appendChild(body);
  messagesEl.appendChild(message);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  state.streamMessageEl = message;
  state.streamMessageBodyEl = body;
  state.streamText = '';
}

function appendAssistantStreamDelta(delta) {
  const next = String(delta || '');
  if (!next) {
    return;
  }
  startAssistantStream();
  state.streamText += next;
  if (state.streamMessageBodyEl) {
    state.streamMessageBodyEl.textContent = state.streamText || '...';
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finishAssistantStream(finalText = '') {
  const nextText = String(finalText || '').trim();
  if (!state.streamMessageBodyEl) {
    if (nextText) {
      appendMessage('assistant', nextText);
    }
    state.streamMessageEl = null;
    state.streamMessageBodyEl = null;
    state.streamText = '';
    return;
  }
  const merged = nextText || String(state.streamText || '').trim();
  state.streamMessageBodyEl.textContent = merged || '(empty response)';
  state.streamMessageEl = null;
  state.streamMessageBodyEl = null;
  state.streamText = '';
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function discardAssistantStream() {
  if (state.streamMessageEl && state.streamMessageEl.parentNode) {
    state.streamMessageEl.parentNode.removeChild(state.streamMessageEl);
  }
  state.streamMessageEl = null;
  state.streamMessageBodyEl = null;
  state.streamText = '';
}

function appendAutomationResultIfNew(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return false;
  }
  if (normalized === state.lastAutomationResult) {
    return false;
  }
  appendMessage('assistant', `Automation result: ${normalized}`);
  state.lastAutomationResult = normalized;
  state.automationResultShown = true;
  return true;
}

function renderAttachments() {
  attachmentList.innerHTML = '';

  state.attachments.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';

    const title = document.createElement('span');
    const size = Number(file.size || 0);
    const kb = size > 0 ? `${Math.ceil(size / 1024)} KB` : '0 KB';
    title.textContent = `${file.name} (${kb})`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'x';
    remove.title = 'Remove';
    remove.addEventListener('click', () => {
      state.attachments.splice(index, 1);
      renderAttachments();
    });

    chip.appendChild(title);
    chip.appendChild(remove);
    attachmentList.appendChild(chip);
  });
}

function normalizeSelectedFiles(fileList) {
  const incoming = Array.from(fileList || []);

  for (const file of incoming) {
    state.attachments.push({
      name: file.name || 'file',
      path: file.path || '',
      mime: file.type || 'application/octet-stream',
      size: Number(file.size || 0),
    });
  }

  renderAttachments();
}

function addAttachmentIfAbsent(fileLike) {
  if (!fileLike || typeof fileLike !== 'object') {
    return false;
  }
  const next = {
    name: String(fileLike.name || 'file'),
    path: String(fileLike.path || ''),
    mime: String(fileLike.mime || 'application/octet-stream'),
    size: Number(fileLike.size || 0),
  };
  if (!next.path) {
    return false;
  }
  const exists = state.attachments.some(
    (item) => String(item.path || '') === next.path && String(item.name || '') === next.name
  );
  if (exists) {
    return false;
  }
  state.attachments.push(next);
  return true;
}

async function applyQuickAskPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const text = String(data.text || '').trim();
  const incoming = Array.isArray(data.attachments) ? data.attachments : [];
  const autoSend = Boolean(data.autoSend);
  const source = String(data.source || '').trim();

  let addedCount = 0;
  for (const item of incoming) {
    if (addAttachmentIfAbsent(item)) {
      addedCount += 1;
    }
  }

  if (text) {
    inputEl.value = [inputEl.value.trim(), text].filter(Boolean).join('\n');
  }

  if (!text && addedCount === 0) {
    setStatus('No valid quick-ask content received', true);
    return;
  }

  renderAttachments();
  autoResizeInput();
  inputEl.focus();
  const sourceLabel = source ? ` (${source})` : '';
  setStatus(`Quick ask loaded${sourceLabel}`);

  if (autoSend) {
    if (state.sending || state.automationBusy) {
      setStatus('Quick ask loaded. Auto-send skipped because assistant is busy.', true);
      return;
    }
    await sendMessage();
  }
}

function clearDraft() {
  inputEl.value = '';
  state.attachments = [];
  renderAttachments();
  autoResizeInput();
}

function parseLiveFocusCommand(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return null;
  }
  const slashMatch = text.match(/^\/live(?:\s+([\s\S]+))?$/i);
  if (slashMatch) {
    const arg = String(slashMatch[1] || '').trim();
    if (!arg || /^(clear|off|none|reset|清除|关闭|取消)$/i.test(arg)) {
      return { action: 'clear', focus: '' };
    }
    return { action: 'set', focus: arg };
  }
  const colonMatch = text.match(/^live[:：]\s*([\s\S]+)$/i);
  if (colonMatch) {
    const arg = String(colonMatch[1] || '').trim();
    if (!arg || /^(clear|off|none|reset|清除|关闭|取消)$/i.test(arg)) {
      return { action: 'clear', focus: '' };
    }
    return { action: 'set', focus: arg };
  }
  return null;
}

async function applyLiveFocusCommand(command) {
  if (!command || !window.assistantAPI?.setLiveWatchFocus) {
    return false;
  }
  const action = String(command.action || 'set').trim().toLowerCase();
  const payload =
    action === 'clear'
      ? {
          action: 'clear',
        }
      : {
          action: 'set',
          focus: String(command.focus || ''),
        };
  const result = await window.assistantAPI.setLiveWatchFocus(payload);
  if (!result?.ok) {
    throw new Error(result?.error || 'Live focus update failed');
  }
  const focus = String(result.focusHint || '').trim();
  state.liveWatchFocusHint = focus;
  appendMessage('system', focus ? `Live focus updated: ${focus}` : 'Live focus cleared.');
  setStatus(focus ? 'Live focus updated' : 'Live focus cleared');
  return true;
}

function autoResizeInput() {
  inputEl.style.height = 'auto';
  const maxHeight = 180;
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, maxHeight)}px`;
}

async function sendMessage() {
  if (state.sending) {
    return;
  }

  const applied = await ensureChannelApplied();
  if (!applied) {
    return;
  }

  const text = inputEl.value.trim();
  if (!text && state.attachments.length === 0) {
    return;
  }

  const liveFocusCommand = parseLiveFocusCommand(text);
  if (liveFocusCommand && state.attachments.length === 0) {
    clearDraft();
    try {
      await applyLiveFocusCommand(liveFocusCommand);
    } catch (error) {
      const message = String(error.message || error);
      appendMessage('system', `Live focus update failed: ${message}`);
      setStatus(`Live focus update failed: ${message}`, true);
    } finally {
      inputEl.focus();
    }
    return;
  }

  state.sending = true;
  state.pausingSend = false;
  autoBtn.disabled = true;
  updateRuntimeUiState();
  setSendButtonMode('sending');

  appendMessage('user', [text, ...state.attachments.map((f) => `[file] ${f.name}`)].filter(Boolean).join('\n'));

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const liveOnlyMode = Boolean(state.liveWatchRunning);
  const payload = {
    requestId,
    mode: liveOnlyMode ? 'live_only' : 'chat',
    text,
    attachments: [...state.attachments],
  };

  clearDraft();
  state.activeRequestId = requestId;
  state.streamMessageEl = null;
  state.streamMessageBodyEl = null;
  state.streamText = '';
  state.streamUsedForActiveRequest = false;
  if (liveOnlyMode) {
    setStatus('Sending to Live watch...');
  } else {
    const sendingTarget = channelLabel(state.activeChannelId);
    setStatus(`Sending via ${sendingTarget}...`);
  }

  try {
    const response = await window.assistantAPI.sendMessage(payload);

    if (!response?.ok) {
      throw new Error(response?.error || 'Request failed');
    }

    if (response?.liveOnly) {
      setStatus('Message queued to Live watch');
      return;
    }

    if (state.streamUsedForActiveRequest) {
      if (state.streamMessageBodyEl) {
        finishAssistantStream(response.text || '(empty response)');
      }
    } else {
      appendMessage('assistant', response.text || '(empty response)');
    }
    if (response?.provider && response.provider !== state.provider) {
      state.provider = response.provider;
    }
    if (response?.runtimeMode) {
      state.runtimeMode = String(response.runtimeMode).toLowerCase() === 'api' ? 'api' : 'cli';
    }
    state.activeChannelId = buildChannelId(state.runtimeMode, response?.provider || state.provider);
    channelSelect.value = normalizeChannelId(state.activeChannelId);
    if (response?.workdir && response.workdir !== state.workdir) {
      state.workdir = response.workdir;
      workdirInput.value = response.workdir;
    }
    if (response?.model) {
      if (state.runtimeMode === 'api') {
        setStatus(`Ready (${channelLabel(state.activeChannelId)}/${response.model})`);
      } else {
        setStatus(`Ready (${response.provider || state.provider}/${response.model})`);
      }
    } else {
      setStatus(state.runtimeMode === 'api' ? 'Ready (api)' : `Ready (${state.provider})`);
    }
  } catch (error) {
    const message = String(error.message || error);
    if (/paused by user/i.test(message)) {
      if (state.streamMessageBodyEl && !String(state.streamText || '').trim()) {
        discardAssistantStream();
      } else if (state.streamMessageBodyEl) {
        finishAssistantStream('');
      }
      appendMessage('system', 'Request paused.');
      setStatus('Request paused');
    } else {
      if (state.streamMessageBodyEl) {
        finishAssistantStream('');
      }
      appendMessage('system', `Error: ${message}`);
      setStatus('Request failed', true);
    }
  } finally {
    state.activeRequestId = '';
    state.streamUsedForActiveRequest = false;
    state.sending = false;
    state.pausingSend = false;
    autoBtn.disabled = false;
    setSendButtonMode('idle');
    updateRuntimeUiState();
    inputEl.focus();
  }
}

async function pauseSendMessage() {
  if (!state.sending || state.pausingSend) {
    return;
  }
  state.pausingSend = true;
  setSendButtonMode('pausing');
  setStatus('Pausing current request...');
  try {
    const result = await window.assistantAPI.interruptSend();
    if (!result?.ok) {
      throw new Error(result?.error || 'Pause failed');
    }
  } catch (error) {
    const message = String(error.message || error);
    setStatus(`Pause failed: ${message}`, true);
    state.pausingSend = false;
    if (state.sending) {
      setSendButtonMode('sending');
    } else {
      setSendButtonMode('idle');
    }
  }
}

async function runAutomation() {
  if (state.automationBusy) {
    return;
  }

  const applied = await ensureChannelApplied();
  if (!applied) {
    return;
  }

  const goal = inputEl.value.trim();
  if (!goal) {
    setStatus('Auto goal cannot be empty. Type goal in message box first.', true);
    return;
  }

  state.automationBusy = true;
  state.automationProgressEvents = 0;
  state.automationResultShown = false;
  state.lastAutomationResult = '';
  state.pausingAutomation = false;
  setAutoButtonMode('running');
  sendBtn.disabled = true;
  channelSwitchBtn.disabled = true;
  workdirPickBtn.disabled = true;
  workdirApplyBtn.disabled = true;
  updateRuntimeUiState();
  setStatus(`Running automation with ${state.provider}...`);
  inputEl.value = '';
  autoResizeInput();

  try {
    const result = await window.assistantAPI.runAutomation({
      goal,
      provider: state.provider,
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'Automation failed');
    }

    appendAutomationResultIfNew(result?.finalAnswer);

    if (state.automationProgressEvents === 0) {
      const planActions = Array.isArray(result.plan?.actions) ? result.plan.actions.length : 0;
      appendMessage(
        'system',
        `Automation plan ready (${planActions} steps, provider=${result.provider}). Capture: ${
          result.captureMode === 'memory' ? 'in-memory' : String(result.screenshotPath || 'n/a')
        }`
      );

      const logs = Array.isArray(result.logs) ? result.logs : [];
      if (logs.length === 0) {
        appendMessage('system', 'Automation produced no executable steps.');
      } else {
        for (const log of logs) {
          const prefix = log.ok ? 'OK' : 'FAIL';
          appendMessage('system', `[${prefix}] #${log.index} ${log.action} - ${log.detail}`);
        }
      }
    }

    setStatus('Automation completed');
  } catch (error) {
    const message = String(error.message || error);
    const paused = /paused by user/i.test(message);
    if (state.automationProgressEvents === 0) {
      appendMessage('system', paused ? 'Automation paused.' : `Automation error: ${message}`);
    }
    setStatus(paused ? 'Automation paused' : 'Automation failed', !paused);
  } finally {
    state.automationBusy = false;
    state.pausingAutomation = false;
    setAutoButtonMode('idle');
    sendBtn.disabled = false;
    channelSwitchBtn.disabled = false;
    workdirPickBtn.disabled = false;
    workdirApplyBtn.disabled = false;
    updateRuntimeUiState();
    inputEl.focus();
  }
}

async function pauseAutomation() {
  if (!state.automationBusy || state.pausingAutomation) {
    return;
  }
  state.pausingAutomation = true;
  setAutoButtonMode('pausing');
  setStatus('Pausing automation...');
  try {
    const result = await window.assistantAPI.interruptAutomation();
    if (!result?.ok) {
      throw new Error(result?.error || 'Pause failed');
    }
  } catch (error) {
    const message = String(error.message || error);
    setStatus(`Automation pause failed: ${message}`, true);
    state.pausingAutomation = false;
    if (state.automationBusy) {
      setAutoButtonMode('running');
    } else {
      setAutoButtonMode('idle');
    }
  }
}

function applyLiveWatchStateFromPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  if (Object.prototype.hasOwnProperty.call(data, 'available')) {
    state.liveWatchAvailable = Boolean(data.available);
  }
  state.liveWatchRunning = Boolean(data.running);
  state.liveWatchBusy = Boolean(data.busy);
  const interval = Number(data.intervalMs);
  if (Number.isFinite(interval) && interval > 0) {
    state.liveWatchIntervalMs = Math.round(interval);
  }
  const summaryEveryFrames = Number(data.summaryEveryFrames);
  if (Number.isFinite(summaryEveryFrames) && summaryEveryFrames > 0) {
    state.liveWatchSummaryEveryFrames = Math.round(summaryEveryFrames);
  }
  const maxImageFrames = Number(data.maxImageFrames);
  if (Number.isFinite(maxImageFrames) && maxImageFrames > 0) {
    state.liveWatchMaxImageFrames = Math.round(maxImageFrames);
  }
  const maxImagesPerAnalysis = Number(data.maxImagesPerAnalysis);
  if (Number.isFinite(maxImagesPerAnalysis) && maxImagesPerAnalysis > 0) {
    state.liveWatchMaxImagesPerAnalysis = Math.min(
      Math.round(maxImagesPerAnalysis),
      Math.max(1, state.liveWatchMaxImageFrames)
    );
  }
  const textOnlyMaxRounds = Number(data.textOnlyMaxRounds);
  if (Number.isFinite(textOnlyMaxRounds) && textOnlyMaxRounds > 0) {
    state.liveWatchTextOnlyMaxRounds = Math.max(1, Math.min(10, Math.round(textOnlyMaxRounds)));
  }
  if (Object.prototype.hasOwnProperty.call(data, 'focusHint')) {
    state.liveWatchFocusHint = String(data.focusHint || '').trim();
  }
}

function formatLiveObservation(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const summary = String(data.summary || '').trim();
  const reply = String(data.reply || '').trim();
  const question = String(data.question || '').trim();
  const severity = String(data.severity || 'info')
    .trim()
    .toLowerCase();
  const appName = String(data.appName || '').trim();
  const windowTitle = String(data.windowTitle || '').trim();
  const lines = [];
  const title = severity === 'warn' ? 'Warning' : 'Note';
  if (reply) {
    lines.push(`[Live ${title}] ${reply}`);
    if (summary) {
      lines.push(`Summary: ${summary}`);
    }
  } else {
    lines.push(`[Live ${title}] ${summary || 'New screen observation.'}`);
  }
  if (question) {
    lines.push(`Question: ${question}`);
  }
  if (appName || windowTitle) {
    lines.push(`Context: ${[appName, windowTitle].filter(Boolean).join(' / ')}`);
  }
  return lines.join('\n');
}

function handleLiveWatchStatus(update) {
  const data = update && typeof update === 'object' ? update : {};
  applyLiveWatchStateFromPayload(data);
  const message = String(data.message || '').trim();
  const isError = Boolean(data.isError);
  updateRuntimeUiState();
  if (message) {
    setStatus(message, isError);
  }
}

function handleLiveWatchObservation(update) {
  appendMessage('assistant', formatLiveObservation(update));
}

function handleConversationSync(update) {
  const data = update && typeof update === 'object' ? update : {};
  const role = String(data.role || '').trim().toLowerCase();
  const text = String(data.text || '').trim();
  if (!text) {
    return;
  }
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return;
  }
  appendMessage(role, text);
}

async function startLiveWatch() {
  if (state.liveWatchRunning) {
    return true;
  }
  if (!state.liveWatchAvailable) {
    if (normalizeChannelId(state.activeChannelId) !== 'api') {
      setStatus('Live watch follows Run channel. Switch Run to API first.', true);
    } else {
      setStatus('Live watch requires API config. Open Settings and save API first.', true);
    }
    return false;
  }
  setLiveButtonMode('running');
  setStatus('Starting live watch...');
  try {
    const result = await window.assistantAPI.startLiveWatch({
      intervalMs: state.liveWatchIntervalMs,
      summaryEveryFrames: state.liveWatchSummaryEveryFrames,
      maxImageFrames: state.liveWatchMaxImageFrames,
      maxImagesPerAnalysis: state.liveWatchMaxImagesPerAnalysis,
      textOnlyMaxRounds: state.liveWatchTextOnlyMaxRounds,
    });
    if (!result?.ok) {
      throw new Error(result?.error || 'Live watch start failed');
    }
    applyLiveWatchStateFromPayload(result);
    updateRuntimeUiState();
    setStatus(`Live watch started (${Math.round(state.liveWatchIntervalMs / 1000)}s interval)`);
    return true;
  } catch (error) {
    applyLiveWatchStateFromPayload({ running: false, busy: false });
    setLiveButtonMode('idle');
    setStatus(`Live watch start failed: ${String(error.message || error)}`, true);
    updateRuntimeUiState();
    return false;
  }
}

async function stopLiveWatch() {
  if (!state.liveWatchRunning) {
    return true;
  }
  setLiveButtonMode('stopping');
  setStatus('Stopping live watch...');
  try {
    const result = await window.assistantAPI.stopLiveWatch();
    if (!result?.ok) {
      throw new Error(result?.error || 'Live watch stop failed');
    }
    applyLiveWatchStateFromPayload(result);
    updateRuntimeUiState();
    setStatus('Live watch stopped');
    return true;
  } catch (error) {
    setStatus(`Live watch stop failed: ${String(error.message || error)}`, true);
    updateRuntimeUiState();
    return false;
  }
}

function handleAutomationStatus(update) {
  const phase = String(update?.phase || '').trim().toLowerCase();
  if (!phase) {
    return;
  }

  state.automationProgressEvents += 1;

  if (phase === 'start') {
    appendMessage('system', `Automation started:\n${String(update.goal || '')}`);
    setStatus(`Automation started (${String(update.provider || state.provider)})`);
    return;
  }

  if (phase === 'capturing') {
    setStatus('Capturing current screen...');
    return;
  }

  if (phase === 'captured') {
    const shot = String(update.screenshotPath || '').trim();
    const captureMode = String(update.captureMode || '').trim().toLowerCase();
    const scope = String(update.captureScope || '').trim();
    const appName = String(update.appName || '').trim();
    const windowTitle = String(update.windowTitle || '').trim();
    const pixelWidth = Number(update.pixelWidth || 0);
    const pixelHeight = Number(update.pixelHeight || 0);
    const sourceLabel = captureMode === 'memory' ? 'in-memory' : 'file';
    const firstLine = shot
      ? `Frame captured (${scope || 'full'}, ${sourceLabel}): ${shot}`
      : `Frame captured (${scope || 'full'}, ${sourceLabel}).`;
    const parts = [firstLine];
    if (appName) {
      parts.push(`App: ${appName}`);
    }
    if (windowTitle) {
      parts.push(`Window: ${windowTitle}`);
    }
    if (pixelWidth > 0 && pixelHeight > 0) {
      parts.push(`Image: ${pixelWidth}x${pixelHeight}`);
    }
    appendMessage('system', parts.join('\n'));
    setStatus('Frame captured, planning actions...');
    return;
  }

  if (phase === 'planning') {
    const provider = String(update.provider || state.provider).toLowerCase();
    const mode = String(update.mode || '').toLowerCase();
    const elapsedMs = Number(update.elapsedMs || 0);
    const elapsedSec = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;
    if (mode === 'mcp') {
      setStatus(
        elapsedSec > 0
          ? `Planning via MCP with ${providerLabel(provider)}... ${elapsedSec}s`
          : `Planning via MCP with ${providerLabel(provider)}...`
      );
    } else {
      setStatus(
        elapsedSec > 0
          ? `Planning actions with ${providerLabel(provider)}... ${elapsedSec}s`
          : `Planning actions with ${providerLabel(provider)}...`
      );
    }
    return;
  }

  if (phase === 'mcp_fallback') {
    const errorText = String(update.error || '').trim();
    appendMessage(
      'system',
      `MCP mode unavailable, fallback to screen automation.${errorText ? `\nReason: ${errorText}` : ''}`
    );
    setStatus('MCP unavailable, switched to screen automation');
    return;
  }

  if (phase === 'unread_scan') {
    const status = String(update.status || '').trim().toLowerCase();
    if (status === 'scanning') {
      setStatus('Scanning unread badges...');
      return;
    }
    if (status === 'found') {
      const x = Math.round(Number(update.x || 0));
      const y = Math.round(Number(update.y || 0));
      const rowX = Math.round(Number(update.rowX || 0));
      const rowY = Math.round(Number(update.rowY || 0));
      const count = Number(update.count || 0);
      const score = Number(update.score || 0);
      const rowPart =
        Number.isFinite(rowX) && Number.isFinite(rowY) && rowX > 0 && rowY > 0
          ? `, row click=(${rowX}, ${rowY})`
          : '';
      appendMessage(
        'system',
        `Unread badge found at (${x}, ${y})${rowPart}${count > 0 ? `, candidates=${count}` : ''}${
          Number.isFinite(score) && score > 0 ? `, score=${score.toFixed(1)}` : ''
        }.`
      );
      setStatus('Opening unread conversation...');
      return;
    }
    if (status === 'none') {
      setStatus('No unread badge detected, running planner...');
      return;
    }
  }

  if (phase === 'planning_target') {
    const frontApp = String(update.frontApp || '').trim();
    const frontWindow = String(update.frontWindow || '').trim();
    const targetApp = String(update.targetApp || '').trim();
    const reason = String(update.reason || '').trim();
    const webGoal = Boolean(update.webGoal);
    const lines = [];
    if (frontApp) {
      lines.push(`Front app: ${frontApp}`);
    }
    if (frontWindow) {
      lines.push(`Front window: ${frontWindow}`);
    }
    if (targetApp) {
      lines.push(`Target app: ${targetApp}`);
    }
    if (reason) {
      lines.push(`Targeting: ${reason}`);
    }
    lines.push(`Mode: ${webGoal ? 'web/browser' : 'desktop app'}`);
    appendMessage('system', `MCP targeting:\n${lines.join('\n')}`);
    setStatus(targetApp ? `Target locked: ${targetApp}` : 'Targeting window...');
    return;
  }

  if (phase === 'plan_ready') {
    const count = Number(update.actionCount || 0);
    const analysis = String(update.analysis || '').trim();
    const analysisPart = analysis ? `\nAnalysis: ${analysis}` : '';
    appendMessage('system', `Plan ready: ${count} step(s).${analysisPart}`);
    setStatus(count > 0 ? `Executing ${count} step(s)...` : 'Plan ready');
    return;
  }

  if (phase === 'step_start') {
    const index = Number(update.index || 0);
    const total = Number(update.total || 0);
    const action = String(update.action || '').trim();
    const reason = String(update.reason || '').trim();
    const reasonPart = reason ? ` - ${reason}` : '';
    const hasTotal = Number.isFinite(total) && total > 0;
    appendMessage('system', `[RUN] #${index}${hasTotal ? `/${total}` : ''} ${action}${reasonPart}`);
    setStatus(hasTotal ? `Running step ${index}/${total}: ${action}` : `Running step ${index}: ${action}`);
    return;
  }

  if (phase === 'step_done') {
    const index = Number(update.index || 0);
    const total = Number(update.total || 0);
    const action = String(update.action || '').trim();
    const ok = Boolean(update.ok);
    const detail = String(update.detail || '').trim();
    const prefix = ok ? 'OK' : 'FAIL';
    const hasTotal = Number.isFinite(total) && total > 0;
    appendMessage('system', `[${prefix}] #${index}${hasTotal ? `/${total}` : ''} ${action} - ${detail}`);
    if (!ok) {
      setStatus(`Step ${index} failed`, true);
    }
    return;
  }

  if (phase === 'done') {
    const executed = Number(update.executed || 0);
    const totalPlanned = Number(update.totalPlanned || 0);
    const failed = Boolean(update.failed);
    const hasTotal = Number.isFinite(totalPlanned) && totalPlanned > 0;
    appendMessage(
      'system',
      failed
        ? `Automation stopped after failure. Executed ${executed}${hasTotal ? `/${totalPlanned}` : ''} step(s).`
        : `Automation done. Executed ${executed}${hasTotal ? `/${totalPlanned}` : ''} step(s).`
    );
    setStatus(failed ? 'Automation failed' : 'Automation completed', failed);
    return;
  }

  if (phase === 'finalizing') {
    setStatus('Generating final result...');
    return;
  }

  if (phase === 'result') {
    const finalAnswer = String(update.finalAnswer || '').trim();
    if (finalAnswer) {
      appendAutomationResultIfNew(finalAnswer);
      setStatus('Final result ready');
    }
    return;
  }

  if (phase === 'error') {
    const errorText = String(update.error || 'unknown error');
    if (/paused by user/i.test(errorText)) {
      appendMessage('system', 'Automation paused.');
      setStatus('Automation paused');
      return;
    }
    appendMessage('system', `Automation error: ${errorText}`);
    setStatus('Automation failed', true);
    return;
  }

  if (phase === 'paused') {
    appendMessage('system', 'Automation paused.');
    setStatus('Automation paused');
  }
}

async function loadConfig() {
  return refreshConfig({ setReadyStatus: true });
}

async function refreshConfig({ setReadyStatus = false } = {}) {
  try {
    const config = await window.assistantAPI.getConfig();
    if (!config?.ok) {
      throw new Error(config?.error || 'Failed to load config');
    }
    state.provider = config.provider || 'codex';
    state.runtimeMode = String(config.runtimeMode || 'cli').toLowerCase() === 'api' ? 'api' : 'cli';
    state.defaultChannelId = normalizeChannelId(config.defaultChannelId || '');
    state.apiConfig = normalizeApiConfig(config.apiConfig);
    setChannels(
      Array.isArray(config.channels) ? config.channels : [],
      config.activeChannelId || buildChannelId(state.runtimeMode, state.provider)
    );
    state.permissions = normalizePermissionSnapshot(config.permissions);
    state.runtimeHealth = normalizeRuntimeHealth(config.runtimeHealth);
    renderPermissionPanel();
    applyLiveWatchStateFromPayload(config.liveWatch || {});
    apiTemplateSelect.value = state.apiConfig.template;
    apiBaseInput.value = state.apiConfig.baseUrl;
    apiModelInput.value = state.apiConfig.model;
    apiKeyInput.value = '';
    syncLiveWatchSettingsInputs();
    state.workdir = config.workdir || '';
    workdirInput.value = state.workdir;
    workdirInput.title = state.workdir;
    updateRuntimeUiState();
    if (setReadyStatus) {
      if (state.channels.length === 0) {
        setStatus('No available channel. Configure API in Settings or install Codex/Claude CLI.', true);
      } else if (state.runtimeMode === 'api') {
        setStatus(`Ready (${channelLabel(state.activeChannelId)}/${state.apiConfig.model || 'model'})`);
      } else {
        setStatus(`Ready (${providerLabel(state.provider)})`);
      }
    }
    return true;
  } catch (error) {
    setStatus(`Config load failed: ${String(error.message || error)}`, true);
    return false;
  }
}

async function switchChannel() {
  const selectedChannelId = normalizeChannelId(channelSelect.value || '');
  if (!selectedChannelId) {
    setStatus('No available channel. Configure API in Settings or install Codex/Claude CLI.', true);
    return false;
  }
  if (selectedChannelId === normalizeChannelId(state.activeChannelId)) {
    setStatus(`Channel already set to ${channelLabel(selectedChannelId)}`);
    return true;
  }

  channelSwitchBtn.disabled = true;
  channelSelect.disabled = true;
  workdirPickBtn.disabled = true;
  workdirApplyBtn.disabled = true;
  setStatus(`Switching channel to ${channelLabel(selectedChannelId)}...`);
  try {
    const result = await window.assistantAPI.switchChannel(selectedChannelId);
    if (!result?.ok) {
      throw new Error(result?.error || 'Channel switch failed');
    }

    state.provider = result.provider || state.provider;
    state.runtimeMode = String(result.runtimeMode || state.runtimeMode).toLowerCase() === 'api' ? 'api' : 'cli';
    state.apiConfig = normalizeApiConfig(result.apiConfig || state.apiConfig);
    setChannels(
      Array.isArray(result.channels) ? result.channels : state.channels,
      result.activeChannelId || buildChannelId(state.runtimeMode, state.provider)
    );
    appendMessage('system', `Channel switched to ${channelLabel(state.activeChannelId)}. Conversation context reset.`);
    setStatus(`Channel updated (${channelLabel(state.activeChannelId)})`);
    return true;
  } catch (error) {
    const message = String(error.message || error);
    appendMessage('system', `Channel switch failed: ${message}`);
    setStatus(`Channel switch failed: ${message}`, true);
    return false;
  } finally {
    channelSwitchBtn.disabled = false;
    workdirPickBtn.disabled = false;
    workdirApplyBtn.disabled = false;
    updateRuntimeUiState();
    inputEl.focus();
  }
}

async function ensureChannelApplied() {
  if (state.channels.length === 0) {
    setStatus('No available channel. Configure API in Settings or install Codex/Claude CLI.', true);
    return false;
  }
  const selected = normalizeChannelId(channelSelect.value || state.activeChannelId || '');
  if (!selected) {
    setStatus('No available channel. Configure API in Settings or install Codex/Claude CLI.', true);
    return false;
  }
  if (selected === normalizeChannelId(state.activeChannelId)) {
    return true;
  }
  return switchChannel();
}

async function saveApiConfig() {
  const template = normalizeApiTemplate(apiTemplateSelect.value || state.apiConfig.template || 'openai');
  const baseUrl = apiBaseInput.value.trim();
  const model = apiModelInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!baseUrl) {
    setStatus('API base URL cannot be empty', true);
    return false;
  }
  if (!model) {
    setStatus('API model cannot be empty', true);
    return false;
  }

  apiSaveBtn.disabled = true;
  channelSwitchBtn.disabled = true;
  channelSelect.disabled = true;
  setStatus('Saving API config...');
  try {
    const result = await window.assistantAPI.setApiConfig({
      template,
      baseUrl,
      model,
      apiKey,
    });
    if (!result?.ok) {
      throw new Error(result?.error || 'Save API config failed');
    }
    state.apiConfig = normalizeApiConfig(result.apiConfig || { template, baseUrl, model });
    apiTemplateSelect.value = state.apiConfig.template;
    apiBaseInput.value = state.apiConfig.baseUrl;
    apiModelInput.value = state.apiConfig.model;
    apiKeyInput.value = '';
    setChannels(
      Array.isArray(result.channels) ? result.channels : state.channels,
      result.activeChannelId || state.activeChannelId
    );
    appendMessage('system', `Cloud API config saved (${state.apiConfig.baseUrl}, model=${state.apiConfig.model}).`);
    if (state.channels.some((item) => normalizeChannelId(item.id) === 'api')) {
      setStatus(`API config saved (${state.apiConfig.model})`);
    } else {
      setStatus('API config saved. Add valid key/model/base URL to enable API channel.', true);
    }
    return true;
  } catch (error) {
    const message = String(error.message || error);
    appendMessage('system', `Save API config failed: ${message}`);
    setStatus(`Save API config failed: ${message}`, true);
    return false;
  } finally {
    updateRuntimeUiState();
    if (!state.settingsOpen) {
      inputEl.focus();
    }
  }
}

async function saveDefaultChannel() {
  if (!defaultChannelSelect || !defaultChannelSaveBtn) {
    return false;
  }
  if (!window.assistantAPI?.setDefaultChannel) {
    setStatus('Default channel config API is unavailable', true);
    return false;
  }

  const selected = normalizeChannelId(defaultChannelSelect?.value || '');
  defaultChannelSaveBtn.disabled = true;
  setStatus('Saving default channel...');
  try {
    const result = await window.assistantAPI.setDefaultChannel(selected);
    if (!result?.ok) {
      throw new Error(result?.error || 'Save default channel failed');
    }
    state.defaultChannelId = normalizeChannelId(result.defaultChannelId || '');
    syncDefaultChannelOptions();
    appendMessage(
      'system',
      state.defaultChannelId
        ? `Default Run channel saved: ${channelLabel(state.defaultChannelId)}.`
        : 'Default Run channel cleared (follow last used).'
    );
    setStatus('Default channel saved');
    return true;
  } catch (error) {
    const message = String(error.message || error);
    appendMessage('system', `Save default channel failed: ${message}`);
    setStatus(`Save default channel failed: ${message}`, true);
    return false;
  } finally {
    updateRuntimeUiState();
    if (!state.settingsOpen) {
      inputEl.focus();
    }
  }
}

async function saveLiveWatchConfig() {
  if (!window.assistantAPI?.setLiveWatchConfig) {
    setStatus('Live watch config API is unavailable', true);
    return false;
  }

  let payload;
  try {
    payload = readLiveWatchConfigFromInputs();
  } catch (error) {
    setStatus(String(error.message || error), true);
    return false;
  }

  liveSaveBtn.disabled = true;
  setStatus('Saving live watch config...');
  try {
    const result = await window.assistantAPI.setLiveWatchConfig(payload);
    if (!result?.ok) {
      throw new Error(result?.error || 'Save live watch config failed');
    }
    applyLiveWatchStateFromPayload(result);
    syncLiveWatchSettingsInputs();
    updateRuntimeUiState();
    appendMessage(
      'system',
      `Live watch config saved: interval=${state.liveWatchIntervalMs}ms, rolling-context=${state.liveWatchSummaryEveryFrames} frame(s), memory=${state.liveWatchMaxImageFrames}, analysis=${state.liveWatchMaxImagesPerAnalysis}, text-only-rounds=${state.liveWatchTextOnlyMaxRounds}.`
    );
    setStatus(
      state.liveWatchRunning
        ? `Live config updated (${state.liveWatchIntervalMs}ms / ${state.liveWatchSummaryEveryFrames}f)`
        : `Live config saved (${state.liveWatchIntervalMs}ms / ${state.liveWatchSummaryEveryFrames}f)`
    );
    return true;
  } catch (error) {
    const message = String(error.message || error);
    appendMessage('system', `Save live watch config failed: ${message}`);
    setStatus(`Save live watch config failed: ${message}`, true);
    return false;
  } finally {
    updateRuntimeUiState();
    if (!state.settingsOpen) {
      inputEl.focus();
    }
  }
}

function permissionDisplayName(kind) {
  const key = String(kind || '')
    .trim()
    .toLowerCase();
  if (key === 'microphone') {
    return 'Microphone';
  }
  if (key === 'screen') {
    return 'Screen Recording';
  }
  if (key === 'accessibility') {
    return 'Accessibility';
  }
  if (key === 'automation') {
    return 'Automation';
  }
  return key || 'Permission';
}

async function requestPermissionByKind(kind) {
  if (!window.assistantAPI?.requestPermission) {
    setStatus('Permission API is unavailable', true);
    return false;
  }
  const title = permissionDisplayName(kind);
  state.permissionsLoading = true;
  updateRuntimeUiState();
  setStatus(`Requesting ${title} permission...`);
  try {
    const result = await window.assistantAPI.requestPermission(kind);
    if (result?.snapshot) {
      state.permissions = normalizePermissionSnapshot(result.snapshot);
      renderPermissionPanel();
    }
    if (!result?.ok) {
      throw new Error(result?.error || `${title} permission was not granted.`);
    }
    const statusText = statusLabel(result?.status || 'unknown');
    appendMessage('system', `${title} permission status: ${statusText}.`);
    setStatus(`${title} permission ready`);
    return true;
  } catch (error) {
    const message = String(error.message || error);
    appendMessage('system', `${title} permission error: ${message}`);
    setStatus(`${title} permission error: ${message}`, true);
    return false;
  } finally {
    state.permissionsLoading = false;
    updateRuntimeUiState();
  }
}

async function openPermissionSettingsByKind(kind) {
  if (!window.assistantAPI?.openPermissionSettings) {
    setStatus('Permission Settings API is unavailable', true);
    return false;
  }
  const title = permissionDisplayName(kind);
  state.permissionsLoading = true;
  updateRuntimeUiState();
  setStatus(`Opening System Settings for ${title}...`);
  try {
    const result = await window.assistantAPI.openPermissionSettings(kind);
    if (result?.snapshot) {
      state.permissions = normalizePermissionSnapshot(result.snapshot);
      renderPermissionPanel();
    }
    if (!result?.ok) {
      throw new Error(result?.error || `Unable to open System Settings for ${title}.`);
    }
    setStatus(`System Settings opened for ${title}`);
    return true;
  } catch (error) {
    const message = String(error.message || error);
    setStatus(`Open Settings failed: ${message}`, true);
    return false;
  } finally {
    state.permissionsLoading = false;
    updateRuntimeUiState();
  }
}

async function openReadmeDocument() {
  if (!window.assistantAPI?.openReadme) {
    setStatus('README API is unavailable', true);
    return false;
  }
  setStatus('Opening README...');
  try {
    const result = await window.assistantAPI.openReadme();
    if (!result?.ok) {
      throw new Error(result?.error || 'README is unavailable');
    }
    setStatus('README opened');
    return true;
  } catch (error) {
    const message = String(error.message || error);
    setStatus(`Open README failed: ${message}`, true);
    return false;
  }
}

function fillApiTemplate() {
  const selected = normalizeApiTemplate(apiTemplateSelect.value || state.apiConfig.template || 'openai');
  const preset = getApiTemplatePreset(selected);
  state.apiConfig.template = preset.template;
  apiTemplateSelect.value = preset.template;
  apiBaseInput.value = preset.baseUrl;
  apiModelInput.value = preset.model;
  setStatus(preset.note);
  apiBaseInput.focus();
}

async function applyWorkdir(rawOverride = null) {
  const raw = (typeof rawOverride === 'string' ? rawOverride : workdirInput.value).trim();
  if (!raw) {
    setStatus('Workdir cannot be empty', true);
    return;
  }

  channelSwitchBtn.disabled = true;
  workdirPickBtn.disabled = true;
  workdirApplyBtn.disabled = true;
  setStatus('Switching workdir...');
  try {
    const result = await window.assistantAPI.setWorkdir(raw);
    if (!result?.ok) {
      throw new Error(result?.error || 'Switch failed');
    }

    state.workdir = result.workdir || raw;
    workdirInput.value = state.workdir;
    workdirInput.title = state.workdir;
    appendMessage('system', `Workdir switched to:\n${state.workdir}\nConversation context reset.`);
    setStatus('Workdir updated');
  } catch (error) {
    setStatus(`Workdir update failed: ${String(error.message || error)}`, true);
  } finally {
    channelSwitchBtn.disabled = false;
    workdirPickBtn.disabled = false;
    workdirApplyBtn.disabled = false;
    updateRuntimeUiState();
    inputEl.focus();
  }
}

async function pickWorkdir() {
  workdirPickBtn.disabled = true;
  workdirApplyBtn.disabled = true;
  setStatus('Opening folder picker...');
  try {
    const result = await window.assistantAPI.pickWorkdir();
    if (!result?.ok) {
      throw new Error(result?.error || 'Folder picker failed');
    }
    if (result?.canceled) {
      setStatus('Folder selection canceled');
      return;
    }

    if (typeof result.workdir === 'string' && result.workdir.trim()) {
      await applyWorkdir(result.workdir);
    } else {
      setStatus('No folder selected', true);
    }
  } catch (error) {
    setStatus(`Folder picker failed: ${String(error.message || error)}`, true);
  } finally {
    workdirPickBtn.disabled = false;
    workdirApplyBtn.disabled = false;
    inputEl.focus();
  }
}

function applyVoiceText(text) {
  const merged = [inputEl.value.trim(), text.trim()].filter(Boolean).join('\n');
  inputEl.value = merged;
  autoResizeInput();
}

function formatVoiceElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function clearVoiceTicker() {
  if (state.voiceTicker) {
    clearInterval(state.voiceTicker);
    state.voiceTicker = null;
  }
}

function stopMediaStream() {
  if (!state.mediaStream) {
    return;
  }
  try {
    const tracks = state.mediaStream.getTracks ? state.mediaStream.getTracks() : [];
    for (const track of tracks) {
      try {
        track.stop();
      } catch (_error) {
        // no-op
      }
    }
  } catch (_error) {
    // no-op
  }
  state.mediaStream = null;
}

function canUseApiVoiceTranscription() {
  const hasApiChannel = Array.isArray(state.channels)
    ? state.channels.some((item) => normalizeChannelId(item?.id) === 'api')
    : false;
  return Boolean(window.assistantAPI?.transcribeAudio) && hasApiChannel;
}

async function ensureMicrophoneAccess() {
  if (!window.assistantAPI?.requestMicrophoneAccess) {
    return { ok: true, status: 'unknown' };
  }
  const result = await window.assistantAPI.requestMicrophoneAccess();
  if (!result?.ok) {
    throw new Error(result?.error || 'Microphone permission is required for voice input.');
  }
  return result;
}

function resetVoiceButton() {
  state.listening = false;
  state.transcribingVoice = false;
  state.voiceMode = '';
  state.mediaRecorder = null;
  state.mediaMimeType = '';
  state.mediaChunks = [];
  state.voiceStartedAt = 0;
  clearVoiceTicker();
  stopMediaStream();
  voiceBtn.classList.remove('recording');
  voiceBtn.textContent = 'Voice';
}

function pickVoiceRecorderMimeType() {
  if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const item of candidates) {
    try {
      if (MediaRecorderCtor.isTypeSupported(item)) {
        return item;
      }
    } catch (_error) {
      // Ignore unsupported check errors.
    }
  }
  return '';
}

async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function voiceFileNameFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('ogg')) {
    return 'voice.ogg';
  }
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) {
    return 'voice.m4a';
  }
  if (mime.includes('wav')) {
    return 'voice.wav';
  }
  if (mime.includes('mpeg') || mime.includes('mp3')) {
    return 'voice.mp3';
  }
  return 'voice.webm';
}

async function transcribeRecordedVoice(blob, mimeType = 'audio/webm') {
  if (!window.assistantAPI?.transcribeAudio) {
    throw new Error('Voice transcription API is unavailable.');
  }
  const size = Number(blob?.size || 0);
  if (!size) {
    throw new Error('No recorded audio captured.');
  }
  if (size > 25 * 1024 * 1024) {
    throw new Error('Recorded audio is too large (max 25MB).');
  }

  setStatus('Transcribing voice...');
  const audioBase64 = await blobToBase64(blob);
  const language = String(navigator.language || '').trim();
  const result = await window.assistantAPI.transcribeAudio({
    audioBase64,
    mime: mimeType || blob.type || 'audio/webm',
    fileName: voiceFileNameFromMime(mimeType || blob.type || 'audio/webm'),
    language,
  });
  if (!result?.ok) {
    throw new Error(result?.error || 'Voice transcription failed');
  }
  const text = String(result.text || '').trim();
  if (!text) {
    throw new Error('No speech recognized from recording.');
  }
  return text;
}

async function startMediaRecorderVoice() {
  if (!MediaRecorderCtor || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording is not supported in this environment.');
  }
  await ensureMicrophoneAccess();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const mimeType = pickVoiceRecorderMimeType();
  const recorder = mimeType ? new MediaRecorderCtor(stream, { mimeType }) : new MediaRecorderCtor(stream);

  state.mediaStream = stream;
  state.mediaRecorder = recorder;
  state.mediaMimeType = recorder.mimeType || mimeType || 'audio/webm';
  state.mediaChunks = [];
  state.voiceMode = 'media';
  state.listening = true;
  state.transcribingVoice = false;
  state.voiceStartedAt = Date.now();
  voiceBtn.classList.add('recording');
  voiceBtn.textContent = 'Stop';
  setStatus('Recording voice... click Stop to transcribe');

  clearVoiceTicker();
  state.voiceTicker = setInterval(() => {
    const elapsed = Date.now() - Number(state.voiceStartedAt || Date.now());
    setStatus(`Recording voice... ${formatVoiceElapsed(elapsed)} (click Stop to finish)`);
  }, 1000);

  recorder.addEventListener('dataavailable', (event) => {
    if (event?.data && event.data.size > 0) {
      state.mediaChunks.push(event.data);
    }
  });

  recorder.addEventListener('error', (event) => {
    clearVoiceTicker();
    stopMediaStream();
    state.mediaRecorder = null;
    state.listening = false;
    state.voiceMode = '';
    voiceBtn.classList.remove('recording');
    voiceBtn.textContent = 'Voice';
    setStatus(`Voice recording failed: ${String(event?.error?.message || event?.error || 'unknown error')}`, true);
  });

  recorder.addEventListener('stop', () => {
    void (async () => {
      clearVoiceTicker();
      const chunks = Array.isArray(state.mediaChunks) ? [...state.mediaChunks] : [];
      const mime = state.mediaMimeType || recorder.mimeType || 'audio/webm';
      state.mediaChunks = [];
      state.listening = false;
      state.voiceMode = '';
      state.mediaRecorder = null;
      stopMediaStream();

      if (chunks.length === 0) {
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = 'Voice';
        setStatus('No speech detected', true);
        return;
      }

      const blob = new Blob(chunks, { type: mime });
      state.transcribingVoice = true;
      voiceBtn.classList.remove('recording');
      voiceBtn.textContent = '...';
      try {
        const transcript = await transcribeRecordedVoice(blob, mime);
        applyVoiceText(transcript);
        setStatus('Voice text added');
      } catch (error) {
        setStatus(`Voice transcription failed: ${String(error.message || error)}`, true);
      } finally {
        state.transcribingVoice = false;
        voiceBtn.textContent = 'Voice';
      }
    })();
  });

  recorder.start(300);
}

function ensureRecognition() {
  if (!SpeechRecognitionCtor) {
    return null;
  }

  if (state.recognition) {
    return state.recognition;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.addEventListener('result', (event) => {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        state.finalVoiceText = `${state.finalVoiceText} ${transcript}`.trim();
      } else {
        interim += transcript;
      }
    }

    if (interim.trim()) {
      setStatus(`Listening... ${interim.trim()}`);
    } else {
      setStatus('Listening...');
    }
  });

  recognition.addEventListener('error', (event) => {
    resetVoiceButton();
    setStatus(`Voice failed: ${String(event.error || 'unknown error')}`, true);
  });

  recognition.addEventListener('end', () => {
    if (state.finalVoiceText.trim()) {
      applyVoiceText(state.finalVoiceText);
      state.finalVoiceText = '';
      setStatus('Voice text added');
    } else if (state.listening) {
      setStatus('No speech detected', true);
    }

    resetVoiceButton();
  });

  state.recognition = recognition;
  return recognition;
}

async function startSpeechRecognitionVoice() {
  const recognition = ensureRecognition();
  if (!recognition) {
    setStatus('Voice recognition not supported in this environment', true);
    return;
  }

  try {
    state.finalVoiceText = '';
    state.listening = true;
    state.voiceMode = 'speech';
    voiceBtn.classList.add('recording');
    voiceBtn.textContent = 'Stop';
    setStatus('Listening... click Stop to finish');
    recognition.start();
  } catch (error) {
    resetVoiceButton();
    setStatus(`Cannot start voice: ${String(error.message || error)}`, true);
  }
}

async function startVoiceRecognition() {
  if (state.transcribingVoice) {
    return;
  }
  const canUseApiTranscription = canUseApiVoiceTranscription();
  if (canUseApiTranscription && MediaRecorderCtor && navigator.mediaDevices?.getUserMedia) {
    try {
      await startMediaRecorderVoice();
      return;
    } catch (error) {
      if (!SpeechRecognitionCtor) {
        resetVoiceButton();
        setStatus(`Cannot start voice: ${String(error.message || error)}`, true);
        return;
      }
      setStatus(`Microphone recorder unavailable, fallback to speech recognition. ${String(error.message || error)}`, true);
    }
  }
  if (!SpeechRecognitionCtor && !canUseApiTranscription) {
    setStatus('Voice input unavailable. Configure API in Settings for cloud transcription, then try again.', true);
    return;
  }
  await startSpeechRecognitionVoice();
}

async function stopVoiceRecognition() {
  if (state.transcribingVoice) {
    return;
  }
  if (state.voiceMode === 'media' && state.mediaRecorder) {
    if (state.mediaRecorder.state === 'inactive') {
      return;
    }
    setStatus('Stopping voice recording...');
    try {
      state.mediaRecorder.stop();
    } catch (error) {
      setStatus(`Stop recording failed: ${String(error.message || error)}`, true);
      resetVoiceButton();
    }
    return;
  }

  const recognition = ensureRecognition();
  if (!recognition) {
    setStatus('Voice recognition not supported', true);
    return;
  }

  if (!state.listening) {
    return;
  }

  setStatus('Stopping voice...');
  recognition.stop();
}

sendBtn.addEventListener('click', () => {
  if (state.sending) {
    pauseSendMessage();
    return;
  }
  sendMessage();
});

hideBtn.addEventListener('click', () => {
  window.assistantAPI.hideChat();
});

clearBtn.addEventListener('click', () => {
  state.attachments = [];
  state.activeRequestId = '';
  state.streamMessageEl = null;
  state.streamMessageBodyEl = null;
  state.streamText = '';
  state.streamUsedForActiveRequest = false;
  state.automationResultShown = false;
  state.lastAutomationResult = '';
  renderAttachments();
  window.assistantAPI.clearConversation();
  messagesEl.innerHTML = '';
  appendMessage('system', 'Conversation cleared.');
  if (state.channels.length === 0) {
    setStatus('No available channel. Configure API in Settings or install Codex/Claude CLI.', true);
  } else {
    setStatus('Ready');
  }
});

workdirApplyBtn.addEventListener('click', () => {
  applyWorkdir();
});

channelSwitchBtn.addEventListener('click', () => {
  switchChannel();
});

settingsBtn.addEventListener('click', () => {
  openSettingsModal();
});

settingsCloseBtn.addEventListener('click', () => {
  closeSettingsModal();
});

settingsTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const tab = normalizeSettingsTab(button.dataset.settingsTab || 'api');
    setSettingsTab(tab, { focus: false });
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSettingsTabBy(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSettingsTabBy(1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const first = settingsTabButtons.find((item) => !item.disabled);
      if (first) {
        setSettingsTab(first.dataset.settingsTab || 'api', { focus: true });
      }
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const enabled = settingsTabButtons.filter((item) => !item.disabled);
      const last = enabled[enabled.length - 1];
      if (last) {
        setSettingsTab(last.dataset.settingsTab || 'api', { focus: true });
      }
    }
  });
});

settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    closeSettingsModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.settingsOpen) {
    event.preventDefault();
    closeSettingsModal();
  }
});

apiTemplateFillBtn.addEventListener('click', () => {
  fillApiTemplate();
});

apiSaveBtn.addEventListener('click', () => {
  saveApiConfig();
});

defaultChannelSaveBtn?.addEventListener('click', () => {
  saveDefaultChannel();
});

liveSaveBtn.addEventListener('click', () => {
  saveLiveWatchConfig();
});

permissionRefreshBtn?.addEventListener('click', () => {
  void refreshPermissionPanel({ silent: false });
});

permissionRequestMicBtn?.addEventListener('click', () => {
  void requestPermissionByKind('microphone');
});

permissionOpenMicBtn?.addEventListener('click', () => {
  void openPermissionSettingsByKind('microphone');
});

permissionRequestScreenBtn?.addEventListener('click', () => {
  void requestPermissionByKind('screen');
});

permissionOpenScreenBtn?.addEventListener('click', () => {
  void openPermissionSettingsByKind('screen');
});

permissionRequestAccessibilityBtn?.addEventListener('click', () => {
  void requestPermissionByKind('accessibility');
});

permissionOpenAccessibilityBtn?.addEventListener('click', () => {
  void openPermissionSettingsByKind('accessibility');
});

permissionRequestAutomationBtn?.addEventListener('click', () => {
  void requestPermissionByKind('automation');
});

permissionOpenAutomationBtn?.addEventListener('click', () => {
  void openPermissionSettingsByKind('automation');
});

aboutReadmeLink?.addEventListener('click', (event) => {
  event.preventDefault();
  void openReadmeDocument();
});

autoBtn.addEventListener('click', () => {
  if (state.automationBusy) {
    pauseAutomation();
    return;
  }
  runAutomation();
});

liveBtn.addEventListener('click', () => {
  if (state.liveWatchRunning) {
    void stopLiveWatch();
    return;
  }
  void startLiveWatch();
});

channelSelect.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    switchChannel();
  }
});

channelSelect.addEventListener('change', () => {
  switchChannel();
});

apiTemplateSelect.addEventListener('change', () => {
  state.apiConfig.template = normalizeApiTemplate(apiTemplateSelect.value || state.apiConfig.template || 'openai');
  updateRuntimeUiState();
});

apiTemplateSelect.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    fillApiTemplate();
  }
});

defaultChannelSelect?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveDefaultChannel();
  }
});

workdirPickBtn.addEventListener('click', () => {
  pickWorkdir();
});

workdirInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyWorkdir();
  }
});

apiBaseInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveApiConfig();
  }
});

apiModelInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveApiConfig();
  }
});

apiKeyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveApiConfig();
  }
});

[liveIntervalInput, liveSummaryFramesInput, liveMaxImageFramesInput, liveMaxImagesAnalysisInput, liveTextOnlyRoundsInput]
  .filter(Boolean)
  .forEach((input) => {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveLiveWatchConfig();
    }
  });
});

if (liveIntervalInput) {
  liveIntervalInput.addEventListener('change', () => {
    liveIntervalInput.value = String(normalizeLiveWatchIntervalMs(liveIntervalInput.value));
  });
}

if (liveSummaryFramesInput) {
  liveSummaryFramesInput.addEventListener('change', () => {
    liveSummaryFramesInput.value = String(normalizeLiveWatchSummaryEveryFrames(liveSummaryFramesInput.value));
  });
}

if (liveMaxImageFramesInput && liveMaxImagesAnalysisInput) {
  liveMaxImageFramesInput.addEventListener('change', () => {
    const normalizedMaxFrames = normalizeLiveWatchMaxImageFrames(liveMaxImageFramesInput.value);
    liveMaxImageFramesInput.value = String(normalizedMaxFrames);
    const normalizedMaxAnalysis = normalizeLiveWatchMaxImagesPerAnalysis(
      liveMaxImagesAnalysisInput.value,
      normalizedMaxFrames
    );
    liveMaxImagesAnalysisInput.value = String(normalizedMaxAnalysis);
  });
}

if (liveMaxImagesAnalysisInput && liveMaxImageFramesInput) {
  liveMaxImagesAnalysisInput.addEventListener('change', () => {
    const maxFrames = normalizeLiveWatchMaxImageFrames(liveMaxImageFramesInput.value);
    liveMaxImagesAnalysisInput.value = String(
      normalizeLiveWatchMaxImagesPerAnalysis(liveMaxImagesAnalysisInput.value, maxFrames)
    );
  });
}

if (liveTextOnlyRoundsInput) {
  liveTextOnlyRoundsInput.addEventListener('change', () => {
    liveTextOnlyRoundsInput.value = String(normalizeLiveWatchTextOnlyMaxRounds(liveTextOnlyRoundsInput.value));
  });
}

fileInput.addEventListener('change', () => {
  normalizeSelectedFiles(fileInput.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((eventName) => {
  composerEl.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    composerEl.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  composerEl.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (eventName === 'drop') {
      normalizeSelectedFiles(event.dataTransfer?.files || []);
    }
    composerEl.classList.remove('dragging');
  });
});

inputEl.addEventListener('paste', (event) => {
  const files = event.clipboardData?.files || [];
  if (files.length > 0) {
    normalizeSelectedFiles(files);
    setStatus('Pasted file(s) added');
  }
});

voiceBtn.addEventListener('click', async () => {
  if (state.listening) {
    await stopVoiceRecognition();
  } else {
    await startVoiceRecognition();
  }
});

inputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

inputEl.addEventListener('input', autoResizeInput);

autoResizeInput();
appendMessage(
  'system',
  'Hi. Use Send for chat, Auto for task execution, or Live for proactive screen watching. Use /live <focus> to set watch focus, /live clear to reset.'
);
setStatus('Ready');
loadConfig();
setSendButtonMode('idle');
setAutoButtonMode('idle');
setLiveButtonMode('idle');
setSettingsTab(state.settingsTab, { focus: false });
renderPermissionPanel();
inputEl.focus();

if (window.assistantAPI?.onFocusInput) {
  window.assistantAPI.onFocusInput(() => {
    inputEl.focus();
  });
}

if (window.assistantAPI?.onOpenSettings) {
  window.assistantAPI.onOpenSettings((payload) => {
    const tab = payload && typeof payload === 'object' ? String(payload.tab || '').trim() : '';
    if (tab) {
      openSettingsModalWithTab(tab);
      return;
    }
    openSettingsModal();
  });
}

if (window.assistantAPI?.onAutomationStatus) {
  window.assistantAPI.onAutomationStatus((update) => {
    handleAutomationStatus(update);
  });
}

if (window.assistantAPI?.onLiveWatchStatus) {
  window.assistantAPI.onLiveWatchStatus((update) => {
    handleLiveWatchStatus(update);
  });
}

if (window.assistantAPI?.onLiveWatchObservation) {
  window.assistantAPI.onLiveWatchObservation((update) => {
    handleLiveWatchObservation(update);
  });
}

if (window.assistantAPI?.onResponseStream) {
  window.assistantAPI.onResponseStream((update) => {
    const data = update && typeof update === 'object' ? update : {};
    const requestId = String(data.requestId || '').trim();
    if (!requestId || requestId !== state.activeRequestId) {
      return;
    }
    const phase = String(data.phase || '').trim().toLowerCase();
    if (phase === 'start') {
      state.streamUsedForActiveRequest = true;
      startAssistantStream();
      setStatus('Assistant is thinking...');
      return;
    }
    if (phase === 'delta') {
      state.streamUsedForActiveRequest = true;
      appendAssistantStreamDelta(String(data.delta || ''));
      setStatus('Assistant is replying...');
      return;
    }
    if (phase === 'done') {
      state.streamUsedForActiveRequest = true;
      finishAssistantStream(String(data.text || ''));
      return;
    }
    if (phase === 'error') {
      if (String(state.streamText || '').trim()) {
        finishAssistantStream('');
      } else {
        discardAssistantStream();
      }
    }
  });
}

if (window.assistantAPI?.onQuickAsk) {
  window.assistantAPI.onQuickAsk((payload) => {
    void applyQuickAskPayload(payload).catch((error) => {
      setStatus(`Quick ask failed: ${String(error.message || error)}`, true);
    });
  });
}

if (window.assistantAPI?.onConversationSync) {
  window.assistantAPI.onConversationSync((update) => {
    handleConversationSync(update);
  });
}

if (window.assistantAPI?.onQuickAskStatus) {
  window.assistantAPI.onQuickAskStatus((payload) => {
    const message = String(payload?.message || '').trim();
    if (!message) {
      return;
    }
    setStatus(message, Boolean(payload?.isError));
  });
}
