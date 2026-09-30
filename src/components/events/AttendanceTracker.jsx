import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AttendanceTracker({ event, rsvps, onClose, isAdmin }) {
  const queryClient = useQueryClient();

  const toggleCheckIn = useMutation({
    mutationFn: (rsvpId) => {
      const rsvp = rsvps.find(r => r.id === rsvpId);
      return base44.entities.EventRSVP.update(rsvpId, { checked_in: !rsvp?.checked_in });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvps'] });
    },
  });

  const checkedInCount = rsvps.filter(r => r.checked_in).length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attendance Tracking - {event.title}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Checked In</p>
              <p className="text-2xl font-bold text-foreground">{checkedInCount} / {rsvps.length}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">{Math.round((checkedInCount / rsvps.length) * 100)}%</p>
              <p className="text-xs text-muted-foreground">attendance</p>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {rsvps.map((rsvp, i) => (
              <motion.div
                key={rsvp.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  rsvp.checked_in
                    ? 'bg-accent/10 border-accent/30'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{rsvp.user_name}</p>
                  <p className="text-xs text-muted-foreground">{rsvp.user_email}</p>
                  {rsvp.guests_count > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">+{rsvp.guests_count} guest{rsvp.guests_count !== 1 ? 's' : ''}</p>
                  )}
                </div>
                {isAdmin && (
                  <Button
                    onClick={() => toggleCheckIn.mutate(rsvp.id)}
                    variant="ghost"
                    className={`rounded-lg transition-all ${
                      rsvp.checked_in
                        ? 'text-accent hover:bg-accent/10'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {rsvp.checked_in ? (
                      <CheckCircle className="w-5 h-5 fill-current" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </Button>
                )}
                {!isAdmin && (
                  rsvp.checked_in && <CheckCircle className="w-5 h-5 text-accent fill-current" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}