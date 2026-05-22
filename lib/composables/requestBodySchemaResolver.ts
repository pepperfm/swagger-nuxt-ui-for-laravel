import type {
  OpenApiComponents,
  OpenApiSchemaObject,
  RequestEmulatorParamInput,
  RequestEmulatorParamValue,
} from '../types'

const REF_PREFIX = '#/components/schemas/'
const STOP_WORDS = new Set(['body', 'data', 'input', 'payload', 'request'])
const HIGH_CONFIDENCE_EXTENSION_SCORE = 1000

export interface RequestBodySchemaResolution {
  schema: OpenApiSchemaObject | undefined
  key: string | null
  label: string | null
}

interface SchemaCandidate {
  schema: OpenApiSchemaObject
  key: string
  label: string
  aliases: string[]
}

interface PathInputValue {
  name: string
  value: string
}

function stripRefPrefix(ref: string): string {
  return ref.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) : ref
}

function resolveSchemaRef(
  schema: OpenApiSchemaObject | undefined,
  components: OpenApiComponents,
): OpenApiSchemaObject | undefined {
  if (!schema?.$ref) {
    return schema
  }

  const ref = stripRefPrefix(schema.$ref)
  return components.schemas?.[ref]
}

function normalizeToken(token: string): string {
  const normalized = token.toLowerCase()
  if (normalized.length > 3 && normalized.endsWith('s')) {
    return normalized.slice(0, -1)
  }

  return normalized
}

function tokenize(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .split(' ')
    .map(part => normalizeToken(part.trim()))
    .filter(part => part.length > 0 && !STOP_WORDS.has(part))
}

function stringifyParamValue(value: RequestEmulatorParamValue): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }

  if (value === null || value === undefined) {
    return []
  }

  return [String(value).trim()].filter(Boolean)
}

function pathInputValues(pathInputs: RequestEmulatorParamInput[]): PathInputValue[] {
  return pathInputs.flatMap((input) => {
    return stringifyParamValue(input.value).map(value => ({
      name: input.name,
      value,
    }))
  })
}

function asStringList(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
    .map(String)
}

function readSchemaStringList(schema: OpenApiSchemaObject, keys: string[]): string[] {
  return keys.flatMap(key => asStringList(schema[key]))
}

function extensionMatchScore(candidate: SchemaCandidate, values: PathInputValue[]): number {
  if (values.length === 0) {
    return 0
  }

  const directValues = readSchemaStringList(candidate.schema, [
    'x-action',
    'x-action-name',
    'x-action-names',
    'x-path-value',
    'x-path-values',
  ])

  if (directValues.some(expected => values.some(({ value }) => expected === value))) {
    return HIGH_CONFIDENCE_EXTENSION_SCORE
  }

  const parameterValues = candidate.schema['x-path-parameter-values']
    ?? candidate.schema['x-path-parameters']

  if (!parameterValues || typeof parameterValues !== 'object' || Array.isArray(parameterValues)) {
    return 0
  }

  const record = parameterValues as Record<string, unknown>
  const hasMatchingParameterValue = values.some(({ name, value }) => {
    return asStringList(record[name]).includes(value)
  })

  return hasMatchingParameterValue ? HIGH_CONFIDENCE_EXTENSION_SCORE : 0
}

function tokenScore(candidate: SchemaCandidate, values: PathInputValue[]): number {
  const valueTokens = new Set(values.flatMap(({ value }) => tokenize(value)))
  if (valueTokens.size === 0) {
    return 0
  }

  const candidateTokens = new Set(candidate.aliases.flatMap(tokenize))
  let score = 0
  valueTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      score += 1
    }
  })

  return score
}

function pickBestCandidate(
  candidates: SchemaCandidate[],
  values: PathInputValue[],
): SchemaCandidate | null {
  if (candidates.length === 0 || values.length === 0) {
    return null
  }

  const ranked = candidates
    .map(candidate => ({
      candidate,
      score: extensionMatchScore(candidate, values) + tokenScore(candidate, values),
    }))
    .filter(result => result.score > 0)
    .sort((left, right) => right.score - left.score)

  const winner = ranked[0]
  if (!winner) {
    return null
  }

  const runnerUp = ranked[1]
  if (runnerUp && runnerUp.score === winner.score) {
    return null
  }

  return winner.candidate
}

function schemaCandidate(
  schema: OpenApiSchemaObject,
  index: number,
  components: OpenApiComponents,
): SchemaCandidate | null {
  const resolved = resolveSchemaRef(schema, components)
  if (!resolved) {
    return null
  }

  const ref = typeof schema.$ref === 'string' ? stripRefPrefix(schema.$ref) : null
  const title = typeof resolved.title === 'string' ? resolved.title : null
  const description = typeof resolved.description === 'string' ? resolved.description : null
  const label = ref ?? title ?? `Variant ${index + 1}`

  return {
    schema: {
      ...resolved,
      ...schema,
      $ref: undefined,
    },
    key: ref ?? `variant:${index}`,
    label,
    aliases: [ref, title, description].filter((value): value is string => Boolean(value)),
  }
}

export function resolveRequestBodySchemaForPathValues(
  schema: OpenApiSchemaObject | undefined,
  components: OpenApiComponents,
  pathInputs: RequestEmulatorParamInput[] = [],
): RequestBodySchemaResolution {
  if (!schema) {
    return {
      schema,
      key: null,
      label: null,
    }
  }

  const resolvedRoot = resolveSchemaRef(schema, components) ?? schema
  const variants = resolvedRoot.oneOf ?? resolvedRoot.anyOf
  if (!variants?.length) {
    return {
      schema: resolvedRoot,
      key: typeof schema.$ref === 'string' ? stripRefPrefix(schema.$ref) : null,
      label: null,
    }
  }

  const candidates = variants
    .map((variant, index) => schemaCandidate(variant, index, components))
    .filter((candidate): candidate is SchemaCandidate => candidate !== null)

  const picked = pickBestCandidate(candidates, pathInputValues(pathInputs)) ?? candidates[0]
  return {
    schema: picked?.schema,
    key: picked?.key ?? null,
    label: picked?.label ?? null,
  }
}
