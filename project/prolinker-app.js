(function (global) {
  'use strict';

  // v1.4.0: adds assignments.responses / updateResponseStatus and messages.ensure
  var VERSION = '1.4.0';
  var STORAGE_PREFIX = 'plk-app-data-v1:';
  var memoryStore = {};
  var applicationRequestCache = {};
  var sessionHydrationPromise = null;

  var DEFAULT_ENDPOINTS = {
    dashboard: '/api/v1/dashboard',
    network: '/api/v1/network',
    networkInvite: '/api/v1/network/invitations',
    networkAccept: '/api/v1/network/invitations/:id/accept',
    networkReject: '/api/v1/network/invitations/:id/reject',
    networkConnection: '/api/v1/network/connections/:id',
    profile: '/api/v1/profiles/:id',
    assignments: '/api/v1/assignments',
    assignment: '/api/v1/assignments/:id',
    assignmentResponses: '/api/v1/assignments/:id/responses',
    assignmentResponse: '/api/v1/assignments/:id/responses/:responseId',
    cvRedact: '/api/v1/cv/redactions',
    cvUpload: '/api/v1/cv/uploads',
    cvDocument: '/api/v1/cv/documents/me',
    messages: '/api/v1/messages',
    message: '/api/v1/messages/:id',
    messageSend: '/api/v1/messages/:id/replies',
    messageRead: '/api/v1/messages/:id/read',
    messageArchive: '/api/v1/messages/:id/archive',
    messageRestore: '/api/v1/messages/:id/restore',
    earnings: '/api/v1/earnings',
    transactions: '/api/v1/transactions',
    settings: '/api/v1/settings',
    opportunitiesList: '/api/v1/opportunities',
    opportunityGet: '/api/v1/opportunities/:id',
    opportunitySave: '/api/v1/opportunities/:id/saved',
    opportunityUnsave: '/api/v1/opportunities/:id/saved',
    opportunityHide: '/api/v1/opportunities/:id/hidden',
    applicationsCreate: '/api/v1/applications',
    applicationsList: '/api/v1/applications',
    freelancerSearch: '/api/v1/freelancers',
    projectCreate: '/api/v1/projects',
    projectInvite: '/api/v1/projects/:id/invitations',
    authSession: '/api/v1/auth/session',
    authLogout: '/api/v1/auth/logout',
    whatsappChallenge: '/api/v1/auth/whatsapp/challenges',
    whatsappVerify: '/api/v1/auth/whatsapp/verify',
    facebookStart: '/api/v1/auth/facebook/start',
    linkedinStart: '/api/v1/auth/linkedin/start',
    linkedinProfileImport: '/api/v1/profile/imports/linkedin',
    referralSummary: '/api/v1/referrals/summary',
    referralLink: '/api/v1/referrals/links',
    referralEvent: '/api/v1/referrals/events'
  };

  var DEFAULT_METHODS = {
    cvRedact: 'POST',
    cvUpload: 'POST',
    cvDocument: 'GET',
    opportunitiesList: 'GET',
    opportunityGet: 'GET',
    opportunitySave: 'PUT',
    opportunityUnsave: 'DELETE',
    opportunityHide: 'PUT',
    applicationsCreate: 'POST',
    applicationsList: 'GET',
    freelancerSearch: 'GET',
    projectCreate: 'POST',
    projectInvite: 'POST',
    authSession: 'GET',
    authLogout: 'POST',
    whatsappChallenge: 'POST',
    whatsappVerify: 'POST',
    facebookStart: 'GET',
    linkedinStart: 'GET',
    linkedinProfileImport: 'GET',
    referralSummary: 'GET',
    referralLink: 'POST',
    referralEvent: 'POST'
  };

  var MARKETPLACE_CONFIG_MAP = {
    opportunities: { list: 'opportunitiesList', get: 'opportunityGet', save: 'opportunitySave', unsave: 'opportunityUnsave', hide: 'opportunityHide' },
    applications: { create: 'applicationsCreate', list: 'applicationsList' },
    freelancers: { search: 'freelancerSearch' },
    projects: { create: 'projectCreate', invite: 'projectInvite' },
    referrals: { getSummary: 'referralSummary', createLink: 'referralLink', track: 'referralEvent' },
    auth: {
      session: 'authSession',
      logout: 'authLogout',
      whatsappChallenge: 'whatsappChallenge',
      whatsappVerify: 'whatsappVerify',
      facebookStart: 'facebookStart',
      linkedinStart: 'linkedinStart',
      linkedinProfileImport: 'linkedinProfileImport'
    }
  };

  var ROUTES = {
    dashboard: 'Prolinker Dashboard.dc.html',
    network: 'Prolinker Netwerk.dc.html',
    assignments: 'Prolinker Mijn opdrachten.dc.html',
    assignmentDetail: 'Prolinker Opdracht.dc.html',
    messages: 'Prolinker Berichten.dc.html',
    freelancerProfile: 'Prolinker Profiel.dc.html',
    clientProfile: 'Prolinker Profiel.dc.html',
    earnings: 'Prolinker Verdiensten.dc.html',
    settings: 'Prolinker Instellingen.dc.html',
    freelancerFeed: 'Prolinker Voor jou v2.dc.html',
    clientResults: 'Prolinker Results.dc.html',
    login: 'Prolinker Login.dc.html',
    home: 'Prolinker Homepage.dc.html'
  };

  var configured = normalizeConfig(global.PRO_LINKER_CONFIG || {});

  function ProLinkerError(message, options) {
    options = options || {};
    this.name = 'ProLinkerError';
    this.message = message || 'Er ging iets mis.';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.status = Number(options.status) || 0;
    this.details = options.details || null;
    this.retryable = options.retryable === true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ProLinkerError);
  }
  ProLinkerError.prototype = Object.create(Error.prototype);
  ProLinkerError.prototype.constructor = ProLinkerError;

  function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
  }

  function flattenResourceConfig(input, defaults, normalizeValue) {
    input = isPlainObject(input) ? input : {};
    var result = Object.assign({}, defaults);
    Object.keys(defaults).forEach(function (key) {
      var value = normalizeValue(input[key]);
      if (value) result[key] = value;
    });
    Object.keys(MARKETPLACE_CONFIG_MAP).forEach(function (resource) {
      var nested = isPlainObject(input[resource]) ? input[resource] : {};
      Object.keys(MARKETPLACE_CONFIG_MAP[resource]).forEach(function (operation) {
        var target = MARKETPLACE_CONFIG_MAP[resource][operation];
        var value = normalizeValue(nested[operation]);
        if (value) result[target] = value;
      });
    });
    return result;
  }

  function normalizeEndpoint(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function normalizeMethod(value) {
    var method = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) >= 0 ? method : '';
  }

  function normalizeConfig(input) {
    input = isPlainObject(input) ? input : {};
    var endpoints = flattenResourceConfig(input.endpoints, DEFAULT_ENDPOINTS, normalizeEndpoint);
    var methods = flattenResourceConfig(input.methods, DEFAULT_METHODS, normalizeMethod);
    return {
      baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim()
        ? input.baseUrl.trim().replace(/\/+$/, '')
        : defaultProductionBaseUrl(),
      endpoints: endpoints,
      methods: methods,
      timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs) || 12000)),
      credentials: ['include', 'same-origin', 'omit'].indexOf(input.credentials) >= 0 ? input.credentials : 'include',
      headers: isPlainObject(input.headers) ? Object.assign({}, input.headers) : {},
      getAccessToken: typeof input.getAccessToken === 'function' ? input.getAccessToken : null,
      fetch: typeof input.fetch === 'function' ? input.fetch : null,
      demoAuth: input.demoAuth === true && isPreviewRuntime()
    };
  }

  function configure(next) {
    var current = configured;
    next = isPlainObject(next) ? next : {};
    configured = normalizeConfig(Object.assign({}, current, next, {
      endpoints: Object.assign({}, current.endpoints, isPlainObject(next.endpoints) ? next.endpoints : {}),
      methods: Object.assign({}, current.methods, isPlainObject(next.methods) ? next.methods : {})
    }));
    return getConfig();
  }

  function getConfig() {
    return {
      baseUrl: configured.baseUrl,
      endpoints: Object.assign({}, configured.endpoints),
      methods: Object.assign({}, configured.methods),
      timeoutMs: configured.timeoutMs,
      credentials: configured.credentials,
      headers: Object.assign({}, configured.headers),
      demoAuth: configured.demoAuth === true,
      mode: configured.baseUrl ? 'api' : 'local'
    };
  }

  function defaultProductionBaseUrl() {
    try {
      if (!global.location || !/^https?:$/.test(global.location.protocol)) return '';
      var host = String(global.location.hostname || '').toLowerCase();
      if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return '';
      if (/(?:^|\.)prolinker\.com$/.test(host) || /\.netlify\.app$/.test(host)) return global.location.origin;
      return '';
    } catch (error) { return ''; }
  }

  function isPreviewRuntime() {
    try {
      if (!global.location || global.location.protocol === 'file:') return true;
      var host = String(global.location.hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    } catch (error) { return false; }
  }

  function normalizeWhatsapp(value) {
    var raw = String(value || '').trim();
    if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return '';
    var digits = raw.replace(/\D/g, '');
    if (raw.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.length < 8 || digits.length > 15) return '';
    return '+' + digits;
  }

  function normalizeSession(input) {
    input = normalizePayload(input);
    if (isPlainObject(input) && isPlainObject(input.session)) input = input.session;
    if (!isPlainObject(input)) return null;
    var user = isPlainObject(input.user) ? input.user : {};
    var auth = isPlainObject(input.auth) ? input.auth : {};
    var importFields = isPlainObject(input.profileImport) && isPlainObject(input.profileImport.fields) ? input.profileImport.fields : {};
    var profile = Object.assign({}, importFields, isPlainObject(user.profile) ? user.profile : {}, isPlainObject(input.profile) ? input.profile : {});
    var provider = String(auth.provider || input.authProvider || input.channel || '').trim().toLowerCase();
    var role = String(user.role || input.role || input.accountType || '').trim().toLowerCase();
    var firstName = String(user.firstName || profile.firstName || input.firstName || '').trim();
    var lastName = String(user.lastName || profile.lastName || input.lastName || '').trim();
    var name = String(user.displayName || user.name || input.name || profile.name || (firstName + ' ' + lastName)).trim();
    var contact = normalizeWhatsapp(auth.phone || user.phone || input.contact || input.phone);
    var phoneVerified = auth.phoneVerified === true || input.phoneVerified === true;
    var providerSubject = String(auth.providerSubject || auth.subject || input.providerSubject || '').trim();
    var id = String(user.id || input.userId || input.accountId || input.id || '').trim();
    var email = String(user.email || profile.email || input.email || '').trim();
    var pictureUrl = safeHref(user.avatarUrl || user.pictureUrl || profile.pictureUrl || profile.avatarUrl || input.avatarUrl || '', '');
    var expiresAtMs = Number(input.expiresAtMs);
    if (!Number.isFinite(expiresAtMs) && input.expiresAt) expiresAtMs = Date.parse(String(input.expiresAt));
    if (!Number.isFinite(expiresAtMs) && Number.isFinite(Number(input.exp))) expiresAtMs = Number(input.exp) * 1000;
    var expiresAt = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : '';
    profile = Object.assign({}, profile, {
      firstName: firstName || profile.firstName || '',
      lastName: lastName || profile.lastName || '',
      name: name || profile.name || '',
      email: email || profile.email || '',
      pictureUrl: pictureUrl || profile.pictureUrl || '',
      source: String(profile.source || (provider === 'linkedin' ? 'linkedin' : '')).trim()
    });
    return Object.assign({}, input, {
      authenticated: input.authenticated === true,
      id: id,
      userId: id,
      role: role,
      accountType: role,
      channel: provider || input.channel || '',
      authProvider: provider || input.authProvider || '',
      providerSubject: providerSubject,
      phoneVerified: phoneVerified,
      contact: contact,
      name: name,
      email: email,
      avatarUrl: pictureUrl,
      expiresAt: expiresAt,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : 0,
      profile: profile
    });
  }

  function isValidSession(input, requiredRole) {
    var session = normalizeSession(input);
    if (!session || session.authenticated !== true) return false;
    if (session.role !== 'client' && session.role !== 'freelancer') return false;
    if (requiredRole && session.role !== requiredRole) return false;
    if (session.expiresAtMs && session.expiresAtMs <= Date.now()) return false;
    if (configured.baseUrl && !session.expiresAtMs) return false;
    if (session.channel === 'whatsapp') return session.phoneVerified === true || !!normalizeWhatsapp(session.contact);
    if (session.channel === 'linkedin' || session.channel === 'facebook') {
      return !!(session.providerSubject || session.id || session.email);
    }
    return !!(session.id || session.contact);
  }

  function cacheSession(input) {
    var session = normalizeSession(input);
    if (!isValidSession(session)) return null;
    try {
      global.localStorage.setItem('plk-auth-session', JSON.stringify(session));
      global.localStorage.setItem('plk-user-role', session.role);
      if (session.name) global.localStorage.setItem('plk-user-name', session.name);
    } catch (error) {}
    return session;
  }

  function clearCachedSession() {
    try {
      global.localStorage.removeItem('plk-auth-session');
      global.localStorage.removeItem('plk-user-name');
      global.localStorage.removeItem('plk-user-role');
    } catch (error) {}
  }

  function getSession() {
    try {
      var session = normalizeSession(JSON.parse(global.localStorage.getItem('plk-auth-session') || 'null'));
      return isValidSession(session) ? session : null;
    } catch (error) {
      return null;
    }
  }

  function safeNext(value) {
    var next = String(value || '').trim();
    if (!next || /^(?:[a-z]+:)?\/\//i.test(next) || next.indexOf('..') >= 0) return ROUTES.dashboard;
    return /^[A-Za-z0-9% _.-]+\.dc\.html(?:[?#].*)?$/.test(next) ? next : ROUTES.dashboard;
  }

  function safeHref(value, fallback) {
    var href = String(value || '').trim();
    if (!href) return fallback || '';
    if (/^(?:javascript|data|vbscript):/i.test(href) || /^\/\//.test(href)) return fallback || '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return fallback || '';
    return href;
  }

  function requireSession(options) {
    options = options || {};
    var session = getSession();
    if (session && (!options.role || session.role === options.role)) {
      if (configured.baseUrl && !sessionHydrationPromise) {
        sessionHydrationPromise = hydrateSession().catch(function (error) {
          if (error && error.status === 401 && options.redirect !== false && global.location) {
            var revalidateRole = options.role === 'client' || options.role === 'freelancer' ? options.role : session.role;
            var revalidateNext = safeNext(options.next || (global.location.pathname.split('/').pop() + global.location.search));
            global.location.href = ROUTES.login + '?mode=login&role=' + encodeURIComponent(revalidateRole) + '&next=' + encodeURIComponent(revalidateNext);
          }
          return null;
        }).finally(function () { sessionHydrationPromise = null; });
      }
      return session;
    }
    if (options.redirect !== false && global.location) {
      var role = options.role === 'client' || options.role === 'freelancer' ? options.role : 'client';
      var next = safeNext(options.next || (global.location.pathname.split('/').pop() + global.location.search));
      global.location.href = ROUTES.login + '?mode=login&role=' + encodeURIComponent(role) + '&next=' + encodeURIComponent(next);
    }
    return null;
  }

  function logout(options) {
    options = options || {};
    clearCachedSession();
    try {
      var fetchFn = configured.fetch || global.fetch;
      if (typeof fetchFn === 'function' && global.location && /^https?:$/.test(global.location.protocol)) {
        fetchFn(endpointUrl('authLogout'), {
          method: 'POST',
          credentials: configured.credentials,
          headers: Object.assign({ Accept: 'application/json' }, configured.headers),
          keepalive: true
        }).catch(function () {});
      }
    } catch (error) {}
    if (options.redirect !== false && global.location) global.location.href = ROUTES.login + '?mode=login';
  }

  function hashString(value) {
    var input = String(value || 'prolinker');
    var hash = 2166136261;
    for (var i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function accountId(session) {
    session = normalizeSession(session) || {};
    var canonical = String(session.id || session.userId || session.providerSubject || session.email || normalizeWhatsapp(session.contact) || 'guest');
    return session.id ? session.id : 'acct-' + hashString((session.channel || 'account') + '|' + canonical);
  }

  function displayName(session) {
    var stored = '';
    try { stored = global.localStorage.getItem('plk-user-name') || ''; } catch (error) {}
    var profile = session && isPlainObject(session.profile) ? session.profile : {};
    return String((session && session.name) || profile.name || stored || (session && session.role === 'freelancer' ? 'ProLinker professional' : 'ProLinker opdrachtgever')).trim();
  }

  function shortDisplayName(value) {
    var name = String(value || '').trim();
    if (!name || name.indexOf('ProLinker') === 0) return name;
    var parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name;
    var last = parts[parts.length - 1];
    if (/^[A-Z]\.$/.test(last)) return name;
    return parts[0] + ' ' + last.charAt(0).toUpperCase() + '.';
  }

  function initials(name) {
    var parts = String(name || 'PL').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'P').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : 'L')).toUpperCase();
  }

  function isoAt(offsetDays, hour, minute) {
    var day = 11 + Number(offsetDays || 0);
    var safeDay = String(Math.max(1, Math.min(28, day))).padStart(2, '0');
    return '2026-07-' + safeDay + 'T' + String(hour || 9).padStart(2, '0') + ':' + String(minute || 0).padStart(2, '0') + ':00.000Z';
  }

  function profileLinkFor(member, role) {
    if (role === 'client') return ROUTES.clientResults + '?profile=' + encodeURIComponent(member.id);
    return ROUTES.freelancerProfile + '?networkProfile=' + encodeURIComponent(member.id);
  }

  function seedTransactions(role) {
    var bonuses = [
      { id: 'txn-bonus-paul', at: '2026-04-02T10:15:00.000Z', title: 'Aanmeld bonus voor gebruiker Paul van Braam', type: 'transfer_in', status: 'processed', amount: 5, total: 5, direction: 'in' },
      { id: 'txn-bonus-sjoerd', at: '2026-04-01T09:30:00.000Z', title: 'Aanmeld bonus voor gebruiker Sjoerd Koelewijn', type: 'transfer_in', status: 'processed', amount: 5, total: 5, direction: 'in' },
      { id: 'txn-bonus-signup', at: '2026-03-10T08:00:00.000Z', title: 'Aanmeld bonus', infoLabel: 'meer informatie', infoHref: '#referral', type: 'transfer_in', status: 'processed', amount: 500, total: 500, direction: 'in' }
    ];
    if (role === 'client') {
      return [
        { id: 'txn-dep-250', at: '2026-05-30T11:20:00.000Z', title: 'Storting van 250', subtitle: 'Borg', type: 'deposit', status: 'pending', amount: 250, fee: 0, vatRate: 21, vat: 0, total: 250, direction: 'in', payable: true },
        { id: 'txn-dep-200', at: '2026-05-28T14:05:00.000Z', title: 'Storting van 200', subtitle: 'Borg', type: 'deposit', status: 'pending', amount: 200, fee: 0, vatRate: 21, vat: 0, total: 200, direction: 'in', payable: true }
      ].concat(bonuses);
    }
    return [
      { id: 'txn-payout-1', at: '2026-05-20T09:45:00.000Z', title: 'Uitbetaling naar je bankrekening', subtitle: 'NL91 ABNA •• 8412', type: 'payout', status: 'processed', amount: 1250, total: 1250, direction: 'out' }
    ].concat(bonuses);
  }

  function normalizeTransaction(item, index) {
    item = isPlainObject(item) ? item : {};
    var status = String(item.status || 'processed').toLowerCase();
    var type = String(item.type || item.transactionType || 'transfer_in').toLowerCase();
    return {
      id: String(item.id || 'txn-' + (index + 1)),
      at: item.at || item.date || item.createdAt || '',
      title: String(item.title || item.description || 'Transactie'),
      subtitle: String(item.subtitle || item.note || ''),
      infoLabel: String(item.infoLabel || ''),
      infoHref: safeHref(item.infoHref, ''),
      type: type,
      status: ['pending', 'processed', 'failed'].indexOf(status) >= 0 ? status : 'processed',
      amount: Math.max(0, finiteNumber(item.amount, 0)),
      fee: Math.max(0, finiteNumber(item.fee, 0)),
      vatRate: Math.max(0, finiteNumber(item.vatRate, 21)),
      vat: Math.max(0, finiteNumber(item.vat, 0)),
      total: Math.max(0, finiteNumber(item.total, finiteNumber(item.amount, 0))),
      direction: String(item.direction || 'in').toLowerCase() === 'out' ? 'out' : 'in',
      payable: item.payable === true && status === 'pending'
    };
  }

  async function listTransactions(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) {
      var remote = normalizePayload(await request('transactions', { signal: options.signal }));
      remote = isPlainObject(remote) ? remote : {};
      var remoteItems = (Array.isArray(remote) ? remote : (Array.isArray(remote.items) ? remote.items : (Array.isArray(remote.transactions) ? remote.transactions : []))).map(normalizeTransaction);
      var balance = isPlainObject(remote.balance) ? remote.balance : {};
      return {
        balance: { currency: String(balance.currency || 'EUR'), available: Math.max(0, finiteNumber(balance.available, 0)), bonus: Math.max(0, finiteNumber(balance.bonus, 0)), usdRate: Math.max(0.1, finiteNumber(balance.usdRate, 1.1418)) },
        items: remoteItems
      };
    }
    var repository = readRepository(session);
    if (!isPlainObject(repository.earnings)) repository.earnings = { currency: 'EUR', available: 0, pending: 0, referralRate: 0.02 };
    if (!Array.isArray(repository.earnings.transactions)) {
      repository.earnings.transactions = seedTransactions(session.role);
      writeRepository(session, repository);
    }
    var items = repository.earnings.transactions.map(normalizeTransaction);
    var bonus = items.filter(function (item) { return item.type === 'transfer_in' && item.status === 'processed'; }).reduce(function (sum, item) { return sum + item.total; }, 0);
    return {
      balance: { currency: 'EUR', available: Math.max(0, finiteNumber(repository.earnings.available, 0)), bonus: bonus, usdRate: 1.1418 },
      items: items
    };
  }

  function seedRepository(session) {
    var role = session.role;
    var name = displayName(session);
    var id = accountId(session);
    var members = [
      { id: 'pro-amelie', name: 'Amelie de Jong', headline: 'UX designer en researcher', location: 'Utrecht', availability: 'Beschikbaar', mutual: 12, skills: ['UX research', 'Figma'], color: '#E9EFF5', avatarUrl: 'https://randomuser.me/api/portraits/women/65.jpg' },
      { id: 'pro-youssef', name: 'Youssef El Amrani', headline: 'Full-stack developer', location: 'Rotterdam', availability: 'Vanaf augustus', mutual: 8, skills: ['React', 'Node.js'], color: '#E8F5EF', avatarUrl: 'https://randomuser.me/api/portraits/men/51.jpg' },
      { id: 'pro-noor', name: 'Noor van Dijk', headline: 'Interim finance consultant', location: 'Amsterdam', availability: 'Beschikbaar', mutual: 6, skills: ['Finance', 'Power BI'], color: '#F5EFFB', avatarUrl: 'https://randomuser.me/api/portraits/women/33.jpg' },
      { id: 'pro-bram', name: 'Bram Vermeer', headline: 'B2B growth marketeer', location: 'Antwerpen', availability: '16 u per week', mutual: 4, skills: ['Demand gen', 'HubSpot'], color: '#FFE0D6', avatarUrl: 'https://randomuser.me/api/portraits/men/64.jpg' },
      { id: 'pro-sofia', name: 'Sofia Peeters', headline: 'Operations specialist', location: 'Remote', availability: 'Beschikbaar', mutual: 10, skills: ['Automation', 'Notion'], color: '#EAF5F6', avatarUrl: 'https://randomuser.me/api/portraits/women/79.jpg' },
      { id: 'pro-lars', name: 'Lars Smit', headline: 'Data engineer', location: 'Eindhoven', availability: 'Vanaf september', mutual: 3, skills: ['Python', 'Snowflake'], color: '#F3F0E8', avatarUrl: 'https://randomuser.me/api/portraits/men/58.jpg' }
    ].map(function (item) {
      return Object.assign({}, item, { initials: initials(item.name), status: 'connected', profileHref: profileLinkFor(item, role) });
    });
    var invitations = [
      { id: 'invite-inaya', direction: 'incoming', name: 'Inaya Meijer', headline: 'Product owner', location: 'Den Haag', mutual: 5, initials: 'IM', status: 'pending', createdAt: isoAt(-1, 10, 15), color: '#FCEDEE' },
      { id: 'invite-oliver', direction: 'incoming', name: 'Oliver Claes', headline: 'Cybersecurity consultant', location: 'Gent', mutual: 2, initials: 'OC', status: 'pending', createdAt: isoAt(-2, 14, 40), color: '#EDF2FA' }
    ];
    var activities = role === 'client' ? [
      { id: 'act-client-1', type: 'response', title: 'Nieuwe reactie op Senior React Developer', detail: 'Youssef reageerde met 96% match.', status: 'nieuw', at: isoAt(0, 14, 20), href: ROUTES.assignments },
      { id: 'act-client-2', type: 'message', title: 'Bericht van Amelie J.', detail: 'Amelie heeft twee momenten voor een kennismaking voorgesteld.', status: 'open', at: isoAt(0, 11, 5), href: ROUTES.messages },
      { id: 'act-client-3', type: 'assignment', title: 'Opdracht staat live', detail: 'Marketing automation specialist is gepubliceerd.', status: 'actief', at: isoAt(-1, 16, 30), href: ROUTES.assignments },
      { id: 'act-client-4', type: 'network', title: 'Nieuwe netwerkconnectie', detail: 'Sofia P. heeft je uitnodiging geaccepteerd.', status: 'verbonden', at: isoAt(-2, 9, 10), href: ROUTES.network }
    ] : [
      { id: 'act-pro-1', type: 'match', title: 'Nieuwe match van 98%', detail: 'AI Automation Consultant, remote, 24-32 uur.', status: 'nieuw', at: isoAt(0, 15, 10), href: ROUTES.freelancerFeed },
      { id: 'act-pro-2', type: 'message', title: 'Bericht van FinBase', detail: 'De opdrachtgever wil een kennismaking inplannen.', status: 'open', at: isoAt(0, 12, 25), href: ROUTES.messages },
      { id: 'act-pro-3', type: 'application', title: 'Sollicitatie bekeken', detail: 'Je reactie op Senior React Developer is geopend.', status: 'bekeken', at: isoAt(-1, 17, 10), href: ROUTES.assignments },
      { id: 'act-pro-4', type: 'network', title: 'Nieuwe netwerkconnectie', detail: 'Bram V. heeft je uitnodiging geaccepteerd.', status: 'verbonden', at: isoAt(-2, 10, 35), href: ROUTES.network }
    ];

    return {
      version: 1,
      account: Object.assign({ id: id, role: role, name: name, initials: initials(name), contact: normalizeWhatsapp(session.contact) }, isPlainObject(session.profile) ? {
        firstName: session.profile.firstName || '',
        lastName: session.profile.lastName || '',
        email: session.profile.email || session.email || '',
        avatarUrl: session.profile.pictureUrl || session.avatarUrl || '',
        pictureUrl: session.profile.pictureUrl || session.avatarUrl || '',
        profileSource: session.profile.source || ''
      } : {}),
      dashboard: {
        client: {
          metrics: [
            { id: 'posted', label: 'Opdrachten geplaatst', value: '12', helper: '3 open', tone: 'blue' },
            { id: 'responses', label: 'Nieuwe reacties', value: '18', helper: '7 vandaag', tone: 'orange' },
            { id: 'hired', label: 'Ingehuurd', value: '4', helper: '2 actief', tone: 'green' },
            { id: 'spend', label: 'Totale opdrachtwaarde', value: '\u20ac 38.450', helper: 'via ProLinker', tone: 'navy' }
          ]
        },
        freelancer: {
          metrics: [
            { id: 'matches', label: 'Nieuwe matches', value: '37', helper: '9 boven 90%', tone: 'blue' },
            { id: 'applications', label: 'Sollicitaties', value: '14', helper: '5 bekeken', tone: 'orange' },
            { id: 'active', label: 'Actieve opdrachten', value: '2', helper: '48 uur deze maand', tone: 'green' },
            { id: 'earnings', label: 'Verdiend in 2026', value: '\u20ac 24.680', helper: '\u20ac 3.200 onderweg', tone: 'navy' }
          ]
        },
        activities: activities,
        updatedAt: isoAt(0, 15, 30)
      },
      network: { members: members, invitations: invitations, outbound: [], updatedAt: isoAt(0, 15, 30) },
      profiles: members.reduce(function (result, item) { result[item.id] = Object.assign({}, item); return result; }, {}),
      assignments: role === 'client' ? [
        { id: 'job-react', title: 'Senior React Developer', status: 'open', responses: 8, match: 98, href: ROUTES.assignments + '?assignment=job-react' },
        { id: 'job-automation', title: 'Marketing automation specialist', status: 'open', responses: 5, match: 94, href: ROUTES.assignments + '?assignment=job-automation' }
      ] : [
        { id: 'app-react', title: 'Senior React Developer', company: 'FinBase', status: 'interview', match: 98, href: ROUTES.assignments + '?assignment=app-react' },
        { id: 'app-ai', title: 'AI Automation Consultant', company: 'Northstar', status: 'sent', match: 95, href: ROUTES.assignments + '?assignment=app-ai' }
      ],
      applications: [],
      opportunityPreferences: { saved: {}, hidden: {} },
      messages: [
        { id: 'msg-1', sender: role === 'client' ? 'Amelie de Jong' : 'Mark Hendriks', avatarUrl: role === 'client' ? 'https://randomuser.me/api/portraits/women/65.jpg' : 'https://randomuser.me/api/portraits/men/49.jpg', assignmentId: role === 'client' ? 'job-react' : 'app-react', assignmentTitle: 'Senior React Developer', subject: 'Kennismaking', preview: 'Zullen we morgen kort bellen?', unread: true, archived: false, at: isoAt(0, 12, 25), href: ROUTES.messages + '?conversation=msg-1', messages: [
          { id: 'msg-1-1', sender: role === 'client' ? 'Amelie de Jong' : 'Mark Hendriks', direction: 'incoming', text: 'Bedankt voor je reactie. Zullen we morgen kort bellen?', at: isoAt(0, 12, 25), read: false, channel: 'whatsapp' }
        ] },
        { id: 'msg-2', sender: role === 'client' ? 'Youssef El Amrani' : 'ProLinker support', avatarUrl: role === 'client' ? 'https://randomuser.me/api/portraits/men/51.jpg' : '', assignmentId: role === 'client' ? 'job-automation' : '', assignmentTitle: role === 'client' ? 'Marketing automation specialist' : '', subject: 'Profiel en planning', preview: 'Bedankt voor de aanvullende informatie.', unread: false, archived: false, at: isoAt(-1, 16, 0), href: ROUTES.messages + '?conversation=msg-2', messages: [
          { id: 'msg-2-1', sender: role === 'client' ? 'Youssef El Amrani' : 'ProLinker support', direction: 'incoming', text: 'Bedankt voor de aanvullende informatie.', at: isoAt(-1, 16, 0), read: true, channel: 'platform' }
        ] }
      ],
      earnings: { currency: 'EUR', available: role === 'freelancer' ? 1860 : 0, pending: role === 'freelancer' ? 3200 : 74, referralRate: 0.02 },
      settings: {
        language: 'nl',
        notifications: { whatsapp: true, matches: true, messages: true, applicationUpdates: true, referralUpdates: true },
        privacy: { searchable: true, contactable: true, location: '', remotePreference: 'remote' }
      }
    };
  }

  function storageKey(session) {
    session = normalizeSession(session) || {};
    return STORAGE_PREFIX + hashString(accountId(session) + '|' + session.role);
  }

  function readRepository(session) {
    var key = storageKey(session);
    var stored = null;
    try { stored = global.localStorage.getItem(key); } catch (error) { stored = memoryStore[key] || null; }
    var data = null;
    if (stored) {
      try { data = JSON.parse(stored); } catch (error) { data = null; }
    }
    if (!data || data.version !== 1 || !data.dashboard || !data.network) data = seedRepository(session);
    if (data.network && Array.isArray(data.network.members) && data.network.members.length && !data.network.members[0].avatarUrl) {
      var seededData = seedRepository(session);
      var seededAvatars = {};
      seededData.network.members.forEach(function (member) { seededAvatars[member.id] = member.avatarUrl; });
      data.network.members.forEach(function (member) { if (!member.avatarUrl && seededAvatars[member.id]) member.avatarUrl = seededAvatars[member.id]; });
      if (data.profiles) Object.keys(seededAvatars).forEach(function (key) { if (data.profiles[key] && !data.profiles[key].avatarUrl) data.profiles[key].avatarUrl = seededAvatars[key]; });
    }
    if (Array.isArray(data.messages) && data.messages.length) {
      seedRepository(session).messages.forEach(function (thread) {
        var existing = data.messages.find(function (candidate) { return candidate.id === thread.id; });
        if (!existing) return;
        if (!existing.avatarUrl && thread.avatarUrl) existing.avatarUrl = thread.avatarUrl;
        if (thread.sender && existing.sender !== thread.sender) {
          existing.sender = thread.sender;
          if (Array.isArray(existing.messages)) existing.messages.forEach(function (entry) { if (entry.direction !== 'outgoing') entry.sender = thread.sender; });
        }
      });
    }
    if (!Array.isArray(data.applications)) data.applications = [];
    if (!isPlainObject(data.opportunityPreferences)) data.opportunityPreferences = { saved: {}, hidden: {} };
    if (!isPlainObject(data.opportunityPreferences.saved)) data.opportunityPreferences.saved = {};
    if (!isPlainObject(data.opportunityPreferences.hidden)) data.opportunityPreferences.hidden = {};
    data.account = Object.assign({}, data.account || {}, isPlainObject(session.profile) ? {
      firstName: session.profile.firstName || '',
      lastName: session.profile.lastName || '',
      email: session.profile.email || session.email || '',
      avatarUrl: session.profile.pictureUrl || session.avatarUrl || '',
      pictureUrl: session.profile.pictureUrl || session.avatarUrl || '',
      profileSource: session.profile.source || ''
    } : {}, {
      id: accountId(session), role: session.role, name: displayName(session), initials: initials(displayName(session)), contact: normalizeWhatsapp(session.contact)
    });
    writeRepository(session, data);
    return data;
  }

  function writeRepository(session, data) {
    var key = storageKey(session);
    var serialized = JSON.stringify(data);
    try { global.localStorage.setItem(key, serialized); } catch (error) { memoryStore[key] = serialized; }
    return data;
  }

  function endpointUrl(key, params) {
    params = params || {};
    var path = configured.endpoints[key] || DEFAULT_ENDPOINTS[key];
    path = path.replace(/:([A-Za-z0-9_]+)/g, function (_, name) {
      if (params[name] === undefined || params[name] === null) throw new ProLinkerError('Ontbrekende endpointparameter: ' + name, { code: 'INVALID_ARGUMENT' });
      return encodeURIComponent(String(params[name]));
    });
    if (/^https?:\/\//i.test(path)) return path;
    return configured.baseUrl + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function appendQuery(url, query) {
    if (!query || !isPlainObject(query)) return url;
    var pairs = [];
    Object.keys(query).forEach(function (key) {
      var value = query[key];
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach(function (item) { pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(item))); });
      else pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    return url + (pairs.length ? (url.indexOf('?') >= 0 ? '&' : '?') + pairs.join('&') : '');
  }

  function normalizePayload(payload) {
    if (payload && isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
    if (payload && isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
    return payload;
  }

  function responseErrorMessage(payload, fallback) {
    if (!payload || typeof payload !== 'object') return fallback;
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
    if (payload.error && typeof payload.error.message === 'string' && payload.error.message.trim()) return payload.error.message.trim();
    return fallback;
  }

  async function request(key, options) {
    options = options || {};
    if (!configured.baseUrl) throw new ProLinkerError('De lokale repository gebruikt geen netwerkrequest.', { code: 'LOCAL_MODE' });
    var fetchFn = configured.fetch || global.fetch;
    if (typeof fetchFn !== 'function') throw new ProLinkerError('Fetch is niet beschikbaar.', { code: 'FETCH_UNAVAILABLE' });
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var timeout = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, configured.timeoutMs);
    var externalSignal = options.signal;
    var onAbort = function () { if (controller) controller.abort(); };
    if (externalSignal && externalSignal.addEventListener) externalSignal.addEventListener('abort', onAbort, { once: true });
    if (externalSignal && externalSignal.aborted) onAbort();
    try {
      var headers = Object.assign({ Accept: 'application/json' }, configured.headers, isPlainObject(options.headers) ? options.headers : {});
      var token = configured.getAccessToken ? await configured.getAccessToken() : '';
      if (token) headers.Authorization = 'Bearer ' + String(token);
      var body = options.body;
      var isFormData = typeof global.FormData === 'function' && body instanceof global.FormData;
      if (body !== undefined && body !== null && !isFormData) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        if (headers['Content-Type'].indexOf('application/json') >= 0 && typeof body !== 'string') body = JSON.stringify(body);
      }
      var response = await fetchFn(appendQuery(endpointUrl(key, options.params), options.query), {
        method: normalizeMethod(options.method) || configured.methods[key] || 'GET',
        credentials: configured.credentials,
        headers: headers,
        body: body,
        signal: controller ? controller.signal : externalSignal
      });
      var text = await response.text();
      var payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch (error) { payload = { message: text }; }
      }
      if (!response.ok) {
        var message = responseErrorMessage(payload, 'Request mislukt met status ' + response.status + '.');
        throw new ProLinkerError(message, { code: 'HTTP_ERROR', status: response.status, details: payload, retryable: response.status >= 500 || response.status === 429 });
      }
      return normalizePayload(payload);
    } catch (error) {
      if (error instanceof ProLinkerError) throw error;
      if (timedOut) throw new ProLinkerError('De server reageerde niet op tijd.', { code: 'TIMEOUT', retryable: true });
      if (externalSignal && externalSignal.aborted) throw new ProLinkerError('De request is geannuleerd.', { code: 'ABORTED' });
      throw new ProLinkerError(error && error.message ? error.message : 'Netwerkfout.', { code: 'NETWORK_ERROR', retryable: true });
    } finally {
      clearTimeout(timeout);
      if (externalSignal && externalSignal.removeEventListener) externalSignal.removeEventListener('abort', onAbort);
    }
  }

  function hasHttpOrigin() {
    return !!(global.location && /^https?:$/.test(global.location.protocol));
  }

  async function platformRequest(key, options) {
    options = options || {};
    if (configured.baseUrl) return request(key, options);
    if (!hasHttpOrigin()) throw new ProLinkerError('Deze functie is beschikbaar via de beveiligde webomgeving.', { code: 'SERVER_REQUIRED' });
    var fetchFn = configured.fetch || global.fetch;
    if (typeof fetchFn !== 'function') throw new ProLinkerError('Fetch is niet beschikbaar.', { code: 'FETCH_UNAVAILABLE' });
    var headers = Object.assign({ Accept: 'application/json' }, configured.headers, isPlainObject(options.headers) ? options.headers : {});
    var body = options.body;
    if (body !== undefined && body !== null && !(typeof global.FormData === 'function' && body instanceof global.FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      if (headers['Content-Type'].indexOf('application/json') >= 0 && typeof body !== 'string') body = JSON.stringify(body);
    }
    var response;
    try {
      response = await fetchFn(appendQuery(endpointUrl(key, options.params), options.query), {
        method: normalizeMethod(options.method) || configured.methods[key] || 'GET',
        credentials: configured.credentials,
        headers: headers,
        body: body,
        signal: options.signal
      });
    } catch (error) {
      throw new ProLinkerError(error && error.message ? error.message : 'Netwerkfout.', { code: 'NETWORK_ERROR', retryable: true });
    }
    var text = await response.text();
    var payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (error) { payload = { message: text }; }
    }
    if (!response.ok) {
      var message = responseErrorMessage(payload, 'Request mislukt met status ' + response.status + '.');
      throw new ProLinkerError(message, { code: response.status === 401 ? 'AUTH_REQUIRED' : 'HTTP_ERROR', status: response.status, details: payload, retryable: response.status >= 500 || response.status === 429 });
    }
    return normalizePayload(payload);
  }

  async function hydrateSession(options) {
    options = options || {};
    try {
      var payload = await platformRequest('authSession', { signal: options.signal });
      var session = cacheSession(payload);
      if (!session) throw new ProLinkerError('De ontvangen sessie is ongeldig.', { code: 'INVALID_SESSION' });
      return session;
    } catch (error) {
      if (error && error.status === 401) clearCachedSession();
      if (options.fallbackToCache === true) return getSession();
      throw error;
    }
  }

  function safeReferralCode(value) {
    var code = String(value || '').trim().toLowerCase();
    return /^[a-z0-9-]{4,48}$/.test(code) ? code : '';
  }

  function socialAuthUrl(provider, options) {
    options = options || {};
    provider = provider === 'facebook' ? 'facebook' : 'linkedin';
    var mode = ['login', 'register', 'link'].indexOf(options.mode) >= 0 ? options.mode : 'login';
    var current = getSession();
    var role = options.role === 'client' || options.role === 'freelancer' ? options.role : (current && current.role) || 'freelancer';
    var desiredNext = safeNext(options.next || (role === 'client' ? ROUTES.dashboard : ROUTES.freelancerProfile));
    var callbackNext = desiredNext;
    if (mode !== 'link') {
      callbackNext = ROUTES.login + '?mode=' + encodeURIComponent(mode) + '&role=' + encodeURIComponent(role) + '&next=' + encodeURIComponent(desiredNext);
    }
    var query = {
      mode: mode,
      role: role,
      next: callbackNext,
      ref: safeReferralCode(options.ref)
    };
    return appendQuery(endpointUrl(provider === 'facebook' ? 'facebookStart' : 'linkedinStart'), query);
  }

  function startSocialAuth(provider, options) {
    options = options || {};
    provider = provider === 'facebook' ? 'facebook' : 'linkedin';
    if (!hasHttpOrigin()) throw new ProLinkerError('Social login werkt na publicatie via HTTPS.', { code: 'SERVER_REQUIRED' });
    var url = socialAuthUrl(provider, options);
    if (options.redirect === false) return url;
    if (options.mode === 'register') {
      var parsed = new URL(url, global.location.href);
      var endpointKey = provider === 'facebook' ? 'facebookStart' : 'linkedinStart';
      return platformRequest(endpointKey, {
        method: 'POST',
        body: {
          mode: 'register',
          role: options.role,
          next: parsed.searchParams.get('next') || '',
          ref: safeReferralCode(options.ref),
          profile: isPlainObject(options.profile) ? options.profile : {},
          consent: isPlainObject(options.consent) ? options.consent : {}
        }
      }).then(function (result) {
        var authorizationUrl = result && safeHref(result.authorizationUrl, '');
        if (!authorizationUrl || !/^https:\/\//i.test(authorizationUrl)) {
          throw new ProLinkerError('De social-loginprovider gaf geen geldige URL terug.', { code: 'OAUTH_URL_INVALID' });
        }
        global.location.assign(authorizationUrl);
        return authorizationUrl;
      });
    }
    global.location.assign(url);
    return url;
  }

  function linkedinAuthUrl(options) { return socialAuthUrl('linkedin', options); }
  function facebookAuthUrl(options) { return socialAuthUrl('facebook', options); }
  function startLinkedInAuth(options) { return startSocialAuth('linkedin', options); }
  function startFacebookAuth(options) { return startSocialAuth('facebook', options); }

  async function startWhatsappVerification(input, options) {
    input = isPlainObject(input) ? input : {};
    options = options || {};
    var role = input.role === 'client' ? 'client' : (input.role === 'freelancer' ? 'freelancer' : '');
    var intent = input.intent === 'register' || input.mode === 'register' ? 'register' : 'login';
    var rawPhone = String(input.phone || input.phoneNumber || input.contact || '').trim();
    var countryHint = String(input.country || input.countryCode || '').trim();
    var hasDomesticCountry = !!countryHint && !/^(?:\+|00)/.test(rawPhone);
    var phone = hasDomesticCountry && /^[\d\s().-]+$/.test(rawPhone) ? rawPhone : normalizeWhatsapp(rawPhone);
    if (!role) throw new ProLinkerError('Kies eerst je accounttype.', { code: 'ROLE_REQUIRED' });
    if (!phone) throw new ProLinkerError('Vul een geldig internationaal WhatsApp-nummer in.', { code: 'PHONE_INVALID' });
    return platformRequest('whatsappChallenge', {
      method: 'POST',
      body: {
        phone: phone,
        country: countryHint,
        role: role,
        intent: intent,
        locale: String(input.locale || '').trim(),
        next: input.next ? safeNext(input.next) : '',
        ref: safeReferralCode(input.ref || input.referralCode),
        profile: isPlainObject(input.profile) ? input.profile : {},
        consent: isPlainObject(input.consent) ? input.consent : {}
      },
      signal: options.signal
    });
  }

  async function verifyWhatsappCode(challengeId, code, options) {
    options = options || {};
    var id = String(challengeId || '').trim();
    var value = String(code || '').trim();
    if (!id) throw new ProLinkerError('Start de WhatsApp-verificatie opnieuw.', { code: 'CHALLENGE_REQUIRED' });
    if (!/^\d{6}$/.test(value)) throw new ProLinkerError('Vul de zescijferige code in.', { code: 'OTP_INVALID' });
    var result = await platformRequest('whatsappVerify', {
      method: 'POST',
      body: { challengeId: id, code: value },
      signal: options.signal
    });
    var session = result && isPlainObject(result.session) ? cacheSession(result.session) : null;
    if (!session) session = await hydrateSession({ signal: options.signal });
    return { ok: true, session: session };
  }

  async function importLinkedInProfile(options) {
    options = options || {};
    var result = await platformRequest('linkedinProfileImport', { signal: options.signal });
    result = isPlainObject(result) ? result : {};
    var profile = isPlainObject(result.profile) ? result.profile : result;
    var available = Array.isArray(result.availableFields) ? result.availableFields.slice(0, 12) : [];
    var imported = [];
    if (options.apply !== false && available.length) {
      var requested = Array.isArray(options.fields) && options.fields.length
        ? options.fields.filter(function (field) { return available.indexOf(field) >= 0; })
        : available;
      if (requested.length) {
        var applied = await platformRequest('linkedinProfileImport', { method: 'POST', body: { fields: requested }, signal: options.signal });
        if (isPlainObject(applied) && isPlainObject(applied.session)) cacheSession(applied.session);
        imported = isPlainObject(applied) && Array.isArray(applied.importedFields) ? applied.importedFields.slice(0, 12) : requested;
      }
    }
    return {
      source: 'linkedin',
      firstName: String(profile.firstName || '').trim(),
      lastName: String(profile.lastName || '').trim(),
      name: String(profile.name || profile.displayName || ((profile.firstName || '') + ' ' + (profile.lastName || ''))).trim(),
      email: String(profile.email || '').trim(),
      pictureUrl: safeHref(profile.pictureUrl || profile.avatarUrl, ''),
      locale: String(profile.locale || '').trim(),
      importedFields: imported.length ? imported : available
    };
  }

  function activeSession(requiredRole) {
    var session = getSession();
    if (!session) throw new ProLinkerError('Log in om door te gaan.', { code: 'AUTH_REQUIRED', status: 401 });
    if (requiredRole && session.role !== requiredRole) throw new ProLinkerError('Deze actie is niet beschikbaar voor dit accounttype.', { code: 'FORBIDDEN', status: 403 });
    return session;
  }

  function normalizeDashboard(data, session) {
    data = isPlainObject(data) ? data : {};
    return {
      role: session.role,
      user: isPlainObject(data.user) ? data.user : { id: accountId(session), name: displayName(session), initials: initials(displayName(session)), role: session.role },
      metrics: Array.isArray(data.metrics) ? data.metrics : [],
      activity: Array.isArray(data.activity) ? data.activity : (Array.isArray(data.activities) ? data.activities : []),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  }

  async function getDashboard(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return normalizeDashboard(await request('dashboard', { query: { role: session.role, refresh: options.refresh ? 1 : undefined }, signal: options.signal }), session);
    var repository = readRepository(session);
    if (options.refresh) {
      repository.dashboard.updatedAt = new Date().toISOString();
      writeRepository(session, repository);
    }
    var roleData = repository.dashboard[session.role] || repository.dashboard.freelancer;
    return normalizeDashboard({ user: repository.account, metrics: roleData.metrics, activity: repository.dashboard.activities, updatedAt: repository.dashboard.updatedAt }, session);
  }

  function normalizeMember(item, session) {
    item = isPlainObject(item) ? item : {};
    var name = String(item.name || item.displayName || 'ProLinker professional');
    var member = {
      id: String(item.id || 'member-' + hashString(name)), name: shortDisplayName(name), initials: item.initials || initials(name),
      headline: String(item.headline || item.discipline || 'Professional'), location: String(item.location || 'Remote'),
      availability: String(item.availability || 'Beschikbaar'), mutual: Math.max(0, Number(item.mutual || item.sharedConnections) || 0),
      skills: Array.isArray(item.skills) ? item.skills.slice(0, 12) : [], status: item.status || 'connected', color: item.color || '#E9EFF5',
      avatarUrl: safeHref(item.avatarUrl || item.pictureUrl || item.profilePicture, ''),
      bio: String(item.bio || item.summary || item.description || ''),
      category: String(item.category || item.discipline || item.fieldOfWork || ''),
      company: String(item.company || item.companyName || ''),
      locale: String(item.locale || '')
    };
    member.profileHref = safeHref(item.profileHref, profileLinkFor(member, session.role));
    return member;
  }

  function normalizeNetwork(data, session, query) {
    data = isPlainObject(data) ? data : {};
    var needle = String(query || '').trim().toLowerCase();
    var members = (Array.isArray(data.members) ? data.members : []).map(function (item) { return normalizeMember(item, session); });
    var invitations = (Array.isArray(data.invitations) ? data.invitations : []).filter(function (item) { return !item.status || item.status === 'pending'; }).map(function (item) {
      var normalized = normalizeMember(item, session);
      normalized.direction = item.direction || 'incoming';
      normalized.createdAt = item.createdAt || '';
      return normalized;
    });
    var outbound = (Array.isArray(data.outbound) ? data.outbound : []).map(function (item) { return Object.assign({}, item); });
    if (needle) members = members.filter(function (item) { return [item.name, item.headline, item.location].concat(item.skills).join(' ').toLowerCase().indexOf(needle) >= 0; });
    return {
      currentUser: isPlainObject(data.currentUser) ? data.currentUser : { id: accountId(session), name: displayName(session), initials: initials(displayName(session)), role: session.role },
      members: members,
      invitations: invitations,
      outbound: outbound,
      totals: { connected: members.length, pending: invitations.length, invited: outbound.length },
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  }

  async function listNetwork(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return normalizeNetwork(await request('network', { query: { q: options.query || '', refresh: options.refresh ? 1 : undefined }, signal: options.signal }), session, options.query);
    var repository = readRepository(session);
    if (options.refresh) { repository.network.updatedAt = new Date().toISOString(); writeRepository(session, repository); }
    return normalizeNetwork({ currentUser: repository.account, members: repository.network.members, invitations: repository.network.invitations, outbound: repository.network.outbound, updatedAt: repository.network.updatedAt }, session, options.query);
  }

  function addActivity(repository, session, title, detail, status) {
    repository.dashboard.activities.unshift({
      id: 'act-' + hashString(title + detail + new Date().toISOString()), type: 'network', title: title, detail: detail,
      status: status || 'klaar', at: new Date().toISOString(), href: ROUTES.network
    });
    repository.dashboard.activities = repository.dashboard.activities.slice(0, 16);
    repository.dashboard.updatedAt = new Date().toISOString();
  }

  async function acceptInvitation(id, options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return request('networkAccept', { method: 'POST', params: { id: id }, signal: options.signal });
    var repository = readRepository(session);
    var index = repository.network.invitations.findIndex(function (item) { return item.id === id; });
    if (index < 0) throw new ProLinkerError('Uitnodiging niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    var invite = repository.network.invitations.splice(index, 1)[0];
    invite.status = 'connected';
    invite.availability = invite.availability || 'Beschikbaar';
    invite.skills = invite.skills || [];
    invite.profileHref = profileLinkFor(invite, session.role);
    repository.network.members.unshift(invite);
    repository.profiles[invite.id] = Object.assign({}, invite);
    repository.network.updatedAt = new Date().toISOString();
    addActivity(repository, session, 'Connectie geaccepteerd', shortDisplayName(invite.name) + ' is nu onderdeel van je netwerk.', 'verbonden');
    writeRepository(session, repository);
    return { ok: true, member: normalizeMember(invite, session) };
  }

  async function rejectInvitation(id, options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return request('networkReject', { method: 'POST', params: { id: id }, signal: options.signal });
    var repository = readRepository(session);
    var before = repository.network.invitations.length;
    repository.network.invitations = repository.network.invitations.filter(function (item) { return item.id !== id; });
    if (repository.network.invitations.length === before) throw new ProLinkerError('Uitnodiging niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    repository.network.updatedAt = new Date().toISOString();
    writeRepository(session, repository);
    return { ok: true, id: id };
  }

  async function removeConnection(id, options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return request('networkConnection', { method: 'DELETE', params: { id: id }, signal: options.signal });
    var repository = readRepository(session);
    var before = repository.network.members.length;
    repository.network.members = repository.network.members.filter(function (item) { return item.id !== id; });
    if (repository.network.members.length === before) throw new ProLinkerError('Connectie niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    delete repository.profiles[id];
    repository.network.updatedAt = new Date().toISOString();
    writeRepository(session, repository);
    return { ok: true, id: id };
  }

  function whatsappInviteLink(input, session) {
    input = input || {};
    session = session || activeSession();
    var phone = normalizeWhatsapp(input.phone);
    if (!phone) throw new ProLinkerError('Vul een geldig WhatsApp-nummer in.', { code: 'VALIDATION_ERROR' });
    var invitee = String(input.name || 'daar').trim().slice(0, 80) || 'daar';
    var inviter = displayName(session);
    var registerUrl;
    try { registerUrl = new URL(ROUTES.login + '?mode=register', global.location.href).href; }
    catch (error) { registerUrl = ROUTES.login + '?mode=register'; }
    var message = 'Hoi ' + invitee + ', ' + inviter + ' nodigt je uit voor ProLinker. Bekijk je netwerk en kansen via ' + registerUrl;
    return 'https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(message);
  }

  async function inviteNetwork(input, options) {
    options = options || {};
    var session = activeSession();
    input = input || {};
    var phone = normalizeWhatsapp(input.phone);
    var name = String(input.name || '').trim().slice(0, 80);
    if (!phone || !name) throw new ProLinkerError('Naam en een geldig WhatsApp-nummer zijn verplicht.', { code: 'VALIDATION_ERROR' });
    if (configured.baseUrl) {
      var remote = await request('networkInvite', { method: 'POST', body: { name: name, phone: phone, channel: 'whatsapp' }, signal: options.signal });
      return Object.assign({ shareUrl: whatsappInviteLink({ name: name, phone: phone }, session) }, isPlainObject(remote) ? remote : {});
    }
    var repository = readRepository(session);
    var id = 'out-' + hashString(phone);
    var existing = repository.network.outbound.find(function (item) { return item.id === id; });
    if (!existing) repository.network.outbound.unshift({ id: id, name: name, phone: phone, channel: 'whatsapp', status: 'pending', createdAt: new Date().toISOString() });
    repository.network.updatedAt = new Date().toISOString();
    addActivity(repository, session, 'WhatsApp-uitnodiging klaargezet', name + ' is toegevoegd aan je openstaande uitnodigingen.', 'verzonden');
    writeRepository(session, repository);
    return { ok: true, invitation: existing || repository.network.outbound[0], shareUrl: whatsappInviteLink({ name: name, phone: phone }, session) };
  }

  async function getProfile(id, options) {
    options = options || {};
    var session = activeSession();
    var target = id || accountId(session);
    if (configured.baseUrl) return request('profile', { params: { id: target }, signal: options.signal });
    var repository = readRepository(session);
    if (target === repository.account.id || target === 'me') return Object.assign({}, repository.account);
    if (!repository.profiles[target]) throw new ProLinkerError('Profiel niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    return Object.assign({}, repository.profiles[target]);
  }

  async function updateProfile(input, options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return request('profile', { method: 'PATCH', params: { id: 'me' }, body: input || {}, signal: options.signal });
    var repository = readRepository(session);
    repository.account = Object.assign({}, repository.account, isPlainObject(input) ? input : {}, { id: repository.account.id, role: session.role, contact: normalizeWhatsapp(session.contact) });
    writeRepository(session, repository);
    return Object.assign({}, repository.account);
  }

  async function listAssignments(options) {
    options = options || {};
    var session = activeSession();
    var archived = options.archived === true;
    if (configured.baseUrl) return normalizePayload(await request('assignments', { query: Object.assign({}, options.query || {}, { archived: archived ? 1 : 0 }), signal: options.signal }));
    return readRepository(session).assignments.filter(function (item) { return (item.archived === true) === archived; }).map(function (item) { return Object.assign({ archived: false }, item); });
  }

  async function getAssignment(id, options) {
    options = options || {};
    var session = activeSession();
    var target = String(id || '').trim();
    if (!target) throw new ProLinkerError('Opdracht-id is verplicht.', { code: 'INVALID_ARGUMENT' });
    if (configured.baseUrl) return normalizePayload(await request('assignment', { params: { id: target }, signal: options.signal }));
    var assignment = readRepository(session).assignments.find(function (item) { return item.id === target; });
    if (!assignment) throw new ProLinkerError('Opdracht niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    return Object.assign({}, assignment);
  }

  async function updateAssignmentStatus(id, status, options) {
    options = options || {};
    var session = activeSession();
    var target = String(id || '').trim();
    var action = String(status || '').trim().toLowerCase();
    if (!target || ['archive', 'unarchive', 'withdraw'].indexOf(action) < 0) throw new ProLinkerError('Ongeldige opdrachtactie.', { code: 'VALIDATION_ERROR' });
    if (configured.baseUrl) return normalizePayload(await request('assignment', { method: 'PATCH', params: { id: target }, body: { status: action }, signal: options.signal }));
    var repository = readRepository(session);
    var index = repository.assignments.findIndex(function (item) { return item.id === target; });
    if (index < 0) throw new ProLinkerError('Opdracht niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    var current = repository.assignments[index];
    if (action === 'archive') current.archived = true;
    if (action === 'unarchive') current.archived = false;
    if (action === 'withdraw') { current.status = 'withdrawn'; current.withdrawnAt = new Date().toISOString(); }
    current.updatedAt = new Date().toISOString();
    writeRepository(session, repository);
    return Object.assign({}, current);
  }

  var RESPONSE_POOL = [
    { name: 'Sanne Vermeer', headline: 'Senior front-end developer', location: 'Amsterdam', skills: ['React', 'TypeScript', 'Next.js'], bio: 'Bouwt al negen jaar productieklare webapplicaties voor scale-ups en corporates. Sterk in performance, toegankelijkheid en design systems.', focus: 'Werkt het liefst in multidisciplinaire productteams en neemt junior developers graag mee in codereviews en pairing.', experience: ['Lead front-end, Coolblue (2022-2025)', 'Front-end developer, Adyen (2018-2022)', 'HBO-ICT, Hogeschool van Amsterdam'], avatarUrl: 'https://randomuser.me/api/portraits/women/44.jpg', rating: 5, branche: 'Software en IT', hours: '32-40' },
    { name: 'Jesse van den Berg', headline: 'Full-stack JavaScript developer', location: 'Utrecht', skills: ['Node.js', 'React', 'PostgreSQL'], bio: 'Full-stack developer met focus op snelle MVP-trajecten en schaalbare API-architectuur. Werkt graag kort-cyclisch met wekelijkse demo-momenten.', focus: 'Denkt actief mee over productkeuzes en houdt de technische schuld laag met duidelijke documentatie.', experience: ['Freelance full-stack, o.a. bol. en PostNL (2021-heden)', 'Software engineer, Mollie (2019-2021)', 'BSc Informatica, Universiteit Utrecht'], avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg', rating: 4, branche: 'Software en IT', hours: '24-40' },
    { name: 'Meryem Aydin', headline: 'Marketing automation specialist', location: 'Rotterdam', skills: ['HubSpot', 'Klaviyo', 'SQL'], bio: 'Zet marketing automation op die aantoonbaar omzet oplevert. Certified HubSpot- en Klaviyo-partner, data-gedreven en pragmatisch.', focus: 'Start iedere samenwerking met een meetplan zodat resultaat vanaf week een zichtbaar is.', experience: ['Automation lead, Rituals (2023-2025)', 'CRM-specialist, Picnic (2020-2023)', 'MSc Marketing, Erasmus Universiteit'], avatarUrl: 'https://randomuser.me/api/portraits/women/68.jpg', rating: 5, branche: 'Marketing en Communicatie', hours: '16-32' },
    { name: 'Daan Kuipers', headline: 'UX en product designer', location: 'Eindhoven', skills: ['Figma', 'Design systems', 'UX research'], bio: 'Ontwerpt digitale producten van eerste schets tot getest prototype. Combineert onderzoek met een scherp oog voor detail.', focus: 'Test ontwerpen wekelijks met echte gebruikers en levert developer-klare specs in Figma.', experience: ['Senior product designer, ASML (2022-2025)', 'UX designer, VanMoof (2019-2022)', 'MDes, Design Academy Eindhoven'], avatarUrl: 'https://randomuser.me/api/portraits/men/75.jpg', rating: 4, branche: 'Design en Creatie', hours: '24-32' },
    { name: 'Fleur Jacobs', headline: 'Data engineer en analist', location: 'Op afstand', skills: ['Python', 'dbt', 'Snowflake'], bio: 'Richt datapipelines en dashboards in waar teams echt op sturen. Ervaring met moderne data-stacks in retail en fintech.', focus: 'Bouwt overdraagbaar: heldere datamodellen, versiebeheer en een team dat er zelf mee verder kan.', experience: ['Data engineer, Albert Heijn (2021-2025)', 'BI-analist, ING (2018-2021)', 'MSc Data Science, TU Delft'], avatarUrl: 'https://randomuser.me/api/portraits/women/12.jpg', rating: 5, branche: 'Data en AI', hours: '32-40' },
    { name: 'Ruben de Wit', headline: 'DevOps en cloud engineer', location: 'Den Haag', skills: ['AWS', 'Kubernetes', 'Terraform'], bio: 'Automatiseert infrastructuur en CI/CD zodat teams sneller en veiliger releasen. AWS-gecertificeerd op professional-niveau.', focus: 'Zet monitoring en alerting direct goed neer, zodat verrassingen in productie uitblijven.', experience: ['Platform engineer, KPN (2022-2025)', 'DevOps engineer, Exact (2019-2022)', 'HBO Technische Informatica, De Haagse Hogeschool'], avatarUrl: 'https://randomuser.me/api/portraits/men/22.jpg', rating: 4, branche: 'Software en IT', hours: '24-40' },
    { name: 'Lotte Willems', headline: 'Content- en SEO-strateeg', location: 'Antwerpen', skills: ['SEO', 'Contentstrategie', 'Copywriting'], bio: 'Laat organisch verkeer groeien met contentstrategieën die aansluiten op de klantreis. Schrijft zelf mee waar nodig.', focus: 'Combineert zoekwoordonderzoek met merkverhaal, zodat content scoort en klinkt zoals jij.', experience: ['SEO-lead, Coosto (2022-2025)', 'Contentmarketeer, Studio 100 (2019-2022)', 'MA Communicatiewetenschappen, KU Leuven'], avatarUrl: 'https://randomuser.me/api/portraits/women/26.jpg', rating: 5, branche: 'Marketing en Communicatie', hours: '16-24' },
    { name: 'Omar Benali', headline: 'AI en machine learning consultant', location: 'Amsterdam', skills: ['Python', 'LLM-integraties', 'MLOps'], bio: 'Helpt organisaties van AI-idee naar werkende toepassing, inclusief governance en beheer. Praktisch en resultaatgericht.', focus: 'Levert naast modellen ook de werkinstructies en evaluaties waarmee het team zelf kan bijsturen.', experience: ['ML engineer, Booking (2021-2025)', 'Data scientist, ABN AMRO (2018-2021)', 'MSc AI, Universiteit van Amsterdam'], avatarUrl: 'https://randomuser.me/api/portraits/men/85.jpg', rating: 5, branche: 'Data en AI', hours: '24-32' },
    { name: 'Iris Mulder', headline: 'Interim finance professional', location: 'Utrecht', skills: ['Financial control', 'Power BI', 'Exact'], bio: 'Interim controller voor mkb en scale-ups. Brengt rust in de cijfers en bouwt rapportages die het hele team begrijpt.', focus: 'Sterk in maandafsluitingen versnellen en forecasting die de directie echt gebruikt.', experience: ['Interim controller, diverse scale-ups (2022-heden)', 'Financial controller, Jumbo (2018-2022)', 'RA-opleiding, Nyenrode'], avatarUrl: 'https://randomuser.me/api/portraits/women/57.jpg', rating: 4, branche: 'Finance en Control', hours: '16-32' },
    { name: 'Thomas Peeters', headline: 'Mobile developer (iOS en Android)', location: 'Op afstand', skills: ['Flutter', 'Swift', 'Kotlin'], bio: 'Bouwt cross-platform apps met native kwaliteit. Van appstore-strategie tot release en beheer.', focus: 'Regelt ook de releasepijplijn: app-store review, crashmonitoring en gefaseerde uitrol.', experience: ['Mobile lead, Temper (2022-2025)', 'iOS developer, Rabobank (2019-2022)', 'BSc Informatica, KU Leuven'], avatarUrl: 'https://randomuser.me/api/portraits/men/41.jpg', rating: 5, branche: 'Software en IT', hours: '32-40' }
  ];

  var RESPONSE_MESSAGES = [
    'Klinkt als een mooie klus, ik ben per direct beschikbaar. Zullen we kort kennismaken?',
    'Ik heb vergelijkbare opdrachten gedaan en stuur graag mijn portfolio mee. Wanneer schikt een gesprek?',
    'Interessante opdracht. Ik heb nog een paar vragen over de scope, kunnen we bellen?',
    'Dit sluit goed aan op mijn ervaring. Ik kan binnen twee weken starten.',
    'Graag reageer ik op deze opdracht. Mijn uurtarief is bespreekbaar bij een langere samenwerking.',
    'Is de opdracht ook parttime in te vullen? Ik ben drie dagen per week beschikbaar.',
    'Mooie uitdaging. Ik werk remote-first maar kom graag langs voor een kennismaking.',
    'Ik heb je opdracht via Instant Match ontvangen en ben zeker geïnteresseerd.'
  ];

  function normalizeResponseStatus(value) {
    var status = String(value || '').trim().toLowerCase();
    return ['new', 'shortlisted', 'rejected'].indexOf(status) >= 0 ? status : 'new';
  }

  var REDACTION_MARK = '█████';

  var CONTACT_PATTERNS = [
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    /(?:\+|00)[\d\s()\/-]{8,}\d/g,
    /\b0\d{1,3}[\s\/-]?\d{6,8}\b/g,
    /(?:https?:\/\/|www\.)[^\s|,;)]+/gi,
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s|,;)]+/gi
  ];

  function contactInfoMatches(text) {
    var value = String(text || '');
    var count = 0;
    CONTACT_PATTERNS.forEach(function (pattern) {
      var matches = value.match(pattern);
      if (matches) count += matches.length;
    });
    return count;
  }

  function localRedactCv(text, options) {
    options = isPlainObject(options) ? options : {};
    var output = String(text || '');
    var redactions = 0;
    var censor = function (pattern) {
      output = output.replace(pattern, function () { redactions += 1; return REDACTION_MARK; });
    };
    censor(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g);
    censor(/(?:\+|00)[\d\s()\/-]{8,}\d/g);
    censor(/\b0\d{1,3}[\s\/-]?\d{6,8}\b/g);
    censor(/(?:https?:\/\/|www\.)[^\s|,;)]+/gi);
    censor(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s|,;)]+/gi);
    var name = String(options.name || options.fullName || '').trim();
    if (name && name.split(/\s+/).length > 1) {
      var parts = name.split(/\s+/);
      var first = parts[0];
      var last = parts[parts.length - 1];
      var short = first + ' ' + last.charAt(0).toUpperCase() + '.';
      var escape = function (value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      output = output.replace(new RegExp(escape(name), 'gi'), function () { redactions += 1; return short; });
      output = output.replace(new RegExp('\\b' + escape(last) + '\\b', 'g'), function () { redactions += 1; return last.charAt(0).toUpperCase() + '.'; });
    }
    return { text: output, redactions: redactions, provider: 'local', preview: true };
  }

  async function redactCv(input, options) {
    options = options || {};
    activeSession();
    input = isPlainObject(input) ? input : { text: input };
    var text = String(input.text || '');
    if (!text.trim()) throw new ProLinkerError('Er is geen cv-tekst om te anonimiseren.', { code: 'VALIDATION_ERROR' });
    if (configured.baseUrl) {
      var result = normalizePayload(await request('cvRedact', { body: { text: text, name: String(input.name || ''), locale: 'nl' }, signal: options.signal }));
      result = isPlainObject(result) ? result : {};
      var redacted = String(result.text || result.redactedText || '');
      if (redacted) return { text: redacted, redactions: Math.max(0, Math.floor(finiteNumber(result.redactions, 0))), provider: String(result.provider || 'api'), preview: false };
    }
    return localRedactCv(text, { name: input.name });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeCvDocument(input) {
    if (!isPlainObject(input)) return null;
    var status = String(input.status || 'approved').toLowerCase();
    return {
      id: String(input.id || 'cv-' + hashString(String(input.fileName || '') + '|' + String(input.uploadedAt || ''))),
      fileName: String(input.fileName || input.name || 'cv.pdf').slice(0, 140),
      size: Math.max(0, Math.floor(finiteNumber(input.size, 0))),
      uploadedAt: input.uploadedAt || input.processedAt || new Date().toISOString(),
      status: ['approved', 'rejected', 'scanning'].indexOf(status) >= 0 ? status : 'approved',
      redactions: Math.max(0, Math.floor(finiteNumber(input.redactions, 0))),
      text: String(input.text || input.redactedText || '')
    };
  }

  async function uploadCvDocument(input, options) {
    options = options || {};
    var session = activeSession();
    input = isPlainObject(input) ? input : {};
    var text = String(input.text || '').trim();
    if (!text) throw new ProLinkerError('Er is geen cv-tekst gevonden om te controleren.', { code: 'VALIDATION_ERROR' });
    var fileName = String(input.fileName || 'cv.pdf').slice(0, 140);
    if (configured.baseUrl) {
      var remote = normalizePayload(await request('cvUpload', { body: { text: text, fileName: fileName, size: Math.max(0, Math.floor(finiteNumber(input.size, 0))), name: String(input.name || ''), locale: 'nl' }, signal: options.signal }));
      var normalizedRemote = normalizeCvDocument(remote);
      if (!normalizedRemote) throw new ProLinkerError('De cv-controle gaf geen geldig document terug.', { code: 'INVALID_RESPONSE' });
      return normalizedRemote;
    }
    var redacted = localRedactCv(text, { name: String(input.name || displayName(session)) });
    var record = normalizeCvDocument({
      id: 'cv-' + hashString(accountId(session) + '|' + fileName + '|' + text.length),
      fileName: fileName,
      size: finiteNumber(input.size, 0),
      uploadedAt: new Date().toISOString(),
      status: 'approved',
      redactions: redacted.redactions,
      text: redacted.text
    });
    var repository = readRepository(session);
    repository.cvDocument = record;
    writeRepository(session, repository);
    return record;
  }

  async function getCvDocument(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) {
      try { return normalizeCvDocument(normalizePayload(await request('cvDocument', { signal: options.signal }))); }
      catch (error) { if (error && error.status === 404) return null; throw error; }
    }
    return normalizeCvDocument(readRepository(session).cvDocument);
  }

  function cvDocumentHtml(record) {
    record = normalizeCvDocument(record);
    if (!record || !record.text) return '';
    var body = [];
    var bodyIndex = 0;
    var listOpen = false;
    var closeList = function () { if (listOpen) { body.push('</ul>'); listOpen = false; } };
    record.text.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var safe = escapeHtml(line);
      if (line.indexOf('- ') === 0) {
        if (!listOpen) { body.push('<ul>'); listOpen = true; }
        body.push('<li>' + escapeHtml(line.slice(2)) + '</li>');
      } else if (line.indexOf('## ') === 0) { closeList(); body.push('<h2>' + escapeHtml(line.slice(3)) + '</h2>'); }
      else if (bodyIndex === 0) { closeList(); body.push('<h1>' + safe + '</h1>'); }
      else if (bodyIndex === 1) { closeList(); body.push('<p class="sub">' + safe + '</p>'); }
      else if (bodyIndex === 2 && /E-mail|Telefoon|LinkedIn|█/i.test(line)) { closeList(); body.push('<p class="contact">' + safe + '</p>'); }
      else { closeList(); body.push('<p>' + safe + '</p>'); }
      bodyIndex += 1;
    });
    closeList();
    var html = body.join('\n');
    return '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + escapeHtml(record.fileName) + ' | ProLinker</title><style>'
      + 'body{margin:0;background:#E8EBEE;font-family:Lato,system-ui,sans-serif;color:#152431}'
      + '.bar{position:sticky;top:0;background:#152431;color:#fff;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:12.5px}'
      + '.bar strong{font-weight:800}.bar .note{opacity:.82}'
      + '.bar button{border:1px solid rgba(255,255,255,.35);border-radius:7px;background:transparent;color:#fff;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}'
      + '.page{max-width:820px;margin:26px auto 60px;background:#fff;border:1px solid #DCDFE2;border-radius:10px;box-shadow:0 24px 60px -34px rgba(11,17,25,.45);padding:52px 58px}'
      + 'h1{margin:0;font-size:27px;letter-spacing:-.02em}h2{margin:26px 0 8px;padding-bottom:7px;border-bottom:1px solid #ECEEF0;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#24476A}'
      + 'p{margin:10px 0 0;font-size:14.5px;line-height:1.7;color:#424444}.sub{margin-top:4px;color:#8C8E8F;font-size:14px}.contact{font-family:monospace;font-size:12.5px;letter-spacing:.01em}'
      + 'ul{margin:8px 0 0;padding-left:20px}li{margin-top:7px;font-size:14.5px;line-height:1.65;color:#424444}'
      + '@media(max-width:640px){.page{margin:0;border-radius:0;padding:30px 22px}}'
      + '@media print{.bar{display:none}body{background:#fff}.page{margin:0;border:0;box-shadow:none;max-width:none}}'
      + '</style></head><body>'
      + '<div class="bar"><span><strong>ProLinker</strong> <span class="note">| Geanonimiseerd cv: contactgegevens, volledige namen en externe links zijn door AI afgeschermd (' + record.redactions + ').</span></span><button onclick="window.print()">Afdrukken of opslaan als pdf</button></div>'
      + '<div class="page">' + html + '</div>'
      + '</body></html>';
  }

  function openCvDocument(record) {
    var html = cvDocumentHtml(record);
    if (!html) throw new ProLinkerError('Er is geen goedgekeurd cv om te bekijken.', { code: 'NOT_FOUND' });
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var opened = global.open(url, '_blank', 'noopener');
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (error) {} }, 60000);
    if (!opened) throw new ProLinkerError('De cv-weergave werd geblokkeerd door je browser.', { code: 'POPUP_BLOCKED' });
    return true;
  }

  function seedCvFile(profile, entryHash) {
    var redacted = localRedactCv(seedCvText(profile, entryHash), { name: profile.name });
    var parts = profile.name.split(/\s+/);
    return {
      id: 'cvfile-' + hashString(profile.name),
      fileName: 'cv-' + parts[0].toLowerCase() + '-' + parts[parts.length - 1].charAt(0).toLowerCase() + '.pdf',
      size: 90000 + (entryHash % 290000),
      uploadedAt: new Date(Date.now() - (240 + (entryHash % 2000)) * 3600000).toISOString(),
      status: 'approved',
      redactions: redacted.redactions,
      text: redacted.text
    };
  }

  function seedCvText(profile, entryHash) {
    var slug = profile.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
    var lines = [
      profile.name,
      profile.headline + ' | ' + profile.location,
      'E-mail: ' + slug.replace(/-/g, '.') + '@outlook.com | Telefoon: +31 6 ' + String(10000000 + (entryHash % 89999999)) + ' | LinkedIn: linkedin.com/in/' + slug,
      '',
      '## Profiel',
      profile.bio + ' ' + profile.focus,
      '',
      '## Werkervaring en opleiding'
    ];
    profile.experience.forEach(function (line) { lines.push('- ' + line); });
    lines.push('');
    lines.push('## Vaardigheden');
    lines.push(profile.skills.join(', '));
    return lines.join('\n');
  }

  function seedAssignmentResponses(session, assignment) {
    var seedBase = accountId(session) + '|' + assignment.id;
    var hash = parseInt(hashString(seedBase), 36) >>> 0;
    var count = Number(assignment.responses);
    if (!Number.isFinite(count) || count < 0) count = 3 + (hash % 6);
    count = Math.max(0, Math.min(count, RESPONSE_POOL.length));
    var offset = hash % RESPONSE_POOL.length;
    var bestMatch = Math.max(60, Math.min(99, Number(assignment.match) || (82 + (hash % 16))));
    var items = [];
    for (var i = 0; i < count; i += 1) {
      var profile = RESPONSE_POOL[(offset + i) % RESPONSE_POOL.length];
      var entryHash = parseInt(hashString(seedBase + '|' + profile.name), 36) >>> 0;
      var match = i === 0 ? bestMatch : Math.max(58, bestMatch - 2 - (entryHash % 21));
      var low = 55 + (entryHash % 7) * 5;
      items.push({
        id: 'resp-' + hashString(seedBase + '|' + profile.name),
        name: profile.name,
        initials: initials(profile.name),
        headline: profile.headline,
        location: profile.location,
        skills: profile.skills.slice(),
        bio: profile.bio,
        focus: profile.focus,
        experience: profile.experience.slice(),
        cvFile: seedCvFile(profile, entryHash),
        avatarUrl: profile.avatarUrl,
        rating: profile.rating,
        branche: profile.branche,
        hours: profile.hours,
        match: match,
        channel: entryHash % 5 < 3 ? 'whatsapp' : 'platform',
        preview: RESPONSE_MESSAGES[entryHash % RESPONSE_MESSAGES.length],
        respondedAt: new Date(Date.now() - (2 + (entryHash % 70)) * 3600000).toISOString(),
        status: 'new',
        rateLabel: '€ ' + low + ' - € ' + (low + 15 + (entryHash % 3) * 10) + ' per uur',
        availability: entryHash % 3 === 0 ? 'Per direct beschikbaar' : (entryHash % 3 === 1 ? 'Beschikbaar vanaf volgende maand' : '24-32 uur per week')
      });
    }
    items.sort(function (a, b) { return b.match - a.match; });
    return {
      seedVersion: 2,
      stats: {
        sent: 25,
        views: Math.max(count, count * 7 + (hash % 30)),
        whatsapp: items.filter(function (item) { return item.channel === 'whatsapp'; }).length,
        platform: items.filter(function (item) { return item.channel === 'platform'; }).length,
        bestMatch: items.length ? items[0].match : null,
        bestMatchName: items.length ? items[0].name : ''
      },
      items: items
    };
  }

  function normalizeAssignmentResponse(item, index) {
    item = isPlainObject(item) ? item : {};
    var name = String(item.name || item.freelancerName || 'ProLinker professional');
    var match = Number(item.match !== undefined ? item.match : item.matchPercentage);
    return {
      id: String(item.id || item.responseId || 'response-' + (index + 1)),
      name: name,
      initials: item.initials || initials(name),
      headline: String(item.headline || item.discipline || 'Professional'),
      location: String(item.location || 'Op afstand'),
      skills: Array.isArray(item.skills) ? item.skills.slice(0, 12) : [],
      bio: String(item.bio || item.summary || ''),
      focus: String(item.focus || ''),
      experience: Array.isArray(item.experience) ? item.experience.slice(0, 12) : [],
      cvFile: normalizeCvDocument(item.cvFile || item.cvDocument),
      rating: Number.isFinite(Number(item.rating)) ? Math.max(0, Math.min(5, Math.round(Number(item.rating)))) : 0,
      branche: String(item.branche || item.industry || ''),
      hours: String(item.hours || item.hoursPerWeek || ''),
      match: Number.isFinite(match) ? Math.max(0, Math.min(100, Math.round(match))) : null,
      channel: String(item.channel || '').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'platform',
      preview: String(item.preview || item.message || ''),
      respondedAt: item.respondedAt || item.createdAt || '',
      status: normalizeResponseStatus(item.status),
      rateLabel: String(item.rateLabel || item.rate || ''),
      availability: String(item.availability || ''),
      avatarUrl: safeHref(item.avatarUrl || item.pictureUrl, '')
    };
  }

  function normalizeAssignmentResponses(payload, session, assignment) {
    payload = isPlainObject(payload) ? payload : {};
    var list = Array.isArray(payload) ? payload : (Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.responses) ? payload.responses : []));
    var items = list.map(normalizeAssignmentResponse);
    var stats = isPlainObject(payload.stats) ? payload.stats : {};
    var whatsapp = items.filter(function (item) { return item.channel === 'whatsapp'; }).length;
    var best = items.reduce(function (result, item) { return item.match !== null && (result === null || item.match > result.match) ? item : result; }, null);
    return {
      stats: {
        sent: Math.max(items.length, Math.floor(finiteNumber(stats.sent, finiteNumber(stats.instantMatchSent, items.length)))),
        views: Math.max(0, Math.floor(finiteNumber(stats.views, 0))),
        whatsapp: Math.max(0, Math.floor(finiteNumber(stats.whatsapp, whatsapp))),
        platform: Math.max(0, Math.floor(finiteNumber(stats.platform, items.length - whatsapp))),
        bestMatch: best ? best.match : null,
        bestMatchName: best ? best.name : ''
      },
      items: items,
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
  }

  async function listAssignmentResponses(id, options) {
    options = options || {};
    var session = activeSession('client');
    var target = requiredId(id, 'Opdracht-id');
    if (configured.baseUrl) return normalizeAssignmentResponses(normalizePayload(await request('assignmentResponses', { params: { id: target }, signal: options.signal })), session);
    var repository = readRepository(session);
    var assignment = repository.assignments.find(function (item) { return item.id === target; });
    if (!assignment) throw new ProLinkerError('Opdracht niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    if (!isPlainObject(repository.assignmentResponses)) repository.assignmentResponses = {};
    if (!isPlainObject(repository.assignmentResponses[target])) {
      repository.assignmentResponses[target] = seedAssignmentResponses(session, assignment);
      writeRepository(session, repository);
    } else {
      var bucket = repository.assignmentResponses[target];
      if (bucket.seedVersion !== 2) {
        var fresh = seedAssignmentResponses(session, assignment);
        var previousItems = Array.isArray(bucket.items) ? bucket.items : [];
        fresh.items.forEach(function (item) {
          var previous = previousItems.find(function (entry) { return entry.id === item.id; });
          if (previous && previous.status) item.status = normalizeResponseStatus(previous.status);
        });
        repository.assignmentResponses[target] = fresh;
        writeRepository(session, repository);
      }
    }
    return normalizeAssignmentResponses(repository.assignmentResponses[target], session, assignment);
  }

  async function updateAssignmentResponseStatus(id, responseId, status, options) {
    options = options || {};
    var session = activeSession('client');
    var target = requiredId(id, 'Opdracht-id');
    var response = requiredId(responseId, 'Reactie-id');
    var next = String(status || '').trim().toLowerCase();
    if (['new', 'shortlisted', 'rejected'].indexOf(next) < 0) throw new ProLinkerError('Ongeldige reactiestatus.', { code: 'VALIDATION_ERROR' });
    if (configured.baseUrl) return normalizePayload(await request('assignmentResponse', { method: 'PATCH', params: { id: target, responseId: response }, body: { status: next }, signal: options.signal }));
    var repository = readRepository(session);
    var bucket = isPlainObject(repository.assignmentResponses) ? repository.assignmentResponses[target] : null;
    var items = bucket && Array.isArray(bucket.items) ? bucket.items : [];
    var item = items.find(function (entry) { return entry.id === response; });
    if (!item) throw new ProLinkerError('Reactie niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    item.status = next;
    writeRepository(session, repository);
    return normalizeAssignmentResponse(item, 0);
  }

  async function ensureConversation(input, options) {
    options = options || {};
    input = isPlainObject(input) ? input : {};
    var session = activeSession();
    var sender = String(input.sender || input.name || '').trim();
    if (!sender) throw new ProLinkerError('Een naam is verplicht om een gesprek te openen.', { code: 'VALIDATION_ERROR' });
    if (configured.baseUrl) {
      var threads = await listMessages({ signal: options.signal });
      var existing = threads.find(function (thread) { return thread.sender.toLowerCase() === sender.toLowerCase(); });
      return existing || null;
    }
    var repository = readRepository(session);
    var found = repository.messages.find(function (thread) { return String(thread.sender || '').toLowerCase() === sender.toLowerCase(); });
    if (found && ((!found.avatarUrl && input.avatarUrl) || (!found.assignmentId && input.assignmentId))) {
      if (!found.avatarUrl && input.avatarUrl) found.avatarUrl = safeHref(input.avatarUrl, '');
      if (!found.assignmentId && input.assignmentId) { found.assignmentId = String(input.assignmentId); found.assignmentTitle = String(input.assignmentTitle || found.assignmentTitle || ''); }
      writeRepository(session, repository);
    }
    if (!found) {
      found = {
        id: 'msg-' + hashString(accountId(session) + '|' + sender),
        sender: sender,
        avatarUrl: safeHref(input.avatarUrl, ''),
        assignmentId: String(input.assignmentId || ''),
        assignmentTitle: String(input.assignmentTitle || ''),
        subject: String(input.subject || 'Reactie op je opdracht').slice(0, 160),
        preview: String(input.preview || '').slice(0, 280),
        unread: false,
        archived: false,
        at: input.at || new Date().toISOString(),
        messages: input.preview ? [{ id: 'seed-' + hashString(sender + '|' + input.preview), sender: sender, direction: 'incoming', text: String(input.preview).slice(0, 2000), at: input.at || new Date().toISOString(), read: true, channel: String(input.channel || '').toLowerCase() === 'platform' ? 'platform' : 'whatsapp' }] : []
      };
      repository.messages.unshift(found);
      writeRepository(session, repository);
    }
    return normalizeThread(found, session);
  }

  function normalizeThread(item, session) {
    item = isPlainObject(item) ? item : {};
    var id = String(item.id || 'msg-' + hashString(item.subject || item.sender || 'message'));
    var sender = String(item.sender || 'ProLinker');
    var entries = (Array.isArray(item.messages) ? item.messages : []).map(function (entry, index) {
      entry = isPlainObject(entry) ? entry : {};
      var outgoing = entry.direction === 'outgoing';
      var at = entry.at || item.at || new Date().toISOString();
      var delivery = String(entry.deliveryStatus || entry.messageStatus || '').toLowerCase();
      if (['sent', 'delivered', 'read'].indexOf(delivery) < 0) {
        var ageMs = Date.now() - new Date(at).getTime();
        delivery = outgoing ? (Number.isFinite(ageMs) && ageMs > 3600000 ? 'read' : 'delivered') : '';
      }
      return {
        id: String(entry.id || id + '-' + (index + 1)),
        sender: String(entry.sender || (outgoing ? displayName(session) : sender)),
        direction: outgoing ? 'outgoing' : 'incoming',
        text: String(entry.text || ''),
        at: at,
        read: entry.read !== false,
        channel: String(entry.channel || '').toLowerCase() === 'platform' ? 'platform' : 'whatsapp',
        relayed: entry.relayed !== false,
        deliveryStatus: delivery
      };
    });
    entries.forEach(function (entry) { entry.sender = shortDisplayName(entry.sender); });
    return {
      id: id, sender: shortDisplayName(sender), subject: String(item.subject || 'Bericht'), preview: String(item.preview || (entries.length ? entries[entries.length - 1].text : '')),
      avatarUrl: safeHref(item.avatarUrl || item.avatar || item.senderAvatarUrl || item.pictureUrl, ''),
      assignmentId: String(item.assignmentId || item.projectId || ''),
      assignmentTitle: String(item.assignmentTitle || item.projectTitle || ''),
      unread: item.unread === true, archived: item.archived === true, at: item.at || (entries.length ? entries[entries.length - 1].at : new Date().toISOString()),
      href: item.href || ROUTES.messages + '?conversation=' + encodeURIComponent(id), messages: entries
    };
  }

  async function listMessages(options) {
    options = options || {};
    var session = activeSession();
    var archived = options.archived === true;
    if (configured.baseUrl) {
      var remote = normalizePayload(await request('messages', { query: Object.assign({}, options.query || {}, { archived: archived ? 1 : 0 }), signal: options.signal }));
      var remoteList = Array.isArray(remote) ? remote : (remote && Array.isArray(remote.threads) ? remote.threads : []);
      return remoteList.map(function (item) { return normalizeThread(item, session); });
    }
    return readRepository(session).messages.map(function (item) { return normalizeThread(item, session); }).filter(function (item) { return item.archived === archived; });
  }

  async function getMessage(id, options) {
    options = options || {};
    var session = activeSession();
    var target = String(id || '').trim();
    if (!target) throw new ProLinkerError('Bericht-id is verplicht.', { code: 'INVALID_ARGUMENT' });
    if (configured.baseUrl) return normalizeThread(await request('message', { params: { id: target }, signal: options.signal }), session);
    var item = readRepository(session).messages.find(function (thread) { return thread.id === target; });
    if (!item) throw new ProLinkerError('Gesprek niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    return normalizeThread(item, session);
  }

  async function sendMessage(conversationId, text, options) {
    options = options || {};
    var session = activeSession();
    var target = String(conversationId || '').trim();
    var body = String(text || '').trim();
    if (!target || !body || body.length > 4000) throw new ProLinkerError('Vul een bericht van maximaal 4000 tekens in.', { code: 'VALIDATION_ERROR' });
    var blocked = contactInfoMatches(body);
    if (blocked > 0) throw new ProLinkerError('Geblokkeerd door de ProLinker-agent: deel geen telefoonnummers, e-mailadressen of links in de chat. Alle communicatie loopt via ProLinker totdat de samenwerking start.', { code: 'CONTACT_BLOCKED', details: { matches: blocked } });
    if (configured.baseUrl) return normalizePayload(await request('messageSend', { method: 'POST', params: { id: target }, body: { text: body }, signal: options.signal }));
    var repository = readRepository(session);
    var index = repository.messages.findIndex(function (thread) { return thread.id === target; });
    if (index < 0) throw new ProLinkerError('Gesprek niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    var thread = repository.messages[index];
    if (!Array.isArray(thread.messages)) thread.messages = [];
    var entry = { id: target + '-reply-' + hashString(body + new Date().toISOString()), sender: displayName(session), direction: 'outgoing', text: body, at: new Date().toISOString(), read: true, channel: 'whatsapp', relayed: true, deliveryStatus: 'delivered' };
    thread.messages.push(entry);
    thread.preview = body;
    thread.at = entry.at;
    thread.unread = false;
    thread.archived = false;
    writeRepository(session, repository);
    return { message: Object.assign({}, entry), thread: normalizeThread(thread, session) };
  }

  async function markMessageRead(id, options) {
    options = options || {};
    var session = activeSession();
    var target = String(id || '').trim();
    if (!target) throw new ProLinkerError('Bericht-id is verplicht.', { code: 'INVALID_ARGUMENT' });
    if (configured.baseUrl) return normalizePayload(await request('messageRead', { method: 'POST', params: { id: target }, signal: options.signal }));
    var repository = readRepository(session);
    var thread = repository.messages.find(function (item) { return item.id === target; });
    if (!thread) throw new ProLinkerError('Gesprek niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    thread.unread = false;
    if (Array.isArray(thread.messages)) thread.messages.forEach(function (entry) { entry.read = true; });
    writeRepository(session, repository);
    return normalizeThread(thread, session);
  }

  async function setMessageArchive(id, archived, options) {
    options = options || {};
    var session = activeSession();
    var target = String(id || '').trim();
    if (!target) throw new ProLinkerError('Bericht-id is verplicht.', { code: 'INVALID_ARGUMENT' });
    var endpoint = archived ? 'messageArchive' : 'messageRestore';
    if (configured.baseUrl) return normalizePayload(await request(endpoint, { method: 'POST', params: { id: target }, signal: options.signal }));
    var repository = readRepository(session);
    var thread = repository.messages.find(function (item) { return item.id === target; });
    if (!thread) throw new ProLinkerError('Gesprek niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    thread.archived = archived;
    writeRepository(session, repository);
    return normalizeThread(thread, session);
  }

  async function getEarnings(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return normalizePayload(await request('earnings', { signal: options.signal }));
    return Object.assign({}, readRepository(session).earnings);
  }

  async function getSettings(options) {
    options = options || {};
    var session = activeSession();
    var defaults = {
      language: 'nl',
      notifications: { whatsapp: true, matches: true, messages: true, applicationUpdates: true, referralUpdates: true },
      privacy: { searchable: true, contactable: true, location: '', remotePreference: 'remote' }
    };
    var value = configured.baseUrl ? normalizePayload(await request('settings', { signal: options.signal })) : readRepository(session).settings;
    value = isPlainObject(value) ? value : {};
    return {
      language: typeof value.language === 'string' ? value.language : defaults.language,
      notifications: Object.assign({}, defaults.notifications, isPlainObject(value.notifications) ? value.notifications : {}),
      privacy: Object.assign({}, defaults.privacy, isPlainObject(value.privacy) ? value.privacy : {})
    };
  }

  async function updateSettings(input, options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return normalizePayload(await request('settings', { method: 'PATCH', body: input || {}, signal: options.signal }));
    var repository = readRepository(session);
    repository.settings = Object.assign({}, repository.settings, isPlainObject(input) ? input : {});
    writeRepository(session, repository);
    return JSON.parse(JSON.stringify(repository.settings));
  }

  function requiredId(value, label) {
    var id = String(value || '').trim();
    if (!id || id.length > 200) throw new ProLinkerError((label || 'Id') + ' is verplicht.', { code: 'INVALID_ARGUMENT' });
    return id;
  }

  function finiteNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeOpportunity(item, index) {
    item = isPlainObject(item) ? item : {};
    var title = String(item.title || item.name || item.role || 'Freelance opdracht').trim().slice(0, 240) || 'Freelance opdracht';
    var id = String(item.id || item.opportunityId || item.slug || 'opportunity-' + hashString(title + '|' + Number(index || 0))).trim();
    var companyValue = isPlainObject(item.company) ? (item.company.name || item.company.displayName) : item.company;
    var company = String(companyValue || item.clientName || item.organizationName || 'Opdrachtgever').trim().slice(0, 180) || 'Opdrachtgever';
    var locationObject = isPlainObject(item.location) ? item.location : {};
    var locationLabel = String(locationObject.label || locationObject.name || item.locationLabel || item.city || (typeof item.location === 'string' ? item.location : '') || '').trim();
    var workplace = String(item.workplace || item.workMode || item.locationType || '').toLowerCase();
    var remote = item.remote === true || locationObject.remote === true || workplace === 'remote' || /\bremote\b/i.test(locationLabel);
    var sourceValue = String(item.source || item.origin || 'external').trim().toLowerCase();
    var source = sourceValue === 'internal' || sourceValue === 'prolinker' ? 'internal' : (sourceValue === 'partner' ? 'partner' : 'external');
    var typeValue = String(item.opportunityType || item.type || item.workType || 'freelance').trim().toLowerCase();
    var opportunityType = typeValue === 'employment' || typeValue === 'job' || typeValue === 'loondienst' ? 'employment' : 'freelance';
    var relevance = finiteNumber(item.relevance, finiteNumber(item.matchScore, finiteNumber(item.match, 0)));
    relevance = Math.max(0, Math.min(100, Math.round(relevance)));
    var hoursObject = isPlainObject(item.hoursPerWeek) ? item.hoursPerWeek : {};
    var hoursMin = finiteNumber(item.hoursMin, finiteNumber(hoursObject.min, null));
    var hoursMax = finiteNumber(item.hoursMax, finiteNumber(hoursObject.max, hoursMin));
    var rateObject = isPlainObject(item.rate) ? item.rate : {};
    var rateLabel = String(item.rateLabel || rateObject.label || item.compensationLabel || (typeof item.rate === 'string' ? item.rate : '') || '').trim();
    var postedAt = item.postedAt || item.publishedAt || item.createdAt || null;
    var postedHoursAgo = finiteNumber(item.postedHoursAgo, null);
    if (postedHoursAgo === null && postedAt) {
      var postedTime = new Date(postedAt).getTime();
      if (Number.isFinite(postedTime)) postedHoursAgo = Math.max(0, Math.floor((Date.now() - postedTime) / 3600000));
    }
    var normalized = {
      id: id,
      title: title,
      summary: String(item.summary || item.subtitle || item.shortDescription || '').trim(),
      description: String(item.description || item.details || item.summary || '').trim(),
      company: company,
      source: source,
      opportunityType: opportunityType,
      relevance: relevance,
      remote: remote,
      locationLabel: locationLabel || (remote ? 'Remote' : ''),
      locationKey: String(locationObject.key || item.locationKey || '').trim(),
      country: String(locationObject.country || item.country || '').trim(),
      latitude: finiteNumber(locationObject.latitude, finiteNumber(locationObject.lat, finiteNumber(item.latitude, finiteNumber(item.lat, null)))),
      longitude: finiteNumber(locationObject.longitude, finiteNumber(locationObject.lng, finiteNumber(item.longitude, finiteNumber(item.lng, null)))),
      hoursMin: hoursMin,
      hoursMax: hoursMax,
      rateLabel: rateLabel,
      postedAt: postedAt,
      postedHoursAgo: postedHoursAgo,
      closesAt: item.closesAt || item.deadline || null,
      startAt: item.startAt || item.startDate || null,
      durationWeeks: finiteNumber(item.durationWeeks, null),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 24).map(String) : [],
      reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 12).map(String) : [],
      saved: item.saved === true,
      hidden: item.hidden === true,
      applicationStatus: item.applicationStatus ? String(item.applicationStatus) : ''
    };
    return normalized;
  }

  function collectionItems(data, keys) {
    if (Array.isArray(data)) return data;
    data = isPlainObject(data) ? data : {};
    for (var i = 0; i < keys.length; i += 1) if (Array.isArray(data[keys[i]])) return data[keys[i]];
    return [];
  }

  function normalizeOpportunityCollection(data) {
    var items = collectionItems(data, ['items', 'opportunities', 'results']).map(normalizeOpportunity).filter(function (item) { return !!item.id; });
    data = isPlainObject(data) ? data : {};
    return {
      items: items,
      total: Math.max(items.length, finiteNumber(data.total, finiteNumber(data.totalCount, items.length))),
      nextCursor: data.nextCursor || (data.pagination && data.pagination.nextCursor) || null
    };
  }

  async function listOpportunities(options) {
    options = options || {};
    if (!configured.baseUrl) return { items: [], total: 0, nextCursor: null };
    var query = Object.assign({}, isPlainObject(options.query) ? options.query : {});
    if (options.cursor !== undefined) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = options.limit;
    if (options.refresh) query.refresh = 1;
    return normalizeOpportunityCollection(await request('opportunitiesList', { query: query, signal: options.signal }));
  }

  async function getOpportunity(id, options) {
    options = options || {};
    var target = requiredId(id, 'Kans-id');
    if (!configured.baseUrl) throw new ProLinkerError('Kans niet gevonden in de lokale adapter.', { code: 'NOT_FOUND', status: 404 });
    var remote = await request('opportunityGet', { params: { id: target }, signal: options.signal });
    return normalizeOpportunity(remote, 0);
  }

  async function setOpportunityPreference(id, preference, input, options) {
    options = options || {};
    input = isPlainObject(input) ? input : {};
    if (!options.signal && input.signal) options.signal = input.signal;
    if (Object.prototype.hasOwnProperty.call(input, 'signal')) {
      input = Object.assign({}, input);
      delete input.signal;
    }
    var target = requiredId(id, 'Kans-id');
    var session = activeSession('freelancer');
    var endpoint = preference === 'saved' ? (input.value === false ? 'opportunityUnsave' : 'opportunitySave') : 'opportunityHide';
    var value = input.value !== false;
    if (configured.baseUrl) {
      var body = Object.assign({}, input, preference === 'saved' ? { saved: value } : { hidden: value });
      delete body.value;
      var requestBody = endpoint === 'opportunityUnsave' && configured.methods[endpoint] === 'DELETE' ? undefined : body;
      var result = await request(endpoint, { params: { id: target }, body: requestBody, signal: options.signal });
      return Object.assign({ ok: true, id: target }, preference === 'saved' ? { saved: value } : { hidden: value }, isPlainObject(result) ? result : {});
    }
    var repository = readRepository(session);
    var bucket = repository.opportunityPreferences[preference];
    if (value) bucket[target] = true;
    else delete bucket[target];
    writeRepository(session, repository);
    return Object.assign({ ok: true, id: target }, preference === 'saved' ? { saved: value } : { hidden: value });
  }

  function saveOpportunity(id, input, options) {
    return setOpportunityPreference(id, 'saved', Object.assign({}, isPlainObject(input) ? input : {}, { value: true }), options);
  }

  function unsaveOpportunity(id, options) {
    return setOpportunityPreference(id, 'saved', { value: false }, options);
  }

  function hideOpportunity(id, input, options) {
    return setOpportunityPreference(id, 'hidden', input, options);
  }

  function normalizeApplication(item, index) {
    item = isPlainObject(item) ? item : {};
    var opportunityId = String(item.opportunityId || (item.opportunity && item.opportunity.id) || '').trim();
    return {
      id: String(item.id || 'application-' + hashString(opportunityId + '|' + Number(index || 0))),
      opportunityId: opportunityId,
      status: String(item.status || 'submitted'),
      createdAt: item.createdAt || item.submittedAt || '',
      updatedAt: item.updatedAt || '',
      duplicate: item.duplicate === true
    };
  }

  function normalizeApplicationCollection(data) {
    var items = collectionItems(data, ['items', 'applications', 'results']).map(normalizeApplication);
    data = isPlainObject(data) ? data : {};
    return {
      items: items,
      total: Math.max(items.length, finiteNumber(data.total, finiteNumber(data.totalCount, items.length))),
      nextCursor: data.nextCursor || (data.pagination && data.pagination.nextCursor) || null
    };
  }

  function validIdempotencyKey(value) {
    var key = String(value || '').trim();
    if (!key) return '';
    if (key.length > 200 || !/^[A-Za-z0-9._~:+\/=\-]+$/.test(key)) throw new ProLinkerError('Ongeldige idempotency key.', { code: 'INVALID_ARGUMENT' });
    return key;
  }

  async function createApplication(input, options) {
    options = options || {};
    input = isPlainObject(input) ? Object.assign({}, input) : {};
    var session = activeSession('freelancer');
    var opportunityId = requiredId(input.opportunityId || (isPlainObject(input.opportunity) ? input.opportunity.id : input.opportunity), 'Kans-id');
    var idempotencyKey = validIdempotencyKey(options.idempotencyKey || input.idempotencyKey);
    delete input.idempotencyKey;
    input.opportunityId = opportunityId;
    if (!configured.baseUrl) {
      var repository = readRepository(session);
      var existing = repository.applications.find(function (item) { return item.opportunityId === opportunityId && item.status !== 'withdrawn'; });
      if (existing) return Object.assign({}, normalizeApplication(existing, 0), { duplicate: true });
      var local = normalizeApplication(Object.assign({}, input, {
        id: 'application-' + hashString(accountId(session) + '|' + opportunityId),
        status: input.status || 'submitted',
        createdAt: new Date().toISOString()
      }), repository.applications.length);
      repository.applications.unshift(local);
      writeRepository(session, repository);
      return Object.assign({ duplicate: false }, local);
    }
    var cacheKey = idempotencyKey ? configured.baseUrl + '|' + configured.endpoints.applicationsCreate + '|' + configured.methods.applicationsCreate + '|' + accountId(session) + '|' + idempotencyKey : '';
    var cached = cacheKey ? applicationRequestCache[cacheKey] : null;
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    if (cached) delete applicationRequestCache[cacheKey];
    var operation = request('applicationsCreate', {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: input,
      signal: options.signal
    }).then(function (data) { return normalizeApplication(Object.assign({}, input, isPlainObject(data) ? data : {}), 0); });
    if (cacheKey) {
      applicationRequestCache[cacheKey] = { promise: operation, expiresAt: Date.now() + 10 * 60 * 1000 };
      var keys = Object.keys(applicationRequestCache);
      keys.forEach(function (key) { if (applicationRequestCache[key].expiresAt <= Date.now()) delete applicationRequestCache[key]; });
      keys = Object.keys(applicationRequestCache);
      if (keys.length > 100) delete applicationRequestCache[keys[0]];
      operation.catch(function () {
        if (applicationRequestCache[cacheKey] && applicationRequestCache[cacheKey].promise === operation) delete applicationRequestCache[cacheKey];
      });
    }
    return operation;
  }

  async function listApplications(options) {
    options = options || {};
    var session = activeSession('freelancer');
    if (!configured.baseUrl) {
      var localItems = readRepository(session).applications.slice();
      if (options.opportunityId) localItems = localItems.filter(function (item) { return item.opportunityId === String(options.opportunityId); });
      if (options.status) localItems = localItems.filter(function (item) { return item.status === String(options.status); });
      var offset = Math.max(0, Math.floor(finiteNumber(options.cursor, 0)));
      var limit = Math.max(1, Math.min(250, Math.floor(finiteNumber(options.limit, localItems.length || 1))));
      var page = localItems.slice(offset, offset + limit);
      return { items: page.map(normalizeApplication), total: localItems.length, nextCursor: offset + limit < localItems.length ? String(offset + limit) : null };
    }
    var query = Object.assign({}, isPlainObject(options.query) ? options.query : {});
    if (options.cursor !== undefined) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = options.limit;
    if (options.opportunityId) query.opportunityId = options.opportunityId;
    return normalizeApplicationCollection(await request('applicationsList', { query: query, signal: options.signal }));
  }

  function normalizeFreelancer(item, session) {
    item = isPlainObject(item) ? item : {};
    var normalized = normalizeMember(item, session || { role: 'client' });
    return Object.assign({}, normalized, {
      verified: item.verified === true,
      match: Math.max(0, Math.min(100, finiteNumber(item.match, finiteNumber(item.relevance, 0)))),
      rate: item.rate !== undefined && item.rate !== null ? String(item.rate) : '',
      rating: Math.max(0, Math.min(5, finiteNumber(item.rating, finiteNumber(item.averageRating, 0)))),
      reviews: Math.max(0, Math.floor(finiteNumber(item.reviews, finiteNumber(item.reviewCount, 0)))),
      hours: Math.max(0, Math.floor(finiteNumber(item.hours, finiteNumber(item.hoursAvailable, 0)))),
      available: item.available !== false,
      availableFrom: String(item.availableFrom || ''),
      specialties: Array.isArray(item.specialties) ? item.specialties.slice(0, 12) : normalized.skills.slice()
    });
  }

  async function searchFreelancers(input, options) {
    options = options || {};
    var query = typeof input === 'string' ? { q: input } : Object.assign({}, isPlainObject(input) ? input : {});
    var session = getSession() || { role: 'client' };
    if (configured.baseUrl) {
      var remote = await request('freelancerSearch', { query: query, signal: options.signal });
      var items = collectionItems(remote, ['items', 'freelancers', 'results']).map(function (item) { return normalizeFreelancer(item, session); });
      remote = isPlainObject(remote) ? remote : {};
      return { items: items, total: Math.max(items.length, finiteNumber(remote.total, items.length)), nextCursor: remote.nextCursor || null };
    }
    if (!getSession()) return { items: [], total: 0, nextCursor: null };
    var repository = readRepository(session);
    var needle = String(query.q || query.query || '').trim().toLowerCase();
    var localItems = repository.network.members.map(function (item) { return normalizeFreelancer(item, session); });
    if (needle) localItems = localItems.filter(function (item) { return [item.name, item.headline, item.location].concat(item.skills || []).join(' ').toLowerCase().indexOf(needle) >= 0; });
    return { items: localItems, total: localItems.length, nextCursor: null };
  }

  function deriveJobTitle(input) {
    var text = String(input || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    var prefixes = ['ik ben op zoek naar', 'ik zoek naar', 'ik zoek', 'wij zoeken', 'we zoeken', 'gezocht:', 'gezocht', 'wie kan', "i'm looking for", 'i am looking for', 'looking for', 'i need', 'who can', 'i want'];
    var articles = ['een', 'de', 'het', 'a', 'an', 'my', 'mijn', 'onze', 'our'];
    var changed = true;
    while (changed) {
      changed = false;
      var lower = text.toLowerCase();
      for (var i = 0; i < prefixes.length; i += 1) {
        if (lower.indexOf(prefixes[i] + ' ') === 0) { text = text.slice(prefixes[i].length + 1); changed = true; break; }
      }
      lower = text.toLowerCase();
      for (var j = 0; j < articles.length; j += 1) {
        if (lower.indexOf(articles[j] + ' ') === 0) { text = text.slice(articles[j].length + 1); changed = true; break; }
      }
    }
    text = text.split(/[.!?\n]/)[0].replace(/[\s,;:-]+$/g, '').trim();
    if (!text) return '';
    if (text.length > 70) {
      text = text.slice(0, 70);
      var cut = text.lastIndexOf(' ');
      if (cut > 30) text = text.slice(0, cut);
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function normalizeProject(item, fallback) {
    item = isPlainObject(item) ? item : {};
    fallback = isPlainObject(fallback) ? fallback : {};
    var id = String(item.id || fallback.id || 'project-' + hashString((item.title || fallback.title || 'project') + '|' + (item.createdAt || fallback.createdAt || '')));
    return {
      id: id,
      title: String(item.title || fallback.title || 'Project'),
      status: String(item.status || fallback.status || 'draft'),
      createdAt: item.createdAt || fallback.createdAt || '',
      updatedAt: item.updatedAt || fallback.updatedAt || '',
      href: safeHref(item.href || fallback.href, ROUTES.assignments + '?assignment=' + encodeURIComponent(id))
    };
  }

  async function createProject(input, options) {
    options = options || {};
    input = isPlainObject(input) ? Object.assign({}, input) : {};
    var session = activeSession('client');
    var title = String(input.title || '').trim();
    if (!title) title = deriveJobTitle(input.query || input.description || input.summary || '');
    if (!title || title.length > 240) throw new ProLinkerError('Een projecttitel of omschrijving is verplicht.', { code: 'VALIDATION_ERROR' });
    input.title = title;
    if (configured.baseUrl) {
      var idempotencyKey = validIdempotencyKey(options.idempotencyKey || input.idempotencyKey);
      delete input.idempotencyKey;
      var result = await request('projectCreate', {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        body: input,
        signal: options.signal
      });
      return normalizeProject(result, input);
    }
    var repository = readRepository(session);
    var id = String(input.id || 'project-' + hashString(accountId(session) + '|' + title));
    var existing = repository.assignments.find(function (item) { return item.id === id; });
    if (existing) return Object.assign({ duplicate: true }, normalizeProject(existing));
    var project = Object.assign({}, input, { id: id, title: title, status: input.status || 'draft', archived: false, createdAt: new Date().toISOString(), href: ROUTES.assignments + '?assignment=' + encodeURIComponent(id) });
    repository.assignments.unshift(project);
    writeRepository(session, repository);
    return Object.assign({ duplicate: false }, normalizeProject(project));
  }

  async function inviteProjectProfessional(projectId, input, options) {
    options = options || {};
    input = isPlainObject(input) ? Object.assign({}, input) : {};
    var session = activeSession('client');
    var targetProject = requiredId(projectId, 'Project-id');
    var freelancerId = requiredId(input.freelancerId || input.professionalId, 'Professional-id');
    var payload = {
      freelancerId: freelancerId,
      message: String(input.message || '').trim().slice(0, 2000),
      channel: ['platform', 'email', 'whatsapp'].indexOf(input.channel) >= 0 ? input.channel : 'platform'
    };
    if (configured.baseUrl) {
      return normalizePayload(await request('projectInvite', {
        method: 'POST',
        params: { id: targetProject },
        body: payload,
        signal: options.signal
      }));
    }
    var repository = readRepository(session);
    var project = repository.assignments.find(function (item) { return item.id === targetProject; });
    if (!project) throw new ProLinkerError('Project niet gevonden.', { code: 'NOT_FOUND', status: 404 });
    project.invitations = Array.isArray(project.invitations) ? project.invitations : [];
    if (!project.invitations.some(function (item) { return item.freelancerId === freelancerId; })) {
      project.invitations.push({ freelancerId: freelancerId, status: 'invited', channel: payload.channel, createdAt: new Date().toISOString() });
      writeRepository(session, repository);
    }
    return { ok: true, projectId: targetProject, freelancerId: freelancerId, status: 'invited' };
  }

  function normalizeReferralSummary(data) {
    data = isPlainObject(data) ? data : {};
    var referrals = Array.isArray(data.referrals) ? data.referrals.slice(0, 250).map(function (item, index) {
      item = isPlainObject(item) ? item : {};
      return {
        id: String(item.id || 'referral-' + (index + 1)),
        status: String(item.status || 'pending'),
        createdAt: item.createdAt || '',
        convertedAt: item.convertedAt || '',
        rewardAmount: Math.max(0, finiteNumber(item.rewardAmount, finiteNumber(item.reward, 0)))
      };
    }) : [];
    return {
      currency: String(data.currency || 'EUR'),
      rewardRate: Math.max(0, finiteNumber(data.rewardRate, finiteNumber(data.referralRate, 0.02))),
      availableAmount: Math.max(0, finiteNumber(data.availableAmount, finiteNumber(data.available, 0))),
      pendingAmount: Math.max(0, finiteNumber(data.pendingAmount, finiteNumber(data.pending, 0))),
      paidAmount: Math.max(0, finiteNumber(data.paidAmount, finiteNumber(data.paid, 0))),
      totalEarned: Math.max(0, finiteNumber(data.totalEarned, finiteNumber(data.grossTotal, 0))),
      referredCount: Math.max(referrals.length, Math.floor(finiteNumber(data.referredCount, referrals.length))),
      convertedCount: Math.max(0, Math.floor(finiteNumber(data.convertedCount, referrals.filter(function (item) { return item.status === 'converted' || item.status === 'paid'; }).length))),
      shareUrl: safeHref(data.shareUrl || data.link, ''),
      referrals: referrals
    };
  }

  async function getReferralSummary(options) {
    options = options || {};
    var session = activeSession();
    if (configured.baseUrl) return normalizeReferralSummary(await request('referralSummary', { signal: options.signal }));
    return normalizeReferralSummary(readRepository(session).earnings);
  }

  function normalizeReferralEntityType(value) {
    var type = String(value || '').trim().toLowerCase();
    return ['project', 'opportunity', 'profile', 'general'].indexOf(type) >= 0 ? type : 'general';
  }

  function referralTargetUrl(value) {
    var fallback = '';
    try { fallback = new URL(global.location.href).href; } catch (error) {}
    var target = safeHref(value, fallback);
    try {
      var parsed = new URL(target, fallback || undefined);
      if (!/^https?:$/.test(parsed.protocol) && parsed.protocol !== 'file:') return fallback;
      ['ref', 'via', 'share'].forEach(function (key) { parsed.searchParams.delete(key); });
      return parsed.href;
    } catch (error) {
      return fallback;
    }
  }

  function localReferralLink(input, session) {
    var target = referralTargetUrl(input.targetUrl);
    var code = safeReferralCode(session.referralCode) || accountId(session).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    try {
      var parsed = new URL(target, global.location.href);
      parsed.searchParams.set('ref', code);
      parsed.searchParams.set('via', normalizeReferralEntityType(input.entityType));
      if (input.entityId) parsed.searchParams.set('share', String(input.entityId).slice(0, 120));
      return { url: parsed.href, shareId: 'preview-' + hashString(code + '|' + parsed.href), preview: true };
    } catch (error) {
      return { url: target, shareId: '', preview: true };
    }
  }

  async function createReferralLink(input, options) {
    options = options || {};
    input = isPlainObject(input) ? Object.assign({}, input) : {};
    var session = activeSession();
    var payload = {
      entityType: normalizeReferralEntityType(input.entityType),
      entityId: String(input.entityId || '').trim().slice(0, 160),
      targetUrl: referralTargetUrl(input.targetUrl),
      channel: String(input.channel || 'share-sheet').trim().toLowerCase().slice(0, 40),
      campaign: String(input.campaign || 'member-share').trim().slice(0, 80)
    };
    if (hasHttpOrigin()) {
      var remote = await platformRequest('referralLink', { method: 'POST', body: payload, signal: options.signal });
      remote = isPlainObject(remote) ? remote : {};
      var url = safeHref(remote.url || remote.shareUrl || remote.link, '');
      if (!url) throw new ProLinkerError('De deel-link kon niet worden aangemaakt.', { code: 'INVALID_RESPONSE' });
      return Object.assign({}, remote, payload, { url: url, preview: false });
    }
    return Object.assign(localReferralLink(payload, session), payload);
  }

  async function trackReferralEvent(input, options) {
    options = options || {};
    activeSession();
    input = isPlainObject(input) ? Object.assign({}, input) : {};
    var event = String(input.event || '').trim().toLowerCase();
    if (['share_opened', 'share_selected', 'link_copied'].indexOf(event) < 0) throw new ProLinkerError('Ongeldig referral-event.', { code: 'VALIDATION_ERROR' });
    if (!hasHttpOrigin()) return { ok: true, tracked: false, preview: true };
    return platformRequest('referralEvent', {
      method: 'POST',
      body: {
        event: event,
        shareId: String(input.shareId || '').trim().slice(0, 160),
        channel: String(input.channel || '').trim().toLowerCase().slice(0, 40)
      },
      signal: options.signal
    });
  }

  function referralShareUrls(link, title) {
    var url = safeHref(link, '');
    var text = String(title || 'Ken je iemand die hier goed bij past?').trim();
    return {
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url),
      whatsapp: 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url),
      email: 'mailto:?subject=' + encodeURIComponent(text) + '&body=' + encodeURIComponent(url)
    };
  }

  async function copyReferralLink(value) {
    var url = safeHref(value, '');
    if (!url) throw new ProLinkerError('Er is geen geldige deel-link.', { code: 'VALIDATION_ERROR' });
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      await global.navigator.clipboard.writeText(url);
      return true;
    }
    var input = global.document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    global.document.body.appendChild(input);
    input.select();
    var copied = global.document.execCommand('copy');
    input.remove();
    return copied;
  }

  function accountMenu(role) {
    var safeRole = role === 'client' ? 'client' : 'freelancer';
    var unreadMessages = 0;
    var profileIssues = 0;
    try {
      var session = activeSession();
      if (configured.baseUrl) {
        unreadMessages = Math.max(0, Number(session.unreadMessages || (session.notifications && session.notifications.unreadMessages)) || 0);
        profileIssues = Math.max(0, Number(session.profileIssues || (session.notifications && session.notifications.profileIssues)) || 0);
      } else {
        var repository = readRepository(session);
        unreadMessages = Array.isArray(repository.messages)
          ? repository.messages.filter(function (message) { return message && message.unread === true && message.archived !== true; }).length
          : 0;
      }
    } catch (error) {}
    var unreadText = unreadMessages > 99 ? '99+' : (unreadMessages > 0 ? String(unreadMessages) : '');
    var profileText = profileIssues > 99 ? '99+' : String(profileIssues);
    var items = [
      { key: 'dashboard', label: 'Mijn Dashboard', description: 'Overzicht en activiteit', href: ROUTES.dashboard, icon: '\u25a3', badgeText: '' },
      { key: 'network', label: 'Mijn Netwerk', description: 'Connecties en uitnodigingen', href: ROUTES.network, icon: '\u2723', badgeText: '' },
      { key: 'assignments', label: safeRole === 'client' ? 'Mijn Opdrachten' : 'Mijn Sollicitaties', description: safeRole === 'client' ? 'Plaatsingen en reacties' : 'Sollicitaties en samenwerkingen', href: ROUTES.assignments + '?role=' + safeRole, icon: '\u25a4', badgeText: '' },
      { key: 'messages', label: 'Mijn Berichten', description: 'Gesprekken en updates', href: ROUTES.messages, icon: '\u25b1', badgeText: unreadText },
      { key: 'profile', label: 'Mijn Profiel', description: safeRole === 'client' ? 'Account- en organisatieprofiel' : 'CV, expertise en portfolio', href: safeRole === 'client' ? ROUTES.clientProfile : ROUTES.freelancerProfile, icon: '\u25ce', badgeText: profileText },
      { key: 'earnings', label: 'Mijn Transacties', description: 'Betalingen, uitbetalingen en referrals', href: ROUTES.earnings, icon: '\u25cc', badgeText: '' },
      { key: 'settings', label: 'Instellingen', description: 'Account en meldingen', href: ROUTES.settings, icon: '\u2699', badgeText: '' }
    ];
    if (safeRole === 'client') items.splice(3, 0, { key: 'post', label: 'Opdracht plaatsen', description: 'Start een nieuwe opdracht met Instant Match', href: 'Prolinker Brief.dc.html', icon: '+', badgeText: '' });
    return items;
  }

  function enforceHeaderBranding() {
    if (!global.document || !global.document.querySelectorAll) return;
    var homeHeader = global.document.querySelector('header.plk-home-header');
    if (homeHeader) {
      Array.prototype.forEach.call(homeHeader.querySelectorAll('.plk-public-brand'), function (brand) {
        brand.style.setProperty('display', 'none', 'important');
        brand.setAttribute('aria-hidden', 'true');
        brand.setAttribute('tabindex', '-1');
      });
      var homeNav = homeHeader.querySelector('.plk-public-nav');
      if (homeNav) homeNav.style.setProperty('margin-left', 'auto', 'important');
      return;
    }
    var dark = global.document.documentElement && global.document.documentElement.getAttribute('data-theme') === 'dark';
    var source = dark ? 'assets/prolinker-mark-white.png' : 'assets/prolinker-mark.png';
    Array.prototype.forEach.call(global.document.querySelectorAll('header .plk-public-brand img'), function (image) {
      image.classList.add('plk-brand-mark');
      if (image.getAttribute('src') !== source) image.setAttribute('src', source);
      image.style.setProperty('width', '100px', 'important');
      image.style.setProperty('height', '100px', 'important');
      image.style.setProperty('min-width', '100px', 'important');
      image.style.setProperty('min-height', '100px', 'important');
      image.style.setProperty('object-fit', 'contain', 'important');
      image.style.setProperty('filter', 'none', 'important');
      image.style.setProperty('content', 'url("' + source + '")', 'important');
    });
  }

  function installHeaderBrandingGuard() {
    if (!global.document) return;
    var queued = false;
    var run = function () { queued = false; enforceHeaderBranding(); };
    var schedule = function () {
      if (queued) return;
      queued = true;
      if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(run);
      else global.setTimeout(run, 0);
    };
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', schedule, { once: true });
    else schedule();
    global.setTimeout(schedule, 80);
    global.setTimeout(schedule, 400);
    if (typeof MutationObserver === 'function' && global.document.documentElement) {
      var observer = new MutationObserver(schedule);
      observer.observe(global.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  var contracts = Object.freeze({
    session: '{ authenticated:true, channel:"whatsapp|linkedin|facebook", role:"client|freelancer", id?:string, contact?:string, providerSubject?:string, name?:string, email?:string, avatarUrl?:string, profile?:object }',
    linkedinProfileImport: '{ source:"linkedin", firstName, lastName, name, email?, pictureUrl?, locale?, importedFields[] }',
    dashboard: '{ role, user, metrics[], activity[], updatedAt }',
    network: '{ currentUser, members[], invitations[], outbound[], totals, updatedAt }',
    member: '{ id, name, initials, headline, location, availability, mutual, skills[], status, profileHref }',
    assignment: '{ id, title, status, archived, href, match?, responses?, company? }',
    assignmentResponses: '{ stats:{ sent, views, whatsapp, platform, bestMatch, bestMatchName }, items:assignmentResponse[], updatedAt }',
    assignmentResponse: '{ id, name, initials, headline, location, skills[], bio, focus, experience[], cvFile:cvDocument, rating, branche, hours, avatarUrl, match, channel:"whatsapp|platform", preview, respondedAt, status:"new|shortlisted|rejected", rateLabel, availability }',
    cvRedaction: '{ text, redactions, provider, preview } - alle cv-weergaven en -uploads horen door cv.redact te gaan zodat contactgegevens, volledige namen en externe links afgeschermd blijven',
    cvDocument: '{ id, fileName, size, uploadedAt, status:"approved|rejected|scanning", redactions, text } - alleen het door AI goedgekeurde, geanonimiseerde document wordt bewaard en getoond; het origineel verlaat de browser niet',
    messageThread: '{ id, sender, avatarUrl, assignmentId, assignmentTitle, subject, preview, unread, archived, at, href, messages[] } - sender is altijd de contactpersoon (voornaam + initiaal) met persoonlijke foto, nooit een bedrijfsnaam of logo',
    messageEntry: '{ id, sender, direction:"incoming|outgoing", text, at, read, channel:"whatsapp|platform", relayed, deliveryStatus:"sent|delivered|read" } - de agent bezorgt alles via WhatsApp; deliveryStatus komt uit WhatsApp status-webhooks (read alleen als de ontvanger leesbevestigingen aan heeft); contactgegevens worden geblokkeerd (CONTACT_BLOCKED)',
    settings: '{ language, notifications:{ whatsapp, matches, messages, applicationUpdates, referralUpdates }, privacy:{ searchable, contactable, location, remotePreference } }',
    opportunityList: '{ items:opportunity[], total, nextCursor }',
    opportunity: '{ id, title, summary, description, company, source, opportunityType, relevance, remote, locationLabel, locationKey, country, latitude, longitude, hoursMin, hoursMax, rateLabel, postedAt, postedHoursAgo, closesAt, startAt, durationWeeks, tags[], reasons[], saved, hidden, applicationStatus }',
    applicationList: '{ items:application[], total, nextCursor }',
    application: '{ id, opportunityId, status, createdAt }',
    freelancerList: '{ items:member[], total, nextCursor }',
    transactionList: '{ balance:{ currency, available, bonus, usdRate }, items:transaction[] }',
    transaction: '{ id, at, title, subtitle?, infoLabel?, infoHref?, type:"deposit|transfer_in|payout", status:"pending|processed|failed", amount, fee, vatRate, vat, total, direction:"in|out", payable }',
    referralSummary: '{ currency, rewardRate, availableAmount, pendingAmount, paidAmount, totalEarned, referredCount, convertedCount, shareUrl, referrals[] }',
    referralLink: '{ url, shareId, entityType:"project|opportunity|profile|general", entityId?, channel, campaign }'
  });

  global.ProLinkerApp = Object.freeze({
    version: VERSION,
    configure: configure,
    getConfig: getConfig,
    request: request,
    Error: ProLinkerError,
    contracts: contracts,
    routes: Object.freeze(Object.assign({}, ROUTES, { accountMenu: accountMenu })),
    session: Object.freeze({ get: getSession, require: requireSession, isValid: isValidSession, normalize: normalizeSession, cache: cacheSession, hydrate: hydrateSession, normalizeWhatsapp: normalizeWhatsapp, logout: logout }),
    auth: Object.freeze({
      whatsapp: Object.freeze({ start: startWhatsappVerification, verify: verifyWhatsappCode }),
      facebook: Object.freeze({ url: facebookAuthUrl, start: startFacebookAuth }),
      linkedin: Object.freeze({ url: linkedinAuthUrl, start: startLinkedInAuth, importProfile: importLinkedInProfile }),
      hydrate: hydrateSession,
      logout: logout
    }),
    dashboard: Object.freeze({ get: getDashboard, refresh: function (options) { return getDashboard(Object.assign({}, options || {}, { refresh: true })); } }),
    network: Object.freeze({ list: listNetwork, refresh: function (options) { return listNetwork(Object.assign({}, options || {}, { refresh: true })); }, accept: acceptInvitation, reject: rejectInvitation, remove: removeConnection, invite: inviteNetwork, whatsappLink: whatsappInviteLink }),
    profiles: Object.freeze({ get: getProfile, update: updateProfile }),
    assignments: Object.freeze({ list: listAssignments, get: getAssignment, updateStatus: updateAssignmentStatus, responses: listAssignmentResponses, updateResponseStatus: updateAssignmentResponseStatus }),
    messages: Object.freeze({ list: listMessages, get: getMessage, send: sendMessage, markRead: markMessageRead, ensure: ensureConversation, archive: function (id, options) { return setMessageArchive(id, true, options); }, restore: function (id, options) { return setMessageArchive(id, false, options); } }),
    earnings: Object.freeze({ get: getEarnings, transactions: listTransactions }),
    settings: Object.freeze({ get: getSettings, update: updateSettings }),
    opportunities: Object.freeze({ list: listOpportunities, get: getOpportunity, save: saveOpportunity, unsave: unsaveOpportunity, hide: hideOpportunity }),
    applications: Object.freeze({ create: createApplication, list: listApplications }),
    freelancers: Object.freeze({ search: searchFreelancers }),
    projects: Object.freeze({ create: createProject, invite: inviteProjectProfessional, deriveTitle: deriveJobTitle }),
    cv: Object.freeze({ redact: redactCv, upload: uploadCvDocument, get: getCvDocument, open: openCvDocument, viewerHtml: cvDocumentHtml }),
    referrals: Object.freeze({ getSummary: getReferralSummary, createLink: createReferralLink, track: trackReferralEvent, shareUrls: referralShareUrls, copy: copyReferralLink })
  });
  installHeaderBrandingGuard();
})(window);
