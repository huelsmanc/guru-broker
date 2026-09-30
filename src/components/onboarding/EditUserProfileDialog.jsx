import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Upload, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EditUserProfileDialog({ open, onClose, user, brokerageId }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    display_name: user?.display_name || user?.full_name || '',
    headshot: user?.headshot || '',
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Reset form whenever user changes (new user opened for editing)
  useEffect(() => {
    if (user) {
      setForm({
        display_name: user.display_name || user.full_name || '',
        headshot: user.headshot || '',
      });
    }
  }, [user?.id]);

  const updateUser = useMutation({
    mutationFn: (data) => base44.entities.User.update(user.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-users', brokerageId] });
      onClose();
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, headshot: file_url }));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    await updateUser.mutateAsync({
      display_name: form.display_name,
      headshot: form.headshot,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Agent Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Photo Upload */}
          <div>
            <Label className="mb-3 block text-sm font-semibold">Profile Photo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <div className="relative">
                {form.headshot ? (
                  <motion.img
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={form.headshot}
                    alt={form.display_name}
                    className="w-20 h-20 rounded-lg object-cover border-2 border-border"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border">
                    <span className="text-xs text-muted-foreground">No photo</span>
                  </div>
                )}
                {form.headshot && (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, headshot: '' }))}
                    className="absolute -top-2 -right-2 p-1 bg-destructive rounded-full text-white hover:bg-destructive/90 transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="w-full gap-2"
                >
                  {uploadingPhoto ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> Upload Photo</>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <Label htmlFor="display_name" className="text-sm">Display Name</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => setForm(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="Agent name"
              className="mt-1.5"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <Label className="text-sm text-muted-foreground">Email</Label>
            <Input
              value={user?.email || ''}
              disabled
              className="mt-1.5 bg-muted"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={updateUser.isPending || uploadingPhoto}
          >
            {updateUser.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}