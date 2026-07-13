'use client';

import React from 'react';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface PdfViewerProps {
  file: SlackFileRef;
  url: string;
  zoom: number;
}

export default function PdfViewer({ url }: PdfViewerProps) {
  return (
    <div className={styles.pdfContainer}>
      <iframe 
        src={url} 
        className={styles.pdfIframe}
        title="PDF Preview"
      />
    </div>
  );
}
