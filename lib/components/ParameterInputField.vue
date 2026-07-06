<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import type {
  RequestEmulatorParamCollectionValue,
  RequestEmulatorParamValue,
  ResolvedParameterInputSpec,
} from '../types'
import { CalendarDate } from '@internationalized/date'
import {
  computed,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'

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

interface InputDateTemplateRef {
  inputsRef?: Array<{ $el?: HTMLElement }>
}

type CalendarModelUpdate = DateValue | {
  start?: DateValue
  end?: DateValue
} | DateValue[] | null | undefined

function encodeOptionValue(value: string | number | boolean): string {
  return `${typeof value}:${String(value)}`
}

const dateInput = useTemplateRef<InputDateTemplateRef>('dateInput')
const isDatePickerOpen = ref(false)
const datePickerLocale = ref<string | undefined>()
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

function toCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  const dateText = normalized.includes('T') ? normalized.split('T')[0] ?? '' : normalized
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
  ) {
    return null
  }

  try {
    const date = new CalendarDate(year, month, day)
    return date.year === year && date.month === month && date.day === day ? date : null
  } catch {
    return null
  }
}

function formatCalendarDate(value: DateValue | null | undefined): string {
  if (!value) {
    return ''
  }

  const year = String(value.year).padStart(4, '0')
  const month = String(value.month).padStart(2, '0')
  const day = String(value.day).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isSingleDateValue(value: CalendarModelUpdate): value is DateValue {
  return !!value
    && !Array.isArray(value)
    && 'year' in value
    && 'month' in value
    && 'day' in value
}

const calendarDateValue = computed<CalendarDate | null>({
  get() {
    return toCalendarDate(props.modelValue)
  },
  set(value) {
    emit('update:modelValue', formatCalendarDate(value))
  },
})

function onCalendarDateUpdate(value: CalendarModelUpdate) {
  emit('update:modelValue', formatCalendarDate(isSingleDateValue(value) ? value : null))
  isDatePickerOpen.value = false
}

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

onMounted(() => {
  datePickerLocale.value = window.navigator.language || undefined
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
      :disabled="disabled"
      class="w-full"
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
      :disabled="disabled"
      class="w-full"
    />

    <UCheckboxGroup
      v-else-if="spec.control === 'checkbox-group'"
      v-model="checkboxValue"
      :items="stringOptions"
      variant="list"
      :disabled="disabled"
      class="w-full"
    />

    <URadioGroup
      v-else-if="spec.control === 'radio-group'"
      v-model="radioValue"
      :items="stringOptions"
      variant="list"
      :disabled="disabled"
      class="w-full"
    />

    <div
      v-else-if="spec.control === 'boolean'"
      class="flex items-center"
    >
      <USwitch
        v-model="booleanValue"
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
      class="w-full"
    />

    <UInputNumber
      v-else-if="spec.control === 'number'"
      v-model="numberValue"
      :min="spec.min ?? undefined"
      :max="spec.max ?? undefined"
      :step="spec.step ?? undefined"
      :placeholder="spec.placeholder"
      :disabled="disabled"
      class="w-full"
    />

    <UTextarea
      v-else-if="spec.control === 'textarea' && spec.multiple"
      v-model="collectionTextValue"
      :placeholder="spec.placeholder"
      :rows="3"
      autoresize
      :maxrows="10"
      :disabled="disabled"
      class="w-full"
    />

    <UInputDate
      v-else-if="spec.control === 'date'"
      ref="dateInput"
      v-model="calendarDateValue"
      :locale="datePickerLocale"
      :disabled="disabled"
      class="w-full"
    >
      <template #trailing>
        <UPopover
          v-model:open="isDatePickerOpen"
          :reference="dateInput?.inputsRef?.[3]?.$el"
          :content="{ side: 'bottom', align: 'end', sideOffset: 8 }"
        >
          <UButton
            color="neutral"
            variant="link"
            icon="i-lucide-calendar"
            :disabled="disabled"
            aria-label="Select a date"
            class="px-0"
          />

          <template #content>
            <UCalendar
              :model-value="calendarDateValue"
              :locale="datePickerLocale"
              :disabled="disabled"
              initial-focus
              class="p-2"
              @update:model-value="onCalendarDateUpdate"
            />
          </template>
        </UPopover>
      </template>
    </UInputDate>

    <UInput
      v-else-if="spec.control === 'time'"
      v-model="stringValue"
      type="time"
      :placeholder="spec.placeholder"
      :disabled="disabled"
      class="w-full"
    />

    <UInput
      v-else-if="spec.control === 'text' && spec.multiple"
      v-model="collectionTextValue"
      :placeholder="spec.placeholder"
      :disabled="disabled"
      class="w-full"
    />

    <UTextarea
      v-else-if="spec.control === 'textarea'"
      v-model="stringValue"
      :placeholder="spec.placeholder"
      :rows="3"
      autoresize
      :maxrows="10"
      :disabled="disabled"
      class="w-full"
    />

    <UInput
      v-else
      v-model="stringValue"
      :placeholder="spec.placeholder"
      :disabled="disabled"
      class="w-full"
    />
  </div>
</template>
