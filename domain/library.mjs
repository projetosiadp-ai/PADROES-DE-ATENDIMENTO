import { matchesSearch } from '../search-utils.mjs';

const SORTERS = {
  frequencia: (left, right) =>
    (Number(right.frequencia) || 0) - (Number(left.frequencia) || 0),
  recencia: (left, right) =>
    dateValue(right.used_at ?? right.usado_em) - dateValue(left.used_at ?? left.usado_em),
  alfabetica: (left, right) =>
    String(left.titulo ?? '').localeCompare(String(right.titulo ?? ''), 'pt-BR', { sensitivity: 'base' }),
};

function dateValue(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function selectLibraryMessages(messages = [], options = {}) {
  const { query = '', categoryId = null, sortBy = 'relevancia' } = options;
  const selected = messages.filter(message =>
    message?.arquivado_em == null &&
    (!categoryId || message.categoria_id === categoryId) &&
    matchesSearch(message, query)
  );

  const sorter = SORTERS[sortBy];
  return sorter ? selected.sort(sorter) : selected;
}

// Accepts an array or comma-separated text; trims and drops case-insensitive duplicates.
export function normalizeTags(values = []) {
  const list = typeof values === 'string' ? values.split(',') : Array.from(values ?? []);
  const seen = new Set();
  return list.map(tag => String(tag ?? '').trim()).filter(tag => {
    const key = tag.toLocaleLowerCase('pt-BR');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function paginateLibraryMessages(messages = [], requestedLimit = 30, pageSize = 30) {
  const safePageSize = Math.max(1, Number(pageSize) || 30);
  const safeLimit = Math.max(safePageSize, Number(requestedLimit) || safePageSize);
  const limit = Math.min(messages.length, safeLimit);
  return {
    items: messages.slice(0, limit),
    total: messages.length,
    hasMore: limit < messages.length,
    nextLimit: Math.min(messages.length, limit + safePageSize),
  };
}
