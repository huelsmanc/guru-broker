import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Phone, LayoutDashboard, Monitor, LogOut, Users, Settings as SettingsIcon, ShieldCheck, Building2, UserCircle, TrendingUp, UserPlus, Mail, Trophy, BookOpen, FileText, Heart, Lightbulb, Calendar, FolderOpen, Link2, Wand2, Target, ScrollText, Calculator, File, Gift, Star, ClipboardList, Handshake, Wallet, Banknote, Percent, BarChart3, Activity as ActivityIcon, FileCheck2, ListChecks, Megaphone, Database } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import NotificationBell from './NotificationBell';
import ChatChannelsDropdown from './ChatChannelsDropdown';

import { useQuery } from '@tanstack/react-query';
import { useChat } from '@/lib/chat/ChatProvider';
import { isAdminRole, normalizeRole, can } from '../../../shared/permissions.generated.js';

export default function Sidebar({ user, brokerageId, onChannelClick }) {
  const location = useLocation();
  const isAdmin = isAdminRole(user?.role);
  const [brokerageSettings, setBrokerageSettings] = useState(null);
  const [brokerage, setBrokerage] = useState(null);

  // Unread DMs and group messages (live)
  const chat = useChat();
  const unreadDmCount = chat?.totals.dms || 0;

  useEffect(() => {
    if (user?.brokerage_id) {
      base44.entities.BrokerageSettings.filter({ brokerage_id: user.brokerage_id }).then((results) => {
        if (results.length > 0) setBrokerageSettings(results[0]);
      });
      base44.entities.Brokerage.filter({ id: user.brokerage_id }).then((results) => {
        if (results.length > 0) setBrokerage(results[0]);
      });
    }
  }, [user?.brokerage_id]);

  // Apply colors when brokerageSettings change
  useEffect(() => {
    if (brokerageSettings?.primary_color || brokerageSettings?.sidebar_color) {
      const root = document.documentElement;
      if (brokerageSettings.primary_color) {
        const [r, g, b] = hexToRgb(brokerageSettings.primary_color);
        root.style.setProperty('--primary', `${hslFromRgb(r, g, b)}`);
      }
      if (brokerageSettings.sidebar_color) {
        const [r, g, b] = hexToRgb(brokerageSettings.sidebar_color);
        root.style.setProperty('--sidebar-background', `${hslFromRgb(r, g, b)}`);
      }
    }
  }, [brokerageSettings]);

  // Helper functions to convert hex to HSL for CSS variables
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  };

  const hslFromRgb = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const isSuperAdmin = user?.role === 'super_admin';

  const superAdminLinks = [
    { to: '/SuperAdmin', icon: Building2, label: 'Brokerages' },
    { to: '/SuperAdmin?tab=forms', icon: ScrollText, label: 'State Contract Forms' },
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
    { to: '/SalesCoach', icon: Target, label: 'AI Sales Coach' },
    { to: '/Offers', icon: Handshake, label: 'Offers & Contracts' },
    { to: '/Contacts', icon: Users, label: 'Contacts' },
    { to: '/Transactions', icon: ClipboardList, label: 'Transactions' },
    { to: '/Reviews', icon: Star, label: 'Reviews' },
    { to: '/Profile', icon: UserCircle, label: 'My Profile' },
  ];

  const brokerLinks = [
    { to: '/Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/BrokerMonitor', icon: Monitor, label: 'Monitor Chats' },
    { to: '/AgentLeaderboard', icon: Trophy, label: 'Agent Performance' },
    { to: '/Culture', icon: Heart, label: 'Culture' },
    { to: '/FileRepository', icon: FolderOpen, label: 'File Repository' },
    { to: '/BrokerageUsers', icon: UserPlus, label: 'Manage Users' },
    { to: '/ComplianceTraining', icon: BookOpen, label: 'Compliance Training' },
    { to: '/ESignDocuments', icon: FileText, label: 'E-Sign Documents' },
    { to: '/DirectMessages', icon: Mail, label: 'Direct Messages' },
    { to: '/ScheduleCalls', icon: Phone, label: 'Calls' },
    { to: '/AdminChat', icon: ShieldCheck, label: 'Broker Chat' },
    { to: '/TechLinks', icon: Link2, label: 'Tech Links' },
    { to: '/Marketing', icon: Megaphone, label: 'Marketing' },
    { to: '/SalesCoach', icon: Target, label: 'AI Sales Coach' },
    { to: '/Offers', icon: Handshake, label: 'Offers & Contracts' },
    { to: '/Contacts', icon: Users, label: 'Contacts' },
    { to: '/Transactions', icon: ClipboardList, label: 'Transactions' },
    { to: '/Reviews', icon: Star, label: 'Reviews' },
    { to: '/Settings', icon: SettingsIcon, label: 'Settings' },
    { to: '/Profile', icon: UserCircle, label: 'My Profile' },
  ];

  // Back office: shown to anyone whose role or permissions allow it (e.g. a TC who approves documents).
  const inBrokerage = !!brokerageId;
  const backOffice = inBrokerage ? [
    { to: '/MyCommissions', icon: Wallet, label: 'My Commissions', show: !isSuperAdmin },
    { to: '/ApproveDocs', icon: FileCheck2, label: 'Approve Docs', show: isAdmin || can(user, 'docs.approve') },
    { to: '/Payouts', icon: Banknote, label: 'Payouts', show: can(user, 'accounting.access') },
    { to: '/CommissionPlans', icon: Percent, label: 'Commission Plans', show: isAdmin },
    { to: '/ChecklistTemplates', icon: ListChecks, label: 'Checklist Templates', show: isAdmin },
    { to: '/Reports', icon: BarChart3, label: 'Reports', show: can(user, 'reports.company') },
    { to: '/Activity', icon: ActivityIcon, label: 'Activity', show: isAdmin || can(user, 'activity.account') },
    { to: '/Import', icon: Database, label: 'Import Data', show: ['owner', 'broker'].includes(normalizeRole(user?.role)) || isSuperAdmin || (isAdmin && can(user, 'accounting.access')) },
  ].filter((l) => l.show) : [];

  // If super admin has a brokerage_id, they're viewing inside a brokerage - show broker links
  const baseLinks = isSuperAdmin && !brokerageId ? superAdminLinks : isAdmin || (isSuperAdmin && brokerageId) ? brokerLinks : agentLinks;
  const at = baseLinks.findIndex((l) => l.to === '/Transactions');
  const links = at < 0 ? [...baseLinks, ...backOffice] : [...baseLinks.slice(0, at + 1), ...backOffice, ...baseLinks.slice(at + 1)];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col z-40">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {brokerage?.logo_url ? (
            <img src={brokerage.logo_url} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-primary-foreground font-bold text-lg">G</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-white tracking-tight truncate">
              {brokerage?.name || brokerageSettings?.brokerage_name || 'Guru Broker'}
            </h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {brokerageSettings?.broker_name ? `${brokerageSettings.broker_name}` : 'Support Portal'}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
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
          const active = location.pathname === path && (query ? location.search.includes(query) : !location.search.includes('tab=forms'));
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
      </nav>

      <ChatChannelsDropdown brokerageId={brokerageId} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} onChannelClick={onChannelClick} />



      <div className="p-4 border-t border-sidebar-border">
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