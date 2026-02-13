const bubble = document.getElementById('assistant-bubble');
const waitingDot = document.getElementById('bubble-waiting-dot');
const DRAG_DISTANCE_THRESHOLD = 4;
const DOUBLE_CLICK_DELAY_MS = 220;
let pointerDrag = null;
let singleClickTimer = null;

function normalizeUiTheme(rawTheme) {
  const value = String(rawTheme || '')
    .trim()
    .toLowerCase();
  return value === 'light' ? 'light' : 'dark';
}

function applyUiTheme(rawTheme) {
  const theme = normalizeUiTheme(rawTheme);
  document.body.dataset.theme = theme;
  return theme;
}

function applyBubbleState(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const busy = Boolean(data.busy);
  const label = String(data.label || '').trim();
  applyUiTheme(data.uiTheme);
  bubble.classList.toggle('busy', busy);
  if (waitingDot) {
    waitingDot.setAttribute('aria-hidden', busy ? 'false' : 'true');
  }
  bubble.title = busy ? label || 'manman is processing...' : 'Open manman';
}

function toggleChat() {
  if (window.assistantAPI?.toggleChat) {
    window.assistantAPI.toggleChat();
    return;
  }
  window.alert('manman bridge is unavailable. Please restart the app.');
}

function toggleQuickReply() {
  if (window.assistantAPI?.toggleQuickReply) {
    window.assistantAPI.toggleQuickReply();
    return;
  }
  window.alert('manman bridge is unavailable. Please restart the app.');
}

function clearSingleClickTimer() {
  if (!singleClickTimer) {
    return;
  }
  clearTimeout(singleClickTimer);
  singleClickTimer = null;
}

function handleBubblePointerTap() {
  if (singleClickTimer) {
    clearSingleClickTimer();
    toggleChat();
    return;
  }
  singleClickTimer = setTimeout(() => {
    singleClickTimer = null;
    toggleQuickReply();
  }, DOUBLE_CLICK_DELAY_MS);
}

function beginPointerDrag(event) {
  if (event.button !== 0) {
    return;
  }
  pointerDrag = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    moved: false,
  };
  document.body.classList.add('dragging');
  try {
    bubble.setPointerCapture(event.pointerId);
  } catch (_error) {
    // no-op
  }
  if (window.assistantAPI?.bubbleDragStart) {
    window.assistantAPI.bubbleDragStart({
      screenX: event.screenX,
      screenY: event.screenY,
    });
  }
}

function movePointerDrag(event) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
    return;
  }
  const dx = event.screenX - pointerDrag.startScreenX;
  const dy = event.screenY - pointerDrag.startScreenY;
  if (!pointerDrag.moved && Math.hypot(dx, dy) >= DRAG_DISTANCE_THRESHOLD) {
    pointerDrag.moved = true;
    clearSingleClickTimer();
  }
  if (pointerDrag.moved && window.assistantAPI?.bubbleDragMove) {
    window.assistantAPI.bubbleDragMove({
      screenX: event.screenX,
      screenY: event.screenY,
    });
  }
  event.preventDefault();
  event.stopPropagation();
}

function endPointerDrag(event, cancelled = false) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
    return;
  }
  if (cancelled || pointerDrag.moved) {
    clearSingleClickTimer();
  }
  const shouldTap = !cancelled && !pointerDrag.moved && event.button === 0;
  pointerDrag = null;
  document.body.classList.remove('dragging');
  if (window.assistantAPI?.bubbleDragEnd) {
    window.assistantAPI.bubbleDragEnd();
  }
  try {
    if (bubble.hasPointerCapture(event.pointerId)) {
      bubble.releasePointerCapture(event.pointerId);
    }
  } catch (_error) {
    // no-op
  }
  event.preventDefault();
  event.stopPropagation();
  if (shouldTap) {
    handleBubblePointerTap();
  }
}

bubble.addEventListener('pointerdown', (event) => {
  beginPointerDrag(event);
});

bubble.addEventListener('pointermove', (event) => {
  movePointerDrag(event);
});

bubble.addEventListener('pointerup', (event) => {
  endPointerDrag(event, false);
});

bubble.addEventListener('pointercancel', (event) => {
  endPointerDrag(event, true);
});

bubble.addEventListener('click', (event) => {
  // Click is handled via pointerup to avoid toggling after drag.
  event.preventDefault();
  event.stopPropagation();
});

bubble.addEventListener('contextmenu', (event) => {
  clearSingleClickTimer();
  event.preventDefault();
  event.stopPropagation();
  if (window.assistantAPI?.openBubbleMenu) {
    window.assistantAPI.openBubbleMenu();
    return;
  }
  const shouldQuit = window.confirm('Quit manman?');
  if (shouldQuit) {
    window.assistantAPI.quitApp();
  }
});

if (window.assistantAPI?.onBubbleState) {
  window.assistantAPI.onBubbleState((payload) => {
    applyBubbleState(payload);
  });
}

applyUiTheme('dark');
