const config = require('./settings/config');
const fs = require('fs');
const crypto = require("crypto");
const path = require("path");
const os = require('os');
const chalk = require("chalk");
const axios = require('axios');
const { exec } = require('child_process');
const { dechtml, fetchWithTimeout } = require('./library/function');       
const { tempfiles } = require("./library/uploader");
const { fquoted } = require('./library/quoted');     
const Api = require('./library/Api');
const { makeLog, secs } = require('./library/botlog');
const { handleAddPlugin } = require('./library/pluginAdder');
require('./library/compat'); // globals (mess, botName) that plugins from other bot bases expect
const cmdLog = makeLog('cmd');

// config.js reloads itself, but the `config` const above is captured once at load,
// so read the mode through a fresh require or it would go stale.
const isPublicMode = () => require('./settings/config').status?.public !== false;

const image = fs.readFileSync('./thumbnail/image.jpg');
const docu = fs.readFileSync('./thumbnail/document.jpg');

let jidNormalizedUser, getContentType, isPnUser;

const loadBaileysUtils = async () => {
    const baileys = await import('@whiskeysockets/baileys');
    jidNormalizedUser = baileys.jidNormalizedUser;
    getContentType = baileys.getContentType;
    isPnUser = baileys.isPnUser;
};

// Plugin Loader System with Menu Categorization
class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.categories = new Map();
        this.pluginFiles = new Map(); // command or alias -> plugin file that provides it
        this.loadReport = new Map();  // plugin file -> { ok, command, aliases, category } or { ok: false, error }
        this.pluginsDir = path.join(__dirname, 'plugins');
        this.defaultCategories = {
            'ai': '🤖 AI MENU',
            'downloader': '📥 DOWNLOAD MENU',
            'fun': '🎮 FUN MENU',
            'general': '⚡ GENERAL MENU',
            'group': '👥 GROUP MENU',
            'owner': '👑 OWNER MENU',
            'other': '📦 OTHER MENU',
            'tools': '🛠️ TOOLS MENU',
            'video': '🎬 VIDEO MENU',
            'story': '📸 STORY MENU',
            'search': '🔍 SEARCH MENU'
        };
        this.loadPlugins();
    }

    loadPlugins() {
        try {
            // Create plugins directory if it doesn't exist
            if (!fs.existsSync(this.pluginsDir)) {
                fs.mkdirSync(this.pluginsDir, { recursive: true });
                console.log(chalk.cyan('📁 Created plugins directory'));
                return;
            }

            // Read all plugin files
            const pluginFiles = fs.readdirSync(this.pluginsDir).filter(file => 
                file.endsWith('.js') && !file.startsWith('_')
            );

            // Clear existing plugins and categories
            this.plugins.clear();
            this.categories.clear();

            // Initialize categories
            Object.keys(this.defaultCategories).forEach(cat => {
                this.categories.set(cat, []);
            });

            this.pluginFiles.clear();
            this.loadReport.clear();

            // Load each plugin
            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(this.pluginsDir, file);
                    const plugin = require(pluginPath);
                    const info = this.registerPlugin(plugin, file);

                    if (info) {
                        console.log(chalk.green(`✅ Loaded plugin: ${info.command} (${info.category})`));
                    } else {
                        this.loadReport.set(file, { ok: false, error: 'invalid plugin structure (needs a command/name and an execute/start function)' });
                        console.log(chalk.yellow(`⚠️  Invalid plugin structure in: ${file}`));
                    }
                } catch (error) {
                    this.loadReport.set(file, { ok: false, error: error.message });
                    console.log(chalk.red(`❌ Failed to load plugin ${file}:`, error.message));
                }
            }

            // an alias only counts if it still points at its own file (a later file's real command can take the name)
            for (const [file, info] of this.loadReport) {
                if (info.ok) info.aliases = info.aliases.filter((a) => this.pluginFiles.get(a) === file);
            }

            console.log(chalk.cyan(`📦 Loaded ${this.plugins.size} plugins across ${this.categories.size} categories`));
        } catch (error) {
            console.log(chalk.red('❌ Error loading plugins:', error.message));
        }
    }

    // Accepts both plugin formats:
    //   { command, description, category, owner, execute(sock, m, ctx) }
    //   { name, alias: [..], desc, category, react, start(sock, m, ctx) }   (common in other bots)
    registerPlugin(plugin, file) {
        if (!plugin || typeof plugin !== 'object') return null;
        const command = String(plugin.command || plugin.name || '').trim().toLowerCase();
        const run = typeof plugin.execute === 'function' ? plugin.execute
            : (typeof plugin.start === 'function' ? plugin.start : null);
        if (!command || !run) return null;

        plugin.command = command;
        plugin.execute = run;
        if (!plugin.description && plugin.desc) plugin.description = plugin.desc;
        const category = String(plugin.category || 'general').trim().toLowerCase();
        plugin.category = category;

        if (!this.categories.has(category)) this.categories.set(category, []);
        this.plugins.set(command, plugin);
        this.pluginFiles.set(command, file);
        this.categories.get(category).push(command);

        // aliases run the same plugin but never take over a command that another file already provides
        const aliases = [];
        for (const raw of [].concat(plugin.alias || plugin.aliases || [])) {
            const a = String(raw).trim().toLowerCase();
            if (!a || a === command) continue;
            if (this.plugins.has(a) && this.pluginFiles.get(a) !== file) continue;
            this.plugins.set(a, plugin);
            this.pluginFiles.set(a, file);
            aliases.push(a);
        }

        const info = { ok: true, command, aliases, category };
        this.loadReport.set(file, info);
        return info;
    }

    async executePlugin(command, sock, m, args, text, q, quoted, mime, qmsg, isMedia, groupMetadata, groupName, participants, groupOwner, groupAdmins, isBotAdmins, isAdmins, isGroupOwner, isCreator, prefix, reply, sender) {
        const plugin = this.plugins.get(command);
        if (!plugin) return false;

        try {
            // Check if plugin is owner-only
            if (plugin.owner && !isCreator) {
                return true; // Silent - don't respond
            }

            // Check if plugin is group-only
            if (plugin.group && !m.isGroup) {
                return true; // Silent - don't respond
            }

            // Check if plugin requires admin
            if (plugin.admin && m.isGroup && !isAdmins && !isCreator) {
                return true; // Silent - don't respond
            }

            cmdLog(`Running ${prefix}${command}${text ? ' ' + String(text).slice(0, 60) : ''}`);
            if (typeof plugin.react === 'string' && plugin.react) sock.sendMessage(m.chat, { react: { text: plugin.react, key: m.key } }).catch(() => {});
            const cmdStart = Date.now();
            await plugin.execute(sock, m, {
                args,
                text,
                q,
                quoted,
                mime,
                qmsg,
                isMedia,
                groupMetadata,
                groupName,
                participants,
                groupOwner,
                groupAdmins,
                isBotAdmins,
                isAdmins,
                isGroupOwner,
                isCreator,
                prefix,
                reply,
                config: require('./settings/config'), // fresh copy each command, so edits to config.js apply without a restart
                pluginLoader: this,
                NSFWstatus: 'true', // other bot bases pass this per group; this bot is owner-only, so always allowed
                isAdmin: isAdmins,
                isBotAdmin: isBotAdmins,
                pushName: m.pushName,
                sender
            });
            cmdLog(`Finished ${prefix}${command} in ${secs(cmdStart)}`, 'ok');
            return true;
        } catch (error) {
            cmdLog(`${prefix}${command} crashed: ${error.message || error}`, 'err');
            console.log(chalk.red(`❌ Error executing plugin ${command}:`, error));
            return true; // Silent - don't respond with error
        }
    }

    getPluginCommands() {
        return Array.from(this.plugins.keys());
    }

    getMenuSections() {
        const sections = [];
        
        // Sort categories alphabetically by their display name
        const sortedCategories = Array.from(this.categories.entries())
            .filter(([category, commands]) => commands.length > 0 && this.defaultCategories[category])
            .sort(([catA], [catB]) => {
                const nameA = this.defaultCategories[catA];
                const nameB = this.defaultCategories[catB];
                return nameA.localeCompare(nameB);
            });
        
        for (const [category, commands] of sortedCategories) {
            const categoryName = this.defaultCategories[category];
            // Sort commands alphabetically
            const sortedCommands = commands.sort();
            const commandList = sortedCommands.map(cmd => {
                const plugin = this.plugins.get(cmd);
                return `︱✗ ${cmd}${plugin.description ? ` - ${plugin.description}` : ''}`;
            }).join('\n');
            
            sections.push(`╾─╼▣ ${categoryName}\n${commandList}\n╿─╼▣`);
        }
        
        return sections.join('\n\n');
    }

    getPluginCount() {
        let count = 0;
        for (const commands of this.categories.values()) {
            count += commands.length;
        }
        return count;
    }

    reloadPlugins() {
        // Clear require cache for plugin files
        const pluginFiles = fs.readdirSync(this.pluginsDir).filter(file => 
            file.endsWith('.js') && !file.startsWith('_')
        );

        for (const file of pluginFiles) {
            const pluginPath = path.join(this.pluginsDir, file);
            delete require.cache[require.resolve(pluginPath)];
        }

        // Reload plugins
        this.loadPlugins();
    }
}

// Initialize plugin loader
const pluginLoader = new PluginLoader();

module.exports = sock = async (sock, m, chatUpdate, store) => {
    try {
        if (!jidNormalizedUser || !getContentType || !isPnUser) {
            await loadBaileysUtils();
        }

        const body = (
            m.mtype === "conversation" ? m.message.conversation :
            m.mtype === "imageMessage" ? m.message.imageMessage.caption :
            m.mtype === "videoMessage" ? m.message.videoMessage.caption :
            m.mtype === "documentMessage" ? m.message.documentMessage.caption :
            m.mtype === "extendedTextMessage" ? m.message.extendedTextMessage.text :
            m.mtype === "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
            m.mtype === "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
            m.mtype === "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
            m.mtype === "interactiveResponseMessage" ? JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson).id :
            m.mtype === "messageContextInfo" ? m.message.buttonsResponseMessage?.selectedButtonId ||
            m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text : ""
        );
        
        const sender = m.key.fromMe ? sock.user.id.split(":")[0] + "@s.whatsapp.net" ||
              sock.user.id : m.key.participant || m.key.remoteJid;
        
        const senderNumber = sender.split('@')[0];
        const budy = (typeof m.text === 'string' ? m.text : '');
        const prefa = ["", "!", ".", ",", "🤖", "🗿"];

        const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤Ω Φ_&><`™©®Δ^βα~¦|/\\©^]/;
        const prefix = prefixRegex.test(body) ? body.match(prefixRegex)[0] : '.';
        const from = m.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const botNumber = await sock.decodeJid(sock.user.id);
        const isBot = botNumber.includes(senderNumber);
        
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const command2 = body.replace(prefix, '').trim().split(/ +/).shift().toLowerCase();
        const args = body.trim().split(/ +/).slice(1);
        const pushname = m.pushName || "No Name";
        const text = q = args.join(" ");
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || '';
        const qmsg = (quoted.msg || quoted);
        const isMedia = /image|video|sticker|audio/.test(mime);
        const groupMetadata = m?.isGroup ? await sock.groupMetadata(m.chat).catch(() => ({})) : {};
        const groupName = m?.isGroup ? groupMetadata.subject || '' : '';
        
        const participants = m?.isGroup ? groupMetadata.participants?.map(p => {
            let admin = null;
            if (p.admin === 'superadmin') admin = 'superadmin';
            else if (p.admin === 'admin') admin = 'admin';
            return {
                id: p.id || null,
                lid: p.lid || null,
                phoneNumber: p.phoneNumber || null,
                admin,
                full: p
            };
        }) || [] : [];
        
        const groupOwner = m?.isGroup ? groupMetadata.owner || '' : '';
        const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
        const isBotAdmins = m?.isGroup ? groupAdmins.includes(botNumber) : false;
        const isAdmins = m?.isGroup ? groupAdmins.includes(m.sender) : false;
        const isGroupOwner = m?.isGroup ? groupOwner === m.sender : false;
        // index.js marks the real owner here. Everyone else is allowed too when status.public is on.
        const isCreator = m.isOwner === true;
        if (!isCreator && !isPublicMode()) return;

        if (isCmd) {
            console.log(chalk.hex("#6c5ce7")("# New Message"));
            console.log(`- Date  : ${chalk.white(new Date().toLocaleString())}`);
            console.log(`- Message    : ${chalk.white(command)}`);
            console.log(`- Sender : ${chalk.white(pushname)}`);
            console.log(`- JID      : ${chalk.white(senderNumber)}`);
            console.log(`ㅤ\n`);
        }
        
        async function reply(text) {
            sock.sendMessage(m.chat, {
                text: text,
                contextInfo: {
                    mentionedJid: [sender],
                    externalAdReply: {
                        title: config.settings.title,
                        body: config.settings.description,
                        thumbnailUrl: config.thumbUrl,
                        renderLargerThumbnail: false,
                    }
                }
            }, { quoted: m });
        }

        // Owner sends a .js file as a Document without a command -> add it as a plugin
        // (turn off with plugins.autoAdd: false in settings/config.js; .addplugin still works)
        if (!isCmd && m.mtype === 'documentMessage' && /\.js$/i.test(m.msg?.fileName || '')
            && require('./settings/config').plugins?.autoAdd !== false) {
            await handleAddPlugin(sock, m, { quoted: m, reply, config: require('./settings/config'), pluginLoader, prefix });
            return;
        }

        // Try to execute plugin first
        const pluginExecuted = await pluginLoader.executePlugin(
            command, sock, m, args, text, q, quoted, mime, qmsg, isMedia, 
            groupMetadata, groupName, participants, groupOwner, groupAdmins, 
            isBotAdmins, isAdmins, isGroupOwner, isCreator, prefix, reply, sender
        );

        // If plugin was executed, stop here
        if (pluginExecuted) return;

        // Only built-in essential commands remain
        switch (command) {
            case 'menu': {
                const usedMem = process.memoryUsage().heapUsed / 1024 / 1024;
                const totalMem = os.totalmem() / 1024 / 1024 / 1024;
                const memPercent = (usedMem / (totalMem * 1024)) * 100;
                const ramBar = '▣'.repeat(Math.floor(memPercent / 20)) + '▢'.repeat(5 - Math.floor(memPercent / 20));
                const uptimeSec = process.uptime();
                const days = Math.floor(uptimeSec / (3600 * 24));
                const hours = Math.floor((uptimeSec % (3600 * 24)) / 3600);
                const minutes = Math.floor((uptimeSec % 3600) / 60);
                const seconds = Math.floor(uptimeSec % 60);
                const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                const ping = Date.now() - m.messageTimestamp * 1000;
                const host = os.platform();
                const mode = isPublicMode() ? 'Public (everyone)' : 'Owner only';

                const pluginMenuSections = pluginLoader.getMenuSections();
                const totalCommands = pluginLoader.getPluginCount();

                const K0MRAID = `
╔〘 *WA-BASE-BOT* 
║ 👑 *Owner:* +${config.owner}
║ 🧩 *Prefix:* [ . ]
║ 🖥️ *Host:* ${host}
║ 🧠 *Commands:* ${totalCommands}
║ ⚙️ *Mode:* ${mode}
║ ⏱️ *Uptime:* ${uptime}
║ ⚡ *Ping:* ${ping.toFixed(0)} ms
║ 📊 *RAM Used:* ${usedMem.toFixed(2)} MB / ${totalMem.toFixed(2)} GB
║ 🧬 *RAM:* [${ramBar}] ${memPercent.toFixed(2)}%
╚═〘 *System Status*

${pluginMenuSections}`;

                await sock.sendMessage(m.chat, {
                    image: image,
                    caption: K0MRAID,
                    contextInfo: {
                        mentionedJid: [m.sender],
                        forwardingScore: 1,
                        isForwarded: false,
                        externalAdReply: {
                            title: "Simple WA Base Bot",
                            body: "Official Dev Account URL",
                            mediaType: 3,
                            thumbnailUrl: config.thumbUrl,
                            mediaUrl: "https://t.me/debrajzero",
                            sourceUrl: "https://t.me/debrajzero",
                            showAdAttribution: true,
                            renderLargerThumbnail: false
                        }
                    }
                }, { quoted: m });
                break;
            }
            
            case 'reload': {
                if (!isCreator) return; // Silent - don't respond
                pluginLoader.reloadPlugins();
                await reply(`✅ Plugins reloaded! Loaded ${pluginLoader.getPluginCount()} commands across ${pluginLoader.categories.size} categories.`);
                break;
            }

            // .public -> everyone can use the bot (groups + DMs)   |   .self -> owner only
            case 'public':
            case 'self': {
                if (!isCreator) return reply(mess.owner);
                const on = command === 'public' ? 'true' : 'false';
                try {
                    const cfgPath = path.join(__dirname, 'settings', 'config.js');
                    const src = fs.readFileSync(cfgPath, 'utf8');
                    const next = src.replace(/(\bpublic:\s*)(true|false)/, `$1${on}`);
                    if (next === src) throw new Error('no "public:" flag found in settings/config.js');
                    fs.writeFileSync(cfgPath, next);
                    await reply(
                        `✅ Mode set to *${on === 'true' ? 'PUBLIC' : 'SELF'}*\n\n` +
                        (on === 'true'
                            ? 'Everyone can now use the bot in groups and in DMs.'
                            : 'Only the owner can use the bot now.')
                    );
                } catch (e) {
                    await reply(`❌ Could not change the mode: ${e.message}`);
                }
                break;
            }
            
            // No default case - stay silent for unknown commands
        }
    } catch (err) {
        console.log(require("util").format(err));
    }
};

let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
    delete require.cache[file];
    require(file);
});
