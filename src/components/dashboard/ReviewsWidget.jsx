import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ReviewsWidget({ brokerageId }) {
  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', brokerageId],
    queryFn: async () => {
      const all = await base44.entities.ClientReview.filter({
        brokerage_id: brokerageId,
        status: 'submitted'
      }, '-created_date', 10);
      return all;
    },
    enabled: !!brokerageId,
    refetchInterval: 30000,
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : 0;

  return (
    <Card className="p-6 border-border/40 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          <h3 className="font-semibold text-foreground">Client Reviews</h3>
        </div>
        {reviews.length > 0 && (
          <Badge className="bg-primary/20 text-primary border-primary/30">
            {avgRating} / 5.0
          </Badge>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No reviews yet. Share client appreciation emails to get feedback.
        </p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {reviews.map((review, idx) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white/50 dark:bg-slate-900/30 rounded-lg p-3 border border-border/40"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{review.client_name}</p>
                  <p className="text-xs text-muted-foreground">for <strong>{review.agent_name}</strong></p>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= review.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground/20'
                      }`}
                    />
                  ))}
                </div>
              </div>
              {review.comment && (
                <p className="text-xs text-foreground leading-relaxed italic">{review.comment}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}