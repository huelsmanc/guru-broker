import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import NotificationToast from './NotificationToast';

export default function NotificationManager({ user, brokerageId }) {
  const [toastNotifications, setToastNotifications] = useState([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch unread notifications
  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ['unread-notifications', user?.email],
    queryFn: () =>
      base44.entities.Notification.filter(
        { user_email: user?.email, read: false, brokerage_id: brokerageId },
        '-created_date',
        50
      ),
    enabled: !!user?.email && !!brokerageId,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Real-time subscription
  useEffect(() => {
    if (!brokerageId) return;
    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      if (event.data?.user_email === user?.email && event.type === 'create') {
        // Show toast for new notification
        setToastNotifications(prev => [...prev, { id: event.data.id, ...event.data }]);
        queryClient.invalidateQueries({ queryKey: ['unread-notifications', user?.email] });

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
          setToastNotifications(prev => prev.filter(n => n.id !== event.data.id));
        }, 6000);
      }
    });
    return unsubscribe;
  }, [brokerageId, user?.email, queryClient]);

  const handleNotificationClick = async (notification) => {
    // Mark as read
    await base44.entities.Notification.update(notification.id, { read: true });
    queryClient.invalidateQueries({ queryKey: ['unread-notifications', user?.email] });

    // Navigate to relevant page
    if (notification.action_url) {
      navigate(notification.action_url);
    }

    // Remove from toast
    setToastNotifications(prev => prev.filter(n => n.id !== notification.id));
  };

  const handleDismiss = async (notification) => {
    await base44.entities.Notification.update(notification.id, { read: true });
    queryClient.invalidateQueries({ queryKey: ['unread-notifications', user?.email] });
    setToastNotifications(prev => prev.filter(n => n.id !== notification.id));
  };

  return (
    <AnimatePresence>
      {toastNotifications.map(notification => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={() => handleDismiss(notification)}
          onClick={() => handleNotificationClick(notification)}
        />
      ))}
    </AnimatePresence>
  );
}