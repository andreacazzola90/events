function collectMatches(text: string, regexes: RegExp[], max = 10): string[] {
  const found = new Set<string>();
  for (const base of regexes) {
    const re = new RegExp(base.source, base.flags); // clone to avoid lastIndex issues
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0].trim();
      if (value) {
        found.add(value);
        if (found.size >= max) break;
      }
    }
    if (found.size >= max) break;
  }
  return Array.from(found);
}

export function buildEventExtractionHints(rawText: string): string {
  if (!rawText || !rawText.trim()) {
    return 'Nessun testo OCR disponibile per gli indizi.';
  }

  const text = rawText;

  const dateRegexes = [
    /\b\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}\b/g, // 23/01/2025, 23-1-25
    /\b\d{4}-\d{2}-\d{2}\b/g, // 2025-01-23
    // es. "15 mar", "15 marzo", "15 MARZO"
    /\b\d{1,2}\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\b/gi,
    // range tipo "dal 12 al 14 marzo"
    /\b(?:dal|da)\s+\d{1,2}\s+(?:al|alla|fino al)\s+\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\b/gi,
    // giorni della settimana
    /\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b/gi,
    /\b(domani|oggi|stasera|stanotte|questa sera|questo sabato|prossimo weekend|settimana prossima)\b/gi,
  ];

  const timeRegexes = [
    /\b\d{1,2}[:.]\d{2}\b/g, // 21:00, 9.30
    /\b(?:h|ore?)\s*\d{1,2}(?::\d{2})?\b/gi, // h 21, ore 21:30
    /\b(dalle|da)\s*\d{1,2}[:.]\d{2}\s*(alle|fino alle?)\s*\d{1,2}[:.]\d{2}\b/gi, // dalle 21:00 alle 23:00
  ];

  const priceRegexes = [
    /\b(?:€\s?\d+[,.]?\d*|\d+[,.]?\d*\s?€)\b/gi,
    /\b(?:ingresso libero|ingresso gratuito|ingresso gratis|gratis|offerta libera|donazione libera|ingresso con offerta)\b/gi,
    /\b(?:ridotto|riduzione|under\s*\d+|over\s*\d+)\b[^\n]{0,40}/gi,
    /\b(?:biglietto|prezzo|costo|contributo)[^\n]{0,60}/gi,
    /\b(?:con tessera\s+(arci|aics|uisp)|tessera\s+(arci|aics|uisp))[^\n]{0,40}/gi,
  ];

  const dates = collectMatches(text, dateRegexes, 12);
  const times = collectMatches(text, timeRegexes, 12);
  const prices = collectMatches(text, priceRegexes, 12);

  const locationLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => /\b(via|viale|piazza|largo|corso|vicolo|teatro|cinema|club|live club|stadio|palazz[oai]|auditorium|parco|discoteca|arena|stadio|sala|oratorio)\b/i.test(l))
    .slice(0, 6);

  const organizerLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l =>
      /organizzat[oa] da|a cura di|presentat[oa] da|in collaborazione con|con il patrocinio di/i.test(l) ||
      /Comune di\s+[A-ZÀ-Ú][A-Za-zÀ-ÿ']+/.test(l) ||
      /Associazion[ei]|ASD\b|APS\b|Pro Loco|Circolo|Cineforum Altovicentino|Visit Schio|Aziend[ae]\b|Azienda Agricola|Società Agricola|Agriturismo/i.test(l)
    )
    .slice(0, 6);

  const lines: string[] = [];
  lines.push('POSSIBILI INDIZI ESTRATTI AUTOMATICAMENTE (POSSONO CONTENERE ERRORI, USALI SOLO COME GUIDA):');

  lines.push(
    dates.length
      ? `DATE CANDIDATE: ${dates.join(' | ')}`
      : 'DATE CANDIDATE: nessuna trovata'
  );

  lines.push(
    times.length
      ? `ORARI CANDIDATI: ${times.join(' | ')}`
      : 'ORARI CANDIDATI: nessuno trovato'
  );

  lines.push(
    prices.length
      ? `FRASI LEGATE AL PREZZO: ${prices.join(' | ')}`
      : 'FRASI LEGATE AL PREZZO: nessuna trovata'
  );

  if (locationLines.length) {
    lines.push('RIGHE CHE SEMBRANO LUOGHI (NOME LOCALE / INDIRIZZO):');
    for (const l of locationLines) {
      lines.push(`- ${l}`);
    }
  } else {
    lines.push('RIGHE LUOGO: nessuna riga chiaramente riconosciuta come indirizzo/luogo.');
  }

   if (organizerLines.length) {
    lines.push('RIGHE CHE SEMBRANO ORGANIZZATORI (ASSOCIAZIONI / COMUNE / ENTI):');
    for (const l of organizerLines) {
      lines.push(`- ${l}`);
    }
  } else {
    lines.push('RIGHE ORGANIZZATORE: nessuna riga chiaramente riconosciuta come organizzatore.');
  }

  return lines.join('\n');
}
