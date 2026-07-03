import type {
  AuthorizationResolveResult,
  AuthorizationTarget,
  NormalizedSecuritySchemeMeta,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  OpenApiServerObject,
  RequestEmulatorPreparedRequest,
} from '../types'

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

const FORBIDDEN_BROWSER_REQUEST_HEADERS = new Set([
  'cookie',
  'cookie2',
])

export function findForbiddenBrowserRequestHeaders(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter(name => FORBIDDEN_BROWSER_REQUEST_HEADERS.has(name.toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
}

export function stripForbiddenBrowserRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  Object.entries(headers).forEach(([name, value]) => {
    if (FORBIDDEN_BROWSER_REQUEST_HEADERS.has(name.toLowerCase())) {
      return
    }

    next[name] = value
  })

  return next
}

export function interpolatePathParams(pathTemplate: string, values: Record<string, string>): {
  path: string
  missing: string[]
} {
  const missing: string[] = []

  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
    const rawValue = values[paramName] ?? ''
    if (!rawValue.trim()) {
      missing.push(paramName)
      return `{${paramName}}`
    }

    return encodeURIComponent(rawValue.trim())
  })

  return { path, missing }
}

export function serializeQueryParams(values: Record<string, string | string[]>): string {
  const query = new URLSearchParams()

  Object.entries(values).forEach(([key, value]) => {
    const valuesList = Array.isArray(value) ? value : [value]
    valuesList.forEach((entry) => {
      const normalized = entry.trim()
      if (!normalized) {
        return
      }

      query.append(key, normalized)
    })
  })

  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export function buildRequestUrl(baseApiUrl: string, endpointPath: string, query: string): string {
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
  const normalizedBase = baseApiUrl.trim().replace(/\/+$/, '')
  const absoluteOrProtocolRelative = /^https?:\/\//i.test(endpointPath) || endpointPath.startsWith('//')

  if (absoluteOrProtocolRelative) {
    return `${endpointPath}${query}`
  }

  if (!normalizedBase) {
    return `${normalizedPath}${query}`
  }

  return `${normalizedBase}${normalizedPath}${query}`
}

export function resolveOpenApiServerUrl(server: OpenApiServerObject | null | undefined): string {
  if (!server || typeof server.url !== 'string') {
    return ''
  }

  const template = server.url.trim()
  if (!template) {
    return ''
  }

  const variables = server.variables ?? {}
  return template.replace(/\{([^}]+)\}/g, (_match, variableName: string) => {
    const candidate = variables[variableName]
    if (!candidate || typeof candidate !== 'object') {
      return ''
    }

    const defaultValue = typeof candidate.default === 'string' ? candidate.default.trim() : ''
    if (defaultValue) {
      return defaultValue
    }

    if (!Array.isArray(candidate.enum)) {
      return ''
    }

    const firstEnum = candidate.enum.find(value => typeof value === 'string' && value.trim() !== '')
    return firstEnum ? firstEnum.trim() : ''
  }).trim()
}

export function resolveServerUrlForDisplay(serverUrl: string, schemaSource: string): string {
  const normalizedServerUrl = serverUrl.trim()
  if (!normalizedServerUrl) {
    return ''
  }

  if (typeof window === 'undefined') {
    return normalizedServerUrl
  }

  const normalizedSchemaSource = schemaSource.trim()
  const fallbackBase = window.location.href

  try {
    const schemaUrl = normalizedSchemaSource
      ? new URL(normalizedSchemaSource, fallbackBase)
      : new URL(fallbackBase)
    return new URL(normalizedServerUrl, schemaUrl).toString()
  } catch {
    return normalizedServerUrl
  }
}

function createEmptyAuthorizationTarget(): AuthorizationTarget {
  return {
    headers: {},
    query: {},
    cookies: {},
  }
}

function pushWarning(target: string[], message: string) {
  if (!target.includes(message)) {
    target.push(message)
  }
}

function encodeBasicCredentials(raw: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(raw)
  }

  console.warn('[requestEmulatorUtils] btoa is unavailable; HTTP Basic token is passed without base64 encoding')
  return raw
}

function isAuthorizationHeader(headerName: string): boolean {
  return headerName.trim().toLowerCase() === 'authorization'
}

function hasAuthorizationScheme(credential: string): boolean {
  return /^[a-z][\w!#$%&'*+.^`|~-]*\s+\S/i.test(credential.trim())
}

function bearerAuthorizationValue(credential: string): string {
  const normalized = credential.trim()

  return hasAuthorizationScheme(normalized) ? normalized : `Bearer ${normalized}`
}

function apiKeyHeaderValue(headerName: string, credential: string): string {
  if (!isAuthorizationHeader(headerName)) {
    return credential
  }

  return bearerAuthorizationValue(credential)
}

export function normalizeSecuritySchemeMeta(
  key: string,
  securityScheme: OpenApiSecurityScheme | undefined,
): NormalizedSecuritySchemeMeta {
  if (!securityScheme) {
    return {
      key,
      type: 'unknown',
      kind: 'unsupported',
      supported: false,
      label: key,
      description: 'Security scheme is not defined in components.securitySchemes.',
      headerName: null,
      queryName: null,
      cookieName: null,
    }
  }

  if (securityScheme.type === 'http') {
    const scheme = securityScheme.scheme?.toLowerCase()
    if (scheme === 'bearer') {
      return {
        key,
        type: securityScheme.type,
        kind: 'http-bearer',
        supported: true,
        label: `${key} (http bearer)`,
        description: securityScheme.description ?? 'HTTP Bearer token via Authorization header.',
        headerName: 'Authorization',
        queryName: null,
        cookieName: null,
      }
    }

    if (scheme === 'basic') {
      return {
        key,
        type: securityScheme.type,
        kind: 'http-basic',
        supported: true,
        label: `${key} (http basic)`,
        description: securityScheme.description ?? 'HTTP Basic credentials in Authorization header.',
        headerName: 'Authorization',
        queryName: null,
        cookieName: null,
      }
    }

    return {
      key,
      type: securityScheme.type,
      kind: 'unsupported',
      supported: false,
      label: `${key} (http ${scheme ?? 'unknown'})`,
      description: securityScheme.description ?? 'Unsupported HTTP security scheme.',
      headerName: null,
      queryName: null,
      cookieName: null,
    }
  }

  if (securityScheme.type === 'apiKey') {
    if (securityScheme.in === 'header' && securityScheme.name) {
      return {
        key,
        type: securityScheme.type,
        kind: 'api-key-header',
        supported: true,
        label: `${key} (api key header)`,
        description: securityScheme.description ?? 'API key sent via header.',
        headerName: securityScheme.name,
        queryName: null,
        cookieName: null,
      }
    }

    if (securityScheme.in === 'query' && securityScheme.name) {
      return {
        key,
        type: securityScheme.type,
        kind: 'api-key-query',
        supported: true,
        label: `${key} (api key query)`,
        description: securityScheme.description ?? 'API key sent via query string.',
        headerName: null,
        queryName: securityScheme.name,
        cookieName: null,
      }
    }

    if (securityScheme.in === 'cookie' && securityScheme.name) {
      return {
        key,
        type: securityScheme.type,
        kind: 'api-key-cookie',
        supported: true,
        label: `${key} (api key cookie)`,
        description: securityScheme.description ?? 'API key sent via cookie.',
        headerName: null,
        queryName: null,
        cookieName: securityScheme.name,
      }
    }

    return {
      key,
      type: securityScheme.type,
      kind: 'unsupported',
      supported: false,
      label: `${key} (api key)`,
      description: securityScheme.description ?? 'Unsupported apiKey location or missing name.',
      headerName: null,
      queryName: null,
      cookieName: null,
    }
  }

  if (securityScheme.type === 'oauth2') {
    return {
      key,
      type: securityScheme.type,
      kind: 'oauth2-bearer',
      supported: true,
      label: `${key} (oauth2 bearer)`,
      description: securityScheme.description ?? 'OAuth2 token sent as Bearer Authorization.',
      headerName: 'Authorization',
      queryName: null,
      cookieName: null,
    }
  }

  if (securityScheme.type === 'openIdConnect') {
    return {
      key,
      type: securityScheme.type,
      kind: 'openid-connect-bearer',
      supported: true,
      label: `${key} (openIdConnect bearer)`,
      description: securityScheme.description ?? 'OpenID Connect token sent as Bearer Authorization.',
      headerName: 'Authorization',
      queryName: null,
      cookieName: null,
    }
  }

  return {
    key,
    type: securityScheme.type,
    kind: 'unsupported',
    supported: false,
    label: `${key} (${securityScheme.type})`,
    description: securityScheme.description ?? 'Unsupported security scheme type.',
    headerName: null,
    queryName: null,
    cookieName: null,
  }
}

export function buildSecuritySchemeMetaMap(
  securitySchemes: Record<string, OpenApiSecurityScheme> | undefined,
): Record<string, NormalizedSecuritySchemeMeta> {
  const next: Record<string, NormalizedSecuritySchemeMeta> = {}
  Object.entries(securitySchemes ?? {}).forEach(([key, scheme]) => {
    next[key] = normalizeSecuritySchemeMeta(key, scheme)
  })
  return next
}

function applyCredentialForScheme(
  target: AuthorizationTarget,
  meta: NormalizedSecuritySchemeMeta,
  credential: string,
  warnings: string[],
) {
  switch (meta.kind) {
    case 'http-bearer':
    case 'oauth2-bearer':
    case 'openid-connect-bearer':
      target.headers.Authorization = bearerAuthorizationValue(credential)
      return
    case 'http-basic':
      target.headers.Authorization = `Basic ${encodeBasicCredentials(credential)}`
      return
    case 'api-key-header':
      if (meta.headerName) {
        target.headers[meta.headerName] = apiKeyHeaderValue(meta.headerName, credential)
      }
      return
    case 'api-key-query':
      if (meta.queryName) {
        target.query[meta.queryName] = credential
      }
      return
    case 'api-key-cookie':
      if (meta.cookieName) {
        target.cookies[meta.cookieName] = credential
      }
      return
    default:
      pushWarning(warnings, `Unsupported security scheme for "${meta.key}"`)
  }
}

function evaluateSecurityRequirement(
  requirement: OpenApiSecurityRequirement,
  schemeMetaMap: Record<string, NormalizedSecuritySchemeMeta>,
  credentials: Record<string, string>,
): AuthorizationResolveResult {
  const target = createEmptyAuthorizationTarget()
  const missingKeys: string[] = []
  const warnings: string[] = []
  const appliedKeys: string[] = []

  const schemeKeys = Object.keys(requirement)
  if (schemeKeys.length === 0) {
    return {
      target,
      appliedKeys,
      missingKeys,
      warnings,
      hasSatisfiedRequirement: true,
    }
  }

  schemeKeys.forEach((key) => {
    const meta = schemeMetaMap[key]
    if (!meta) {
      missingKeys.push(key)
      pushWarning(warnings, `Security scheme "${key}" is not defined in OpenAPI components`)
      return
    }

    if (!meta.supported) {
      missingKeys.push(key)
      pushWarning(warnings, `Security scheme "${key}" is not supported in request emulator`)
      return
    }

    const credential = (credentials[key] ?? '').trim()
    if (!credential) {
      missingKeys.push(key)
      return
    }

    applyCredentialForScheme(target, meta, credential, warnings)
    appliedKeys.push(key)
  })

  return {
    target,
    appliedKeys,
    missingKeys,
    warnings,
    hasSatisfiedRequirement: missingKeys.length === 0,
  }
}

export function resolveRequestAuthorization(options: {
  securityRequirements: OpenApiSecurityRequirement[] | undefined
  securitySchemes: Record<string, OpenApiSecurityScheme> | undefined
  credentials: Record<string, string>
}): AuthorizationResolveResult {
  const requirements = options.securityRequirements ?? []
  const schemeMetaMap = buildSecuritySchemeMetaMap(options.securitySchemes)

  if (requirements.length === 0) {
    return {
      target: createEmptyAuthorizationTarget(),
      appliedKeys: [],
      missingKeys: [],
      warnings: [],
      hasSatisfiedRequirement: true,
    }
  }

  let bestCandidate: AuthorizationResolveResult | null = null

  requirements.forEach((requirement) => {
    const candidate = evaluateSecurityRequirement(requirement, schemeMetaMap, options.credentials)
    if (candidate.hasSatisfiedRequirement) {
      bestCandidate = candidate
      return
    }

    if (!bestCandidate || candidate.appliedKeys.length > bestCandidate.appliedKeys.length) {
      bestCandidate = candidate
    }
  })

  if (bestCandidate) {
    return bestCandidate
  }

  return {
    target: createEmptyAuthorizationTarget(),
    appliedKeys: [],
    missingKeys: [],
    warnings: [],
    hasSatisfiedRequirement: false,
  }
}

export function buildCurlCommand(prepared: RequestEmulatorPreparedRequest): string {
  const parts = ['curl', '-X', prepared.method.toUpperCase(), shellEscape(prepared.url)]

  Object.entries(prepared.headers).forEach(([key, value]) => {
    parts.push('-H', shellEscape(`${key}: ${value}`))
  })

  if (prepared.bodyText !== null && prepared.bodyText.trim() !== '') {
    parts.push('--data-raw', shellEscape(prepared.bodyText))
  }

  return parts.join(' ')
}
