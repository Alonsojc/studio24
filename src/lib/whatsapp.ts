export function normalizeWhatsAppPhone(value?: string | null): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!/^[1-9]\d{9,14}$/.test(digits)) return '';
  return digits.length === 10 && !value?.trimStart().startsWith('+') ? `52${digits}` : digits;
}

export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
