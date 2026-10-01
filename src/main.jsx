import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { CONFIG_MISSING } from '@/api/base44Client'

// Shows what went wrong instead of a blank white page.
function Problem({ title, children }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '15vh auto', padding: '0 16px', color: '#0f172a' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
      <div style={{ color: '#475569', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Problem title="Something went wrong loading the app">
        <p>Try reloading the page. If it keeps happening, send this message to whoever manages the app:</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f1f5f9', padding: 12, borderRadius: 8, fontSize: 13 }}>{String(this.state.error?.message || this.state.error)}</pre>
      </Problem>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  CONFIG_MISSING ? (
    <Problem title="The app isn't connected to its database yet">
      <p>Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in Vercel (Settings → Environment Variables), then redeploy. These two are read when the app is built, so a redeploy is needed after adding them.</p>
    </Problem>
  ) : (
    <ErrorBoundary><App /></ErrorBoundary>
  )
)
