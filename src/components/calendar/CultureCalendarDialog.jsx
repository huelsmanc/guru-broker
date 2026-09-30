import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const EVENT_TYPES = [
  { value: 'company_event', label: '🏢 Company Event' },
  { value: 'team_activity', label: '🤝 Team Activity' },
];

export default function CultureCalendarDialog({ open, onClose, brokerageId, user, initialEvent, onSuccess }) {
  const queryClient = useQueryClient();
  const isEditMode = !!initialEvent;
  const [form, setForm] = useState(() => initialEvent ? {
    event_type: initialEvent.event_type,
    title: initialEvent.title,
    description: initialEvent.description || '',
    date: initialEvent.date,
  } : {
    event_type: 'company_event',
    title: '',
    description: '',
    date: '',
  });

  React.useEffect(() => {
    if (initialEvent && open) {
      setForm({
        event_type: initialEvent.event_type,
        title: initialEvent.title,
        description: initialEvent.description || '',
        date: initialEvent.date,
      });
    }
  }, [initialEvent, open]);

  const createEntry = useMutation({
    mutationFn: async () => {
      const dateObj = new Date(form.date);
      const month = format(dateObj, 'yyyy-MM');

      const entry = await base44.entities.CultureCalendarEntry.create({
        brokerage_id: brokerageId,
        event_type: form.event_type,
        title: form.title,
        description: form.description,
        date: form.date,
        month,
        created_by_email: user?.email,
        created_by_name: user?.full_name,
      });

      // Trigger notifications for new calendar event
      base44.functions.invoke('notifyOnCalendarEvent', {
        eventId: entry.id,
        eventTitle: form.title,
        eventDate: form.date,
        createdByName: user?.full_name,
        brokerageId,
        eventType: form.event_type
      }).catch(() => {});

      queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] });
      },
      onSuccess: () => {
      setForm({
        event_type: 'company_event',
        title: '',
        description: '',
        date: '',
      });
      onClose();
      },
  });

  const updateEntry = useMutation({
    mutationFn: async () => {
      const dateObj = new Date(form.date);
      const month = format(dateObj, 'yyyy-MM');

      await base44.entities.CultureCalendarEntry.update(initialEvent.id, {
        event_type: form.event_type,
        title: form.title,
        description: form.description,
        date: form.date,
        month,
      });

      queryClient.invalidateQueries({ queryKey: ['culture-calendar', brokerageId] });
    },
    onSuccess: () => {
      setForm({
        event_type: 'company_event',
        title: '',
        description: '',
        date: '',
      });
      if (onSuccess) onSuccess();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim() || !form.date) return;
    if (isEditMode) {
      updateEntry.mutate();
    } else {
      createEntry.mutate();
    }
  };

  const minDate = format(new Date(), 'yyyy-MM-dd');
  const isPending = isEditMode ? updateEntry.isPending : createEntry.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Event' : 'Add Event'}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Birthdays and work anniversaries are auto-synced from profile settings.</p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="event-type">Event Type *</Label>
            <Select value={form.event_type} onValueChange={(value) => setForm({ ...form, event_type: value })}>
              <SelectTrigger id="event-type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Sarah's Birthday"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              min={minDate}
              className="mt-1.5"
            />
          </div>



          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add any notes or details..."
              className="mt-1.5 h-20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.title.trim() || !form.date || isPending}
          >
            {isPending ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Event' : 'Add Event')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add import for useEffect at the top of the file if missing