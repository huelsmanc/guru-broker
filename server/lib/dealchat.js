// Each transaction has its own group chat: the agent, co-agents and TC. Admins join when
// they open it. Members follow the deal: add a co-agent or change the TC and the chat updates.
const lc = (e) => String(e || '').toLowerCase();

export function dealPeople(tx) {
  return [...new Set([tx.agent_email, tx.tc_email, ...(tx.co_agents || []).map((a) => a.email)].map(lc).filter(Boolean))];
}

export async function syncDealChat(E, tx, { add = [] } = {}) {
  const people = await E.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 5000);
  const byEmail = new Map(people.map((u) => [lc(u.email), u]));
  const [existing] = await E.GroupChat.filter({ brokerage_id: tx.brokerage_id, transaction_id: tx.id }, '-created_date', 1);
  const keepExtra = (existing?.members || []).filter((m) => m.added_as === 'guest').map((m) => lc(m.email));
  const want = [...new Set([...dealPeople(tx), ...keepExtra, ...add.map(lc)])].filter((e) => byEmail.has(e));
  const deal = new Set(dealPeople(tx));
  const members = want.map((e) => ({ id: byEmail.get(e).id, email: e, full_name: byEmail.get(e).display_name || byEmail.get(e).full_name || e, ...(deal.has(e) ? {} : { added_as: 'guest' }) }));
  const name = `🏠 ${String(tx.property_address || 'Deal').split(',')[0]}`;
  if (!existing) {
    return E.GroupChat.create({ brokerage_id: tx.brokerage_id, transaction_id: tx.id, name, auto_name: false, members, created_by_email: lc(tx.agent_email), created_by_name: 'Deal chat', created_by: lc(tx.agent_email) });
  }
  const same = JSON.stringify(existing.members.map((m) => lc(m.email)).sort()) === JSON.stringify(members.map((m) => m.email).sort());
  if (same && existing.name === name) return existing;
  return E.GroupChat.update(existing.id, { members, name, auto_name: false });
}
