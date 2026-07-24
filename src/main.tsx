import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import './style.css'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter basename="/Bootleg-Bots">
      <AuthProvider><App /></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
