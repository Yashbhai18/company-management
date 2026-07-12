import { useState, useCallback } from 'react';
import { SlackFileRef } from '../../../../lib/slackApi';

export interface FilePreviewState {
  isOpen: boolean;
  currentFile: SlackFileRef | null;
  fileList: SlackFileRef[];
  currentIndex: number;
}

export function useFilePreview() {
  const [state, setState] = useState<FilePreviewState>({
    isOpen: false,
    currentFile: null,
    fileList: [],
    currentIndex: -1,
  });

  const openPreview = useCallback((file: SlackFileRef, list: SlackFileRef[] = []) => {
    const safeList = list.length > 0 ? list : [file];
    const index = safeList.findIndex((f) => f.slackFileId === file.slackFileId);
    setState({
      isOpen: true,
      currentFile: file,
      fileList: safeList,
      currentIndex: index >= 0 ? index : 0,
    });
  }, []);

  const closePreview = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false, currentFile: null }));
  }, []);

  const nextFile = useCallback(() => {
    setState((s) => {
      if (s.currentIndex >= s.fileList.length - 1) return s;
      const nextIdx = s.currentIndex + 1;
      return { ...s, currentIndex: nextIdx, currentFile: s.fileList[nextIdx] };
    });
  }, []);

  const prevFile = useCallback(() => {
    setState((s) => {
      if (s.currentIndex <= 0) return s;
      const prevIdx = s.currentIndex - 1;
      return { ...s, currentIndex: prevIdx, currentFile: s.fileList[prevIdx] };
    });
  }, []);

  return {
    ...state,
    openPreview,
    closePreview,
    nextFile,
    prevFile,
    hasNext: state.currentIndex < state.fileList.length - 1,
    hasPrev: state.currentIndex > 0,
  };
}
