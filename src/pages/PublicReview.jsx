import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Star, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PublicReview() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadReview = async () => {
      try {
        if (!token) {
          setError('No review token provided');
          setLoading(false);
          return;
        }

        const response = await base44.functions.invoke('getReviewByToken', { token });
        if (response.data?.review) {
          setReview(response.data.review);
        } else {
          setError('Review link not found or has expired');
        }
      } catch (err) {
        console.error('Error loading review:', err);
        setError('Failed to load review - ' + (err?.response?.data?.error || err?.message || 'unknown error'));
      } finally {
        setLoading(false);
      }
    };

    loadReview();
  }, [token]);

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please select a rating');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await base44.functions.invoke('submitReview', {
        reviewId: review.id,
        rating,
        comment
      });
      setSuccess(true);
      setTimeout(() => {
        setRating(0);
        setComment('');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-muted-foreground">Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-6">
        <Card className="max-w-md w-full p-8 text-center border-border/40">
          <AlertCircle className="w-12 h-12 text-destructive/50 mx-auto mb-3" />
          <p className="text-foreground font-semibold mb-1">Review Not Found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md w-full p-8 text-center border-border/40">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-foreground font-semibold mb-1">Thank You!</p>
            <p className="text-sm text-muted-foreground">Your review has been submitted and will be displayed on our dashboard.</p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <Card className="p-8 border-border/40">
          <h1 className="text-2xl font-bold text-foreground mb-1">Rate Your Experience</h1>
          <p className="text-sm text-muted-foreground mb-6">Help us improve by sharing your feedback about working with <strong>{review.agent_name}</strong></p>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-6 flex gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Star Rating */}
            <div>
              <label className="text-sm font-medium text-foreground mb-3 block">How would you rate your experience? *</label>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-10 h-10 ${
                        star <= rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground/30'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Additional Comments</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what made your experience great (or how we can improve)..."
                className="resize-none h-28"
              />
            </div>

            {/* Transaction Details */}
            <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground">Client</p>
                <p className="font-medium text-foreground">{review.client_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Property</p>
                <p className="font-medium text-foreground">{review.property_address}</p>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting || !rating}
              className="w-full h-11 rounded-xl gap-2"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}