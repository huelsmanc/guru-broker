import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import BadgeDisplay from './BadgeDisplay';

export default function BadgeLeaderboard({ userBadges = [], brokerageUsers = [] }) {
  // Group badges by user and count
  const userBadgeMap = {};
  userBadges.forEach(badge => {
    if (!userBadgeMap[badge.user_email]) {
      userBadgeMap[badge.user_email] = {
        name: badge.user_name,
        email: badge.user_email,
        badges: [],
      };
    }
    userBadgeMap[badge.user_email].badges.push(badge);
  });

  const leaderboardData = Object.values(userBadgeMap)
    .sort((a, b) => b.badges.length - a.badges.length)
    .slice(0, 10);

  if (leaderboardData.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-amber-600" />
        <h2 className="text-lg font-semibold text-foreground">Badge Leaderboard</h2>
      </div>
      <div className="space-y-3">
        {leaderboardData.map((entry, idx) => (
          <motion.div
            key={entry.email}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-sm text-primary">
                {idx + 1}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.badges.length} badge{entry.badges.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <BadgeDisplay badges={entry.badges.slice(0, 3)} size="sm" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}