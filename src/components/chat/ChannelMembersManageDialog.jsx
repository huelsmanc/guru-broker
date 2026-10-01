import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChannelMembersManageDialog({ open, onOpenChange, channel, brokerageId, brokerageUsers }) {
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members-manage', channel, brokerageId],
    queryFn: () => base44.entities.ChannelMember.filter({ channel_id: channel, brokerage_id: brokerageId }),
    enabled: open && !!channel && !!brokerageId,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (user) => {
      await base44.entities.ChannelMember.create({
        brokerage_id: brokerageId,
        channel_id: channel,
        user_email: String(user.email).toLowerCase(),
        user_name: user.display_name || user.full_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members-manage', channel, brokerageId] });
      queryClient.invalidateQueries({ queryKey: ['channel-members', channel, brokerageId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId) => {
      await base44.entities.ChannelMember.delete(memberId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members-manage', channel, brokerageId] });
      queryClient.invalidateQueries({ queryKey: ['channel-members', channel, brokerageId] });
    },
  });

  const memberEmails = channelMembers.map(m => String(m.user_email).toLowerCase());
  const availableUsers = brokerageUsers.filter(u => !memberEmails.includes(String(u.email).toLowerCase()) && !u.suspended);
  const filteredAvailable = availableUsers.filter(u =>
    String(u.display_name || u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(u.email).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Manage Channel Members</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Members */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Current Members ({channelMembers.length})</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
              {channelMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No members yet</p>
              ) : (
                channelMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.user_name}</p>
                      <p className="text-xs text-muted-foreground">{member.user_email}</p>
                    </div>
                    <button
                      onClick={() => removeMemberMutation.mutate(member.id)}
                      disabled={removeMemberMutation.isPending}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Members */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Add Members</h3>
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-2"
            />
            <div className="space-y-1 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
              {filteredAvailable.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  {searchQuery ? 'No users found' : 'All users are already members'}
                </p>
              ) : (
                filteredAvailable.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <button
                      onClick={() => addMemberMutation.mutate(user)}
                      disabled={addMemberMutation.isPending}
                      className="p-1 rounded hover:bg-primary/10 text-primary transition-colors flex-shrink-0"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}