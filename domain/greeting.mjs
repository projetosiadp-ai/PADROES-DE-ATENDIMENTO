// Saudação da faixa da marca. O horário é sempre o de Brasília, e não o do aparelho,
// para que a equipe veja o mesmo período do dia em qualquer fuso.
const TIME_ZONE = 'America/Sao_Paulo';

const hourFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

export function localHour(date = new Date()) {
  return Number(hourFormatter.format(date));
}

export function periodFor(date = new Date()) {
  const hour = localHour(date);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function firstNameOf(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

export function greetingFor(date = new Date(), fullName = '') {
  const period = periodFor(date);
  const firstName = firstNameOf(fullName);
  return firstName ? `${period}, ${firstName}` : period;
}
