'use client';
import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSlack } from '../../../../hooks/useSlack';
import type { SlackChannel, SlackMessage, SlackUser, SlackReaction, SlackFileRef } from '../../../../lib/slackApi';
import { useFilePreview } from '../../../../components/slack/file-preview/hooks/useFilePreview';
import { FilePreviewModal } from '../../../../components/slack/file-preview/FilePreviewModal';
import { AttachmentCard } from '../../../../components/slack/file-preview/AttachmentCard';
import slackApi from '../../../../lib/slackApi';
import api from '../../../../lib/api';
import styles from './slack.module.css';

// Lucide icons for vector design consistency
import {
  Search,
  Hash,
  Lock,
  Paperclip,
  Smile,
  Send,
  MessageSquare,
  Edit3,
  Trash2,
  X,
  Code,
  AtSign
} from 'lucide-react';
import { IosSpinner } from '../../../../components/ui/IosSpinner';
import { MentionDropdown, MentionUser } from '../../../../components/slack/MentionDropdown';
import { parseSlackMrkdwn, buildUserMap, convertMentionsToSlack, UserMap } from '../../../../lib/parseSlackMrkdwn';

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), {
  ssr: false,
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(ts: string) {
  const ms = parseFloat(ts) * 1000;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: string) {
  const d = new Date(parseFloat(ts) * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function getInitials(name: string) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatRelativeTime(dateInput: any): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileEmoji(mimetype: string): string {
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype.startsWith('video/')) return '🎬';
  if (mimetype.includes('pdf')) return '📄';
  if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
  if (mimetype.includes('sheet') || mimetype.includes('excel')) return '📊';
  if (mimetype.includes('zip') || mimetype.includes('archive')) return '📦';
  return '📎';
}

function formatMemberName(name: string, isMe: boolean) {
  if (!name) return '';
  const cleanName = name.replace(/\(You\)/gi, '').trim();
  if (isMe) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <span>{cleanName}</span>
        <span style={{ fontSize: '11px', color: '#fff', background: 'var(--primary)', padding: '2px 8px', borderRadius: '9999px', fontWeight: '600' }}>You</span>
      </span>
    );
  }
  return <span>{cleanName}</span>;
}

// ── System Message Parser ───────────────────────────────────────────────────────
function isSystemMessage(msg: SlackMessage) {
  if (!msg.text) return false;
  if (msg.files && msg.files.length > 0) return false;
  return /joined|left|archived|renamed|added/i.test(msg.text) && msg.text.includes('<@');
}

function formatSystemMessage(text: string, userMap: UserMap) {
  // System messages also get the full mrkdwn parser
  return parseSlackMrkdwn(text, userMap);
}

// ── Fallback-safe Avatar Component ──────────────────────────────────────────────
function Avatar({ src, name, size = 40, radius = 12 }: { src?: string; name?: string; size?: number; radius?: number }) {
  const [error, setError] = React.useState(false);
  const initials = getInitials(name || 'Unknown');


  const colors = [
    '#ff4f00', // Saturated Orange brand accent
    '#a855f7', // Purple
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#ec4899', // Pink
    '#06b6d4'  // Cyan
  ];
  const charSum = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bgColor = colors[charSum % colors.length];

  if (src && !error) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setError(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: `${radius}px`,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: `${radius}px`,
        background: bgColor,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.35 + 'px',
        userSelect: 'none'
      }}
    >
      {initials}
    </div>
  );
}

// ── SVG Empty States ─────────────────────────────────────────────────────────────
function EmptyState({
  title,
  description,
  iconType,
  action,
}: {
  title: string;
  description: string;
  iconType: 'chat' | 'search';
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={styles.emptyState}>
      <div style={{ marginBottom: '16px', opacity: 0.6 }}>
        {iconType === 'chat' ? (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--primary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641l-.44 1.722 1.722-.44a1.88 1.88 0 0 1 1.641.586A8.96 8.96 0 0 0 12 20.25Z" />
          </svg>
        ) : (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-dark)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
          </svg>
        )}
      </div>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyDesc}>{description}</div>
      {action && (
        <button
          onClick={action.onClick}
          className={styles.connectBtn}
          style={{ marginTop: '16px' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Search Modal ───────────────────────────────────────────────────────────────
function SearchModal({
  channels,
  users,
  onSelectChannel,
  onClose
}: {
  channels: SlackChannel[];
  users: SlackUser[];
  onSelectChannel: (ch: SlackChannel) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const slack = useSlack(); // Get slack context to fix errors

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await slackApi.search(q);
        setResults(res.messages);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredChannels = React.useMemo(() => {
    if (!q.trim()) return [];
    return channels.filter(c =>
      !c.isIm && !c.isMpim && c.displayName?.toLowerCase().includes(q.toLowerCase())
    );
  }, [q, channels]);

  const filteredDMs = React.useMemo(() => {
    if (!q.trim()) return [];
    return channels.filter(c =>
      (c.isIm || c.isMpim) && c.displayName?.toLowerCase().includes(q.toLowerCase())
    );
  }, [q, channels]);

  const filteredMembers = React.useMemo(() => {
    if (!q.trim()) return [];
    return users.filter(u =>
      !u.isBot && !u.isDeleted && u.displayName?.toLowerCase().includes(q.toLowerCase())
    );
  }, [q, users]);

  return (
    <div className={styles.searchOverlay} onClick={onClose}>
      <div className={styles.searchModal} onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '20px', top: '22px', color: 'var(--text-dark)' }} />
          <input
            autoFocus
            className={styles.searchModalInput}
            style={{ paddingLeft: '52px' }}
            placeholder="Search conversations..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className={styles.searchResults}>
          {loading && <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>Searching…</div>}

          {!loading && q && (filteredChannels.length > 0 || filteredDMs.length > 0 || filteredMembers.length > 0 || results.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px' }}>
              {/* Channels */}
              {filteredChannels.length > 0 && (
                <div>
                  <div className={styles.searchSectionHeader}>Channels</div>
                  {filteredChannels.map(ch => (
                    <div key={ch._id} className={styles.searchResultItem} onClick={() => { onSelectChannel(ch); onClose(); }}>
                      <span className={styles.searchResultText}># {ch.displayName}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dark)', marginLeft: 'auto' }}>{ch.memberCount || 0} members</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Direct Messages */}
              {filteredDMs.length > 0 && (
                <div>
                  <div className={styles.searchSectionHeader}>Direct Messages</div>
                  {filteredDMs.map(ch => (
                    <div key={ch._id} className={styles.searchResultItem} onClick={() => { onSelectChannel(ch); onClose(); }}>
                      <span className={styles.searchResultText}>🧑 {ch.displayName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Members */}
              {filteredMembers.length > 0 && (
                <div>
                  <div className={styles.searchSectionHeader}>Workspace Members</div>
                  {filteredMembers.map(u => {
                    const isMe = slack.userSlackUserId === u.slackUserId;
                    const dmCh = channels.find(c => c.isIm && c.dmUserSlackId === u.slackUserId);
                    
                  const handleMemberClick = async () => {
                    if (isMe) return;
                    const dmCh = slack.channels.find(c => c.isIm && c.dmUserSlackId === u.slackUserId);
                    try {
                      if (dmCh) {
                        onSelectChannel(dmCh);
                      } else {
                        const newDm = await slackApi.openDM(u.slackUserId);
                        onSelectChannel(newDm);
                      }
                    } catch (err: any) {
                      const data = err?.response?.data;
                      if (err?.response?.status === 403 && data?.error === 'slack_reconnect_required') {
                        window.alert(data.message || 'Please reconnect your Slack account to use Direct Messages.');
                        return;
                      }
                      console.error('[slack:dm:open] Failed to open DM:', err);
                      window.alert('Failed to initiate Slack Direct Message. Please try again.');
                    } finally {
                      onClose();
                    }
                  };

                    return (
                      <div key={u._id} className={styles.searchResultItem} onClick={handleMemberClick}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '24px', height: '24px', flexShrink: 0 }}>
                            <Avatar src={u.avatar} name={u.displayName || u.name} size={24} radius={12} />
                          </div>
                          <span className={styles.searchResultText}>{u.displayName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Messages */}
              {results.length > 0 && (
                <div>
                  <div className={styles.searchSectionHeader}>Messages</div>
                  {results.map((r, i) => {
                    const ch = channels.find(c => c.slackChannelId === r.channelId);
                    return (
                      <div key={i} className={styles.searchResultItem} onClick={() => { if (ch) { onSelectChannel(ch); } onClose(); }}>
                        <div className={styles.searchResultChannel}>{ch ? ch.displayName : r.channelName}</div>
                        <div className={styles.searchResultText}>{r.text}</div>
                        <div className={styles.searchResultUser}>{r.senderDisplayName}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!loading && q && filteredChannels.length === 0 && filteredDMs.length === 0 && filteredMembers.length === 0 && results.length === 0 && (
            <EmptyState title="No results found" description="No conversations, members, or messages match your query." iconType="search" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Attachment Renderer ────────────────────────────────────────────────────────
function AttachmentRenderer({ file }: { file: SlackFileRef }) {
  const isImage = file.mimetype?.startsWith('image/');
  const isVideo = file.mimetype?.startsWith('video/');
  const isAudio = file.mimetype?.startsWith('audio/');
  const isPdf = file.mimetype === 'application/pdf';

  // Always use the secure backend proxy — never expose Slack private URLs to <img>/<video> tags
  const { apiBaseURL } = require('../../../../lib/api');
  const secureUrl = file.slackFileId
    ? `${apiBaseURL}/slack/files/${file.slackFileId}`
    : file.permalink;

  if (isImage) {
    return (
      <div className={styles.imageAttachment}>
        <a href={file.permalink} target="_blank" rel="noreferrer">
          <img
            src={file.previewUrl || secureUrl}
            alt={file.name}
            title={file.name}
            className={styles.imagePreview}
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={styles.videoAttachment}>
        <video controls className={styles.videoPreview} title={file.name}>
          <source src={secureUrl} type={file.mimetype} />
          Your browser does not support the video tag.
        </video>
        <div className={styles.fileMetaRow}>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className={styles.audioAttachment}>
        <audio controls className={styles.audioPreview} title={file.name}>
          <source src={secureUrl} type={file.mimetype} />
          Your browser does not support the audio element.
        </audio>
        <div className={styles.fileMetaRow}>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
        </div>
      </div>
    );
  }

  // Fallback for PDFs, Docs, etc.
  return (
    <a href={`${secureUrl}?download=1`} target="_blank" rel="noreferrer" className={styles.fileCard}>
      <div className={styles.fileIcon}>
        {isPdf ? '📄' : getFileEmoji(file.mimetype)}
      </div>
      <div className={styles.fileInfo}>
        <div className={styles.fileName}>{file.name}</div>
        <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
      </div>
      <div className={styles.downloadIcon}>⬇️</div>
    </a>
  );
}


// ── Message Row ─────────────────────────────────────────────────────────────────
function MessageRow({
  msg,
  isGrouped = false,
  onReply,
  onEdit,
  onDelete,
  onPreviewFile,
  userConnected,
  users = [],
}: {
  msg: SlackMessage;
  isGrouped?: boolean;
  onReply: (msg: SlackMessage) => void;
  onEdit: (msg: SlackMessage) => void;
  onDelete: (msg: SlackMessage) => void;
  onPreviewFile: (file: SlackFileRef, list: SlackFileRef[]) => void;
  userConnected: boolean;
  users?: SlackUser[];
}) {
  const userMap = React.useMemo(() => buildUserMap(users), [users]);

  if (msg.isDeleted) {
    return (
      <div className={`${styles.messageRow} ${isGrouped ? styles.messageRowGrouped : ''}`}>
        <div className={styles.avatarCol} />
        <div className={styles.messageBody}>
          <span className={styles.deletedMsg}>This message was deleted.</span>
        </div>
      </div>
    );
  }

  // System Message Styling: small, centered pill
  if (isSystemMessage(msg)) {
    return (
      <div className={styles.systemMessageRow}>
        <span className={styles.systemMessageText}>
          {formatSystemMessage(msg.text, userMap)}
        </span>
      </div>
    );
  }

  return (
    <div className={`${styles.messageRow} ${isGrouped ? styles.messageRowGrouped : ''}`}>
      <div className={styles.avatarCol}>
        {isGrouped ? (
          <span className={styles.hoverTime}>{formatTime(msg.slackTs).split(' ')[0]}</span>
        ) : (
          <div className={styles.avatar}>
            <Avatar src={msg.senderAvatar} name={msg.senderDisplayName || 'U'} size={48} radius={12} />
          </div>
        )}
      </div>

      <div className={styles.messageBody}>
        {!isGrouped && (
          <div className={styles.messageHeader}>
            <span className={styles.senderName}>{msg.senderDisplayName || 'Unknown'}</span>
            <span className={styles.messageTime}>{formatTime(msg.slackTs)}</span>
            {msg.isEdited && <span className={styles.editedTag}>(edited)</span>}
          </div>
        )}

        <div className={styles.messageText} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {parseSlackMrkdwn(msg.text, userMap)}
        </div>

        {/* File attachments */}
        {(msg.files || []).length > 0 && (
          <div className={styles.attachmentsContainer}>
            {msg.files!.map((f) => (
              <AttachmentCard key={f.slackFileId} file={f} onClick={(file) => onPreviewFile(file, msg.files || [])} />
            ))}
          </div>
        )}

        {/* Reactions */}
        {(msg.reactions || []).length > 0 && (
          <div className={styles.reactionsBar}>
            {(msg.reactions || []).map((r) => (
              <button key={r.emoji} className={styles.reactionChip} title={(r.userIds || []).join(', ')}>
                {r.emoji} <span className={styles.reactionCount}>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread summary (pill container) */}
        {msg.thread && msg.thread.replyCount > 0 && !msg.isThreadReply && (
          <div className={styles.threadSummaryContainer} onClick={() => onReply(msg)}>
            <span style={{ fontSize: '12px', marginRight: '4px' }}>💬</span>
            <span className={styles.threadSummaryText}>
              {msg.thread.replyCount} {msg.thread.replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <span className={styles.threadSummarySeparator}>•</span>
            <span className={styles.threadSummaryTime}>
              Last reply {formatRelativeTime(msg.thread.lastReplyAt)}
            </span>
          </div>
        )}
        {(!msg.thread || msg.thread.replyCount === 0) && msg.replyCount > 0 && !msg.isThreadReply && (
          <button className={styles.threadBtn} onClick={() => onReply(msg)}>
            <MessageSquare size={14} style={{ marginRight: '4px' }} />
            {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Hover actions */}
      <div className={styles.messageActions}>
        <button className={styles.actionBtn} title="Reply in thread" onClick={() => onReply(msg)}>
          <MessageSquare size={15} />
        </button>
        {userConnected && (
          <>
            <button className={styles.actionBtn} title="Edit" onClick={() => onEdit(msg)}>
              <Edit3 size={15} />
            </button>
            <button className={styles.actionBtn} title="Delete" onClick={() => onDelete(msg)}>
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Composer (White Raised Card) ────────────────────────────────────────────────
function Composer({
  channelId,
  threadTs,
  replyingTo,
  onCancelReply,
  onSend,
  channelMembers,
}: {
  channelId: string;
  threadTs?: string;
  replyingTo?: SlackMessage;
  onCancelReply: () => void;
  onSend: (text: string, files: File[], onProgress?: (p: number) => void) => Promise<void>;
  channelMembers?: MentionUser[];
}) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const mentionStartRef = React.useRef(-1); // index in text where @ was typed
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-grow textarea height
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [text]);

  const handleSend = async () => {
    let trimmed = text.trim();
    if ((!trimmed && selectedFiles.length === 0) || sending) return;
    
    // Convert @DisplayName → <@Uxxx> and @here/@channel/@everyone → <!tag>
    if (channelMembers && channelMembers.length > 0) {
      trimmed = convertMentionsToSlack(trimmed, channelMembers);
    }

    setSending(true);
    setUploadProgress(0);
    try {
      await onSend(trimmed, selectedFiles, (p) => setUploadProgress(p));
      setText('');
      setSelectedFiles([]);
      setUploadProgress(0);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // When mention dropdown is open, let it consume nav keys
    if (mentionQuery !== null) {
      if (['ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) {
        return; // MentionDropdown listens on window with capture=true
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        return; // MentionDropdown will call onSelect via its own keydown listener
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const detectMention = React.useCallback((val: string, cursor: number) => {
    // Walk backwards from cursor to find an unspaced @ symbol
    let i = cursor - 1;
    while (i >= 0 && val[i] !== ' ' && val[i] !== '\n') {
      if (val[i] === '@') {
        // Found @. Allow it only if it's at start of text or preceded by whitespace
        const prev = val[i - 1];
        if (i === 0 || prev === ' ' || prev === '\n') {
          const query = val.slice(i + 1, cursor);
          mentionStartRef.current = i;
          setMentionQuery(query);
          return;
        }
        break;
      }
      i--;
    }
    // No active mention
    mentionStartRef.current = -1;
    setMentionQuery(null);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    detectMention(val, e.target.selectionStart ?? val.length);
  };

  const handleMentionSelect = (user: MentionUser) => {
    const startIdx = mentionStartRef.current;
    if (startIdx === -1 || !textareaRef.current) return;

    const cursor = textareaRef.current.selectionStart;
    const before = text.slice(0, startIdx);        // text before the @
    const after = text.slice(cursor);               // text after current cursor
    const insert = `@${user.displayName} `;
    const newVal = before + insert + after;

    setText(newVal);
    setMentionQuery(null);
    mentionStartRef.current = -1;

    // Restore focus and move cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = startIdx + insert.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEmojiSelect = (emoji: any) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const newVal = currentVal.substring(0, start) + emoji.native + currentVal.substring(end);
    setText(newVal);
    setShowEmojiPicker(false);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.native.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const placeholder = 'Message...';
  const canSend = text.trim().length > 0 || selectedFiles.length > 0;

  return (
    <div className={styles.composerWrap}>
      {mentionQuery !== null && channelMembers && (
        <MentionDropdown
          query={mentionQuery}
          members={channelMembers}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
          anchorRef={textareaRef}
        />
      )}
      {replyingTo && (
        <div className={styles.threadReplyBar}>
          <MessageSquare size={14} />
          <span>Replying to thread</span>
          <button className={styles.cancelReply} onClick={onCancelReply}>
            <X size={20} />
          </button>
        </div>
      )}
      <div className={styles.composerBox}>
        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          placeholder={placeholder}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            // Re-detect mention when cursor moves with arrow keys
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
              const ta = textareaRef.current;
              if (ta) detectMention(ta.value, ta.selectionStart ?? 0);
            }
          }}
          onClick={() => {
            const ta = textareaRef.current;
            if (ta) detectMention(ta.value, ta.selectionStart ?? 0);
          }}
          rows={1}
          disabled={!channelId}
        />

        {/* Attachment Previews */}
        {selectedFiles.length > 0 && (
          <div className={styles.attachmentPreviewContainer}>
            {selectedFiles.map((file, idx) => {
              const isImage = file.type.startsWith('image/');
              return (
                <div key={idx} className={styles.attachmentPreviewCard}>
                  <div className={styles.attachmentPreviewThumb}>
                    {isImage ? (
                      <img src={URL.createObjectURL(file)} alt="" />
                    ) : (
                      <span className={styles.attachmentFileEmoji}>{getFileEmoji(file.type)}</span>
                    )}
                  </div>
                  <div className={styles.attachmentPreviewInfo}>
                    <div className={styles.attachmentPreviewName} title={file.name}>{file.name}</div>
                    <div className={styles.attachmentPreviewSize}>{formatFileSize(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    className={styles.removeAttachmentBtn}
                    onClick={() => removeFile(idx)}
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Upload Progress */}
        {sending && uploadProgress > 0 && selectedFiles.length > 0 && (
          <div style={{ padding: '0 12px 12px' }}>
            <div className={styles.uploadProgressContainer}>
              <div className={styles.uploadProgressBar} style={{ width: `${uploadProgress}%` }} />
              <div className={styles.uploadProgressText}>
                Uploading {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}... {Math.round(uploadProgress)}%
              </div>
            </div>
          </div>
        )}

        <div className={styles.composerActions}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className={styles.composerActionBtn}
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </button>
          
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={styles.composerActionBtn}
              title="Emoji"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile size={16} />
            </button>
            {showEmojiPicker && (
              <div className={styles.emojiPickerPopover}>
                <EmojiPicker
                  data={async () => {
                    const res = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data');
                    return res.json();
                  }}
                  theme="light"
                  onEmojiSelect={handleEmojiSelect}
                  onClickOutside={() => setShowEmojiPicker(false)}
                />
              </div>
            )}
          </div>

          <button type="button" className={styles.composerActionBtn} title="Code snippet" onClick={() => setText(t => t + '```\n\n```')}>
            <Code size={16} />
          </button>
          <button type="button" className={styles.composerActionBtn} title="Mention user" onClick={() => {
            const ta = textareaRef.current;
            const newText = text + '@';
            setText(newText);
            setTimeout(() => {
              if (ta) {
                ta.focus();
                ta.setSelectionRange(newText.length, newText.length);
                detectMention(newText, newText.length);
              }
            }, 0);
          }}>
            <AtSign size={16} />
          </button>

          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!canSend || sending}
            title="Send"
          >
            {sending ? <IosSpinner size="md" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding Card for Unconnected Users ──────────────────────────────────────
function OnboardingCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className={styles.onboardingCard}>
      <div className={styles.onboardingIcon}>💬</div>
      <h3 className={styles.onboardingTitle}>Connect Your Slack Account</h3>
      <p className={styles.onboardingDesc}>
        To send messages through Slack, you must connect your personal Slack account.
      </p>
      <p className={styles.onboardingDescSecondary}>
        Your messages will always be sent using your own Slack identity, ensuring accurate ownership and accountability.
      </p>

      <div className={styles.benefitsSection}>
        <div className={styles.benefitsTitle}>Benefits:</div>
        <ul className={styles.benefitsList}>
          <li>⚡ Real Slack identity</li>
          <li>⚡ Accurate message ownership</li>
          <li>⚡ Better audit trail</li>
          <li>⚡ Secure OAuth authentication</li>
        </ul>
      </div>

      <div className={styles.onboardingActions}>
        <button onClick={onConnect} className={styles.connectBtnUser}>
          ⚡ Connect Slack Account
        </button>
      </div>
    </div>
  );
}

// ── Thread Panel ───────────────────────────────────────────────────────────────
function ThreadPanel({
  channel,
  rootMessage,
  replies,
  onSendReply,
  onClose,
  onPreviewFile,
  userConnected,
  onConnect,
  users,
  channelMembers,
}: {
  channel: SlackChannel;
  rootMessage: SlackMessage;
  replies: SlackMessage[];
  onSendReply: (text: string) => Promise<void>;
  onClose: () => void;
  onPreviewFile: (file: SlackFileRef, list: SlackFileRef[]) => void;
  userConnected: boolean;
  onConnect: () => void;
  users: SlackUser[];
  channelMembers: MentionUser[];
}) {
  return (
    <div className={styles.rightPanel}>
      <div className={styles.rightPanelHeader}>
        <div className={styles.rightPanelTabs}>
          <button className={`${styles.rightPanelTab} ${styles.rightPanelTabActive}`}>Thread</button>
        </div>
        <button className={styles.iconBtn} onClick={onClose} title="Close thread">
          <X size={16} />
        </button>
      </div>
      <div className={styles.rightPanelBody} style={{ position: 'relative' }}>
        <div className={styles.threadRoot}>
          <MessageRow
            msg={rootMessage}
            users={users}
            onReply={() => { }}
            onEdit={() => { }}
            onDelete={() => { }}
            onPreviewFile={onPreviewFile}
            userConnected={userConnected}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-dark)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '16px 0 12px' }}>
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
          {/* Connector timeline indicator */}
          <div className={styles.threadConnectorLine} />
          {replies
            .filter(r => r.slackTs !== rootMessage.slackTs)
            .map((r, index) => {
              const prevReply = index > 0 ? replies.filter(x => x.slackTs !== rootMessage.slackTs)[index - 1] : null;
              const isGrouped = !!(
                prevReply &&
                prevReply.senderSlackUserId === r.senderSlackUserId &&
                !r.isDeleted &&
                !prevReply.isDeleted &&
                (parseFloat(r.slackTs) - parseFloat(prevReply.slackTs)) < 300
              );
              return (
                <MessageRow
                  key={r.slackTs}
                  msg={r}
                  isGrouped={isGrouped}
                  users={users}
                  onReply={() => { }}
                  onEdit={() => { }}
                  onDelete={() => { }}
                  onPreviewFile={onPreviewFile}
                  userConnected={userConnected}
                />
              );
            })}
        </div>
      </div>
      {userConnected ? (
        <Composer
          channelId={channel.slackChannelId}
          threadTs={rootMessage.slackTs}
          replyingTo={rootMessage}
          onCancelReply={onClose}
          onSend={onSendReply}
          channelMembers={channelMembers}
        />
      ) : (
        <OnboardingCard onConnect={onConnect} />
      )}
    </div>
  );
}

// ── Main Slack Page ─────────────────────────────────────────────────────────────
export default function SlackPage() {
  const slack = useSlack();
  const filePreview = useFilePreview();
  const [activeChannel, setActiveChannel] = React.useState<SlackChannel | null>(null);
  const [activeThread, setActiveThread] = React.useState<SlackMessage | null>(null);
  const [showSearch, setShowSearch] = React.useState(false);
  const [botsExpanded, setBotsExpanded] = React.useState(false);
  const [reconnectPrompt, setReconnectPrompt] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const prevChannelRef = React.useRef<string | null>(null);

  /** Returns true when an API error is a DM scope/reconnect error */
  const isDmScopeError = (err: any): boolean => {
    const data = err?.response?.data;
    return (
      err?.response?.status === 403 &&
      (data?.error === 'slack_reconnect_required' || data?.code === 'slack_reconnect_required')
    );
  };

  // Dynamic layout overrides to prevent browser scrolling and layout shifting
  React.useEffect(() => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      const originalOverflow = mainElement.style.overflow;
      const originalPadding = mainElement.style.padding;
      
      mainElement.style.overflow = 'hidden';
      mainElement.style.padding = '0';
      
      return () => {
        mainElement.style.overflow = originalOverflow;
        mainElement.style.padding = originalPadding;
      };
    }
  }, []);

  // Keyboard shortcut listener for closing thread panel via ESC
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveThread(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Sort members: Current user ("You"), online, offline, alphabetically
  const sortedMembers = React.useMemo(() => {
    const meSlackUserId = slack.userSlackUserId;

    return [...slack.users]
      .filter(u => !u.isDeleted && !u.isBot) // Hide deactivated/deleted accounts, bots in main list
      .sort((a, b) => {
        const aIsMe = a.slackUserId === meSlackUserId;
        const bIsMe = b.slackUserId === meSlackUserId;
        if (aIsMe && !bIsMe) return -1;
        if (bIsMe && !aIsMe) return 1;

        const aPresence = slack.presenceMap[a.slackUserId] || a.presence;
        const bPresence = slack.presenceMap[b.slackUserId] || b.presence;
        const aOnline = aPresence === 'active';
        const bOnline = bPresence === 'active';

        if (aOnline && !bOnline) return -1;
        if (bOnline && !aOnline) return 1;

        const aName = (a.displayName || a.name || '').toLowerCase();
        const bName = (b.displayName || b.name || '').toLowerCase();
        return aName.localeCompare(bName);
      });
  }, [slack.users, slack.presenceMap, slack.userSlackUserId]);

  const botsList = React.useMemo(() => {
    return slack.users
      .filter(u => !u.isDeleted && u.isBot)
      .sort((a, b) => {
        const aName = (a.displayName || a.name || '').toLowerCase();
        const bName = (b.displayName || b.name || '').toLowerCase();
        return aName.localeCompare(bName);
      });
  }, [slack.users]);

  // Auto-select first channel
  React.useEffect(() => {
    if (!activeChannel && slack.channels.length > 0 && !slack.loading) {
      const first = slack.channels.find(c => !c.isIm && !c.isMpim && !c.isArchived);
      if (first) setActiveChannel(first);
    }
  }, [slack.channels, slack.loading, activeChannel]);

  // Load messages when channel changes
  React.useEffect(() => {
    if (!activeChannel) return;
    if (prevChannelRef.current !== activeChannel.slackChannelId) {
      prevChannelRef.current = activeChannel.slackChannelId;
      slack.joinChannel(activeChannel.slackChannelId);
      if (!slack.messages[activeChannel.slackChannelId]?.length) {
        slack.loadMessages(activeChannel.slackChannelId);
      }
    }
  }, [activeChannel, slack]);

  // Build mention members list from already-loaded slack.users
  const channelMembers = React.useMemo<MentionUser[]>(() => {
    return slack.users
      .filter(u => !u.isDeleted)
      .map(u => ({
        slackUserId: u.slackUserId,
        displayName: u.displayName || u.name || u.slackUserId,
        realName: u.name || '',
        avatar: u.avatar || '',
        isBot: !!u.isBot,
      }));
  }, [slack.users]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [slack.messages, activeChannel?.slackChannelId]);

  // Thread reply action
  const handleSendReply = React.useCallback(async (text: string, files?: File[]) => {
    if (!activeChannel || !activeThread) return;
    try {
      await slack.sendMessage(activeChannel.slackChannelId, text, activeThread.slackTs, files);
    } catch (err: any) {
      console.error('[slack:sendReply] Failed to send reply:', err);
      if (isDmScopeError(err)) {
        setReconnectPrompt(err.response.data.message || 'Please reconnect your Slack account to send Direct Messages.');
        return;
      }
      const data = err.response?.data || {};
      const errMsg = data.message || data.slackError || 'Failed to send reply to Slack.';
      window.alert(errMsg);
    }
  }, [activeChannel, activeThread, slack]);

  const handleSend = React.useCallback(async (text: string, files?: File[]) => {
    if (!activeChannel) return;
    try {
      await slack.sendMessage(activeChannel.slackChannelId, text, undefined, files);
    } catch (err: any) {
      console.error('[slack:send] Failed to send message:', err);
      if (isDmScopeError(err)) {
        setReconnectPrompt(err.response.data.message || 'Please reconnect your Slack account to send Direct Messages.');
        return;
      }
      const data = err.response?.data || {};
      const errMsg = data.message || data.slackError || 'Failed to send message to Slack.';
      window.alert(errMsg);
    }
  }, [activeChannel, slack]);

  const handleConnectSlack = React.useCallback(async () => {
    try {
      const res = await api.get('/slack/user/connect');
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      window.alert('Failed to connect Slack account. Please try again.');
    }
  }, []);

  // Keyboard shortcut for search
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Not connected ────────────────────────────────────────────────────────────
  if (!slack.loading && !slack.connected) {
    return (
      <div className={`${styles.slackLayout} ${activeThread ? styles.slackLayoutThreadOpen : ""}`}>
        <div className={styles.connectOverlay}>
          <div className={styles.slackLogo}>🔗</div>
          <div className={styles.emptyTitle}>Connect your Slack workspace</div>
          <div className={styles.emptyDesc}>
            Link your Slack workspace to communicate with your team without leaving this application.
            Messages are fully synchronized — real time, both ways.
          </div>
          <Link href="/settings/slack" className={styles.connectBtn}>
            ⚡ Connect Slack Workspace
          </Link>
        </div>
      </div>
    );
  }

  const messages = activeChannel ? (slack.messages[activeChannel.slackChannelId] || []) : [];
  const threadReplies = activeThread ? (slack.threads[activeThread.slackTs] || []) : [];
  const typingUsers = activeChannel ? (slack.typingMap[activeChannel.slackChannelId] || []) : [];

  const publicChannels = slack.channels.filter(c => !c.isIm && !c.isMpim && !c.isArchived);
  const dms = slack.channels.filter(c => (c.isIm || c.isMpim) && !c.isArchived);

  // Group messages by date
  const groupedMessages: { date: string; msgs: SlackMessage[] }[] = [];
  let lastDate = '';
  messages.forEach(m => {
    const d = formatDate(m.slackTs);
    if (d !== lastDate) {
      groupedMessages.push({ date: d, msgs: [] });
      lastDate = d;
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(m);
  });

  return (
    <>
      {showSearch && (
        <SearchModal
          channels={slack.channels}
          users={slack.users}
          onSelectChannel={setActiveChannel}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* ── Reconnect Prompt Banner ─────────────────────────────────────── */}
      {reconnectPrompt && (
        <div style={{
          position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#fff3cd', border: '1px solid #ffc107',
          borderRadius: '12px', padding: '14px 20px', display: 'flex',
          alignItems: 'center', gap: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          maxWidth: '600px', width: '90%'
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <span style={{ flex: 1, fontSize: '13px', color: '#856404', fontWeight: 500 }}>
            {reconnectPrompt}
          </span>
          <button
            onClick={handleConnectSlack}
            style={{
              background: 'var(--primary)', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            Reconnect Slack
          </button>
          <button
            onClick={() => setReconnectPrompt(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#856404', padding: '0 4px' }}
            title="Dismiss"
          >×</button>
        </div>
      )}

      <div className={`${styles.slackLayout} ${activeThread ? styles.slackLayoutThreadOpen : ""}`}>
        {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className={styles.workspaceHeader}>
            <div className={styles.workspaceLogo}>
              {slack.teamName ? slack.teamName[0].toUpperCase() : 'S'}
            </div>
            <div className={styles.workspaceName}>{slack.teamName || 'Slack'}</div>
          </div>

          <div className={styles.sidebarSearch}>
            <div className={styles.searchInputWrap} onClick={() => setShowSearch(true)} role="button" tabIndex={0}>
              <Search size={16} className={styles.searchIcon} />
              <span className={styles.searchPlaceholder}>Search conversations...</span>
            </div>
          </div>

          <div className={styles.sidebarScroll}>
            {/* ── Loading skeleton ──────────────────── */}
            {slack.loading && (
              <>
                <div className={styles.sectionLabel}>Channels</div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={styles.skeletonRow} style={{ padding: '4px 10px' }}>
                    <div className={styles.skeleton} style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0 }} />
                    <div className={styles.skeleton} style={{ width: '60%', height: '14px' }} />
                  </div>
                ))}
              </>
            )}

            {/* ── Channels ──────────────────────────── */}
            {!slack.loading && publicChannels.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Channels</div>
                {publicChannels.map(ch => (
                  <div
                    key={ch._id}
                    className={`${styles.channelItem} ${activeChannel?.slackChannelId === ch.slackChannelId ? styles.channelItemActive : ''}`}
                    onClick={() => { setActiveChannel(ch); setActiveThread(null); }}
                  >
                    {ch.isPrivate ? (
                      <Lock size={14} className={styles.channelPrefix} />
                    ) : (
                      <Hash size={14} className={styles.channelPrefix} />
                    )}
                    <span className={styles.channelName}>{ch.displayName}</span>
                    {ch.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>{ch.unreadCount > 99 ? '99+' : ch.unreadCount}</span>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* ── Divider ───────────────────────────── */}
            {!slack.loading && <div className={styles.convDivider} />}

            {/* ── Direct Messages ───────────────────── */}
            {!slack.loading && (
              <>
                <div className={styles.sectionLabel}>Direct Messages</div>
                {dms.length > 0 ? dms.map(ch => (
                  <div
                    key={ch._id}
                    className={`${styles.channelItem} ${activeChannel?.slackChannelId === ch.slackChannelId ? styles.channelItemActive : ''}`}
                    onClick={async () => {
                      if (!ch.slackChannelId && ch.dmUserSlackId) {
                        try {
                          const newDm = await slackApi.openDM(ch.dmUserSlackId);
                          setActiveChannel(newDm);
                          setActiveThread(null);
                        } catch (err: any) {
                          const data = err?.response?.data;
                          if (err?.response?.status === 403 && data?.error === 'slack_reconnect_required') {
                            window.alert(data.message || 'Please reconnect your Slack account to use Direct Messages.');
                            return;
                          }
                          console.error('[slack:dm:open] Failed to open DM:', err);
                          window.alert('Failed to initiate Slack Direct Message. Please try again.');
                        }
                      } else {
                        setActiveChannel(ch);
                        setActiveThread(null);
                      }
                    }}
                  >
                    <div className={styles.dmAvatarWrap}>
                      <Avatar src={ch.avatar} name={ch.displayName || 'DM'} size={28} radius={8} />
                      <span
                        className={`${styles.presenceDot} ${
                          ch.presence === 'active' ? styles.presenceActive :
                          ch.presence === 'away'   ? styles.presenceAway   :
                          styles.presenceOffline
                        }`}
                      />
                    </div>
                    <span className={styles.channelName}>{ch.displayName || 'Direct Message'}</span>
                    {ch.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>{ch.unreadCount}</span>
                    )}
                  </div>
                )) : (
                  <div style={{ padding: '4px 10px 6px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Click a member in search to start a DM
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Center Panel ────────────────────────────────────────────────── */}
        <div className={styles.centerPanel}>
          {activeChannel ? (
            <>


              {/* Channel header */}
              <div className={styles.channelHeader}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!activeChannel.isIm && !activeChannel.isMpim && (
                      activeChannel.isPrivate
                        ? <Lock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <Hash size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                    <span className={styles.channelHeaderName}>
                      {activeChannel.displayName}
                    </span>
                  </div>
                  {activeChannel.topic && (
                    <span className={styles.channelHeaderTopic}>{activeChannel.topic}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginRight: '8px' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    backgroundColor: slack.userConnected ? '#10b981' : '#f59e0b',
                    display: 'inline-block', flexShrink: 0
                  }} />
                  <span style={{ color: 'var(--text-muted)' }}>
                    {slack.userConnected ? 'Slack Active' : 'Fallback Mode'}
                  </span>
                </div>
                <div className={styles.headerActions}>
                  <button className={styles.iconBtn} title="Search (⌘K)" onClick={() => setShowSearch(true)}>
                    <Search size={15} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className={styles.messageList}>
                {slack.loading && messages.length === 0 && (
                  [...Array(6)].map((_, i) => (
                    <div key={i} className={styles.skeletonRow} style={{ gap: '14px', padding: '8px 0' }}>
                      <div className={styles.skeleton} style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className={styles.skeleton} style={{ width: '140px', height: '14px' }} />
                        <div className={styles.skeleton} style={{ width: '85%', height: '14px' }} />
                      </div>
                    </div>
                  ))
                )}

                {messages.length === 0 && !slack.loading && (
                  <EmptyState title="Start the conversation" description="Send a message to sync with this Slack channel." iconType="chat" />
                )}

                {groupedMessages.map(group => (
                  <React.Fragment key={group.date}>
                    <div className={styles.dateDivider}>{group.date}</div>
                    {group.msgs.map((msg, index) => {
                      const prevMsg = index > 0 ? group.msgs[index - 1] : null;
                      const isGrouped = !!(
                        prevMsg &&
                        prevMsg.senderSlackUserId === msg.senderSlackUserId &&
                        !msg.isDeleted &&
                        !prevMsg.isDeleted &&
                        (parseFloat(msg.slackTs) - parseFloat(prevMsg.slackTs)) < 300 // 5 minutes in seconds
                      );
                      return (
                        <MessageRow
                          key={msg.slackTs}
                          msg={msg}
                          isGrouped={isGrouped}
                          userConnected={slack.userConnected}
                          users={slack.users}
                          onPreviewFile={filePreview.openPreview}
                          onReply={(m) => {
                            setActiveThread(m);
                            slack.loadThread(activeChannel.slackChannelId, m.slackTs);
                          }}
                          onEdit={(m) => {
                            if (!slack.userConnected) return;
                            const newText = prompt('Edit message:', m.text);
                            if (newText && newText !== m.text) {
                              slack.editMessage(activeChannel.slackChannelId, m.slackTs, newText);
                            }
                          }}
                          onDelete={(m) => {
                            if (!slack.userConnected) return;
                            if (confirm('Delete this message?')) {
                              slack.deleteMessage(activeChannel.slackChannelId, m.slackTs);
                            }
                          }}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}

                <div ref={bottomRef} />
              </div>

              {/* Typing indicator */}
              <div className={styles.typingIndicator}>
                {typingUsers.length > 0 && (
                  <>
                    <span className={styles.typingDots}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                    </span>
                    <span>
                      <strong>{typingUsers.slice(0, 2).join(', ')}</strong>
                      {typingUsers.length > 2 ? ` and ${typingUsers.length - 2} others` : ''}
                      {' '}{typingUsers.length === 1 ? 'is' : 'are'} typing…
                    </span>
                  </>
                )}
              </div>

              {/* Composer */}
              {slack.userConnected ? (
                <Composer
                  channelId={activeChannel.slackChannelId}
                  onCancelReply={() => setActiveThread(null)}
                  onSend={handleSend}
                  channelMembers={channelMembers}
                />
              ) : (
                <OnboardingCard onConnect={handleConnectSlack} />
              )}
            </>
          ) : (
            <EmptyState
              title="Select a conversation"
              description="Choose a Slack conversation to start collaborating."
              iconType="chat"
              action={{
                label: "Browse Channels",
                onClick: () => setShowSearch(true)
              }}
            />
          )}
        </div>

        {/* ── Thread Panel ─────────────────────────────────────────────── */}
        {activeThread && activeChannel && (
          <ThreadPanel
            channel={activeChannel}
            rootMessage={activeThread}
            replies={threadReplies}
            onSendReply={handleSendReply}
            onClose={() => setActiveThread(null)}
            onPreviewFile={filePreview.openPreview}
            userConnected={slack.userConnected}
            onConnect={handleConnectSlack}
            users={slack.users}
            channelMembers={channelMembers}
          />
        )}
      </div>
      
      <FilePreviewModal
        isOpen={filePreview.isOpen}
        currentFile={filePreview.currentFile}
        onClose={filePreview.closePreview}
        onNext={filePreview.nextFile}
        onPrev={filePreview.prevFile}
        hasNext={filePreview.hasNext}
        hasPrev={filePreview.hasPrev}
      />
    </>
  );
}
