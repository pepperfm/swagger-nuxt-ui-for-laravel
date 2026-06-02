<script setup lang="ts">
import type {
  RequestEmulatorParamCollectionValue,
  RequestEmulatorParamValue,
  ResolvedParameterInputSpec,
} from '../types'
import { computed, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: RequestEmulatorParamValue
  spec: ResolvedParameterInputSpec
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RequestEmulatorParamValue): void
}>()

function encodeOptionValue(value: string | number | boolean): string {
  return `${typeof value}:${String(value)}`
}

const controlSize = 'md'
const sliderMin = computed(() => props.spec.min ?? 0)
const sliderMax = computed(() => props.spec.max ?? 100)
const sliderStep = computed(() => {
  if (props.spec.step !== null && props.spec.step > 0) {
    return props.spec.step
  }

  return props.spec.valueKind === 'integer' ? 1 : 0.1
})

const stringValue = computed<string>({
  get() {
    if (typeof props.modelValue === 'string') {
      return props.modelValue
    }

    if (props.modelValue === null || props.modelValue === undefined) {
      return ''
    }

    return String(props.modelValue)
  },
  set(value) {
    emit('update:modelValue', value)
  },
})

const numberValue = computed<number | undefined>({
  get() {
    return typeof props.modelValue === 'number' && Number.isFinite(props.modelValue)
      ? props.modelValue
      : undefined
  },
  set(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      emit('update:modelValue', null)
      return
    }

    if (props.spec.valueKind === 'integer') {
      emit('update:modelValue', Math.trunc(value))
      return
    }

    emit('update:modelValue', value)
  },
})

const sliderValue = computed<number>({
  get() {
    if (typeof props.modelValue === 'number' && Number.isFinite(props.modelValue)) {
      return props.modelValue
    }

    return sliderMin.value
  },
  set(value) {
    if (props.spec.valueKind === 'integer') {
      emit('update:modelValue', Math.trunc(value))
      return
    }

    emit('update:modelValue', value)
  },
})

const booleanValue = computed<boolean>({
  get() {
    return props.modelValue === true
  },
  set(value) {
    emit('update:modelValue', value)
  },
})

const collectionValue = computed<RequestEmulatorParamCollectionValue>({
  get() {
    return Array.isArray(props.modelValue) ? props.modelValue : []
  },
  set(value) {
    emit('update:modelValue', value)
  },
})

const stringOptions = computed(() => {
  return props.spec.options.map(option => ({
    label: option.label,
    value: encodeOptionValue(option.value),
  }))
})

const encodedOptionMap = computed(() => {
  const map = new Map<string, string | number | boolean>()
  props.spec.options.forEach((option) => {
    map.set(encodeOptionValue(option.value), option.value)
  })
  return map
})

function parseCollectionItem(raw: string): string | number | boolean | null {
  const normalized = raw.trim()
  if (!normalized) {
    return null
  }

  if (props.spec.arrayItemKind === 'integer' || props.spec.arrayItemKind === 'number') {
    const numeric = Number(normalized)
    if (!Number.isFinite(numeric)) {
      return null
    }

    if (props.spec.arrayItemKind === 'integer') {
      return Math.trunc(numeric)
    }

    return numeric
  }

  if (props.spec.arrayItemKind === 'boolean') {
    if (normalized.toLowerCase() === 'true') {
      return true
    }
    if (normalized.toLowerCase() === 'false') {
      return false
    }
    return null
  }

  return normalized
}

const collectionTextValue = computed<string>({
  get() {
    if (!Array.isArray(props.modelValue)) {
      return ''
    }

    return props.modelValue.map(value => String(value)).join(', ')
  },
  set(value) {
    const items = value
      .split(',')
      .map(parseCollectionItem)
      .filter((item): item is string | number | boolean => item !== null)

    emit('update:modelValue', items)
  },
})

const selectValue = computed<string | number | boolean | undefined>({
  get() {
    return !Array.isArray(props.modelValue) && props.modelValue !== null
      ? props.modelValue
      : undefined
  },
  set(value) {
    if (value === undefined) {
      emit('update:modelValue', null)
      return
    }

    emit('update:modelValue', value)
  },
})

const checkboxValue = computed<string[]>({
  get() {
    if (!Array.isArray(props.modelValue)) {
      return []
    }

    return props.modelValue.map(value => encodeOptionValue(value))
  },
  set(values) {
    const next = values
      .map(value => encodedOptionMap.value.get(value))
      .filter((value): value is string | number | boolean => value !== undefined)

    emit('update:modelValue', next)
  },
})

const radioValue = computed<string | undefined>({
  get() {
    if (props.modelValue === null || Array.isArray(props.modelValue)) {
      return undefined
    }

    return encodeOptionValue(props.modelValue)
  },
  set(value) {
    if (!value) {
      emit('update:modelValue', null)
      return
    }

    emit('update:modelValue', encodedOptionMap.value.get(value) ?? null)
  },
})

watch(
  () => props.spec.control,
  (control) => {
    if (
      control === 'text'
      || control === 'textarea'
      || control === 'number'
      || control === 'boolean'
      || control === 'select'
      || control === 'multi-select'
      || control === 'checkbox-group'
      || control === 'radio-group'
      || control === 'date'
      || control === 'time'
      || control === 'slider'
    ) {
      return
    }

    console.warn('[ParameterInputField] Unsupported control type fallback', { control })
  },
  { immediate: true },
)
</script>

<template>
  <div class="swagger-ui-param-control">
    <USelectMenu
      v-if="spec.control === 'select'"
      v-model="selectValue"
      :items="spec.options"
      value-key="value"
      label-key="label"
      :placeholder="spec.placeholder"
      :search-input="true"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <USelectMenu
      v-else-if="spec.control === 'multi-select'"
      v-model="collectionValue"
      :items="spec.options"
      value-key="value"
      label-key="label"
      :placeholder="spec.placeholder"
      :search-input="true"
      multiple
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <UCheckboxGroup
      v-else-if="spec.control === 'checkbox-group'"
      v-model="checkboxValue"
      :items="stringOptions"
      variant="list"
      :size="controlSize"
      :disabled="disabled"
      class="w-full"
    />

    <URadioGroup
      v-else-if="spec.control === 'radio-group'"
      v-model="radioValue"
      :items="stringOptions"
      variant="list"
      :size="controlSize"
      :disabled="disabled"
      class="w-full"
    />

    <div
      v-else-if="spec.control === 'boolean'"
      class="min-h-11 flex items-center"
    >
      <USwitch
        v-model="booleanValue"
        :size="controlSize"
        :disabled="disabled"
      />
    </div>

    <USlider
      v-else-if="spec.control === 'slider'"
      v-model="sliderValue"
      :min="sliderMin"
      :max="sliderMax"
      :step="sliderStep"
      :disabled="disabled"
      :size="controlSize"
      class="w-full min-h-11"
    />

    <UInputNumber
      v-else-if="spec.control === 'number'"
      v-model="numberValue"
      :min="spec.min ?? undefined"
      :max="spec.max ?? undefined"
      :step="spec.step ?? undefined"
      :placeholder="spec.placeholder"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <UTextarea
      v-else-if="spec.control === 'textarea' && spec.multiple"
      v-model="collectionTextValue"
      :placeholder="spec.placeholder"
      :rows="3"
      autoresize
      :maxrows="10"
      :size="controlSize"
      :disabled="disabled"
      class="w-full"
    />

    <UInput
      v-else-if="spec.control === 'date'"
      v-model="stringValue"
      type="date"
      :placeholder="spec.placeholder"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <UInput
      v-else-if="spec.control === 'time'"
      v-model="stringValue"
      type="time"
      :placeholder="spec.placeholder"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <UInput
      v-else-if="spec.control === 'text' && spec.multiple"
      v-model="collectionTextValue"
      :placeholder="spec.placeholder"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />

    <UTextarea
      v-else-if="spec.control === 'textarea'"
      v-model="stringValue"
      :placeholder="spec.placeholder"
      :rows="3"
      autoresize
      :maxrows="10"
      :size="controlSize"
      :disabled="disabled"
      class="w-full"
    />

    <UInput
      v-else
      v-model="stringValue"
      :placeholder="spec.placeholder"
      :size="controlSize"
      :disabled="disabled"
      class="w-full min-h-11"
    />
  </div>
</template>
