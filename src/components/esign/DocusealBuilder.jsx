import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle } from 'lucide-react';

export default function DocusealBuilder({ 
  documentUrls = [], 
  templateId = '', 
  externalId = '', 
  templateName = 'New Template',
  adminEmail = 'admin@company.com',
  onTemplateCreated 
}) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const response = await base44.functions.invoke('generateDocusealBuilderToken', {
          documentUrls,
          templateId,
          externalId,
          templateName,
          adminEmail,
        });
        setToken(response.data.token);
      } catch (err) {
        console.error('Failed to generate token:', err);
        setError('Failed to load form builder');
      } finally {
        setLoading(false);
      }
    };

    loadToken();
  }, [documentUrls, templateId, externalId, templateName, adminEmail]);

  useEffect(() => {
    if (token && window.docusealBuilder) {
      const handleCompleted = (e) => {
        console.log('Event triggered:', e.type, e.detail);
        if (onTemplateCreated) {
          onTemplateCreated(e.detail);
        }
      };

      // Listen for all possible completion events
      ['completed', 'sent', 'submission_created', 'envelope_sent', 'template_sent'].forEach(eventType => {
        window.docusealBuilder.addEventListener(eventType, handleCompleted);
      });

      // Monitor for recipients modal closing (sent successfully)
      const observer = new MutationObserver(() => {
        const recipientsModal = document.querySelector('.recipients-modal');
        const sendButton = document.querySelector('.recipients-modal-send-button');
        
        // If modal is gone and send button is gone, submission was sent
        if (!recipientsModal && !sendButton) {
          console.log('Recipients modal closed - submission sent');
          if (onTemplateCreated) {
            onTemplateCreated({ sent: true });
          }
          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        if (window.docusealBuilder) {
          ['completed', 'sent', 'submission_created', 'envelope_sent', 'template_sent'].forEach(eventType => {
            window.docusealBuilder.removeEventListener(eventType, handleCompleted);
          });
        }
      };
    }
  }, [token, onTemplateCreated]);

  useEffect(() => {
    if (!window.docusealBuilder) {
      const script = document.createElement('script');
      script.src = 'https://cdn.docuseal.com/js/builder.js';
      script.async = true;
      document.head.appendChild(script);
    }

    // Suppress DocuSeal internal EmptyRanges error (bug in their CDN script)
    const handleError = (event) => {
      if (event.message && event.message.includes('EmptyRanges')) {
        event.preventDefault();
        return true;
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading form builder...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-destructive text-sm">{error}</p>
          <p className="text-xs text-destructive/80 mt-1">Please try again or contact support.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden" style={{ minHeight: '600px' }}>
      {token && (
        <docuseal-builder data-token={token}>
          <style>{`
/* DOCUSEAL TEMPLATE BUILDER DARK THEME */
.tooltip:before { background-color: #364153; }
.main-container { background-color: #101828; }
.title-container { background-color: #1E2839; }
.template-name, .document-preview-name { color: #ffffff; }
.save-button, .add-document-button, .sign-yourself-button, .document-control-button, .replace-document-button {
  background-color: #364153; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.save-button:hover, .add-document-button:hover, .sign-yourself-button:hover, .document-control-button:hover, .replace-document-button:hover {
  background-color: #495565;
}
.add-blank-page-button, .send-button {
  background-color: #700DE7; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.add-blank-page-button:hover, .send-button:hover { background-color: #8022FE; }
.fields-list-container input, .fields-list-container textarea, .fields-list-container select {
  border-radius: 0.25rem; background-color: #101828; border: 1px solid #101828; color: #ffffff;
}
.fields-list-container input:checked { --chkbg: 220 43% 11%; }
.fields-list-container input::placeholder, .fields-list-container select::placeholder { color: #ffffff; }
.fields-list-item {
  background-color: #1E2839 !important; border-color: #101828; color: #ffffff;
}
.field-settings-dropdown hr, .fields-list-item .border-t { border-color: #101828; }
.fields-list-item:hover .field-remove-button, .fields-list-item:hover .field-settings-dropdown label { color: #ffffff; }
.field-settings-dropdown ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff;
}
.field-settings-dropdown ul label, .field-settings-dropdown .label-text {
  background-color: transparent !important; color: #ffffff
}
.field-settings-dropdown li a.active, .field-settings-dropdown li a:hover, .field-settings-dropdown li label:hover {
  border-radius: 0.25rem; background-color: #1E2839 !important; border: none; color: #ffffff;
}
.field-types-dropdown ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff;
}
.field-types-dropdown li a.active, .field-types-dropdown li a:hover, .field-types-dropdown li label:hover {
  border-radius: 0.25rem; background-color: #1E2839 !important; border: none; color: #ffffff;
}
.field-area-controls {
  border-radius: 0.25rem; background-color: #364153; color: #ffffff;
}
.field-area-controls input[type="checkbox"] { border-color: #ffffff; }
.field-area-controls input:checked { --chkbg: 220 43% 11%; }
.field-area-controls .border-r { border-color: #101828; }
.field-area-settings-dropdown input, .field-area-settings-dropdown textarea, .field-area-settings-dropdown select {
  border-radius: 0.25rem; background-color: #101828; border: 1px solid #101828; color: #ffffff;
}
.field-area-settings-dropdown ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff !important;
}
.field-area-settings-dropdown ul label, .field-area-settings-dropdown .label-text {
  background-color: transparent !important; color: #ffffff
}
.field-area-settings-dropdown li a.active, .field-area-settings-dropdown li a:hover, .field-area-settings-dropdown li label:hover {
  border-radius: 0.25rem; background-color: #1E2839 !important; border: none; color: #ffffff !important;
}
.roles-dropdown label { background-color: #364153; border-color: #101828; color: #ffffff; }
.roles-dropdown ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff;
}
.roles-dropdown li a { border-radius: 0.25rem; border: none; }
.roles-dropdown li a.active, .roles-dropdown li a:hover { background-color: #1E2839 !important; color: #ffffff; }
.roles-dropdown-label-mobile { background-color: #364153; color: #ffffff; }
.draw-field-container-mobile { background-color: #364153; color: #ffffff; }
.roles-dropdown-mobile label { background-color: #364153; border-color: #101828; color: #ffffff; }
.roles-dropdown-mobile ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff;
}
.roles-dropdown-mobile li a { border-radius: 0.25rem; border: none; }
.roles-dropdown-mobile li a.active, .roles-dropdown-mobile li a:hover { background-color: #1E2839; color: #ffffff; }
.fields-dropdown-mobile label { background-color: #364153; border: none; color: #ffffff; }
.fields-dropdown-mobile ul {
  border-radius: 0.25rem; background-color: #364153 !important; border: 1px solid #101828; color: #ffffff;
}
.fields-dropdown-mobile li a.active, .fields-dropdown-mobile li a:hover {
  border-radius: 0.25rem; background-color: #1E2839 !important; border: none; color: #ffffff;
}
.fields-grid { background-color: #101828; }
.fields-grid-item { background-color: #1E2839 !important; border-color: #101828; color: #ffffff; }
.draw-field-container {
  background-color: #1E2839; border-radius: 0.25rem; border: 1px solid #101828; color: #ffffff;
}
.cancel-draw-button {
  background-color: #700DE7; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.cancel-draw-button:hover { background-color: #8022FE; }
.modal-container .modal-box {
  background-color: #1E2839; border-radius: 0.25rem;
}
.modal-container .modal-box .border-b { border-color: #101828; }
.modal-container a, .modal-container label, .modal-container .modal-title, .modal-container .modal-close-button, .modal-container .label-text {
  color: #ffffff;
}
.modal-container input, .modal-container textarea, .modal-container select {
  border-radius: 0.25rem; background-color: #101828; border: 1px solid #101828; color: #ffffff;
}
.modal-container select + span { background-color: #101828; color: #ffffff; }
.modal-container button {
  border-radius: 0.25rem; background-color: #364153; border: none; color: #ffffff;
}
.modal-container button:hover { background-color: #495565; }
.modal-container button[class*="bg-base-300"] { background-color: #6A7282 !important; color: #ffffff; }
.modal-save-button {
  background-color: #364153; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.modal-save-button:hover { background-color: #495565; }
.modal-field-font-dropdown label { background-color: #364153; border-color: #101828; color: #ffffff; }
.modal-field-font-dropdown .dropdown-content {
  border-radius: 0.25rem; background-color: #364153; border: 1px solid #101828; color: #ffffff;
}
.modal-field-font-dropdown .dropdown-content div:hover, .modal-container .modal-field-font-dropdown .bg-base-300 {
  background-color: #6A7282; color: #ffffff;
}
.modal-field-font-preview { background-color: #E5E8EB; }
.recipients-modal {
  background-color: #1E2839; border-radius: 0.25rem;
}
.recipients-modal-title, .recipients-modal-close-button, .recipients-modal-form label, .recipients-modal-form .label-text {
  color: #ffffff;
}
.recipients-modal-form input, .recipients-modal-form textarea, .recipients-modal-form select {
  border-radius: 0.25rem; background-color: #101828; border: 1px solid #101828; color: #ffffff;
}
.recipients-modal-form input::placeholder, .recipients-modal-form textarea::placeholder, .recipients-modal-form select::placeholder {
  color: #ffffff;
}
.recipients-modal-form input:checked { --chkbg: 220 43% 11%; }
.recipients-modal-send-button {
  background-color: #700DE7; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.recipients-modal-send-button:hover { background-color: #8022FE; }
.recipients-modal-submission {
  border-radius: 0.25rem; background-color: #101828; border: 1px solid #101828;
}
.recipients-modal-form-submitters {
  border-radius: 0.25rem; background-color: #1E2839; border: 1px solid #101828;
}
.recipients-modal-submission-status-sent-label, .recipients-modal-submission-status-awaiting-label, .recipients-modal-submission-status-opened-label, .recipients-modal-submission-status-completed-label, .recipients-modal-submission-status-declined-label {
  background-color: #ffffff; border-radius: 0.25rem; border: 1px solid #101828;
}
.recipients-modal-submission-submitter-email { color: #ffffff; }
.recipients-modal-submission-download-button {
  background-color: #364153; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.recipients-modal-submission-download-button:hover { background-color: #495565; }
.recipients-modal-submission-remove-button {
  background-color: #C10006; border: 0; border-radius: 0.25rem; color: #ffffff;
}
.recipients-modal-submission-remove-button:hover { background-color: #E70009; }
.recipients-modal-form-email-message {
  border-radius: 0.25rem; background-color: #1E2839; border: 1px solid #101828; color: #ffffff;
}
.recipients-modal-form-edit-email-message-link { color: #ffffff; }
.recipients-modal-pagination-label { color: #ffffff; }
.recipients-modal-pagination-buttons-container { border-radius: 0.25rem; }
.recipients-modal-pagination-prev-button, .recipients-modal-pagination-next-button, .recipients-modal-pagination-page {
  background-color: #364153; border: none; color: #ffffff;
}
.recipients-modal-pagination-prev-disabled-button, .recipients-modal-pagination-next-disabled-button {
  background-color: #364153 !important; color: #E5E8EB;
}
.recipients-modal-pagination-prev-button:hover, .recipients-modal-pagination-next-button:hover, .recipients-modal-pagination-page:hover, .recipients-modal-pagination-prev-disabled-button:hover, .recipients-modal-pagination-next-disabled-button:hover, .recipients-modal-pagination-page:hover {
  background-color: #495565;
}
          `}</style>
        </docuseal-builder>
      )}
    </div>
  );
}