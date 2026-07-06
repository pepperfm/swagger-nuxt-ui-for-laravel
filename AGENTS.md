# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
Nuxt 4 + Nuxt UI 4 repository with Laravel-first packaging model:

- Primary distribution: Composer package `pepperfm/swagger-nuxt-ui-for-laravel` (root package).
- Runtime bridge for Laravel: routes `/swagger-ui` and `/api/swagger-ui` from root `src/`, `routes/`, `config/`, `resources/`.
- Internal frontend source for viewer assets: `lib/` + `bridge-viewer/`.
- Demo app for local UI iteration: `app/` + `server/`.

## Tech Stack
- **Language:** TypeScript, PHP
- **Framework:** Nuxt 4 (Vue 3), Laravel package runtime
- **UI:** Nuxt UI 4
- **Packaging:** Composer (primary), Vite viewer build (internal)
- **Database:** None
- **ORM:** None

## Project Structure
```text
app/
├── app.vue
├── app.config.ts
├── assets/css/main.css
├── components/                    # Adapters to lib components
├── composables/                   # Adapters to lib composables
├── pages/index.vue                # Demo page consuming SwaggerViewer
└── types/types.d.ts

lib/
├── index.ts
├── types.ts
├── components/
├── composables/
└── styles/swagger-ui.css

bridge-viewer/
├── main.ts                        # Standalone browser entrypoint
├── App.vue                        # Viewer shell
└── styles.css

src/
├── SwaggerUiBridgeServiceProvider.php
├── SchemaPathResolver.php
└── Http/Controllers/
    ├── SwaggerSchemaController.php
    ├── SwaggerViewerPageController.php
    └── BridgeAssetController.php

routes/
└── swagger-ui.php

config/
└── swagger-ui-bridge.php

resources/
├── assets/                        # viewer.js/viewer.css shipped in Composer package
├── views/viewer.blade.php         # Viewer shell page
└── api-docs/api-docs.json         # Demo OpenAPI source

scripts/
├── sync-bridge-viewer-assets.mjs  # Sync dist/viewer -> resources/assets
├── install-laravel-bridge.mjs     # Deprecated installer (guidance only)
├── cli/install-bridge.mjs         # Deprecated CLI wrapper
└── lib/

docs/
├── getting-started.md
├── architecture.md
├── api.md
├── configuration.md
├── deployment.md
└── contributing.md
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `composer.json` | Primary package metadata and Laravel provider registration |
| `package.json` | Internal frontend/dev scripts |
| `vite.viewer.config.ts` | Standalone viewer bundle configuration |
| `scripts/sync-bridge-viewer-assets.mjs` | Copies viewer bundle into Composer runtime assets |
| `src/SwaggerUiBridgeServiceProvider.php` | Registers config, views, and routes |
| `routes/swagger-ui.php` | Bridge route registration (JSON + viewer + assets) |
| `src/Http/Controllers/SwaggerSchemaController.php` | Serves OpenAPI JSON with fallback resolution |
| `src/Http/Controllers/SwaggerViewerPageController.php` | Renders `/swagger-ui` page |
| `src/Http/Controllers/BridgeAssetController.php` | Serves offline viewer assets |
| `resources/views/viewer.blade.php` | HTML shell bootstrapping viewer bundle |
| `lib/components/SwaggerViewer.vue` | Main viewer UI |
| `lib/components/EndpointRequestCard.vue` | Endpoint request emulator |
| `lib/components/RequestBodyEditor.vue` | Request body editor (`JSON` / `Form`) |
| `lib/components/ParameterInputField.vue` | Typed parameter input renderer |
| `lib/components/ViewerAuthorizationPanel.vue` | Global authorization panel |
| `lib/composables/useRequestEmulator.ts` | Request execution state machine |
| `lib/composables/useViewerAuthorization.ts` | Security credential store and resolution |

## Commit And Release Rules
- Before committing any frontend/viewer change that can affect the packaged Laravel runtime, run `bun run build:bridge-assets` and include the updated `resources/assets/viewer.js` and `resources/assets/viewer.css` in the commit.
- Composer consumers do not build these assets; the tagged package must already contain current files under `resources/assets/`.

## Documentation
| Document | Path | Description |
|----------|------|-------------|
| README | `README.md` | Composer-first overview |
| Getting Started | `docs/getting-started.md` | Install and migration |
| Architecture | `docs/architecture.md` | Layer boundaries and runtime/build flow |
| API Reference | `docs/api.md` | Route contracts and error payloads |
| Configuration | `docs/configuration.md` | Config keys and env variables |
| Deployment | `docs/deployment.md` | Composer-first release checklist |
| Contributing | `docs/contributing.md` | Local validation checklist |

## AI Context Files
| File | Purpose |
|------|---------|
| `AGENTS.md` | This project map |
| `.ai-factory/DESCRIPTION.md` | Project specification and stack |
| `.ai-factory/ARCHITECTURE.md` | Architecture rules and boundaries |
| `.ai-factory/plans/*.md` | Implementation plans and progress |
