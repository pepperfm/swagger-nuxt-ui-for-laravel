import type { App, Plugin } from 'vue'
import SwaggerViewer from './components/SwaggerViewer.vue'
import './styles/swagger-ui.css'

export { default as ContentNavigation } from './components/ContentNavigation.vue'
export { default as EndpointRequestCard } from './components/EndpointRequestCard.vue'
export { default as ParameterInputField } from './components/ParameterInputField.vue'
export { default as RequestBodyCard } from './components/RequestBodyCard.vue'
export { default as RequestBodyEditor } from './components/RequestBodyEditor.vue'
export { default as RequestBodyFormFields } from './components/RequestBodyFormFields.vue'
export { default as RequestParametersList } from './components/RequestParametersList.vue'
export { default as ResponseExampleCard } from './components/ResponseExampleCard.vue'
export { default as SchemaDetailCard } from './components/SchemaDetailCard.vue'
export { default as SwaggerViewer } from './components/SwaggerViewer.vue'

export {
  buildEndpointAnchor,
  buildSchemaAnchor,
  extractOperationIdFromAnchor,
  extractSchemaNameFromAnchor,
  normalizeNavigationAnchor,
  resolveAnchorFromLocation,
} from './composables/navigationAnchor'
export {
  buildRequestBodyFromFormValues,
  createInitialRequestBodyFormValues,
  hydrateRequestBodyFormValues,
} from './composables/requestBodyFormState'
export { resolveRequestBodyFormInputs } from './composables/requestBodyInputResolver'
export { resolveRequestBodySchemaForPathValues } from './composables/requestBodySchemaResolver'
export type { RequestBodySchemaResolution } from './composables/requestBodySchemaResolver'
export {
  buildCurlCommand,
  buildRequestUrl,
  buildSecuritySchemeMetaMap,
  interpolatePathParams,
  normalizeSecuritySchemeMeta,
  resolveRequestAuthorization,
  serializeQueryParams,
} from './composables/requestEmulatorUtils'
export {
  isParameterValueEmpty,
  resolveInitialParameterValue,
  resolveParameterInputSpec,
  serializeParameterValue,
} from './composables/requestParameterInputResolver'
export { generateExampleFromSchema } from './composables/schemaExample'
export { useCopy } from './composables/useCopy'
export { useRequestEmulator } from './composables/useRequestEmulator'
export { useSelectedOperation } from './composables/useSelectedOperation'
export { useSwaggerNavigation } from './composables/useSwaggerNavigation'
export { useSwaggerSchema } from './composables/useSwaggerSchema'
export { useViewerAuthorization } from './composables/useViewerAuthorization'

export type {
  AuthorizationResolveResult,
  AuthorizationTarget,
  EndpointSelection,
  HttpMethod,
  IApiSpec,
  IMethod,
  INavigationGroup,
  INavigationItem,
  IParameter,
  NavigationIndex,
  NormalizedSecuritySchemeKind,
  NormalizedSecuritySchemeMeta,
  OpenApiComponents,
  OpenApiParameterLocation,
  OpenApiSchemaObject,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  RequestBodyEditorMode,
  RequestBodyFormInput,
  RequestBodyFormResolutionResult,
  RequestBodyFormValueMap,
  RequestEmulatorExecutionError,
  RequestEmulatorExecutionState,
  RequestEmulatorParamCollectionValue,
  RequestEmulatorParamControl,
  RequestEmulatorParamInput,
  RequestEmulatorParamOption,
  RequestEmulatorParamScalarValue,
  RequestEmulatorParamSerializationHint,
  RequestEmulatorParamValue,
  RequestEmulatorPreparedRequest,
  RequestEmulatorResponseResult,
  RequestEmulatorValidationError,
  ResolvedParameterInputSpec,
  ResponseExample,
  SchemaSelection,
  SelectedItem,
  ViewerAuthorizationState,
} from './types'

export function createSwaggerUiPlugin(): Plugin {
  return {
    install(app: App) {
      app.component('SwaggerViewer', SwaggerViewer)
    },
  }
}
