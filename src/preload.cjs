const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantAPI', {
  toggleChat: () => ipcRenderer.send('bubble:toggle-chat'),
  showChat: () => ipcRenderer.send('chat:show'),
  toggleQuickReply: () => ipcRenderer.send('bubble:toggle-quick-reply'),
  showQuickReply: () => ipcRenderer.send('quick-reply:show'),
  hideQuickReply: () => ipcRenderer.send('quick-reply:hide'),
  openChatFromQuickReply: () => ipcRenderer.send('quick-reply:open-chat'),
  openQuickReplyFromBubbleToast: (payload) => ipcRenderer.send('assistant:bubble-toast-quick-reply', payload || {}),
  openBubbleMenu: () => ipcRenderer.send('bubble:context-menu'),
  bubbleDragStart: (payload) => ipcRenderer.send('bubble:drag-start', payload),
  bubbleDragMove: (payload) => ipcRenderer.send('bubble:drag-move', payload),
  bubbleDragEnd: () => ipcRenderer.send('bubble:drag-end'),
  hideChat: () => ipcRenderer.send('chat:hide'),
  clearConversation: () => ipcRenderer.send('chat:clear'),
  quitApp: () => ipcRenderer.send('app:quit'),
  sendMessage: (payload) => ipcRenderer.invoke('assistant:send', payload),
  interruptSend: () => ipcRenderer.invoke('assistant:interrupt-send'),
  runAutomation: (payload) => ipcRenderer.invoke('assistant:automation-run', payload),
  interruptAutomation: () => ipcRenderer.invoke('assistant:interrupt-automation'),
  startLiveWatch: (payload) => ipcRenderer.invoke('assistant:live-watch-start', payload || {}),
  stopLiveWatch: () => ipcRenderer.invoke('assistant:live-watch-stop'),
  setLiveWatchFocus: (payload) => ipcRenderer.invoke('assistant:live-watch-focus', payload || {}),
  setLiveWatchConfig: (payload) => ipcRenderer.invoke('assistant:set-live-watch-config', payload || {}),
  getConfig: () => ipcRenderer.invoke('assistant:get-config'),
  setUiTheme: (uiTheme) => ipcRenderer.invoke('assistant:set-ui-theme', { uiTheme }),
  switchChannel: (channelId) => ipcRenderer.invoke('assistant:switch-channel', { channelId }),
  setDefaultChannel: (channelId) => ipcRenderer.invoke('assistant:set-default-channel', { channelId }),
  setRuntimeMode: (runtimeMode) => ipcRenderer.invoke('assistant:set-runtime-mode', { runtimeMode }),
  setApiConfig: (apiConfig) => ipcRenderer.invoke('assistant:set-api-config', apiConfig),
  requestMicrophoneAccess: () => ipcRenderer.invoke('assistant:request-microphone-access'),
  getPermissions: () => ipcRenderer.invoke('assistant:get-permissions'),
  requestPermission: (kind) => ipcRenderer.invoke('assistant:request-permission', { kind }),
  openPermissionSettings: (kind) => ipcRenderer.invoke('assistant:open-permission-settings', { kind }),
  getRuntimeHealth: () => ipcRenderer.invoke('assistant:get-runtime-health'),
  openReadme: () => ipcRenderer.invoke('assistant:open-readme'),
  openProductHome: () => ipcRenderer.invoke('assistant:open-product-home'),
  openPath: (targetPath) => ipcRenderer.invoke('assistant:open-path', { path: targetPath }),
  getSkillsState: (payload) => ipcRenderer.invoke('assistant:get-skills-state', payload || {}),
  installCuratedSkill: (payload) => ipcRenderer.invoke('assistant:skill-install-curated', payload || {}),
  installSkillFromGithub: (payload) => ipcRenderer.invoke('assistant:skill-install-github', payload || {}),
  createSkill: (payload) => ipcRenderer.invoke('assistant:skill-create', payload || {}),
  validateSkill: (payload) => ipcRenderer.invoke('assistant:skill-validate', payload || {}),
  getAgentsWorkflows: () => ipcRenderer.invoke('assistant:get-agents-workflows'),
  saveAgent: (payload) => ipcRenderer.invoke('assistant:save-agent', payload || {}),
  deleteAgent: (payload) => ipcRenderer.invoke('assistant:delete-agent', payload || {}),
  saveWorkflow: (payload) => ipcRenderer.invoke('assistant:save-workflow', payload || {}),
  deleteWorkflow: (payload) => ipcRenderer.invoke('assistant:delete-workflow', payload || {}),
  transcribeAudio: (payload) => ipcRenderer.invoke('assistant:transcribe-audio', payload || {}),
  setProvider: (provider) => ipcRenderer.invoke('assistant:set-provider', { provider }),
  pickWorkdir: () => ipcRenderer.invoke('assistant:pick-workdir'),
  setWorkdir: (workdir) => ipcRenderer.invoke('assistant:set-workdir', { workdir }),
  onAutomationStatus: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:automation-status', listener);
    return () => ipcRenderer.removeListener('assistant:automation-status', listener);
  },
  onLiveWatchStatus: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:live-watch-status', listener);
    return () => ipcRenderer.removeListener('assistant:live-watch-status', listener);
  },
  onLiveWatchObservation: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:live-watch-observation', listener);
    return () => ipcRenderer.removeListener('assistant:live-watch-observation', listener);
  },
  onResponseStream: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:response-stream', listener);
    return () => ipcRenderer.removeListener('assistant:response-stream', listener);
  },
  onFocusInput: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = () => handler();
    ipcRenderer.on('assistant:focus-input', listener);
    return () => ipcRenderer.removeListener('assistant:focus-input', listener);
  },
  onFocusQuickReply: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = () => handler();
    ipcRenderer.on('assistant:focus-quick-reply', listener);
    return () => ipcRenderer.removeListener('assistant:focus-quick-reply', listener);
  },
  onOpenSettings: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:open-settings', listener);
    return () => ipcRenderer.removeListener('assistant:open-settings', listener);
  },
  onQuickReplyContext: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:quick-reply-context', listener);
    return () => ipcRenderer.removeListener('assistant:quick-reply-context', listener);
  },
  onQuickAsk: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:quick-ask', listener);
    return () => ipcRenderer.removeListener('assistant:quick-ask', listener);
  },
  onQuickAskStatus: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:quick-ask-status', listener);
    return () => ipcRenderer.removeListener('assistant:quick-ask-status', listener);
  },
  onUiTheme: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:ui-theme', listener);
    return () => ipcRenderer.removeListener('assistant:ui-theme', listener);
  },
  onBubbleState: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:bubble-state', listener);
    return () => ipcRenderer.removeListener('assistant:bubble-state', listener);
  },
  onBubbleToast: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:bubble-toast', listener);
    return () => ipcRenderer.removeListener('assistant:bubble-toast', listener);
  },
  onConversationSync: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('assistant:conversation-sync', listener);
    return () => ipcRenderer.removeListener('assistant:conversation-sync', listener);
  },
  closeBubbleToast: (payload) => ipcRenderer.send('assistant:bubble-toast-close', payload || {}),
});
