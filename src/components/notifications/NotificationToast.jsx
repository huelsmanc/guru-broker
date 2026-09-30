import React from 'react';
import { motion } from 'framer-motion';
import { Bell, MessageSquare, Calendar, AtSign, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const NOTIFICATION_ICONS = {
  mention: <AtSign className="w-5 h-5 text-primary" />,
  thread_reply: <MessageSquare className="w-5 h-5 text-blue-500" />,
  calendar_event: <Calendar className="w-5 h-5 text-amber-500" />,
  message: <Bell className="w-5 h-5 text-muted-foreground" />,
};

export default function NotificationToast({ notification, onDismiss, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 20 }}
      transition={{ duration: 0.3 }}
      className="fixed top-6 right-6 z-50 max-w-sm"
    >
      <button
        onClick={onClick}
        className="w-full text-left bg-card border border-border/60 rounded-xl shadow-lg p-4 hover:border-border hover:shadow-xl transition-all duration-200 group"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {NOTIFICATION_ICONS[notification.type] || <Bell className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
              {notification.title}
            </p>
            {notification.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {notification.description}
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </button>
    </motion.div>
  );
}