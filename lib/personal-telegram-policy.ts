const eventTerms = /\b(?:evento|manifestazione|concerto|sagra|fiera|spettacolo|mostra|presentazione|festival|rassegna|mercato|incontro pubblico|event|concert|festival|exhibition)\b/i;
const venueTerms = /\b(?:presso|via|piazza|viale|corso|teatro|auditorium|biblioteca|centro civico|sala comunale|museo|parco|cinema|palazzo)\b/i;
const fullDate = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/. -]\d{1,2}[/. -]\d{4}|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/i;
const privateContent = /\b(?:chat privata|messaggio privato|festa privata|evento privato|solo invitati|riservato agli invitati|compleanno|invito personale|private party|invitation only)\b/i;

export function isPrivateAnnouncement(value: string): boolean {
  return privateContent.test(value);
}

export function sanitizePersonalTelegramText(value: string): string {
  return value
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, ' ')
    .replace(/@[A-Za-z0-9_]{3,}/g, ' ')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, value =>
      /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[. -]\d{1,2}[. -]\d{4})$/.test(value) ? value : ' ')
    .replace(/\b-100\d{5,}\b/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 12000);
}

export function isPublicEventAnnouncement(value: string): boolean {
  const text = value.trim();
  return text.length >= 30 && text.length <= 12000 && eventTerms.test(text) && fullDate.test(text) &&
    venueTerms.test(text) && !privateContent.test(text);
}

export function publicAnnouncementExcerpt(value: string): string {
  const text = sanitizePersonalTelegramText(value);
  if (!isPublicEventAnnouncement(text)) return '';
  const excerpt = announcementCandidateExcerpt(text);
  return isPublicEventAnnouncement(excerpt) ? excerpt : '';
}

export function announcementCandidateExcerpt(value: string): string {
  if (isPrivateAnnouncement(value)) return '';
  const text = sanitizePersonalTelegramText(value);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const informative = /\b(?:evento|manifestazione|concerto|sagra|fiera|spettacolo|mostra|presentazione|festival|rassegna|mercato|incontro pubblico|event|concert|exhibition|20\d{2}|\d{1,2}[:.]\d{2}|ore|presso|via|piazza|viale|corso|teatro|auditorium|biblioteca|centro civico|sala comunale|museo|parco|cinema|palazzo|ingresso|gratuito)\b/i;
  const selected = lines.filter(line => informative.test(line));
  return selected.join('\n').slice(0, 4000);
}

export function permittedAnnouncementText(value: string): string {
  return publicAnnouncementExcerpt(value);
}
