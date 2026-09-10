export function canViewAdministration(role) {
  return role === 'superadmin';
}

export function canPublishContent(role) {
  return role === 'superadmin';
}

export function canUseAccess({ profile, access, memberships = [] } = {}) {
  if (!profile || !access || profile.ativo !== true || access.ativo !== true) return false;
  if (profile.role === 'superadmin') return true;
  if (profile.role !== 'colaborador') return false;

  return memberships.some(membership =>
    membership?.user_id === profile.id && membership?.acesso_id === access.id
  );
}
