import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import checkboxStyle from '../components/checkbox.cssr'
import { configEditorStyle } from '../components/model-extras/config-editor.cssr'
import modelCompatFieldsStyle from '../components/model-extras/model-compat-fields.cssr'
import modelExtrasStyle from '../components/model-extras/model-extras.cssr'
import segmentedControlStyle from '../components/segmented-control.cssr'
import {
  CHECKBOX_STYLE_ID,
  GLOBAL_STYLE_ID,
  MODEL_COMPAT_FIELDS_STYLE_ID,
  MODEL_CONFIG_TOOLBAR_STYLE_ID,
  MODEL_EXTRAS_STYLE_ID,
  SEGMENTED_CONTROL_STYLE_ID,
  TURN_NAVIGATION_STYLE_ID,
} from '../constants'
import globalStyle from '../styles/global.cssr'
import turnNavigationStyle from '../styles/index.cssr'
import { mountStyle } from '../utils/style'

export const registerStyles = defineRegister<ClientContext>((controller) => {
  controller.add(mountStyle(globalStyle, GLOBAL_STYLE_ID))
  controller.add(mountStyle(turnNavigationStyle, TURN_NAVIGATION_STYLE_ID))
  controller.add(mountStyle(modelExtrasStyle, MODEL_EXTRAS_STYLE_ID))
  controller.add(mountStyle(configEditorStyle, MODEL_CONFIG_TOOLBAR_STYLE_ID))
  controller.add(mountStyle(modelCompatFieldsStyle, MODEL_COMPAT_FIELDS_STYLE_ID))
  controller.add(mountStyle(segmentedControlStyle, SEGMENTED_CONTROL_STYLE_ID))
  controller.add(mountStyle(checkboxStyle, CHECKBOX_STYLE_ID))
})
