import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserSearch, SquareArrowOutUpRight, MessageSquare, Phone, LayoutDashboard, Monitor, LogOut, Users, Settings as SettingsIcon, Building2, UserCircle, TrendingUp, UserPlus, Mail, Trophy, BookOpen, FileText, Heart, Lightbulb, Calendar, FolderOpen, Link2, Wand2, Target, Calculator, File, Gift, Star, ClipboardList, Handshake, Wallet, Banknote, Percent, BarChart3, Activity as ActivityIcon, FileCheck2, ListChecks, Megaphone, Database, ShoppingBag } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import NotificationBell from './NotificationBell';
import ChatChannelsDropdown from './ChatChannelsDropdown';

import { useQuery } from '@tanstack/react-query';
import { useBranding } from '@/lib/branding';
import { useChat } from '@/lib/chat/ChatProvider';
import { isAdminRole, normalizeRole, can } from '../../../shared/permissions.generated.js';
import { approvesDealItems } from '../../../shared/access.js';

export default function Sidebar({ user, brokerageId, onChannelClick, mobile }) {
  const location = useLocation();
  const isAdmin = isAdminRole(user?.role);
  // Name, logo and colors: shown instantly from this device, refreshed in the background.
  const brand = useBranding(user?.brokerage_id);
  // Follow Up Boss: My Leads and a link to it, once the brokerage has connected it.
  const { data: fubMe } = useQuery({
    queryKey: ['fub-me', user?.brokerage_id],
    enabled: !!user?.brokerage_id,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => (await base44.functions.invoke('fub', { action: 'me' })).data,
  });

  // Unread DMs and group messages (live)
  const chat = useChat();
  const unreadDmCount = chat?.totals.dms || 0;

  const isSuperAdmin = user?.role === 'super_admin';

  const superAdminLinks = [
    { to: '/SuperAdmin', icon: Building2, label: 'Brokerages' },
    { to: '/Import', icon: Database, label: 'Import Data' },
  ];

  const agentLinks = [
    { to: '/Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/Chat', icon: MessageSquare, label: 'Support Chat' },
    { to: '/DirectMessages', icon: Mail, label: 'Direct Messages' },
    { to: '/Culture', icon: Heart, label: 'Culture' },
    { to: '/FileRepository', icon: FolderOpen, label: 'File Repository' },
    { to: '/ScheduleCalls', icon: Phone, label: 'Schedule Call' },
    { to: '/ComplianceTraining', icon: BookOpen, label: 'Compliance Training' },
    { to: '/ESignDocuments', icon: FileText, label: 'E-Sign Documents' },
    { to: '/TechLinks', icon: Link2, label: 'Tech Links' },
    { to: '/Marketing', icon: Megaphone, label: 'Marketing' },
    { to: '/GearStore', icon: ShoppingBag, label: 'Gear Store' },
    { to: '/SalesCoach', icon: Target, label: 'AI Sales Coach' },
    { to: '/Offers', icon: Handshake, label: 'Offers & Contracts' },
    { to: '/Contacts', icon: Users, label: 'Contacts' },
    { to: '/Transactions', icon: ClipboardList, label: 'Transactions' },
    { to: '/Profile', icon: UserCircle, label: 'My Profile' },
  ];

  const brokerLinks = [
    { to: '/Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/BrokerMonitor', icon: Monitor, label: 'Monitor Chats' },
    { to: '/AgentLeaderboard', icon: Trophy, label: 'Agent Performance' },
    { to: '/AgentPulse', icon: ActivityIcon, label: 'Agent Pulse' },
    { to: '/Culture', icon: Heart, label: 'Culture' },
    { to: '/FileRepository', icon: FolderOpen, label: 'File Repository' },
    { to: '/ComplianceTraining', icon: BookOpen, label: 'Compliance Training' },
    { to: '/ESignDocuments', icon: FileText, label: 'E-Sign Documents' },
    { to: '/DirectMessages', icon: Mail, label: 'Direct Messages' },
    { to: '/ScheduleCalls', icon: Phone, label: 'Calls' },
    { to: '/TechLinks', icon: Link2, label: 'Tech Links' },
    { to: '/Marketing', icon: Megaphone, label: 'Marketing' },
    { to: '/GearStore', icon: ShoppingBag, label: 'Gear Store' },
    { to: '/SalesCoach', icon: Target, label: 'AI Sales Coach' },
    { to: '/Offers', icon: Handshake, label: 'Offers & Contracts' },
    { to: '/Contacts', icon: Users, label: 'Contacts' },
    { to: '/Transactions', icon: ClipboardList, label: 'Transactions' },
    { to: '/Settings', icon: SettingsIcon, label: 'Settings' },
    { to: '/Profile', icon: UserCircle, label: 'My Profile' },
  ];

  // Back office: shown to anyone whose role or permissions allow it (e.g. a TC who approves documents).
  const inBrokerage = !!brokerageId;
  const backOffice = inBrokerage ? [
    { to: '/MyCommissions', icon: Wallet, label: 'My Commissions', show: !isSuperAdmin },
    { to: '/ApproveDocs', icon: FileCheck2, label: 'Approve Docs', show: isAdmin || can(user, 'docs.approve') || approvesDealItems(user) },
    { to: '/Payouts', icon: Banknote, label: 'Payouts', show: can(user, 'accounting.access') },
    { to: '/CommissionPlans', icon: Percent, label: 'Commission Plans', show: isAdmin },
    { to: '/ChecklistTemplates', icon: ListChecks, label: 'Checklist Templates', show: isAdmin },
    { to: '/Reports', icon: BarChart3, label: 'Reports', show: can(user, 'reports.company') },
    { to: '/Activity', icon: ActivityIcon, label: 'Activity', show: isAdmin || can(user, 'activity.account') },
    { to: '/Import', icon: Database, label: 'Import Data', show: ['owner', 'broker'].includes(normalizeRole(user?.role)) || isSuperAdmin || (isAdmin && can(user, 'accounting.access')) },
  ].filter((l) => l.show) : [];

  // If super admin has a brokerage_id, they're viewing inside a brokerage - show broker links
  const baseLinks = isSuperAdmin && !brokerageId ? superAdminLinks : isAdmin || (isSuperAdmin && brokerageId) ? brokerLinks : agentLinks;
  const withLeads = fubMe?.connected ? baseLinks.flatMap((l) => (l.to === '/Contacts' ? [l, { to: '/MyLeads', icon: UserSearch, label: 'My Leads' }] : [l])) : baseLinks;
  const at = withLeads.findIndex((l) => l.to === '/Transactions');
  const links = at < 0 ? [...withLeads, ...backOffice] : [...withLeads.slice(0, at + 1), ...backOffice, ...withLeads.slice(at + 1)];

  return (
    <aside className={mobile ? 'h-full w-full bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl' : 'fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col z-40'}>
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
          ) : !brand && user?.brokerage_id ? (
            <div className="w-10 h-10 rounded-xl bg-sidebar-accent/40 flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-primary-foreground font-bold text-lg">G</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-white tracking-tight truncate">
              {brand?.name || (user?.brokerage_id ? '' : 'Guru Broker')}
            </h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {brand?.broker_name || (brand ? 'Support Portal' : '')}
            </p>
          </div>
        </div>
      </div>

      {/* On phones the menu and channels scroll together so channels are always reachable;
          on bigger screens the menu scrolls on its own and channels stay in view below it. */}
      <div className={mobile ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : 'flex-1 min-h-0 flex flex-col'}>
      <nav className={mobile ? 'p-4 space-y-1' : 'flex-1 min-h-0 overflow-y-auto p-4 space-y-1'}>
        {isSuperAdmin && brokerageId && (
          <button
            onClick={async () => {
              await base44.auth.updateMe({ brokerage_id: '' });
              onChannelClick?.();
              window.location.href = '/SuperAdmin';
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground mb-2 border-b border-sidebar-border pb-3"
          >
            <Building2 className="w-5 h-5" />
            <span className="flex-1">Back to Brokerages</span>
          </button>
        )}
        {links.map(({ to, icon: Icon, label }) => {
          const [path, query] = to.split('?');
          const active = location.pathname === path && (query ? location.search.includes(query) : true);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => onChannelClick?.()}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="flex-1">{label}</span>
              {to === '/DirectMessages' && unreadDmCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadDmCount > 99 ? '99+' : unreadDmCount}
                </span>
              )}
            </Link>
          );
        })}
        {fubMe?.connected && (
          <a href="https://app.followupboss.com" target="_blank" rel="noreferrer" onClick={() => onChannelClick?.()}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <SquareArrowOutUpRight className="w-5 h-5" />
            <span className="flex-1">Follow Up Boss</span>
          </a>
        )}
      </nav>

      <ChatChannelsDropdown brokerageId={brokerageId} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} onChannelClick={onChannelClick} />
      </div>



      <div className="p-4 border-t border-sidebar-border" style={mobile ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } : undefined}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-xs font-semibold text-sidebar-accent-foreground">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              {isAdmin ? 'Broker' : 'Agent'}
            </p>
          </div>
          <NotificationBell user={user} brokerageId={brokerageId || user?.brokerage_id} />
          <button
            onClick={() => base44.auth.logout()}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-4 h-4 text-sidebar-foreground/50" />
          </button>
        </div>
      </div>
    </aside>
  );
}