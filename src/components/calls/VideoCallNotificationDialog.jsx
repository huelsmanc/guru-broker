import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VideoCallNotificationDialog({ open, onOpenChange, call, onJoin }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incoming Video Call</DialogTitle>
        </DialogHeader>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="py-6 text-center space-y-4"
        >
          <div className="flex justify-center mb-4">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center"
            >
              <Phone className="w-8 h-8 text-primary" />
            </motion.div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Call from broker</p>
            <p className="text-lg font-semibold text-foreground mt-1">{call?.topic}</p>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl"
            >
              <X className="w-4 h-4 mr-2" /> Decline
            </Button>
            <Button
              onClick={() => onJoin(call)}
              className="flex-1 rounded-xl gap-2 bg-primary hover:bg-primary/90"
            >
              <Phone className="w-4 h-4" /> Join
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}