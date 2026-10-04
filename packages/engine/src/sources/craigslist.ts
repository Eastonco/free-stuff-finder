// Craigslist search + post pages, parsed from the server-rendered HTML.
//
// No browser needed: the search page ships every result as a static
// <li class="cl-static-search-result"> (title, link, location) for SEO, and the
// post page has og:image, the description, and an exact posted time. Images
// aren't in the search HTML, so we fetch a post's page only when we actually
// need to classify it. See docs/decisions/0001-http-not-browser.md.
import { load } from "cheerio";

import type { ListedPost, PostDetail } from "../types";

const DESCRIPTION_MAX = 1500;
const BR = "\uE000"; // private-use placeholder for <br> while collapsing whitespace

export function isCraigslistUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    return u.protocol.startsWith("http") && (host === "craigslist.org" || host.endsWith(".craigslist.org"));
  } catch {
    return false;
  }
}

/** Saved URLs often carry a client-side `#search=...` fragment; the server never sees it. */
export function normalizeSearchUrl(url: string): string {
  const u = new URL(url.trim());
  u.hash = "";
  return u.toString();
}

/** Same id the Python scraper stored as cl_id: the last path segment, minus `.html`. */
export function postIdFromLink(link: string): string | null {
  try {
    const last = new URL(link).pathname.split("/").filter(Boolean).pop();
    return last ? last.replace(/\.html$/, "") : null;
  } catch {
    return null;
  }
}

export function parseSearchPage(html: string): ListedPost[] {
  const $ = load(html);
  const seen = new Set<string>();
  const posts: ListedPost[] = [];

  $("li.cl-static-search-result").each((_, el) => {
    const li = $(el);
    const link = li.find("a[href]").first().attr("href")?.trim();
    const title = (li.find(".title").first().text() || li.attr("title") || "").trim();
    if (!link || !title) return;
    const sourceId = postIdFromLink(link);
    if (!sourceId || seen.has(sourceId)) return;
    seen.add(sourceId);
    posts.push({ sourceId, link, title, location: li.find(".location").first().text().trim() || null });
  });

  return posts;
}

export function parseDetailPage(html: string): PostDetail {
  const $ = load(html);

  const body = $("#postingbody").first().clone();
  body.find(".print-information").remove(); // "QR Code Link to This Post" boilerplate
  // Like a browser: source whitespace (newlines included) is just a space; only <br> breaks lines.
  body.find("br").replaceWith(BR);
  const description = body
    .text()
    .replace(/\s+/g, " ")
    .replaceAll(BR, "\n")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DESCRIPTION_MAX);

  return {
    imageUrl: $('meta[property="og:image"]').attr("content")?.trim() || null,
    description,
    postedAt: parseOffsetDate($("time.date[datetime]").first().attr("datetime")),
  };
}

// Craigslist writes offsets without a colon ("-0700"), which Date doesn't
// reliably accept; normalize to "-07:00".
function parseOffsetDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim().replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}
