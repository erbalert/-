import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FinanceProvider from './state/FinanceProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FinanceProvider>
      <App />
    </FinanceProvider>
  </React.StrictMode>
)
