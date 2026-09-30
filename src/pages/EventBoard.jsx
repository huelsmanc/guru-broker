import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, Plus, Users, MapPin, Clock, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CreateEventDialog from '@/components/events/CreateEventDialog';
import EventCard from '@/components/events/EventCard';
import RSVPDialog from '@/components/events/RSVPDialog';
import AttendanceTracker from '@/components/events/AttendanceTracker';
import { format } from 'date-fns';

export default function EventBoard() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showRSVP, setShowRSVP] = useState(false);
  const [showAttendance, setShowAttendance] = useState(null);

  const { data: events = [] } = useQuery({
    queryKey: ['events', brokerageId],
    queryFn: () => base44.entities.Event.filter({ brokerage_id: brokerageId }, '-date', 100),
    enabled: !!brokerageId,
  });

  const { data: rsvps = [] } = useQuery({
    queryKey: ['event-rsvps', brokerageId],
    queryFn: () => base44.entities.EventRSVP.filter({ brokerage_id: brokerageId }, '-created_date', 500),
    enabled: !!brokerageId,
  });

  const deleteEvent = useMutation({
    mutationFn: (id) => base44.entities.Event.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', brokerageId] });
      setSelectedEvent(null);
    },
  });

  const upcomingEvents = events.filter(e => e.status === 'upcoming');
  const pastEvents = events.filter(e => e.status === 'completed');

  const getEventStats = (eventId) => {
    const eventRsvps = rsvps.filter(r => r.event_id === eventId);
    return {
      attending: eventRsvps.filter(r => r.status === 'attending').length,
      notAttending: eventRsvps.filter(r => r.status === 'not_attending').length,
      maybe: eventRsvps.filter(r => r.status === 'maybe').length,
      checkedIn: eventRsvps.filter(r => r.checked_in).length,
      total: eventRsvps.length,
    };
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Calendar className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Event Board</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage team events and track attendance</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-11">
            <Plus className="w-4 h-4" /> New Event
          </Button>
        )}
      </motion.div>

      <Tabs defaultValue="upcoming">
        <TabsList className="mb-6">
          <TabsTrigger value="upcoming">
            <Calendar className="w-4 h-4 mr-1.5" /> Upcoming ({upcomingEvents.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            <CheckCircle className="w-4 h-4 mr-1.5" /> Past ({pastEvents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No upcoming events. {isAdmin && 'Create one to get started!'}</p>
              {isAdmin && (
                <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl mt-4">
                  <Plus className="w-4 h-4" /> Create Event
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {upcomingEvents.map((event, i) => {
                const stats = getEventStats(event.id);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <EventCard
                      event={event}
                      stats={stats}
                      onSelect={() => setSelectedEvent(event)}
                      onRSVP={() => { setSelectedEvent(event); setShowRSVP(true); }}
                      onAttendance={() => setShowAttendance(event)}
                      isAdmin={isAdmin}
                      userRSVP={rsvps.find(r => r.event_id === event.id && r.user_email === user?.email)}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past">
          {pastEvents.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No past events yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastEvents.map((event, i) => {
                const stats = getEventStats(event.id);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-card rounded-2xl border border-border p-4 flex flex-col md:flex-row md:items-center gap-4"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{event.title}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(new Date(event.date), 'MMM d, yyyy')}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="font-bold text-lg text-foreground">{stats.checkedIn}</p>
                        <p className="text-xs text-muted-foreground">checked in</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-lg text-foreground">{stats.attending}</p>
                        <p className="text-xs text-muted-foreground">attended</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateEventDialog open={showCreate} onClose={() => setShowCreate(false)} brokerageId={brokerageId} user={user} />
      <RSVPDialog
        open={showRSVP}
        onClose={() => setShowRSVP(false)}
        event={selectedEvent}
        user={user}
        brokerageId={brokerageId}
        existingRsvp={selectedEvent ? rsvps.find(r => r.event_id === selectedEvent.id && r.user_email === user?.email) : null}
      />
      {showAttendance && (
        <AttendanceTracker
          event={showAttendance}
          rsvps={rsvps.filter(r => r.event_id === showAttendance.id && r.status === 'attending')}
          onClose={() => setShowAttendance(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}