import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, X, MessageSquare, FileText, CheckCircle, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function NotificationBell({ user, brokerageId }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email, brokerageId],
    queryFn: () => base44.entities.Notification.filter(
      { user_email: user?.email, brokerage_id: brokerageId },
      '-created_date',
      50
    ),
    enabled: !!user?.email && !!brokerageId,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.email || !brokerageId) return;

    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      if (event.data?.user_email === user.email && event.data?.brokerage_id === brokerageId) {
        queryClient.invalidateQueries({ queryKey: ['notifications', user.email, brokerageId] });
      }
    });

    return unsubscribe;
  }, [user?.email, brokerageId, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, { read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.email, brokerageId] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const unreadNotifications = notifications.filter(n => !n.read);
      for (const notif of unreadNotifications) {
        await base44.entities.Notification.update(notif.id, { read: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.email, brokerageId] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.delete(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.email, brokerageId] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'mention':
        return <UserPlus className="w-4 h-4 text-purple-500" />;
      case 'signature_update':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'document_shared':
        return <FileText className="w-4 h-4 text-orange-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-white" />
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-0 right-0 w-5 h-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center font-bold"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full right-0 mb-2 max-w-md max-h-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
                <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsRead.mutate()}
                      className="text-xs text-primary hover:underline whitespace-nowrap"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={cn(
                        'p-4 hover:bg-muted/50 transition-colors cursor-pointer group',
                        !notif.read && 'bg-primary/5'
                      )}
                      onClick={() => {
                        markAsRead.mutate(notif.id);
                        if (notif.action_url) {
                          window.location.href = notif.action_url;
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-foreground text-sm leading-tight">
                              {notif.title}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification.mutate(notif.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            >
                              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </div>
                          {notif.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {notif.description}
                            </p>
                          )}
                          {notif.channel && (
                            <p className="text-xs text-primary/60 mt-1.5">
                              {notif.channel}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(new Date(notif.created_date), 'MMM d, h:mm a')}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}