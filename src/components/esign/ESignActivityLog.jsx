import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Eye, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';

const ACTION_CONFIG = {
  viewed: { icon: Eye, color: 'bg-blue-500', label: 'Viewed' },
  signed: { icon: CheckCircle2, color: 'bg-green-500', label: 'Signed' },
  failed: { icon: AlertCircle, color: 'bg-red-500', label: 'Failed' },
};

export default function ESignActivityLog({ documentId }) {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['esign-audit-logs', documentId],
    queryFn: () =>
      base44.entities.ESignAuditLog.filter(
        { document_id: documentId },
        '-created_date',
        100
      ),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">Failed to load activity log</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log, idx) => {
        const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.viewed;
        const Icon = config.icon;

        return (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex gap-4 p-3 rounded-lg bg-muted/30 border border-border/40"
          >
            {/* Icon */}
            <div className={`rounded-full p-2 ${config.color} text-white flex-shrink-0 mt-0.5`}>
              <Icon className="w-4 h-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${config.color} text-white text-xs`}>
                  {config.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-foreground font-medium">{log.signer_email}</p>
              {log.details && (
                <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}