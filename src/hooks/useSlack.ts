'use client';
import React from 'react';
import { useSocket } from './useSocket';
import slackApi, { SlackMessage, SlackChannel, SlackUser, SlackThreadSummary, SlackFileRef } from '../lib/slackApi';

export interface SlackState {
  channels: SlackChannel[];
  users: SlackUser[];
  messages: Record<string, SlackMessage[]>; // keyed by channelId
  threads: Record<string, SlackMessage[]>;  // keyed by threadTs
  presenceMap: Record<string, 'active' | 'away'>; // keyed by slackUserId
  typingMap: Record<string, string[]>; // channelId → list of user names currently typing
  connected: boolean;
  teamName: string;
  userConnected: boolean;
  userSlackUserId: string | null;
  loading: boolean;
  error: string | null;
}

export interface SlackActions {
  loadChannels: () => Promise<void>;
  loadMessages: (channelId: string, before?: string) => Promise<void>;
  loadThread: (channelId: string, threadTs: string) => Promise<void>;
  sendMessage: (channelId: string, text: string, threadTs?: string, files?: File[]) => Promise<void>;
  editMessage: (channelId: string, ts: string, text: string) => Promise<void>;
  deleteMessage: (channelId: string, ts: string) => Promise<void>;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendTyping: (channelId: string, isTyping: boolean) => void;
  reload: () => Promise<void>;
}

const initialState: SlackState = {
  channels: [],
  users: [],
  messages: {},
  threads: {},
  presenceMap: {},
  typingMap: {},
  connected: false,
  teamName: '',
  userConnected: false,
  userSlackUserId: null,
  loading: true,
  error: null,
};

export function useSlack(): SlackState & SlackActions {
  const socket = useSocket();
  const [state, setState] = React.useState<SlackState>(initialState);

  // ── Initial load ───────────────────────────────────────────────────────────
  const reload = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const ws = await slackApi.getWorkspace();
      if (!ws.connected) {
        setState((s) => ({ ...s, connected: false, loading: false }));
        return;
      }
      const [channels, users] = await Promise.all([
        slackApi.getChannels(),
        slackApi.getUsers(),
      ]);

      console.log("[useSlack hook] Loaded channels:", channels);
      console.log("[useSlack hook] Loaded users:", users);

      const presence: Record<string, 'active' | 'away'> = {};
      users.forEach((u) => { presence[u.slackUserId] = u.presence; });

      setState((s) => ({
        ...s,
        connected: true,
        teamName: ws.teamName || '',
        userConnected: !!ws.userConnected,
        userSlackUserId: ws.userSlackUserId || null,
        channels,
        users,
        presenceMap: presence,
        loading: false,
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  // ── Socket event listeners ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: SlackMessage) => {
      console.log(`[slack:socket:audit] Received slack:new_message event for channel ${msg.channelId}`, msg);
      setState((s) => {
        if (msg.isThreadReply && msg.parentTs) {
          const existingReplies = s.threads[msg.parentTs] || [];
          const alreadyExists = existingReplies.some((m) => m.slackTs === msg.slackTs);
          const updatedReplies = alreadyExists ? existingReplies : [...existingReplies, msg];
          console.log(`[slack:socket:audit] Thread reply for ${msg.parentTs}. Exists: ${alreadyExists}. Total: ${updatedReplies.length}`);
          return { ...s, threads: { ...s.threads, [msg.parentTs]: updatedReplies } };
        } else {
          const existing = s.messages[msg.channelId] || [];
          const alreadyExists = existing.some((m) => m.slackTs === msg.slackTs);
          const updated = alreadyExists ? existing : [...existing, msg];
          console.log(`[slack:socket:audit] Channel message for ${msg.channelId}. Exists: ${alreadyExists}. Total: ${updated.length}`);
          return { ...s, messages: { ...s.messages, [msg.channelId]: updated } };
        }
      });
    };

    const onMessageEdited = (msg: SlackMessage) => {
      setState((s) => {
        if (msg.isThreadReply && msg.parentTs) {
          const existing = s.threads[msg.parentTs] || [];
          const updated = existing.map((m) => (m.slackTs === msg.slackTs ? msg : m));
          return { ...s, threads: { ...s.threads, [msg.parentTs]: updated } };
        } else {
          const existing = s.messages[msg.channelId] || [];
          const updated = existing.map((m) => (m.slackTs === msg.slackTs ? msg : m));
          return { ...s, messages: { ...s.messages, [msg.channelId]: updated } };
        }
      });
    };

    const onMessageDeleted = (payload: { channelId: string; slackTs: string; parentTs?: string; isThreadReply?: boolean }) => {
      setState((s) => {
        if (payload.isThreadReply && payload.parentTs) {
          const existing = s.threads[payload.parentTs] || [];
          const updated = existing.filter((m) => m.slackTs !== payload.slackTs);
          return { ...s, threads: { ...s.threads, [payload.parentTs]: updated } };
        } else {
          const existing = s.messages[payload.channelId] || [];
          const updated = existing.filter((m) => m.slackTs !== payload.slackTs);
          return { ...s, messages: { ...s.messages, [payload.channelId]: updated } };
        }
      });
    };

    const onReactionAdded = (payload: { channelId: string; slackTs: string; reactions: any[] }) => {
      setState((s) => {
        const existing = s.messages[payload.channelId] || [];
        const updated = existing.map((m) =>
          m.slackTs === payload.slackTs ? { ...m, reactions: payload.reactions } : m
        );
        return { ...s, messages: { ...s.messages, [payload.channelId]: updated } };
      });
    };

    const onReactionRemoved = onReactionAdded; // Same shape

    const onPresenceChanged = ({ slackUserId, presence }: { slackUserId: string; presence: 'active' | 'away' }) => {
      setState((s) => ({ ...s, presenceMap: { ...s.presenceMap, [slackUserId]: presence } }));
    };

    const onThreadUpdated = ({ channelId, threadTs, replyCount, thread }: { channelId: string; threadTs: string; replyCount: number; thread?: SlackThreadSummary | null }) => {
      setState((s) => {
        const existing = s.messages[channelId] || [];
        const updated = existing.map((m) => m.slackTs === threadTs ? { ...m, replyCount, thread } : m);
        return { ...s, messages: { ...s.messages, [channelId]: updated } };
      });
    };

    const onChannelUpdated = () => { reload(); };
    const onWorkspaceUpdated = () => { reload(); };

    const onTypingUpdate = ({ channelId, userName, isTyping }: { channelId: string; userName: string; isTyping: boolean }) => {
      setState((s) => {
        const current = s.typingMap[channelId] || [];
        const updated = isTyping
          ? current.includes(userName) ? current : [...current, userName]
          : current.filter((n) => n !== userName);
        return { ...s, typingMap: { ...s.typingMap, [channelId]: updated } };
      });
    };

    socket.on('slack:new_message', onNewMessage);
    socket.on('slack:message_edited', onMessageEdited);
    socket.on('slack:message_deleted', onMessageDeleted);
    socket.on('slack:reaction_added', onReactionAdded);
    socket.on('slack:reaction_removed', onReactionRemoved);
    socket.on('slack:presence_changed', onPresenceChanged);
    socket.on('slack:thread_updated', onThreadUpdated);
    socket.on('slack:channel_updated', onChannelUpdated);
    socket.on('slack:workspace_updated', onWorkspaceUpdated);
    socket.on('slack:typing_update', onTypingUpdate);

    return () => {
      socket.off('slack:new_message', onNewMessage);
      socket.off('slack:message_edited', onMessageEdited);
      socket.off('slack:message_deleted', onMessageDeleted);
      socket.off('slack:reaction_added', onReactionAdded);
      socket.off('slack:reaction_removed', onReactionRemoved);
      socket.off('slack:presence_changed', onPresenceChanged);
      socket.off('slack:thread_updated', onThreadUpdated);
      socket.off('slack:channel_updated', onChannelUpdated);
      socket.off('slack:workspace_updated', onWorkspaceUpdated);
      socket.off('slack:typing_update', onTypingUpdate);
    };
  }, [socket, reload]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const loadChannels = React.useCallback(async () => {
    const channels = await slackApi.getChannels();
    setState((s) => ({ ...s, channels }));
  }, []);

  const loadMessages = React.useCallback(async (channelId: string, before?: string) => {
    const msgs = await slackApi.getMessages(channelId, { before, limit: 50 });
    setState((s) => ({
      ...s,
      messages: {
        ...s.messages,
        [channelId]: before
          ? [...msgs, ...(s.messages[channelId] || [])]
          : msgs,
      },
    }));
  }, []);

  const loadThread = React.useCallback(async (channelId: string, threadTs: string) => {
    const data = await slackApi.getThread(channelId, threadTs);
    setState((s) => ({ ...s, threads: { ...s.threads, [threadTs]: data.replies } }));
  }, []);

  const sendMessage = React.useCallback(async (channelId: string, text: string, threadTs?: string, files?: File[], onProgress?: (percent: number) => void) => {
    if (!text.trim() && (!files || files.length === 0)) return;

    const tempTs = `temp-${Date.now()}`;
    const optimisticFiles: SlackFileRef[] = (files || []).map((f, i) => ({
      slackFileId: `temp-file-${Date.now()}-${i}`,
      name: f.name,
      mimetype: f.type,
      size: f.size,
      permalink: URL.createObjectURL(f),
      // Do not set urlPrivate so the AttachmentRenderer uses the local blob permalink directly instead of proxying
    }));

    setState((s) => {
      const currentUser = s.users.find(u => u.slackUserId === s.userSlackUserId);
      const optimisticMsg: SlackMessage = {
        _id: tempTs,
        slackTs: tempTs,
        channelId,
        senderSlackUserId: s.userSlackUserId || 'unknown',
        senderDisplayName: currentUser?.displayName || currentUser?.name || 'You',
        senderAvatar: currentUser?.avatar || '',
        text,
        files: optimisticFiles,
        reactions: [],
        replyCount: 0,
        isEdited: false,
        isDeleted: false,
        isThreadReply: !!threadTs,
        parentTs: threadTs || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (threadTs) {
        const existingReplies = s.threads[threadTs] || [];
        return { ...s, threads: { ...s.threads, [threadTs]: [...existingReplies, optimisticMsg] } };
      } else {
        const existing = s.messages[channelId] || [];
        return { ...s, messages: { ...s.messages, [channelId]: [...existing, optimisticMsg] } };
      }
    });

    try {
      let actualMsg: SlackMessage;
      if (files && files.length > 0) {
        actualMsg = await slackApi.uploadFiles(channelId, files, text, threadTs, (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress?.(percentCompleted);
          }
        });
      } else {
        actualMsg = await slackApi.postMessage({ channelId, text, threadTs });
      }

      setState((s) => {
        const replaceOrRemoveTemp = (list: SlackMessage[]) => {
          const hasReal = list.some(m => m.slackTs === actualMsg.slackTs);
          if (hasReal) {
            // Already added by socket, just remove temp
            return list.filter(m => m.slackTs !== tempTs);
          } else {
            return list.map(m => m.slackTs === tempTs ? actualMsg : m);
          }
        };

        if (threadTs) {
          return { ...s, threads: { ...s.threads, [threadTs]: replaceOrRemoveTemp(s.threads[threadTs] || []) } };
        } else {
          return { ...s, messages: { ...s.messages, [channelId]: replaceOrRemoveTemp(s.messages[channelId] || []) } };
        }
      });
    } catch (err) {
      console.error('[slack:sendMessage] Failed:', err);
      // Revert optimistic message on failure
      setState((s) => {
        if (threadTs) {
          const existingReplies = s.threads[threadTs] || [];
          return { ...s, threads: { ...s.threads, [threadTs]: existingReplies.filter(m => m.slackTs !== tempTs) } };
        } else {
          const existing = s.messages[channelId] || [];
          return { ...s, messages: { ...s.messages, [channelId]: existing.filter(m => m.slackTs !== tempTs) } };
        }
      });
      throw err;
    }
  }, []);

  const editMessage = React.useCallback(async (channelId: string, ts: string, text: string) => {
    await slackApi.editMessage(channelId, ts, text);
  }, []);

  const deleteMessage = React.useCallback(async (channelId: string, ts: string) => {
    await slackApi.deleteMessage(channelId, ts);
  }, []);

  const joinChannel = React.useCallback((channelId: string) => {
    socket?.emit('slack:join_channel', { channelId });
  }, [socket]);

  const leaveChannel = React.useCallback((channelId: string) => {
    socket?.emit('slack:leave_channel', { channelId });
  }, [socket]);

  const sendTyping = React.useCallback((channelId: string, isTyping: boolean) => {
    socket?.emit('slack:typing', { channelId, isTyping });
  }, [socket]);

  return {
    ...state,
    loadChannels,
    loadMessages,
    loadThread,
    sendMessage,
    editMessage,
    deleteMessage,
    joinChannel,
    leaveChannel,
    sendTyping,
    reload,
  };
}
