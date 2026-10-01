import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Trash2, Loader2 } from 'lucide-react';

const STATUS_OPTIONS = [
  { id: 'under_review', label: 'Under Review' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'implemented', label: 'Implemented' },
  { id: 'rejected', label: 'Rejected' },
];

export default function AdminIdeaPanel({ idea, onClose }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(idea.status);
  const [adminNotes, setAdminNotes] = useState(idea.admin_notes || '');

  const updateIdea = useMutation({
    mutationFn: async () => {
      await base44.entities.Idea.update(idea.id, {
        status,
        admin_notes: adminNotes,
      });
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
    onSuccess: () => {
      onClose();
    },
  });

  const [deleting, setDeleting] = useState(false);
  const deleteIdea = async () => {
    if (!window.confirm(`Delete "${idea.title}"? Its votes and comments go with it. This can't be undone.`)) return;
    setDeleting(true);
    try {
      const comments = await base44.entities.Comment.filter({ idea_id: idea.id }, 'created_date', 500).catch(() => []);
      await Promise.all(comments.map((c) => base44.entities.Comment.delete(c.id).catch(() => {})));
      await base44.entities.Idea.delete(idea.id);
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      onClose();
    } catch (err) { window.alert(err.message); setDeleting(false); }
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateIdea.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-border max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-foreground">Manage Idea</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Admin Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Admin Notes</label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Leave notes about this idea for the team..."
              className="min-h-[100px]"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="ghost" className="mr-auto gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={deleteIdea} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete idea
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateIdea.isPending}>
              {updateIdea.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}