import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The original imported a helper that never existed, so this button crashed.
// Browser notifications are shown by the notification manager while the app is open.
const NotificationManager = {
  async requestPermission() {
    try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
  },
  async subscribeToPushNotifications() {},
};

export default function NotificationSetup() {
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);

    if (supported) {
      setHasPermission(Notification.permission === 'granted');
      setIsLoading(false);
    }
  }, []);

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    const granted = await NotificationManager.requestPermission();
    
    if (granted) {
      setHasPermission(true);
      await NotificationManager.subscribeToPushNotifications();
      
      new Notification('Notifications enabled', { body: 'You will now get alerts while Go Broker Hub is open.' });
    }
    
    setIsLoading(false);
  };

  if (!isSupported || isLoading) {
    return null;
  }

  if (hasPermission) {
    return null; // Already has permission
  }

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <BellOff className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-sm">Enable Push Notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">Get alerts for new messages and urgent requests</p>
        </div>
        <Button
          onClick={handleEnableNotifications}
          size="sm"
          className="gap-1 flex-shrink-0"
          disabled={isLoading}
        >
          <Bell className="w-4 h-4" />
          Enable
        </Button>
      </div>
    </div>
  );
}