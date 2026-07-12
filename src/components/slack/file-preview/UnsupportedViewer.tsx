'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { SlackFileRef } from '../../../lib/slackApi';
import { getMimeIcon } from './utils/getMimeIcon';
import { PreviewFileType } from './utils/getFileType';
import styles from './Viewers.module.css';

interface UnsupportedViewerProps {
  file: SlackFileRef;
  url: string;
  fileType: PreviewFileType;
}

function formatSize(bytes: number = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function UnsupportedViewer({ file, url, fileType }: UnsupportedViewerProps) {
  const Icon = getMimeIcon(fileType);
  
  return (
    <div className={styles.unsupportedContainer}>
      <Icon size={64} color="#616061" />
      <h2 className={styles.unsupportedTitle}>{file.name}</h2>
      <div className={styles.unsupportedMeta}>
        <span>{formatSize(file.size)}</span>
        {file.mimetype && <span> • {file.mimetype}</span>}
      </div>
      <p style={{ color: '#616061' }}>Preview is not available for this file type.</p>
      <a href={url} download={file.name} className={styles.unsupportedBtn}>
        Download File
      </a>
    </div>
  );
}
