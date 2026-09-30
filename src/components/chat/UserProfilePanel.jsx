import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { X, Award, Lightbulb, Phone, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const ROLE_COLORS = {
  admin: 'bg-red-100 dark:bg-red-950 text-red-700',
  user: 'bg-blue-100 dark:bg-blue-950 text-blue-700',
};

export default function UserProfilePanel({ user, brokerageId, onClose }) {
  const { data: userDetails } = useQuery({
    queryKey: ['user-details', user?.email],
    queryFn: () => base44.entities.User.filter({ email: user?.email }),
    enabled: !!user?.email,
  });

  const userInfo = userDetails?.[0] || user;



  const { data: recognitions = [] } = useQuery({
    queryKey: ['user-recognitions', user?.email, brokerageId],
    queryFn: () => base44.entities.Recognition.filter({ to_email: user?.email, brokerage_id: brokerageId }, '-created_date', 5),
    enabled: !!user?.email && !!brokerageId,
  });

  const { data: ideas = [] } = useQuery({
    queryKey: ['user-ideas', user?.email, brokerageId],
    queryFn: () => base44.entities.Idea.filter({ submitter_email: user?.email, brokerage_id: brokerageId }, '-created_date', 5),
    enabled: !!user?.email && !!brokerageId,
  });

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      className="fixed right-0 top-0 h-full w-96 bg-card border-l border-border shadow-lg flex flex-col z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-bold text-foreground">User Profile</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* User Info */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-2xl font-bold overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
            {userInfo?.headshot ? (
              <img src={userInfo.headshot} alt={userInfo?.full_name} className="w-full h-full object-cover" />
            ) : (
              userInfo?.full_name?.[0]?.toUpperCase()
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">{userInfo?.full_name}</h3>
            <p className="text-xs text-muted-foreground">{userInfo?.email}</p>
          </div>
          <div className="flex justify-center">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[userInfo?.role] || 'bg-muted text-foreground'}`}>
              {userInfo?.role?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Position & Contact */}
        <div className="space-y-3 border-t border-border pt-4">
          {userInfo?.title && (
            <div className="flex items-start gap-3">
              <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Position</p>
                <p className="text-sm font-medium text-foreground">{userInfo.title}</p>
              </div>
            </div>
          )}
          {userInfo?.phone && (
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a href={`tel:${userInfo.phone}`} className="text-sm font-medium text-primary hover:underline">
                  {userInfo.phone}
                </a>
              </div>
            </div>
          )}
        </div>



        {/* Recognitions */}
        {recognitions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Award className="w-4 h-4" />
              Recognitions Received
            </div>
            <div className="space-y-2">
              {recognitions.map((rec) => (
                <div key={rec.id} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30 rounded-lg p-2 text-xs space-y-1">
                  <p className="font-medium text-foreground">{rec.from_name}</p>
                  <p className="text-foreground/80">{rec.message}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {rec.category && `• ${rec.category.replace('_', ' ')}`}
                    {' '} • {format(new Date(rec.created_date), 'MMM d')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ideas */}
        {ideas.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lightbulb className="w-4 h-4" />
              Submitted Ideas
            </div>
            <div className="space-y-2">
              {ideas.map((idea) => (
                <div key={idea.id} className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/30 rounded-lg p-2 text-xs space-y-1">
                  <p className="font-medium text-foreground line-clamp-1">{idea.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {idea.status.replace('_', ' ')} • {idea.upvotes?.length || 0} upvotes
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {recognitions.length === 0 && ideas.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}