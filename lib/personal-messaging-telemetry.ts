export function redactPersonalMessagingTelemetry<Value>(value: Value): Value {
  try {
    if (/messaging|teleproto|baileys|newsletter|phoneCode|qrCode|personal_messaging/i.test(JSON.stringify(value) || '')) return null as Value;
    const visit = (item: unknown): unknown => {
      if (!item || typeof item !== 'object') return item;
      if (Array.isArray(item)) return item.map(visit);
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, /^(password|phone|phoneCode|code|session|encryptedSession|qr|authorization|cookie)$/i.test(key) ? '[redacted]' : visit(child)]));
    };
    return visit(value) as Value;
  } catch { return null as Value; }
}