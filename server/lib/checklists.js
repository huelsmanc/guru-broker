// Turns a checklist template into a live checklist on a deal or an agent's onboarding.
// Template items can carry a preloaded form (form_url/form_name) that the agent uses
// instead of hunting for the blank document.
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export async function applyTemplate(E, tpl, { brokerageId, subjectType, subjectId, owner }) {
  const items = (tpl.items || []).map((i) => ({
    ...i, id: newId(), status: 'open', assignee_email: i.assignee_email || owner, comments: [], history: [],
  }));
  return E.Checklist.create({
    brokerage_id: brokerageId, subject_type: subjectType, subject_id: subjectId, subject_email: owner,
    template_id: tpl.id, name: tpl.name, items, status: 'open',
  });
}
