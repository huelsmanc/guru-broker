import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CustomESignEditor({ onComplete }) {
  const { user, brokerageId } = useOutletContext();
  const [title, setTitle] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const response = await base44.integrations.Core.UploadFile({ file });
      console.log('Upload response:', response);
      const url = response?.file_url || response?.data?.file_url;
      if (url) {
        setDocumentUrl(url);
        console.log('Document URL set:', url);
      } else {
        setError('Upload succeeded but no URL returned');
      }
    } catch (err) {
      setError('Failed to upload document: ' + (err.message || err));
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !documentUrl) {
      setError('Please provide a title and upload a document');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const doc = await base44.entities.ESignDocument.create({
        brokerage_id: brokerageId,
        title,
        document_url: documentUrl,
        fields: [],
        signers: [],
        created_by_email: user.email,
        created_by_name: user.full_name,
      });

      console.log('Document created successfully:', doc);
      // Document created—dialog can stay open or close based on user action
      if (onComplete) onComplete();
    } catch (err) {
      setError('Failed to create document: ' + (err.message || err));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div>
        <Label>Document Title *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Purchase Agreement"
          className="mt-1.5"
        />
      </div>

      <div>
        <Label>Upload PDF or Image *</Label>
        <label className="mt-1.5 block">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
          <div className="border-2 border-dashed border-border/40 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </>
            ) : documentUrl ? (
              <>
                <p className="text-sm font-medium text-foreground mb-1">Document uploaded ✓</p>
                <p className="text-xs text-muted-foreground">{documentUrl.split('/').pop()}</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">Click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, PNG, or JPG</p>
              </>
            )}
          </div>
        </label>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </motion.div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onComplete} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!title.trim() || !documentUrl || loading}
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Create Document
        </Button>
      </div>
    </div>
  );
}