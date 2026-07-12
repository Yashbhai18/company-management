'use client';

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { SlackFileRef } from '../../../lib/slackApi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import styles from './Viewers.module.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  file: SlackFileRef;
  url: string;
  zoom: number;
}

export default function PdfViewer({ url, zoom }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className={styles.pdfContainer}>
      <Document 
        file={url} 
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<div className={styles.spinner} />}
      >
        {Array.from(new Array(numPages || 0), (el, index) => (
          <Page 
            key={`page_${index + 1}`} 
            pageNumber={index + 1} 
            scale={zoom * 1.2}
            className={styles.pdfPage}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        ))}
      </Document>
    </div>
  );
}
