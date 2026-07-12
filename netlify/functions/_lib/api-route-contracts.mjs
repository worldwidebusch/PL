const ANY_ACCOUNT = Object.freeze(['client', 'freelancer']);
const CLIENT_ONLY = Object.freeze(['client']);
const FREELANCER_ONLY = Object.freeze(['freelancer']);

const COMMON_LIST_QUERY = Object.freeze([
  'cursor', 'limit', 'q', 'query', 'refresh', 'sort', 'status'
]);

function operation(name, options = {}) {
  return Object.freeze({
    operation: name,
    auth: options.auth === 'optional' ? 'optional' : 'required',
    roles: Object.freeze((options.roles || ANY_ACCOUNT).slice()),
    bodyMaxBytes: Number(options.bodyMaxBytes) || 0,
    bodyFields: Object.freeze((options.bodyFields || []).slice()),
    queryFields: Object.freeze((options.queryFields || []).slice())
  });
}

function route(pattern, parameterNames, methods) {
  return Object.freeze({
    pattern,
    parameterNames: Object.freeze(parameterNames.slice()),
    methods: Object.freeze(methods)
  });
}

export const API_ROUTE_CONTRACTS = Object.freeze([
  route(/^\/api\/v1\/dashboard$/, [], {
    GET: operation('getDashboard', { queryFields: ['role', 'refresh'] })
  }),
  route(/^\/api\/v1\/network$/, [], {
    GET: operation('listNetwork', { queryFields: ['q', 'query', 'refresh'] })
  }),
  route(/^\/api\/v1\/network\/invitations$/, [], {
    POST: operation('createNetworkInvitation', {
      bodyMaxBytes: 8192,
      bodyFields: ['name', 'phone', 'channel']
    })
  }),
  route(/^\/api\/v1\/network\/invitations\/([^/]+)\/accept$/, ['id'], {
    POST: operation('acceptNetworkInvitation', { bodyMaxBytes: 2048 })
  }),
  route(/^\/api\/v1\/network\/invitations\/([^/]+)\/reject$/, ['id'], {
    POST: operation('rejectNetworkInvitation', { bodyMaxBytes: 2048 })
  }),
  route(/^\/api\/v1\/network\/connections\/([^/]+)$/, ['id'], {
    DELETE: operation('deleteNetworkConnection')
  }),
  route(/^\/api\/v1\/profiles\/([^/]+)$/, ['id'], {
    GET: operation('getProfile'),
    PATCH: operation('updateProfile', {
      bodyMaxBytes: 65536,
      bodyFields: [
        'name', 'firstName', 'lastName', 'email', 'companyName',
        'category', 'locale', 'avatarUrl', 'headline', 'rate',
        'availability', 'skills', 'bio', 'portfolio', 'cvMeta'
      ]
    })
  }),
  route(/^\/api\/v1\/assignments$/, [], {
    GET: operation('listAssignments', {
      queryFields: COMMON_LIST_QUERY.concat(['archived', 'role', 'opportunityId'])
    })
  }),
  route(/^\/api\/v1\/assignments\/([^/]+)$/, ['id'], {
    GET: operation('getAssignment'),
    PATCH: operation('updateAssignment', {
      bodyMaxBytes: 4096,
      bodyFields: ['status']
    })
  }),
  route(/^\/api\/v1\/messages$/, [], {
    GET: operation('listMessages', {
      queryFields: COMMON_LIST_QUERY.concat(['archived'])
    })
  }),
  route(/^\/api\/v1\/messages\/([^/]+)\/replies$/, ['id'], {
    POST: operation('createMessageReply', {
      bodyMaxBytes: 8192,
      bodyFields: ['text']
    })
  }),
  route(/^\/api\/v1\/messages\/([^/]+)\/read$/, ['id'], {
    POST: operation('markMessageRead', { bodyMaxBytes: 2048 })
  }),
  route(/^\/api\/v1\/messages\/([^/]+)\/archive$/, ['id'], {
    POST: operation('archiveMessage', { bodyMaxBytes: 2048 })
  }),
  route(/^\/api\/v1\/messages\/([^/]+)\/restore$/, ['id'], {
    POST: operation('restoreMessage', { bodyMaxBytes: 2048 })
  }),
  route(/^\/api\/v1\/messages\/([^/]+)$/, ['id'], {
    GET: operation('getMessage')
  }),
  route(/^\/api\/v1\/earnings$/, [], {
    GET: operation('getEarnings')
  }),
  route(/^\/api\/v1\/settings$/, [], {
    GET: operation('getSettings'),
    PATCH: operation('updateSettings', {
      bodyMaxBytes: 32768,
      bodyFields: ['language', 'notifications', 'privacy']
    })
  }),
  route(/^\/api\/v1\/opportunities$/, [], {
    GET: operation('listOpportunities', {
      auth: 'optional',
      queryFields: COMMON_LIST_QUERY.concat([
        'opportunityType', 'source', 'relevanceMin', 'matchMin', 'remote',
        'locationKey', 'country', 'latitude', 'longitude', 'lat', 'lng',
        'radiusKm', 'hoursMin', 'hoursMax', 'postedWithin', 'postedSince',
        'start', 'startAt', 'saved', 'hidden', 'tags'
      ])
    })
  }),
  route(/^\/api\/v1\/opportunities\/([^/]+)\/saved$/, ['id'], {
    PUT: operation('saveOpportunity', {
      roles: FREELANCER_ONLY,
      bodyMaxBytes: 4096,
      bodyFields: ['saved']
    }),
    DELETE: operation('unsaveOpportunity', { roles: FREELANCER_ONLY })
  }),
  route(/^\/api\/v1\/opportunities\/([^/]+)\/hidden$/, ['id'], {
    PUT: operation('setOpportunityHidden', {
      roles: FREELANCER_ONLY,
      bodyMaxBytes: 8192,
      bodyFields: ['hidden', 'reason']
    })
  }),
  route(/^\/api\/v1\/opportunities\/([^/]+)$/, ['id'], {
    GET: operation('getOpportunity', { auth: 'optional' })
  }),
  route(/^\/api\/v1\/applications$/, [], {
    GET: operation('listApplications', {
      roles: FREELANCER_ONLY,
      queryFields: COMMON_LIST_QUERY.concat(['opportunityId'])
    }),
    POST: operation('createApplication', {
      roles: FREELANCER_ONLY,
      bodyMaxBytes: 16384,
      bodyFields: [
        'opportunityId', 'source', 'route', 'automated', 'status',
        'motivation'
      ]
    })
  }),
  route(/^\/api\/v1\/freelancers$/, [], {
    GET: operation('searchFreelancers', {
      auth: 'optional',
      queryFields: COMMON_LIST_QUERY.concat([
        'skills', 'category', 'location', 'locationKey', 'remote',
        'hoursMin', 'hoursMax', 'rateMin', 'rateMax', 'matchMin', 'projectId'
      ])
    })
  }),
  route(/^\/api\/v1\/projects$/, [], {
    POST: operation('createProject', {
      roles: CLIENT_ONLY,
      bodyMaxBytes: 65536,
      bodyFields: [
        'id', 'title', 'description', 'summary', 'categoryId',
        'subcategoryId', 'skills', 'budgetMode', 'budgetType', 'budgetMin',
        'budgetMax', 'currency', 'hours', 'hoursMin', 'hoursMax',
        'workMode', 'remote', 'location', 'locationId', 'locationKey',
        'locationVerified', 'latitude', 'longitude', 'country', 'startAt',
        'endAt', 'startDate', 'durationWeeks', 'status', 'brief', 'query'
      ]
    })
  }),
  route(/^\/api\/v1\/projects\/([^/]+)\/invitations$/, ['id'], {
    POST: operation('inviteProjectProfessional', {
      roles: CLIENT_ONLY,
      bodyMaxBytes: 8192,
      bodyFields: ['freelancerId', 'message', 'channel']
    })
  }),
  route(/^\/api\/v1\/referrals\/summary$/, [], {
    GET: operation('getReferralSummary')
  })
]);

function cleanPathParameter(value) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(value || '')); }
  catch (error) { throw Object.assign(new Error('Invalid path parameter.'), { code: 'INVALID_PATH', status: 400 }); }
  if (!decoded || decoded.length > 200 || /[\u0000-\u001f\u007f\\/?#]/.test(decoded)) {
    throw Object.assign(new Error('Invalid path parameter.'), { code: 'INVALID_PATH', status: 400 });
  }
  return decoded;
}

export function normalizeApiPath(event) {
  let value = event && event.path ? String(event.path) : '';
  if (!value && event && event.rawUrl) {
    try { value = new URL(String(event.rawUrl)).pathname; }
    catch (error) { value = ''; }
  }
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) {
    throw Object.assign(new Error('Invalid request path.'), { code: 'INVALID_PATH', status: 400 });
  }
  const gatewayPrefix = '/.netlify/functions/api-gateway';
  if (value === gatewayPrefix) {
    const rewritten = event && event.queryStringParameters ? String(event.queryStringParameters.path || '') : '';
    if (rewritten) value = rewritten.startsWith('api/v1/') ? '/' + rewritten : '/api/v1/' + rewritten.replace(/^\/+/, '');
    else value = '/api/v1';
  }
  else if (value.startsWith(gatewayPrefix + '/')) {
    const suffix = value.slice(gatewayPrefix.length);
    value = suffix.startsWith('/api/v1/') ? suffix : '/api/v1' + suffix;
  }
  if (value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) {
    throw Object.assign(new Error('Invalid request path.'), { code: 'INVALID_PATH', status: 400 });
  }
  if (value.length > 1) value = value.replace(/\/+$/, '');
  return value;
}

export function resolveApiRoute(method, path) {
  const verb = String(method || '').toUpperCase();
  for (const definition of API_ROUTE_CONTRACTS) {
    const matched = definition.pattern.exec(path);
    if (!matched) continue;
    const allowed = Object.keys(definition.methods);
    const contract = definition.methods[verb] || null;
    const params = {};
    definition.parameterNames.forEach((name, index) => {
      params[name] = cleanPathParameter(matched[index + 1]);
    });
    return { contract, params, allowed };
  }
  return null;
}
