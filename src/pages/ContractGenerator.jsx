import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Wand2, Send, RotateCcw, Loader2, ChevronRight, ChevronLeft, History, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import ContractForm from '@/components/contracts/ContractForm';
import ContractPreview from '@/components/contracts/ContractPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
import { jsPDF } from 'jspdf';

export default function ContractGenerator() {
  const { user, brokerageId } = useOutletContext();
  const [view, setView] = useState('new'); // 'new' | 'history'
  const [step, setStep] = useState('form'); // 'form' | 'generating' | 'preview'
  const [formData, setFormData] = useState({});
  const [contractText, setContractText] = useState('');
  const [sendingToESign, setSendingToESign] = useState(false);
  const [eSignSuccess, setESignSuccess] = useState(false);
  const [showESignModal, setShowESignModal] = useState(false);
  const [contractFileUrl, setContractFileUrl] = useState('');

  const { data: savedContracts = [], refetch: refetchContracts } = useQuery({
    queryKey: ['generated-contracts', brokerageId],
    queryFn: () => base44.entities.GeneratedContract.filter({ brokerage_id: brokerageId }, '-created_date', 50),
    enabled: !!brokerageId,
  });

  const handleGenerate = async (data) => {
    setFormData(data);
    setStep('generating');

    const prompt = `You are a Connecticut real estate attorney completing a licensed SmartMLS Standard Form Real Estate Contract (rev 9.24) on behalf of a licensed brokerage. This is a standard fillable form — your job is to produce the fully completed contract document with all 30 numbered paragraphs filled in using the deal data below. Use the standard Connecticut real estate contract language and structure throughout.

DEAL DATA:
- Seller(s): ${data.seller_name}
- Seller Address: ${data.seller_address || ''}
- Buyer(s): ${data.buyer_name}
- Buyer Address: ${data.buyer_address || ''}
- Real Property Address: ${data.property_address}
- Legal Description: ${data.legal_description || ''}
- Personal Property Included: ${data.inclusions || 'Screens, storm windows, TV antenna, venetian blinds, curtain rods and fixtures, wall to wall carpeting, awnings, shades, automatic hot water heater, plumbing, heating and lighting and electrical fixtures, shrubbery, plants and all other fixtures now located on the Property'}
- Personal Property Excluded: ${data.exclusions || 'None'}
- Purchase Price: $${Number(data.purchase_price).toLocaleString()}
- Initial Deposit: $${Number(data.earnest_money).toLocaleString()}
- Additional Deposit: $${data.additional_deposit ? Number(data.additional_deposit).toLocaleString() : '0'} to be paid on or before ${data.additional_deposit_date || '_______________'}
- Mortgage Loan Amount: ${data.financing_contingency ? '$' + Number(data.loan_amount || 0).toLocaleString() : 'NOT APPLICABLE'}
- Financing Type: ${data.financing_type || 'Conventional'}
- Loan Commitment Date: ${data.loan_commitment_date || data.financing_days ? new Date(Date.now() + (parseInt(data.financing_days||21)*86400000)).toLocaleDateString() : '_______________'}
- Balance at Closing: $${data.balance_at_closing ? Number(data.balance_at_closing).toLocaleString() : (Number(data.purchase_price || 0) - Number(data.earnest_money || 0) - Number(data.loan_amount || 0) - Number(data.additional_deposit || 0)).toLocaleString()}
- Closing Date: ${data.closing_date || '_______________'}
- Inspection Completion Date: ${data.inspection_completion_date || data.inspection_days ? new Date(Date.now() + (parseInt(data.inspection_days||10)*86400000)).toLocaleDateString() : '_______________'}
- Inspections Selected: Building/Mechanical: ${data.insp_building ? 'YES' : 'WAIVED'}, Termite/Other Insects: ${data.insp_termite ? 'YES' : 'WAIVED'}, Septic: ${data.insp_septic ? 'YES' : 'WAIVED'}, Title Search: YES, Water: ${data.insp_water ? 'YES' : 'WAIVED'}, Well/Organic Chemicals: ${data.insp_well ? 'YES' : 'WAIVED'}, Radon-Air/Water: ${data.insp_radon ? 'YES' : 'WAIVED'}, Oil Tank: ${data.insp_oil_tank ? 'YES' : 'WAIVED'}, Lead: ${data.insp_lead ? 'YES' : 'WAIVED'}, Asbestos: ${data.insp_asbestos ? 'YES' : 'WAIVED'}
- Buyer's Broker Fee: ${data.buyer_broker_fee || ''}
- Additional Terms / Seller Concessions: ${data.additional_terms || 'None'}
- Riders Attached: ${data.riders || 'None'}
- Seller's Agent Name: ${data.listing_agent || user?.full_name || ''}
- Seller's Agent License #: ${data.listing_agent_license || ''}
- Seller's Agent Firm: ${data.brokerage_name || ''}
- Buyer's Agent Name: ${data.buyer_agent || ''}
- Buyer's Agent License #: ${data.buyer_agent_license || ''}
- Seller's Attorney: ${data.seller_attorney || ''}
- Seller's Attorney Email: ${data.seller_attorney_email || ''}
- Buyer's Attorney: ${data.buyer_attorney || ''}
- Buyer's Attorney Email: ${data.buyer_attorney_email || ''}
- Agency: ${data.dual_agent ? 'Dual Agent' : data.buyer_agent ? 'Selling Agent is Buyer\'s Agent' : 'Authorized Sub-Agent'}

Generate a COMPLETE Connecticut Standard Form Real Estate Contract with ALL 30 numbered paragraphs using standard Connecticut real estate contract language. Structure:

**Paragraphs 1–16** (fill-in sections):
1. Seller(s) name and address
2. Buyer(s) name and address
3. Real Property Address
4. Personal Property included / excluded
5. Purchase Price — itemized as (a) Initial Deposit, (b) Additional Deposit, (c) Mortgage Proceeds, (d) Balance at Closing, TOTAL
6. Mortgage Financing Contingency (Third Party or Purchase Money; loan amount, term, commitment date) — note NOT APPLICABLE if not used
7. Closing Date
8. Attorneys' Review — standard 5 business day attorney review clause
9. Inspection Contingency — list each inspection as YES or WAIVED with the Inspection Completion Date
10. Residential Condition Report acknowledgment (CGS §20-327b-e, $500 credit)
11. Lead Disclosure acknowledgment (EPA/HUD, pre-1978 buildings)
12. Possession and Occupancy — broom clean on closing date, deed delivery
13. Additional Paragraphs (16–29 incorporated unless crossed out)
14. Broker compensation notice — buyer's broker fee
15. Additional Terms and seller concessions
16. Riders attached

**Paragraphs 17–30** (standard Connecticut legal clauses — write these out fully using proper Connecticut real estate law language):
17. Warranty Deed and Marketable Title — warranty deed, permitted encumbrances, 30-day postponement to cure, CT Bar Association title standards
18. Condition of Premises — "as is" subject to inspection, grounds maintenance, key delivery, pre-closing walkthrough
19. Risk of Loss — seller bears risk until closing, 30-day repair/restore period, buyer's options
20. Escrow of Deposit — seller's attorney as escrow agent, non-interest bearing, interpleader provision, 5-day cure for missed additional deposit
21. Default and Liquidated Damages — deposit retained as liquidated damages, prevailing party attorneys' fees
22. Adjustments at Closing — proration of taxes, utilities, assessments, fuel reimbursement, conveyance tax checks
23. Personal Property — standard list: screens, storm windows, venetian blinds, curtain rods, wall-to-wall carpeting, awnings, shades, hot water heater, plumbing/heating/lighting fixtures, shrubbery
24. Mortgage Financing Contingency detail — written commitment requirement, diligent application, written notice of failure, deposit return
25. Inspection Contingency detail — buyer's representatives, written notice within 2 business days after completion date, deposit return
26. Title Insurance Affidavit — mechanics' liens, tenants' rights, security interests, survey coverage
27. Condominium/Common Interest Community — Resale Certificate per CGS §47-270
28. Buyer's Lien — deposit and title expenses as lien on property
29. Broker Lien Rights — CGS §20-325a
30. Entire Agreement — no other representations, written amendments only, non-assignable, binding on heirs and assigns

**Signature Block:**
- Agency checkboxes (Dual Agent / Selling Agent is Buyer's Agent / Authorized Sub-Agent)
- Seller's Agent: name, telephone, license number, firm, address
- Buyer's Agent: name, telephone, license number, firm, address  
- Seller's Attorney: name, telephone, email, address
- Buyer's Attorney: name, telephone, email, address
- Seller signature lines (x2) with date
- Buyer signature lines (x2) with date
- Footer: "www.SmartMLS.com | SmartMLS, Inc. rev 9.24"

FORMATTING:
- Title: # STANDARD FORM REAL ESTATE CONTRACT
- Open with the legal NOTICE warning paragraph and "THIS AGREEMENT..." recital
- Use **bold** for all filled-in deal-specific values
- Use _______________ for any blanks not provided
- Number paragraphs 1–30
- End each major section break with: *Buyer Initials _____________ · Seller Initials _____________*
`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'gemini_3_flash',
    });

    setContractText(result);
    setStep('preview');

    // Save to history
    base44.entities.GeneratedContract.create({
      brokerage_id: brokerageId,
      created_by_email: user.email,
      created_by_name: user.full_name,
      property_address: data.property_address,
      state: data.state,
      buyer_name: data.buyer_name,
      seller_name: data.seller_name,
      purchase_price: data.purchase_price,
      contract_text: result,
    }).then(() => refetchContracts());
  };

  // Turns the generated contract into a PDF so signature fields can be placed on it,
  // then opens the built-in e-sign flow (this used to go to DocuSeal).
  const handleSendToESign = async () => {
    setSendingToESign(true);
    try {
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
      const margin = 54;
      const width = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFont('times', 'normal');
      pdf.setFontSize(11);
      let y = margin;
      for (const line of pdf.splitTextToSize(contractText || '', width)) {
        if (y > pageHeight - margin) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += 15;
      }
      const name = `Purchase-Agreement-${formData.property_address?.replace(/\s/g, '-') || 'Contract'}.pdf`;
      const file = new File([pdf.output('blob')], name, { type: 'application/pdf' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setContractFileUrl(file_url);
      setShowESignModal(true);
    } catch (e) {
      console.error(e);
      alert('Failed to prepare contract for e-signing');
    }
    setSendingToESign(false);
  };

  const contractSigners = [
    formData.buyer_name && { name: formData.buyer_name, email: formData.buyer_email || '' },
    formData.seller_name && { name: formData.seller_name, email: formData.seller_email || '' },
    user?.email && { name: user.full_name, email: user.email },
  ].filter(Boolean).map((s, i) => ({ id: `signer-${i}`, ...s }));

  const handleESignComplete = (result) => {
    if (!result) { setShowESignModal(false); return; }
    setShowESignModal(false);
    setESignSuccess(true);
  };

  const handleDownload = () => {
    const blob = new Blob([contractText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Purchase-Agreement-${formData.property_address?.replace(/\s/g, '-') || 'Contract'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep('form');
    setFormData({});
    setContractText('');
    setESignSuccess(false);
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">AI Contract Generator</h1>
            <p className="text-muted-foreground text-sm">Fill in the deal terms — get a complete Purchase & Sale Agreement</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={view === 'new' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('new')}
            className="gap-1.5 rounded-xl h-9 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Contract
          </Button>
          <Button
            variant={view === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('history')}
            className="gap-1.5 rounded-xl h-9 text-xs"
          >
            <History className="w-3.5 h-3.5" /> History {savedContracts.length > 0 && `(${savedContracts.length})`}
          </Button>
        </div>

        {/* Steps indicator */}
        {view === 'new' && <div className="flex items-center gap-2 mt-5">
          {[
            { key: 'form', label: 'Deal Terms' },
            { key: 'generating', label: 'Generating' },
            { key: 'preview', label: 'Review & Send' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 text-xs font-medium transition-colors ${step === s.key || (step === 'preview' && s.key !== 'generating') ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  (s.key === 'form') ||
                  (s.key === 'generating' && (step === 'generating' || step === 'preview')) ||
                  (s.key === 'preview' && step === 'preview')
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>{i + 1}</div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          ))}
        </div>}
      </motion.div>

      {view === 'history' && (
        <div className="space-y-3">
          {savedContracts.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No contracts generated yet</p>
            </div>
          ) : savedContracts.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{c.property_address}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.state} · {c.buyer_name} &rarr; {c.seller_name} · ${Number(c.purchase_price).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{c.created_date ? format(new Date(c.created_date), 'MMM d, yyyy h:mm a') : ''}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl text-xs flex-shrink-0"
                onClick={() => {
                  setFormData(c);
                  setContractText(c.contract_text);
                  setStep('preview');
                  setView('new');
                }}
              >
                View
              </Button>
            </div>
          ))}
        </div>
      )}

      {view === 'new' && (
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <ContractForm onSubmit={handleGenerate} user={user} initialValues={formData} />
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-32 gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-lg">Drafting your contract...</p>
                <p className="text-sm text-muted-foreground mt-1">AI is generating a {formData.state}-compliant Purchase & Sale Agreement</p>
              </div>
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </motion.div>
          )}

          {step === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <Button variant="ghost" size="sm" onClick={() => setStep('form')} className="gap-1.5 rounded-xl text-xs">
                  <ChevronLeft className="w-3.5 h-3.5" /> Edit Terms
                </Button>
                <div className="flex gap-2 flex-wrap">
                  {!eSignSuccess ? (
                    <Button size="sm" onClick={handleSendToESign} disabled={sendingToESign} className="gap-1.5 rounded-xl text-xs h-9">
                      {sendingToESign ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {sendingToESign ? 'Sending...' : 'Send to E-Sign'}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/20 rounded-xl px-3 h-9">
                      ✅ Sent for signature
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 rounded-xl text-xs h-9">
                    <RotateCcw className="w-3.5 h-3.5" /> New Contract
                  </Button>
                </div>
              </div>
              <ContractPreview contractText={contractText} formData={formData} />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* E-Sign Modal */}
      <Dialog open={showESignModal} onOpenChange={setShowESignModal}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send for signature</DialogTitle>
          </DialogHeader>
          {contractFileUrl && (
            <UnifiedESignCreator
              user={user}
              brokerageId={brokerageId}
              initialTitle={`Purchase & Sale Agreement — ${formData.property_address || 'Property'}`}
              initialDocumentUrl={contractFileUrl}
              initialSigners={contractSigners}
              onComplete={handleESignComplete}
              onCancel={() => setShowESignModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}