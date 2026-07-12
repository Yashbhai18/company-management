'use client';

import React from 'react';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface OfficeViewerProps {
  file: SlackFileRef;
  url: string;
}

export default function OfficeViewer({ file, url }: OfficeViewerProps) {
  // Office Online Viewer needs a public URL.
  // We try to pass our URL, but it might fail if it's a proxy url that requires auth.
  // In a real production environment, you might need to generate a temporary public signed URL.
  
  // To avoid breaking the viewer, we only attempt if url doesn't look like a local proxy requiring auth.
  // Assuming our downloadUrl might be a proxy: `/api/slack/file/proxy?url=...`
  // We can't really pass that to Microsoft. If we have a permalink or public url, we'd use that.
  
  // For the sake of this implementation, we will try to pass the raw url. 
  // If it's a proxy url, we construct a fully qualified absolute URL.
  let viewerUrl = url;
  if (url.startsWith('/')) {
    viewerUrl = window.location.origin + url;
  }

  const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerUrl)}`;

  return (
    <div className={styles.officeContainer}>
      <iframe 
        src={officeUrl} 
        className={styles.officeFrame} 
        title={file.name}
      />
    </div>
  );
}
