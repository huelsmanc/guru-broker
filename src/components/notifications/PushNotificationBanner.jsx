import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export default function PushNotificationBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show if notifications are supported, not yet granted, and user hasn't dismissed
    const dismissed = localStorage.getItem('notifBannerDismissed');
    if (
      'Notification' in window &&
      Notification.permission === 'default' &&
      !dismissed
    ) {
      // Small delay so it doesn't flash immediately on load
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleEnable = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('Notifications enabled!', {
        body: "You'll now receive alerts for messages, calls, and more.",
        icon: '/favicon.ico',
      });
    }
    setShow(false);
    localStorage.setItem('notifBannerDismissed', 'true');
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('notifBannerDismissed', 'true');
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-primary text-primary-foreground px-4 py-3 shadow-lg lg:pl-72"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-medium truncate">
              Enable notifications to get alerts for messages, calls, and more — even when the tab is in the background.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleEnable}
              className="h-7 text-xs rounded-lg bg-white/20 hover:bg-white/30 text-white border-0"
            >
              Enable
            </Button>
            <button onClick={handleDismiss} className="p-1 rounded hover:bg-white/20 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}