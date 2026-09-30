import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function NewConversationDialog({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !firstMessage.trim()) return;
    setLoading(true);
    await onCreate({ title: title.trim(), category, firstMessage: firstMessage.trim() });
    setTitle('');
    setCategory('general');
    setFirstMessage('');
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Support Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="title">Subject</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you need help with?"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="transaction">Transaction</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="tech_support">Tech Support</SelectItem>
                <SelectItem value="commission">Commission</SelectItem>
                <SelectItem value="training">Training</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Describe what you need help with..."
              className="mt-1.5 min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !title.trim() || !firstMessage.trim()}>
            {loading ? 'Creating...' : 'Start Conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}