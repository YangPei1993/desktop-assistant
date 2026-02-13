const toastList = document.getElementById('bubble-toast-list');
const toastItemTemplate = document.getElementById('bubble-toast-item-template');

function normalizeToastType(rawType) {
  const type = String(rawType || 'info')
    .trim()
    .toLowerCase();
  if (type === 'warn' || type === 'error') {
    return type;
  }
  return 'info';
}

function renderBubbleToasts(payload) {
  if (!toastList || !toastItemTemplate) {
    return;
  }
  const data = payload && typeof payload === 'object' ? payload : {};
  const items = Array.isArray(data.items) ? data.items : [];

  toastList.innerHTML = '';
  for (const item of items) {
    const text = String(item?.text || '').trim();
    const id = String(item?.id || '').trim();
    if (!text || !id) {
      continue;
    }
    const fragment = toastItemTemplate.content.cloneNode(true);
    const node = fragment.querySelector('.bubble-toast-item');
    const textNode = fragment.querySelector('.bubble-toast-text');
    const closeBtn = fragment.querySelector('.bubble-toast-close-btn');
    if (!node || !textNode || !closeBtn) {
      continue;
    }
    const type = normalizeToastType(item?.type);
    node.classList.add(type);
    node.dataset.id = id;
    textNode.textContent = text;
    closeBtn.dataset.id = id;
    toastList.appendChild(fragment);
  }
}

toastList?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.classList.contains('bubble-toast-close-btn')) {
    event.preventDefault();
    event.stopPropagation();
    const id = String(target.dataset.id || '').trim();
    if (!id) {
      return;
    }
    if (window.assistantAPI?.closeBubbleToast) {
      window.assistantAPI.closeBubbleToast({ id });
    }
    return;
  }
  // Allow scrolling/selection inside the text area without triggering quick reply open.
  if (target.closest('.bubble-toast-text')) {
    return;
  }
  const itemEl = target.closest('.bubble-toast-item');
  if (!(itemEl instanceof HTMLElement)) {
    return;
  }
  const id = String(itemEl.dataset.id || '').trim();
  if (!id) {
    return;
  }
  if (window.assistantAPI?.openQuickReplyFromBubbleToast) {
    window.assistantAPI.openQuickReplyFromBubbleToast({ id });
  }
});

if (window.assistantAPI?.onBubbleToast) {
  window.assistantAPI.onBubbleToast((payload) => {
    renderBubbleToasts(payload);
  });
}
