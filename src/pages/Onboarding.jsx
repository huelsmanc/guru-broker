import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Circle, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function Onboarding() {
  const { user, brokerageId } = useOutletContext();

  const { data: onboarding } = useQuery({
    queryKey: ['onboarding', user?.email, brokerageId],
    queryFn: () => base44.entities.Onboarding.filter({
      brokerage_id: brokerageId,
      agent_email: user?.email,
    }).then(results => results[0] || null),
    enabled: !!user?.email && !!brokerageId,
  });

  if (!onboarding) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <Briefcase className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No onboarding checklist found. Contact your broker.</p>
        </motion.div>
      </div>
    );
  }

  const completedCount = onboarding.items.filter(i => i.completed).length;
  const progress = Math.round((completedCount / onboarding.items.length) * 100);

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Onboarding Checklist</h1>
            <p className="text-muted-foreground text-sm mt-1">Complete your setup with us</p>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-card border border-border/50 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-foreground">{completedCount} of {onboarding.items.length} completed</p>
            <Badge className="bg-primary/10 text-primary">{progress}%</Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
            />
          </div>
        </div>

        {/* Checklist Items */}
        <div className="space-y-3">
          {onboarding.items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                item.completed
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-card border-border/50 hover:border-border'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {item.completed ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${item.completed ? 'text-foreground/60 line-through' : 'text-foreground'}`}>
                  {item.title}
                </p>
                {item.completed_date && (
                  <p className="text-xs text-green-600 mt-1">
                    Completed {format(new Date(item.completed_date), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}