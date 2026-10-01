import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { localDay, onYear, nextOccurrence, RECURRING } from '@/lib/dates';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import CultureCalendarDialog from '@/components/calendar/CultureCalendarDialog';
import CultureEventDetailModal from '@/components/calendar/CultureEventDetailModal';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

const EVENT_TYPE_CONFIG = {
  birthday: { emoji: '🎂', label: 'Birthday', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  work_anniversary: { emoji: '🎉', label: 'Work Anniversary', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  company_event: { emoji: '🏢', label: 'Company Event', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  team_activity: { emoji: '🤝', label: 'Team Activity', color: 'bg-green-100 text-green-700 border-green-200' },
};

export default function CultureCalendar() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { data: entries = [] } = useQuery({
    queryKey: ['culture-calendar', brokerageId],
    queryFn: () => base44.entities.CultureCalendarEntry.filter({ brokerage_id: brokerageId }, '-date', 500),
    enabled: !!brokerageId,
  });

  const deleteEntry = useMutation({
    mutationFn: (id) => base44.entities.CultureCalendarEntry.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] }),
  });

  const updateEntry = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CultureCalendarEntry.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] });
      setEditingEvent(null);
    },
  });

  React.useEffect(() => {
    const unsubEntry = base44.entities.CultureCalendarEntry.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] });
    });
    const unsubUser = base44.entities.User.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] });
    });
    return () => {
      unsubEntry();
      unsubUser();
    };
  }, [brokerageId, queryClient]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group entries by date
  const entriesByDate = useMemo(() => {
    const grouped = {};
    entries.forEach(entry => {
      // Birthdays and anniversaries show every year, on the month being viewed.
      const dateKey = format(RECURRING.has(entry.event_type) ? onYear(entry.date, currentMonth.getFullYear()) : localDay(entry.date), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(entry);
    });
    return grouped;
  }, [entries, currentMonth]);

  // Filter entries by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    return entries.filter(entry =>
      entry.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.person_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [entries, searchQuery]);

  // Get upcoming events (next 7 days)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const when = (entry) => (RECURRING.has(entry.event_type) ? nextOccurrence(entry.date, today) : localDay(entry.date));
  const upcomingEvents = entries
    .map((entry) => ({ ...entry, date: format(when(entry), 'yyyy-MM-dd') }))
    .filter((entry) => { const d = localDay(entry.date); return d >= today && d <= nextWeek; })
    .sort((a, b) => localDay(a.date) - localDay(b.date));

  const weeks = [];
  let week = [];
  const firstDay = calendarDays[0].getDay();
  for (let i = 0; i < firstDay; i++) {
    week.push(null);
  }
  calendarDays.forEach((day, idx) => {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-12"
        >
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring' }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg"
            >
              <Calendar className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">Culture Calendar</h1>
              <p className="text-muted-foreground text-sm mt-1">Celebrate birthdays, anniversaries, and team moments</p>
            </div>
          </div>
          {isAdmin && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
              <Button onClick={() => setShowDialog(true)} className="gap-2.5 rounded-xl h-11 bg-gradient-to-r from-primary to-accent hover:shadow-lg">
                <Plus className="w-4 h-4" /> Add Event
              </Button>
            </motion.div>
          )}
        </motion.div>

      {/* Upcoming Events */}
      <AnimatePresence>
        {upcomingEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-6 mb-10 backdrop-blur-sm"
          >
            <h2 className="font-bold text-foreground mb-5 flex items-center gap-2">
              <span className="text-lg">🎊</span> Coming Up This Week
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {upcomingEvents.map((event, i) => {
                const config = EVENT_TYPE_CONFIG[event.event_type];
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card rounded-xl border border-border/50 hover:border-primary/30 p-4 transition-all duration-300 hover:shadow-md"
                  >
                    <p className="text-sm font-bold text-foreground mb-1">{config.emoji} {event.title}</p>
                    <p className="text-xs text-muted-foreground">{format(localDay(event.date), 'MMM d')}</p>
                    {event.person_name && <p className="text-xs text-muted-foreground mt-1">{event.person_name}</p>}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="outline"
                size="icon"
                className="rounded-lg"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
              <Button
                variant="outline"
                size="icon"
                className="rounded-lg"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-semibold text-xs text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {weeks.map((week, weekIdx) =>
                week.map((day, dayIdx) => {
                  const dateKey = day ? format(day, 'yyyy-MM-dd') : null;
                  const dayEntries = dateKey ? (entriesByDate[dateKey] || []) : [];
                  const isCurrentMonth = day && isSameMonth(day, currentMonth);
                  const isToday = day && isSameDay(day, new Date());

                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className={`min-h-24 rounded-lg border p-1 text-xs ${
                        isCurrentMonth
                          ? isToday
                            ? 'bg-primary/10 border-primary/30'
                            : 'bg-background border-border'
                          : 'bg-muted/30 border-border/50'
                      }`}
                    >
                      {day && (
                        <>
                          <div className={`font-semibold mb-1 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                            {format(day, 'd')}
                          </div>
                          <div className="space-y-0.5">
                            {dayEntries.slice(0, 2).map((entry, idx) => {
                              const config = EVENT_TYPE_CONFIG[entry.event_type];
                              return (
                                <button
                                  key={entry.id}
                                  onClick={() => setSelectedEvent(entry)}
                                  className={`w-full px-1 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity ${config.color}`}
                                >
                                  {config.emoji} {entry.title}
                                </button>
                              );
                            })}
                            {dayEntries.length > 2 && (
                              <div className="text-[10px] text-muted-foreground px-1 font-medium cursor-pointer hover:text-foreground" onClick={() => setSelectedEvent(dayEntries[2])}>
                                +{dayEntries.length - 2} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>

        {/* Event List & Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl"
          />

          <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3 max-h-[600px] overflow-y-auto shadow-sm">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No events found</p>
              </div>
            ) : (
              filteredEntries.map((entry, i) => {
                const config = EVENT_TYPE_CONFIG[entry.event_type];
                const isEditable = entry.event_type !== 'birthday' && entry.event_type !== 'work_anniversary';
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border border-border/50 rounded-lg p-3 text-sm hover:border-primary/30 transition-all duration-200 hover:shadow-sm group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 cursor-pointer" onClick={() => setSelectedEvent(entry)}>
                        <p className="font-semibold text-foreground">{config.emoji} {entry.title}</p>
                        <p className="text-xs text-muted-foreground">{format(localDay(entry.date), RECURRING.has(entry.event_type) ? 'MMM d' : 'MMM d, yyyy')}</p>
                        {entry.person_name && (
                          <p className="text-xs text-muted-foreground">{entry.person_name}</p>
                        )}
                        {entry.description && (
                          <p className="text-xs text-foreground/60 mt-1">{entry.description}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingEvent(entry);
                              }}
                              title="Edit event"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEntry.mutate(entry.id);
                            }}
                            title="Delete event"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs mt-2">{config.label}</Badge>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>

      <CultureCalendarDialog open={showDialog} onClose={() => setShowDialog(false)} brokerageId={brokerageId} user={user} />
      <CultureEventDetailModal
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        brokerageId={brokerageId}
        user={user}
        isEditing={editingEvent?.id === selectedEvent?.id}
        onEdit={(updatedData) => {
          if (editingEvent) {
            updateEntry.mutate({ id: editingEvent.id, data: updatedData });
          }
        }}
      />
      {editingEvent && (
        <CultureCalendarDialog
          open={true}
          onClose={() => setEditingEvent(null)}
          brokerageId={brokerageId}
          user={user}
          initialEvent={editingEvent}
          onSuccess={() => setEditingEvent(null)}
        />
      )}
    </div>
    </div>
  );
}