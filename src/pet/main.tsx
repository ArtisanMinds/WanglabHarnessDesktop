import React from 'react'
import ReactDOM from 'react-dom/client'
import { PetWindow } from './pet'
import './pet.css'

const root = document.getElementById('root') as HTMLElement
root.style.width = '100%'
root.style.height = '100%'

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PetWindow />
  </React.StrictMode>,
)
