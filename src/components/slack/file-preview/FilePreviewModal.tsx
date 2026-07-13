'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { IosSpinner } from '../../ui/IosSpinner';
import { SlackFileRef } from '../../../lib/slackApi';
import { getFileType } from './utils/getFileType';
import styles from './FilePreviewModal.module.css';

// Lazy load viewers
const ImageViewer = dynamic(() => import('./ImageViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const PdfViewer = dynamic(() => import('./PdfViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const VideoViewer = dynamic(() => import('./VideoViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const AudioViewer = dynamic(() => import('./AudioViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const CodeViewer = dynamic(() => import('./CodeViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const TextViewer = dynamic(() => import('./TextViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const OfficeViewer = dynamic(() => import('./OfficeViewer'), { ssr: false, loading: () => <ViewerLoader /> });
const UnsupportedViewer = dynamic(() => import('./UnsupportedViewer'), { ssr: false, loading: () => <ViewerLoader /> });

function ViewerLoader() {
  return (
    <div className={styles.loaderContainer}>
      <div className={styles.spinner}></div>
    </div>
  );
}

export interface FilePreviewModalProps {
  isOpen: boolean;
  currentFile: SlackFileRef | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export function FilePreviewModal({
  isOpen,
  currentFile,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
}: FilePreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset zoom and blob when file changes
  useEffect(() => {
    setZoom(1);
    setBlobUrl(null);
    setFetchError(null);
  }, [currentFile?.slackFileId]);

  // Fetch secure blob URL for Slack files
  useEffect(() => {
    if (!isOpen || !currentFile) return;

    let isActive = true;

    const fetchFile = async () => {
      try {
        console.log('[slack:preview] File ID:', currentFile.slackFileId);
        console.log('[slack:preview] File Type:', currentFile.mimetype);
        console.log('[slack:preview] Permalink:', currentFile.permalink);

        if (!currentFile.slackFileId) {
          throw new Error('No Slack File ID available');
        }

        const { default: api } = await import('../../../lib/api');
        const res = await api.get(`/slack/files/${currentFile.slackFileId}`, { 
          responseType: 'blob' 
        });
        
        console.log('Response Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);

        if (res.status !== 200) {
          throw new Error(`Failed to load file: ${res.status}`);
        }

        const blob = res.data;
        console.log('Blob Size:', blob.size);

        if (isActive) {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch (err: any) {
        console.error('Error fetching Slack file preview:', err);
        let errorMsg = err.message || 'Unable to preview this file';
        
        if (err.response) {
          console.error('Server error response type:', typeof err.response.data);
          if (err.response.data instanceof Blob) {
            try {
              const text = await err.response.data.text();
              console.error('Server error RAW TEXT:', text);
              const json = JSON.parse(text);
              console.error('Server error JSON:', json);
              errorMsg = json.slackError || json.message || errorMsg;
            } catch (parseErr) {
              console.error('Failed to parse error blob:', parseErr);
            }
          } else {
            console.error('Server error details:', err.response.data);
            errorMsg = err.response.data?.slackError || err.response.data?.message || errorMsg;
          }
        }
        
        if (isActive) {
          setFetchError(`Error: ${errorMsg}`);
        }
      }
    };

    fetchFile();

    return () => {
      isActive = false;
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isOpen, currentFile]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        setZoom(z => Math.min(z + 0.25, 3));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(z - 0.25, 0.25));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasNext, hasPrev, onClose, onNext, onPrev]);

  // Determine file type
  const fileType = useMemo(() => {
    if (!currentFile) return 'unknown';
    return getFileType(currentFile.name, currentFile.mimetype);
  }, [currentFile]);


  if (!isOpen || !currentFile) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className={styles.header} onClick={(e) => e.stopPropagation()}>
          <div className={styles.fileInfo}>
            <span className={styles.filename}>{currentFile.name}</span>
          </div>
          <div className={styles.actions}>
            {fileType === 'image' && (
              <>
                <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom Out (Ctrl -)"><ZoomOut size={20} /></button>
                <button onClick={() => setZoom(1)} title="Reset Zoom (Ctrl 0)"><Maximize size={18} /></button>
                <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom In (Ctrl +)"><ZoomIn size={20} /></button>
                <div className={styles.divider} />
              </>
            )}
            <button
              className={styles.downloadBtn}
              onClick={async () => {
                if (!currentFile) return;

                if (isDownloading) return;
                setIsDownloading(true);
                try {
                  if (blobUrl) {
                    // Fast path: blob already in memory from preview
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = currentFile.name || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                  } else if (currentFile.slackFileId) {
                    // Slow path: fetch fresh through secure proxy with Content-Disposition: attachment
                    const { default: api } = await import('../../../lib/api');
                    const res = await api.get(`/slack/files/${currentFile.slackFileId}?download=1`, {
                      responseType: 'blob'
                    });
                    const url = URL.createObjectURL(res.data);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = currentFile.name || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }
                } finally {
                  setIsDownloading(false);
                }
              }}
              disabled={isDownloading}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isDownloading ? <IosSpinner size="sm" /> : null}
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
            <button onClick={onClose} className={styles.closeBtn}><X size={24} /></button>
          </div>
        </div>

        {hasPrev && (
          <button className={`${styles.navBtn} ${styles.prevBtn}`} onClick={(e) => { e.stopPropagation(); onPrev(); }}>
            <ChevronLeft size={36} />
          </button>
        )}

        <motion.div
          className={fileType === 'pdf' ? styles.contentFull : styles.content}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {fetchError ? (
            <div className={styles.errorContainer}>Unable to preview this file</div>
          ) : !blobUrl ? (
            <ViewerLoader />
          ) : (
            <>
              {fileType === 'image' && <ImageViewer file={currentFile} url={blobUrl} zoom={zoom} />}
              {fileType === 'video' && <VideoViewer file={currentFile} url={blobUrl} />}
              {fileType === 'audio' && <AudioViewer file={currentFile} url={blobUrl} />}
              {fileType === 'pdf' && <PdfViewer file={currentFile} url={blobUrl} zoom={zoom} />}
              {fileType === 'code' && <CodeViewer file={currentFile} url={blobUrl} />}
              {fileType === 'text' && <TextViewer file={currentFile} url={blobUrl} />}
              {fileType === 'office' && <OfficeViewer file={currentFile} url={blobUrl} />}
              {(fileType === 'archive' || fileType === 'unknown') && <UnsupportedViewer file={currentFile} url={blobUrl} fileType={fileType} />}
            </>
          )}
        </motion.div>

        {hasNext && (
          <button className={`${styles.navBtn} ${styles.nextBtn}`} onClick={(e) => { e.stopPropagation(); onNext(); }}>
            <ChevronRight size={36} />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
