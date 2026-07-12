import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FinanceProvider from './state/FinanceProvider'
import ToastProvider from './components/common/Toast'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <FinanceProvider>
        <App />
      </FinanceProvider>
    </ToastProvider>
  </React.StrictMode>
)
