// Variáveis nas mensagens (FR-016 a FR-019): trechos entre colchetes só com letras maiúsculas
// (inclusive acentuadas), números e sublinhado, como [NOME], [DATA_VENCIMENTO] ou [ENDEREÇO].
// Os valores digitados nunca saem da memória da tela: este módulo não grava nada.
const VARIABLE_PATTERN = /\[([\p{Lu}\p{N}_]+)\]/gu;

const hasValue = (value) => typeof value === 'string' && value.trim() !== '';

// Nomes distintos, na ordem em que aparecem pela primeira vez.
export function extractVariables(content) {
  const names = [];
  for (const [, name] of String(content ?? '').matchAll(VARIABLE_PATTERN)) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

// [DATA_VENCIMENTO] → "Data vencimento"; [ENDEREÇO] → "Endereço".
export function variableLabel(name) {
  const words = String(name ?? '').split('_').filter(Boolean).map(word => word.toLocaleLowerCase('pt-BR'));
  if (!words.length) return '';
  const sentence = words.join(' ');
  return sentence.charAt(0).toLocaleUpperCase('pt-BR') + sentence.slice(1);
}

// Substitui todas as ocorrências das variáveis preenchidas e mantém as vazias entre colchetes.
export function fillVariables(content, values = {}) {
  const text = String(content ?? '').replace(VARIABLE_PATTERN, (match, name) => (
    hasValue(values[name]) ? values[name] : match
  ));
  const names = extractVariables(content);
  const filled = names.filter(name => hasValue(values[name])).length;
  return { text, filled, empty: names.length - filled, total: names.length };
}

/* Trechos para exibir o texto com destaque: o que é texto comum, o que é uma variável ainda
 * vazia (mostrada entre colchetes) e o que é um valor já digitado. */
export function variableSegments(content, values = {}) {
  const source = String(content ?? '');
  const segments = [];
  let last = 0;
  for (const match of source.matchAll(VARIABLE_PATTERN)) {
    if (match.index > last) segments.push({ kind: 'text', text: source.slice(last, match.index) });
    const name = match[1];
    segments.push(hasValue(values[name])
      ? { kind: 'value', name, text: values[name] }
      : { kind: 'variable', name, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < source.length) segments.push({ kind: 'text', text: source.slice(last) });
  return segments;
}

// Texto de estado: "2 variáveis preenchidas · 1 sem preencher".
export function variablesStatus({ filled, empty }) {
  const filledLabel = `${filled} ${filled === 1 ? 'variável preenchida' : 'variáveis preenchidas'}`;
  return empty > 0 ? `${filledLabel} · ${empty} sem preencher` : filledLabel;
}

// Inserir [NOME] na posição do cursor (janelas de solicitar e editar, FR-020).
export function insertAtCursor(text, token, start, end = start) {
  const source = String(text ?? '');
  const from = Number.isInteger(start) ? Math.max(0, Math.min(start, source.length)) : source.length;
  const to = Number.isInteger(end) ? Math.max(from, Math.min(end, source.length)) : from;
  return { text: source.slice(0, from) + token + source.slice(to), caret: from + token.length };
}
