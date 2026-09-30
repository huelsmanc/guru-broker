// Scheduled every 15 minutes: pulls new and changed listings from each MLS into
// mls_listing. Resumes where it left off, so the first full download spreads over
// several runs.
import { adminClient } from '../lib/base44.js';
import { mlsSources, pullBatch } from '../lib/mls.js';

const TIME_BUDGET_MS = 45_000;
const START = '2000-01-01T00:00:00Z';

export default async (req) => {
  const started = Date.now();
  const db = adminClient();
  const report = {};
  const only = new URL(req.url).searchParams.get('source');
  for (const cfg of mlsSources().filter((c) => !only || c.id === only)) {
    const { data: st } = await db.from('mls_sync_state').select('*').eq('source', cfg.id).maybeSingle();
    let state = st || { source: cfg.id, cursor: START, page_offset: 1, window_max: null, total_count: 0 };
    let pulled = 0;
    try {
      while (Date.now() - started < TIME_BUDGET_MS) {
        const { rows, done, sorted } = await pullBatch(cfg, state.cursor || START, state.page_offset || 1);
        if (rows.length) {
          for (let i = 0; i < rows.length; i += 200) {
            const { error } = await db.from('mls_listing').upsert(rows.slice(i, i + 200), { onConflict: 'id' });
            if (error) throw new Error(error.message);
          }
          pulled += rows.length;
        }
        const newest = rows.reduce((m, r) => (r.modified_at && (!m || r.modified_at > m) ? r.modified_at : m), state.window_max);
        if (sorted) {
          state = { ...state, cursor: newest || state.cursor, window_max: null, page_offset: 1 };
        } else if (done) {
          state = { ...state, cursor: newest || state.cursor, window_max: null, page_offset: 1 };
        } else {
          state = { ...state, window_max: newest, page_offset: (state.page_offset || 1) + rows.length };
        }
        if (done) break;
      }
      state = { ...state, last_run: new Date().toISOString(), last_ok: new Date().toISOString(), last_count: pulled, total_count: (state.total_count || 0) + pulled, last_error: null };
      report[cfg.id] = { pulled, cursor: state.cursor };
    } catch (err) {
      console.error(`mlsSync ${cfg.id}:`, err);
      state = { ...state, last_run: new Date().toISOString(), last_count: pulled, last_error: String(err.message || err).slice(0, 500) };
      report[cfg.id] = { pulled, error: state.last_error };
    }
    await db.from('mls_sync_state').upsert(state, { onConflict: 'source' });
  }
  if (!Object.keys(report).length) return Response.json({ status: 'no MLS configured (set MLS_SOURCES)' });
  return Response.json({ status: 'ok', report });
};
