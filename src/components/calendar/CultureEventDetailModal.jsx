import React, { useState } from 'react';
import { localDay } from '@/lib/dates';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, Check, Clock, Users, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const EVENT_TYPE_CONFIG = {
  birthday: { emoji: '🎂', label: 'Birthday' },
  work_anniversary: { emoji: '🎉', label: 'Work Anniversary' },
  company_event: { emoji: '🏢', label: 'Company Event' },
  team_activity: { emoji: '🤝', label: 'Team Activity' },
};

const STATUS_CONFIG = {
  attending: { label: 'Attending', icon: Check, color: 'bg-green-100 text-green-700' },
  not_attending: { label: 'Not Attending', icon: X, color: 'bg-red-100 text-red-700' },
  maybe: { label: 'Maybe', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
};

export default function CultureEventDetailModal({ open, onClose, event, brokerageId, user }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRSVP, setUserRSVP] = useState(null);

  const { data: rsvps = [] } = useQuery({
    queryKey: ['culture-rsvps', event?.id],
    queryFn: () => base44.entities.CultureCalendarRSVP.filter({
      culture_calendar_entry_id: event?.id,
      brokerage_id: brokerageId,
    }),
    enabled: !!event?.id && !!brokerageId,
  });

  const { data: eventPerson } = useQuery({
    queryKey: ['culture-event-person', event?.person_email],
    queryFn: () => base44.entities.User.filter({ email: event?.person_email }),
    enabled: !!event?.person_email,
  });

  const createOrUpdateRSVP = useMutation({
    mutationFn: async (status) => {
      const existing = rsvps.find(r => r.user_email === user?.email);
      if (existing) {
        await base44.entities.CultureCalendarRSVP.update(existing.id, { status, response_date: new Date().toISOString() });
      } else {
        await base44.entities.CultureCalendarRSVP.create({
          brokerage_id: brokerageId,
          culture_calendar_entry_id: event?.id,
          user_email: user?.email,
          user_name: user?.full_name,
          status,
          response_date: new Date().toISOString(),
        });
      }
      setUserRSVP(status);
      queryClient.invalidateQueries({ queryKey: ['culture-rsvps', event?.id] });
    },
  });

  if (!event) return null;

  const config = EVENT_TYPE_CONFIG[event.event_type];
  const attendingCount = rsvps.filter(r => r.status === 'attending').length;
  const maybeCount = rsvps.filter(r => r.status === 'maybe').length;
  const notAttendingCount = rsvps.filter(r => r.status === 'not_attending').length;
  const currentUserRSVP = rsvps.find(r => r.user_email === user?.email);
  const personData = eventPerson?.[0];

  const groupedRSVPs = {
    attending: rsvps.filter(r => r.status === 'attending'),
    maybe: rsvps.filter(r => r.status === 'maybe'),
    not_attending: rsvps.filter(r => r.status === 'not_attending'),
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{config.emoji}</span>
            {event.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Event Details */}
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-semibold">{format(localDay(event.date), 'MMMM d, yyyy')}</p>
            </div>
            {event.person_name && (
              <div>
                <p className="text-sm text-muted-foreground">Person</p>
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <p className="font-semibold text-foreground">{event.person_name}</p>
                    {personData && (
                      <>
                        {personData.title && <p className="text-xs text-muted-foreground">{personData.title}</p>}
                        {personData.department && <p className="text-xs text-muted-foreground">{personData.department}</p>}
                      </>
                    )}
                  </div>
                  {personData && event.person_email !== user?.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-lg text-xs"
                      onClick={() => navigate(`/DirectMessages?userId=${personData.id}`)}
                    >
                      <MessageSquare className="w-3 h-3" /> Message
                    </Button>
                  )}
                </div>
              </div>
            )}
            {event.description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-foreground">{event.description}</p>
              </div>
            )}
            <Badge variant="secondary">{config.label}</Badge>
          </div>

          {/* RSVP Stats */}
          {(event.event_type === 'company_event' || event.event_type === 'team_activity') && (
            <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{attendingCount}</p>
                <p className="text-xs text-muted-foreground">Attending</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{maybeCount}</p>
                <p className="text-xs text-muted-foreground">Maybe</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{notAttendingCount}</p>
                <p className="text-xs text-muted-foreground">Not Attending</p>
              </div>
            </div>
          )}

          {/* RSVP Buttons */}
          {(event.event_type === 'company_event' || event.event_type === 'team_activity') && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Your Response</p>
              <div className="flex gap-2">
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <Button
                    key={status}
                    onClick={() => createOrUpdateRSVP.mutate(status)}
                    variant={currentUserRSVP?.status === status ? 'default' : 'outline'}
                    className={`flex-1 gap-2 rounded-lg ${currentUserRSVP?.status === status ? config.color : ''}`}
                    disabled={createOrUpdateRSVP.isPending}
                  >
                    <config.icon className="w-4 h-4" />
                    {config.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Attendees List */}
          {(event.event_type === 'company_event' || event.event_type === 'team_activity') && (
            <div className="space-y-4">
              {Object.entries(groupedRSVPs).map(([statusKey, attendees]) => {
              if (attendees.length === 0) return null;
              const statusConfig = STATUS_CONFIG[statusKey];
              return (
                <div key={statusKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <statusConfig.icon className="w-4 h-4" />
                    <h3 className="font-semibold text-sm">{statusConfig.label} ({attendees.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {attendees.map((attendee, idx) => (
                      <motion.div
                        key={attendee.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {attendee.user_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{attendee.user_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{attendee.user_email}</p>
                        </div>
                        {attendee.response_date && (
                          <p className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(attendee.response_date), 'MMM d')}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
            {rsvps.length === 0 && (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No RSVPs yet</p>
              </div>
            )}
            </div>
            )}
            </div>
            </DialogContent>
            </Dialog>
            );
            }