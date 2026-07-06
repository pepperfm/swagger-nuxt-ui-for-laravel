<script setup lang="ts">
import type { HttpMethod, INavigationGroup, INavigationItem } from '../types'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  navigation?: INavigationGroup[]
  schemas?: INavigationGroup
  badgeColor: (method: HttpMethod) => 'primary' | 'secondary' | 'warning' | 'error' | 'info'
  selectedOperationId?: string
}>(), {
  navigation: () => [],
  schemas: () => ({
    _path: '#schemas',
    title: 'Schemas',
    children: [],
  }),
})
defineEmits<{
  (e: 'select', item: INavigationItem): void
}>()

const accordionUi = {
  trigger: 'px-3 py-2.5',
  label: 'ps-1 text-sm font-semibold',
  trailingIcon: 'pe-1',
}

const schemaSearchQuery = ref('')

const filteredSchemaItems = computed(() => {
  const items = props.schemas.children ?? []
  const query = schemaSearchQuery.value.trim().toLowerCase()

  if (query === '') {
    return items
  }

  return items.filter((item) => {
    const title = String(item.title ?? '').toLowerCase()
    const operationId = String(item.operationId ?? '').toLowerCase()
    return title.includes(query) || operationId.includes(query)
  })
})
</script>

<template>
  <div class="space-y-6 swagger-ui-navigation">
    <div>
      <USeparator
        label="ENDPOINTS"
        type="dashed"
      />
      <UAccordion
        :items="props.navigation"
        label-key="title"
        value-key="_path"
        :ui="accordionUi"
      >
        <template #body="{ item }">
          <ul class="pl-4 space-y-3 mt-2">
            <li
              v-for="child in item.children ?? []"
              :key="child._path"
            >
              <a
                :href="`#${child.anchor}`"
                class="group flex items-center justify-between w-full cursor-pointer text-left text-sm focus:outline-none px-2 py-1 rounded-lg transition-colors text-primary"
                :class="[
                  props.selectedOperationId === child.operationId
                    ? 'bg-primary/10 dark:bg-primary/10'
                    : 'hover:bg-primary/5 dark:hover:bg-primary/5',
                ]"
                @click="$emit('select', child)"
              >
                <span class="group-hover">{{ child.title }}</span>
                <UBadge
                  :color="props.badgeColor(child.method as HttpMethod)"
                  size="sm"
                  class="uppercase"
                >
                  {{ child.method }}
                </UBadge>
              </a>
            </li>
          </ul>
        </template>
      </UAccordion>
    </div>

    <div>
      <USeparator
        label="SCHEMAS"
        type="dashed"
      />
      <div class="mt-2 px-4">
        <UInput
          v-model="schemaSearchQuery"
          icon="i-lucide-search"
          size="sm"
          placeholder="Filter schemas..."
          autocomplete="off"
          name="swagger-schema-filter"
          autocapitalize="off"
          autocorrect="off"
          :spellcheck="false"
          data-lpignore="true"
          data-1p-ignore="true"
          class="w-full"
        />
      </div>
      <ul class="pl-4 space-y-3 mt-2">
        <li
          v-for="child in filteredSchemaItems"
          :key="child._path"
        >
          <a
            :href="`#${child.anchor}`"
            class="group flex items-center justify-between w-full cursor-pointer text-left text-xs focus:outline-none px-2 py-1 rounded-lg transition-colors text-primary"
            :class="[
              props.selectedOperationId === child.operationId
                ? 'bg-primary/10 dark:bg-primary/10'
                : 'hover:bg-primary/5 dark:hover:bg-primary/5',
            ]"
            @click="$emit('select', child)"
          >
            <span>{{ child.title }}</span>
          </a>
        </li>
      </ul>
      <p
        v-if="schemaSearchQuery && filteredSchemaItems.length === 0"
        class="pl-4 mt-2 text-xs text-muted"
      >
        No schemas found
      </p>
    </div>
  </div>
</template>
