import { base44 } from '@/api/base44Client';

// The agent's contact book (Contact entity). Private to the agent and their brokerage admins.

export const CONTACT_TYPES = ['buyer', 'seller', 'tenant', 'landlord', 'lender', 'title / closing attorney', 'attorney', 'inspector', 'appraiser', 'agent', 'vendor', 'past client', 'lead', 'other'];

const lc = (v) => String(v || '').trim().toLowerCase();

/** Everyone in the signed-in person's own contact book. */
export function myContacts(user, limit = 2000) {
  if (!user?.email) return Promise.resolve([]);
  return base44.entities.Contact.filter({ owner_email: lc(user.email) }, 'name', limit);
}

/**
 * Adds someone to the person's contact book, or fills in blanks on the existing entry with
 * the same email (or same name when there's no email). Returns the contact.
 */
export async function saveToContactBook(user, person, existing) {
  const email = lc(person.email);
  const name = String(person.name || '').trim();
  if (!name && !email) return null;
  const list = existing || await myContacts(user);
  const match = list.find((c) => (email && lc(c.email) === email) || (!email && name && lc(c.name) === lc(name)));
  const clean = {
    name: name || email.split('@')[0],
    email: email || null,
    phone: person.phone || null,
    company: person.company || null,
    type: person.type || person.role || null,
  };
  if (match) {
    const patch = {};
    for (const [k, v] of Object.entries(clean)) if (v && !match[k]) patch[k] = v;
    return Object.keys(patch).length ? base44.entities.Contact.update(match.id, patch) : match;
  }
  return base44.entities.Contact.create({
    ...clean,
    owner_email: lc(user.email),
    owner_name: user.full_name || user.display_name || null,
    brokerage_id: user.brokerage_id,
    source: person.source || 'manual',
    tags: [],
  });
}

/** Deal-contact role from a contact-book type. */
export function roleFor(type) {
  const t = lc(type);
  if (['buyer', 'seller', 'tenant', 'landlord', 'lender', 'title / closing attorney', 'inspector', 'appraiser', 'attorney'].includes(t)) return t;
  if (t === 'agent') return "buyer's agent";
  return 'other';
}
