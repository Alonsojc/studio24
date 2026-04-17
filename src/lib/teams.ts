'use client';

import { supabase } from './supabase';

let cachedTeamId: string | null = null;

export async function getMyTeamId(): Promise<string | null> {
  if (cachedTeamId) return cachedTeamId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('team_members').select('team_id').eq('user_id', user.id).limit(1).maybeSingle();
  cachedTeamId = (data?.team_id as string) || null;
  return cachedTeamId;
}

export function clearTeamIdCache() {
  cachedTeamId = null;
}

export interface TeamMember {
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
  nombre?: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const teamId = await getMyTeamId();
  if (!teamId) return [];
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, role, joined_at')
    .eq('team_id', teamId);
  if (!members || members.length === 0) return [];
  const ids = members.map((m) => m.user_id);
  const { data: profiles } = await supabase.from('profiles').select('id, email, nombre').in('id', ids);
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  return members.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    email: profileMap.get(m.user_id)?.email || '',
    nombre: profileMap.get(m.user_id)?.nombre || '',
  }));
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const { data } = await supabase
    .from('invitations')
    .select('id, email, role, created_at')
    .eq('accepted', false)
    .order('created_at', { ascending: false });
  return (data || []) as PendingInvitation[];
}

export async function cancelInvitation(id: string): Promise<void> {
  await supabase.from('invitations').delete().eq('id', id);
}
