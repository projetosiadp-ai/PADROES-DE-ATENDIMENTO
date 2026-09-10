const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.disabled && !element.hidden && element.tabIndex >= 0
  ));
}

export function activateDialogFocus(dialog, options = {}) {
  const documentRef = options.document ?? globalThis.document;
  if (!dialog || !documentRef) throw new TypeError('Dialogo e documento sao obrigatorios.');

  const opener = options.opener ?? documentRef.activeElement;
  // Accepts a predicate so a dialog can block Escape only while an operation is in flight.
  const escapeCloses = () => (typeof options.escapeCloses === 'function'
    ? options.escapeCloses() !== false
    : options.escapeCloses !== false);
  let active = true;

  const focusFirst = () => {
    const first = focusableElements(dialog)[0];
    if (first) first.focus();
    else {
      if (typeof dialog.setAttribute === 'function' && dialog.tabIndex < 0) {
        dialog.setAttribute('tabindex', '-1');
      }
      dialog.focus?.();
    }
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    documentRef.removeEventListener?.('keydown', onKeydown);
    documentRef.removeEventListener?.('focusin', onFocusIn);
    if (opener?.isConnected !== false) opener?.focus?.();
  };

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      if (!escapeCloses()) return;
      event.preventDefault();
      deactivate();
      options.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = focusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus?.();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = documentRef.activeElement;
    if (event.shiftKey && (current === first || !dialog.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (event) => {
    if (active && !dialog.contains(event.target)) focusFirst();
  };

  documentRef.addEventListener?.('keydown', onKeydown);
  documentRef.addEventListener?.('focusin', onFocusIn);

  const requestedInitialFocus = options.initialFocus;
  if (requestedInitialFocus && dialog.contains(requestedInitialFocus)) requestedInitialFocus.focus();
  else focusFirst();

  return deactivate;
}
