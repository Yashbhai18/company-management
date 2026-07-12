export type PreviewFileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'text'
  | 'office'
  | 'archive'
  | 'unknown';

export function getFileType(filename: string, mimetype: string): PreviewFileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mime = (mimetype || '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';

  const codeExts = [
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'py', 'java',
    'cpp', 'c', 'go', 'rs', 'php', 'sql', 'sh'
  ];
  if (codeExts.includes(ext)) return 'code';

  const textExts = ['txt', 'json', 'md', 'csv', 'xml', 'yaml', 'yml', 'log'];
  if (textExts.includes(ext) || mime.startsWith('text/')) return 'text';

  const officeExts = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
  if (officeExts.includes(ext) || mime.includes('officedocument') || mime.includes('msword') || mime.includes('ms-powerpoint') || mime.includes('ms-excel')) {
    return 'office';
  }

  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
  if (archiveExts.includes(ext) || mime.includes('zip') || mime.includes('tar') || mime.includes('compressed')) {
    return 'archive';
  }

  return 'unknown';
}
