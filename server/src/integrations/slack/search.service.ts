import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackMessage, ISlackMessage } from '../../models/SlackMessage';

async function getClient(orgId: string) {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace');
  return { client: new WebClient(ws.getBotToken()), ws };
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

/**
 * Search messages in Slack.
 * Falls back to local MongoDB text search if Slack search API is unavailable
 * (requires user token scope 'search:read', not always available with bot-only tokens).
 */
export async function searchMessages(orgId: string, query: string): Promise<SearchResult> {
  // 1. Try local MongoDB full-text search first (fast, no API cost)
  const localResults = await SlackMessage.find(
    { orgId, $text: { $search: query }, isDeleted: false },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(25)
    .lean();

  if (localResults.length) {
    return {
      messages: localResults.map((m) => ({
        ts: (m as any).slackTs,
        channelId: (m as any).channelId,
        channelName: (m as any).channelId,
        text: (m as any).text,
        senderDisplayName: (m as any).senderDisplayName || 'Unknown',
        permalink: '',
      })),
      total: localResults.length,
    };
  }

  // 2. Fallback: Slack search.messages (requires user token)
  try {
    const { client } = await getClient(orgId);
    const res = await client.search.messages({ query, count: 25 });
    if (!res.ok || !res.messages) return { messages: [], total: 0 };

    const matches = (res.messages as any).matches || [];
    return {
      messages: matches.map((m: any) => ({
        ts: m.ts,
        channelId: m.channel?.id || '',
        channelName: m.channel?.name || '',
        text: m.text || '',
        senderDisplayName: m.username || 'Unknown',
        permalink: m.permalink || '',
      })),
      total: (res.messages as any).total || matches.length,
    };
  } catch {
    return { messages: [], total: 0 };
  }
}
