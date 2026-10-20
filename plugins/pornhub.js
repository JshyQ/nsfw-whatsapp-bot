const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");

/* ================================================================== */
/*  NETWORK LAYER                                                      */
/*  Pornhub stalls datacenter IPs: force IPv4, look like a browser,    */
/*  carry cookies, retry with backoff, reuse the TLS socket.           */
/* ================================================================== */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// family:4 kills the IPv6 happy-eyeballs stall inside containers
const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 20000,
  maxSockets: 6,
  family: 4,
  timeout: 45000,
});

const BASE_HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate", // dropping "br" removes one more stall vector
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "no-cache",
  Referer: "https://www.pornhub.com/",
};

const TIMEOUT = 30000;
const RETRIES = 3;
const MAX_PAGE = 3;

const OG_APP_ID =
  process.env.OPENGRAPH_APP_ID || "c9d8a234-247c-4bc1-9dbd-dc48a67bb423";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookieJar = "";
let warmedUp = false;
const KEEP_COOKIES = ["PHPSESSID", "platform", "ss"];

const mergeCookies = (setCookie) => {
  if (!setCookie) return;
  const jar = new Map();
  cookieJar
    .split("; ")
    .filter(Boolean)
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    });
  [].concat(setCookie).forEach((raw) => {
    const pair = raw.split(";")[0];
    const i = pair.indexOf("=");
    if (i < 1) return;
    const key = pair.slice(0, i).trim();
    if (KEEP_COOKIES.includes(key)) jar.set(key, pair.slice(i + 1));
  });
  cookieJar = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
};

/** GET text with retries. Only throws when every attempt fails. */
async function getHtml(url, { tries = RETRIES, timeout = TIMEOUT } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: cookieJar ? { ...BASE_HEADERS, Cookie: cookieJar } : BASE_HEADERS,
        httpsAgent: agent,
        timeout,
        maxRedirects: 5,
        decompress: true,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      mergeCookies(res.headers["set-cookie"]);
      return res.data;
    } catch (err) {
      lastError = err;
      console.log(
        `[pornhub] ${url} try ${attempt}/${tries} -> ${err.code || err.message}`
      );
      if (attempt < tries) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

/** One homepage hit: warms the socket + grabs cookies. Runs once. */
async function warmUp() {
  if (warmedUp) return;
  warmedUp = true;
  try {
    await getHtml("https://www.pornhub.com/", { tries: 1, timeout: 20000 });
    console.log("[pornhub] warm-up ok");
  } catch (err) {
    console.log("[pornhub] warm-up failed:", err.code || err.message);
  }
}

/** Last-resort direct link via opengraph.io (pornhub pages are JS-rendered). */
async function videoViaOpenGraph(pageUrl) {
  if (!OG_APP_ID) return null;
  try {
    const api = new URL(
      "https://opengraph.io/api/3.0/site/" + encodeURIComponent(pageUrl)
    );
    api.searchParams.set("app_id", OG_APP_ID);
    api.searchParams.set("full_render", "true");
    const { data } = await axios.get(api.toString(), { timeout: 45000 });
    return data?.hybridGraph?.video || data?.htmlInferred?.video || null;
  } catch (err) {
    console.log("[pornhub] opengraph fallback failed:", err.message);
    return null;
  }
}

/* ================================================================== */
/*  HELPERS                                                            */
/* ================================================================== */

const abs = (url) =>
  !url
    ? ""
    : /^https?:\/\//i.test(url)
    ? url
    : `https://www.pornhub.com${url.startsWith("/") ? "" : "/"}${url}`;

const toDuration = (raw) => {
  const secs = Number(raw);
  if (!raw || !Number.isFinite(secs) || secs <= 0) return null;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
};

const shuffled = (n) => {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ================================================================== */
/*  PLUGIN                                                             */
/* ================================================================== */

module.exports = {
  name: "pornhub",
  alias: ["ph", "porn"],
  desc: "Search Pornhub and send a random matching video",
  category: "Nsfw",
  usage: `.pornhub <tags>\nExample: .ph catgirl`,
  react: "🔞",

  start: async (Yaka, m, { prefix, NSFWstatus, text }) => {
    if (NSFWstatus == "false") {
      return m.reply(`This group is not NSFW enabled!\n\nUse: *${prefix}nsfw*`);
    }

    if (!text) {
      return m.reply(
        `Please provide search tags!\n\n` +
          `Usage: *${prefix}pornhub <tags>*\n` +
          `Examples:\n` +
          `• *${prefix}ph catgirl*\n` +
          `• *${prefix}ph anime cosplay*`
      );
    }

    try {
      m.reply(mess.waiting);

      const tags = text.trim();
      const query = encodeURIComponent(tags).replace(/%20/g, "+");

      await warmUp();

      /* ---------- 1. search, trying several pages ---------- */
      const scrapePage = async (page) => {
        const html = await getHtml(
          `https://www.pornhub.com/video/search?search=${query}&page=${page}`,
          { tries: 2 }
        );

        const $ = cheerio.load(html);
        const found = [];

        $('a[href*="viewkey="]').each((i, el) => {
          const href = $(el).attr("href") || "";
          const viewKey = href.match(/viewkey=([a-zA-Z0-9]+)/)?.[1];
          if (!viewKey || found.some((v) => v.viewKey === viewKey)) return;

          const img = $(el).find("img").first();
          found.push({
            viewKey,
            title:
              (img.attr("alt") || $(el).attr("title") || "").trim() ||
              `Video ${i + 1}`,
            thumb: abs(
              img.attr("data-src") ||
                img.attr("data-mediumthumb") ||
                img.attr("data-thumb_url") ||
                img.attr("src")
            ),
            duration:
              $(el)
                .closest("li")
                .find(".duration, var.duration, .video-duration")
                .first()
                .text()
                .trim() || null,
            url: `https://www.pornhub.com/view_video.php?viewkey=${viewKey}`,
          });
        });

        return found;
      };

      // random first choice, but page 1 is always second so a stall can't kill us
      const order = shuffled(MAX_PAGE);
      if (order[0] !== 1) {
        order.splice(order.indexOf(1), 1);
        order.splice(1, 0, 1);
      }

      let videos = [];
      let reached = false;

      for (const page of order) {
        try {
          videos = await scrapePage(page);
          reached = true;
          console.log(`[pornhub] page ${page} -> ${videos.length} videos`);
          if (videos.length) break;
        } catch (err) {
          console.log(`[pornhub] page ${page} failed: ${err.code || err.message}`);
        }
      }

      if (!videos.length) {
        return m.reply(
          reached
            ? `No videos found for tags: *${tags}*\n\nTry different tags.`
            : `⚠️ Couldn't reach Pornhub for tags: *${tags}*\n\n` +
              `Every page timed out. Try again in a moment.`
        );
      }

      const pick = videos[Math.floor(Math.random() * videos.length)];

      /* ---------- 2. video page (never fatal) ---------- */
      let videoUrl = null;
      let duration = pick.duration || "Unknown";

      try {
        const pageHtml = await getHtml(pick.url, { tries: 2, timeout: 25000 });
        const $$ = cheerio.load(pageHtml);

        videoUrl =
          $$('meta[property="og:video"]').attr("content") ||
          $$('meta[property="og:video:url"]').attr("content") ||
          $$('meta[property="og:video:secure_url"]').attr("content");

        if (!videoUrl) {
          const scripts = $$("script")
            .map((i, el) => $$(el).html() || "")
            .get()
            .join(" ");
          videoUrl = scripts.match(/"videoUrl"\s*:\s*"([^"]+)"/i)?.[1] || null;
        }
        if (videoUrl) videoUrl = videoUrl.replace(/\\/g, "");

        duration =
          toDuration(
            $$('meta[property="video:duration"]').attr("content") ||
              $$('meta[property="og:duration"]').attr("content")
          ) ||
          pick.duration ||
          "Unknown";
      } catch (err) {
        console.log("[pornhub] video page failed:", err.code || err.message);
        videoUrl = await videoViaOpenGraph(pick.url);
      }

      /* ---------- 3. info card ---------- */
      const info =
        `🔞 *Pornhub Video*\n\n` +
        `🏷️ *Tags:* ${tags}\n` +
        `📌 *Title:* ${pick.title}\n` +
        `⏱️ *Duration:* ${duration}\n` +
        `📊 *Found:* ${videos.length} videos\n` +
        `🔗 ${pick.url}\n\n` +
        (videoUrl
          ? `⬇️ *Sending video...*`
          : `⚠️ *No direct link — open the URL above.*`);

      if (pick.thumb) {
        try {
          await Yaka.sendMessage(
            m.from,
            { image: { url: pick.thumb }, caption: info },
            { quoted: m }
          );
        } catch {
          await Yaka.sendMessage(m.from, { text: info }, { quoted: m });
        }
      } else {
        await Yaka.sendMessage(m.from, { text: info }, { quoted: m });
      }

      if (!videoUrl) return;

      /* ---------- 4. send the video ---------- */
      const caption =
        `🔞 *Pornhub*\n\nTags: ${tags}\nDuration: ${duration}\n\n*${botName}*`;

      try {
        await Yaka.sendMessage(
          m.from,
          { video: { url: videoUrl }, mimetype: "video/mp4", caption },
          { quoted: m }
        );
      } catch (urlErr) {
        console.log("[pornhub] stream failed, buffering:", urlErr.message);
        const { data } = await axios.get(videoUrl, {
          headers: { ...BASE_HEADERS, Referer: pick.url },
          httpsAgent: agent,
          responseType: "arraybuffer",
          timeout: 60000,
          maxContentLength: 150 * 1024 * 1024,
        });
        await Yaka.sendMessage(
          m.from,
          { video: Buffer.from(data), mimetype: "video/mp4", caption },
          { quoted: m }
        );
      }
    } catch (error) {
      console.error("Pornhub Error:", error);
      m.reply(
        `❌ *Error*\n\n` +
          `Failed to fetch video.\n` +
          `Error: ${error.message}\n\n` +
          `Possible reasons:\n` +
          `• Site is blocking requests\n` +
          `• No videos found for these tags\n` +
          `• Network timeout`
      );
    }
  },
};