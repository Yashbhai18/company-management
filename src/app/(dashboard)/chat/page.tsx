"use client";
import React from 'react';
import api from '../../../lib/api';
import { useSocket } from '../../../hooks/useSocket';
import styles from './chat.module.css';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Member {
  _id: string;
  name: string;
  username?: string;
  avatar?: string;
  role: string;
}

interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'org_chat' | 'dm';
  mentions: string[];
  mentionAll: boolean;
  createdAt: string;
  parentId?: string;
  replyToId?: ChatMessage; // Populated referenced message
  isForwarded?: boolean;
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  threadCount?: number;
}

interface Conversation {
  _id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: string;
  otherUser?: { _id: string; name: string; avatar?: string };
  unreadCount: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

/** Render message content with @mention highlighting and clickable links */
function renderContent(content: string) {
  // Capture mentions OR full URLs (starting with http://, https://, or www.)
  const regex = /((?:https?:\/\/|www\.)[^\s]+|@[a-zA-Z0-9_]+)/g;
  const parts = content.split(regex);

  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith('@')) {
      return <span key={i} className={styles.mention}>{part}</span>;
    }

    const isUrl = part.startsWith('http://') || part.startsWith('https://') || part.startsWith('www.');
    if (isUrl) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={styles.chatLink}
        >
          {part}
        </a>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

/* ─── @Mention autocomplete ─────────────────────────────────────────────── */
function MentionPopup({ members, onSelect, popupRef }: { members: Member[]; onSelect: (tag: string) => void, popupRef: React.RefObject<HTMLDivElement | null> }) {
  if (!members.length) return null;
  return (
    <div className={styles.mentionPopup} ref={popupRef}>
      <div className={styles.mentionItem} onClick={() => onSelect('all')}>
        <span className={styles.mentionAll}>@all</span>
        <span className={styles.mentionDesc}>Notify everyone</span>
      </div>
      {members.map((m) => {
        // Use explicit username tag, fallback to lowercased spaced name if legacy
        const tag = m.username || m.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
        return (
          <div key={m._id} className={styles.mentionItem} onClick={() => onSelect(tag)}>
            <div className={styles.mentionAvatar}>{getInitials(m.name)}</div>
            <div className={styles.mentionText}>
              <span className={styles.mentionName}>{m.name}</span>
              <span className={styles.mentionTag}>@{tag}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function ChatPage() {
  const socket = useSocket();
  const [me, setMe] = React.useState<any>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);

  // Which view: 'org' or a member's userId (for DM)
  const [view, setView] = React.useState<'org' | string>('org');
  const [orgMessages, setOrgMessages] = React.useState<ChatMessage[]>([]);
  // Map of conversationId → messages for DMs
  const [dmMessages, setDmMessages] = React.useState<Record<string, ChatMessage[]>>({});
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);

  const [input, setInput] = React.useState('');
  const [mentionQuery, setMentionQuery] = React.useState('');
  const [showMentionPopup, setShowMentionPopup] = React.useState(false);
  const [filteredMembers, setFilteredMembers] = React.useState<Member[]>([]);

  // Advanced Chat Features states
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [activeThread, setActiveThread] = React.useState<{ parent: ChatMessage; replies: ChatMessage[] } | null>(null);
  const [activeThreadInput, setActiveThreadInput] = React.useState('');
  const [showEmojiPanel, setShowEmojiPanel] = React.useState(false);
  const [showThreadEmojiPanel, setShowThreadEmojiPanel] = React.useState(false);
  const [forwardMessage, setForwardMessage] = React.useState<ChatMessage | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = React.useState<string | null>(null);

  // REFS for click-outside closing
  const emojiPanelRef = React.useRef<HTMLDivElement>(null);
  const threadEmojiPanelRef = React.useRef<HTMLDivElement>(null);
  const reactionPickerRef = React.useRef<HTMLDivElement>(null);
  const mentionPopupRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (showEmojiPanel && emojiPanelRef.current && !emojiPanelRef.current.contains(target)) {
        // Also check if the click was on the trigger button (to avoid immediate re-toggle)
        if (!(target instanceof Element && target.closest(`.${styles.emojiTriggerBtn}`))) {
          setShowEmojiPanel(false);
        }
      }
      if (showThreadEmojiPanel && threadEmojiPanelRef.current && !threadEmojiPanelRef.current.contains(target)) {
        if (!(target instanceof Element && target.closest(`.${styles.emojiTriggerBtn}`))) {
          setShowThreadEmojiPanel(false);
        }
      }
      if (activeReactionMessageId && reactionPickerRef.current && !reactionPickerRef.current.contains(target)) {
        // Check if click was on the ➕ button
        if (!(target instanceof Element && target.closest(`[title="More reactions"]`))) {
          setActiveReactionMessageId(null);
        }
      }
      if (showMentionPopup && mentionPopupRef.current && !mentionPopupRef.current.contains(target)) {
        setShowMentionPopup(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPanel, showThreadEmojiPanel, activeReactionMessageId, showMentionPopup]);

  // Scrolling management for thread sidebars
  const threadBottomRef = React.useRef<HTMLDivElement>(null);

  // Scroll to thread bottom whenever replies populate
  React.useEffect(() => {
    if (activeThread) {
      threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.replies]);

  // Typing indicators matrix
  const [typingState, setTypingState] = React.useState<Record<string, { userId: string; userName: string }[]>>({});
  const isTypingRef = React.useRef(false);
  const typingTimeoutRef = React.useRef<any>(null);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const threadInputRef = React.useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages arrive or people type
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [orgMessages, dmMessages, activeConvId, typingState]);

  // Load current user + members
  React.useEffect(() => {
    api.get('/auth/me').then((r) => setMe(r.data.user)).catch(() => {});
    api.get('/chat/members').then((r) => setMembers(r.data)).catch(() => {});
    api.get('/chat/conversations').then((r) => setConversations(r.data)).catch(() => {});
  }, []);

  // Handle URL params (?view=org or ?dm=userId)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dm = params.get('dm');
    const viewParam = params.get('view');
    if (dm) openDm(dm);
    else if (viewParam === 'org') setView('org');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatically reset and stop typing indicators whenever changing chat rooms
  React.useEffect(() => {
    return () => {
      if (socket && isTypingRef.current) {
        socket.emit('chat:typing', { isTyping: false, targetView: view });
        isTypingRef.current = false;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [view, socket]);

  // Socket event listeners
  React.useEffect(() => {
    if (!socket) return;

    socket.emit('chat:load_history_org');

    socket.on('chat:history_org', (msgs: ChatMessage[]) => {
      setOrgMessages(msgs);
    });

    socket.on('chat:org_message', (msg: ChatMessage) => {
      if (msg.parentId) {
        setActiveThread(prev => {
          if (prev && prev.parent._id === msg.parentId) {
            if (prev.replies.some(r => r._id === msg._id)) return prev;
            return { ...prev, replies: [...prev.replies, msg] };
          }
          return prev;
        });
      } else {
        setOrgMessages((prev) => [...prev, msg]);
      }
    });

    socket.on('chat:message_updated', (updatedMsg: ChatMessage) => {
      // Broadcast localized modifications (reactions) to all states in viewport!
      setOrgMessages(prev => prev.map(m => m._id === updatedMsg._id ? { ...m, ...updatedMsg } : m));
      
      setDmMessages(prev => {
        const next = { ...prev };
        for (const cId in next) {
          next[cId] = next[cId].map(m => m._id === updatedMsg._id ? { ...m, ...updatedMsg } : m);
        }
        return next;
      });

      setActiveThread(prev => {
        if (!prev) return null;
        if (prev.parent._id === updatedMsg._id) return { ...prev, parent: { ...prev.parent, ...updatedMsg } };
        return {
          ...prev,
          replies: prev.replies.map(r => r._id === updatedMsg._id ? { ...r, ...updatedMsg } : r)
        };
      });
    });

    socket.on('chat:thread_history', ({ parent, replies }: { parent: ChatMessage; replies: ChatMessage[] }) => {
      setActiveThread({ parent, replies });
    });

    socket.on('chat:thread_count_updated', ({ parentId, threadCount }: { parentId: string; threadCount: number }) => {
      setOrgMessages(prev => prev.map(m => m._id === parentId ? { ...m, threadCount } : m));
      setDmMessages(prev => {
        const next = { ...prev };
        for (const cId in next) {
          next[cId] = next[cId].map(m => m._id === parentId ? { ...m, threadCount } : m);
        }
        return next;
      });
    });

    socket.on('chat:history_dm', ({ conversationId, messages }: { conversationId: string; messages: ChatMessage[] }) => {
      setDmMessages((prev) => ({ ...prev, [conversationId]: messages }));
      setActiveConvId(conversationId);
    });

    socket.on('chat:dm_message', ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
      if (message.parentId) {
        // Delivery of a thread message: Update active thread if focused, ignore main timeline insert!
        setActiveThread(prev => {
          if (prev && prev.parent._id === message.parentId) {
            // Prevent duplicates just in case of concurrent events
            if (prev.replies.some(r => r._id === message._id)) return prev;
            return { ...prev, replies: [...prev.replies, message] };
          }
          return prev;
        });
      } else {
        setDmMessages((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []).filter(m => m._id !== message._id), message],
        }));
      }
      // Update conversation preview
      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId
            ? { ...c, lastMessage: message.isForwarded ? 'Forwarded message' : message.content, lastMessageAt: message.createdAt, unreadCount: view === conversationId ? 0 : c.unreadCount + 1 }
            : c
        )
      );
    });

    socket.on('chat:typing_update', ({ userId, userName, isTyping, view: targetView }: { userId: string; userName: string; isTyping: boolean; view: string }) => {
      setTypingState((prev) => {
        const list = prev[targetView] || [];
        if (isTyping) {
          if (list.some((u) => u.userId === userId)) return prev;
          return { ...prev, [targetView]: [...list, { userId, userName }] };
        } else {
          return { ...prev, [targetView]: list.filter((u) => u.userId !== userId) };
        }
      });
    });

    return () => {
      socket.off('chat:history_org');
      socket.off('chat:org_message');
      socket.off('chat:history_dm');
      socket.off('chat:dm_message');
      socket.off('chat:typing_update');
      socket.off('chat:message_updated');
      socket.off('chat:thread_history');
      socket.off('chat:thread_count_updated');
    };
  }, [socket, view]);

  // Open DM with a member
  const openDm = async (memberId: string) => {
    setView(memberId);
    // Load via REST first
    try {
      const res = await api.get(`/chat/dm/${memberId}`);
      const { conversationId, messages } = res.data;
      if (conversationId) {
        setDmMessages((prev) => ({ ...prev, [conversationId]: messages }));
        setActiveConvId(conversationId);
        // Also via socket to mark read
        socket?.emit('chat:load_history_dm', { conversationId });
      } else {
        setActiveConvId(null);
        setDmMessages({});
      }
      // Update unread count locally
      setConversations((prev) =>
        prev.map((c) => {
          const otherParticipant = c.otherUser?._id;
          return otherParticipant === memberId ? { ...c, unreadCount: 0 } : c;
        })
      );
    } catch {}
  };

  // @Mention input handling
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Socket.IO Typing Indicator Logic
    if (socket) {
      if (!isTypingRef.current && val.trim().length > 0) {
        isTypingRef.current = true;
        socket.emit('chat:typing', { isTyping: true, targetView: view });
      }
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit('chat:typing', { isTyping: false, targetView: view });
      }, 3000);
    }

    // Detect @ trigger at cursor
    const cursor = e.target.selectionStart;
    const textUpToCursor = val.slice(0, cursor);
    const atMatch = textUpToCursor.match(/@([a-zA-Z0-9_]*)$/); // Capture trailing chars
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      setMentionQuery(query);
      setFilteredMembers(
        members.filter((m) => {
          const normalizedTag = (m.username || m.name).toLowerCase();
          return normalizedTag.includes(query) || m.name.toLowerCase().includes(query);
        })
      );
      setShowMentionPopup(true);
    } else {
      setShowMentionPopup(false);
    }
  };

  const selectMention = (tag: string) => {
    // Replace partial @query up to current typing position
    const atPos = input.lastIndexOf('@');
    const newInput = input.slice(0, atPos) + `@${tag} `;
    setInput(newInput);
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  // Advanced Feature Actions
  const reactToMessage = (messageId: string, emoji: string) => {
    socket?.emit('chat:react', { messageId, emoji });
  };

  const initiateReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const initiateThread = (msg: ChatMessage) => {
    setActiveThread({ parent: msg, replies: [] });
    socket?.emit('chat:load_thread', { messageId: msg._id });
  };

  const replyPrivate = (msg: ChatMessage) => {
    if (msg.senderId === me?._id) return;
    openDm(msg.senderId);
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleForwardSelect = (targetId: string, targetType: 'org' | 'dm') => {
    if (!forwardMessage || !socket) return;

    if (targetType === 'org') {
      socket.emit('chat:send_org', { content: forwardMessage.content, isForwarded: true });
    } else {
      socket.emit('chat:send_dm', { recipientId: targetId, content: forwardMessage.content, isForwarded: true });
    }

    setForwardMessage(null);
  };

  const appendEmoji = (emoji: string, target: 'main' | 'thread' | 'react', messageId?: string) => {
    if (target === 'main') {
      setInput(prev => prev + emoji);
      inputRef.current?.focus();
    } else if (target === 'thread') {
      setActiveThreadInput(prev => prev + emoji);
      threadInputRef.current?.focus();
    } else if (target === 'react' && messageId) {
      reactToMessage(messageId, emoji);
      setActiveReactionMessageId(null);
    }
  };

  const sendMessage = () => {
    const content = input.trim();
    if (!content || !socket) return;

    // Immediately clear local typing debounces and inform server typing has ended
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    socket.emit('chat:typing', { isTyping: false, targetView: view });

    const replyToId = replyTo?._id;

    if (view === 'org') {
      socket.emit('chat:send_org', { content, replyToId });
    } else {
      socket.emit('chat:send_dm', { recipientId: view, content, replyToId });
    }
    setInput('');
    setReplyTo(null);
    setShowMentionPopup(false);
    setShowEmojiPanel(false);
  };

  const sendThreadReply = () => {
    const content = activeThreadInput.trim();
    if (!content || !socket || !activeThread) return;

    const parent = activeThread.parent;
    const targetRecipient = view; // will be recipientId for DMs

    if (parent.type === 'org_chat') {
      socket.emit('chat:send_org', { content, parentId: parent._id });
    } else {
      socket.emit('chat:send_dm', { recipientId: targetRecipient, content, parentId: parent._id });
    }

    setActiveThreadInput('');
    setShowThreadEmojiPanel(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionPopup && (e.key === 'Escape')) {
      setShowMentionPopup(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleThreadKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendThreadReply();
    }
  };

  /* ── Sub Renderers for advanced features ─────────────────────────────────── */
  const renderMessageRow = (msg: ChatMessage, index: number, siblings: ChatMessage[], isThreadContent = false) => {
    const isMe = msg.senderId === me?._id;
    const prevMsg = siblings[index - 1];
    const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
    const finalAvatar = msg.senderAvatar || (isMe ? me?.avatar : members.find((m) => m._id === msg.senderId)?.avatar);

    return (
      <div key={msg._id} className={`${styles.messageRow} ${isMe ? styles.messageRowMe : ''}`}>
        {!isMe && (
          <div className={`${styles.msgAvatar} ${showAvatar ? '' : styles.msgAvatarHidden}`}>
            {showAvatar && (
              finalAvatar ? (
                <img src={finalAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                getInitials(msg.senderName)
              )
            )}
          </div>
        )}

        <div className={styles.messageBubbleWrap}>
          {msg.isForwarded && (
            <div className={styles.forwardedBanner}>
              <span>➡️ forwarded</span>
            </div>
          )}

          {showAvatar && !isMe && (
            <div className={styles.msgSenderName}>{msg.senderName}</div>
          )}

          <div className={styles.bubbleContainer}>
            {/* Quick Actions and Reactions hover bar — positioned over the bubble */}
            <div className={styles.msgActions}>
              <div className={styles.quickReacts}>
                {['👍', '❤️', '😂', '🎉', '🔥'].map(em => (
                  <button key={em} className={styles.reactEmojiBtn} onClick={() => reactToMessage(msg._id, em)}>
                    {em}
                  </button>
                ))}
                <button 
                  className={styles.reactEmojiBtn} 
                  title="More reactions" 
                  onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg._id ? null : msg._id)}
                >
                  ➕
                </button>
              </div>
              
              <button className={styles.actionBtn} title="Reply quote" onClick={() => initiateReply(msg)}>
                💬
              </button>
              
              {!isThreadContent && !msg.parentId && (
                <button className={styles.actionBtn} title="Reply in thread" onClick={() => initiateThread(msg)}>
                  🧵
                </button>
              )}
              
              {view === 'org' && !isMe && (
                <button className={styles.actionBtn} title="Reply Private" onClick={() => replyPrivate(msg)}>
                  🔒
                </button>
              )}

              <button className={styles.actionBtn} title="Forward message" onClick={() => setForwardMessage(msg)}>
                ➡️
              </button>
            </div>

            {/* Floating inline expanded Emoji picker for Reactions */}
            {activeReactionMessageId === msg._id && renderEmojiPickerPanel('react', msg._id)}

            <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}>
              {msg.replyToId && (
                <div className={styles.quotedContainer}>
                  <div className={styles.quotedAuthor}>
                    {msg.replyToId.senderName === me?.name ? 'You' : msg.replyToId.senderName}
                  </div>
                  <div className={styles.quotedSnippet}>{msg.replyToId.content}</div>
                </div>
              )}
              {renderContent(msg.content)}
            </div>

            {msg.reactions && msg.reactions.length > 0 && (
              <div className={styles.reactionsList}>
                {msg.reactions.map(r => {
                  const hasReacted = r.userIds.some(uId => uId.toString() === me?._id);
                  return (
                    <div 
                      key={r.emoji} 
                      className={`${styles.reactionBadge} ${hasReacted ? styles.reactionBadgeActive : ''}`}
                      onClick={() => reactToMessage(msg._id, r.emoji)}
                    >
                      <span>{r.emoji}</span>
                      <span className={styles.reactionBadgeCount}>{r.userIds.length}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!isThreadContent && msg.threadCount && msg.threadCount > 0 ? (
              <div className={styles.threadReplyCount} onClick={() => initiateThread(msg)}>
                🧵 {msg.threadCount} {msg.threadCount === 1 ? 'reply' : 'replies'}
              </div>
            ) : null}
          </div>

          <div className={`${styles.msgTime} ${isMe ? styles.msgTimeRight : ''}`}>
            {formatTime(msg.createdAt)}
          </div>
        </div>
      </div>
    );
  };

  const renderEmojiPickerPanel = (target: 'main' | 'thread' | 'react', messageId?: string) => {
    const list = [
      '👍','❤️','😂','🎉','🔥','💡','👏','😊','🚀','🥺','😭','👀','✨','💯','🥳','😮','🤔','😡','🙌','✔️',
      '👋','✅','❌','🔥','🎉','🎂','🎁','🌟','⭐','⚡','💥','🎵','🎧','⚽','🏆','🍕','🍔','☕','🍻','🥂',
      '💼','📊','💡','⏰','📅','📌','🔒','✏️','💻','📱','📁','🚀','🤝','💪','🙏','😎','🤣','😍','🤩','🤷'
    ];
    return (
      <div 
        ref={target === 'main' ? emojiPanelRef : target === 'thread' ? threadEmojiPanelRef : reactionPickerRef}
        className={`${styles.emojiPanel} ${target === 'react' ? styles.emojiPanelReact : ''}`}
      >
        {list.map((em, index) => (
          <button key={`${em}-${index}`} className={styles.emojiPickBtn} onClick={() => appendEmoji(em, target, messageId)}>
            {em}
          </button>
        ))}
      </div>
    );
  };

  const renderForwardModal = () => {
    if (!forwardMessage) return null;

    return (
      <div className={styles.modalOverlay} onClick={() => setForwardMessage(null)}>
        <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
          <div className={styles.modalTitle}>Forward message to...</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', marginBottom: '12px' }}>
            "{forwardMessage.content.slice(0, 60)}{forwardMessage.content.length > 60 ? '...' : ''}"
          </div>
          <div className={styles.modalList}>
            <div className={styles.modalTargetItem} onClick={() => handleForwardSelect('org', 'org')}>
              <div className={styles.modalTargetName}># Org Chat</div>
              <span className={styles.modalTargetTag}>Channel</span>
            </div>
            {members.map(m => (
              <div key={m._id} className={styles.modalTargetItem} onClick={() => handleForwardSelect(m._id, 'dm')}>
                <div className={styles.modalTargetName}>{m.name}</div>
                <span className={styles.modalTargetTag}>DM</span>
              </div>
            ))}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.modalCancelBtn} onClick={() => setForwardMessage(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Render helpers ──────────────────────────────────────────────────────── */
  const viewingMember = members.find((m) => m._id === view);
  const activeConvMessages = activeConvId ? dmMessages[activeConvId] || [] : [];
  const displayMessages = view === 'org' ? orgMessages : activeConvMessages;

  return (
    <div className={styles.container}>
      {/* ── Left Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Messages</h2>
        </div>

        {/* Org Chat */}
        <div
          className={`${styles.channelItem} ${view === 'org' ? styles.channelActive : ''}`}
          onClick={() => setView('org')}
        >
          <div className={styles.channelIcon}>#</div>
          <div className={styles.channelInfo}>
            <span className={styles.channelName}>Org Chat</span>
            <span className={styles.channelSub}>Everyone in your org</span>
          </div>
        </div>

        <div className={styles.divider} />
        <div className={styles.sectionLabel}>Direct Messages</div>

        {/* DM list */}
        {members.map((member) => {
          const conv = conversations.find((c) => c.otherUser?._id === member._id);
          return (
            <div
              key={member._id}
              className={`${styles.dmItem} ${view === member._id ? styles.dmActive : ''}`}
              onClick={() => openDm(member._id)}
            >
              <div className={styles.dmAvatar}>
                {member.avatar ? (
                  <img src={member.avatar} alt="" className={styles.avatarImg} />
                ) : (
                  getInitials(member.name)
                )}
              </div>
              <div className={styles.dmInfo}>
                <span className={styles.dmName}>{member.name}</span>
                {conv?.lastMessage && (
                  <span className={styles.dmPreview}>{conv.lastMessage.slice(0, 30)}{conv.lastMessage.length > 30 ? '…' : ''}</span>
                )}
              </div>
              {conv && conv.unreadCount > 0 && (
                <span className={styles.unreadBadge}>{conv.unreadCount}</span>
              )}
            </div>
          );
        })}
      </aside>

      {/* ── Main Chat Area ── */}
      <main className={styles.chatMain}>
        {/* Header */}
        <div className={styles.chatHeader}>
          {view === 'org' ? (
            <>
              <div className={styles.chatHeaderIcon}>#</div>
              <div>
                <div className={styles.chatHeaderName}>Org Chat</div>
                <div className={styles.chatHeaderSub}>{members.length + 1} members • Use @username or @all to mention</div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.dmAvatarLg}>
                {viewingMember?.avatar ? (
                  <img src={viewingMember.avatar} alt="" className={styles.avatarImg} />
                ) : (
                  getInitials(viewingMember?.name || '?')
                )}
              </div>
              <div>
                <div className={styles.chatHeaderName}>{viewingMember?.name || 'Direct Message'}</div>
                <div className={styles.chatHeaderSub}>{viewingMember?.role?.replace('_', ' ')}</div>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        <div className={styles.messagesArea}>
          {displayMessages.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <p className={styles.emptyText}>
                {view === 'org' ? 'Start the conversation! Say hello to your team.' : `Send ${viewingMember?.name?.split(' ')[0] || 'them'} a message.`}
              </p>
            </div>
          )}

          {displayMessages.map((msg, idx) => renderMessageRow(msg, idx, displayMessages, false))}

          {/* TYPING INDICATOR ANIMATED ROW */}
          {(() => {
            const typers = typingState[view] || [];
            if (typers.length === 0) return null;
            
            let displayText = '';
            if (typers.length === 1) {
              displayText = `${typers[0].userName} is typing`;
            } else if (typers.length === 2) {
              displayText = `${typers[0].userName} and ${typers[1].userName} are typing`;
            } else {
              displayText = 'Several people are typing';
            }

            return (
              <div className={styles.typingIndicatorRow}>
                <div className={styles.typingDots}>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                </div>
                <span className={styles.typingText}>{displayText}...</span>
              </div>
            );
          })()}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className={styles.inputArea}>
          {replyTo && (
            <div className={styles.accessoryBar}>
              <div className={styles.accessoryLeft}>
                <span className={styles.accessoryTitle}>Replying to {replyTo.senderName === me?.name ? 'yourself' : replyTo.senderName}</span>
                <span className={styles.accessorySubtitle}>{replyTo.content}</span>
              </div>
              <button className={styles.accessoryClose} onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}

          {showMentionPopup && view === 'org' && (
            <MentionPopup
              members={filteredMembers}
              onSelect={selectMention}
              popupRef={mentionPopupRef}
            />
          )}

          {showEmojiPanel && renderEmojiPickerPanel('main')}

          <div className={styles.inputRow}>
            <button 
              className={styles.emojiTriggerBtn}
              onClick={() => setShowEmojiPanel(!showEmojiPanel)}
              title="Pick emoji"
            >
              😊
            </button>
            <textarea
              ref={inputRef}
              className={styles.chatInput}
              placeholder={view === 'org' ? 'Message #Org Chat — use @ to mention' : `Message ${viewingMember?.name?.split(' ')[0] || ''}…`}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className={styles.sendBtn}
              onClick={sendMessage}
              disabled={!input.trim()}
              aria-label="Send"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={styles.sendIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <div className={styles.inputHint}>Press Enter to send • Shift+Enter for new line{view === 'org' ? ' • @ to mention' : ''}</div>
        </div>
      </main>

      {/* ── Thread Sidebar Panel ── */}
      {activeThread && (
        <aside className={styles.threadSidebar}>
          <div className={styles.threadHeader}>
            <span className={styles.threadTitle}>Thread</span>
            <button className={styles.threadCloseBtn} onClick={() => setActiveThread(null)}>✕</button>
          </div>
          
          <div className={styles.threadContent}>
            <div className={styles.threadParentContainer}>
              {renderMessageRow(activeThread.parent, 0, [activeThread.parent], true)}
            </div>
            
            <div className={styles.threadRepliesTitle}>
              {activeThread.replies.length} {activeThread.replies.length === 1 ? 'reply' : 'replies'}
            </div>
            
            {activeThread.replies.map((msg, idx) => 
              renderMessageRow(msg, idx, activeThread.replies, true)
            )}
            <div ref={threadBottomRef} />
          </div>

          <div className={styles.threadInputArea} style={{ position: 'relative' }}>
            {showThreadEmojiPanel && renderEmojiPickerPanel('thread')}
            <div className={styles.inputRow}>
              <button 
                className={styles.emojiTriggerBtn} 
                onClick={() => setShowThreadEmojiPanel(!showThreadEmojiPanel)}
                title="Pick emoji"
              >
                😊
              </button>
              <textarea
                ref={threadInputRef}
                className={styles.chatInput}
                style={{ fontSize: '0.85rem' }}
                placeholder="Reply in thread…"
                value={activeThreadInput}
                onChange={e => setActiveThreadInput(e.target.value)}
                onKeyDown={handleThreadKeyDown}
                rows={1}
              />
              <button
                className={styles.sendBtn}
                style={{ width: '36px', height: '36px' }}
                onClick={sendThreadReply}
                disabled={!activeThreadInput.trim()}
                aria-label="Send"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={styles.sendIcon} style={{ width: '16px', height: '16px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Forward Message Modal ── */}
      {renderForwardModal()}
    </div>
  );
}
