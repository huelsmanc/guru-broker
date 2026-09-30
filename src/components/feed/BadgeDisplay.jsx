import React from 'react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const BADGE_CONFIG = {
  team_player: { name: 'Team Player', icon: '🤝', color: 'from-blue-50 to-cyan-50' },
  culture_champion: { name: 'Culture Champion', icon: '🎯', color: 'from-purple-50 to-pink-50' },
  recognition_leader: { name: 'Recognition Leader', icon: '⭐', color: 'from-yellow-50 to-amber-50' },
  kindness_ambassador: { name: 'Kindness Ambassador', icon: '💝', color: 'from-red-50 to-rose-50' },
  milestone_celebrator: { name: 'Milestone Celebrator', icon: '🎉', color: 'from-green-50 to-emerald-50' },
  superstar: { name: 'Superstar', icon: '⚡', color: 'from-orange-50 to-yellow-50' },
};

export default function BadgeDisplay({ badges = [], size = 'md' }) {
  if (!badges || badges.length === 0) return null;

  const sizeClasses = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-lg',
    lg: 'w-12 h-12 text-2xl',
  };

  return (
    <TooltipProvider>
      <div className="flex gap-1 flex-wrap">
        {badges.map((badge) => {
          const config = BADGE_CONFIG[badge.badge_id];
          if (!config) return null;

          return (
            <motion.div
              key={badge.id}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${config.color} border-2 border-primary/20 flex items-center justify-center cursor-pointer shadow-sm hover:shadow-md transition-shadow`}>
                    {config.icon}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div>
                    <p className="font-semibold">{config.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{badge.description}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}