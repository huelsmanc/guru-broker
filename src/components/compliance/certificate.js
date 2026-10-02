// Opens an agent's certificate PDF. The tab is opened right away (on the tap) and pointed at the
// file once it's ready, so phones don't block it as a pop-up.
import { base44 } from '@/api/base44Client';

export async function openCertificate(attemptId) {
  const tab = window.open('', '_blank');
  try {
    const { url } = (await base44.functions.invoke('training', { action: 'certificate', attempt_id: attemptId })).data;
    if (tab && !tab.closed) tab.location.href = url; else window.location.href = url;
  } catch (err) {
    try { tab?.close(); } catch { /* ignore */ }
    window.alert(err.message || 'Could not open the certificate.');
  }
}

/** Latest passing attempt per training: { [trainingId]: attempt }. */
export function passesByTraining(attempts = []) {
  const out = {};
  for (const a of attempts) {
    if (!a.passed) continue;
    const cur = out[a.training_id];
    if (!cur || String(a.created_date) > String(cur.created_date)) out[a.training_id] = a;
  }
  return out;
}
