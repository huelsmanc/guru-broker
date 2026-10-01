import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2 } from 'lucide-react';

export default function ESignUploader({ onComplete, brokerageId, user }) {
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !title.trim()) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'user', id: user?.id } });

      const doc = await base44.entities.ESignDocument.create({
        brokerage_id: brokerageId,
        title: title.trim(),
        document_url: file_url,
        status: 'draft',
        fields: [],
        signers: [],
        created_by_email: user.email,
        created_by_name: user.full_name,
      });

      onComplete(doc);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 py-4">
      <div>
        <label className="text-sm font-medium text-foreground block mb-2">Document Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Purchase Agreement"
          className="rounded-lg"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground block mb-2">Upload PDF or Image</label>
        <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
          <div className="text-center">
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG up to 10MB</p>
          </div>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleUpload}
            disabled={uploading || !title.trim()}
            className="hidden"
          />
        </label>
      </div>

      {uploading && (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Uploading...</span>
        </div>
      )}
    </div>
  );
}