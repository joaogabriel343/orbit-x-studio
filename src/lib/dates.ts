export const DEFAULT_ZONE = "America/Sao_Paulo";
export const ZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/New_York",
  "Europe/Lisbon",
  "UTC",
];
export function dateParts(value: string | Date, zone = DEFAULT_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
export function dateKey(value: string | Date, zone = DEFAULT_ZONE) {
  const p = dateParts(value, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function dateTimeInput(value: string | Date, zone = DEFAULT_ZONE) {
  const p = dateParts(value, zone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedToIso(value: string, zone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Informe a data e o horário.");
  const [, y, m, d, h, min] = match.map(Number);
  const target = Date.UTC(y, m - 1, d, h, min);
  let utc = target;
  for (let i = 0; i < 4; i++) {
    const p = dateParts(new Date(utc), zone);
    const displayed = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    const diff = target - displayed;
    utc += diff;
    if (!diff) break;
  }
  if (dateTimeInput(new Date(utc), zone) !== value)
    throw new Error(
      "Este horário não existe no fuso selecionado. Escolha outro horário.",
    );
  return new Date(utc).toISOString();
}
export const timeLabel = (value: string, zone = DEFAULT_ZONE) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const dayLabel = (value: string, zone = DEFAULT_ZONE) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
