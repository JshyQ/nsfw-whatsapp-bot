// Globals that plugins written for other WhatsApp bot bases expect: `mess` (standard reply texts) and `botName`.
// Loaded once from message.js. Safe for plugins that don't use them.
const config = () => require('../settings/config');

const fallback = (text) => ({
    get: (target, key) => {
        if (typeof key !== 'string' || key === 'then' || key === 'toJSON') return undefined;
        return key in target ? target[key] : text;
    }
});

global.mess = new Proxy({
    waiting: '⏳ Please wait...',
    success: '✅ Done!',
    admin: '❌ This command is for group admins only.',
    botAdmin: '❌ Make the bot an admin first.',
    owner: '❌ This command is for the owner only.',
    group: '❌ This command only works in groups.',
    private: '❌ This command only works in private chat.',
    bot: '❌ This command is only for the bot itself.',
    error: new Proxy({
        fetch: '❌ Could not fetch data, try again later.',
        api: '❌ API error, try again later.',
        general: '❌ Something went wrong.'
    }, fallback('❌ Something went wrong.'))
}, fallback('⚠️ Not available.'));

// getter, so a changed title in settings/config.js shows up without a restart
Object.defineProperty(global, 'botName', {
    get: () => config().settings?.title || 'Bot',
    configurable: true
});
