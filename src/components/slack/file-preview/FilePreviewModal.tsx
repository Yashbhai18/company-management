'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
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

  // Reset zoom when file changes
  useEffect(() => {
    setZoom(1);
  }, [currentFile?.slackFileId]);

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

  const downloadUrl = currentFile?.urlPrivate
    ? `/api/slack/file/proxy?url=${encodeURIComponent(currentFile.urlPrivate)}`
    : currentFile?.permalink;

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
            <a href={downloadUrl} download={currentFile.name} className={styles.downloadBtn}>Download</a>
            <button onClick={onClose} className={styles.closeBtn}><X size={24} /></button>
          </div>
        </div>

        {hasPrev && (
          <button className={`${styles.navBtn} ${styles.prevBtn}`} onClick={(e) => { e.stopPropagation(); onPrev(); }}>
            <ChevronLeft size={36} />
          </button>
        )}

        <motion.div
          className={styles.content}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {fileType === 'image' && <ImageViewer file={currentFile} url={downloadUrl!} zoom={zoom} />}
          {fileType === 'video' && <VideoViewer file={currentFile} url={downloadUrl!} />}
          {fileType === 'audio' && <AudioViewer file={currentFile} url={downloadUrl!} />}
          {fileType === 'pdf' && <PdfViewer file={currentFile} url={downloadUrl!} zoom={zoom} />}
          {fileType === 'code' && <CodeViewer file={currentFile} url={downloadUrl!} />}
          {fileType === 'text' && <TextViewer file={currentFile} url={downloadUrl!} />}
          {fileType === 'office' && <OfficeViewer file={currentFile} url={downloadUrl!} />}
          {(fileType === 'archive' || fileType === 'unknown') && <UnsupportedViewer file={currentFile} url={downloadUrl!} fileType={fileType} />}
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
