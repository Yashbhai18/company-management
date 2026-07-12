import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileArchive,
  FileBox,
  FileSpreadsheet,
  File,
  LucideIcon
} from 'lucide-react';
import { PreviewFileType } from './getFileType';

export function getMimeIcon(type: PreviewFileType): LucideIcon {
  switch (type) {
    case 'image':
      return FileImage;
    case 'video':
      return FileVideo;
    case 'audio':
      return FileAudio;
    case 'pdf':
      return FileText; // or a custom PDF icon if preferred
    case 'code':
      return FileCode;
    case 'text':
      return FileText;
    case 'office':
      return FileSpreadsheet; // generalized office icon
    case 'archive':
      return FileArchive;
    default:
      return File;
  }
}
