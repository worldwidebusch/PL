const COUNTRY_ALIASES = Object.freeze({
  '1': 'US',
  '+1': 'US',
  CA: 'US',
  CAN: 'US',
  US: 'US',
  USA: 'US',
  '31': 'NL',
  '+31': 'NL',
  NL: 'NL',
  NLD: 'NL',
  NETHERLANDS: 'NL',
  NEDERLAND: 'NL',
  '32': 'BE',
  '+32': 'BE',
  BE: 'BE',
  BEL: 'BE',
  BELGIUM: 'BE',
  BELGIE: 'BE'
});

function phoneError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  error.status = 400;
  return error;
}

function country(value) {
  const key = String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f.\s_-]/g, '');
  return COUNTRY_ALIASES[key] || '';
}

function e164(digits) {
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw phoneError('PHONE_INVALID', 'Enter a valid phone number including its country code.');
  }
  return '+' + digits;
}

function domesticNumber(digits, region) {
  if (region === 'NL') {
    if (digits.startsWith('31') && digits.length >= 10) return e164(digits);
    const national = digits.replace(/^0+/, '');
    if (national.length !== 9) throw phoneError('PHONE_INVALID', 'Enter a valid Dutch phone number.');
    return e164('31' + national);
  }
  if (region === 'BE') {
    if (digits.startsWith('32') && digits.length >= 10) return e164(digits);
    const national = digits.replace(/^0+/, '');
    if (national.length < 8 || national.length > 9) throw phoneError('PHONE_INVALID', 'Enter a valid Belgian phone number.');
    return e164('32' + national);
  }
  if (region === 'US') {
    if (digits.length === 11 && digits.startsWith('1')) return e164(digits);
    if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      throw phoneError('PHONE_INVALID', 'Enter a valid US phone number.');
    }
    return e164('1' + digits);
  }
  throw phoneError('PHONE_COUNTRY_REQUIRED', 'Choose a country or include the international country code.');
}

export function normalizePhoneE164(value, countryHint = '') {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 48 || !/^(?:\+|00)?[\d\s().-]+$/.test(raw)) {
    throw phoneError('PHONE_INVALID', 'Enter a valid phone number.');
  }
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return e164(digits);
  if (raw.startsWith('00')) return e164(digits.replace(/^00/, ''));

  const region = country(countryHint);
  if (region) return domesticNumber(digits, region);

  if (digits.length === 11 && digits.startsWith('1')) return e164(digits);
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return e164('1' + digits);
  throw phoneError('PHONE_COUNTRY_REQUIRED', 'Choose a country or include the international country code.');
}

export function maskPhone(value) {
  const phone = String(value || '');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '';
  const visibleStart = digits.slice(0, Math.min(3, digits.length - 4));
  return '+' + visibleStart + ' ' + '*'.repeat(Math.max(2, digits.length - visibleStart.length - 2)) + digits.slice(-2);
}
