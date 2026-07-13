'use client';

import React from 'react';
import { Download, Maximize2 } from 'lucide-react';
import { IosSpinner } from '../../ui/IosSpinner';
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
  const [isDownloading, setIsDownloading] = React.useState(false);
  const fileType = getFileType(file.name, file.mimetype);
  const Icon = getMimeIcon(fileType);
  const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE';

  // Always use the secure backend proxy — never expose Slack private URLs to the browser
  const { apiBaseURL } = require('../../../lib/api');
  const [token, setToken] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState(false);
  const [isImageLoading, setIsImageLoading] = React.useState(true);

  React.useEffect(() => {
    const { getAccessToken } = require('../../../lib/api');
    setToken(getAccessToken());
  }, []);

  // Use local blob URL immediately if it's a pending upload
  // Otherwise, use the secure backend thumbnail proxy
  let thumbnailSrc = '';
  if (file.previewUrl && file.previewUrl.startsWith('blob:')) {
    thumbnailSrc = file.previewUrl;
  } else if (file.slackFileId) {
    thumbnailSrc = token ? `${apiBaseURL}/slack/files/${file.slackFileId}/thumbnail?token=${encodeURIComponent(token)}` : '';
  } else {
    thumbnailSrc = file.previewUrl || file.permalink;
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    
    if (!file.slackFileId) {
      window.open(file.permalink, '_blank');
      return;
    }
    
    setIsDownloading(true);
    try {
      const { default: api } = await import('../../../lib/api');
      // Fetch through the authenticated proxy to get the file as a blob
      const res = await api.get(`/slack/files/${file.slackFileId}?download=1`, { 
        responseType: 'blob' 
      });
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[AttachmentCard] Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={styles.card} onClick={() => onClick(file)} title="Click to preview">
      {/* Thumbnail area for images/video/pdf */}
      {((file.previewUrl || fileType === 'image') && !imageError) ? (
        <div className={styles.thumbnailContainer}>
          {isImageLoading && <div className={styles.skeleton} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={file.name}
              className={styles.thumbnail}
              loading="lazy"
              onLoad={() => setIsImageLoading(false)}
              onError={() => {
                setImageError(true);
                setIsImageLoading(false);
              }}
              style={isImageLoading ? { opacity: 0 } : { opacity: 1 }}
            />
          ) : (
            <div className={styles.thumbnailPlaceholder} />
          )}
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
        <button
          className={styles.downloadBtn}
          onClick={handleDownload}
          title="Download"
          disabled={isDownloading}
        >
          {isDownloading ? <IosSpinner size="md" /> : <Download size={18} />}
        </button>
      </div>
    </div>
  );
}
