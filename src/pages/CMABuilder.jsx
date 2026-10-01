import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44, supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Home, TrendingUp, AlertCircle, Download, MapPin, DollarSign, Calendar, Zap, Map, List, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import CMAMap from '@/components/cma/CMAMap';
import CMAEmailDialog from '@/components/cma/CMAEmailDialog';

// Street-level photo of an address (our server asks Google Street View; nothing if there's no imagery).
const streetPhoto = (addr, subject) => {
  let a = String(addr || '').trim();
  const tail = String(subject || '').split(',').slice(1).join(',').trim();
  if (a && tail && !a.includes(',')) a = `${a}, ${tail}`;
  return a ? `/api/fn/streetView?address=${encodeURIComponent(a)}` : null;
};

// The comp's photo: its MLS photo, else a street-level photo, else a placeholder (with the reason
// when the street photo service itself isn't working, so setup problems are visible).
function CompPhoto({ comp, subjectAddress }) {
  const street = streetPhoto(comp.address, subjectAddress);
  const [src, setSrc] = useState(comp.photoUrl && !String(comp.photoUrl).startsWith('/api/fn/streetView') ? comp.photoUrl : null);
  const [problem, setProblem] = useState('');
  const [failed, setFailed] = useState(false);
  const loadStreet = React.useCallback(async () => {
    if (!street) return setFailed(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(street, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setProblem(j.problem || '');
        return setFailed(true);
      }
      const blob = await res.blob();
      const reader = new FileReader(); // a data URL also prints in the PDF export
      reader.onload = () => setSrc(reader.result);
      reader.readAsDataURL(blob);
    } catch { setFailed(true); }
  }, [street]);
  React.useEffect(() => { if (!src) loadStreet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10 flex flex-col items-center justify-center absolute inset-0 px-4 text-center">
        <Home className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground/60">Photo Unavailable</p>
        {problem && <p className="text-[11px] text-amber-700 mt-1">{problem}</p>}
      </div>
    );
  }
  if (!src) return <div className="absolute inset-0 animate-pulse bg-muted" />;
  return (
    <img src={src} alt={comp.address} className="w-full h-full object-cover" loading="lazy"
      onError={() => { setSrc(null); loadStreet(); }} />
  );
}

export default function CMABuilder() {
  const { user, brokerageId } = useOutletContext();
  const [address, setAddress] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [cmaReport, setCmaReport] = useState(null);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const handleGenerateCMA = async () => {
    if (!address.trim()) {
      setError('Please enter a property address');
      return;
    }

    if (loading) return; // Prevent double-click

    setLoading(true);
    setError('');
    setCmaReport(null);

    try {
      const response = await base44.functions.invoke('generateCMAReport', {
        address,
        propertyDetails: {
          bedrooms: parseInt(beds) || 3,
          bathrooms: parseInt(baths) || 2,
          notes,
        },
        brokerageId,
      });

      if (!response.data) {
        setError('No data received from API');
        setLoading(false);
        return;
      }

      if (response.data.error) {
        setError(response.data.error);
        setLoading(false);
        return;
      }

      setCmaReport(response.data);
      setLoading(false);
      // Scroll to results
      setTimeout(() => {
        const reportEl = document.getElementById('cma-report');
        if (reportEl) reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('CMA generation error:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to generate CMA report. Please try again.');
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!cmaReport) {
      setError('No CMA report to download');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Save report to database first
      try {
        const me = await base44.auth.me();
        await base44.entities.CMAsReport.create({
          user_email: me.email,
          brokerage_id: brokerageId,
          address,
          bedrooms: parseInt(beds),
          bathrooms: parseInt(baths),
          notes,
          cma_report: cmaReport,
          title: `CMA Report - ${address}`,
          status: 'completed'
        });
      } catch (err) {
        console.error('Failed to save report:', err);
      }

      // Generate professional PDF
      const response = await base44.functions.invoke('generateCMAPDF', {
        address,
        beds,
        baths,
        cmaReport
      });

      if (!response || !response.data) {
        setError('No response from PDF generator');
        setLoading(false);
        return;
      }

      if (response.data.error) {
        setError(response.data.error);
        setLoading(false);
        return;
      }

      if (response.data.pdf && response.data.filename) {
        // Decode base64 and create blob
        const binaryString = atob(response.data.pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        
        // Download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.data.filename || 'CMA_Report.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        setError('Invalid PDF response');
      }
    } catch (err) {
      console.error('PDF download error:', err);
      setError(err?.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Home className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">AI CMA Builder</h1>
        </div>
        <p className="text-muted-foreground">Generate comparative market analysis reports in seconds</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Form */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
          <Card className="p-6 border-border/40 sticky top-6">
            <h2 className="font-semibold text-foreground mb-4">Property Details</h2>

            <div className="space-y-4">
              <div>
                <Label className="text-sm">Property Address *</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, New York, NY"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerateCMA();
                  }}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Bedrooms</Label>
                  <Input
                    type="number"
                    value={beds}
                    onChange={(e) => setBeds(e.target.value)}
                    placeholder="e.g. 3"
                    min="1"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Bathrooms</Label>
                  <Input
                    type="number"
                    value={baths}
                    onChange={(e) => setBaths(e.target.value)}
                    placeholder="e.g. 2"
                    step="0.5"
                    min="1"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm">Notes (upgrades, condition, etc.)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Recently renovated kitchen, new roof, needs rehab, etc."
                  className="mt-1.5 resize-none h-24"
                />
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <Button
                onClick={handleGenerateCMA}
                disabled={loading || !address.trim()}
                className="w-full h-11 rounded-xl gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating CMA...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    Generate CMA Report
                  </>
                )}
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Report Display */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
          {loading ? (
            <Card className="p-12 border-border/40 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="text-muted-foreground font-medium">Generating CMA Report...</span>
              </div>
            </Card>
          ) : cmaReport ? (
            <div id="cma-report" className="space-y-6">
              {/* Header */}
              <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-border/40">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{address}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {beds} Bed • {baths} Bath
                    </p>
                  </div>
                  <Badge className="bg-primary/20 text-primary border-primary/30">CMA Report</Badge>
                </div>

                <p className="text-sm text-foreground">{cmaReport.summary}</p>
                {cmaReport.source === 'mls' ? (
                  <p className="mt-2 text-xs text-green-700">Based on {cmaReport.comparables?.length} recent sales from your MLS.</p>
                ) : cmaReport.source === 'web' ? (
                  <p className="mt-2 text-xs text-amber-700">No MLS sales synced for this area yet, so these comps came from a web search. Verify them before sharing.</p>
                ) : null}
              </Card>

              {/* Market Analysis - Enhanced Visual */}
              <Card className="p-6 border-border/40 bg-gradient-to-br from-primary/5 to-accent/5">
                <h3 className="font-semibold text-foreground mb-6 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Market Analysis & Valuation
                </h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/50 dark:bg-slate-900/50 rounded-xl p-4 border border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Price Per Sq Ft</p>
                      <DollarSign className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      ${cmaReport.marketAnalysis.avgPricePerSqft?.toFixed(0) || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-white/50 dark:bg-slate-900/50 rounded-xl p-4 border border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Avg Days on Market</p>
                      <Calendar className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{cmaReport.marketAnalysis.avgDaysOnMarket || 'N/A'}</p>
                  </div>

                  <div className="bg-white/50 dark:bg-slate-900/50 rounded-xl p-4 border border-primary/10 lg:col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Market Condition</p>
                      <Zap className="w-4 h-4 text-yellow-500" />
                    </div>
                    <p className="text-lg font-bold text-foreground">{cmaReport.marketAnalysis.marketCondition || 'Balanced Market'}</p>
                  </div>
                </div>

                <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-4 border border-accent/20 mb-6">
                  <p className="text-sm text-muted-foreground mb-2 font-semibold">Recommended Price Range</p>
                  <p className="text-2xl font-bold text-primary">{cmaReport.marketAnalysis.recommendedPriceRange}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Market Trend</p>
                    <p className="text-sm text-foreground leading-relaxed">{cmaReport.marketAnalysis.marketTrend}</p>
                  </div>
                  {cmaReport.marketAnalysis.priceAdjustments && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">Price Adjustments</p>
                      <p className="text-sm text-foreground leading-relaxed">{cmaReport.marketAnalysis.priceAdjustments}</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Map and List Toggle */}
              <Card className="p-6 border-border/40">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    Market Distribution
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('map')}
                      className={`p-2 rounded-lg transition-all ${viewMode === 'map' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      <Map className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {viewMode === 'map' && <CMAMap address={address} comparables={cmaReport.comparables} />}
              </Card>

              {/* Rehab Assessment */}
              <Card className="p-6 border-border/40">
                <h3 className="font-semibold text-foreground mb-3">Rehab & Condition Assessment</h3>
                <p className="text-sm text-foreground leading-relaxed">{cmaReport.rehabAssessment}</p>
              </Card>

              {/* Comparables - Visual Grid */}
              {viewMode === 'list' && (
              <Card className="p-6 border-border/40">
                <h3 className="font-semibold text-foreground mb-4">Comparable Properties</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cmaReport.comparables?.map((comp, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border border-border/40 rounded-2xl overflow-hidden bg-card hover:shadow-lg transition-shadow"
                    >
                      {/* Property Photo */}
                      <div className="relative w-full h-48 bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                        <CompPhoto key={`${comp.address}|${comp.photoUrl || ""}`} comp={comp} subjectAddress={address} />
                        <div className="absolute top-3 right-3 bg-primary text-primary-foreground px-3 py-1 rounded-lg text-sm font-bold shadow-lg">
                          ${(comp.soldPrice / 1000).toFixed(0)}K
                        </div>
                      </div>

                      {/* Property Details */}
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="font-semibold text-foreground text-sm flex items-start gap-1.5">
                            <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                            <span className="leading-tight">{comp.address}</span>
                          </p>
                        </div>

                        {/* Key Stats */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <p className="text-muted-foreground">Beds • Baths</p>
                            <p className="font-bold text-foreground mt-0.5">{comp.beds} • {comp.baths}</p>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <p className="text-muted-foreground">DOM</p>
                            <p className="font-bold text-foreground mt-0.5">{comp.daysOnMarket != null && comp.daysOnMarket !== '' ? `${comp.daysOnMarket}d` : '—'}</p>
                          </div>
                        </div>

                        {/* Price Info */}
                        <div className="border-t border-border/40 pt-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Sold:</span>
                            <span className="font-bold text-primary">${comp.soldPrice?.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">List:</span>
                            <span className="font-medium text-foreground">{comp.listPrice ? `$${Number(comp.listPrice).toLocaleString()}` : '—'}</span>
                          </div>
                          {comp.soldDate && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Sold
                              </span>
                              <span className="font-medium text-foreground">{comp.soldDate}</span>
                            </div>
                          )}
                        </div>

                        {/* Upgrades */}
                        {comp.upgrades?.length > 0 && (
                          <div className="border-t border-border/40 pt-3 space-y-2">
                            <p className="text-xs text-muted-foreground font-medium">Recent Upgrades:</p>
                            <div className="flex flex-wrap gap-1">
                              {comp.upgrades.slice(0, 3).map((upgrade, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {upgrade}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {comp.notes && (
                          <p className="text-xs text-foreground italic pt-2 border-t border-border/40">{comp.notes}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
                </Card>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleDownloadPDF}
                    variant="outline"
                    className="h-11 rounded-xl gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </Button>
                  <Button
                    onClick={() => setShowEmailDialog(true)}
                    className="h-11 rounded-xl gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Mail className="w-4 h-4" />
                    Email Report
                  </Button>
                </div>
            </div>
          ) : (
            <Card className="p-12 border-border/40 text-center">
              <Home className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Enter property details and generate a CMA report</p>
            </Card>
          )}
        </motion.div>
      </div>

      <CMAEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        cmaReport={cmaReport}
        address={address}
      />
    </div>
  );
}