// Wrap a "library-style" file (a plain ES-module class/export, not already shaped
// like a plugin) into a working plugin command.
//
// Conservative by design: only a known, common subset of import/export syntax is
// converted. Anything outside that subset makes conversion FAIL (not guess).
//
// Flow (see pluginAdder.js):
//   1. convertEsmToCjs(src)      -> { ok, code, error }
//   2. introspectLibrary(code, tmpPath) -> { ok, methods, ctorNeedsArgs, error }
//   3. buildWrapperSource(...)   -> plugin source text to save into plugins/

const fs = require('fs');
const path = require('path');

// ---------- 1. ESM -> CJS (regex-based, line-anchored, conservative) ----------

// quick pre-check: is this worth trying to convert at all?
const looksLikeEsmLibrary = (src) => /^\s*(import\s|export\s)/m.test(src);

const convertEsmToCjs = (src) => {
    const namedExports = new Set();
    let defaultExportExpr = null;
    let out = src;

    // import defaultExport, { a, b as c } from 'mod';
    out = out.replace(
        /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3\s*;?/gm,
        (_, def, names, _q, mod) => {
            const renamed = names.split(',').map((s) => s.trim()).filter(Boolean)
                .map((s) => { const [a, b] = s.split(/\s+as\s+/); return b ? `${a.trim()}: ${b.trim()}` : a.trim(); })
                .join(', ');
            return `const ${def} = require('${mod}');\nconst { ${renamed} } = require('${mod}');`;
        }
    );

    // import { a, b as c } from 'mod';
    out = out.replace(
        /^[ \t]*import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2\s*;?/gm,
        (_, names, _q, mod) => {
            const renamed = names.split(',').map((s) => s.trim()).filter(Boolean)
                .map((s) => { const [a, b] = s.split(/\s+as\s+/); return b ? `${a.trim()}: ${b.trim()}` : a.trim(); })
                .join(', ');
            return `const { ${renamed} } = require('${mod}');`;
        }
    );

    // import * as ns from 'mod';
    out = out.replace(
        /^[ \t]*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*(['"])([^'"]+)\2\s*;?/gm,
        (_, ns, _q, mod) => `const ${ns} = require('${mod}');`
    );

    // import defaultExport from 'mod';
    out = out.replace(
        /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s*from\s*(['"])([^'"]+)\2\s*;?/gm,
        (_, def, _q, mod) => `const ${def} = require('${mod}');`
    );

    // import 'mod'; (side-effect only)
    out = out.replace(/^[ \t]*import\s*(['"])([^'"]+)\1\s*;?/gm, (_, _q, mod) => `require('${mod}');`);

    // export default class Foo { ... }   /   export default function Foo(...) {...}
    out = out.replace(
        /^[ \t]*export\s+default\s+(class|function)\s+([A-Za-z_$][\w$]*)/m,
        (_, kind, name) => { defaultExportExpr = name; namedExports.add(name); return `${kind} ${name}`; }
    );

    // export default <identifier>;   (e.g. `export default AnichinCare;`)
    out = out.replace(
        /^[ \t]*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/m,
        (_, name) => { defaultExportExpr = defaultExportExpr || name; return ''; }
    );

    // export class Foo { ... }  /  export function foo(...) {...}  /  export const x = ...
    out = out.replace(
        /^[ \t]*export\s+(class|function)\s+([A-Za-z_$][\w$]*)/gm,
        (_, kind, name) => { namedExports.add(name); return `${kind} ${name}`; }
    );
    out = out.replace(
        /^[ \t]*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
        (_, kind, name) => { namedExports.add(name); return `${kind} ${name}`; }
    );

    // export { a, b as c };
    out = out.replace(
        /^[ \t]*export\s*\{([^}]*)\}\s*;?/gm,
        (_, names) => {
            names.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
                const [a, b] = s.split(/\s+as\s+/);
                namedExports.add((b || a).trim());
            });
            return '';
        }
    );

    // anything left starting a line with import/export is unsupported -> refuse
    const leftover = out.match(/^[ \t]*(import|export)\b.*$/m);
    if (leftover) return { ok: false, error: `unsupported ESM syntax: "${leftover[0].trim().slice(0, 80)}"` };

    if (!defaultExportExpr && namedExports.size === 0) {
        return { ok: false, error: 'no export found to wrap (no export/export default statement)' };
    }
    if (!defaultExportExpr) defaultExportExpr = [...namedExports][0];

    const exportLines = [...namedExports].map((n) => `  ${n}`).join(',\n');
    out += `\n\nmodule.exports = {\n${exportLines ? exportLines + ',\n' : ''}  default: ${defaultExportExpr}\n};\n`;

    return { ok: true, code: out };
};

// ---------- 2. introspect the converted module (requires it) ----------

const introspectLibrary = (code, tmpPath) => {
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, code);
    delete require.cache[require.resolve(tmpPath)];

    let mod;
    try {
        mod = require(tmpPath);
    } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return { ok: false, error: `failed to load converted file: ${e.message || e}` };
    }

    const Target = (mod && typeof mod.default === 'function') ? mod.default
        : (typeof mod === 'function') ? mod
            : null;

    if (!Target) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return { ok: false, error: 'no class/function export found to wrap' };
    }

    const isClass = /^class[\s{]/.test(Function.prototype.toString.call(Target));
    let methods = [];
    if (isClass) {
        methods = Object.getOwnPropertyNames(Target.prototype)
            .filter((n) => n !== 'constructor' && !n.startsWith('_') && typeof Target.prototype[n] === 'function')
            // drop internal helpers whose first parameter is clearly not user-suppliable
            // (e.g. parseItem($, el) takes a cheerio instance, not a command argument)
            .filter((n) => {
                const sig = Function.prototype.toString.call(Target.prototype[n]).match(/^[^(]*\(([^)]*)\)/);
                const firstParam = sig ? sig[1].split(',')[0].trim() : '';
                return firstParam !== '$' && firstParam !== 'cheerio' && firstParam !== 'el';
            });
    }

    // does the constructor require args? (best-effort: try instantiating)
    let ctorNeedsArgs = false;
    if (isClass) {
        try { new Target(); } catch { ctorNeedsArgs = true; }
    }

    if (isClass && methods.length === 0) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return { ok: false, error: 'the exported class has no public methods to expose as commands' };
    }
    if (ctorNeedsArgs) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return { ok: false, error: 'the exported class constructor requires arguments, cannot auto-wrap' };
    }

    return { ok: true, isClass, methods, targetName: Target.name || 'default' };
};

// ---------- 3. generate the plugin wrapper source ----------

const buildWrapperSource = ({ command, libRelPath, isClass, methods, description }) => {
    const methodList = methods.join(', ');
    return `// Auto-generated wrapper around a library file added via .addplugin
// Source: ${libRelPath}
// Usage: .${command} <method> [args...]   (methods: ${methodList || 'call with no method to run the default export directly'})

const Lib = require('${libRelPath}');
const Target = (Lib && typeof Lib.default === 'function') ? Lib.default : Lib;

const MAX_CHARS = 3500;
const fmt = (val) => {
    const text = (typeof val === 'string') ? val : JSON.stringify(val, null, 2);
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\\n...(truncated)' : text;
};

// crude arg coercion: numeric-looking args become numbers
const coerce = (s) => (/^\\d+$/.test(s) ? Number(s) : s);

module.exports = {
    command: '${command}',
    description: ${JSON.stringify(description)},
    category: 'library',
    execute: async (sock, m, { args, reply }) => {
        try {
            ${isClass ? 'const instance = new Target();' : 'const instance = Target;'}
            const methods = ${JSON.stringify(methods)};
            if (!methods.length) {
                const result = await Target(...args.map(coerce));
                return reply(fmt(result));
            }
            const [methodName, ...rest] = args;
            if (!methodName || !methods.includes(methodName)) {
                return reply(
                    \`Usage: .${command} <method> [args...]\\nMethods: \${methods.join(', ')}\`
                );
            }
            const result = await instance[methodName](...rest.map(coerce));
            return reply(fmt(result));
        } catch (e) {
            return reply(\`Error: \${e.message || e}\`);
        }
    }
};
`;
};

module.exports = { looksLikeEsmLibrary, convertEsmToCjs, introspectLibrary, buildWrapperSource };
