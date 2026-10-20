// Add a plugin by sending its .js file to the bot (owner only).
//
// Flow: download the file -> basic safety/shape check -> install missing npm packages ->
//       save to plugins/ (old file backed up) -> reload plugins -> if the plugin did not load,
//       put everything back exactly as it was and tell the owner why.
//
// Config (settings/config.js), all optional:
//   plugins: { autoAdd: true, autoInstall: true }

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { makeLog, secs } = require('./botlog');
const { looksLikeEsmLibrary, convertEsmToCjs, introspectLibrary, buildWrapperSource } = require('./libraryWrap');

const ROOT = path.join(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const BACKUP_DIR = path.join(PLUGINS_DIR, '_backup');
const MAX_BYTES = 1024 * 1024; // a plugin is a small text file; refuse anything bigger than 1 MB
const MAX_PACKAGES = 5;
const PKG_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const BUILTIN = new Set(require('module').builtinModules.map((b) => b.replace(/^node:/, '')));

// "my plugin (1).js" -> "my_plugin.js"; no paths, no hidden/underscore names (those are skipped by the loader)
const safeFileName = (raw) => {
    let name = path.basename(String(raw || '')).replace(/\s*\(\d+\)(?=\.js$)/i, '');
    name = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '');
    if (!/\.js$/i.test(name) || name.length <= 3) return null;
    return name.slice(0, -3) + '.js';
};

// Cheap static check BEFORE anything is executed, so a wrong file (index.js, a config...) is never loaded.
const looksLikePlugin = (src) => {
    const hasExport = /module\.exports|(^|[^.\w])exports\.\w+\s*=/.test(src);
    const hasId = /\b(command|name)\s*:/.test(src) || /\.(command|name)\s*=/.test(src);
    const hasRun = /\b(execute|start)\s*[:(]/.test(src) || /\.(execute|start)\s*=/.test(src);
    const isBotCore = /makeWASocket|useMultiFileAuthState/.test(src);
    return hasExport && hasId && hasRun && !isBotCore;
};

const isInstalled = (name) => fs.existsSync(path.join(ROOT, 'node_modules', name));

// npm packages the file require()s that are not installed yet
const findMissingPackages = (src) => {
    const specs = new Set();
    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
    for (const m of src.matchAll(/^[ \t]*import\s+[^'"\n]*from\s*['"]([^'"]+)['"]/gm)) specs.add(m[1]);
    for (const m of src.matchAll(/^[ \t]*import\s*['"]([^'"]+)['"]/gm)) specs.add(m[1]);

    const missing = new Set();
    const invalid = new Set();
    for (const spec of specs) {
        if (spec.startsWith('.') || spec.startsWith('/')) continue; // local file, not a package
        const s = spec.replace(/^node:/, '');
        const parts = s.split('/');
        const name = s.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        if (BUILTIN.has(name) || BUILTIN.has(s) || isInstalled(name)) continue;
        (PKG_RE.test(name) ? missing : invalid).add(name);
    }
    return { missing: [...missing], invalid: [...invalid] };
};

// Local install only (into /home/container/node_modules), so it works on read-only global folders too.
const installPackages = (names) => new Promise((resolve) => {
    const cmd = `npm install --no-audit --no-fund --no-progress --loglevel=error ${names.join(' ')}`;
    cp.exec(cmd, { cwd: ROOT, timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ ok: !err, output: String(stderr || stdout || (err && err.message) || '').trim().slice(-400) });
    });
});

const downloadDocument = async (mediaMsg) => {
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    const stream = await downloadContentFromMessage(mediaMsg, 'document');
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > MAX_BYTES) throw new Error('that file is too big for a plugin (max 1 MB)');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

const handleAddPlugin = async (sock, m, { quoted, reply, config, pluginLoader, prefix = '.' }) => {
    const log = makeLog('addplugin');
    const pc = (config && config.plugins) || {};
    const autoInstall = pc.autoInstall !== false;

    const target = quoted || m;
    const fileName = (target.msg || target).fileName;
    const safeName = safeFileName(fileName);

    if (target.mtype !== 'documentMessage' || !safeName) {
        return reply(
            `*Add a plugin*\n\n` +
            `1. Send the plugin file (.js) as a *Document* (attach > Document)\n` +
            `   with the caption ${prefix}addplugin, or reply to the file with ${prefix}addplugin\n` +
            `2. The bot saves it in plugins/ and activates it right away.\n\n` +
            `Plugins that need npm packages get them installed automatically.`
        );
    }

    const t0 = Date.now();
    log(`Receiving ${safeName}...`);

    let buffer;
    try {
        buffer = await downloadDocument(target.msg || target);
    } catch (e) {
        log(`Download failed: ${e.message || e}`, 'err');
        return reply(`Could not download the file: ${e.message || e}`);
    }

    const src = buffer.toString('utf8');
    let wrapped = null; // set if this file got auto-wrapped from a library into a plugin
    if (!looksLikePlugin(src)) {
        if (!looksLikeEsmLibrary(src)) {
            log(`${safeName} does not look like a plugin, ignored`, 'warn');
            return reply(
                `${safeName} does not look like a plugin, so it was not added.\n` +
                `A plugin needs module.exports with a command (or name) and an execute (or start) function.\n` +
                `(It also isn't a recognizable ES-module library — no import/export statements found.)`
            );
        }

        const conv = convertEsmToCjs(src);
        if (!conv.ok) {
            log(`${safeName} could not be converted: ${conv.error}`, 'warn');
            return reply(`${safeName} looks like a library file, but it couldn't be auto-wrapped:\n${conv.error}\n\nNothing was added.`);
        }
        wrapped = { convertedCode: conv.code };
    }

    // npm packages the plugin needs
    const { missing, invalid } = findMissingPackages(src);
    const installed = [];
    if (missing.length) {
        if (!autoInstall) {
            return reply(
                `${safeName} needs npm packages that are not installed: ${missing.join(', ')}\n\n` +
                `Install them first (npm install ${missing.join(' ')}) or set plugins.autoInstall to true in settings/config.js, then send the file again.`
            );
        }
        const list = missing.slice(0, MAX_PACKAGES);
        await reply(`Installing packages: ${list.join(', ')} (this can take a minute)...`);
        log(`Installing ${list.join(', ')}...`);
        const ti = Date.now();
        const res = await installPackages(list);
        if (!res.ok) {
            log(`npm install failed: ${res.output}`, 'err');
            return reply(`Could not install ${list.join(', ')}. Nothing was added.\n\n${res.output || 'npm failed'}`);
        }
        log(`Installed ${list.join(', ')} in ${secs(ti)}`, 'ok');
        installed.push(...list);
        if (missing.length > list.length) {
            return reply(`Installed ${list.join(', ')}, but ${safeName} needs more than ${MAX_PACKAGES} new packages (${missing.slice(MAX_PACKAGES).join(', ')}). Install the rest manually and send the file again.`);
        }
    }

    // if this is a library being wrapped, save the converted lib file and introspect it
    // BEFORE touching the real plugin slot, so a bad library never overwrites a working plugin.
    let wrapperBuffer = buffer;
    let libRelPath = null;
    if (wrapped) {
        const LIB_DIR = path.join(PLUGINS_DIR, '_lib');
        const libBase = safeName.slice(0, -3) + '.lib.cjs';
        const libPath = path.join(LIB_DIR, libBase);
        const intro = introspectLibrary(wrapped.convertedCode, libPath);
        if (!intro.ok) {
            log(`${safeName} could not be wrapped: ${intro.error}`, 'warn');
            return reply(`${safeName} looks like a library file, but it couldn't be auto-wrapped:\n${intro.error}\n\nNothing was added.`);
        }
        libRelPath = `./_lib/${libBase}`;
        const command = safeName.slice(0, -3).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'lib';
        const wrapperSrc = buildWrapperSource({
            command,
            libRelPath,
            isClass: intro.isClass,
            methods: intro.methods,
            description: `Auto-wrapped library (${intro.targetName}) from ${safeName}`
        });
        wrapperBuffer = Buffer.from(wrapperSrc, 'utf8');
    }

    // save (keeping a backup of any file that is being replaced)
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    const dest = path.join(PLUGINS_DIR, safeName);
    const existed = fs.existsSync(dest);
    let backup = null;
    if (existed) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        backup = path.join(BACKUP_DIR, `${safeName.slice(0, -3)}.${Date.now()}.js`);
        fs.copyFileSync(dest, backup);
    }
    fs.writeFileSync(dest, wrapperBuffer);

    pluginLoader.reloadPlugins();
    const rep = pluginLoader.loadReport.get(safeName);

    if (!rep || !rep.ok) {
        // put everything back as it was
        try {
            if (existed) fs.copyFileSync(backup, dest);
            else fs.unlinkSync(dest);
            if (wrapped) fs.unlinkSync(path.join(PLUGINS_DIR, libRelPath));
        } catch {}
        pluginLoader.reloadPlugins();
        const why = (rep && rep.error) || 'invalid plugin structure';
        log(`${safeName} failed to load: ${why}`, 'err');
        return reply(
            `Plugin not added, ${safeName} failed to load:\n${why}\n\n` +
            (existed ? 'The previous version was restored.' : 'Nothing was changed.')
        );
    }

    const lines = wrapped
        ? [`Library wrapped and added: ${safeName} -> plugin ${prefix}${rep.command}`]
        : [`Plugin added: ${safeName}${existed ? ' (replaced the old file, backup kept in plugins/_backup)' : ''}`];
    lines.push(`Command: ${prefix}${rep.command}${rep.aliases.length ? ` (aliases: ${rep.aliases.map((a) => prefix + a).join(', ')})` : ''}`);
    lines.push(`Category: ${rep.category}`);
    if (installed.length) lines.push(`Installed packages: ${installed.join(', ')}`);
    if (invalid.length) lines.push(`Skipped unusual package names: ${invalid.join(', ')}`);
    const winner = pluginLoader.pluginFiles.get(rep.command);
    if (winner && winner !== safeName) {
        lines.push(`Warning: ${prefix}${rep.command} is also defined in ${winner}, which takes priority. Rename or remove one of them.`);
    }
    log(`${safeName} added in ${secs(t0)}`, 'ok');
    return reply(lines.join('\n'));
};

module.exports = { handleAddPlugin, safeFileName, looksLikePlugin, findMissingPackages };