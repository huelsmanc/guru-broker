import React from 'react';
import { useParams, useSearchParams, useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, ArrowLeft, ListChecks, FileText, Handshake, Users, DollarSign, Share2, Activity, LayoutDashboard } from 'lucide-react';
import { can, isAdminRole } from '../../shared/permissions.generated.js';
import WorkspaceOverview from '@/components/workspace/WorkspaceOverview';
import WorkspaceChecklists from '@/components/workspace/WorkspaceChecklists';
import WorkspaceDocuments from '@/components/workspace/WorkspaceDocuments';
import WorkspaceContacts from '@/components/workspace/WorkspaceContacts';
import WorkspaceFinances from '@/components/workspace/WorkspaceFinances';
import WorkspaceActivity from '@/components/workspace/WorkspaceActivity';
import WorkspaceOffers from '@/components/workspace/WorkspaceOffers';
import WorkspaceShared from '@/components/workspace/WorkspaceShared';
import { useLiveTable } from '@/hooks/useLiveTable';

const STATUS = {
  active: 'bg-blue-100 text-blue-800', pending: 'bg-amber-100 text-amber-800', clear_to_close: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-800', cancelled: 'bg-red-100 text-red-800',
};

// One transaction, Brokermint-style: a left rail of sections and the work on the right.
export default function TransactionWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const tab = params.get('tab') || 'overview';

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => base44.entities.Transaction.get(id),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['transaction', id] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };
  // Live: someone else (TC, broker) changing the deal shows up right away.
  useLiveTable('Transaction', (e) => e.id === id && refresh());

  if (isLoading) return <div className="h-[70vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error || !tx) return <div className="p-10 text-center text-muted-foreground">This transaction doesn't exist or you don't have access to it.</div>;

  const email = user?.email?.toLowerCase();
  const isOwner = [tx.agent_email, ...(tx.co_agents || []).map((a) => a.email)].map((e) => String(e || '').toLowerCase()).includes(email);
  const isTc = String(tx.tc_email || '').toLowerCase() === email;
  const admin = isAdminRole(user?.role);
  const ctx = { tx, user, refresh, isOwner, isTc, admin, canEdit: admin || isOwner || isTc || can(user, 'tx.all') };

  const sections = [
    ['overview', 'Overview', LayoutDashboard],
    ['checklists', 'Checklists', ListChecks],
    ['documents', 'Documents', FileText],
    ['offers', 'Offers', Handshake],
    ['contacts', 'Users & contacts', Users],
    ...(admin || can(user, 'tx.view_commissions') || isOwner ? [['finances', 'Finances', DollarSign]] : []),
    ['shared', 'Shared', Share2],
    ...(admin || can(user, 'activity.transaction') ? [['activity', 'Activity', Activity]] : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
      <aside className="lg:w-60 bg-slate-900 text-slate-100 lg:min-h-full flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <Link to="/Transactions" className="text-xs text-emerald-300 flex items-center gap-1 mb-3 hover:underline"><ArrowLeft className="w-3 h-3" /> All transactions</Link>
          <p className="font-semibold leading-snug">{tx.property_address}</p>
          <p className="text-xs text-slate-400 mt-1">{tx.agent_name || tx.agent_email}{tx.tc_name ? ` · TC ${tx.tc_name}` : ''}</p>
          <span className={`inline-block mt-2 text-[11px] font-semibold rounded px-2 py-0.5 ${STATUS[tx.status] || 'bg-slate-100 text-slate-700'}`}>{(tx.status || 'active').replace(/_/g, ' ')}</span>
        </div>
        <nav className="flex lg:flex-col overflow-x-auto p-2 gap-1">
          {sections.map(([key, label, Icon]) => (
            <button key={key} onClick={() => setParams({ tab: key })}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap text-left ${tab === key ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-white/10'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        {tab === 'overview' && <WorkspaceOverview {...ctx} />}
        {tab === 'checklists' && <WorkspaceChecklists {...ctx} />}
        {tab === 'documents' && <WorkspaceDocuments {...ctx} />}
        {tab === 'offers' && <WorkspaceOffers {...ctx} />}
        {tab === 'contacts' && <WorkspaceContacts {...ctx} />}
        {tab === 'finances' && <WorkspaceFinances {...ctx} />}
        {tab === 'shared' && <WorkspaceShared {...ctx} />}
        {tab === 'activity' && <WorkspaceActivity {...ctx} />}
      </main>
    </div>
  );
}
