import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'

const root = document.getElementById('root')
if (!root) throw new Error('Elemen root aplikasi tidak ditemukan')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
