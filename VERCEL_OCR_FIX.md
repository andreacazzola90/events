# Vercel Deployment Guide - OCR Fixed

## 🚀 Deployment su Vercel

### Problema Risolto
**Errore**: `ReferenceError: FileReader is not defined`
- **Causa**: `FileReader` non disponibile in ambiente server-side di Vercel
- **Soluzione**: Implementazione dual-mode (client/server) + API route dedicata

### 🔧 Cambiamenti Implementati

#### 1. **OCR Dual-Mode**
```typescript
// File: /app/lib/ocr-simple.ts

// ✅ Ora funziona sia client che server
export async function extractTextFromImageSimple(imageFile: File) {
  if (typeof window === 'undefined') {
    // Server-side: usa API route
    return serverSideOCR(imageFile);
  } else {
    // Client-side: usa FileReader
    return clientSideOCR(imageFile);
  }
}
```

#### 2. **API Route Dedicata**
```typescript
// File: /app/api/ocr/route.ts
// ✅ Route server per OCR su Vercel
export async function POST(request: NextRequest) {
  // Gestisce OCR lato server senza FileReader
}
```

#### 3. **FileReader Safe**
```typescript
// ✅ Controlla disponibilità prima dell'uso
if (typeof window !== 'undefined' && window.FileReader) {
  // Usa FileReader solo se disponibile
}
```

### 📋 Deploy Checklist

#### **Pre-Deploy**
- [x] ✅ FileReader error risolto
- [x] ✅ API route `/api/ocr` creata
- [x] ✅ Dual-mode implementation
- [x] ✅ Build test passed

#### **Environment Variables**
```bash
# .env su Vercel
DATABASE_URL=postgres://...
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.vercel.app

# Analytics (opzionali)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...
NEXT_PUBLIC_GTM_ID=GTM-...
```

#### **Vercel Settings**
```json
// vercel.json
{
  "functions": {
    "app/api/ocr/route.ts": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    }
  ]
}
```

### 🧪 Testing su Vercel

#### **1. OCR Functionality**
```bash
# Test upload immagine
curl -X POST https://your-app.vercel.app/api/ocr \
  -F "image=@test-image.jpg"

# Expected response:
{
  "success": true,
  "text": "Extracted text content..."
}
```

#### **2. Event Creation Flow**
1. ✅ Carica immagine → OCR estrae testo
2. ✅ AI parsing → Estrae dati evento
3. ✅ Salva in database → Conferma creazione
4. ✅ Redirect → Visualizza evento creato

### 🔍 Monitoring & Debug

#### **Vercel Function Logs**
```javascript
// Aggiungi logging per debug
console.log('OCR Environment:', {
  hasWindow: typeof window !== 'undefined',
  hasFileReader: typeof FileReader !== 'undefined',
  userAgent: req.headers['user-agent']
});
```

#### **Error Handling**
```typescript
// Fallback chain per OCR
try {
  return await primaryOCR();
} catch (error) {
  try {
    return await fallbackOCR();
  } catch (fallbackError) {
    throw new UserFriendlyError();
  }
}
```

### 📊 Performance Optimizations

#### **1. Function Timeouts**
- OCR API route: 30s timeout
- Image processing: Ottimizzato per Vercel limits
- Error handling: Fast-fail per timeout

#### **2. Caching Strategy**
```typescript
// Cache OCR results per session
const ocrCache = new Map<string, string>();
```

#### **3. Image Optimization**
```typescript
// Ridimensiona immagini grandi prima OCR
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
if (file.size > MAX_SIZE) {
  file = await resizeImage(file);
}
```

### 🚨 Troubleshooting

#### **Common Issues**
1. **FileReader undefined**
   - ✅ RISOLTO: Dual-mode implementation

2. **OCR API timeout**
   - Soluzione: Retry logic + fallback

3. **Large image uploads**
   - Soluzione: Client-side resize

4. **Memory limits su Vercel**
   - Soluzione: Streaming + chunked processing

#### **Debug Commands**
```bash
# Check function logs
vercel logs https://your-app.vercel.app

# Test API routes
curl -v https://your-app.vercel.app/api/health

# Monitor performance
vercel inspect https://your-app.vercel.app
```

### ✅ Ready for Production

Il progetto è ora completamente compatibile con Vercel e risolve tutti i problemi di ambiente server-side. L'OCR funzionerà perfettamente sia in sviluppo locale che in produzione.

**Deploy Command:**
```bash
vercel --prod
```