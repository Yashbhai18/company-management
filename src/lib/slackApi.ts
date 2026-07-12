/**
 * Typed API client for all /api/slack/* endpoints.
 * Never communicates directly with Slack — all calls go through Express.
 */
import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlackWorkspaceInfo {
  connected: boolean;
  workspaceId?: string;
  teamName?: string;
  scope?: string;
  lastSyncedAt?: string;
  userConnected?: boolean;
  userSlackUserId?: string | null;
}

export interface SlackChannel {
  _id: string;
  slackChannelId: string;
  workspaceId: string;
  name: string;
  displayName?: string;
  avatar?: string;
  presence?: string;
  dmUserSlackId?: string;
  conversationId?: string;
  topic?: string;
  purpose?: string;
  memberCount: number;
  unreadCount: number;
  lastMessageTs?: string;
  lastMessageText?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isIm: boolean;
  isMpim: boolean;
  linkedProjectId?: string;
}

export interface SlackUser {
  _id: string;
  id?: string;
  slackUserId: string;
  name: string;
  displayName: string;
  email?: string;
  avatar?: string;
  presence: 'active' | 'away';
  statusText?: string;
  statusEmoji?: string;
  isBot: boolean;
  isDeleted: boolean;
}

export interface SlackReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface SlackFileRef {
  slackFileId: string;
  name: string;
  mimetype: string;
  size: number;
  permalink: string;
  previewUrl?: string;
  urlPrivate?: string;
}

export interface SlackThreadParticipant {
  displayName: string;
  avatar: string;
}

export interface SlackThreadSummary {
  replyCount: number;
  lastReplyAt: string | null;
  participantCount: number;
  participants: SlackThreadParticipant[];
}

export interface SlackMessage {
  _id: string;
  slackTs: string;
  channelId: string;
  senderSlackUserId: string;
  senderDisplayName?: string;
  senderAvatar?: string;
  threadTs?: string;
  text: string;
  blocks?: any[];
  reactions: SlackReaction[];
  files: SlackFileRef[];
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  isThreadReply?: boolean;
  parentTs?: string | null;
  thread?: SlackThreadSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  messages: Array<{
    ts: string;
    channelId: string;
    channelName: string;
    text: string;
    senderDisplayName: string;
    permalink: string;
  }>;
  total: number;
}

// ── API Methods ───────────────────────────────────────────────────────────────

export const slackApi = {
  // OAuth
  getOAuthUrl: (type?: 'workspace' | 'user') => api.get<{ url: string }>('/slack/oauth', { params: { type } }).then((r) => r.data),
  disconnect: () => api.delete('/slack/disconnect'),
  disconnectUser: () => api.delete('/slack/user-connection'),

  // Workspace
  getWorkspace: () => api.get<SlackWorkspaceInfo>('/slack/workspace').then((r) => r.data),
  triggerSync: () => api.post('/slack/sync'),

  // Channels
  getChannels: () => api.get<SlackChannel[]>('/slack/channels').then((r) => r.data),
  openDM: (recipientSlackUserId: string) =>
    api.post<SlackChannel>('/slack/channel/dm', { recipientSlackUserId }).then((r) => r.data),
  createChannel: (name: string, isPrivate: boolean) =>
    api.post<SlackChannel>('/slack/channel', { name, isPrivate }).then((r) => r.data),
  updateChannel: (payload: {
    channelId: string;
    name?: string;
    archive?: boolean;
    linkedProjectId?: string | null;
  }) => api.patch('/slack/channel', payload),

  // Users
  getUsers: () => api.get<SlackUser[]>('/slack/users').then((r) => r.data),
  getUser: (slackUserId: string) =>
    api.get<SlackUser>(`/slack/users/${slackUserId}`).then((r) => r.data),

  // Messages
  getMessages: (channelId: string, opts: { before?: string; limit?: number } = {}) =>
    api
      .get<SlackMessage[]>(`/slack/messages/${channelId}`, { params: opts })
      .then((r) => r.data),
  postMessage: (payload: { channelId: string; text: string; threadTs?: string; blocks?: any[] }) =>
    api.post<SlackMessage>('/slack/message', payload).then((r) => r.data),
  editMessage: (channelId: string, ts: string, text: string) =>
    api.patch('/slack/message', { channelId, ts, text }),
  deleteMessage: (channelId: string, ts: string) =>
    api.delete('/slack/message', { data: { channelId, ts } }),

  // Threads
  getThread: (channelId: string, threadTs: string) =>
    api.get<{ parent: SlackMessage; replies: SlackMessage[] }>(`/slack/thread/${channelId}/${threadTs}`).then((r) => r.data),
  postThreadReply: (channelId: string, threadTs: string, text: string) =>
    api.post<SlackMessage>('/slack/thread', { channelId, threadTs, text }).then((r) => r.data),

  // Files
  uploadFiles: (channelId: string, files: File[], text?: string, threadTs?: string, onUploadProgress?: (progressEvent: any) => void) => {
    const form = new FormData();
    form.append('channelId', channelId);
    if (text) {
      form.append('text', text);
    }
    if (threadTs) {
      form.append('threadTs', threadTs);
    }
    for (const file of files) {
      form.append('files', file);
    }
    return api.post<SlackMessage>('/slack/file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress
    }).then((r) => r.data);
  },
  deleteFile: (fileId: string) => api.delete(`/slack/file/${fileId}`),

  // Search
  search: (q: string) => api.get<SearchResult>('/slack/search', { params: { q } }).then((r) => r.data),
};

export default slackApi;
