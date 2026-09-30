import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const Section = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>}
    </div>
  );
};

const Field = ({ label, required, children, className }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
  </div>
);

const CheckRow = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer py-1">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-border accent-primary"
    />
    <span className="text-sm text-foreground">{label}</span>
  </label>
);

const DEFAULT_FORM = {
  property_address: '',
  legal_description: '',
  buyer_name: '',
  buyer_email: '',
  buyer_address: '',
  seller_name: '',
  seller_email: '',
  seller_address: '',
  listing_agent: '',
  listing_agent_license: '',
  buyer_agent: '',
  buyer_agent_license: '',
  brokerage_name: '',
  seller_attorney: '',
  seller_attorney_email: '',
  buyer_attorney: '',
  buyer_attorney_email: '',
  purchase_price: '',
  earnest_money: '',
  additional_deposit: '',
  additional_deposit_date: '',
  loan_amount: '',
  balance_at_closing: '',
  financing_type: 'Conventional',
  financing_contingency: true,
  loan_commitment_date: '',
  closing_date: '',
  inspection_contingency: true,
  inspection_completion_date: '',
  insp_building: true,
  insp_termite: false,
  insp_septic: false,
  insp_water: false,
  insp_well: false,
  insp_radon: false,
  insp_oil_tank: false,
  insp_lead: false,
  insp_asbestos: false,
  buyer_broker_fee: '',
  inclusions: '',
  exclusions: '',
  additional_terms: '',
  riders: '',
  dual_agent: false,
};

export default function ContractForm({ onSubmit, user, initialValues }) {
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM,
    listing_agent: user?.full_name || '',
    ...(initialValues && Object.keys(initialValues).length > 0 ? initialValues : {}),
  }));

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Auto-calc balance
  const calcBalance = () => {
    const pp = Number(form.purchase_price) || 0;
    const dep = Number(form.earnest_money) || 0;
    const addDep = Number(form.additional_deposit) || 0;
    const loan = Number(form.loan_amount) || 0;
    return Math.max(0, pp - dep - addDep - loan);
  };

  const isReady = form.property_address && form.buyer_name && form.seller_name && form.purchase_price;

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, balance_at_closing: calcBalance() }); }}>

      <Section title="🏠 Property">
        <Field label="Real Property Address" required className="sm:col-span-2">
          <Input value={form.property_address} onChange={e => set('property_address', e.target.value)} placeholder="123 Main St, Greenwich, CT 06830" />
        </Field>
        <Field label="Legal Description" className="sm:col-span-2">
          <Input value={form.legal_description} onChange={e => set('legal_description', e.target.value)} placeholder="Lot 12, Block 4, Map 1234..." />
        </Field>
        <Field label="Personal Property Included" className="sm:col-span-2">
          <Textarea value={form.inclusions} onChange={e => set('inclusions', e.target.value)} placeholder="Refrigerator, washer/dryer..." className="min-h-[60px]" />
        </Field>
        <Field label="Personal Property Excluded" className="sm:col-span-2">
          <Input value={form.exclusions} onChange={e => set('exclusions', e.target.value)} placeholder="Dining room chandelier..." />
        </Field>
      </Section>

      <Section title="👥 Parties">
        <Field label="Seller Name(s)" required>
          <Input value={form.seller_name} onChange={e => set('seller_name', e.target.value)} placeholder="Bob & Mary Johnson" />
        </Field>
        <Field label="Seller Address">
          <Input value={form.seller_address} onChange={e => set('seller_address', e.target.value)} placeholder="123 Main St..." />
        </Field>
        <Field label="Buyer Name(s)" required>
          <Input value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} placeholder="John & Jane Smith" />
        </Field>
        <Field label="Buyer Address">
          <Input value={form.buyer_address} onChange={e => set('buyer_address', e.target.value)} placeholder="456 Current St..." />
        </Field>
        <Field label="Buyer Email">
          <Input type="email" value={form.buyer_email} onChange={e => set('buyer_email', e.target.value)} placeholder="buyer@email.com" />
        </Field>
        <Field label="Seller Email">
          <Input type="email" value={form.seller_email} onChange={e => set('seller_email', e.target.value)} placeholder="seller@email.com" />
        </Field>
      </Section>

      <Section title="🏢 Agents & Attorneys">
        <Field label="Listing / Seller's Agent">
          <Input value={form.listing_agent} onChange={e => set('listing_agent', e.target.value)} />
        </Field>
        <Field label="Listing Agent License #">
          <Input value={form.listing_agent_license} onChange={e => set('listing_agent_license', e.target.value)} placeholder="RES.0123456" />
        </Field>
        <Field label="Buyer's Agent">
          <Input value={form.buyer_agent} onChange={e => set('buyer_agent', e.target.value)} placeholder="Agent name" />
        </Field>
        <Field label="Buyer's Agent License #">
          <Input value={form.buyer_agent_license} onChange={e => set('buyer_agent_license', e.target.value)} placeholder="RES.0123456" />
        </Field>
        <Field label="Brokerage / Firm">
          <Input value={form.brokerage_name} onChange={e => set('brokerage_name', e.target.value)} placeholder="ABC Realty" />
        </Field>
        <Field label="Buyer's Broker Fee">
          <Input value={form.buyer_broker_fee} onChange={e => set('buyer_broker_fee', e.target.value)} placeholder="$_____ or ___%" />
        </Field>
        <Field label="Seller's Attorney">
          <Input value={form.seller_attorney} onChange={e => set('seller_attorney', e.target.value)} placeholder="Attorney name" />
        </Field>
        <Field label="Seller's Attorney Email">
          <Input type="email" value={form.seller_attorney_email} onChange={e => set('seller_attorney_email', e.target.value)} />
        </Field>
        <Field label="Buyer's Attorney">
          <Input value={form.buyer_attorney} onChange={e => set('buyer_attorney', e.target.value)} placeholder="Attorney name" />
        </Field>
        <Field label="Buyer's Attorney Email">
          <Input type="email" value={form.buyer_attorney_email} onChange={e => set('buyer_attorney_email', e.target.value)} />
        </Field>
        <Field label="Agency Relationship" className="sm:col-span-2">
          <Select value={form.dual_agent ? 'dual' : 'buyers'} onValueChange={v => set('dual_agent', v === 'dual')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buyers">Selling Agent is Buyer's Agent</SelectItem>
              <SelectItem value="dual">Dual Agent</SelectItem>
              <SelectItem value="sub">Authorized Sub-Agent</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="💰 Purchase Price (Paragraph 5)">
        <Field label="Total Purchase Price ($)" required>
          <Input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="450000" />
        </Field>
        <Field label="(a) Initial Deposit ($)" required>
          <Input type="number" value={form.earnest_money} onChange={e => set('earnest_money', e.target.value)} placeholder="5000" />
        </Field>
        <Field label="(b) Additional Deposit ($)">
          <Input type="number" value={form.additional_deposit} onChange={e => set('additional_deposit', e.target.value)} placeholder="0" />
        </Field>
        <Field label="Additional Deposit Due Date">
          <Input type="date" value={form.additional_deposit_date} onChange={e => set('additional_deposit_date', e.target.value)} />
        </Field>
        <Field label="(c) Mortgage Loan Amount ($)">
          <Input type="number" value={form.loan_amount} onChange={e => set('loan_amount', e.target.value)} placeholder="360000" />
        </Field>
        <Field label="(d) Balance at Closing ($)">
          <Input type="number" value={form.balance_at_closing || calcBalance()} onChange={e => set('balance_at_closing', e.target.value)} placeholder={String(calcBalance())} />
        </Field>
      </Section>

      <Section title="🏦 Mortgage Financing Contingency (Paragraph 6)">
        <div className="sm:col-span-2">
          <CheckRow label="Financing Contingency Applies" checked={form.financing_contingency} onChange={v => set('financing_contingency', v)} />
        </div>
        {form.financing_contingency && (
          <>
            <Field label="Financing Type">
              <Select value={form.financing_type} onValueChange={v => set('financing_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Conventional">Third Party Mortgage — Conventional</SelectItem>
                  <SelectItem value="FHA">Third Party Mortgage — FHA</SelectItem>
                  <SelectItem value="VA">Third Party Mortgage — VA</SelectItem>
                  <SelectItem value="USDA">Third Party Mortgage — USDA</SelectItem>
                  <SelectItem value="Purchase Money Mortgage">Purchase Money Mortgage</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Written Loan Commitment by Date">
              <Input type="date" value={form.loan_commitment_date} onChange={e => set('loan_commitment_date', e.target.value)} />
            </Field>
          </>
        )}
      </Section>

      <Section title="📅 Closing Date (Paragraph 7)">
        <Field label="Closing Date" required>
          <Input type="date" value={form.closing_date} onChange={e => set('closing_date', e.target.value)} />
        </Field>
      </Section>

      <Section title="🔍 Inspection Contingency (Paragraph 9)">
        <Field label="Inspection Completion Date" className="sm:col-span-2">
          <Input type="date" value={form.inspection_completion_date} onChange={e => set('inspection_completion_date', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Select Inspections (check YES to include)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            <CheckRow label="Building / Mechanical" checked={form.insp_building} onChange={v => set('insp_building', v)} />
            <CheckRow label="Termite / Other Insects" checked={form.insp_termite} onChange={v => set('insp_termite', v)} />
            <CheckRow label="Septic" checked={form.insp_septic} onChange={v => set('insp_septic', v)} />
            <CheckRow label="Title Search" checked={true} onChange={() => {}} />
            <CheckRow label="Water" checked={form.insp_water} onChange={v => set('insp_water', v)} />
            <CheckRow label="Well / Organic Chemicals" checked={form.insp_well} onChange={v => set('insp_well', v)} />
            <CheckRow label="Radon – Air / Water" checked={form.insp_radon} onChange={v => set('insp_radon', v)} />
            <CheckRow label="Oil Tank" checked={form.insp_oil_tank} onChange={v => set('insp_oil_tank', v)} />
            <CheckRow label="Lead" checked={form.insp_lead} onChange={v => set('insp_lead', v)} />
            <CheckRow label="Asbestos" checked={form.insp_asbestos} onChange={v => set('insp_asbestos', v)} />
          </div>
        </div>
      </Section>

      <Section title="📝 Additional Terms & Riders (Paragraphs 15–16)" defaultOpen={false}>
        <Field label="Additional Terms / Seller Concessions (Paragraph 15)" className="sm:col-span-2">
          <Textarea value={form.additional_terms} onChange={e => set('additional_terms', e.target.value)} placeholder="Seller to provide $5,000 closing cost credit..." className="min-h-[80px]" />
        </Field>
        <Field label="Riders Attached (Paragraph 16)" className="sm:col-span-2">
          <Input value={form.riders} onChange={e => set('riders', e.target.value)} placeholder="Lead Paint Addendum, HOA Rider..." />
        </Field>
      </Section>

      <Button type="submit" disabled={!isReady} className="w-full h-12 gap-2 rounded-xl text-sm font-semibold mt-2">
        <Wand2 className="w-4 h-4" /> Generate CT Standard Form Contract
      </Button>
    </form>
  );
}