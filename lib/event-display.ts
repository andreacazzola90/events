export function getEventStartTime(raw?: string | null): string | null {
  const match = (raw || '').trim().match(/(?:^|[^\d])(\d{1,2})(?:[:.](\d{2}))?(?!\d)/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}