import React, { useMemo, useEffect, useState } from 'react';
import { localDay } from '@/lib/dates';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAdminRole } from '../../../shared/permissions.generated.js';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Heart, Calendar, Sparkles, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function SocialFeedWidget({ brokerageId, user }) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);

  // Admins can clear the ticker; anything posted before that time stops showing.
  const { data: settings } = useQuery({
    queryKey: ['brokerage-settings-ticker', brokerageId],
    queryFn: async () => (await base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }, '-created_date', 1))[0] || null,
    enabled: !!brokerageId,
  });
  const clearedAt = settings?.ticker_cleared_at ? new Date(settings.ticker_cleared_at) : null;
  const clearTicker = async () => {
    if (!window.confirm('Clear the ticker for everyone? New shout-outs and bells will show again as they come in.')) return;
    const patch = { ticker_cleared_at: new Date().toISOString() };
    try {
      if (settings?.id) await base44.entities.BrokerageSettings.update(settings.id, patch);
      else await base44.entities.BrokerageSettings.create({ brokerage_id: brokerageId, ...patch });
      queryClient.invalidateQueries({ queryKey: ['brokerage-settings-ticker', brokerageId] });
      setActiveIndex(0);
    } catch (err) { window.alert(err.message); }
  };

  const { data: recognitions = [] } = useQuery({
    queryKey: ['recognitions-widget', brokerageId],
    queryFn: () => base44.entities.Recognition.filter({ brokerage_id: brokerageId }, '-created_date', 100),
    enabled: !!brokerageId,
  });

  const { data: cultureEvents = [] } = useQuery({
    queryKey: ['culture-events-widget', brokerageId],
    queryFn: () => base44.entities.CultureCalendarEntry.filter({ brokerage_id: brokerageId }, '-date', 100),
    enabled: !!brokerageId,
  });

  const { data: socialMessages = [] } = useQuery({
    queryKey: ['social-messages-widget', brokerageId],
    queryFn: () => base44.entities.SocialMessage.filter({ brokerage_id: brokerageId }, '-created_date', 100),
    enabled: !!brokerageId,
  });

  // Get recent items (recognitions + all events + bell messages)
  // Shout-outs and bells show for 24 hours; birthdays and anniversaries from today through the next week.
  const feedItems = useMemo(() => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since = clearedAt && clearedAt > dayAgo ? clearedAt : dayAgo;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);

    const allEvents = cultureEvents
      .filter(e => { const d = localDay(e.date); return d >= today && d <= weekOut && (!clearedAt || d > clearedAt); })
      .map(e => ({
        id: e.id,
        type: 'event',
        timestamp: e.date,
        data: e,
      }));

    const bellMessages = socialMessages
      .filter(m => (m.content?.includes('🔔') || m.content?.includes('📋')) && new Date(m.created_date) >= since)
      .map(m => ({
        id: m.id,
        type: 'bell',
        timestamp: m.created_date,
        data: m,
      }));

    return [
      ...recognitions
        .filter(r => new Date(r.created_date) >= since)
        .map(r => ({
          id: r.id,
          type: 'recognition',
          timestamp: r.created_date,
          data: r,
        })),
      ...allEvents,
      ...bellMessages,
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [recognitions, cultureEvents, socialMessages, settings?.ticker_cleared_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-rotate ticker
  useEffect(() => {
    if (feedItems.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % feedItems.length);
    }, 6000); // 6 seconds per item
    return () => clearInterval(interval);
  }, [feedItems.length]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribeRec = base44.entities.Recognition.subscribe(() => {
      // Trigger refetch on new recognition
    });
    const unsubscribeEvent = base44.entities.CultureCalendarEntry.subscribe(() => {
      // Trigger refetch on new event
    });
    const unsubscribeMsg = base44.entities.SocialMessage.subscribe(() => {
      // Trigger refetch on new message
    });
    return () => {
      unsubscribeRec();
      unsubscribeEvent();
      unsubscribeMsg();
    };
  }, []);

  const currentItem = feedItems.length > 0 ? feedItems[activeIndex % feedItems.length] : null;

  return (
    <div className="bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10 rounded-xl px-4 py-3 mb-6 overflow-hidden">
      {feedItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">No activity yet</p>
      ) : (
        <motion.div
          key={`ticker-${activeIndex}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 text-sm"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {currentItem?.type === 'recognition' ? (
              <>
                <Heart className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-foreground leading-tight text-xs lg:text-sm truncate">
                  <span className="font-semibold">{currentItem.data.from_name}</span> recognized{' '}
                  <span className="font-semibold text-primary">{currentItem.data.to_name}</span> • {currentItem.data.message}
                </p>
              </>
            ) : currentItem?.type === 'bell' ? (
              <>
                <span className="text-lg flex-shrink-0">{currentItem?.data.content?.includes('🔔') ? '🔔' : '📋'}</span>
                <p className="text-foreground leading-tight text-xs lg:text-sm truncate">
                  <span className="font-semibold">{currentItem?.data.sender_name}</span> • {currentItem?.data.content?.replace(/^(?:🔔|📋)\s*/u, '')}
                </p>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
                <p className="text-foreground leading-tight text-xs lg:text-sm truncate">
                  <span className="font-semibold">{currentItem?.data.person_name || currentItem?.data.title}</span>{' '}
                  {currentItem?.data.event_type === 'work_anniversary' ? '🎉 Work Anniversary' : '🎂 Birthday'} • {format(localDay(currentItem?.data.date), 'MMM d')}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {feedItems.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === activeIndex % feedItems.length ? 'w-3 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
            {isAdmin && (
              <button onClick={clearTicker} title="Clear the ticker for everyone" aria-label="Clear the ticker"
                className="ml-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}