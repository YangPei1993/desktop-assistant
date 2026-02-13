const inputEl = document.getElementById('quick-reply-input');
const sendBtn = document.getElementById('quick-reply-send-btn');
const closeBtn = document.getElementById('quick-reply-close-btn');

let sending = false;

function setSending(nextSending) {
  sending = Boolean(nextSending);
  if (sendBtn) {
    sendBtn.disabled = sending;
  }
}

async function sendQuickReply() {
  if (sending) {
    return;
  }
  const rawDraft = String(inputEl?.value || '');
  const text = rawDraft.trim();
  if (!text) {
    inputEl?.focus();
    return;
  }
  if (!window.assistantAPI?.sendMessage) return;

  setSending(true);
  if (inputEl) {
    inputEl.value = '';
  }
  try {
    const result = await window.assistantAPI.sendMessage({
      text,
      attachments: [],
    });
    if (!result?.ok && inputEl) {
      inputEl.value = rawDraft;
    }
  } finally {
    setSending(false);
    inputEl?.focus();
  }
}

sendBtn?.addEventListener('click', () => {
  void sendQuickReply();
});

closeBtn?.addEventListener('click', () => {
  if (window.assistantAPI?.hideQuickReply) {
    window.assistantAPI.hideQuickReply();
  }
});

inputEl?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendQuickReply();
    return;
  }
  if (event.key === 'Escape' && !sending) {
    event.preventDefault();
    if (window.assistantAPI?.hideQuickReply) {
      window.assistantAPI.hideQuickReply();
    }
  }
});

if (window.assistantAPI?.onFocusQuickReply) {
  window.assistantAPI.onFocusQuickReply(() => {
    inputEl?.focus();
  });
}

window.addEventListener('load', () => {
  inputEl?.focus();
});
