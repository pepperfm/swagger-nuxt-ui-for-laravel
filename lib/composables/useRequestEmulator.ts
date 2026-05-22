import type { ComputedRef, Ref } from 'vue'
import type {
  AuthorizationResolveResult,
  EndpointSelection,
  HttpMethod,
  IMethod,
  IParameter,
  OpenApiComponents,
  OpenApiParameterLocation,
  OpenApiSchemaObject,
  RequestBodyEditorMode,
  RequestBodyFormInput,
  RequestBodyFormValueMap,
  RequestEmulatorExecutionState,
  RequestEmulatorParamInput,
  RequestEmulatorPreparedRequest,
  RequestEmulatorValidationError,
} from '../types'
import { computed, ref, watch } from 'vue'
import {
  buildRequestBodyFromFormValues,
  createInitialRequestBodyFormValues,
  hydrateRequestBodyFormValues,
} from './requestBodyFormState'
import { resolveRequestBodyFormInputs } from './requestBodyInputResolver'
import { resolveRequestBodySchemaForPathValues } from './requestBodySchemaResolver'
import {
  buildCurlCommand,
  buildRequestUrl,
  findForbiddenBrowserRequestHeaders,
  interpolatePathParams,
  serializeQueryParams,
  stripForbiddenBrowserRequestHeaders,
} from './requestEmulatorUtils'
import {
  resolveInitialParameterValue,
  resolveParameterInputSpec,
  serializeParameterValue,
} from './requestParameterInputResolver'
import { generateExampleFromSchema } from './schemaExample'

interface UseRequestEmulatorOptions {
  endpoint: Ref<EndpointSelection | null>
  method: ComputedRef<IMethod | undefined>
  parameters: ComputedRef<IParameter[]>
  components: ComputedRef<OpenApiComponents>
  authorization: ComputedRef<AuthorizationResolveResult | null>
  baseApiUrl: ComputedRef<string>
  requestTimeoutMs?: number
}

function isSupportedParamLocation(value: string): value is OpenApiParameterLocation {
  return value === 'path' || value === 'query' || value === 'header' || value === 'cookie'
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readRequestBodyContent(method: IMethod | undefined): {
  contentType: string | null
  schema: OpenApiSchemaObject | undefined
  example: unknown
  required: boolean
} {
  const required = Boolean(method?.requestBody?.required)
  const content = method?.requestBody?.content

  if (!content) {
    return {
      contentType: null,
      schema: undefined,
      example: undefined,
      required,
    }
  }

  const preferred = content['application/json']
    ?? content['multipart/form-data']
    ?? content['application/x-www-form-urlencoded']

  if (preferred) {
    const contentType = Object.entries(content).find(([, config]) => config === preferred)?.[0] ?? null
    return {
      contentType,
      schema: preferred.schema,
      example: preferred.example ?? preferred.schema?.example,
      required,
    }
  }

  const first = Object.entries(content)[0]
  if (!first) {
    return {
      contentType: null,
      schema: undefined,
      example: undefined,
      required,
    }
  }

  return {
    contentType: first[0],
    schema: first[1]?.schema,
    example: first[1]?.example ?? first[1]?.schema?.example,
    required,
  }
}

function createParamInput(param: IParameter): RequestEmulatorParamInput | null {
  const location = param.in
  if (!isSupportedParamLocation(location)) {
    return null
  }

  const spec = resolveParameterInputSpec(param, location)
  const seed = param.schema?.default ?? param.schema?.example
  return {
    key: `${location}:${param.name}`,
    name: param.name,
    in: location,
    required: Boolean(param.required),
    type: spec.valueKind,
    description: param.description ?? '',
    value: resolveInitialParameterValue(spec, seed),
    spec,
  }
}

function buildCookieHeader(inputs: RequestEmulatorParamInput[]): string | null {
  const pairs: Array<[string, string]> = []
  inputs
    .filter(input => input.in === 'cookie')
    .forEach((input) => {
      const serialized = serializeParameterValue(input.spec, input.value)
      if (serialized.length === 0) {
        return
      }

      const normalized = serialized.length > 1 ? serialized.join(',') : serialized[0]
      if (!normalized) {
        return
      }

      pairs.push([input.name, normalized])
    })

  if (!pairs.length) {
    return null
  }

  return pairs.map(([name, value]) => `${name}=${value}`).join('; ')
}

function mergeCookieHeaders(baseCookieHeader: string | null, authCookies: Record<string, string>): string | null {
  const segments: string[] = []
  if (baseCookieHeader) {
    segments.push(...baseCookieHeader.split(';').map(part => part.trim()).filter(Boolean))
  }

  Object.entries(authCookies).forEach(([key, value]) => {
    const normalized = value.trim()
    if (!normalized) {
      return
    }

    const prefix = `${key}=`
    const existingIndex = segments.findIndex(segment => segment.startsWith(prefix))
    const nextSegment = `${key}=${normalized}`
    if (existingIndex >= 0) {
      segments[existingIndex] = nextSegment
    } else {
      segments.push(nextSegment)
    }
  })

  return segments.length > 0 ? segments.join('; ') : null
}

function parseResponseBody(text: string, contentType: string | null): {
  body: unknown
  bodyText: string
  bodyKind: 'json' | 'text' | 'empty'
} {
  if (!text.trim()) {
    return {
      body: null,
      bodyText: '',
      bodyKind: 'empty',
    }
  }

  if (contentType?.toLowerCase().includes('application/json')) {
    try {
      const parsed = JSON.parse(text)
      return {
        body: parsed,
        bodyText: JSON.stringify(parsed, null, 2),
        bodyKind: 'json',
      }
    } catch {
      console.warn('[useRequestEmulator] Response content-type is json but payload parsing failed')
    }
  }

  return {
    body: text,
    bodyText: text,
    bodyKind: 'text',
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('json')
}

function isMultipartContentType(contentType: string | null): boolean {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('multipart/form-data')
}

function isUrlEncodedContentType(contentType: string | null): boolean {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/x-www-form-urlencoded')
}

function isStructuredFormContentType(contentType: string | null): boolean {
  return isJsonContentType(contentType) || isMultipartContentType(contentType) || isUrlEncodedContentType(contentType)
}

function isEmptySerializedValue(input: RequestEmulatorParamInput): boolean {
  return serializeParameterValue(input.spec, input.value).every(value => value.trim() === '')
}

function isValidJsonText(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function appendFormDataValue(
  target: FormData,
  key: string,
  value: unknown,
): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (value instanceof Blob) {
    target.append(key, value)
    return true
  }

  if (Array.isArray(value)) {
    let hasAny = false
    value.forEach((entry, index) => {
      if (appendFormDataValue(target, `${key}[${index}]`, entry)) {
        hasAny = true
      }
    })
    return hasAny
  }

  if (typeof value === 'object') {
    let hasAny = false
    Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
      if (appendFormDataValue(target, `${key}[${nestedKey}]`, nestedValue)) {
        hasAny = true
      }
    })
    return hasAny
  }

  target.append(key, String(value))
  return true
}

function appendSearchParamValue(
  target: URLSearchParams,
  key: string,
  value: unknown,
): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (Array.isArray(value)) {
    let hasAny = false
    value.forEach((entry, index) => {
      if (appendSearchParamValue(target, `${key}[${index}]`, entry)) {
        hasAny = true
      }
    })
    return hasAny
  }

  if (typeof value === 'object') {
    let hasAny = false
    Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
      if (appendSearchParamValue(target, `${key}[${nestedKey}]`, nestedValue)) {
        hasAny = true
      }
    })
    return hasAny
  }

  target.append(key, String(value))
  return true
}

export function useRequestEmulator(options: UseRequestEmulatorOptions) {
  const paramInputs = ref<RequestEmulatorParamInput[]>([])
  const emittedWarnings = ref<Set<string>>(new Set())
  const bodyEditorMode = ref<RequestBodyEditorMode>('json')
  const requestBodyText = ref('')
  const requestBodyJsonWarning = ref<string | null>(null)
  const requestBodyFormWarnings = ref<string[]>([])
  const requestBodyFormInputs = ref<RequestBodyFormInput[]>([])
  const requestBodyFormValues = ref<RequestBodyFormValueMap>({})
  const responseState = ref<RequestEmulatorExecutionState>({
    isSending: false,
    result: null,
    error: null,
  })

  const bodyMeta = computed(() => readRequestBodyContent(options.method.value))
  const hasRequestBody = computed(() => bodyMeta.value.contentType !== null)
  const isJsonRequestBody = computed(() => isJsonContentType(bodyMeta.value.contentType))
  const isMultipartRequestBody = computed(() => isMultipartContentType(bodyMeta.value.contentType))
  const isUrlEncodedRequestBody = computed(() => isUrlEncodedContentType(bodyMeta.value.contentType))
  const supportsStructuredFormBody = computed(() => isStructuredFormContentType(bodyMeta.value.contentType))
  const groupedInputs = computed(() => ({
    path: paramInputs.value.filter(input => input.in === 'path'),
    query: paramInputs.value.filter(input => input.in === 'query'),
    header: paramInputs.value.filter(input => input.in === 'header'),
    cookie: paramInputs.value.filter(input => input.in === 'cookie'),
  }))
  const resolvedBodySchema = computed(() => resolveRequestBodySchemaForPathValues(
    bodyMeta.value.schema,
    options.components.value,
    groupedInputs.value.path,
  ))

  function emitWarningOnce(message: string, context?: Record<string, unknown>) {
    if (emittedWarnings.value.has(message)) {
      return
    }

    emittedWarnings.value.add(message)
    if (context) {
      console.warn(message, context)
      return
    }

    console.warn(message)
  }

  const pathValues = computed(() => {
    return groupedInputs.value.path.reduce<Record<string, string>>((acc, input) => {
      const serialized = serializeParameterValue(input.spec, input.value)
      if (serialized.length === 0) {
        acc[input.name] = ''
        return acc
      }

      acc[input.name] = serialized.length > 1 ? serialized.join(',') : serialized[0] ?? ''
      return acc
    }, {})
  })

  const queryValues = computed(() => {
    return groupedInputs.value.query.reduce<Record<string, string | string[]>>((acc, input) => {
      const serialized = serializeParameterValue(input.spec, input.value)
      if (serialized.length === 0) {
        return acc
      }

      if (serialized.length > 1 && input.spec.serializationHint.arrayStyle === 'multi') {
        acc[input.name] = serialized
        return acc
      }

      acc[input.name] = serialized.length > 1 ? serialized.join(',') : serialized[0] ?? ''
      return acc
    }, {})
  })

  const headerValues = computed(() => {
    return groupedInputs.value.header.reduce<Record<string, string>>((acc, input) => {
      const serialized = serializeParameterValue(input.spec, input.value)
      if (serialized.length === 0) {
        return acc
      }

      const normalized = serialized.length > 1 ? serialized.join(',') : serialized[0]
      if (!normalized) {
        return acc
      }

      acc[input.name] = normalized
      return acc
    }, {})
  })

  const requestPath = computed(() => {
    const url = options.endpoint.value?.url ?? ''
    return interpolatePathParams(url, pathValues.value)
  })

  const mergedCookieHeader = computed(() => {
    const cookieHeader = buildCookieHeader(paramInputs.value)
    return mergeCookieHeaders(cookieHeader, options.authorization.value?.target.cookies ?? {})
  })

  function replaceFormWarnings(nextWarnings: string[]) {
    requestBodyFormWarnings.value = [...new Set(nextWarnings)]
  }

  function syncFormFromJsonText(reason: 'init' | 'json-edit' | 'mode-switch'): 'skipped' | 'empty' | 'success' | 'invalid' {
    if (!isJsonRequestBody.value || requestBodyFormInputs.value.length === 0) {
      requestBodyJsonWarning.value = null
      return 'skipped'
    }

    const raw = requestBodyText.value.trim()
    if (!raw) {
      requestBodyJsonWarning.value = null
      return 'empty'
    }

    try {
      const parsed = JSON.parse(raw)
      const hydrated = hydrateRequestBodyFormValues(
        requestBodyFormInputs.value,
        parsed,
        requestBodyFormValues.value,
      )

      requestBodyFormValues.value = hydrated.values
      if (hydrated.warnings.length > 0) {
        hydrated.warnings.forEach((warning) => {
          emitWarningOnce(warning)
        })
      }

      replaceFormWarnings([
        ...requestBodyFormWarnings.value.filter(warning => !warning.includes('[requestBodyFormState]')),
        ...hydrated.warnings,
      ])
      requestBodyJsonWarning.value = null
      return 'success'
    } catch (error) {
      requestBodyJsonWarning.value = 'Invalid JSON. Form values were kept unchanged.'
      emitWarningOnce('[useRequestEmulator] Failed to parse request body JSON while hydrating form values', { reason, error })
      return 'invalid'
    }
  }

  function syncJsonTextFromFormValues() {
    if (!isJsonRequestBody.value || requestBodyFormInputs.value.length === 0) {
      return
    }

    const payload = buildRequestBodyFromFormValues(requestBodyFormInputs.value, requestBodyFormValues.value)
    requestBodyText.value = payload === null ? '' : JSON.stringify(payload, null, 2)
    requestBodyJsonWarning.value = null
  }

  const transportRequestBody = computed<BodyInit | null>(() => {
    if (!hasRequestBody.value) {
      return null
    }

    if (bodyEditorMode.value === 'form' && requestBodyFormInputs.value.length > 0) {
      const payload = buildRequestBodyFromFormValues(requestBodyFormInputs.value, requestBodyFormValues.value)
      if (payload === null) {
        return null
      }

      if (isMultipartRequestBody.value) {
        const body = new FormData()
        let hasAny = false

        if (Array.isArray(payload)) {
          payload.forEach((entry, index) => {
            if (appendFormDataValue(body, `items[${index}]`, entry)) {
              hasAny = true
            }
          })
        } else if (typeof payload === 'object' && payload !== null) {
          Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => {
            if (appendFormDataValue(body, key, value)) {
              hasAny = true
            }
          })
        } else if (appendFormDataValue(body, 'value', payload)) {
          hasAny = true
        }

        return hasAny ? body : null
      }

      if (isUrlEncodedRequestBody.value) {
        const body = new URLSearchParams()
        let hasAny = false

        if (Array.isArray(payload)) {
          payload.forEach((entry, index) => {
            if (appendSearchParamValue(body, `items[${index}]`, entry)) {
              hasAny = true
            }
          })
        } else if (typeof payload === 'object' && payload !== null) {
          Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => {
            if (appendSearchParamValue(body, key, value)) {
              hasAny = true
            }
          })
        } else if (appendSearchParamValue(body, 'value', payload)) {
          hasAny = true
        }

        return hasAny ? body : null
      }

      if (typeof payload === 'string') {
        return payload
      }

      try {
        return JSON.stringify(payload)
      } catch (error) {
        emitWarningOnce('[useRequestEmulator] Failed to serialize form payload; falling back to raw body text', { error })
      }
    }

    const raw = requestBodyText.value.trim()
    return raw === '' ? null : raw
  })

  const transportRequestBodyText = computed<string | null>(() => {
    const body = transportRequestBody.value
    if (body === null) {
      return null
    }

    if (typeof body === 'string') {
      return body
    }

    if (body instanceof URLSearchParams) {
      return body.toString()
    }

    if (body instanceof FormData) {
      const entries: Record<string, string[]> = {}
      body.forEach((value, key) => {
        const normalized = typeof value === 'string' ? value : '[blob]'
        if (!entries[key]) {
          entries[key] = []
        }

        entries[key].push(normalized)
      })

      return JSON.stringify(entries, null, 2)
    }

    return null
  })

  const transportHeaders = computed<Record<string, string>>(() => {
    const headers: Record<string, string> = {
      ...headerValues.value,
      ...(options.authorization.value?.target.headers ?? {}),
    }

    if (mergedCookieHeader.value) {
      headers.Cookie = mergedCookieHeader.value
    }

    const hasTransportBody = transportRequestBody.value !== null
    const skipExplicitMultipartHeader = bodyEditorMode.value === 'form' && isMultipartRequestBody.value
    if (bodyMeta.value.contentType && hasTransportBody && !skipExplicitMultipartHeader) {
      headers['Content-Type'] = bodyMeta.value.contentType
    }

    return headers
  })

  const validationErrors = computed<RequestEmulatorValidationError[]>(() => {
    const errors: RequestEmulatorValidationError[] = []
    const endpoint = options.endpoint.value

    if (!endpoint) {
      errors.push({
        field: 'endpoint',
        message: 'Select an endpoint before sending a request.',
      })
      return errors
    }

    requestPath.value.missing.forEach((name) => {
      errors.push({
        field: `path:${name}`,
        message: `Path parameter "${name}" is required.`,
      })
    })

    paramInputs.value.forEach((input) => {
      if (!input.required || !isEmptySerializedValue(input)) {
        return
      }

      errors.push({
        field: input.key,
        message: `${input.in} parameter "${input.name}" is required.`,
      })
    })

    const rawBody = requestBodyText.value.trim()
    if (bodyMeta.value.required && transportRequestBody.value === null) {
      errors.push({
        field: 'body',
        message: 'Request body is required.',
      })
    }

    if (isJsonRequestBody.value && rawBody !== '' && !isValidJsonText(rawBody)) {
      errors.push({
        field: 'body',
        message: 'Request body must be valid JSON.',
      })
    }

    const forbiddenHeaders = findForbiddenBrowserRequestHeaders(transportHeaders.value)
    if (forbiddenHeaders.length > 0) {
      errors.push({
        field: 'cookie',
        message: `Browser fetch cannot set ${forbiddenHeaders.join(', ')} headers. Use the generated cURL command or existing browser session cookies.`,
      })
    }

    return errors
  })

  const preparedRequest = computed<RequestEmulatorPreparedRequest | null>(() => {
    const endpoint = options.endpoint.value
    if (!endpoint) {
      return null
    }

    const authorization = options.authorization.value
    const querySource: Record<string, string | string[]> = {
      ...queryValues.value,
    }
    Object.entries(authorization?.target.query ?? {}).forEach(([key, value]) => {
      querySource[key] = value
    })

    const query = serializeQueryParams(querySource)
    const url = buildRequestUrl(options.baseApiUrl.value, requestPath.value.path, query)
    const headers = transportHeaders.value

    authorization?.warnings.forEach((message) => {
      emitWarningOnce(`[useRequestEmulator] Security resolution warning: ${message}`)
    })

    if (authorization && !authorization.hasSatisfiedRequirement && authorization.missingKeys.length > 0) {
      emitWarningOnce('[useRequestEmulator] Security requirement is not fully satisfied', {
        missingKeys: authorization.missingKeys,
      })
    }

    const bodyText = transportRequestBodyText.value
    const body = transportRequestBody.value

    const prepared: RequestEmulatorPreparedRequest = {
      url,
      method: endpoint.method,
      headers,
      bodyText,
      body,
      curl: '',
    }

    prepared.curl = buildCurlCommand(prepared)
    return prepared
  })

  const isRequestValid = computed(() => preparedRequest.value !== null && validationErrors.value.length === 0)

  function initializeRequestBodyState() {
    requestBodyJsonWarning.value = null

    const meta = bodyMeta.value
    const schema = resolvedBodySchema.value.schema ?? meta.schema
    const baseExample = meta.example ?? generateExampleFromSchema(schema, options.components.value)
    requestBodyText.value = stringifyUnknown(baseExample)
    if (supportsStructuredFormBody.value) {
      const bodyFormResolution = resolveRequestBodyFormInputs(schema, options.components.value)
      requestBodyFormInputs.value = bodyFormResolution.inputs
      requestBodyFormValues.value = createInitialRequestBodyFormValues(bodyFormResolution.inputs)
      replaceFormWarnings(bodyFormResolution.warnings)

      bodyFormResolution.warnings.forEach((warning) => {
        emitWarningOnce(warning)
      })

      bodyEditorMode.value = !isJsonRequestBody.value && bodyFormResolution.inputs.length > 0
        ? 'form'
        : 'json'

      if (isJsonRequestBody.value) {
        syncFormFromJsonText('init')
      }
    } else {
      bodyEditorMode.value = 'json'
      requestBodyFormInputs.value = []
      requestBodyFormValues.value = {}
      replaceFormWarnings([])
    }
  }

  function initializeRequestState() {
    const nextInputs: RequestEmulatorParamInput[] = options.parameters.value
      .map(createParamInput)
      .filter((input): input is RequestEmulatorParamInput => input !== null)

    paramInputs.value = nextInputs
    emittedWarnings.value = new Set()
    initializeRequestBodyState()

    responseState.value = {
      isSending: false,
      result: null,
      error: null,
    }
  }

  function resetRequest() {
    initializeRequestState()
  }

  async function sendRequest() {
    const prepared = preparedRequest.value
    const currentValidationErrors = validationErrors.value
    if (!prepared || currentValidationErrors.length > 0) {
      responseState.value = {
        isSending: false,
        result: null,
        error: {
          code: 'invalid_request',
          message: currentValidationErrors[0]?.message ?? 'Request is not ready yet.',
        },
      }
      console.warn('[useRequestEmulator] Request send skipped because validation failed', {
        errors: currentValidationErrors,
      })
      return
    }

    responseState.value = {
      isSending: true,
      result: null,
      error: null,
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    try {
      if (options.requestTimeoutMs && options.requestTimeoutMs > 0) {
        timeoutHandle = setTimeout(() => controller.abort(), options.requestTimeoutMs)
      }

      const startAt = performance.now()
      const response = await fetch(prepared.url, {
        method: prepared.method.toUpperCase() as Uppercase<HttpMethod>,
        headers: stripForbiddenBrowserRequestHeaders(prepared.headers),
        body: prepared.body,
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const elapsedMs = Math.round(performance.now() - startAt)

      const headerMap: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headerMap[key] = value
      })

      const rawBody = await response.text()
      const parsedBody = parseResponseBody(rawBody, response.headers.get('content-type'))

      responseState.value = {
        isSending: false,
        result: {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          elapsedMs,
          headers: headerMap,
          body: parsedBody.body,
          bodyText: parsedBody.bodyText,
          bodyKind: parsedBody.bodyKind,
        },
        error: null,
      }
    } catch (error) {
      const abortError = error instanceof Error && error.name === 'AbortError'
      const code = abortError ? 'network_error' : 'unexpected_error'
      const message = abortError
        ? 'Request timed out.'
        : error instanceof Error
          ? error.message
          : 'Unexpected request failure.'

      if (code === 'network_error') {
        console.warn('[useRequestEmulator] Request failed with network/timeout issue', { error })
      } else {
        console.error('[useRequestEmulator] Unexpected request execution failure', { error })
      }

      responseState.value = {
        isSending: false,
        result: null,
        error: {
          code,
          message,
        },
      }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  watch(
    () => [
      options.endpoint.value?.operationId,
      options.method.value?.operationId,
    ],
    () => {
      initializeRequestState()
    },
    { immediate: true },
  )

  watch(
    () => resolvedBodySchema.value.key,
    () => {
      initializeRequestBodyState()
    },
  )

  watch(
    requestBodyFormValues,
    () => {
      if (bodyEditorMode.value !== 'form') {
        return
      }

      syncJsonTextFromFormValues()
    },
    { deep: true },
  )

  watch(requestBodyText, () => {
    if (bodyEditorMode.value !== 'json') {
      return
    }

    syncFormFromJsonText('json-edit')
  })

  watch(bodyEditorMode, (mode) => {
    if (mode === 'json') {
      return
    }

    const syncResult = syncFormFromJsonText('mode-switch')
    if (syncResult === 'success') {
      syncJsonTextFromFormValues()
    }
  })

  return {
    bodyEditorMode,
    hasRequestBody,
    isJsonRequestBody,
    requestBodyText,
    requestBodyContentType: computed(() => bodyMeta.value.contentType),
    requestBodyJsonWarning,
    requestBodyFormWarnings,
    requestBodyFormInputs,
    requestBodyFormValues,
    groupedInputs,
    preparedRequest,
    validationErrors,
    isRequestValid,
    responseState,
    resetRequest,
    sendRequest,
  }
}
