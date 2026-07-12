import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import * as messagesService from './messages.service';
import { ISlackMessage } from '../../models/SlackMessage';

async function getClientForUser(orgId: string, userId?: string) {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace');

  if (userId) {
    const { User } = await import('../../models/User');
    const user = await User.findById(userId).select('slack').lean();
    if (!user || !user.slack || !user.slack.connected) {
      class ForbiddenError extends Error {
        status = 403;
        constructor(message: string) {
          super(message);
          this.name = 'ForbiddenError';
        }
      }
      throw new ForbiddenError("Slack account connection required.");
    }

    const { getUserAccessToken } = await import('./oauth.service');
    const token = await getUserAccessToken(userId);
    if (token) {
      console.log(`[slack:file] Using User OAuth Token for user ${userId}`);
      return { client: new WebClient(token), ws };
    }

    class ForbiddenError extends Error {
      status = 403;
      constructor(message: string) {
        super(message);
        this.name = 'ForbiddenError';
      }
    }
    throw new ForbiddenError("Slack account connection required.");
  }

  console.log(`[slack:file] Using Workspace Bot Token`);
  return { client: new WebClient(ws.getBotToken()), ws };
}

export interface UploadedFile {
  slackFileId: string;
  name: string;
  mimetype: string;
  permalink: string;
  previewUrl?: string;
  size: number;
}

export interface FileData {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/**
 * Upload multiple files to Slack and create a single message with optional text.
 *
 * Uses the 3-step external upload flow:
 *   1. files.getUploadURLExternal  →  get pre-signed URL + file_id
 *   2. HTTP POST binary to that URL
 *   3. files.completeUploadExternal  →  share to channel
 *
 * Slack does NOT guarantee a message timestamp in the completeUploadExternal
 * response (file.shares may be empty or absent). When that happens we fall
 * back to scanning conversations.history for a message whose files[] contain
 * one of our uploaded file IDs.
 */
export async function uploadFiles(
  orgId: string,
  channelId: string,
  files: FileData[],
  text?: string,
  userId?: string,
  threadTs?: string
): Promise<ISlackMessage> {
  const { client } = await getClientForUser(orgId, userId);

  // ── Step 1 & 2: Upload each file blob ──────────────────────────────────
  const fileUploads: { id: string; title: string }[] = [];

  for (const file of files) {
    console.log(`[slack:file] Requesting upload URL for "${file.filename}" (${file.buffer.length} bytes)`);

    const urlRes = await client.files.getUploadURLExternal({
      filename: file.filename,
      length: file.buffer.length,
      alt_text: file.filename,
    });

    console.log(`[slack:file] getUploadURLExternal response – ok: ${urlRes.ok}, file_id: ${urlRes.file_id}`);

    if (!urlRes.ok || !urlRes.upload_url || !urlRes.file_id) {
      throw new Error(`Failed to get Slack upload URL for ${file.filename}`);
    }

    const uploadResponse = await fetch(urlRes.upload_url, {
      method: 'POST',
      headers: { 'Content-Type': file.mimetype },
      body: file.buffer as unknown as BodyInit,
    });

    console.log(`[slack:file] Binary upload response – status: ${uploadResponse.status} ${uploadResponse.statusText}`);

    if (!uploadResponse.ok) {
      throw new Error(`Slack file upload failed for ${file.filename}: ${uploadResponse.statusText}`);
    }

    fileUploads.push({ id: urlRes.file_id, title: file.filename });
  }

  // ── Step 3: Complete the upload & share to channel ─────────────────────
  const completeParams: any = {
    files: fileUploads,
    channel_id: channelId,
  };

  if (text?.trim()) {
    completeParams.initial_comment = text.trim();
  }

  if (threadTs) {
    completeParams.thread_ts = threadTs;
  }

  console.log('[slack:file] completeUploadExternal params:', JSON.stringify(completeParams));

  const completeRes = await client.files.completeUploadExternal(completeParams);

  console.log('[slack:file] completeUploadExternal response:', JSON.stringify(completeRes, null, 2));

  if (!completeRes.ok) {
    console.error('[slack:file] completeUploadExternal failed:', completeRes.error);
    throw new Error(`Slack completeUploadExternal failed: ${completeRes.error || 'unknown error'}`);
  }

  // Collect the file IDs Slack confirmed
  const uploadedFileIds = ((completeRes as any).files || []).map((f: any) => f.id).filter(Boolean) as string[];
  console.log('[slack:file] Confirmed file IDs:', uploadedFileIds);

  // ── Step 4: Locate the message timestamp ───────────────────────────────
  // Strategy A: Try to extract ts from the response's file.shares map
  let messageTs: string | undefined;
  let actualChannelId = channelId;

  const firstFile = (completeRes as any).files?.[0];
  if (firstFile?.shares) {
    const allShares = { ...(firstFile.shares.public || {}), ...(firstFile.shares.private || {}) };
    // Try the channel we targeted first
    if (allShares[channelId]?.[0]?.ts) {
      messageTs = allShares[channelId][0].ts;
    } else {
      // Take the first share from any channel
      for (const [chId, shareArr] of Object.entries(allShares)) {
        const arr = shareArr as any[];
        if (arr?.[0]?.ts) {
          messageTs = arr[0].ts;
          actualChannelId = chId;
          break;
        }
      }
    }
  }

  if (messageTs) {
    console.log(`[slack:file] Got messageTs from shares: ${messageTs} (channel: ${actualChannelId})`);
  }

  // Strategy B: Use bot-token-backed messagesService.fetchHistory to find the message
  // (The user token may lack channels:history scope, so we must NOT use `client` here)
  if (!messageTs) {
    console.log('[slack:file] No messageTs in upload response – falling back to bot-token history scan');

    // Brief delay to let Slack propagate the message
    await new Promise(r => setTimeout(r, 1500));

    // Ensure the bot is a member of the channel (conversations.join is idempotent)
    try {
      const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
      if (ws) {
        const botClient = new WebClient(ws.getBotToken());
        await botClient.conversations.join({ channel: channelId });
        console.log(`[slack:file] Bot joined channel ${channelId}`);
      }
    } catch (joinErr: any) {
      // method_not_supported = DM/MPIM channels (bot can't "join" those, but can already read them)
      // already_in_channel is fine too
      if (!['method_not_supported', 'already_in_channel', 'channel_not_found'].includes(joinErr?.data?.error)) {
        console.warn(`[slack:file] Bot join channel warning:`, joinErr?.data?.error || joinErr.message);
      }
    }

    let match;
    for (let i = 0; i < 4; i++) {
      const recentMsgs = await messagesService.fetchHistory(orgId, channelId, { limit: 10 });
      console.log(`[slack:file] fetchHistory returned ${recentMsgs?.length ?? 0} messages for file scan (attempt ${i + 1})`);

      if (recentMsgs && recentMsgs.length > 0) {
        match = recentMsgs.find((m: any) =>
          (m.files || []).some((f: any) => uploadedFileIds.includes(f.slackFileId))
        );
        if (match) {
          messageTs = (match as any).slackTs;
          actualChannelId = channelId;
          console.log(`[slack:file] Found matching message via history scan – ts: ${messageTs}`);
          console.log(`[slack:file] Upload complete. Persisted message ts: ${messageTs}`);
          return match;
        }
      }

      if (i < 3) {
        // Wait 800ms before retrying because Slack history is eventually consistent
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  }

  // If we still have nothing, log everything and return a best-effort result
  if (!messageTs) {
    console.warn('[slack:file] Could not locate message ts via shares or history. Returning last message in channel.');
  }

  // ── Step 5: Fetch / persist the message via messagesService ────────────
  const fetchOpts: any = { limit: 5 };
  if (messageTs) {
    fetchOpts.latest = messageTs;
    fetchOpts.inclusive = true;
    fetchOpts.limit = 1;
  }

  const msgs = await messagesService.fetchHistory(orgId, actualChannelId, fetchOpts);

  if (!msgs || msgs.length === 0) {
    console.error('[slack:file] fetchHistory returned 0 messages. channelId:', actualChannelId, 'messageTs:', messageTs);
    throw new Error('File was uploaded to Slack but the message could not be retrieved.');
  }

  // If we didn't have an exact ts, find the message with our file
  let result = msgs[0];
  if (!messageTs && uploadedFileIds.length > 0) {
    const match = msgs.find((m: any) =>
      (m.files || []).some((f: any) => uploadedFileIds.includes(f.slackFileId))
    );
    if (match) result = match;
  }

  console.log(`[slack:file] Upload complete. Persisted message ts: ${(result as any).slackTs}`);
  return result;
}

/** Delete a file from Slack */
export async function deleteFile(orgId: string, slackFileId: string, userId?: string): Promise<void> {
  const { client } = await getClientForUser(orgId, userId);
  await client.files.delete({ file: slackFileId });
}
