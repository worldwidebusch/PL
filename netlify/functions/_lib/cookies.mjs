export function parseCookies(event) {
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const headerName = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie');
  const raw = headerName ? String(headers[headerName] || '') : '';
  return raw.split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return result;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || Object.prototype.hasOwnProperty.call(result, name)) return result;
    try { result[name] = decodeURIComponent(value); } catch (error) { result[name] = value; }
    return result;
  }, {});
}

export function serializeCookie(name, value, options = {}) {
  if (!/^[A-Za-z0-9_\-]+$/.test(name)) throw new Error('Invalid cookie name.');
  const parts = [name + '=' + encodeURIComponent(String(value || ''))];
  parts.push('Path=' + (options.path || '/'));
  if (Number.isFinite(options.maxAge)) parts.push('Max-Age=' + Math.max(0, Math.floor(options.maxAge)));
  if (options.expires instanceof Date) parts.push('Expires=' + options.expires.toUTCString());
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  parts.push('SameSite=' + (options.sameSite || 'Lax'));
  return parts.join('; ');
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0)
  });
}

