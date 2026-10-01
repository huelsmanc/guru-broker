import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { CONFIG_MISSING } from '@/api/base44Client'

// After a new version is deployed, a tab that was already open asks for page files that no
// longer exist. Reload once to get the new version instead of leaving the page stuck.
const isStaleChunk = (msg) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch module/i.test(String(msg || ''));
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem('gbh-reloaded') || 0);
    if (Date.now() - last < 20000) return false;
    sessionStorage.setItem('gbh-reloaded', String(Date.now()));
  } catch { /* ignore */ }
  window.location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { if (isStaleChunk(e.reason?.message)) reloadOnce(); });

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
  componentDidCatch(error) { if (isStaleChunk(error?.message)) reloadOnce() }
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
