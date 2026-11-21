const enabled = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

function getAuthorizationFlags(env = process.env) {
    return Object.freeze({
        enabled: enabled(env.USER_PERMISSIONS_ENABLED),
        killSwitch: enabled(env.USER_PERMISSIONS_KILL_SWITCH)
    });
}

module.exports = { getAuthorizationFlags };
