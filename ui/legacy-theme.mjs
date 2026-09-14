/* Espelho em JavaScript dos tokens de styles/design-system.css.
 *
 * Existe só enquanto a Administração (Etapa 3) e as janelas (Etapa 2) montam estilo embutido.
 * Cada etapa que migra uma dessas telas para as classes do design system remove chaves daqui;
 * ao fim da Etapa 3 o arquivo deixa de ser necessário. Nenhum arquivo já migrado pode importar
 * cores deste módulo (tests/design-tokens.test.mjs cobre isso pela lista MIGRATED_FILES).
 *
 * Tema único claro: a constituição v3.0.0 exige nova especificação para qualquer tema escuro.
 */
export const LEGACY_THEME = Object.freeze({
  onBrand: '#FFFFFF',
  navy: '#16336E',
  cyan: '#09679F',
  pageBg: '#F4F7FC',
  cardBg: '#FFFFFF',
  modalSolidBg: '#FFFFFF',
  chipBg: '#EEF3FA',
  chipBgHover: '#DCE5F3',
  logoSrc: 'assets/dp2-logo.png',
  inputBg: '#F4F9FE',
  text: '#0E2350',
  textSecondary: '#4A5F8C',
  textTertiary: '#4A5F8C',
  border: '#DCE5F3',
  border2: '#7488B0',
  radiusSm: '9px',
  radiusMd: '12px',
  radiusLg: '14px',
  radiusXl: '16px',
  shadowSm: '0 1px 2px rgba(14,35,80,.06)',
  shadowMd: '0 10px 26px -24px rgba(14,35,80,.35)',
  shadowLg: '0 14px 34px -26px rgba(14,35,80,.45)',
  glassEffect: '',

  panel: '#FFFFFF',
  accent: '#09679F',
  accentSoft: '#E6F4FC',
  brand: '#16336E',
  brand2: '#0E2350',
  brandGradient: 'linear-gradient(115deg,#0E2350 0%,#16336E 48%,#0E93D8 140%)',
  glow: '0 10px 26px -20px rgba(14,35,80,.55)',
  ok: '#107A52',
  okSoft: '#E7F5EF',
  danger: '#B82D2D',
  dangerSoft: '#FBF1F1',
  toastBg: '#0E2350',
  toastInk: '#FFFFFF',
  fontDisplay: "'Sora Variable', 'Manrope Variable', system-ui, sans-serif",
  fontBody: "'Manrope Variable', system-ui, sans-serif",
});

// Cor inicial sugerida ao criar um acesso (campo de cor da Administração).
export const DEFAULT_ACCESS_COLOR = '#0E93D8';
