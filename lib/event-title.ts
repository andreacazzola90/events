const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = [
  ['gennaio', 'gen'], ['febbraio', 'feb'], ['marzo', 'mar'], ['aprile', 'apr'],
  ['maggio', 'mag'], ['giugno', 'giu'], ['luglio', 'lug'], ['agosto', 'ago'],
  ['settembre', 'set'], ['ottobre', 'ott'], ['novembre', 'nov'], ['dicembre', 'dic'],
];

export function normalizeEventTitle(title: string, rawDate: string): string {
  const cleanTitle = (title || '').trim().replace(/^#{1,6}\s*/, '').trim();
  const dateMatch = (rawDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return cleanTitle;

  const [, yearValue, monthValue, dayValue] = dateMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return cleanTitle;
  }

  const weekday = WEEKDAYS[date.getUTCDay()];
  const monthNames = MONTHS[month - 1];
  const dayPattern = `(?:${String(day).padStart(2, '0')}|${day})`;
  const monthPattern = `(?:${monthNames[0]}|${monthNames[1]}\\.?)`;
  const yearPattern = `(?:${year}|${String(year).slice(-2)})`;
  const numericDate = `${dayPattern}[./-]${String(month).padStart(2, '0')}(?:[./-]${yearPattern})?`;
  const namedDate = `${dayPattern}\\s+${monthPattern}(?:\\s+${yearPattern})?`;
  const prefix = new RegExp(
    `^(?:${weekday}\\s+)?(?:${namedDate}|${numericDate})(?:\\s*[,|:;–—-]\\s*|\\s+)`,
    'i',
  );
  const match = cleanTitle.match(prefix);
  if (!match) return cleanTitle;

  const remainingTitle = cleanTitle.slice(match[0].length).trim();
  return remainingTitle || cleanTitle;
}