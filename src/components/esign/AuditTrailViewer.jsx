import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Eye, CheckCircle, MapPin, Smartphone, Globe, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function AuditTrailViewer({ activities }) {
  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'uploaded':
        return <Upload className="w-4 h-4 text-primary" />;
      case 'viewed':
        return <Eye className="w-4 h-4 text-blue-500" />;
      case 'signed':
        return <CheckCircle className="w-4 h-4 text-accent" />;
      default:
        return null;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'uploaded':
        return 'Document Uploaded';
      case 'viewed':
        return 'Document Viewed';
      case 'signed':
        return 'Document Signed';
      default:
        return 'Action';
    }
  };

  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No activities yet</p>
        </div>
      ) : (
        activities.map((activity, idx) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex items-start gap-3 bg-muted rounded-lg p-4"
          >
            <div className="mt-1">{getActionIcon(activity.action_type)}</div>
            <div className="flex-1 min-w-0">
              {/* Primary action info */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {getActionLabel(activity.action_type)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activity.user_name} ({activity.user_email})
                  </p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {format(new Date(activity.created_date), 'MMM d, yyyy h:mm a')}
                </span>
              </div>

              {/* Enhanced metadata grid */}
              {(activity.ip_address || activity.user_agent || activity.location) && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {/* IP Address */}
                  {activity.ip_address && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate font-mono">{activity.ip_address}</span>
                    </div>
                  )}

                  {/* Device/Browser Info */}
                  {activity.user_agent && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Smartphone className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{activity.user_agent}</span>
                    </div>
                  )}

                  {/* Location */}
                  {activity.location && (
                    <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {activity.location.city && `${activity.location.city}, `}
                        {activity.location.region && `${activity.location.region}, `}
                        {activity.location.country || 'Unknown Location'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Details */}
              {activity.details && (
                <p className="text-xs text-muted-foreground mt-2">{activity.details}</p>
              )}
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}