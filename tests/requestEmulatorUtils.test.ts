import { describe, expect, test } from 'bun:test'
import {
  buildRequestUrl,
  findForbiddenBrowserRequestHeaders,
  resolveRequestAuthorization,
  stripForbiddenBrowserRequestHeaders,
} from '../lib/composables/requestEmulatorUtils'

describe('requestEmulatorUtils', () => {
  test('builds relative request urls without duplicate slashes', () => {
    expect(buildRequestUrl('https://api.example.test/', '/users', '?page=1')).toBe('https://api.example.test/users?page=1')
    expect(buildRequestUrl('', 'users', '')).toBe('/users')
  })

  test('chooses the satisfied security requirement with available credentials', () => {
    const authorization = resolveRequestAuthorization({
      securityRequirements: [
        { apiKey: [] },
        { bearerAuth: [] },
      ],
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
      credentials: {
        bearerAuth: 'secret-token',
      },
    })

    expect(authorization.hasSatisfiedRequirement).toBe(true)
    expect(authorization.appliedKeys).toEqual(['bearerAuth'])
    expect(authorization.target.headers.Authorization).toBe('Bearer secret-token')
  })

  test('keeps cookie credentials for generated requests but flags them as browser-forbidden headers', () => {
    const authorization = resolveRequestAuthorization({
      securityRequirements: [{ cookieAuth: [] }],
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
        },
      },
      credentials: {
        cookieAuth: 'abc123',
      },
    })

    expect(authorization.hasSatisfiedRequirement).toBe(true)
    expect(authorization.target.cookies.session).toBe('abc123')

    const headers = {
      Cookie: 'session=abc123',
      Accept: 'application/json',
    }

    expect(findForbiddenBrowserRequestHeaders(headers)).toEqual(['Cookie'])
    expect(stripForbiddenBrowserRequestHeaders(headers)).toEqual({
      Accept: 'application/json',
    })
  })
})
