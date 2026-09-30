import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Section, Empty, money, Pill } from './ui';

// Offers linked to this deal (the offer it was opened from, and any on the same property).
export default function WorkspaceOffers({ tx }) {
  const street = String(tx.property_address || '').split(',')[0].trim().toLowerCase();
  const { data: offers = [] } = useQuery({
    queryKey: ['tx-offers', tx.id],
    queryFn: async () => {
      const rows = await base44.entities.Offer.list('-created_date', 500);
      return rows.filter((o) => o.transaction_id === tx.id || o.id === tx.offer_id || (street && String(o.property_address || '').toLowerCase().startsWith(street)));
    },
  });
  return (
    <div className="max-w-4xl">
      <Section title="Offers" actions={<Link to="/Offers" className="text-sm text-primary hover:underline">Open Offer Builder</Link>}>
        {!offers.length ? <Empty>No offers for this property yet.</Empty> : (
          <ul className="divide-y rounded-xl border bg-card">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Link to={`/Offers?open=${o.id}`} className="flex-1 hover:underline">{o.property_address} · {money(o.offer_price)}</Link>
                <span className="text-muted-foreground text-xs">{new Date(o.created_date).toLocaleDateString()}</span>
                <Pill status={o.status === 'accepted' ? 'approved' : o.status}>{o.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
