import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

type JsonObject = Record<string, unknown>

interface OpenApiFixture {
  name: string
  document: JsonObject
}

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const fixturesDir = fileURLToPath(new URL('./fixtures/openapi/', import.meta.url))
const fixtureFiles = readdirSync(fixturesDir)
  .filter(fileName => fileName.endsWith('.json'))
  .sort()

const fixtures = fixtureFiles.map((fileName): OpenApiFixture => {
  const filePath = join(fixturesDir, fileName)
  const document = JSON.parse(readFileSync(filePath, 'utf8')) as unknown

  if (!isObject(document)) {
    throw new Error(`${fileName} must contain an OpenAPI object`)
  }

  return {
    name: fileName,
    document,
  }
})

describe('OpenAPI fixtures', () => {
  test('are loadable OpenAPI documents', () => {
    expect(fixtures.map(fixture => fixture.name)).toEqual([
      'component-schemas.json',
      'request-body.json',
      'request-parameters.json',
      'security.json',
    ])

    for (const fixture of fixtures) {
      expect(fixture.document.openapi).toMatch(/^3\./)
      expect(typeof getObject(fixture.document.info).title).toBe('string')
      expect(Object.keys(getObject(fixture.document.paths)).length).toBeGreaterThan(0)
    }
  })

  test('cover request, schema, and authorization surfaces', () => {
    const operations = fixtures.flatMap(fixture => getOperations(fixture.document))
    const componentSections = fixtures.map(fixture => getObject(fixture.document.components))

    expect(operations.some(hasQueryParameter)).toBe(true)
    expect(operations.some(operation => isObject(operation.requestBody))).toBe(true)
    expect(componentSections.some((components) => {
      return Object.keys(getObject(components.schemas)).length >= 5
    })).toBe(true)
    expect(componentSections.some((components) => {
      return Object.keys(getObject(components.securitySchemes)).length >= 4
    })).toBe(true)
  })
})

function getOperations(document: JsonObject): JsonObject[] {
  const paths = getObject(document.paths)

  return Object.values(paths).flatMap((pathItem) => {
    if (!isObject(pathItem)) {
      return []
    }

    return Object.entries(pathItem)
      .filter(([method, operation]) => httpMethods.has(method) && isObject(operation))
      .map(([, operation]) => operation as JsonObject)
  })
}

function hasQueryParameter(operation: JsonObject): boolean {
  const parameters = operation.parameters

  return Array.isArray(parameters) && parameters.some((parameter) => {
    return isObject(parameter) && parameter.in === 'query'
  })
}

function getObject(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
