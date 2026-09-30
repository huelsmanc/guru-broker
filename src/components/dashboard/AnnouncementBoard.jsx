import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Megaphone, X, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function AnnouncementBoard({ brokerageId, user, isAdmin }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [messageText, setMessageText] = useState('');

  const { data: announcement } = useQuery({
    queryKey: ['announcement', brokerageId],
    queryFn: async () => {
      const results = await base44.entities.DashboardAnnouncement.filter(
        { brokerage_id: brokerageId },
        '-created_date',
        1
      );
      return results[0] || null;
    },
    enabled: !!brokerageId,
  });

  const createAnnouncement = useMutation({
    mutationFn: async (message) => {
      if (announcement) {
        await base44.entities.DashboardAnnouncement.update(announcement.id, {
          message,
          posted_by_email: user.email,
          posted_by_name: user.full_name,
        });
      } else {
        await base44.entities.DashboardAnnouncement.create({
          brokerage_id: brokerageId,
          message,
          posted_by_email: user.email,
          posted_by_name: user.full_name,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['announcement', brokerageId] });
    },
    onSuccess: () => {
      setMessageText('');
      setShowDialog(false);
    },
  });

  const deleteAnnouncement = useMutation({
    mutationFn: (id) => base44.entities.DashboardAnnouncement.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement', brokerageId] });
    },
  });

  if (!announcement && !isAdmin) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-5 h-full"
      >
        <div className="flex items-start gap-4">
          <Megaphone className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            {announcement ? (
              <>
                <h3 className="font-semibold text-foreground text-sm mb-1">Message from {announcement.posted_by_name}</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{announcement.message}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Posted {format(new Date(announcement.created_date), 'MMM d, h:mm a')}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">No announcements yet</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-shrink-0">
              <Button
                onClick={() => {
                  setMessageText(announcement?.message || '');
                  setShowDialog(true);
                }}
                variant="ghost"
                size="icon"
                className="rounded-lg text-primary hover:text-primary"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              {announcement && (
                <Button
                  onClick={() => deleteAnnouncement.mutate(announcement.id)}
                  disabled={deleteAnnouncement.isPending}
                  variant="ghost"
                  size="icon"
                  className="rounded-lg text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{announcement ? 'Edit Announcement' : 'Post Announcement'}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write your message of the day..."
            className="min-h-[120px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createAnnouncement.mutate(messageText)}
              disabled={!messageText.trim() || createAnnouncement.isPending}
            >
              {createAnnouncement.isPending ? 'Posting...' : 'Post Announcement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}