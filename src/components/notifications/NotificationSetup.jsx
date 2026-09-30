import React, { useEffect, useState } from 'react';
import { NotificationManager } from '@/components/notifications/notificationManager';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      
      // Show test notification
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification('Notifications Enabled', {
          body: 'You will now receive push notifications',
          icon: '/icon-192x192.png',
        });
      }
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