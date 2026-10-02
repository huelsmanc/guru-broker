// Adds one entry to a deal's list (documents, esign_docs, co_agents, updates) inside the database in
// one step, so entries added at the same moment by different people are all kept.
// `client` is a Supabase client: the person's own in the app, the service client on the server.
export async function dealAppend(client, dealId, list, item) {
  const { error } = await client.rpc('deal_append', { p_id: String(dealId), p_col: list, p_item: item });
  if (!error) return;
  // Database not updated yet (migration 0017): fall back to read-then-write.
  if (error.code === 'PGRST202' || /deal_append|could not find the function|does not exist/i.test(error.message || '')) {
    const { data: row, error: e1 } = await client.from('transaction').select(list).eq('id', String(dealId)).single();
    if (e1 || !row) throw Object.assign(new Error('Deal not found'), { status: 404 });
    const cur = Array.isArray(row[list]) ? row[list] : [];
    const { error: e2 } = await client.from('transaction').update({ [list]: [...cur, item] }).eq('id', String(dealId));
    if (e2) throw new Error(e2.message);
    return;
  }
  throw Object.assign(new Error(error.message || 'Could not update the deal'), { status: /not found|not allowed/i.test(error.message || '') ? 404 : 500 });
}
