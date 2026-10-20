const axios = require("axios");
const cheerio = require("cheerio");

module.exports = {
  name: "r34",
  alias: ["rule34", "r34world"],
  desc: "Search and download videos from Rule34.world",
  category: "Nsfw",
  usage: `.r34 <tags>\nExample: .r34 catgirl`,
  react: "🔞",

  start: async (Yaka, m, { prefix, NSFWstatus, text }) => {
    if (NSFWstatus == "false") {
      return m.reply(`This group is not NSFW enabled!\n\nUse: *${prefix}nsfw*`);
    }

    if (!text) {
      return m.reply(
        `Please provide search tags!\n\n` +
        `Usage: *${prefix}r34 <tags>*\n` +
        `Examples:\n` +
        `• *${prefix}r34 catgirl*\n` +
        `• *${prefix}r34 3d animated*`
      );
    }

    try {
      m.reply(mess.waiting);

      // Format tags for URL (replace spaces with underscores)
      const searchTags = text.trim().replace(/\s+/g, "_");
      
      // Search rule34.world for videos
      const searchUrl = `https://rule34.world/?type=video&tags=${encodeURIComponent(searchTags)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 20000
      });

      const $ = cheerio.load(response.data);
      const postLinks = [];

      // Extract post links from search results
      // Posts are in links like /post/1421139
      $('a[href^="/post/"]').each((i, elem) => {
        const href = $(elem).attr('href');
        const postId = href.match(/\/post\/(\d+)/)?.[1];
        
        if (postId && !postLinks.find(p => p.id === postId)) {
          // Get duration from the nearby text
          const durationText = $(elem).find('.duration, [class*="duration"], .time').text().trim();
          postLinks.push({
            id: postId,
            url: `https://rule34.world${href}`,
            duration: durationText || 'Unknown'
          });
        }
      });

      if (postLinks.length === 0) {
        // Try alternative selector
        $('.box a, .post a, [class*="post"] a').each((i, elem) => {
          const href = $(elem).attr('href');
          if (href && href.includes('/post/')) {
            const postId = href.match(/\/post\/(\d+)/)?.[1];
            if (postId && !postLinks.find(p => p.id === postId)) {
              postLinks.push({
                id: postId,
                url: href.startsWith('http') ? href : `https://rule34.world${href}`,
                duration: 'Unknown'
              });
            }
          }
        });
      }

      if (postLinks.length === 0) {
        return m.reply(`No videos found for tags: *${text}*\n\nTry different tags.`);
      }

      // Pick random post
      const randomPost = postLinks[Math.floor(Math.random() * postLinks.length)];
      
      // Get post page to extract video URL
      const postResponse = await axios.get(randomPost.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 20000
      });

      // Extract video URL from the page
      const videoMatch = postResponse.data.match(/<source[^>]+src="([^"]+\.mp4|[^"]+\.mov[^"]*)"/);
      const videoUrl = videoMatch ? videoMatch[1] : null;
      
      // Alternative: construct URL from post ID pattern
      // URLs are like: https://rule34storage.b-cdn.net/posts/1421/1421139/1421139.mov720.mp4
      let finalVideoUrl = videoUrl;
      if (!finalVideoUrl) {
        const postIdStr = randomPost.id.toString();
        const folder1 = postIdStr.substring(0, 4);
        finalVideoUrl = `https://rule34storage.b-cdn.net/posts/${folder1}/${randomPost.id}/${randomPost.id}.mov720.mp4`;
      }

      // Also try to get post info from the JSON state in the page
      const jsonMatch = postResponse.data.match(/<script id="ng-state"[^>]*>({.+})<\/script>/);
      let postInfo = { title: 'Rule34 Video', duration: randomPost.duration };
      
      if (jsonMatch) {
        try {
          const ngState = JSON.parse(jsonMatch[1]);
          const postDataKey = Object.keys(ngState).find(k => k.includes('/api/v2/post/'));
          if (postDataKey && ngState[postDataKey]) {
            const postData = ngState[postDataKey];
            postInfo = {
              title: postData.tags?.slice(0, 3).map(t => t.value).join(', ') || 'Rule34 Video',
              duration: postData.duration ? `${postData.duration}s` : randomPost.duration,
              width: postData.width,
              height: postData.height
            };
          }
        } catch (e) {
          console.log('Failed to parse ng-state:', e.message);
        }
      }

      // Send video info first
      await Yaka.sendMessage(m.from, {
        text: `🔞 *Rule34.world Video*\n\n` +
              `🏷️ *Tags:* ${text}\n` +
              `⏱️ *Duration:* ${postInfo.duration}\n` +
              `📐 *Resolution:* ${postInfo.width || '?'}x${postInfo.height || '?'}\n` +
              `⬇️ *Downloading...*`
      }, { quoted: m });

      // Send the video
      await Yaka.sendMessage(m.from, {
        video: { url: finalVideoUrl },
        mimetype: 'video/mp4',
        caption: `🔞 *Rule34.world*\n\n` +
                 `Tags: ${text}\n` +
                 `Duration: ${postInfo.duration}\n\n` +
                 `*${botName}*`
      }, { quoted: m });

    } catch (error) {
      console.error("R34 Error:", error);
      
      if (error.response) {
        console.log("Status:", error.response.status);
        console.log("Headers:", error.response.headers);
      }
      
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