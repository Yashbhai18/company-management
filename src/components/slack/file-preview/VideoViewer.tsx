'use client';

import React from 'react';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface VideoViewerProps {
  file: SlackFileRef;
  url: string;
}

export default function VideoViewer({ url }: VideoViewerProps) {
  return (
    <video 
      src={url} 
      controls 
      autoPlay 
      className={styles.video}
      controlsList="nodownload"
    />
  );
}
