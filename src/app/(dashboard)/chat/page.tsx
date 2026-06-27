"use client";
import React from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import { useSocket } from '../../../hooks/useSocket';
import { getExistingSocket } from '../../../lib/socket';
import styles from './chat.module.css';
import Icon from '../../../components/ui/Icon';

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
  updatedAt?: string;
  parentId?: string;
  replyToId?: ChatMessage; // Populated referenced message
  isForwarded?: boolean;
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  threadCount?: number;
  isEdited?: boolean;
}

interface Conversation {
  _id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: string;
  otherUser?: { _id: string; name: string; avatar?: string };
  otherParticipants?: Array<{ _id: string; name: string; avatar?: string }>;
  unreadCount: number;
  isGroup?: boolean;
  name?: string;
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
  const searchParams = useSearchParams();
  const socket = useSocket();
  const [me, setMe] = React.useState<any>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<string | null>(null);
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

  // Socket connection status for UI feedback
  // Initialize from the socket's current state to avoid a false "disconnected" flash
  const [socketConnected, setSocketConnected] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    const existing = getExistingSocket();
    return !!(existing && existing.connected);
  });

  // Advanced Chat Features states
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [activeThread, setActiveThread] = React.useState<{ parent: ChatMessage; replies: ChatMessage[] } | null>(null);
  const [activeThreadInput, setActiveThreadInput] = React.useState('');
  const [showEmojiPanel, setShowEmojiPanel] = React.useState(false);
  const [showThreadEmojiPanel, setShowThreadEmojiPanel] = React.useState(false);
  const [forwardMessage, setForwardMessage] = React.useState<ChatMessage | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = React.useState<string | null>(null);

  // Expanded Features states: Search, Edit and Delete
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editingContent, setEditingContent] = React.useState('');
  const [loadingOrg, setLoadingOrg] = React.useState(true);
  const [loadingDm, setLoadingDm] = React.useState(false);

  // Group creation states
  const [showCreateGroupModal, setShowCreateGroupModal] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = React.useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = React.useState(false);

  const [mobileActiveView, setMobileActiveView] = React.useState<'sidebar' | 'chat'>('sidebar');

  // Refs to avoid stale closures in socket events
  const meRef = React.useRef<any>(null);
  const activeConvIdRef = React.useRef<string | null>(null);
  const viewRef = React.useRef<string>('org');

  React.useEffect(() => {
    meRef.current = me;
  }, [me]);

  React.useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  React.useEffect(() => {
    viewRef.current = view;
  }, [view]);

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
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [orgMessages, dmMessages, activeConvId, typingState]);

  // Load current user + members
  React.useEffect(() => {
    api.get('/auth/me').then((r) => setMe(r.data.user)).catch(() => {});
    api.get('/chat/members').then((r) => setMembers(r.data)).catch(() => {});
    api.get('/chat/conversations').then((r) => setConversations(r.data)).catch(() => {});
    
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Dynamically toggle a body class on mobile viewports when an active chat conversation is open
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      if (mobileActiveView === 'chat') {
        document.body.classList.add('chat-active-mobile');
      } else {
        document.body.classList.remove('chat-active-mobile');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('chat-active-mobile');
      }
    };
  }, [mobileActiveView]);

  // Handle URL params (?view=org, ?dm=userId, ?conversation=conversationId)
  React.useEffect(() => {
    const dm = searchParams.get('dm');
    const viewParam = searchParams.get('view');
    const conversationParam = searchParams.get('conversation');

    if (dm) {
      openDm(dm);
      setMobileActiveView('chat');
    } else if (viewParam === 'org') {
      setView('org');
      setMobileActiveView('chat');
    } else if (conversationParam && conversations.length > 0) {
      const c = conversations.find((x) => x._id === conversationParam);
      if (c) {
        if (c.isGroup) {
          openGroup(conversationParam);
        } else if (c.otherUser?._id) {
          openDm(c.otherUser._id);
        }
      }
      setMobileActiveView('chat');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations]);

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

  // Track socket connection state — use both event listeners AND a polling
  // interval as a fallback for when connect fires before listener registers.
  React.useEffect(() => {
    if (!socket) {
      setSocketConnected(false);
      return;
    }

    // Sync immediately
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Polling fallback: re-check every 500ms so we never get stuck showing
    // "Reconnecting" when the socket is actually already connected.
    const poll = setInterval(() => {
      setSocketConnected(socket.connected);
    }, 500);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      clearInterval(poll);
    };
  }, [socket]);

  // Socket event listeners
  React.useEffect(() => {
    if (!socket) return;

    console.log('[Socket] Initializing event listeners. connected:', socket.connected);

    const onConnect = () => {
      console.log('[Socket] Connected!', socket.id);
      setSocketConnected(true);
      // Reload org history after reconnect to catch any missed messages
      socket.emit('chat:load_history_org');
    };

    const onConnectError = (err: Error) => {
      console.error('[Socket] Connection error:', err.message);
    };

    const onHistoryOrg = (msgs: ChatMessage[]) => {
      setOrgMessages(msgs);
      setLoadingOrg(false);
    };

    const onOrgMessage = (msg: ChatMessage) => {
      console.log('[Socket] chat:org_message received:', msg._id);
      if (msg.parentId) {
        setActiveThread(prev => {
          if (prev && prev.parent._id === msg.parentId) {
            if (prev.replies.some(r => r._id === msg._id)) return prev;
            return { ...prev, replies: [...prev.replies, msg] };
          }
          return prev;
        });
      } else {
        // Deduplicate by _id — prevents double-display on reconnect or double emit
        setOrgMessages(prev => {
          if (prev.some(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }

      // Desktop notification for messages from others
      if (meRef.current && msg.senderId !== meRef.current._id) {
        triggerDesktopNotification(
          msg.parentId ? `Org Chat Thread reply from ${msg.senderName}` : `Org Chat from ${msg.senderName}`,
          msg.content
        );
      }
    };

    const onMessageUpdated = (updatedMsg: ChatMessage) => {
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
        return { ...prev, replies: prev.replies.map(r => r._id === updatedMsg._id ? { ...r, ...updatedMsg } : r) };
      });
    };

    const onThreadHistory = ({ parent, replies }: { parent: ChatMessage; replies: ChatMessage[] }) => {
      setActiveThread({ parent, replies });
    };

    const onThreadCountUpdated = ({ parentId, threadCount }: { parentId: string; threadCount: number }) => {
      setOrgMessages(prev => prev.map(m => m._id === parentId ? { ...m, threadCount } : m));
      setDmMessages(prev => {
        const next = { ...prev };
        for (const cId in next) {
          next[cId] = next[cId].map(m => m._id === parentId ? { ...m, threadCount } : m);
        }
        return next;
      });
    };

    const onHistoryDm = ({ conversationId, messages }: { conversationId: string; messages: ChatMessage[] }) => {
      setDmMessages(prev => ({ ...prev, [conversationId]: messages }));
      setActiveConvId(conversationId);
    };

    const onDmMessage = ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
      if (message.parentId) {
        setActiveThread(prev => {
          if (prev && prev.parent._id === message.parentId) {
            if (prev.replies.some(r => r._id === message._id)) return prev;
            return { ...prev, replies: [...prev.replies, message] };
          }
          return prev;
        });
      } else {
        setDmMessages(prev => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []).filter(m => m._id !== message._id), message],
        }));
      }
      setConversations(prev =>
        prev.map(c =>
          c._id === conversationId
            ? { ...c, lastMessage: message.isForwarded ? 'Forwarded message' : message.content, lastMessageAt: message.createdAt }
            : c
        )
      );
      if (activeConvIdRef.current === conversationId) {
        socket?.emit('chat:mark_read', { conversationId });
      }
      if (meRef.current && message.senderId !== meRef.current._id) {
        triggerDesktopNotification(
          message.parentId ? `DM Thread reply from ${message.senderName}` : `DM from ${message.senderName}`,
          message.content
        );
      }
    };

    const onMessageDeleted = ({ messageId, parentId }: { messageId: string; parentId?: string }) => {
      setOrgMessages(prev => prev.filter(m => m._id !== messageId));
      setDmMessages(prev => {
        const next = { ...prev };
        for (const cId in next) { next[cId] = next[cId].filter(m => m._id !== messageId); }
        return next;
      });
      setActiveThread(prev => {
        if (!prev) return null;
        if (prev.parent._id === messageId) return null;
        return { ...prev, replies: prev.replies.filter(r => r._id !== messageId) };
      });
    };

    const onTypingUpdate = ({ userId, userName, isTyping, view: targetView }: { userId: string; userName: string; isTyping: boolean; view: string }) => {
      setTypingState(prev => {
        const list = prev[targetView] || [];
        if (isTyping) {
          if (list.some(u => u.userId === userId)) return prev;
          return { ...prev, [targetView]: [...list, { userId, userName }] };
        } else {
          return { ...prev, [targetView]: list.filter(u => u.userId !== userId) };
        }
      });
    };

    const onConversationCreated = () => {
      console.log('[Socket] chat:conversation_created received, refreshing list');
      api.get('/chat/conversations').then((r) => setConversations(r.data)).catch(() => {});
    };

    const onChatError = ({ event, error }: { event: string; error: string }) => {
      console.error(`[Chat] Server error on ${event}:`, error);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('chat:history_org', onHistoryOrg);
    socket.on('chat:org_message', onOrgMessage);
    socket.on('chat:message_updated', onMessageUpdated);
    socket.on('chat:thread_history', onThreadHistory);
    socket.on('chat:thread_count_updated', onThreadCountUpdated);
    socket.on('chat:history_dm', onHistoryDm);
    socket.on('chat:dm_message', onDmMessage);
    socket.on('chat:message_deleted', onMessageDeleted);
    socket.on('chat:typing_update', onTypingUpdate);
    socket.on('chat:conversation_created', onConversationCreated);
    socket.on('chat:error', onChatError);

    // Load initial org history
    socket.emit('chat:load_history_org');

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('chat:history_org', onHistoryOrg);
      socket.off('chat:org_message', onOrgMessage);
      socket.off('chat:message_updated', onMessageUpdated);
      socket.off('chat:thread_history', onThreadHistory);
      socket.off('chat:thread_count_updated', onThreadCountUpdated);
      socket.off('chat:history_dm', onHistoryDm);
      socket.off('chat:dm_message', onDmMessage);
      socket.off('chat:message_deleted', onMessageDeleted);
      socket.off('chat:typing_update', onTypingUpdate);
      socket.off('chat:conversation_created', onConversationCreated);
      socket.off('chat:error', onChatError);
    };
  // Only re-run if the socket instance itself changes — not on every view/me update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Open DM with a member
  const openDm = async (memberId: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setView(memberId);
    setMobileActiveView('chat');
    
    // 1. Optimistic/Instant local view shift if conversation is cached
    const cachedConv = conversations.find((c) => c.otherUser?._id === memberId);
    if (cachedConv) {
      setActiveConvId(cachedConv._id);
      setLoadingDm(false);
    } else {
      setActiveConvId(null);
      setLoadingDm(true);
    }

    try {
      const res = await api.get(`/chat/dm/${memberId}`);
      const { conversationId, messages } = res.data;
      
      // 2. Prevent race conditions: only apply states if user is still viewing the clicked member
      setView((currentView) => {
        if (currentView === memberId) {
          if (conversationId) {
            setDmMessages((prev) => ({ ...prev, [conversationId]: messages }));
            setActiveConvId(conversationId);
            socket?.emit('chat:load_history_dm', { conversationId });
          } else {
            setActiveConvId(null);
          }
          setLoadingDm(false);
        }
        return currentView;
      });
      
      // Update unread count locally
      setConversations((prev) =>
        prev.map((c) => {
          const otherParticipant = c.otherUser?._id;
          return otherParticipant === memberId ? { ...c, unreadCount: 0 } : c;
        })
      );
    } catch {
      setView((currentView) => {
        if (currentView === memberId) {
          setLoadingDm(false);
        }
        return currentView;
      });
    }
  };

  // Open Group conversation
  const openGroup = async (conversationId: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setView(conversationId);
    setActiveConvId(conversationId);
    setMobileActiveView('chat');
    setLoadingDm(true);

    try {
      const res = await api.get(`/chat/conversations/${conversationId}`);
      const { messages } = res.data;
      
      setView((currentView) => {
        if (currentView === conversationId) {
          setDmMessages((prev) => ({ ...prev, [conversationId]: messages }));
          socket?.emit('chat:load_history_dm', { conversationId });
          setLoadingDm(false);
        }
        return currentView;
      });

      // Update unread count locally
      setConversations((prev) =>
        prev.map((c) => {
          return c._id === conversationId ? { ...c, unreadCount: 0 } : c;
        })
      );
    } catch (err) {
      console.error('Failed to load group history:', err);
      setView((currentView) => {
        if (currentView === conversationId) {
          setLoadingDm(false);
        }
        return currentView;
      });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    if (selectedGroupMembers.length === 0) {
      alert('Please select at least one member.');
      return;
    }
    setIsCreatingGroup(true);
    try {
      const res = await api.post('/chat/group', {
        name,
        participantIds: selectedGroupMembers,
      });
      // Close modal and reset state
      setShowCreateGroupModal(false);
      setNewGroupName('');
      setSelectedGroupMembers([]);
      
      // Refresh conversation list
      const convListRes = await api.get('/chat/conversations');
      setConversations(convListRes.data);
      
      // Open the new group conversation
      const newGroupConv = res.data;
      if (newGroupConv && newGroupConv._id) {
        openGroup(newGroupConv._id);
      }
    } catch (err: any) {
      console.error('Failed to create group conversation:', err);
      alert(err.response?.data?.message || 'Failed to create group.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const toggleGroupMember = (memberId: string) => {
    setSelectedGroupMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const triggerDesktopNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          tag: 'chat-notification',
          renotify: true
        } as any);
      } catch (err) {
        console.error('Failed to trigger notification:', err);
      }
    }
  };

  // @Mention input handling
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
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

  const editMessage = (messageId: string, content: string) => {
    socket?.emit('chat:edit', { messageId, content });
  };

  const deleteMessage = (messageId: string) => {
    if (confirm('Are you sure you want to delete this message?')) {
      socket?.emit('chat:delete', { messageId });
    }
  };

  const getReactorNames = (userIds: any[]) => {
    if (!userIds || userIds.length === 0) return '';
    return userIds
      .map(id => {
        const idStr = id.toString();
        if (idStr === me?._id) return 'You';
        return members.find(m => m._id === idStr)?.name || 'Someone';
      })
      .join(', ');
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

    // Clear typing debounce
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    socket.emit('chat:typing', { isTyping: false, targetView: view });

    const replyToId = replyTo?._id;
    const isGroup = conversations.some((c) => c._id === view && c.isGroup);

    if (view === 'org') {
      socket.emit('chat:send_org', { content, replyToId });
    } else if (isGroup) {
      socket.emit('chat:send_dm', { conversationId: view, content, replyToId });
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
    const isGroup = conversations.some((c) => c._id === view && c.isGroup);

    if (parent.type === 'org_chat') {
      socket.emit('chat:send_org', { content, parentId: parent._id });
    } else if (isGroup) {
      socket.emit('chat:send_dm', { conversationId: view, content, parentId: parent._id });
    } else {
      socket.emit('chat:send_dm', { recipientId: view, content, parentId: parent._id });
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
      <div 
        key={msg._id} 
        id={`message-${msg._id}`} 
        className={`${styles.messageRow} ${isMe ? styles.messageRowMe : ''} ${highlightedMessageId === msg._id ? styles.highlightedMessage : ''}`}
      >
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                forwarded
              </span>
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
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              
              <button className={styles.actionBtn} title="Reply quote" onClick={() => initiateReply(msg)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </button>
              
              {!isThreadContent && !msg.parentId && (
                <button className={styles.actionBtn} title="Reply in thread" onClick={() => initiateThread(msg)}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.083.293.125.599.125.911 0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L3 17l1.338-3.123C3.475 12.658 3 11.137 3 9.5c0-3.866 3.582-7 8-7 1.488 0 2.873.353 4.04 1.006m4.21 4.005a7.994 7.994 0 011.085 4.316A7.995 7.995 0 0115 19.5l-3 1.5 1-3.5C9.722 17.5 8 15.722 8 13.5c0-1.077.415-2.062 1.102-2.854" />
                  </svg>
                </button>
              )}
              
              {view === 'org' && !isMe && (
                <button className={styles.actionBtn} title="Reply Private" onClick={() => replyPrivate(msg)}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </button>
              )}

              {isMe && (
                <>
                  <button 
                    className={styles.actionBtn} 
                    title="Edit message" 
                    onClick={() => {
                      setEditingMessageId(msg._id);
                      setEditingContent(msg.content);
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button className={styles.actionBtn} title="Delete message" onClick={() => deleteMessage(msg._id)}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </>
              )}

              <button className={styles.actionBtn} title="Forward message" onClick={() => setForwardMessage(msg)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
                </svg>
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
              {editingMessageId === msg._id ? (
                <div className={styles.inlineEditor}>
                  <textarea
                    className={styles.inlineEditInput}
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={2}
                  />
                  <div className={styles.inlineEditActions}>
                    <button 
                      className={styles.inlineEditSave} 
                      onClick={() => {
                        editMessage(msg._id, editingContent);
                        setEditingMessageId(null);
                      }}
                      disabled={!editingContent.trim()}
                    >
                      Save
                    </button>
                    <button 
                      className={styles.inlineEditCancel} 
                      onClick={() => setEditingMessageId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                renderContent(msg.content)
              )}
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
                      title={`Reacted: ${getReactorNames(r.userIds)}`}
                    >
                      <span>{r.emoji}</span>
                      <span className={styles.reactionBadgeCount}>{r.userIds.length}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!isThreadContent && msg.threadCount && msg.threadCount > 0 ? (
              <div className={styles.threadReplyCount} onClick={() => initiateThread(msg)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.083.293.125.599.125.911 0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L3 17l1.338-3.123C3.475 12.658 3 11.137 3 9.5c0-3.866 3.582-7 8-7 1.488 0 2.873.353 4.04 1.006m4.21 4.005a7.994 7.994 0 011.085 4.316A7.995 7.995 0 0115 19.5l-3 1.5 1-3.5C9.722 17.5 8 15.722 8 13.5c0-1.077.415-2.062 1.102-2.854" />
                </svg>
                <span>{msg.threadCount} {msg.threadCount === 1 ? 'reply' : 'replies'}</span>
              </div>
            ) : null}
          </div>

          <div className={`${styles.msgTime} ${isMe ? styles.msgTimeRight : ''}`}>
            {formatTime(msg.createdAt)}
            {msg.isEdited && (
              <span className={styles.editedTag}> (edited)</span>
            )}
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

  const renderSkeletonLoader = () => {
    return (
      <div className={styles.skeletonContainer}>
        <div className={`${styles.skeletonRow} ${styles.skeletonRowThem}`}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonBubbleWrap}>
            <div className={styles.skeletonName} />
            <div className={styles.skeletonBubble} style={{ width: '180px' }} />
          </div>
        </div>
        <div className={`${styles.skeletonRow} ${styles.skeletonRowMe}`}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonBubbleWrap}>
            <div className={styles.skeletonBubble} style={{ width: '260px' }} />
          </div>
        </div>
        <div className={`${styles.skeletonRow} ${styles.skeletonRowThem}`}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonBubbleWrap}>
            <div className={styles.skeletonName} />
            <div className={styles.skeletonBubble} style={{ width: '220px' }} />
          </div>
        </div>
        <div className={`${styles.skeletonRow} ${styles.skeletonRowMe}`}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonBubbleWrap}>
            <div className={styles.skeletonBubble} style={{ width: '140px' }} />
          </div>
        </div>
      </div>
    );
  };

  /* ── Render helpers ──────────────────────────────────────────────────────── */
  const viewingMember = members.find((m) => m._id === view);
  const activeGroup = conversations.find((c) => c._id === view && c.isGroup);
  const activeConvMessages = activeConvId ? dmMessages[activeConvId] || [] : [];
  const displayMessages = view === 'org' ? orgMessages : activeConvMessages;
  const isChatLoading = view === 'org' ? (loadingOrg && orgMessages.length === 0) : loadingDm;

  // Scroll to and highlight a specific message if messageId is passed in searchParams
  React.useEffect(() => {
    const messageIdToScroll = searchParams.get('messageId');
    if (!messageIdToScroll || isChatLoading) return;
    
    // Check if the message is in the loaded messages
    const messageExists = displayMessages.some((m) => m._id === messageIdToScroll);
    if (!messageExists) return;
    
    const timer = setTimeout(() => {
      const element = document.getElementById(`message-${messageIdToScroll}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMessageId(messageIdToScroll);
        
        const highlightTimer = setTimeout(() => {
          setHighlightedMessageId(null);
        }, 2500);
        
        return () => clearTimeout(highlightTimer);
      }
    }, 150);
    
    return () => clearTimeout(timer);
  }, [searchParams, displayMessages, isChatLoading]);

  const filteredMessages = React.useMemo(() => {
    return displayMessages.filter(msg => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        msg.content.toLowerCase().includes(q) ||
        msg.senderName.toLowerCase().includes(q)
      );
    });
  }, [displayMessages, searchQuery]);

  const renderedMessageList = React.useMemo(() => {
    return filteredMessages.map((msg, idx) => renderMessageRow(msg, idx, filteredMessages, false));
  }, [filteredMessages, me, members, view, editingMessageId, editingContent, activeReactionMessageId, highlightedMessageId, replyTo]);

  const renderedThreadParent = React.useMemo(() => {
    if (!activeThread) return null;
    return renderMessageRow(activeThread.parent, 0, [activeThread.parent], true);
  }, [activeThread?.parent, me, members, view, editingMessageId, editingContent, activeReactionMessageId, highlightedMessageId]);

  const renderedThreadReplies = React.useMemo(() => {
    if (!activeThread) return [];
    return activeThread.replies.map((msg, idx) => 
      renderMessageRow(msg, idx, activeThread.replies, true)
    );
  }, [activeThread?.replies, me, members, view, editingMessageId, editingContent, activeReactionMessageId, highlightedMessageId]);

  const renderedGroupList = React.useMemo(() => {
    return conversations.filter(c => c.isGroup).map((conv) => (
      <div
        key={conv._id}
        className={`${styles.groupItem} ${view === conv._id ? styles.groupActive : ''}`}
        onClick={() => openGroup(conv._id)}
      >
        <div className={styles.groupAvatar}>
          {getInitials(conv.name || 'Group')}
        </div>
        <div className={styles.groupInfo}>
          <span className={styles.groupName}>{conv.name}</span>
          {conv.lastMessage && (
            <span className={styles.groupPreview}>
              {conv.lastMessage.slice(0, 30)}{conv.lastMessage.length > 30 ? '…' : ''}
            </span>
          )}
        </div>
        {conv.unreadCount > 0 && (
          <span className={styles.unreadBadge}>{conv.unreadCount}</span>
        )}
      </div>
    ));
  }, [conversations, view]);

  const renderedDmList = React.useMemo(() => {
    return members.map((member) => {
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
    });
  }, [members, conversations, view]);

  return (
    <div className={`${styles.container} ${mobileActiveView === 'chat' ? styles.showChatMobile : styles.showSidebarMobile}`}>
      {/* ── Left Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Messages</h2>
        </div>

        {/* Org Chat */}
        <div
          className={`${styles.channelItem} ${view === 'org' ? styles.channelActive : ''}`}
          onClick={() => {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
            setView('org');
            setMobileActiveView('chat');
          }}
        >
          <div className={styles.channelIcon}>#</div>
          <div className={styles.channelInfo}>
            <span className={styles.channelName}>Org Chat</span>
            <span className={styles.channelSub}>Everyone in your org</span>
          </div>
        </div>

        {/* Group Channels Section Header with action (+) button */}
        <div className={styles.divider} />
        <div className={styles.sectionHeaderRow}>
          <div className={styles.sectionLabel}>Group Channels</div>
          <button 
            className={styles.sectionActionBtn} 
            title="Create Group Chat"
            onClick={() => setShowCreateGroupModal(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Group Channels List */}
        {renderedGroupList}

        <div className={styles.divider} />
        <div className={styles.sectionLabel}>Direct Messages</div>

        {/* DM list */}
        {renderedDmList}
      </aside>

      {/* ── Main Chat Area ── */}
      <main className={styles.chatMain}>
        {/* Header */}
        <div className={styles.chatHeader}>
          <button 
            className={styles.mobileBackBtn} 
            onClick={() => setMobileActiveView('sidebar')}
            aria-label="Back to messages"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
            {view === 'org' ? (
              <>
                <div className={styles.chatHeaderIcon}>#</div>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.chatHeaderName}>Org Chat</div>
                  <div className={styles.chatHeaderSub}>{members.length + 1} members • Use @username or @all to mention</div>
                </div>
              </>
            ) : activeGroup ? (
              <>
                <div className={styles.chatHeaderIcon}>
                  <Icon name="people" size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.chatHeaderName}>{activeGroup.name}</div>
                  <div className={styles.chatHeaderSub}>
                    {activeGroup.participants.length} members • {activeGroup.otherParticipants?.map(p => p.name).join(', ')}
                  </div>
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
                <div style={{ minWidth: 0 }}>
                  <div className={styles.chatHeaderName}>{viewingMember?.name || 'Direct Message'}</div>
                  <div className={styles.chatHeaderSub}>{viewingMember?.role?.replace('_', ' ')}</div>
                </div>
              </>
            )}
          </div>

          {/* Messages Search Input */}
          <div className={styles.searchContainer}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className={styles.searchIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" />
            </svg>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className={styles.searchClearBtn} onClick={() => setSearchQuery('')} title="Clear search">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messagesArea}>
          {isChatLoading ? (
            renderSkeletonLoader()
          ) : (
            <>
              {filteredMessages.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon} style={{ color: 'var(--primary)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  </div>
                  <p className={styles.emptyText}>
                    {searchQuery ? 'No messages found matching your search.' : (view === 'org' ? 'Start the conversation! Say hello to your team.' : activeGroup ? `Send a message to start the conversation in ${activeGroup.name}.` : `Send ${viewingMember?.name?.split(' ')[0] || 'them'} a message.`)}
                  </p>
                </div>
              )}

              {renderedMessageList}

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
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className={styles.inputArea}>
          {/* Connection status banner */}
          {!socketConnected && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              padding: '6px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              color: '#f87171',
            }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f87171', animation: 'pulse 1.5s infinite' }} />
              Reconnecting to chat server… Messages cannot be sent right now.
            </div>
          )}

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
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </button>
             <textarea
              ref={inputRef}
              className={styles.chatInput}
              placeholder={!socketConnected ? 'Reconnecting…' : 'Message…'}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                  Notification.requestPermission();
                }
              }}
              rows={1}
              disabled={!socketConnected}
            />
            <button
              className={styles.sendBtn}
              onClick={sendMessage}
              disabled={!input.trim() || !socketConnected}
              aria-label="Send"
              title={!socketConnected ? 'Reconnecting to chat server…' : 'Send message'}
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
              {renderedThreadParent}
            </div>
            
            <div className={styles.threadRepliesTitle}>
              {activeThread.replies.length} {activeThread.replies.length === 1 ? 'reply' : 'replies'}
            </div>
            
            {renderedThreadReplies}
            <div ref={threadBottomRef} />
          </div>

          <div className={styles.threadInputArea} style={{ position: 'relative' }}>
            {showThreadEmojiPanel && renderEmojiPickerPanel('thread')}
            <div className={styles.inputRow}>
              <button 
                className={styles.emojiTriggerBtn} 
                onClick={() => setShowThreadEmojiPanel(!showThreadEmojiPanel)}
                title="Pick emoji"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </button>
               <textarea
                ref={threadInputRef}
                className={styles.chatInput}
                style={{ fontSize: '0.85rem' }}
                placeholder="Reply in thread…"
                value={activeThreadInput}
                onChange={e => setActiveThreadInput(e.target.value)}
                onKeyDown={handleThreadKeyDown}
                onFocus={() => {
                  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission();
                  }
                }}
                rows={1}
              />
              <button
                className={styles.sendBtn}
                style={{ width: '36px', height: '36px' }}
                onClick={sendThreadReply}
                disabled={!activeThreadInput.trim() || !socketConnected}
                aria-label="Send"
                title={!socketConnected ? 'Reconnecting to chat server…' : 'Send reply'}
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

      {/* ── Create Group Chat Modal ── */}
      {showCreateGroupModal && (
        <div className={styles.groupModalOverlay} onClick={() => {
          setShowCreateGroupModal(false);
          setNewGroupName('');
          setSelectedGroupMembers([]);
        }}>
          <div className={styles.groupModalBox} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>Create Group Chat</div>
            <form onSubmit={handleCreateGroup}>
              <div className={styles.groupFormGroup} style={{ marginBottom: '1rem' }}>
                <label className={styles.groupFormLabel}>Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design Team"
                  className={styles.groupFormInput}
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                />
              </div>

              <div className={styles.groupFormGroup} style={{ marginBottom: '1.25rem' }}>
                <label className={styles.groupFormLabel}>Select Members</label>
                <div className={styles.membersListScroll}>
                  {members.map(m => (
                    <div 
                      key={m._id} 
                      className={styles.memberSelectRow}
                      onClick={() => toggleGroupMember(m._id)}
                    >
                      <input
                        type="checkbox"
                        className={styles.memberSelectCheckbox}
                        checked={selectedGroupMembers.includes(m._id)}
                        onChange={() => {}} // toggled via parent div click
                      />
                      <div className={styles.memberSelectAvatar}>
                        {m.avatar ? (
                          <img src={m.avatar} alt="" className={styles.avatarImg} />
                        ) : (
                          getInitials(m.name)
                        )}
                      </div>
                      <span className={styles.memberSelectName}>{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button 
                  type="button" 
                  className={styles.btnSecondary} 
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setNewGroupName('');
                    setSelectedGroupMembers([]);
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={styles.btnPrimary} 
                  disabled={isCreatingGroup || !newGroupName.trim() || selectedGroupMembers.length === 0}
                >
                  {isCreatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
