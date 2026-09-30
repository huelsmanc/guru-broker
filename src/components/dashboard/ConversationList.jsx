import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, UserCheck, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const categoryLabels = {
  transaction: 'Transaction',
  compliance: 'Compliance',
  marketing: 'Marketing',
  tech_support: 'Tech Support',
  commission: 'Commission',
  training: 'Training',
  general: 'General',
};

const statusColors = {
  active: 'bg-accent text-accent-foreground',
  resolved: 'bg-muted text-muted-foreground',
  pending: 'bg-chart-4/20 text-chart-4',
};

export default function ConversationList({ conversations, isBrokerView }) {
  if (!conversations?.length) {
    return (
      <div className="text-center py-16">
        <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv, i) => (
        <motion.div
          key={conv.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          {(() => {
            const isOlderThan24h = conv.updated_date && (Date.now() - new Date(conv.updated_date).getTime()) > 86400000;
            const hasUrgent = conv.tags?.includes('urgent');
            return (
              <Link
                to={`/Chat?id=${conv.id}`}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all group ${
                  hasUrgent
                    ? 'bg-destructive/5 border-destructive/30 hover:border-destructive/50 hover:shadow-md hover:shadow-destructive/10'
                    : isOlderThan24h && !isBrokerView
                    ? 'bg-muted/50 border-border/50 opacity-60'
                    : 'bg-card border-border hover:border-primary/30 hover:shadow-md'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {conv.agent_name?.[0]?.toUpperCase() || 'A'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {conv.tags?.includes('urgent') && (
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                    )}
                    <p className="font-semibold text-sm text-foreground truncate">{conv.title}</p>
                    <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${statusColors[conv.status] || ''}`}>
                      {conv.status}
                    </Badge>
                    {conv.tags?.includes('high_priority') && (
                      <Badge className="text-[10px] px-2 py-0 bg-chart-4/20 text-chart-4 border border-chart-4/30">High Priority</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {isBrokerView && <span className="font-medium">{conv.agent_name} · </span>}
                    {conv.last_message_preview || 'No messages yet'}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {conv.updated_date ? format(new Date(conv.updated_date), 'MMM d, h:mm a') : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    {conv.handled_by === 'broker' ? (
                      <UserCheck className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-accent" />
                    )}
                    <span className="text-[10px] text-muted-foreground">{conv.handled_by === 'broker' ? 'Broker' : 'Support'}</span>
                  </div>
                </div>

                {conv.category && (
                  <Badge variant="outline" className="text-[10px] hidden md:inline-flex">
                    {categoryLabels[conv.category] || conv.category}
                  </Badge>
                )}
              </Link>
            );
          })()}
        </motion.div>
      ))}
    </div>
  );
}