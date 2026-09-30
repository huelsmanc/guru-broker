import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function DeleteAccountDialog({ open, onOpenChange, userEmail, userName }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirmEmail !== userEmail) {
      setError('Email does not match');
      return;
    }

    setDeleting(true);
    setError('');
    try {
      // Call backend function to delete account
      await base44.functions.invoke('deleteUserAccount', { email: userEmail });
      // Logout after successful deletion
      await base44.auth.logout('/');
    } catch (err) {
      setError(err?.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. All your data will be permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm font-medium text-destructive mb-2">⚠️ Warning</p>
            <p className="text-xs text-destructive/80 leading-relaxed">
              Deleting your account is permanent and irreversible. You will lose access to all conversations, documents, and stored data.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              To confirm, type your email address:
            </p>
            <Input
              type="email"
              placeholder={userEmail}
              value={confirmEmail}
              onChange={(e) => {
                setConfirmEmail(e.target.value);
                setError('');
              }}
              className="text-sm"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmEmail !== userEmail || deleting}
            className="rounded-lg"
          >
            {deleting ? 'Deleting...' : 'Delete Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}