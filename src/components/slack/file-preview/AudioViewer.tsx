'use client';

import React from 'react';
import { Music } from 'lucide-react';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface AudioViewerProps {
  file: SlackFileRef;
  url: string;
}

export default function AudioViewer({ file, url }: AudioViewerProps) {
  return (
    <div className={styles.audioContainer}>
      <Music size={64} className={styles.audioIcon} />
      <h3>{file.name}</h3>
      <audio 
        src={url} 
        controls 
        autoPlay 
        className={styles.audio}
        controlsList="nodownload"
      />
    </div>
  );
}
