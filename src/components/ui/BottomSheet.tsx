"use client";
import React from 'react';
import styles from './bottomsheet.module.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Max height as a vh fraction string, e.g. "85vh". Defaults to "85vh" */
  maxHeight?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '85vh',
}: BottomSheetProps) {
  const [isClosing, setIsClosing] = React.useState(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);

  // Track touch-drag to dismiss
  const dragStartY = React.useRef(0);
  const dragDelta = React.useRef(0);

  const handleClose = React.useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  // Lock body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - dragStartY.current;
    dragDelta.current = delta;
    if (sheetRef.current && delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleTouchEnd = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    // Dismiss if dragged more than 120px down
    if (dragDelta.current > 120) {
      handleClose();
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`}
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
      aria-label={typeof title === 'string' ? title : 'Dialog'}
    >
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${isClosing ? styles.sheetClosing : ''}`}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className={styles.dragHandle} aria-hidden="true">
          <div className={styles.dragBar} />
        </div>

        {/* Header */}
        {title && (
          <div className={styles.header}>
            <div className={styles.title}>{title}</div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleClose}
              aria-label="Close"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </div>
  );
}
