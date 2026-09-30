import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Circle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OnboardingChecklist({ open, onClose, onboarding, brokerageId }) {
  const queryClient = useQueryClient();

  const updateOnboarding = useMutation({
    mutationFn: async (updatedItems) => {
      const allCompleted = updatedItems.every(i => i.completed);
      await base44.entities.Onboarding.update(onboarding.id, {
        items: updatedItems,
        status: allCompleted ? 'completed' : 'in_progress',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding', brokerageId] });
    },
  });

  const handleToggleItem = (itemId) => {
    const updatedItems = onboarding.items.map(item =>
      item.id === itemId
        ? {
            ...item,
            completed: !item.completed,
            completed_date: !item.completed ? new Date().toISOString() : null,
            completed_by_email: !item.completed ? 'broker' : null,
          }
        : item
    );
    updateOnboarding.mutate(updatedItems);
  };

  if (!onboarding) return null;

  const completedCount = onboarding.items.filter(i => i.completed).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboarding Checklist - {onboarding.agent_name}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-2">{completedCount} of {onboarding.items.length} completed</p>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {onboarding.items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                item.completed
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-card border-border/50 hover:bg-muted/50'
              }`}
            >
              <button
                onClick={() => handleToggleItem(item.id)}
                className="flex-shrink-0 transition-transform hover:scale-110"
                disabled={updateOnboarding.isPending}
              >
                {item.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground/30" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.completed ? 'text-foreground/60 line-through' : 'text-foreground'}`}>
                  {item.title}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}