import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export function useNotifications(user) {
  const notificationsRef = useRef(new Set());

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = (title, options = {}) => {
    const notificationKey = `${title}-${Date.now()}`;
    
    // Prevent duplicate notifications
    if (notificationsRef.current.has(notificationKey)) return;
    notificationsRef.current.add(notificationKey);

    // In-app toast
    const toastMessage = options.message || title;
    if (options.type === 'urgent') {
      toast.error(toastMessage, {
        description: options.description,
        duration: 5000,
      });
    } else if (options.type === 'success') {
      toast.success(toastMessage, {
        description: options.description,
        duration: 4000,
      });
    } else {
      toast(toastMessage, {
        description: options.description,
        duration: 4000,
      });
    }

    // Browser push notification (if permitted)
    if ('Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'guru-broker',
        ...options.notificationOptions,
      });

      if (options.onClick) {
        notif.onclick = options.onClick;
      }

      setTimeout(() => {
        notificationsRef.current.delete(notificationKey);
      }, 5000);
    }
  };

  const notifyUrgentChat = (conversationTitle) => {
    sendNotification('🚨 Urgent Chat', {
      type: 'urgent',
      message: `Urgent: ${conversationTitle}`,
      description: 'An urgent conversation requires your attention',
      notificationOptions: {
        requireInteraction: true,
      },
    });
  };

  const notifyNewCall = (agentName) => {
    sendNotification('📞 New Call Scheduled', {
      type: 'success',
      message: `Call scheduled with ${agentName}`,
      description: 'Check your calls page for details',
    });
  };

  const notifyNewMessage = (senderName) => {
    sendNotification('💬 New Message', {
      message: `Message from ${senderName}`,
      description: 'Click to view conversation',
    });
  };

  const notifyAnnouncement = (title) => {
    sendNotification('📢 Announcement', {
      message: title,
      notificationOptions: {
        requireInteraction: true,
      },
    });
  };

  return {
    sendNotification,
    notifyUrgentChat,
    notifyNewCall,
    notifyNewMessage,
    notifyAnnouncement,
    notificationsEnabled: 'Notification' in window && Notification.permission === 'granted',
  };
}