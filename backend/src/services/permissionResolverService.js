const { getAuthorizationFlags } = require('../config/authorization');
const { getProfile } = require('../constants/accessProfiles');
const {
    getPermission,
    INDELEGABLE_PERMISSIONS,
    ORGANIZATION_AUTHORITY_REQUIRED
} = require('../constants/permissions');
const { isLegacyAllowed } = require('../constants/legacyPermissionMap');
const userAccessRepository = require('../repositories/userAccessRepository');

function applyProfile({ profileCode, profileVersion, overrides = [] }) {
    const profile = getProfile(profileCode, profileVersion);
    if (!profile) return { valid: false, permissions: new Set(), denied: new Set() };

    const permissions = new Set(profile.permissions);
    const denied = new Set();
    for (const override of overrides) {
        if (!getPermission(override.permissionCode)) continue;
        if (override.effect === 'DENY') {
            denied.add(override.permissionCode);
            permissions.delete(override.permissionCode);
        }
    }
    for (const override of overrides) {
        if (override.effect !== 'ALLOW' || denied.has(override.permissionCode)) continue;
        if (!INDELEGABLE_PERMISSIONS.has(override.permissionCode)) permissions.add(override.permissionCode);
    }
    return { valid: true, permissions, denied };
}

async function resolve({
    capability,
    legacyRoles,
    membership,
    flags = getAuthorizationFlags(),
    repository = userAccessRepository
}) {
    if (!membership?.id || !membership?.isActive || !membership?.establishmentActive) {
        return { allowed: false, mode: 'INVALID', reason: 'inactive_membership' };
    }
    if (!getPermission(capability)) return { allowed: false, mode: 'INVALID', reason: 'unknown_capability' };

    if (!flags.enabled || flags.killSwitch) {
        return {
            allowed: isLegacyAllowed(membership.role, legacyRoles),
            mode: 'LEGACY',
            reason: flags.killSwitch ? 'kill_switch' : 'feature_disabled'
        };
    }

    const access = await repository.findAuthorizationContext(membership.id);
    if (!access || access.mode === 'LEGACY') {
        return {
            allowed: isLegacyAllowed(membership.role, legacyRoles),
            mode: 'LEGACY',
            reason: access ? 'legacy_mode' : 'missing_access_record'
        };
    }

    const active = access.configurations?.[0];
    if (!active) return { allowed: false, mode: 'PROFILED', reason: 'missing_active_configuration' };
    const effective = applyProfile({
        profileCode: active.profileCode,
        profileVersion: active.profileVersion,
        overrides: active.overrides
    });
    if (!effective.valid) return { allowed: false, mode: 'PROFILED', reason: 'invalid_profile_version' };

    if (effective.permissions.has(capability) && ORGANIZATION_AUTHORITY_REQUIRED.has(capability)) {
        const hasAuthority = await repository.hasOrganizationAuthority(
            membership.userId,
            membership.organizationId
        );
        if (!hasAuthority) {
            return { allowed: false, mode: 'PROFILED', reason: 'organization_authority_required' };
        }
    }

    return {
        allowed: effective.permissions.has(capability),
        mode: 'PROFILED',
        reason: effective.denied.has(capability) ? 'override_deny' : 'effective_permissions',
        profileCode: active.profileCode,
        profileVersion: active.profileVersion,
        accessVersion: access.version
    };
}

module.exports = { applyProfile, resolve };
