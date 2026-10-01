import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function ContractPreview({ contractText, formData, onDownload }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const contentRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(contractText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    const el = contentRef.current;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 80; // 40pt margin each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let y = 40;
    let remaining = imgHeight;
    let srcY = 0;
    while (remaining > 0) {
      const sliceHeight = Math.min(remaining, pageHeight - 80);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = (sliceHeight / imgHeight) * canvas.height;
      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, srcY * (canvas.height / imgHeight), canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 40, y, imgWidth, sliceHeight);
      remaining -= sliceHeight;
      srcY += sliceHeight;
      if (remaining > 0) { pdf.addPage(); y = 40; }
    }
    pdf.save(`Contract-${formData?.property_address?.replace(/\s/g, '-') || 'Agreement'}.pdf`);
    setDownloading(false);
  };

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
        <div>
          <h2 className="font-semibold text-foreground text-sm">Purchase & Sale Agreement</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{formData?.property_address} {formData?.state && `· ${formData.state}`}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading} className="gap-1.5 rounded-xl text-xs h-8">
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? 'Generating PDF...' : 'Download PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 rounded-xl text-xs h-8">
            {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy All</>}
          </Button>
        </div>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto">
        <div ref={contentRef} className="p-8 lg:p-12 bg-white">
          <ReactMarkdown
            className="contract-document"
            components={{
              h1: ({ children }) => <h1 style={{fontSize:'18px',fontWeight:'bold',textAlign:'center',textTransform:'uppercase',borderBottom:'2px solid #000',paddingBottom:'10px',marginBottom:'20px'}}>{children}</h1>,
              h2: ({ children }) => <h2 style={{fontSize:'14px',fontWeight:'bold',textTransform:'uppercase',marginTop:'24px',marginBottom:'8px'}}>{children}</h2>,
              h3: ({ children }) => <h3 style={{fontSize:'13px',fontWeight:'bold',marginTop:'16px',marginBottom:'6px'}}>{children}</h3>,
              p: ({ children }) => <p style={{fontSize:'12px',lineHeight:'1.7',marginBottom:'10px',color:'#111'}}>{children}</p>,
              strong: ({ children }) => <strong style={{fontWeight:'bold',color:'#000'}}>{children}</strong>,
              ul: ({ children }) => <ul style={{listStyleType:'disc',marginLeft:'24px',marginBottom:'10px',fontSize:'12px'}}>{children}</ul>,
              ol: ({ children }) => <ol style={{listStyleType:'decimal',marginLeft:'24px',marginBottom:'10px',fontSize:'12px'}}>{children}</ol>,
              li: ({ children }) => <li style={{lineHeight:'1.6',marginBottom:'3px'}}>{children}</li>,
              hr: () => <hr style={{margin:'20px 0',borderColor:'#ddd'}} />,
              blockquote: ({ children }) => <blockquote style={{borderLeft:'4px solid #aaa',paddingLeft:'12px',margin:'10px 0',fontSize:'12px',color:'#555',fontStyle:'italic'}}>{children}</blockquote>,
            }}
          >
            {contractText}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}