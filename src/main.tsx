import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/saira-extra-condensed/latin-600.css'
import '@fontsource/saira-extra-condensed/latin-700.css'
import '@fontsource/saira-extra-condensed/latin-800.css'
import '@fontsource/saira-condensed/latin-500.css'
import '@fontsource/saira-condensed/latin-600.css'
import '@fontsource/saira-condensed/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles/base.css'
import './styles/hud.css'
import './styles/panels.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
