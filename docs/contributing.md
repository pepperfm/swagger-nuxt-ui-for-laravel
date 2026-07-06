[← Deployment](deployment.md) · [Back to README](../README.md)

# Contributing

## Scope Rules

- Keep changes atomic.
- Avoid mixing runtime PHP refactors with unrelated UI tweaks.
- Preserve route contract: `/swagger-ui`, `/api/swagger-ui`.

## Local Validation

```bash
bun install
bun run lint
bun run test
bun run typecheck
bun run check:bridge-assets
```

For PHP syntax checks (optional):

```bash
find src routes config -name '*.php' -print0 | xargs -0 -n1 php -l
```

## PR Expectations

- Describe user-visible behavior changes.
- Mention config key or env changes.
- Attach screenshots for viewer UI updates.

## See Also

- [Architecture](architecture.md)
- [Deployment](deployment.md)
- [API Reference](api.md)
