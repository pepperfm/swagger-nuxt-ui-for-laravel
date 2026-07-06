[← Configuration](configuration.md) · [Back to README](../README.md) · [Contributing →](contributing.md)

# Deployment

## Consumer Projects (Laravel)

No Node/Bun install is required on server for package runtime.

Canonical install:

```bash
composer require pepperfm/swagger-nuxt-ui-for-laravel
```

If old package name was used before, remove it from `composer.json` and keep only the new package.

Then validate:

- `GET /api/swagger-ui` returns OpenAPI JSON
- `GET /swagger-ui` renders viewer

## Package Release Checklist (Composer-First)

1. `bun install`
2. `bun run lint`
3. `bun run test`
4. `bun run typecheck`
5. `bun run check:bridge-assets`
6. Verify package runtime files exist:
   - `resources/assets/viewer.js`
   - `resources/assets/viewer.css`
   - `src/SwaggerUiBridgeServiceProvider.php`
   - `routes/swagger-ui.php`
7. Tag and publish Composer package (`pepperfm/swagger-nuxt-ui-for-laravel`)
8. Smoke test in clean Laravel app with Composer-only install

## CI Notes

Workflow `.github/workflows/ci.yml` runs `bun run check:bridge-assets`, which rebuilds viewer assets and fails if synced files in `resources/assets` are stale.

## Legacy Flow

`bunx swagger-ui-bridge-install` is deprecated and should not be used in deploy scripts.

## See Also

- [Configuration](configuration.md)
- [API Reference](api.md)
