import { privacyVersion, termsVersion } from './config.mjs';

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

export function registrationProfile(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const email = cleanText(input.email, 320).toLowerCase();
  return {
    firstName: cleanText(input.firstName, 100),
    lastName: cleanText(input.lastName, 100),
    displayName: cleanText(input.displayName || input.name, 200),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    companyName: cleanText(input.companyName, 160),
    category: cleanText(input.category, 160),
    locale: cleanText(input.locale, 35)
  };
}

export function registrationConsent(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (input.accepted !== true && input.termsAccepted !== true) return null;
  return {
    termsVersion: termsVersion(),
    privacyVersion: privacyVersion(),
    acceptedAt: new Date().toISOString()
  };
}

export function registrationCredentials(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const password = typeof input.password === 'string' ? input.password : '';
  return password.length >= 8 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password)
    ? { password }
    : {};
}
