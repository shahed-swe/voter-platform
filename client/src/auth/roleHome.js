// Where each role lands after login. Party-level roles (Political Admin /
// Donor) hold no constituency grant, so the constituency dashboard would only
// throw "Pick a candidate first" at them — they get their own home pages.
// Fine-grained per-role permissions land later (docs/application-flows/plan.md).

export function isPartyAdmin(user) {
    return user?.role === 'tenant_admin'
        || (user?.parties || []).some((p) => p.role === 'tenant_admin');
}

export function isDonor(user) {
    return user?.role === 'donor'
        || (user?.parties || []).some((p) => p.role === 'donor');
}

export function roleHome(user) {
    if (!user) return '/login';
    if (user.is_super_admin) return '/dashboard';
    if (isPartyAdmin(user)) return '/party';
    if (isDonor(user)) return '/donor';
    return '/dashboard';
}
