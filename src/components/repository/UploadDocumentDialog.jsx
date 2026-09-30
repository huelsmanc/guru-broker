import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';

export default function UploadDocumentDialog({ open, onClose, brokerageId, user }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    file_name: '',
    category: 'other',
    description: '',
    tags: '',
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const uploadDocument = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');

      setUploading(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });

        const tags = form.tags
          .split(',')
          .map(t => t.trim())
          .filter(t => t);

        // Get file extension from original file
        const originalExt = selectedFile.name.split('.').pop();
        const customName = form.file_name?.trim();
        const finalFileName = customName && !customName.includes('.') 
          ? `${customName}.${originalExt}`
          : customName || selectedFile.name;

        await base44.entities.FileRepository.create({
          brokerage_id: brokerageId,
          file_name: finalFileName,
          file_url,
          file_size: selectedFile.size,
          category: form.category,
          description: form.description,
          tags,
          uploaded_by_email: user?.email,
          uploaded_by_name: user?.full_name,
        });

        queryClient.invalidateQueries({ queryKey: ['file-repository', brokerageId] });
        return true;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      setForm({ file_name: '', category: 'other', description: '', tags: '' });
      setSelectedFile(null);
      onClose();
    },
  });

  const handleSubmit = () => {
    uploadDocument.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="file-input">Select File *</Label>
            <label
              htmlFor="file-input"
              className="mt-1.5 flex items-center justify-center gap-3 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/30 transition-colors"
            >
              {selectedFile ? (
                <div className="text-center">
                  <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
                  <p className="font-medium text-sm text-foreground truncate max-w-xs">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="font-medium text-sm text-foreground">Click to upload</p>
                  <p className="text-xs text-muted-foreground">or drag and drop</p>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <Label htmlFor="file-name">File Name *</Label>
            <Input
              id="file-name"
              value={form.file_name}
              onChange={(e) => setForm({ ...form, file_name: e.target.value })}
              placeholder={selectedFile?.name || 'Enter file name'}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {selectedFile ? `Original: ${selectedFile.name}` : 'Select a file first'}
            </p>
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="training">📚 Training</option>
              <option value="template">📋 Template</option>
              <option value="policy">📜 Policy</option>
              <option value="guide">📖 Guide</option>
              <option value="contract">📄 Contract</option>
              <option value="other">📦 Other</option>
            </select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe this document..."
              className="mt-1.5 h-20"
            />
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="e.g., compliance, 2024, important"
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading || uploadDocument.isPending}
            className="gap-2"
          >
            {uploading || uploadDocument.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" /> Upload Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}