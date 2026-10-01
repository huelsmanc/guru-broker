import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, Copy, Check, Loader2, RotateCcw, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import AddressAutocomplete from '@/components/AddressAutocomplete';

const stateOptions = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export default function NetSheetCalculator() {
  const { user } = useOutletContext();
  const [form, setForm] = useState({
    salePrice: '',
    address: '',
    state: '',
    agentCommission: '6',
    mortgageBalance: '',
    lienCosts: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCalculate = async () => {
    if (!form.salePrice || !form.state) return;

    setLoading(true);
    setResult(null);

    const propertyInfo = form.address ? `Property Address: ${form.address}\n` : '';
    const mortgageInfo = form.mortgageBalance ? `\nOpen Mortgage Balance: $${form.mortgageBalance}` : '';
    const lienInfo = form.lienCosts ? `\nOpen Liens/Costs: $${form.lienCosts}` : '';

    const prompt = `You are a real estate finance expert. Generate a realistic net sheet breakdown for a property sale in ${form.state} with these details:

${propertyInfo}Sale Price: $${form.salePrice}
Agent Commission Rate: ${form.agentCommission}%${mortgageInfo}${lienInfo}

${form.address ? `Search public records and public sources for property tax information and typical costs in this area to make this breakdown as accurate as possible.` : 'Based on typical closing costs in this state,'}

Provide a detailed breakdown of common selling expenses including (do NOT include any citations, references, sources, or links):
- Realtor commission (${form.agentCommission}% of sale price)
- Title insurance
- Escrow/closing fees
- Property taxes (prorated if applicable)
- HOA transfer fees (if typical)
- Recording fees
- Attorney fees (if applicable in state)
${form.mortgageBalance ? '- Mortgage payoff/closing costs' : ''}
${form.lienCosts ? '- Existing liens/lien releases' : ''}
- Any state-specific taxes or fees

Format your response as a clear, organized breakdown with:
1. SALE PRICE: $${form.salePrice}
2. DEDUCTIONS (list each with amount)
3. NET PROCEEDS (total after all deductions)

Be realistic and specific to ${form.state}. Include notes on typical ranges and assumptions.`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: true });
    setResult(response);
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setForm({
      salePrice: '',
      address: '',
      state: '',
      agentCommission: '6',
      mortgageBalance: '',
      lienCosts: '',
    });
    setResult(null);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 15;

    // Header background
    doc.setFillColor(41, 53, 82);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Title
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('NET SHEET BREAKDOWN', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text("Seller's Estimated Net Proceeds", pageWidth / 2, 28, { align: 'center' });
    
    yPos = 48;
    doc.setTextColor(0, 0, 0);

    // Property Info Section
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('PROPERTY INFORMATION', 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    const propDetails = [];
    if (form.address) propDetails.push({ label: 'Address', value: form.address });
    propDetails.push({ label: 'Sale Price', value: `$${parseFloat(form.salePrice).toLocaleString()}` });
    propDetails.push({ label: 'State', value: form.state });
    if (form.mortgageBalance) propDetails.push({ label: 'Mortgage Balance', value: `$${parseFloat(form.mortgageBalance).toLocaleString()}` });
    if (form.lienCosts) propDetails.push({ label: 'Liens/Other Costs', value: `$${parseFloat(form.lienCosts).toLocaleString()}` });

    propDetails.forEach(detail => {
      doc.setTextColor(100, 100, 100);
      doc.text(detail.label + ':', 25, yPos);
      doc.setTextColor(0, 0, 0);
      doc.text(detail.value, 85, yPos);
      yPos += 6;
    });

    yPos += 6;

    // Breakdown section
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('ESTIMATED DEDUCTIONS & COSTS', 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    
    // Clean the result by removing any citation-like text and asterisks
    const cleanedResult = result
      .split('\n')
      .filter(line => !line.match(/^\s*(\[.*?\]|http|www\.|source|citation|reference)/i))
      .map(line => line.replace(/\*\*/g, ''))
      .join('\n');

    const lines = cleanedResult.split('\n');
    lines.forEach(line => {
      if (yPos > pageHeight - 25) {
        doc.addPage();
        yPos = 20;
      }
      if (line.trim()) {
        doc.setTextColor(40, 40, 40);
        const isNetProceeds = line.toLowerCase().includes('net proceeds') || line.toLowerCase().includes('net amount');
        if (isNetProceeds) {
          doc.setFont(undefined, 'bold');
          doc.setFontSize(10);
          doc.setTextColor(25, 65, 140);
        } else {
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
        }
        doc.text(line.trim(), 25, yPos);
        yPos += 5;
      }
    });

    // Footer
    yPos += 8;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('This is an AI-generated estimate for informational purposes only. Actual costs may vary.', pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`netsheet-${form.state}-${Date.now()}.pdf`);
  };

  const isReady = form.salePrice && form.state;

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-chart-2 to-chart-4 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Net Sheet Calculator</h1>
            <p className="text-muted-foreground text-sm">AI-powered estimate of selling costs and net proceeds</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Input Form */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide text-muted-foreground">Property Details</h2>

            <div>
              <Label className="text-sm">Property Address (Optional)</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                placeholder="Start typing the address"
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">Include for AI to search public records for accurate data</p>
            </div>

            <div>
              <Label className="text-sm">Sale Price <span className="text-destructive">*</span></Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                <Input
                  type="number"
                  value={form.salePrice}
                  onChange={e => setForm({ ...form, salePrice: e.target.value })}
                  placeholder="450,000"
                  className="pl-7"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">State <span className="text-destructive">*</span></Label>
              <Select value={form.state} onValueChange={v => setForm({ ...form, state: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Agent Commission Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.agentCommission}
                onChange={e => setForm({ ...form, agentCommission: e.target.value })}
                placeholder="6"
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">Typical range: 5-6%</p>
            </div>

            <div>
              <Label className="text-sm">Open Mortgage Balance (Optional)</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                <Input
                  type="number"
                  value={form.mortgageBalance}
                  onChange={e => setForm({ ...form, mortgageBalance: e.target.value })}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">Liens/Other Costs (Optional)</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                <Input
                  type="number"
                  value={form.lienCosts}
                  onChange={e => setForm({ ...form, lienCosts: e.target.value })}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>

            <Button
              onClick={handleCalculate}
              disabled={!isReady || loading}
              className="w-full h-12 gap-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-chart-2 to-chart-4 hover:shadow-lg"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
              ) : (
                <><Calculator className="w-4 h-4" /> Calculate Net Sheet</>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
              💡 AI generates typical closing costs for your state. Actual costs may vary based on specific property and negotiation.
            </p>
          </div>
        </div>

        {/* Right — Output */}
        <div className="flex flex-col">
          <div className={cn(
            'flex-1 bg-card border border-border rounded-2xl p-6 flex flex-col min-h-[400px] transition-all',
            result && 'border-chart-2/30'
          )}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Net Sheet Breakdown</h2>
              {result && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs h-8 rounded-lg">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1 text-xs h-8 rounded-lg">
                    {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-1 text-xs h-8 rounded-lg">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </Button>
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-chart-2/20 to-chart-4/20 flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-chart-2 animate-pulse" />
                  </div>
                  <p className="text-sm">Calculating net proceeds...</p>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex-1"
                >
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-xs bg-muted/30 rounded-lg p-4">
                    {result}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-3 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <Calculator className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Your net sheet will appear here</p>
                    <p className="text-xs text-muted-foreground mt-1">Enter property details and click Calculate</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}