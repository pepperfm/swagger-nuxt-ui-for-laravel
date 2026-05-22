# Swagger Nuxt UI for Laravel

Laravel-first package with offline Nuxt UI viewer assets for OpenAPI docs.

## Canonical Package

- Composer package: `pepperfm/swagger-nuxt-ui-for-laravel`
- Routes exposed by default:
- `GET /swagger-ui` (viewer page)
- `GET /api/swagger-ui` (OpenAPI JSON)

## Install (Laravel)

```bash
composer r pepperfm/swagger-nuxt-ui-for-laravel
```

Optional config publish:

```bash
php artisan vendor:publish --tag=swagger-ui-bridge-config
```

```bash
php artisan l5-swagger:generate
```

## Schema Resolution Order

1. `config('swagger-ui-bridge.schema_path')`
2. `l5-swagger` configured docs path
3. `storage/api-docs/api-docs.json`

## Legacy JS Installer

`bunx swagger-ui-bridge-install` is deprecated and now prints migration guidance only.
Composer install is the canonical flow.

## Local Development (viewer assets)

```bash
bun install
bun run build:bridge-assets
```

This builds `dist/viewer/*` and syncs runtime assets to `resources/assets/*`.

## Logging Policy

Runtime logs are minimal:
- `WARN`: recoverable route/schema fallback issues
- `ERROR`: unreadable schema/assets or invalid JSON

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [Configuration](docs/configuration.md)
- [Deployment](docs/deployment.md)
- [Contributing](docs/contributing.md)
