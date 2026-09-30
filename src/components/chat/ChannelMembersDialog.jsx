import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ChannelMembersDialog({ open, onOpenChange, channel, brokerageId, isAdmin }) {
  const queryClient = useQueryClient();
  const [selectedUsers, setSelectedUsers] = useState([]);

  const { data: members = [] } = useQuery({
    queryKey: ['channel-members', channel, brokerageId],
    queryFn: () => base44.entities.ChannelMember.filter({ channel_id: channel, brokerage_id: brokerageId }),
    enabled: !!channel && !!brokerageId,
  });

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users', brokerageId],
    queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId && isAdmin,
  });

  const addMembers = useMutation({
    mutationFn: async (emails) => {
      for (const email of emails) {
        const user = brokerageUsers.find(u => u.email === email);
        if (user && !members.some(m => m.user_email === email)) {
          await base44.entities.ChannelMember.create({
            brokerage_id: brokerageId,
            channel_id: channel,
            user_email: email,
            user_name: user.full_name,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', channel, brokerageId] });
      setSelectedUsers([]);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId) => {
      await base44.entities.ChannelMember.delete(memberId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', channel, brokerageId] });
    },
  });

  const memberEmails = members.map(m => m.user_email);
  const availableUsers = brokerageUsers.filter(u => !memberEmails.includes(u.email));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Channel Members
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Members */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Members ({members.length})</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members yet</p>
              ) : (
                members.map(member => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-2 rounded bg-muted"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.user_name}</p>
                      <p className="text-xs text-muted-foreground">{member.user_email}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => removeMember.mutate(member.id)}
                        disabled={removeMember.isPending}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Add Members (Admin Only) */}
          {isAdmin && availableUsers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Add Members</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableUsers.map(user => (
                  <label
                    key={user.email}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.email)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers([...selectedUsers, user.email]);
                        } else {
                          setSelectedUsers(selectedUsers.filter(e => e !== user.email));
                        }
                      }}
                      className="w-4 h-4 rounded border-border"
                    />
                    <div>
                      <p className="text-sm text-foreground">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {isAdmin && selectedUsers.length > 0 && (
            <Button
              onClick={() => addMembers.mutate(selectedUsers)}
              disabled={addMembers.isPending}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Add {selectedUsers.length}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}