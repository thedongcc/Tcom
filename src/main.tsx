import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error handling to diagnose black screen
window.onerror = (message, source, lineno, colno, error) => {
  const errorMsg = `Error: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error?.stack}`;
  console.error(errorMsg);
  // Optional: show in UI if we want to be aggressive during debug
  // alert(errorMsg);
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled promise rejection:', event.reason);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
