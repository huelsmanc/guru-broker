import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CheckCircle, X, HelpCircle } from 'lucide-react';

export default function RSVPDialog({ open, onClose, event, user, brokerageId, existingRsvp }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(existingRsvp?.status || 'maybe');
  const [guests, setGuests] = useState(existingRsvp?.guests_count || 0);
  const [dietary, setDietary] = useState(existingRsvp?.dietary_notes || '');

  const submitRSVP = useMutation({
    mutationFn: async () => {
      if (existingRsvp) {
        return base44.entities.EventRSVP.update(existingRsvp.id, {
          status,
          guests_count: parseInt(guests) || 0,
          dietary_notes: dietary,
        });
      } else {
        return base44.entities.EventRSVP.create({
          event_id: event?.id,
          brokerage_id: brokerageId,
          user_email: user?.email,
          user_name: user?.full_name,
          status,
          guests_count: parseInt(guests) || 0,
          dietary_notes: dietary,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvps', brokerageId] });
      onClose();
    },
  });

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>RSVP for {event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label className="mb-3 block text-sm font-medium">Your Response *</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'attending', label: 'Attending', icon: CheckCircle, color: 'bg-accent/10 border-accent text-accent' },
                { id: 'maybe', label: 'Maybe', icon: HelpCircle, color: 'bg-yellow-100/50 border-yellow-400 text-yellow-700' },
                { id: 'not_attending', label: 'Can\'t Make It', icon: X, color: 'bg-red-100/50 border-red-400 text-red-700' },
              ].map(option => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => setStatus(option.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                      status === option.id
                        ? `${option.color} border-current`
                        : 'border-border bg-muted/30 hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'attending' && (
            <>
              <div>
                <Label>Additional Guests</Label>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  placeholder="0"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">How many extra people are you bringing?</p>
              </div>

              <div>
                <Label>Dietary Notes</Label>
                <Textarea
                  value={dietary}
                  onChange={(e) => setDietary(e.target.value)}
                  placeholder="e.g., Vegetarian, Gluten-free..."
                  className="mt-1.5 h-20"
                />
              </div>
            </>
          )}

          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Total response:</span> You + {guests} guest{guests !== '1' ? 's' : ''}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submitRSVP.mutate()}
            disabled={submitRSVP.isPending}
            className="gap-2"
          >
            {submitRSVP.isPending ? 'Saving...' : existingRsvp ? 'Update RSVP' : 'Send RSVP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}