import React, { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Heart, Calendar, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function SocialFeedWidget({ brokerageId, user }) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);

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
  const feedItems = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const allEvents = cultureEvents
      .filter(e => new Date(e.date) >= sevenDaysAgo)
      .map(e => ({
        id: e.id,
        type: 'event',
        timestamp: e.date,
        data: e,
      }));

    const bellMessages = socialMessages
      .filter(m => (m.content?.includes('🔔') || m.content?.includes('📋')) && new Date(m.created_date) >= sevenDaysAgo)
      .map(m => ({
        id: m.id,
        type: 'bell',
        timestamp: m.created_date,
        data: m,
      }));

    return [
      ...recognitions
        .filter(r => new Date(r.created_date) >= sevenDaysAgo)
        .map(r => ({
          id: r.id,
          type: 'recognition',
          timestamp: r.created_date,
          data: r,
        })),
      ...allEvents,
      ...bellMessages,
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [recognitions, cultureEvents, socialMessages]);

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

  const currentItem = feedItems.length > 0 ? feedItems[activeIndex] : null;

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
                  <span className="font-semibold">{currentItem?.data.sender_name}</span> • {currentItem?.data.content?.replace(/^[🔔📋]\s*/, '')}
                </p>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
                <p className="text-foreground leading-tight text-xs lg:text-sm truncate">
                  <span className="font-semibold">{currentItem?.data.person_name || currentItem?.data.title}</span>{' '}
                  {currentItem?.data.event_type === 'work_anniversary' ? '🎉 Work Anniversary' : '🎂 Birthday'} • {format(new Date(currentItem?.data.date), 'MMM d')}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {feedItems.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === activeIndex ? 'w-3 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}