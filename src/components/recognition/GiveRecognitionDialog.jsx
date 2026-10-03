import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { isAdminRole, normalizeRole, can } from '../../../shared/permissions.generated.js';

const CATEGORIES = [
  { id: 'teamwork', label: '🤝 Teamwork' },
  { id: 'client_service', label: '😊 Client Service' },
  { id: 'sales', label: '🎯 Sales' },
  { id: 'leadership', label: '⭐ Leadership' },
  { id: 'creativity', label: '💡 Creativity' },
  { id: 'persistence', label: '💪 Persistence' },
  { id: 'other', label: '👏 Other' },
];

export default function GiveRecognitionDialog({ open, onClose, brokerageId, user, brokerageUsers }) {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [category, setCategory] = useState('teamwork');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const createRecognition = useMutation({
    mutationFn: async () => {
      const agent = brokerageUsers.find(u => u.email === selectedAgent);
      if (!agent) throw new Error('Agent not found');

      // Saved by the server, which also tells them (in the app and on their phone).
      const { data } = await base44.functions.invoke('giveShoutout', { to_email: agent.email, message, category, is_anonymous: isAnonymous });
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['recognitions', brokerageId] });
    },
    onSuccess: () => {
      setSelectedAgent('');
      setCategory('teamwork');
      setMessage('');
      setIsAnonymous(false);
      onClose();
    },
  });

  const getDisplayName = (user) => user?.display_name || user?.full_name || 'Unknown';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedAgent || !message.trim()) return;
    createRecognition.mutate();
  };

  const selectedAgentData = brokerageUsers.find(u => u.id === selectedAgent);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give Recognition</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Select Agent */}
          <div className="space-y-2">
            <Label htmlFor="agent-select">Recognize</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger id="agent-select">
                <SelectValue placeholder="Choose a teammate..." />
              </SelectTrigger>
              <SelectContent>
                {brokerageUsers && brokerageUsers.length > 0 ? (
                  brokerageUsers
                    .filter(u => u.email !== user?.email)
                    .sort((a, b) => (getDisplayName(a) || '').localeCompare(getDisplayName(b) || ''))
                    .map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {getDisplayName(u)} {isAdminRole(u.role) ? '(Broker)' : ''}
                      </SelectItem>
                    ))
                ) : (
                  <div className="p-2 text-xs text-muted-foreground">No teammates available</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category-select">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them what they did well and why you appreciate it..."
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">{message.length} characters</p>
          </div>

          {/* Anonymous Option */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
            <Label htmlFor="anonymous" className="font-normal cursor-pointer">
              Send anonymously
            </Label>
          </div>

          {/* Preview */}
          {selectedAgentData && message.trim() && (
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="text-muted-foreground mb-1">Preview:</p>
              <p>
                <span className="font-medium">{isAnonymous ? 'Someone' : (user.display_name || user.full_name)}</span> is recognizing{' '}
                <span className="font-medium text-primary">{getDisplayName(selectedAgentData)}</span> for {category.replace('_', ' ')}.
              </p>
            </div>
          )}

          {createRecognition.error && <p className="text-sm text-red-600">{createRecognition.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedAgent || !message.trim() || createRecognition.isPending}
            >
              {createRecognition.isPending ? 'Sending...' : 'Send Recognition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}