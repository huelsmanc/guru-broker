// If one page crashes, show a short message in its place and keep the menu working, instead of
// replacing the whole app. Reported to the platform owner's error list automatically.
import React from 'react';
import { reportError } from '@/lib/reportError';

const stale = (m) => /dynamically imported module|Importing a module script failed|Failed to fetch module|not a valid JavaScript MIME type|Unable to preload CSS|_result\.default/i.test(String(m || ''));

export default class PageErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    if (stale(error?.message)) {
      // A newer version was deployed while this page was open: reload once to get it.
      let last = 0; try { last = Number(sessionStorage.getItem('gbh-reloaded') || 0); } catch { /* ignore */ }
      if (Date.now() - last > 20000) { try { sessionStorage.setItem('gbh-reloaded', String(Date.now())); } catch { /* ignore */ } window.location.reload(); return; }
    }
    reportError(error, { component: info?.componentStack });
  }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-lg mx-auto mt-[12vh] px-6 text-center">
        <p className="text-lg font-semibold">This page hit a problem</p>
        <p className="text-sm text-muted-foreground mt-2">It's been reported automatically. Try again, or use the menu to go somewhere else.</p>
        <div className="flex justify-center gap-2 mt-5">
          <button onClick={() => this.setState({ error: null })} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">Try again</button>
          <button onClick={() => window.location.reload()} className="rounded-lg border px-4 py-2 text-sm">Reload</button>
        </div>
        <p className="text-xs text-muted-foreground mt-6 break-words">{String(this.state.error?.message || '').slice(0, 200)}</p>
      </div>
    );
  }
}
