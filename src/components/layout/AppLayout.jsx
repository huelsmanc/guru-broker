import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import NotificationSetup from '@/components/notifications/NotificationSetup';
import PushNotificationBanner from '@/components/notifications/PushNotificationBanner';
import NotificationManager from '@/components/notifications/notificationManager';
import MobileTabBar from './MobileTabBar';
import IdeaPadBubble from '@/components/ideapad/IdeaPadBubble';
import { Menu, X } from 'lucide-react';
import { ChatProvider } from '@/lib/chat/ChatProvider';
import { CallProvider } from '@/lib/chat/CallProvider';

export default function AppLayout() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  // Pick up profile changes (e.g. a new name saved on My Profile).
  useEffect(() => {
    const reload = () => base44.auth.me().then((u) => setUser(u)).catch(() => {});
    window.addEventListener('profile-updated', reload);
    return () => window.removeEventListener('profile-updated', reload);
  }, []);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      // Super admins don't need a brokerage
      if (u && u.role !== 'super_admin' && !u.brokerage_id) {
        navigate('/JoinBrokerage');
      }
    });
  }, [navigate]);

  return (
    <ChatProvider user={user}>
    <CallProvider>
    <div className="min-h-screen bg-background">
      <PushNotificationBanner user={user} />
      {user && <NotificationManager user={user} brokerageId={user?.brokerage_id} />}
      {/* Mobile header */}
       <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar z-50 flex items-center px-4">
         <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-2">
           {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
         </button>
        <div className="flex items-center gap-2 ml-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <span className="text-sidebar-primary-foreground font-bold">G</span>
          </div>
          <span className="text-white font-bold">Guru Broker</span>
        </div>
        <NotificationBell user={user} brokerageId={user?.brokerage_id} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Sidebar user={user} brokerageId={user?.brokerage_id} onChannelClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop/Tablet sidebar */}
      <div className="hidden md:fixed md:left-0 md:top-0 md:h-screen md:w-64 md:block md:z-40">
        <Sidebar user={user} brokerageId={user?.brokerage_id} />
      </div>

      {/* Main content */}
      <main className="md:ml-64 pt-16 md:pt-0 pb-20 min-h-screen">
        <Outlet context={{ user, brokerageId: user?.brokerage_id }} />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar />

      {user && !(user.display_name || user.full_name) && <NamePrompt user={user} onSaved={setUser} />}

      {/* Floating Idea Pad */}
      <IdeaPadBubble user={user} />
    </div>
    </CallProvider>
    </ChatProvider>
  );
}
// First sign-in: people invited by email have no name yet, so chat and deals would show
// their email address. Ask once.
function NamePrompt({ user, onSaved }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    const full = `${first.trim()} ${last.trim()}`.trim();
    if (!first.trim()) { setError('Add your first name.'); return; }
    setBusy(true); setError('');
    try {
      await base44.auth.updateMe({ first_name: first.trim(), last_name: last.trim() || null, full_name: full, display_name: full });
      onSaved({ ...user, first_name: first.trim(), last_name: last.trim(), full_name: full, display_name: full });
    } catch (err) { setError(err.message || 'Could not save your name.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={save} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold">What's your name?</h2>
          <p className="text-sm text-muted-foreground mt-1">It's what your team sees in chat, on deals and on documents.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">First name<input autoFocus className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
          <label className="text-sm">Last name<input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={last} onChange={(e) => setLast(e.target.value)} /></label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-primary text-primary-foreground py-2 font-medium disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
