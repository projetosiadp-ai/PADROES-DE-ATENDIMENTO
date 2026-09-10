function createManualFallback(text, documentRef) {
  if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
    throw new Error('Cópia automática indisponível e não foi possível oferecer a alternativa manual');
  }

  const element = documentRef.createElement('textarea');
  element.value = text;
  element.setAttribute('readonly', '');
  element.setAttribute('aria-label', 'Texto para cópia manual');
  Object.assign(element.style, {
    position: 'fixed',
    inset: 'auto 1rem 1rem 1rem',
    zIndex: '2147483647',
  });
  documentRef.body.append(element);
  element.focus();
  element.select();
  return element;
}

function dispatchTelemetry(telemetry, onTelemetryError) {
  if (typeof telemetry !== 'function') return;

  try {
    Promise.resolve(telemetry()).catch(error => {
      if (typeof onTelemetryError === 'function') onTelemetryError(error);
    });
  } catch (error) {
    if (typeof onTelemetryError === 'function') onTelemetryError(error);
  }
}

export async function copyExactText(text, options = {}) {
  const {
    clipboard = globalThis.navigator?.clipboard,
    document: documentRef = globalThis.document,
    telemetry,
    onTelemetryError,
  } = options;

  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      dispatchTelemetry(telemetry, onTelemetryError);
      return { copied: true, method: 'clipboard' };
    } catch {
      // The selectable fallback below preserves the original text verbatim.
    }
  }

  return {
    copied: false,
    method: 'manual',
    element: createManualFallback(text, documentRef),
  };
}
