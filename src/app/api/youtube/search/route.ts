/**
 * YouTube search proxy.
 *
 * Lets users search for a song from inside the app instead of pasting a link.
 * The actual search is done with the YouTube Data API v3, which requires an API
 * key. We keep that key on the server (never shipped to the browser) and expose
 * a small, embed-friendly subset of the results.
 *
 * The key is optional: if `YOUTUBE_API_KEY` isn't configured the route responds
 * with `{ configured: false }` so the client can gracefully fall back to the
 * paste-a-link flow rather than breaking.
 *
 * Set the key via an env var (e.g. `.env.local`):
 *   YOUTUBE_API_KEY=your_key_here
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Results depend on the query string, so never cache the route output.
export const dynamic = "force-dynamic";

export interface YouTubeSearchItem {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSeconds: number;
  durationLabel: string;
}

interface SearchListResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
  }>;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
  }>;
}

/** Parse an ISO-8601 duration (e.g. "PT3M21S") into whole seconds. */
function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const hours = Number(m[1] ?? 0);
  const minutes = Number(m[2] ?? 0);
  const seconds = Number(m[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        configured: false,
        items: [],
        error:
          "Search isn't configured. Set the YOUTUBE_API_KEY environment variable to enable it.",
      },
      { status: 200 },
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ configured: true, items: [] }, { status: 200 });
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoEmbeddable", "true");
    searchUrl.searchParams.set("maxResults", "12");
    searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    if (!searchRes.ok) {
      return NextResponse.json(
        { configured: true, items: [], error: "YouTube search failed." },
        { status: 502 },
      );
    }
    const search = (await searchRes.json()) as SearchListResponse;

    const ids = (search.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) {
      return NextResponse.json({ configured: true, items: [] }, { status: 200 });
    }

    // A second call to fetch durations (search.list doesn't include them).
    const durations = new Map<string, number>();
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "contentDetails");
    videosUrl.searchParams.set("id", ids.join(","));
    videosUrl.searchParams.set("key", apiKey);
    const videosRes = await fetch(videosUrl, { cache: "no-store" });
    if (videosRes.ok) {
      const videos = (await videosRes.json()) as VideosListResponse;
      for (const v of videos.items ?? []) {
        if (v.id) durations.set(v.id, parseIsoDuration(v.contentDetails?.duration));
      }
    }

    const items: YouTubeSearchItem[] = (search.items ?? [])
      .map((item): YouTubeSearchItem | null => {
        const id = item.id?.videoId;
        if (!id) return null;
        const thumbs = item.snippet?.thumbnails ?? {};
        const thumbnail =
          thumbs.medium?.url ?? thumbs.default?.url ?? thumbs.high?.url ?? "";
        const durationSeconds = durations.get(id) ?? 0;
        return {
          id,
          title: item.snippet?.title ?? "Untitled",
          channelTitle: item.snippet?.channelTitle ?? "",
          thumbnail,
          durationSeconds,
          durationLabel: formatDuration(durationSeconds),
        };
      })
      .filter((item): item is YouTubeSearchItem => item !== null);

    return NextResponse.json({ configured: true, items }, { status: 200 });
  } catch {
    return NextResponse.json(
      { configured: true, items: [], error: "YouTube search failed." },
      { status: 502 },
    );
  }
}
