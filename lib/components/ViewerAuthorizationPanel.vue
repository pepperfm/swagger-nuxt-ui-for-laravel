<script setup lang="ts">
import type { NormalizedSecuritySchemeMeta } from '../types'
import { ref } from 'vue'

const props = defineProps<{
  schemes: NormalizedSecuritySchemeMeta[]
  credentials: Record<string, string>
  authorizedCount: number
}>()

const emit = defineEmits<{
  (e: 'setCredential', key: string, value: string): void
  (e: 'clearCredential', key: string): void
  (e: 'resetAll'): void
}>()

const unlockedInputs = ref<Record<string, boolean>>({})
const inputNameSalt = Math.random().toString(36).slice(2, 10)

function credentialFor(key: string): string {
  return props.credentials[key] ?? ''
}

function inputTypeFor(scheme: NormalizedSecuritySchemeMeta): 'password' | 'text' {
  return scheme.kind === 'http-basic' ? 'text' : 'password'
}

function isAuthorizationHeader(headerName: string | null): boolean {
  return headerName?.trim().toLowerCase() === 'authorization'
}

function placeholderFor(scheme: NormalizedSecuritySchemeMeta): string {
  switch (scheme.kind) {
    case 'http-basic':
      return 'username:password'
    case 'api-key-header':
      if (isAuthorizationHeader(scheme.headerName)) {
        return 'Bearer token or Authorization value'
      }

      return scheme.headerName ? `Header value for ${scheme.headerName}` : 'API key'
    case 'api-key-query':
      return scheme.queryName ? `Query value for ${scheme.queryName}` : 'API key'
    case 'api-key-cookie':
      return scheme.cookieName ? `Cookie value for ${scheme.cookieName}` : 'API key'
    default:
      return 'Access token'
  }
}

function helpFor(scheme: NormalizedSecuritySchemeMeta): string {
  if (scheme.kind === 'api-key-header' && scheme.headerName) {
    if (isAuthorizationHeader(scheme.headerName)) {
      return 'Header: Authorization; bare token is sent as Bearer'
    }

    return `Header: ${scheme.headerName}`
  }

  if (scheme.kind === 'api-key-query' && scheme.queryName) {
    return `Query: ${scheme.queryName}`
  }

  if (scheme.kind === 'api-key-cookie' && scheme.cookieName) {
    return `Cookie: ${scheme.cookieName}`
  }

  if (scheme.kind === 'http-basic') {
    return 'Use username:password'
  }

  return 'Authorization header'
}

function onCredentialInput(key: string, value: string) {
  emit('setCredential', key, value)
}

function onCredentialModelUpdate(key: string, value: unknown) {
  onCredentialInput(key, String(value ?? ''))
}

function inputNameFor(schemeKey: string): string {
  const normalized = schemeKey.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return `swagger-auth-${inputNameSalt}-${normalized}`
}

function unlockInput(schemeKey: string) {
  unlockedInputs.value[schemeKey] = true
}

function isInputLocked(schemeKey: string): boolean {
  return !unlockedInputs.value[schemeKey]
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted">
        Authorized {{ props.authorizedCount }}/{{ props.schemes.length }}
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-rotate-ccw"
        @click="emit('resetAll')"
      >
        Reset All
      </UButton>
    </div>

    <UAlert
      v-if="props.schemes.length === 0"
      color="neutral"
      variant="soft"
      title="No security schemes found"
      description="OpenAPI schema does not define components.securitySchemes."
    />

    <div v-else>
      <div class="space-y-4">
        <UCard
          v-for="scheme in props.schemes"
          :key="scheme.key"
          variant="subtle"
        >
          <template #header>
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-highlighted">
                  {{ scheme.key }}
                </p>
                <p class="text-xs text-muted">
                  {{ scheme.description }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge
                  size="sm"
                  :color="scheme.supported ? 'primary' : 'warning'"
                  variant="soft"
                >
                  {{ scheme.kind }}
                </UBadge>
                <UBadge
                  size="sm"
                  :color="credentialFor(scheme.key).trim() ? 'success' : 'neutral'"
                  variant="soft"
                >
                  {{ credentialFor(scheme.key).trim() ? 'Authorized' : 'Empty' }}
                </UBadge>
              </div>
            </div>
          </template>

          <UFormField
            label="Credential"
            :help="helpFor(scheme)"
          >
            <div class="flex items-center gap-2">
              <UInput
                :model-value="credentialFor(scheme.key)"
                :type="inputTypeFor(scheme)"
                :disabled="!scheme.supported"
                :readonly="isInputLocked(scheme.key)"
                autocomplete="off"
                :name="inputNameFor(scheme.key)"
                autocapitalize="off"
                autocorrect="off"
                :spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                :placeholder="placeholderFor(scheme)"
                icon="i-lucide-key-round"
                class="w-full"
                @focus="unlockInput(scheme.key)"
                @update:model-value="onCredentialModelUpdate(scheme.key, $event)"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-x"
                :disabled="!credentialFor(scheme.key).trim()"
                @click="emit('clearCredential', scheme.key)"
              >
                Clear
              </UButton>
            </div>
          </UFormField>
        </UCard>
      </div>
    </div>
  </div>
</template>
