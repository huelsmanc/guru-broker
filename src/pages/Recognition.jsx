import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Heart, Plus, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import RecognitionCard from '@/components/recognition/RecognitionCard';
import GiveRecognitionDialog from '@/components/recognition/GiveRecognitionDialog';

const CATEGORIES = [
  { id: 'teamwork', label: 'Teamwork', emoji: '🤝' },
  { id: 'client_service', label: 'Client Service', emoji: '😊' },
  { id: 'sales', label: 'Sales', emoji: '🎯' },
  { id: 'leadership', label: 'Leadership', emoji: '⭐' },
  { id: 'creativity', label: 'Creativity', emoji: '💡' },
  { id: 'persistence', label: 'Persistence', emoji: '💪' },
  { id: 'other', label: 'Other', emoji: '👏' },
];

export default function Recognition() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  const { data: recognitions = [] } = useQuery({
    queryKey: ['recognitions', brokerageId],
    queryFn: () => base44.entities.Recognition.filter({ brokerage_id: brokerageId }, '-created_date', 200),
    enabled: !!brokerageId,
  });

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-recognition', user?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('getBrokerageUsers', {});
      return res.data?.users || [];
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  // Helper to get display name with fallback
  const getDisplayName = (user) => user?.display_name || user?.full_name || 'Unknown';

  React.useEffect(() => {
    const unsubRec = base44.entities.Recognition.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['recognitions', brokerageId] });
    });
    const unsubUser = base44.entities.User.subscribe(() => {
      queryClient.refetchQueries({ queryKey: ['brokerage-users-recognition', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recognitions', brokerageId] });
    });
    return () => {
      unsubRec();
      unsubUser();
    };
  }, [brokerageId, user?.id, queryClient]);

  const filteredRecognitions = recognitions.filter(r => {
    const categoryMatch = filterCategory === 'all' || r.category === filterCategory;
    return categoryMatch;
  });

  // Count recognitions given and received
  const givenCount = recognitions.filter(r => r.from_email === user?.email).length;
  const receivedCount = recognitions.filter(r => r.to_email === user?.email).length;
  const totalGiven = recognitions.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 p-6 lg:p-10 overflow-hidden relative">
      {/* Animated background blur */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-destructive/5 to-accent/5 rounded-full blur-3xl opacity-40 -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-destructive/5 rounded-full blur-3xl opacity-40 -z-10 animate-pulse" />

      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-16">
          <div className="flex items-center justify-between gap-8 flex-col sm:flex-row">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-destructive to-destructive/70 flex items-center justify-center shadow-lg shadow-destructive/30"
                >
                  <Heart className="w-7 h-7 text-white" fill="white" />
                </motion.div>
                <div>
                  <h1 className="text-4xl lg:text-5xl font-black text-foreground tracking-tighter">Peer Recognition</h1>
                  <p className="text-sm text-muted-foreground mt-1.5 font-medium">Celebrate excellence and inspire greatness</p>
                </div>
              </div>
            </div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
              <Button 
                onClick={() => setShowDialog(true)} 
                className="gap-2.5 rounded-full h-12 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:shadow-2xl hover:shadow-green-500/40 text-white font-semibold transition-all duration-300 hover:scale-105"
              >
                <Sparkles className="w-4 h-4" /> Give Kudos
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
          {[
            { label: 'Given', value: givenCount, delay: 0, gradient: 'from-blue-500/20 to-blue-600/10' },
            { label: 'Received', value: receivedCount, delay: 0.1, gradient: 'from-purple-500/20 to-purple-600/10' },
            { label: 'Team Total', value: totalGiven, delay: 0.2, gradient: 'from-rose-500/20 to-rose-600/10' },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stat.delay, duration: 0.5 }}
              className="group"
            >
              <div className={`relative h-full bg-gradient-to-br ${stat.gradient} backdrop-blur-xl rounded-2xl border border-white/10 p-7 overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl`}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/5 to-transparent rounded-2xl" />
                <div className="relative">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 opacity-70">{stat.label}</p>
                  <p className="text-4xl font-black text-foreground mb-1">{stat.value}</p>
                  <div className="h-1 w-12 bg-gradient-to-r from-primary to-accent rounded-full" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20 p-6 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 mb-5">
            <Zap className="w-5 h-5 text-primary" />
            <p className="text-sm font-bold text-foreground uppercase tracking-wider">Filter by Category</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterCategory('all')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                filterCategory === 'all'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30'
                  : 'bg-white/10 text-foreground border border-white/20 hover:bg-white/15 hover:border-white/30'
              }`}
            >
              All
            </motion.button>
            {CATEGORIES.map((cat, i) => (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilterCategory(cat.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                  filterCategory === cat.id
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30'
                    : 'bg-white/10 text-foreground border border-white/20 hover:bg-white/15 hover:border-white/30'
                }`}
              >
                <span className="text-base">{cat.emoji}</span>
                {cat.label}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Recognitions List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="space-y-4">
          {filteredRecognitions.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="text-center py-24"
            >
              <motion.div 
                animate={{ y: [0, -10, 0] }} 
                transition={{ duration: 3, repeat: Infinity }}
                className="mb-4"
              >
                <Heart className="w-16 h-16 text-muted-foreground/30 mx-auto" />
              </motion.div>
              <p className="text-muted-foreground text-lg font-medium">
                {recognitions.length === 0 ? '✨ Be the first to give kudos!' : 'No recognitions in this category.'}
              </p>
            </motion.div>
          ) : (
            filteredRecognitions.map((recognition, i) => (
              <motion.div
                key={recognition.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                whileHover={{ y: -4 }}
              >
                <RecognitionCard recognition={recognition} isOwn={recognition.from_email === user?.email} user={user} brokerageId={brokerageId} brokerageUsers={brokerageUsers} />
              </motion.div>
            ))
          )}
        </motion.div>

        <GiveRecognitionDialog
          open={showDialog}
          onClose={() => setShowDialog(false)}
          brokerageId={brokerageId}
          user={user}
          brokerageUsers={brokerageUsers}
        />
      </div>
    </div>
  );
}