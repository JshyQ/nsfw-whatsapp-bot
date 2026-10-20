const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");

/* ============================= NETWORK LAYER ============================= */

const SITE = "https://www.xvideos.com";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 20000,
  maxSockets: 6,
  family: 4, // IPv4 only — avoids container IPv6 happy-eyeballs stalls
  timeout: 45000,
});

const BASE_HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  Referer: "https://www.xvideos.com/",
};

const TIMEOUT = 30000;
const RETRIES = 3;
const MAX_PAGE = 3; // xvideos pages are 0-indexed: 0, 1, 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookieJar = "";
let warmedUp = false;

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
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
  });
  cookieJar = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
};

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
      console.log(`[xv] ${url} try ${attempt}/${tries} -> ${err.code || err.message}`);
      if (attempt < tries) await sleep(900 * attempt);
    }
  }
  throw lastError;
}

async function warmUp() {
  if (warmedUp) return;
  warmedUp = true;
  try {
    await getHtml(SITE + "/", { tries: 1, timeout: 20000 });
    console.log("[xv] warm-up ok");
  } catch (err) {
    console.log("[xv] warm-up failed:", err.code || err.message);
  }
}

/* =============================== HELPERS =============================== */

const abs = (u) =>
  !u
    ? ""
    : /^(https?:|data:)/i.test(u)
    ? u
    : `${SITE}${u.startsWith("/") ? "" : "/"}${u}`;

const clean = (u) => (u || "").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();

const shuffledPages = (n) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// xvideos exposes player sources as plain html5player.setVideoUrl*() calls
const PLAYER_PATTERNS = [
  /html5player\.setVideoUrlHigh\(\s*['"]([^'"]+)['"]/i,
  /html5player\.setVideoUrlLow\(\s*['"]([^'"]+)['"]/i,
  /"video_url"\s*:\s*"([^"]+)"/i,
  /"contentUrl"\s*:\s*"([^"]+)"/i,
  /property=["']og:video["'][^>]*content=["']([^"']+)["']/i,
  /content=["']([^"']+)["'][^>]*property=["']og:video["']/i,
  /html5player\.setVideoUrlHLS\(\s*['"]([^'"]+)['"]/i, // m3u8, last resort
];

const extractVideoUrl = (html) => {
  // prefer a real .mp4 over the HLS playlist
  for (const re of PLAYER_PATTERNS) {
    const m = html.match(re);
    if (m && m[1] && /\.mp4/i.test(m[1])) return clean(m[1]);
  }
  for (const re of PLAYER_PATTERNS) {
    const m = html.match(re);
    if (m && m[1]) return clean(m[1]);
  }
  return null;
};

/* =============================== PLUGIN ================================ */

module.exports = {
  name: "xvideos",
  alias: ["xv", "xvid"],
  desc: "Search xvideos and send a random matching video",
  category: "Nsfw",
  usage: `.xv <tags>\nExample: .xv cosplay`,
  react: "🔞",

  start: async (Yaka, m, { prefix, NSFWstatus, text }) => {
    if (NSFWstatus == "true") {
      return m.reply(`This group is not NSFW enabled!\n\nUse: *${prefix}nsfw*`);
    }

    if (!text) {
      return m.reply(
        `Please provide search tags!\n\n` +
          `Usage: *${prefix}xv <tags>*\n` +
          `Examples:\n` +
          `• *${prefix}xv cosplay*\n` +
          `• *${prefix}xv anime*\n` +
          `• *${prefix}xv milf ebony*`
      );
    }

    try {
      m.reply(mess.waiting);

      const tags = text.trim();
      const query = encodeURIComponent(tags).replace(/%20/g, "+");

      await warmUp();

      /* ---------- 1. search ---------- */
      const scrapePage = async (page) => {
        const html = await getHtml(`${SITE}/?k=${query}&p=${page}`, { tries: 2 });
        const $ = cheerio.load(html);
        const found = [];

        // anchor-first: survives a container class rename
        $('a[href^="/video"]').each((i, el) => {
          const href = $(el).attr("href") || "";
          if (!/^\/video[.\w]+\/.+/.test(href)) return;

          const id = href.match(/^\/video[.]?([\w]+)/)?.[1];
          if (!id || found.some((v) => v.id === id)) return;

          const block = $(el).closest("div.thumb-block");
          const img = $(el).find("img").first().length
            ? $(el).find("img").first()
            : block.find("img").first();

          const rawThumb =
            img.attr("data-src") || img.attr("data-thumb-url") || img.attr("src") || "";

          found.push({
            id,
            title:
              (
                img.attr("alt") ||
                $(el).attr("title") ||
                block.find(".title").text() ||
                ""
              ).trim() || `Video ${i + 1}`,
            thumb: /^data:/i.test(rawThumb) ? "" : abs(rawThumb),
            duration: block.find(".duration").first().text().trim() || null,
            url: SITE + href,
          });
        });

        return found;
      };

      // random first choice, page 0 always second so one slow page can't kill it
      const order = shuffledPages(MAX_PAGE);
      if (order[0] !== 0) {
        order.splice(order.indexOf(0), 1);
        order.splice(1, 0, 0);
      }

      let videos = [];
      let reached = false;

      for (const page of order) {
        try {
          videos = await scrapePage(page);
          reached = true;
          console.log(`[xv] page ${page} -> ${videos.length} videos`);
          if (videos.length) break;
        } catch (err) {
          console.log(`[xv] page ${page} failed: ${err.code || err.message}`);
        }
      }

      if (!videos.length) {
        return m.reply(
          reached
            ? `No videos found for tags: *${tags}*\n\nTry different tags.`
            : `⚠️ Couldn't reach xvideos for tags: *${tags}*\n\nTry again in a moment.`
        );
      }

      const pick = videos[Math.floor(Math.random() * videos.length)];

      /* ---------- 2. direct mp4 (never fatal) ---------- */
      let videoUrl = null;

      try {
        videoUrl = extractVideoUrl(await getHtml(pick.url, { tries: 2, timeout: 25000 }));
      } catch (err) {
        console.log("[xv] video page failed:", err.code || err.message);
      }

      if (!videoUrl) {
        // embedframe is a much lighter page carrying the same player calls
        try {
          videoUrl = extractVideoUrl(
            await getHtml(`${SITE}/embedframe/${pick.id}`, { tries: 2, timeout: 20000 })
          );
          if (videoUrl) console.log("[xv] recovered via embedframe");
        } catch (err) {
          console.log("[xv] embedframe failed:", err.code || err.message);
        }
      }

      /* ---------- 3. info card ---------- */
      const info =
        `🔞 *xvideos*\n\n` +
        `🏷️ *Tags:* ${tags}\n` +
        `📌 *Title:* ${pick.title}\n` +
        (pick.duration ? `⏱️ *Duration:* ${pick.duration}\n` : "") +
        `📊 *Found:* ${videos.length} videos\n` +
        `🔗 ${pick.url}\n\n` +
        (videoUrl ? `⬇️ *Sending video...*` : `⚠️ *No direct link — open the URL above.*`);

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

      /* ---------- 4. send it ---------- */
      const caption =
        `🔞 *xvideos*\n\nTags: ${tags}\n` +
        (pick.duration ? `Duration: ${pick.duration}\n` : "") +
        `\n*${botName}*`;

      try {
        await Yaka.sendMessage(
          m.from,
          { video: { url: videoUrl }, mimetype: "video/mp4", caption },
          { quoted: m }
        );
      } catch (urlErr) {
        console.log("[xv] stream failed, buffering:", urlErr.message);
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
      console.error("xvideos Error:", error);
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