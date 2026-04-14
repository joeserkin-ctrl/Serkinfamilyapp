import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FamilyPulseProvider } from './state/AppState.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FamilyPulseProvider>
      <App />
    </FamilyPulseProvider>
  </StrictMode>,
)
