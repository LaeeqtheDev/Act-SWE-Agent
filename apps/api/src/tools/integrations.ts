import { getToken } from "../connections.js";

// Direct API access to Slack and Notion, replacing browser automation for
// these two. An API call is one request; driving the web UI is a page load,
// a DOM scrape, and several clicks — so this is both far faster and far
// more reliable. Reads run freely; anything that posts or writes still goes
// through proposeAction, same as every other write in the system.

const NOT_CONNECTED = (service: string) =>
  ({ error: `${service} isn't connected. Connect it in Settings, then try again.` });

// --- Slack ---

async function slack(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as Record<string, unknown>;
  // Slack returns 200 with ok:false on errors, so res.ok isn't enough.
  if (data.ok === false) throw new Error(String(data.error ?? "Slack request failed"));
  return data;
}

export async function listSlackChannels(userId?: string) {
  const token = await getToken("slack", userId);
  if (!token) return NOT_CONNECTED("Slack");
  try {
    const data = await slack("conversations.list", token, {
      types: "public_channel,private_channel",
      limit: "50",
      exclude_archived: "true",
    });
    const channels = (data.channels as { id: string; name: string }[]) ?? [];
    return { channels: channels.map((c) => ({ id: c.id, name: `#${c.name}` })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't list Slack channels." };
  }
}

export async function readSlackChannel(channel: string, userId?: string, limit = 20) {
  const token = await getToken("slack", userId);
  if (!token) return NOT_CONNECTED("Slack");
  try {
    // Accept "#general" or a raw channel ID — the model will produce either.
    let channelId = channel.replace(/^#/, "");
    if (!/^[CGD][A-Z0-9]+$/.test(channelId)) {
      const list = await slack("conversations.list", token, { types: "public_channel,private_channel", limit: "200" });
      const found = ((list.channels as { id: string; name: string }[]) ?? []).find((c) => c.name === channelId);
      if (!found) return { error: `No channel called "${channel}". Use listSlackChannels to see what's available.` };
      channelId = found.id;
    }

    const data = await slack("conversations.history", token, { channel: channelId, limit: String(Math.min(limit, 50)) });
    const messages = (data.messages as { user?: string; text?: string; ts?: string }[]) ?? [];

    // Resolve user IDs to names once, rather than leaving "U024BE7LH" in
    // the output for the model to puzzle over.
    const userIds = [...new Set(messages.map((m) => m.user).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    await Promise.all(
      userIds.slice(0, 20).map(async (id) => {
        try {
          const info = await slack("users.info", token, { user: id });
          const u = info.user as { real_name?: string; name?: string };
          names.set(id, u?.real_name ?? u?.name ?? id);
        } catch {
          names.set(id, id);
        }
      })
    );

    return {
      channel,
      messages: messages.reverse().map((m) => ({
        from: m.user ? (names.get(m.user) ?? m.user) : "unknown",
        text: (m.text ?? "").slice(0, 500),
        at: m.ts ? new Date(Number(m.ts) * 1000).toISOString() : null,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that Slack channel." };
  }
}

export async function searchSlack(query: string, userId?: string) {
  const token = await getToken("slack", userId);
  if (!token) return NOT_CONNECTED("Slack");
  try {
    const data = await slack("search.messages", token, { query, count: "20" });
    const matches = ((data.messages as { matches?: unknown[] })?.matches ?? []) as {
      text?: string;
      username?: string;
      channel?: { name?: string };
      permalink?: string;
    }[];
    return {
      results: matches.map((m) => ({
        text: (m.text ?? "").slice(0, 300),
        from: m.username ?? "unknown",
        channel: m.channel?.name ? `#${m.channel.name}` : null,
        link: m.permalink ?? null,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Slack search failed." };
  }
}

// Write path — only ever called by performAction after human approval.
export async function postSlackMessage(channel: string, text: string, userId?: string) {
  const token = await getToken("slack", userId);
  if (!token) return { success: false, error: "Slack isn't connected." };
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channel.replace(/^#/, ""), text }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.ok === false) return { success: false, error: String(data.error ?? "Slack rejected the message") };
    return { success: true, note: `Posted to ${channel}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Couldn't post to Slack." };
  }
}

// --- Notion ---

async function notion(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.message ?? "Notion request failed"));
  return data;
}

// Notion's block format is deeply nested; this pulls out readable text
// without dragging the whole structure into the model's context.
function plainText(block: Record<string, unknown>): string {
  const type = block.type as string;
  const content = block[type] as { rich_text?: { plain_text?: string }[] } | undefined;
  const text = (content?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
  if (!text) return "";
  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "bulleted_list_item") return `- ${text}`;
  if (type === "numbered_list_item") return `1. ${text}`;
  if (type === "to_do") {
    const done = (content as unknown as { checked?: boolean })?.checked;
    return `${done ? "[x]" : "[ ]"} ${text}`;
  }
  return text;
}

export async function searchNotion(query: string, userId?: string) {
  const token = await getToken("notion", userId);
  if (!token) return NOT_CONNECTED("Notion");
  try {
    const data = await notion("search", token, {
      method: "POST",
      body: JSON.stringify({ query, page_size: 15 }),
    });
    const results = ((data.results as Record<string, unknown>[]) ?? []).map((r) => {
      const props = r.properties as Record<string, { title?: { plain_text?: string }[] }> | undefined;
      const titleProp = props ? Object.values(props).find((p) => p.title) : undefined;
      const title =
        titleProp?.title?.map((t) => t.plain_text ?? "").join("") ||
        ((r as { title?: { plain_text?: string }[] }).title ?? []).map((t) => t.plain_text ?? "").join("") ||
        "Untitled";
      return { id: r.id as string, title, type: r.object as string, url: r.url as string };
    });
    if (results.length === 0) {
      return { error: `Nothing in Notion matches "${query}". Note that Notion only exposes pages you shared with the integration during setup.` };
    }
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Notion search failed." };
  }
}

export async function readNotionPage(pageId: string, userId?: string) {
  const token = await getToken("notion", userId);
  if (!token) return NOT_CONNECTED("Notion");
  try {
    const data = await notion(`blocks/${pageId}/children?page_size=100`, token);
    const blocks = (data.results as Record<string, unknown>[]) ?? [];
    const content = blocks.map(plainText).filter(Boolean).join("\n");
    return { pageId, content: content.slice(0, 6000) || "(this page is empty)" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that Notion page." };
  }
}

// Write path — only ever called after approval.
export async function appendToNotionPage(pageId: string, text: string, userId?: string) {
  const token = await getToken("notion", userId);
  if (!token) return { success: false, error: "Notion isn't connected." };
  try {
    // Notion caps a rich_text block at 2000 characters, so long content has
    // to be split or the whole request is rejected.
    const chunks = text.match(/[\s\S]{1,1900}/g) ?? [text];
    await notion(`blocks/${pageId}/children`, token, {
      method: "PATCH",
      body: JSON.stringify({
        children: chunks.map((chunk) => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: chunk } }] },
        })),
      }),
    });
    return { success: true, note: "Added to the Notion page." };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Couldn't write to Notion." };
  }
}
