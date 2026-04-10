import { useUserStore } from "@/store/userStore";
import { getBrowserApiBase } from "@/lib/apiBase";

export async function fetchUserProfile() {
  try {
    const API = getBrowserApiBase();
    const url = `${API}/api/profile/`;
    try { console.info('[Auth] fetchUserProfile →', url); } catch {}
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch user profile');
    const data = await res.json();
    useUserStore.getState().setUser(data);
  } catch (err) {
    console.error('Error loading user profile', err);
  }
}
