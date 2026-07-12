'use client';

import React from 'react';
import { Download, Maximize2 } from 'lucide-react';
import { SlackFileRef } from '../../../lib/slackApi';
import { getFileType } from './utils/getFileType';
import { getMimeIcon } from './utils/getMimeIcon';
import styles from './AttachmentCard.module.css';

interface AttachmentCardProps {
  file: SlackFileRef;
  onClick: (file: SlackFileRef) => void;
}

function formatSize(bytes: number = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function AttachmentCard({ file, onClick }: AttachmentCardProps) {
  const fileType = getFileType(file.name, file.mimetype);
  const Icon = getMimeIcon(fileType);
  const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE';

  const downloadUrl = file.urlPrivate 
    ? `/api/slack/file/proxy?url=${encodeURIComponent(file.urlPrivate)}`
    : file.permalink;

  return (
    <div className={styles.card} onClick={() => onClick(file)} title="Click to preview">
      {/* Thumbnail area for images/video/pdf */}
      {(file.previewUrl || fileType === 'image') ? (
        <div className={styles.thumbnailContainer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={file.previewUrl || downloadUrl!} 
            alt={file.name} 
            className={styles.thumbnail} 
          />
          {fileType === 'video' && <div className={styles.playOverlay}><div className={styles.playIcon} /></div>}
          <div className={styles.previewOverlay}>
            <Maximize2 size={20} />
          </div>
        </div>
      ) : (
        <div className={styles.iconContainer}>
          <Icon size={32} color="#616061" />
          <div className={styles.previewOverlay}>
            <Maximize2 size={20} />
          </div>
        </div>
      )}

      {/* File Details */}
      <div className={styles.details}>
        <div className={styles.filename}>{file.name}</div>
        <div className={styles.meta}>
          <span className={styles.badge}>{extension}</span>
          <span className={styles.size}>{formatSize(file.size)}</span>
        </div>
      </div>

      {/* Hover Actions */}
      <div className={styles.actions}>
        <a 
          href={downloadUrl} 
          download={file.name} 
          className={styles.downloadBtn}
          onClick={(e) => e.stopPropagation()} // Prevent opening preview when clicking download
          title="Download"
        >
          <Download size={18} />
        </a>
      </div>
    </div>
  );
}
