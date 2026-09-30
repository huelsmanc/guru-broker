import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Download, Eye, Edit2, Search, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function MyReports() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const isAdmin = user?.role === 'admin';

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['cma-reports', user?.email, isAdmin],
    queryFn: () => {
      // Admins see all reports in their brokerage, regular users only see their own
      if (isAdmin) {
        return base44.entities.CMAsReport.filter({ brokerage_id: brokerageId }, '-created_date', 100);
      }
      return base44.entities.CMAsReport.filter({ user_email: user?.email }, '-created_date', 100);
    },
    enabled: !!user?.email && !!brokerageId,
  });

  const deleteReportMutation = useMutation({
    mutationFn: (id) => base44.entities.CMAsReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cma-reports', user?.email] });
      setShowDeleteConfirm(null);
    },
  });

  const filteredReports = reports.filter(r =>
    r.address.toLowerCase().includes(search.toLowerCase()) ||
    r.title?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownloadPDF = async (report) => {
    setDownloadingId(report.id);
    try {
      // Create a hidden element to render the report
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.innerHTML = `
        <div style="width: 800px; padding: 40px; background: white; font-family: Arial, sans-serif; color: #333;">
          <h1 style="font-size: 28px; margin-bottom: 10px;">${report.address}</h1>
          <p style="color: #666; margin-bottom: 30px;">${report.bedrooms} Bed • ${report.bathrooms} Bath ${report.sqft ? `• ${parseInt(report.sqft).toLocaleString()} Sq Ft` : ''}</p>
          
          <h2 style="font-size: 18px; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin: 30px 0 20px 0;">Market Analysis & Valuation</h2>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px;">
            <div style="background: #f5f5f5; padding: 15px; border-radius: 6px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Price Per Sq Ft</div>
              <div style="font-size: 20px; font-weight: bold;">$${report.cma_report.marketAnalysis.avgPricePerSqft?.toFixed(0) || 'N/A'}</div>
            </div>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 6px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Market Condition</div>
              <div style="font-size: 20px; font-weight: bold;">${report.cma_report.marketAnalysis.marketCondition || 'Balanced'}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin: 30px 0 20px 0;">Comparable Properties</h2>
          ${report.cma_report.comparables?.slice(0, 3).map(comp => `
            <div style="border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin-bottom: 15px; background: #f9f9f9;">
              <div style="font-weight: bold; margin-bottom: 10px;">${comp.address}</div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px; margin-bottom: 10px;">
                <div><div style="color: #666; font-size: 11px;">Beds • Baths</div><div style="font-weight: bold;">${comp.beds} • ${comp.baths}</div></div>
                <div><div style="color: #666; font-size: 11px;">Sq Ft</div><div style="font-weight: bold;">${(comp.sqft / 1000).toFixed(1)}K</div></div>
                <div><div style="color: #666; font-size: 11px;">Days on Market</div><div style="font-weight: bold;">${comp.daysOnMarket}d</div></div>
              </div>
              <div style="border-top: 1px solid #ddd; padding-top: 10px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span>Sold Price:</span>
                  <strong>$${comp.soldPrice?.toLocaleString()}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>List Price:</span>
                  <strong>$${comp.listPrice?.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`CMA_${report.address.split(',')[0]}_${new Date().toISOString().split('T')[0]}.pdf`);

      document.body.removeChild(container);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-6xl mx-auto flex items-center justify-center h-[80vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">{isAdmin ? 'CMA Reports' : 'My CMA Reports'}</h1>
        </div>
        <p className="text-muted-foreground">
          {isAdmin ? 'View all CMA reports from your brokerage' : 'Manage and review your previously generated reports'}
        </p>
      </motion.div>

      {/* Search */}
      <div className="mb-6 flex items-center gap-2 bg-muted/30 rounded-lg px-4 py-2 border border-border/40">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by address or title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-0 outline-none"
        />
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <Card className="p-12 border-border/40 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No reports yet. Generate your first CMA report to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report, i) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-5 border-border/40 hover:shadow-lg transition-shadow h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm">
                      {report.title || report.address}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{report.address}</p>
                    {isAdmin && report.user_email && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">By {report.user_email}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0 ml-2">
                    {report.bedrooms}B {report.bathrooms}B
                  </Badge>
                </div>

                {/* Details */}
                <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                  {report.sqft && (
                    <p>
                      <span className="font-medium">{parseInt(report.sqft).toLocaleString()}</span> Sq Ft
                    </p>
                  )}
                  <p className="text-muted-foreground/70">
                    Created {format(new Date(report.created_date), 'MMM d, yyyy')}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 bg-muted/40 rounded-lg p-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Price/Sq Ft</div>
                    <div className="font-bold text-foreground">
                      ${report.cma_report?.marketAnalysis?.avgPricePerSqft?.toFixed(0) || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">DOM</div>
                    <div className="font-bold text-foreground">
                      {report.cma_report?.marketAnalysis?.avgDaysOnMarket || 'N/A'}d
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedReport(report)}
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 gap-1 rounded-lg text-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </Button>
                  <Button
                    onClick={() => handleDownloadPDF(report)}
                    disabled={downloadingId === report.id}
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 gap-1 rounded-lg text-xs"
                  >
                    {downloadingId === report.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Download
                  </Button>
                  <Button
                    onClick={() => setShowDeleteConfirm(report.id)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* View Detail Dialog */}
      {selectedReport && (
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedReport.address}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Property Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bedrooms</p>
                  <p className="font-bold text-foreground">{selectedReport.bedrooms}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bathrooms</p>
                  <p className="font-bold text-foreground">{selectedReport.bathrooms}</p>
                </div>
                {selectedReport.sqft && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Sq Ft</p>
                    <p className="font-bold text-foreground">{parseInt(selectedReport.sqft).toLocaleString()}</p>
                  </div>
                )}
                {selectedReport.year_built && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Year Built</p>
                    <p className="font-bold text-foreground">{selectedReport.year_built}</p>
                  </div>
                )}
              </div>

              {/* Market Analysis */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">Market Analysis</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Price Per Sq Ft</p>
                    <p className="font-bold text-primary">
                      ${selectedReport.cma_report?.marketAnalysis?.avgPricePerSqft?.toFixed(0) || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Days on Market</p>
                    <p className="font-bold text-primary">{selectedReport.cma_report?.marketAnalysis?.avgDaysOnMarket || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Recommended Price Range</p>
                    <p className="font-bold text-primary">{selectedReport.cma_report?.marketAnalysis?.recommendedPriceRange}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground mb-1">Market Condition</p>
                    <p className="font-medium text-foreground">{selectedReport.cma_report?.marketAnalysis?.marketCondition}</p>
                  </div>
                </div>
              </div>

              {/* Comparable Properties */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">Comparable Properties ({selectedReport.cma_report?.comparables?.length || 0})</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {selectedReport.cma_report?.comparables?.map((comp, idx) => (
                    <div key={idx} className="border border-border/40 rounded-lg p-3 text-sm">
                      <p className="font-medium text-foreground">{comp.address}</p>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                        <div>{comp.beds}B • {comp.baths}B</div>
                        <div>{(comp.sqft / 1000).toFixed(1)}K Sq Ft</div>
                        <div>{comp.daysOnMarket}d on market</div>
                      </div>
                      <div className="flex justify-between mt-2 text-xs border-t border-border/30 pt-2">
                        <span>Sold: <strong>${comp.soldPrice?.toLocaleString()}</strong></span>
                        <span>List: <strong>${comp.listPrice?.toLocaleString()}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedReport(null)}>
                Close
              </Button>
              <Button onClick={() => {
                handleDownloadPDF(selectedReport);
                setSelectedReport(null);
              }} className="gap-2">
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete report?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteReportMutation.mutate(showDeleteConfirm)}
              disabled={deleteReportMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}