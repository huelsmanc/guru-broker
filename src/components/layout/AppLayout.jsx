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

export default function AppLayout() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-background">
      <PushNotificationBanner />
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

      {/* Floating Idea Pad */}
      <IdeaPadBubble user={user} />
    </div>
  );
}