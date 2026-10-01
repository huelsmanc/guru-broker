import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, Lock } from 'lucide-react';
import { useChat } from '@/lib/chat/ChatProvider';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJIS = ['💬', '🏠', '📋', '📣', '😄', '🎉', '📊', '💼', '🤝', '📢', '💡', '⚡', '🎯', '✅', '📞', '🔔'];

export default function ChatChannelsDropdown({ brokerageId, isAdmin, isSuperAdmin, onChannelClick }) {
  const [isOpen, setIsOpen] = useState(true);
  const [newPrivate, setNewPrivate] = useState(false);
  const chat = useChat();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelEmoji, setNewChannelEmoji] = useState('💬');
  const [deletingChannelId, setDeletingChannelId] = useState(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const urlParams = new URLSearchParams(location.search);
  const activeChannel = location.pathname === '/SocialChat' ? urlParams.get('channel') : null;

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', brokerageId],
    queryFn: async () => {
      if (!brokerageId) return [];
      return base44.entities.Channel.filter({ brokerage_id: brokerageId }, 'created_date', 100);
    },
    enabled: !!brokerageId,
  });

  const addChannelMutation = useMutation({
    mutationFn: async () => {
      if (!newChannelName.trim()) return null;
      const name = newChannelName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // Check if channel with this name already exists to prevent duplicates
      const existing = await base44.entities.Channel.filter({ brokerage_id: brokerageId, name });
      if (existing.length > 0) return null;
      return base44.entities.Channel.create({
        brokerage_id: brokerageId,
        name,
        label: newChannelName,
        emoji: newChannelEmoji,
        is_private: newPrivate,
        created_by_email: chat?.me,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', brokerageId] });
      setNewChannelName('');
      setNewChannelEmoji('💬');
      setNewPrivate(false);
      setShowAddDialog(false);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id) => base44.entities.Channel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', brokerageId] });
      setDeletingChannelId(null);
    },
  });

  // Hide entire section for super admins NOT inside a brokerage
  if (isSuperAdmin && !brokerageId) {
    return null;
  }

  return (
    <div className="px-3 py-2 border-t border-sidebar-border">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between gap-2 text-left"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/60">Channels</span>
          <ChevronDown className={cn('w-4 h-4 text-sidebar-foreground/40 transition-transform duration-200', isOpen && 'rotate-180')} />
        </button>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAddDialog(true);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-primary/20 text-sidebar-foreground/50 hover:text-sidebar-primary transition-all"
            title="Add channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Channels List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1.5 space-y-1 overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {channels.length === 0 ? (
              <p className="text-xs text-sidebar-foreground/40 px-3 py-2">No channels</p>
            ) : (
              channels.map((ch) => {
                const isActive = activeChannel === ch.name;
                const u = chat?.unread.get(`channel:${ch.name}`);
                const bold = !isActive && u?.unread > 0;
                return (
                  <motion.div
                    key={ch.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-1"
                  >
                    <button
                       onClick={(e) => {
                         e.stopPropagation();
                         navigate(`/SocialChat?channel=${ch.name}`);
                         onChannelClick?.();
                       }}
                      className={cn(
                        'flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-sidebar-primary/90 text-sidebar-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                      )}
                    >
                      <span className="text-lg leading-none flex-shrink-0">{ch.emoji}</span>
                      <span className={cn('truncate flex-1 text-left', bold && 'font-bold text-sidebar-foreground')}>{ch.label}</span>
                      {ch.is_private && <Lock className="w-3 h-3 opacity-50 flex-shrink-0" />}
                      {!isActive && u?.mentions > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{u.mentions}</span>}
                    </button>
                    {isAdmin && !ch.is_default && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        onClick={() => setDeletingChannelId(ch.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-all duration-150 flex-shrink-0"
                        title="Delete channel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Channel Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Channel Name</label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. Open Houses, Marketing Tips"
                onKeyDown={(e) => { if (e.key === 'Enter' && !addChannelMutation.isPending && newChannelName.trim()) { e.preventDefault(); addChannelMutation.mutate(); } }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">Will be formatted as lowercase with hyphens</p>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
              <span><b>Private channel</b><br /><span className="text-muted-foreground">Only people you add (and admins) can see it. Add members from the channel after creating it.</span></span></label>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Channel Icon</label>
              <div className="grid grid-cols-8 gap-2">
                {EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setNewChannelEmoji(emoji)}
                    className={cn(
                      'text-2xl p-2 rounded-lg transition-all duration-150',
                      newChannelEmoji === emoji 
                        ? 'bg-primary/30 ring-2 ring-primary scale-110' 
                        : 'hover:bg-muted'
                    )}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => { if (!addChannelMutation.isPending) addChannelMutation.mutate(); }} 
              disabled={!newChannelName.trim() || addChannelMutation.isPending}
            >
              {addChannelMutation.isPending ? 'Creating...' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingChannelId} onOpenChange={(open) => !open && setDeletingChannelId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Channel?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The channel will be removed, though existing messages will remain archived.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingChannelId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteChannelMutation.mutate(deletingChannelId)} 
              disabled={deleteChannelMutation.isPending}
            >
              {deleteChannelMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}