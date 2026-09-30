import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Lightbulb, Plus, Zap, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import IdeaCard from '@/components/ideas/IdeaCard';
import SubmitIdeaDialog from '@/components/ideas/SubmitIdeaDialog';
import AdminIdeaPanel from '@/components/ideas/AdminIdeaPanel';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

const CATEGORIES = [
  { id: 'process', label: 'Process' },
  { id: 'technology', label: 'Technology' },
  { id: 'culture', label: 'Culture' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'client_service', label: 'Client Service' },
  { id: 'other', label: 'Other' },
];

export default function IdeaHub() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [showSubmit, setShowSubmit] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedIdea, setSelectedIdea] = useState(null);

  const { data: ideas = [] } = useQuery({
    queryKey: ['ideas', brokerageId],
    queryFn: () => base44.entities.Idea.filter({ brokerage_id: brokerageId }, '-upvotes.length', 200),
    enabled: !!brokerageId,
  });

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-ideas', brokerageId],
    queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId,
  });

  const upvoteIdea = useMutation({
    mutationFn: async (ideaId) => {
      const idea = ideas.find(i => i.id === ideaId);
      const hasUpvoted = idea.upvotes?.includes(user.email);
      const hasDownvoted = idea.downvotes?.includes(user.email);
      const newUpvotes = hasUpvoted
        ? idea.upvotes.filter(e => e !== user.email)
        : [...(idea.upvotes || []), user.email];
      const newDownvotes = hasDownvoted ? idea.downvotes.filter(e => e !== user.email) : idea.downvotes;
      await base44.entities.Idea.update(ideaId, { upvotes: newUpvotes, downvotes: newDownvotes });
      queryClient.invalidateQueries({ queryKey: ['ideas', brokerageId] });
    },
  });

  const downvoteIdea = useMutation({
    mutationFn: async (ideaId) => {
      const idea = ideas.find(i => i.id === ideaId);
      const hasDownvoted = idea.downvotes?.includes(user.email);
      const hasUpvoted = idea.upvotes?.includes(user.email);
      const newDownvotes = hasDownvoted
        ? idea.downvotes.filter(e => e !== user.email)
        : [...(idea.downvotes || []), user.email];
      const newUpvotes = hasUpvoted ? idea.upvotes.filter(e => e !== user.email) : idea.upvotes;
      await base44.entities.Idea.update(ideaId, { downvotes: newDownvotes, upvotes: newUpvotes });
      queryClient.invalidateQueries({ queryKey: ['ideas', brokerageId] });
    },
  });

  const filteredIdeas = ideas.filter(idea => {
    const statusMatch = filterStatus === 'all' || idea.status === filterStatus;
    const categoryMatch = filterCategory === 'all' || idea.category === filterCategory;
    return statusMatch && categoryMatch;
  });

  // Sort by net score (upvotes - downvotes)
  const sortedIdeas = [...filteredIdeas].sort((a, b) => {
    const scoreA = (a.upvotes?.length || 0) - (a.downvotes?.length || 0);
    const scoreB = (b.upvotes?.length || 0) - (b.downvotes?.length || 0);
    return scoreB - scoreA;
  });

  // Stats
  const implemented = ideas.filter(i => i.status === 'implemented').length;
  const underReview = ideas.filter(i => i.status === 'under_review').length;
  const inProgress = ideas.filter(i => i.status === 'in_progress').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 p-6 lg:p-10 overflow-hidden relative">
      {/* Animated background blur */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-accent/5 rounded-full blur-3xl opacity-40 -z-10 animate-pulse" />
      <div className="absolute bottom-1/3 left-0 w-96 h-96 bg-gradient-to-br from-accent/5 to-primary/5 rounded-full blur-3xl opacity-40 -z-10 animate-pulse" />

      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-12">
          <div className="flex items-center justify-between gap-8 flex-col sm:flex-row">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30"
                >
                  <Lightbulb className="w-7 h-7 text-white" fill="white" />
                </motion.div>
                <div>
                  <h1 className="text-4xl lg:text-5xl font-black text-foreground tracking-tighter">Idea Hub</h1>
                  <p className="text-sm text-muted-foreground mt-1.5 font-medium">Innovate together and shape the future</p>
                </div>
              </div>
            </div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
              <Button 
                onClick={() => setShowSubmit(true)} 
                className="gap-2.5 rounded-full h-12 px-6 bg-gradient-to-r from-primary to-primary/80 hover:shadow-2xl hover:shadow-primary/40 text-white font-semibold transition-all duration-300 hover:scale-105"
              >
                <Plus className="w-4 h-4" /> Submit Idea
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {[
            { label: 'Total Ideas', value: ideas.length, icon: Lightbulb, delay: 0, gradient: 'from-primary/20 to-primary/10' },
            { label: 'Under Review', value: underReview, icon: Clock, delay: 0.1, gradient: 'from-blue-500/20 to-blue-600/10' },
            { label: 'In Progress', value: inProgress, icon: TrendingUp, delay: 0.2, gradient: 'from-amber-500/20 to-amber-600/10' },
            { label: 'Implemented', value: implemented, icon: CheckCircle, delay: 0.3, gradient: 'from-green-500/20 to-green-600/10' },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stat.delay, duration: 0.5 }}
                className="group"
              >
                <div className={`relative h-full bg-gradient-to-br ${stat.gradient} backdrop-blur-xl rounded-2xl border border-white/10 p-6 overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl`}>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/5 to-transparent rounded-2xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">{stat.label}</p>
                      <Icon className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                    <p className="text-4xl font-black text-foreground mb-1">{stat.value}</p>
                    <div className="h-1 w-12 bg-gradient-to-r from-primary to-accent rounded-full" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Filter Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20 p-6 backdrop-blur-xl"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-primary" />
              <p className="text-sm font-bold text-foreground uppercase tracking-wider">Filter by Status</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {['all', 'under_review', 'in_progress', 'implemented'].map((status) => {
                const labels = { all: 'All Status', under_review: 'Under Review', in_progress: 'In Progress', implemented: 'Implemented' };
                return (
                  <motion.button
                    key={status}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFilterStatus(status)}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      filterStatus === status
                        ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30'
                        : 'bg-white/10 text-foreground border border-white/20 hover:bg-white/15 hover:border-white/30'
                    }`}
                  >
                    {labels[status]}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center gap-3 mb-4">
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
                All Categories
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
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    filterCategory === cat.id
                      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30'
                      : 'bg-white/10 text-foreground border border-white/20 hover:bg-white/15 hover:border-white/30'
                  }`}
                >
                  {cat.label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Ideas List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="space-y-4">
          {sortedIdeas.length === 0 ? (
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
                <Lightbulb className="w-16 h-16 text-muted-foreground/30 mx-auto" />
              </motion.div>
              <p className="text-muted-foreground text-lg font-medium">
                {ideas.length === 0 ? '✨ Be the first to share an idea!' : 'No ideas match these filters.'}
              </p>
            </motion.div>
          ) : (
            sortedIdeas.map((idea, i) => (
              <motion.div
                key={idea.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                whileHover={{ y: -4 }}
                className="group"
              >
                <div className="relative">
                  <IdeaCard
                    idea={idea}
                    onUpvote={() => upvoteIdea.mutate(idea.id)}
                    onDownvote={() => downvoteIdea.mutate(idea.id)}
                    currentUserEmail={user?.email}
                    isAdmin={isAdmin}
                    brokerageUsers={brokerageUsers}
                    brokerageId={brokerageId}
                  />
                  {isAdmin && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setSelectedIdea(idea)}
                      className="absolute top-6 right-6 px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-primary to-accent text-white transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                    >
                      Manage
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>

      <SubmitIdeaDialog
        open={showSubmit}
        onClose={() => setShowSubmit(false)}
        brokerageId={brokerageId}
        user={user}
      />

      {selectedIdea && (
        <AdminIdeaPanel
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
        />
      )}
    </div>
  );
}