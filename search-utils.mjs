// search-utils.mjs
// Pure helpers used by app.js for search/highlighting. No DOM, no `this`, no network —
// this is what makes them unit-testable from Node without a browser.

export function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
  }
  return d[m][n];
}

export function fuzzyTok(q, target) {
  if (target.includes(q)) return true;
  if (q.length >= 4 && Math.abs(target.length - q.length) <= 2 && levenshtein(q, target) <= 1) return true;
  return false;
}

export function matchesSearch(msg, query) {
  const q = normalize(query).trim();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const content = normalize(msg.conteudo);
  const titleWords = normalize(msg.titulo).split(/\s+/);
  const tagWords = msg.tags.map(t => normalize(t));
  const cat = normalize(msg.categoria);
  return tokens.every(tok =>
    content.includes(tok) || cat.includes(tok) ||
    titleWords.some(w => fuzzyTok(tok, w)) ||
    tagWords.some(t => t.includes(tok) || fuzzyTok(tok, t))
  );
}

export function pickActiveAcesso(acessos, activeAcessoId) {
  if (!acessos.length) return null;
  return acessos.find(a => a.id === activeAcessoId) || acessos[0];
}

export function titleSegments(titulo, query, highlightStyle) {
  const q = (query || '').trim();
  if (!q) return [{ text: titulo, style: '' }];
  const idx = titulo.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return [{ text: titulo, style: '' }];
  const before = titulo.slice(0, idx), match = titulo.slice(idx, idx + q.length), after = titulo.slice(idx + q.length);
  const segs = [];
  if (before) segs.push({ text: before, style: '' });
  segs.push({ text: match, style: highlightStyle || '' });
  if (after) segs.push({ text: after, style: '' });
  return segs;
}
