import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
  ],

  devtools: {
    enabled: false,
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    swaggerSchemaSource: process.env.NUXT_SWAGGER_SCHEMA_SOURCE ?? `${process.env.NUXT_BASE_API_HOST ?? 'http://localhost'}/docs?api-docs.json`,
    public: {
      apiHost: process.env.NUXT_BASE_API_HOST ?? 'http://localhost',
      apiUrl: process.env.NUXT_BASE_API_URL ?? 'http://localhost/api',
      swaggerSchemaSource: process.env.NUXT_SWAGGER_SCHEMA_SOURCE ?? `${process.env.NUXT_BASE_API_HOST ?? 'http://localhost'}/docs?api-docs.json`,
    },
  },

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs',
      },
    },
  },

  // content: {
  //   experimental: {nativeSqlite: true},
  //   build: {
  //     markdown: {
  //       highlight: {
  //         theme: {
  //           default: 'github-light-high-contrast',
  //           dark: 'material-theme-palenight',
  //         },
  //         langs: [
  //           'php',
  //           'json',
  //           'dotenv',
  //         ],
  //       },
  //     },
  //   },
  // },
  //
  ui: {
    fonts: false,
  },
})
