'use client';
import React from 'react';

/**
 * Slack mrkdwn parser.
 *
 * Converts raw Slack mrkdwn text into an array of React nodes.
 *
 * Handles:
 *   <@U123>         → @DisplayName  (user mention chip)
 *   <!channel>      → @channel      (special mention chip)
 *   <!here>         → @here
 *   <!everyone>     → @everyone
 *   <#C123|general> → #general      (channel link)
 *   <https://…|Label> → Label       (hyperlink)
 *   <https://…>       → url         (bare hyperlink)
 *   <mailto:…|Label>  → Label       (email link)
 */

// ── Cached user lookup type ─────────────────────────────────────────────────
export type UserMap = Map<string, string>; // userId → displayName

/**
 * Build a UserMap from the SlackUser array that useSlack provides.
 */
export function buildUserMap(users: { slackUserId: string; displayName?: string; name?: string }[]): UserMap {
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.slackUserId, u.displayName || u.name || u.slackUserId);
  }
  return map;
}

// ── Mention chip components ─────────────────────────────────────────────────
function UserMention({ name }: { name: string }) {
  return (
    <span
      style={{
        background: 'rgba(29, 155, 209, 0.15)',
        color: '#1264a3',
        padding: '1px 4px',
        borderRadius: '4px',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 'inherit',
      }}
    >
      @{name}
    </span>
  );
}

function SpecialMention({ tag }: { tag: string }) {
  return (
    <span
      style={{
        background: 'rgba(255, 186, 0, 0.18)',
        color: '#d4850a',
        padding: '1px 4px',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: 'inherit',
      }}
    >
      @{tag}
    </span>
  );
}

function ChannelLink({ name }: { name: string }) {
  return (
    <span
      style={{
        color: '#1264a3',
        fontWeight: 500,
        cursor: 'pointer',
        fontSize: 'inherit',
      }}
    >
      #{name}
    </span>
  );
}

// ── Core tokeniser ──────────────────────────────────────────────────────────

// Matches every Slack mrkdwn bracket token: <…>
// Covers: <@U…>, <!channel>, <!here>, <!everyone>, <#C…|name>, <url|label>, <url>
const SLACK_TOKEN = /<([^>]+)>/g;

/**
 * Parse a raw Slack mrkdwn string into React nodes.
 *
 * @param text    - The raw message text from Slack (e.g. `Hello <@U123>`)
 * @param userMap - A Map<userId, displayName> for resolving user mentions
 * @returns       - An array of React nodes ready for rendering
 */
export function parseSlackMrkdwn(text: string, userMap: UserMap): React.ReactNode[] {
  if (!text) return [];

  // Backend sanitization or Slack may escape < and > as &lt; and &gt;.
  // We unescape them here so the regex can match. This is completely safe 
  // because React automatically escapes raw strings during render.
  const decodedText = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  SLACK_TOKEN.lastIndex = 0;

  while ((match = SLACK_TOKEN.exec(decodedText)) !== null) {
    const fullMatch = match[0];
    const inner = match[1]; // content between < and >
    const matchStart = match.index;

    // Push any plain text before this token
    if (matchStart > lastIndex) {
      nodes.push(decodedText.slice(lastIndex, matchStart));
    }

    const node = resolveToken(inner, userMap, nodes.length);
    nodes.push(node);
    lastIndex = matchStart + fullMatch.length;
  }

  // Push trailing plain text
  if (lastIndex < decodedText.length) {
    nodes.push(decodedText.slice(lastIndex));
  }

  return nodes;
}

function resolveToken(inner: string, userMap: UserMap, keyIndex: number): React.ReactNode {
  // 1. User mention: @U012345
  if (inner.startsWith('@')) {
    const userId = inner.slice(1); // strip the @
    const displayName = userMap.get(userId) || userId;
    return <UserMention key={`u-${keyIndex}`} name={displayName} />;
  }

  // 2. Special mention: !channel, !here, !everyone
  if (inner.startsWith('!')) {
    const tag = inner.slice(1); // strip the !
    // Slack sometimes adds metadata after | e.g. <!here|here>
    const cleanTag = tag.split('|')[0];
    if (['channel', 'here', 'everyone'].includes(cleanTag)) {
      return <SpecialMention key={`s-${keyIndex}`} tag={cleanTag} />;
    }
    // Unknown special — render as text
    return `<${inner}>`;
  }

  // 3. Channel link: #C12345|general
  if (inner.startsWith('#')) {
    const parts = inner.slice(1).split('|');
    const channelName = parts[1] || parts[0];
    return <ChannelLink key={`c-${keyIndex}`} name={channelName} />;
  }

  // 4. URL or mailto with label: https://example.com|Example  or  mailto:a@b.com|a@b.com
  if (inner.includes('|')) {
    const pipeIndex = inner.indexOf('|');
    const url = inner.slice(0, pipeIndex);
    const label = inner.slice(pipeIndex + 1);

    if (url.startsWith('mailto:')) {
      return (
        <a key={`m-${keyIndex}`} href={url} style={{ color: '#1264a3', textDecoration: 'none' }}>
          {label}
        </a>
      );
    }

    return (
      <a
        key={`a-${keyIndex}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#1264a3', textDecoration: 'none' }}
      >
        {label}
      </a>
    );
  }

  // 5. Bare URL: https://example.com
  if (inner.startsWith('http://') || inner.startsWith('https://')) {
    return (
      <a
        key={`l-${keyIndex}`}
        href={inner}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#1264a3', textDecoration: 'none' }}
      >
        {inner}
      </a>
    );
  }

  // 6. Bare mailto
  if (inner.startsWith('mailto:')) {
    const email = inner.replace('mailto:', '');
    return (
      <a key={`e-${keyIndex}`} href={inner} style={{ color: '#1264a3', textDecoration: 'none' }}>
        {email}
      </a>
    );
  }

  // Unknown bracket — render as-is
  return `<${inner}>`;
}

// ── Outgoing: convert @DisplayName to Slack mrkdwn ──────────────────────────

/**
 * Convert composer text containing `@DisplayName` into Slack mrkdwn.
 *
 * @param text    - The raw composer text, e.g. "Hello @Tanmay"
 * @param members - Array of { slackUserId, displayName } to resolve names
 * @returns       - Slack mrkdwn, e.g. "Hello <@U0BEH29EQ6B>"
 */
export function convertMentionsToSlack(
  text: string,
  members: { slackUserId: string; displayName: string }[]
): string {
  if (!text || !members || members.length === 0) return text;

  let result = text;

  // Sort members by displayName length descending so longer names match first
  // e.g. "Tanmay Sharma" matches before "Tanmay"
  const sorted = [...members].sort((a, b) => b.displayName.length - a.displayName.length);

  for (const member of sorted) {
    if (!member.displayName) continue;
    // Match @DisplayName — case insensitive
    // Capture the preceding boundary (start of string or whitespace) to preserve it
    const escaped = member.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?;:)])`, 'gi');
    result = result.replace(regex, `$1<@${member.slackUserId}>`);
  }

  // Handle special mentions — same approach without lookbehind
  result = result.replace(/(^|\s)@(here|channel|everyone)(?=\s|$|[.,!?;:)])/gi,
    (_, prefix, tag) => `${prefix}<!${tag.toLowerCase()}>`
  );

  return result;
}
