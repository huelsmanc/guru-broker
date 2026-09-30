import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, ZoomIn, ZoomOut } from 'lucide-react';
import DocusealBuilder from './DocusealBuilder';

export default function DocuSealUploader({ onComplete, brokerageId, user, preloadedFile, transactionId }) {
  const [title, setTitle] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const handleStartBuilder = () => {
    if (!title.trim()) {
      alert('Please provide a template name');
      return;
    }
    setEditorOpen(true);
  };

  const handleComplete = async () => {
    // Small delay to ensure DocuSeal has finished processing
    setTimeout(() => {
      setEditorOpen(false);
      onComplete();
    }, 500);
  };

  if (editorOpen) {
    return (
      <div className="py-6 space-y-4">
        <p className="text-xs text-muted-foreground">
          Upload documents, add signature fields, and hit "Publish" to send for signatures.
        </p>
        <DocusealBuilder
          key={title}
          documentUrls={[]}
          externalId={`doc-${Date.now()}`}
          templateName={title}
          adminEmail={user.email}
          onTemplateCreated={handleComplete}
        />
      </div>
    );
  }

  return (
    <div className="py-6 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">Template Name *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Purchase Agreement"
          className="rounded-lg"
        />
      </div>

      <Button
        onClick={handleStartBuilder}
        disabled={!title.trim()}
        className="w-full rounded-lg h-11"
      >
        Open DocuSeal Editor
      </Button>
    </div>
  );
}