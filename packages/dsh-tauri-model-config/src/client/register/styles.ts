import { mountStyle } from 'dsh-tauri-ui/client'
import { defineRegister } from 'dsh-tauri/client'
import { STYLES_ID } from '../constants'
import { modelsStylesNode } from '../models/styles'

export const registerStyles = defineRegister((controller) => {
  controller.add(mountStyle(modelsStylesNode, STYLES_ID))
})
