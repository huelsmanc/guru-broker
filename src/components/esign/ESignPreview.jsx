import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Copy, Check } from 'lucide-react';

export default function ESignPreview({ doc, onComplete }) {
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailsSent, setEmailsSent] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(null);

  const generateSigningLink = (signerIdx) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/PublicSigner?doc=${doc.id}&idx=${signerIdx}`;
  };

  const handleSendEmails = async () => {
    setSendingEmails(true);
    try {
      // Create submissions for each signer
      for (let i = 0; i < doc.signers.length; i++) {
        const signer = doc.signers[i];
        await base44.entities.ESignSubmission.create({
          document_id: doc.id,
          signer_index: i,
          signer_email: signer.email,
          signer_name: signer.name,
          status: 'pending',
        });

        // Send email
        const signingLink = generateSigningLink(i);
        await base44.integrations.Core.SendEmail({
          to: signer.email,
          subject: `Sign: ${doc.title}`,
          body: `Hello ${signer.name},\n\nYou've been asked to sign: ${doc.title}\n\nSign here: ${signingLink}\n\nThis link expires in 30 days.\n\nThanks!`,
          from_name: doc.created_by_name,
        });
      }

      // Mark document as pending
      await base44.entities.ESignDocument.update(doc.id, { status: 'pending' });

      setEmailsSent(true);
      setTimeout(() => onComplete(), 2000);
    } catch (err) {
      console.error('Send failed:', err);
      alert('Failed to send: ' + err.message);
    } finally {
      setSendingEmails(false);
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Ready to send?</strong> {doc.signers.length} signer{doc.signers.length !== 1 ? 's' : ''} will receive signing links via email.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Signing Links</h3>
        {doc.signers.map((signer, idx) => {
          const link = generateSigningLink(idx);
          return (
            <div key={signer.id} className="bg-card border border-border rounded-lg p-4">
              <p className="font-medium text-sm text-foreground mb-2">{signer.name}</p>
              <p className="text-xs text-muted-foreground mb-3">{signer.email}</p>
              <div className="flex gap-2">
                <Input
                  value={link}
                  readOnly
                  className="text-xs rounded-lg"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    setCopiedEmail(idx);
                    setTimeout(() => setCopiedEmail(null), 2000);
                  }}
                >
                  {copiedEmail === idx ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        onClick={handleSendEmails}
        disabled={sendingEmails || emailsSent}
        className="w-full rounded-lg h-11"
      >
        {emailsSent ? (
          <>
            <Check className="w-4 h-4 mr-2" />
            Emails Sent!
          </>
        ) : sendingEmails ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Mail className="w-4 h-4 mr-2" />
            Send Signing Emails
          </>
        )}
      </Button>
    </div>
  );
}