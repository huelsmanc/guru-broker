import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { CONFIG_MISSING } from '@/api/base44Client'
import { installErrorReporting, reportError } from '@/lib/reportError'
import { installNative } from '@/lib/native'

// After a new version is deployed, a tab that was already open asks for page files that no
// longer exist. Reload once to get the new version instead of leaving the page stuck.
// (Safari words it as "'text/html' is not a valid JavaScript MIME type".)
const isStaleChunk = (msg) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch module|not a valid JavaScript MIME type|Unable to preload CSS|Loading (CSS )?chunk|_result\.default/i.test(String(msg || ''));
const freshReload = () => { const u = new URL(window.location.href); u.searchParams.set('v', Date.now().toString(36)); window.location.replace(u.href); };
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem('gbh-reloaded') || 0);
    if (Date.now() - last < 20000) return false;
    sessionStorage.setItem('gbh-reloaded', String(Date.now()));
  } catch { /* ignore */ }
  freshReload();
  return true;
}
if (!CONFIG_MISSING) { installErrorReporting(); installNative(); }
// Don't swallow the error: if we did, the page would try to draw with a missing piece for a moment
// ("undefined is not an object (evaluating '..._result.default')") before the reload.
window.addEventListener('vite:preloadError', () => { reloadOnce(); });
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
  componentDidCatch(error, info) { if (isStaleChunk(error?.message)) reloadOnce(); else reportError(error, { component: info?.componentStack }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Problem title="Something went wrong loading the app">
        <p>Try reloading the page. If it keeps happening, send this message to whoever manages the app:</p>
        <button onClick={freshReload} style={{ margin: '4px 0 12px', padding: '8px 16px', borderRadius: 8, border: 0, background: '#0f172a', color: '#fff', fontSize: 14, cursor: 'pointer' }}>Reload</button>
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
