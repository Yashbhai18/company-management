'use client';

import React, { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SlackFileRef } from '../../../lib/slackApi';
import styles from './Viewers.module.css';

interface CodeViewerProps {
  file: SlackFileRef;
  url: string;
}

export default function CodeViewer({ file, url }: CodeViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(url)
      .then(res => res.text())
      .then(text => {
        if (active) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load code file:', err);
        if (active) {
          setContent('// Failed to load file content.');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [url]);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'text';
  let language = ext;
  if (['js', 'jsx'].includes(ext)) language = 'javascript';
  if (['ts', 'tsx'].includes(ext)) language = 'typescript';
  if (ext === 'py') language = 'python';
  if (ext === 'rs') language = 'rust';
  if (ext === 'sh') language = 'bash';

  return (
    <div className={styles.codeContainer}>
      {loading ? (
        <div className={styles.imagePlaceholder}>
          <div className={styles.spinner} />
        </div>
      ) : (
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          showLineNumbers
          wrapLines
        >
          {content}
        </SyntaxHighlighter>
      )}
    </div>
  );
}
