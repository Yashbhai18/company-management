'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface ImageViewerProps {
  file: SlackFileRef;
  url: string;
  zoom: number;
}

export default function ImageViewer({ file, url, zoom }: ImageViewerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Basic pan state (advanced pan would require mousedown/mousemove listeners)
  // For simplicity, we use CSS object-fit contain and let zoom scale it.
  // When zoomed > 1, we could enable overflow: auto on container.

  return (
    <div 
      ref={containerRef}
      className={styles.imageContainer} 
      style={{ overflow: zoom > 1 ? 'auto' : 'hidden' }}
    >
      {hasError ? (
        <div className={styles.errorContainer} style={{ padding: '2rem', color: '#ff6b6b' }}>
          Unable to preview this file
        </div>
      ) : (
        <>
          {!isLoaded && (
            <div className={styles.imagePlaceholder}>
              <div className={styles.spinner} />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.name}
            className={styles.image}
            style={{
              transform: `scale(${zoom})`,
              opacity: isLoaded ? 1 : 0,
              cursor: zoom > 1 ? 'grab' : 'default'
            }}
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(true);
              setHasError(true);
            }}
          />
        </>
      )}
    </div>
  );
}
