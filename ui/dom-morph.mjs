const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const keyOf = (element) => (
  element?.nodeType === ELEMENT_NODE && typeof element.getAttribute === 'function'
    ? element.getAttribute('data-key')
    : null
);

function syncAttrs(oldElement, newElement) {
  const oldAttributes = oldElement.attributes;
  for (let index = oldAttributes.length - 1; index >= 0; index--) {
    const name = oldAttributes[index].name;
    if (!newElement.hasAttribute(name)) oldElement.removeAttribute(name);
  }
  const newAttributes = newElement.attributes;
  for (let index = 0; index < newAttributes.length; index++) {
    const { name, value } = newAttributes[index];
    if (oldElement.getAttribute(name) !== value) oldElement.setAttribute(name, value);
  }
}

export function syncFormValue(oldElement, newElement) {
  const tag = oldElement.tagName;
  if (tag === 'SELECT') {
    if (oldElement.value !== newElement.value) oldElement.value = newElement.value;
    return;
  }
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
  if (oldElement.value === newElement.value) return;

  const isActive = oldElement.ownerDocument?.activeElement === oldElement;
  const selection = isActive && Number.isInteger(oldElement.selectionStart)
    ? {
        start: oldElement.selectionStart,
        end: oldElement.selectionEnd,
        direction: oldElement.selectionDirection ?? 'none',
      }
    : null;

  oldElement.value = newElement.value;

  if (selection && typeof oldElement.setSelectionRange === 'function') {
    const max = oldElement.value.length;
    oldElement.setSelectionRange(
      Math.min(selection.start, max),
      Math.min(selection.end, max),
      selection.direction,
    );
  }
}

export function morphNode(oldNode, newNode) {
  if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
    return newNode.cloneNode(true);
  }
  if (oldNode.nodeType === TEXT_NODE || oldNode.nodeType === COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return oldNode;
  }
  if (oldNode.nodeType !== ELEMENT_NODE) return oldNode;
  syncAttrs(oldNode, newNode);
  syncFormValue(oldNode, newNode);
  morphChildren(oldNode, newNode);
  return oldNode;
}

export function morphChildren(oldParent, newParent) {
  const oldChildren = Array.from(oldParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);
  const oldKeyed = new Map();
  oldChildren.forEach((child) => {
    const key = keyOf(child);
    if (key) oldKeyed.set(key, child);
  });
  const used = new Set();

  for (let index = 0; index < newChildren.length; index++) {
    const newChild = newChildren[index];
    const newKey = keyOf(newChild);
    let match = null;
    if (newKey && oldKeyed.has(newKey) && !used.has(oldKeyed.get(newKey))) {
      match = oldKeyed.get(newKey);
    } else {
      const candidate = oldChildren[index];
      if (candidate && !used.has(candidate) && candidate.nodeName === newChild.nodeName && !keyOf(candidate)) {
        match = candidate;
      }
    }

    const kept = match ? morphNode(match, newChild) : newChild.cloneNode(true);
    if (match) used.add(match);
    const reference = oldParent.childNodes[index] || null;
    if (reference !== kept) oldParent.insertBefore(kept, reference);
  }

  while (oldParent.childNodes.length > newChildren.length) {
    oldParent.removeChild(oldParent.lastChild);
  }
}
