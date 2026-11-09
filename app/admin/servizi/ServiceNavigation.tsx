export default function ServiceNavigation() {
  return <nav aria-label="Servizi di scraping" className="flex flex-wrap gap-4">
    <a href="/admin/servizi/telegram">Telegram</a>
    <a href="/admin/servizi/whatsapp">WhatsApp</a>
    <a href="/admin/servizi/instagram">Instagram</a>
    <a href="/admin">Amministrazione</a><a href="/cron">Cron</a>
  </nav>;
}
