# PWA Testing Script

## Test localmente con HTTPS

Per testare la PWA su mobile, serve HTTPS. Opzioni:

### 1. Ngrok (consigliato)
```bash
# Installa ngrok
brew install ngrok  # macOS
# oppure scarica da https://ngrok.com/

# Avvia il server Next.js
npm run dev

# In un altro terminale, esponi con ngrok
ngrok http 3000

# Apri l'URL https fornito da ngrok sul tuo telefono
```

### 2. Vercel Deploy
```bash
# Deploy su Vercel (già in produzione)
vercel --prod

# Apri l'URL di produzione sul telefono
```

### 3. Local HTTPS (mkcert)
```bash
# Installa mkcert
brew install mkcert
mkcert -install

# Genera certificati
mkcert localhost

# Avvia Next.js con HTTPS
# Aggiungi a package.json:
# "dev:https": "next dev --experimental-https"
```

## Test Checklist

### ✅ Installazione
- [ ] Banner "Aggiungi a Home" appare
- [ ] Icona corretta nella home screen
- [ ] App si apre in modalità standalone (no barra browser)

### ✅ Fotocamera/Galleria
- [ ] Toccando "Aggiungi immagine" appare il picker
- [ ] "Fotocamera" apre la fotocamera
- [ ] "Galleria" apre la galleria
- [ ] L'immagine viene processata correttamente

### ✅ Condivisione
- [ ] Scatta screenshot di un evento
- [ ] Vai in Galleria
- [ ] Tocca Condividi
- [ ] "EventScanner" appare nelle opzioni
- [ ] L'app si apre e processa l'immagine

### ✅ Offline
- [ ] Disabilita WiFi/Dati
- [ ] Riapri l'app
- [ ] Naviga tra pagine già visitate
- [ ] Verifica che funzioni

### ✅ Performance
- [ ] Lighthouse PWA score > 90
- [ ] Installazione < 3 secondi
- [ ] First load < 2 secondi

## Debug

### Chrome DevTools (Remote Debugging Android)
```bash
# 1. Connetti telefono via USB
# 2. Abilita Developer Options + USB Debugging su Android
# 3. Apri Chrome e vai a: chrome://inspect
# 4. Seleziona il tuo dispositivo
# 5. Ispeziona l'app
```

### Safari DevTools (iOS)
```bash
# 1. iPhone: Impostazioni > Safari > Avanzate > Web Inspector (ON)
# 2. Mac: Safari > Preferenze > Avanzate > Mostra menu Sviluppo
# 3. Collega iPhone via cavo
# 4. Safari Mac > Sviluppo > [Tuo iPhone] > EventScanner
```

### Service Worker Debug
```javascript
// Console browser
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs);
  regs.forEach(reg => reg.unregister()); // Unregister all
});

// Check cache
caches.keys().then(keys => console.log('Cache keys:', keys));
caches.open('eventscanner-v1').then(cache => 
  cache.keys().then(keys => console.log('Cached URLs:', keys))
);
```

## Comandi Utili

```bash
# Build produzione
npm run build

# Test build locale
npm run start

# Lighthouse CI
npm install -g @lhci/cli
lhci autorun --collect.url=http://localhost:3000

# PWA Asset Generator (icone da immagine)
npx pwa-asset-generator logo.png public/icons
```

## Troubleshooting

### Service Worker non si aggiorna?
```javascript
// Force update
navigator.serviceWorker.getRegistration().then(reg => {
  reg.update();
  window.location.reload();
});
```

### Cache non si pulisce?
```javascript
// Clear all caches
caches.keys().then(keys => {
  keys.forEach(key => caches.delete(key));
});
```

### Manifest non riconosciuto?
- Verifica MIME type: `application/manifest+json`
- Controlla console per errori JSON
- Valida manifest: https://manifest-validator.appspot.com/

---

**Buon testing! 🚀**
