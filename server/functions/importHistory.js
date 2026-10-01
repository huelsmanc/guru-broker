// New: Brokermint commission history and cap starting balances (Import page).
// { action: 'import', rows, createTransactions, batchId }   rows from buildHistory()
// { action: 'undo', batchId }                                 removes one import
// { action: 'list' }                                          past imports
// { action: 'balance', email, values }                        hand-entered starting balance
// { action: 'balances' }                                      every agent's cap year so far
import { createClientFromRequest } from '../lib/base44.js';
import { importHistory, undoImport, listImports, setStartingBalance } from '../lib/importers.js';
import { agentContext } from '../lib/backoffice.js';
import { isAdminRole, can, normalizeRole } from '../../shared/permissions.generated.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const ok = ['owner', 'broker'].includes(normalizeRole(me.role)) || me.role === 'super_admin' || (isAdminRole(me.role) && can(me, 'accounting.access'));
    if (!ok) return Response.json({ error: 'Owner, broker or accounting only' }, { status: 403 });
    const body = await req.json();
    const brokerageId = me.role === 'super_admin' ? (body.brokerage_id || me.brokerage_id) : me.brokerage_id;
    if (!brokerageId) return Response.json({ error: 'Pick a brokerage first' }, { status: 400 });

    if (body.action === 'list') return Response.json({ imports: await listImports({ brokerageId }) });
    if (body.action === 'undo') {
      if (!/^[\w:.-]{4,80}$/.test(String(body.batchId || ''))) return Response.json({ error: 'Bad import id' }, { status: 400 });
      return Response.json(await undoImport({ batchId: body.batchId, brokerageId }));
    }
    if (body.action === 'balance') return Response.json(await setStartingBalance({ email: body.email, values: body.values || {}, brokerageId, actor: me }));
    if (body.action === 'balances') {
      const E = base44.asServiceRole.entities;
      const people = (await E.User.filter({ brokerage_id: brokerageId }, 'full_name', 5000)).filter((u) => !u.suspended);
      const out = [];
      for (const u of people) {
        const ctx = await agentContext(E, u.email, { brokerageId });
        const opening = (await E.CommissionRecord.filter({ agent_email: String(u.email).toLowerCase(), cap_year_start: ctx.cap_year_start }, '-created_date', 50)).find((r) => r.calc?.opening);
        out.push({ email: String(u.email).toLowerCase(), name: u.display_name || u.full_name || u.email, plan: ctx.plan.name, cap: Number(ctx.plan.config?.cap?.amount) || null,
          cap_year_start: ctx.cap_year_start, paid: ctx.ytd.company_dollar, gci: ctx.ytd.gci,
          opening: opening ? { company_dollar: opening.company_dollar, gci: opening.gross_share, units: opening.calc?.units_share || 0, revshare: opening.revshare_total || 0 } : null });
      }
      return Response.json({ agents: out });
    }
    const rows = (body.rows || []).slice(0, 60);
    const batchId = String(body.batchId || '');
    if (!/^[\w:.-]{4,80}$/.test(batchId)) return Response.json({ error: 'Bad import id' }, { status: 400 });
    return Response.json(await importHistory({ rows, brokerageId, createTransactions: body.createTransactions !== false, batchId, actor: me }));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
