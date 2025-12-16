# 📱 EventScanner PWA - Guida Completa

## ✨ Funzionalità PWA Implementate

### 1. 🏠 Installazione su Telefono

#### iPhone (iOS Safari):
1. Apri l'app in Safari
2. Tocca il pulsante "Condividi" (icona quadrato con freccia)
3. Scorri e seleziona "Aggiungi alla schermata Home"
4. Conferma il nome dell'app
5. L'icona apparirà nella home screen

#### Android (Chrome):
1. Apri l'app in Chrome
2. Tocca i tre puntini (menu)
3. Seleziona "Installa app" o "Aggiungi a Home"
4. Conferma l'installazione
5. L'app sarà disponibile nel drawer delle app

### 2. 📸 Selezione Sorgente Immagine

Quando tocchi "Aggiungi immagine" su mobile, apparirà un menu con:

- **📷 Fotocamera** - Scatta una foto in tempo reale
- **🖼️ Galleria** - Seleziona un'immagine esistente
- **Annulla** - Chiudi il menu

### 3. 🔄 Condivisione da Altre App

#### Come funziona:
1. Scatta uno screenshot o salva una foto di un evento
2. Apri l'app Foto/Galleria
3. Seleziona l'immagine
4. Tocca "Condividi"
5. Scegli "EventScanner" dalla lista
6. L'app si aprirà automaticamente e processerà l'immagine

#### Esempi d'uso:
- Screenshot di eventi da Instagram/Facebook
- Foto di locandine eventi
- Screenshot di email con eventi
- Foto di volantini

### 4. 🌐 Funzionalità Offline

L'app può funzionare anche offline:
- Le pagine visitate vengono salvate in cache
- Puoi navigare tra eventi già caricati
- La mappa funziona se i dati sono già stati caricati

### 5. ⚡ Scorciatoie Rapide

Su Android (long-press sull'icona):
- **Crea Evento** - Vai direttamente a /crea
- **Mappa Eventi** - Apri subito la mappa

## 🔧 Dettagli Tecnici

### Service Worker
- Cache intelligente delle risorse statiche
- Update automatico ogni ora
- Gestione offline delle pagine visitate

### Web Share Target API
- Ricevi immagini da qualsiasi app
- Elaborazione automatica all'apertura
- Cache temporanea dell'immagine condivisa

### Compressione Immagini
- Limite OCR: 1MB (900KB target)
- Compressione automatica lato client (Canvas)
- Compressione server-side (Sharp)
- Qualità: 85% JPEG

### Manifest PWA
- Display: standalone (nasconde barra browser)
- Theme color: #2563eb (blu)
- Orientamento: portrait (consigliato)
- Icons: 192x192 e 512x512 (maskable)

## 🎯 Best Practices

### Per ottenere i migliori risultati:

1. **Fotocamera**
   - Inquadra bene il testo
   - Assicurati di avere buona illuminazione
   - Mantieni il telefono stabile

2. **Screenshot**
   - Cattura l'intera locandina dell'evento
   - Evita elementi sovrapposti (notifiche, UI)
   - Riduci prima se l'immagine è molto grande

3. **Link**
   - Preferisci link diretti all'evento
   - Funziona meglio con siti strutturati (VisitSchio, Dice.fm)

## 🐛 Troubleshooting

### L'app non si installa?
- **iOS**: Verifica di usare Safari (non Chrome)
- **Android**: Aggiorna Chrome all'ultima versione

### La condivisione non funziona?
- Reinstalla l'app
- Pulisci cache del browser
- Verifica che l'app sia installata (non aperta nel browser)

### L'immagine è troppo grande?
- L'app comprime automaticamente
- Se continua a dare errore, riduci manualmente prima

### La fotocamera non si apre?
- Verifica i permessi nelle impostazioni
- Su iOS: Impostazioni > Safari > Fotocamera
- Su Android: Impostazioni > App > Chrome > Permessi

## 📊 Sviluppo Futuro

Funzionalità pianificate:
- 🔔 Notifiche push per nuovi eventi
- 📍 Geolocalizzazione per eventi vicini
- 🌙 Modalità dark/light toggle
- 💾 Sincronizzazione cloud degli eventi
- 🎨 Temi personalizzabili

## 🚀 Deploy e Testing

### Test della PWA:
1. **Lighthouse** (Chrome DevTools)
   - Apri DevTools
   - Tab "Lighthouse"
   - Categoria "Progressive Web App"
   - Verifica score PWA

2. **PWA Builder**
   - https://www.pwabuilder.com/
   - Inserisci URL della tua app
   - Controlla compatibilità

3. **Test su dispositivo reale**
   - Deploy su Vercel
   - Apri da mobile
   - Testa installazione e condivisione

## 📝 Note

- Il Service Worker si aggiorna automaticamente ogni ora
- La cache viene pulita automaticamente ad ogni update
- Le immagini condivise sono temporanee (cancellate dopo l'uso)
- La compressione preserva la qualità OCR

---

**Sviluppato con ❤️ per EventScanner**
