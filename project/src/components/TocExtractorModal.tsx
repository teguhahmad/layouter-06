import React from 'react';
import { X } from 'lucide-react';
import { useEbookStore } from '../store/useEbookStore';

interface TocExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TocExtractorModal({ isOpen, onClose }: TocExtractorModalProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const { generatePDF } = useEbookStore();

  React.useEffect(() => {
    if (isOpen) {
      handleExtractToc();
    }
  }, [isOpen]);

  const handleExtractToc = async () => {
    try {
      // Generate PDF in memory
      const pdfBlob = await generatePDF();
      
      // Create a message channel for iframe communication
      const channel = new MessageChannel();
      
      // Wait for iframe to load
      await new Promise(resolve => {
        if (iframeRef.current) {
          iframeRef.current.onload = resolve;
        }
      });

      // Send PDF data to iframe
      iframeRef.current?.contentWindow?.postMessage({
        type: 'pdf-data',
        data: pdfBlob
      }, '*', [channel.port1]);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] h-[600px] relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="w-6 h-6" />
        </button>
        <iframe
          ref={iframeRef}
          src="/toc-extractor.html"
          className="w-full h-full rounded-lg"
          title="Table of Contents Extractor"
        />
      </div>
    </div>
  );
}