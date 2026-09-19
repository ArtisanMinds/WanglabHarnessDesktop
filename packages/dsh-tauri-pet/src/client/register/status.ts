import { defineRegister, listenParent } from 'dsh-tauri/client'
import { PET_STATUS_MESSAGE } from '../constants'
import { getPetStatus } from '../service/pet.invoke'
import { store } from '../store'
import { isPetStatus } from '../utils/status'

export const statusFeature = defineRegister((controller) => {
  controller.add(listenParent((data) => {
    if (isPetStatus(data.status))
      store.pet.setStatus(data.status)
  }, PET_STATUS_MESSAGE))
  const revision = store.pet.beginFetch()
  void getPetStatus().then((status) => {
    if (!controller.isDisposed())
      store.pet.commitFetch(revision, status)
  }).catch(error => console.error('[dsh-tauri-pet] status sync failed:', error))
})
