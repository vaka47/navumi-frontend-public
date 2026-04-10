'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, MoreHorizontal, Menu } from 'lucide-react';
import EditClubProfileModal from '@/components/profile/EditClubProfileModal';
import EditClientProfileModal from '@/components/profile/EditClientProfileModal';
import ProfileSettingsModal from '@/components/settings/ProfileSettingsModal';
import LogoutConfirmModal from '@/components/settings/LogoutConfirmModal';
// import { SwitchProfileButton } from '@/components/profile/SwitchProfileButton';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import EditClubProfileMobilePage from '@/components/profile/EditClubProfileMobilePage';
import EditClientProfileMobilePage from '@/components/profile/EditClientProfileMobilePage';
import ReportModal from '@/components/common/ReportModal';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StackConfirmModal from '@/components/ui/StackConfirmModal';
import { createPortal } from 'react-dom';
import { consumeReturn, navigateBack, rememberProfileEntry, getProfileEntryPath, peekReturnPath } from '@/lib/navBack';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useProfileMenuModal } from '@/hooks/useProfileMenuModal';
import { useProfileActionsModal } from '@/hooks/useProfileActionsModal';
import { getBrowserApiBase } from '@/lib/apiBase';

export default function ProfileHeaderCompact({
  username,
  isOwner,
  isFollower: isFollowerProp,
}: {
  username: string;
  isOwner: boolean;
  isFollower?: boolean | null;
}) {
  const router = useRouter();
  const { isOverlay, close: closeOverlay } = useOverlayEnvironment();
  const { profile, hasClientProfile, hasClubProfile, authenticated, profiles, checkAuth } = useAuth();
  const isMobile = useIsMobile();

  const profileMenuModal = useProfileMenuModal();
  const profileActionsModal = useProfileActionsModal();
  const [editOpen, setEditOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [logoutOpen, setLogoutOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [blocked, setBlocked] = React.useState<boolean | null>(null);
  const [isFollower, setIsFollower] = React.useState<boolean | null>(isFollowerProp ?? null);
  const [mounted, setMounted] = React.useState(false);
  const { clearScreens, openModal, closeModal } = useLayerStack();
  React.useEffect(() => { setMounted(true); }, []);
  React.useEffect(() => {
    setIsFollower(isFollowerProp ?? null);
  }, [isFollowerProp]);

  const entryPathRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const next = rememberProfileEntry(username);
    entryPathRef.current = next ?? getProfileEntryPath(username);
  }, [username]);

  const handleBack = React.useCallback(() => {
    const storageEntry = getProfileEntryPath(username);
    const entry = entryPathRef.current ?? storageEntry;
    const peekCtx = peekReturnPath('profile');
    try {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[ProfileHeaderCompact] handleBack', {
          username,
          isOverlay,
          href: typeof window !== 'undefined' ? window.location.href : null,
          entryFromRef: entryPathRef.current,
          entryFromStorage: storageEntry,
          effectiveEntry: entry,
          peekProfileReturn: peekCtx,
        });
      }
    } catch { /* noop */ }

    if (isOverlay) {
      closeOverlay();
      return;
    }
    if (entry) {
      try {
        router.replace(entry);
      } catch {
        if (typeof window !== 'undefined') window.location.assign(entry);
      }
      return;
    }
    const ctx = consumeReturn('profile');
    try {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[ProfileHeaderCompact] handleBack consumeReturn', {
          username,
          ctx,
          hrefAfterConsume: typeof window !== 'undefined' ? window.location.href : null,
        });
      }
    } catch { /* noop */ }
    if (ctx) {
      router.replace(ctx);
      return;
    }
    navigateBack(router, { fallback: '/search' });
  }, [router, username, isOverlay, closeOverlay]);

  const share = async () => {
    const url = `${location.origin}/${username}`;
    try {
      if (navigator.share) await navigator.share({ url, title: username });
      else { await navigator.clipboard.writeText(url); alert('Ссылка на профиль скопирована'); }
    } catch { /* noop */ }
  };

  // compute another profile (if exists)
  const otherProfile = React.useMemo(() => {
    if (!profile || !Array.isArray(profiles) || profiles.length < 2) return null;
    return profiles.find(p => p.username !== profile.username) || null;
  }, [profile, profiles]);

  function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  }

  const refreshBlockedState = React.useCallback(async () => {
    const API_BASE = getBrowserApiBase();
    try {
      const r = await fetch(`${API_BASE}/api/blocked-profiles/`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) { setBlocked(null); return null; }
      const j = await r.json().catch(() => ({} as Record<string, unknown>));
      const list = Array.isArray((j as { profiles?: unknown }).profiles) ? (j as { profiles: unknown[] }).profiles : [];
      const found = list.some((p) => {
        const rec = p as Record<string, unknown>;
        const uname = String(rec.username ?? '');
        return uname.toLowerCase() === username.toLowerCase();
      });
      setBlocked(found);
      return found;
    } catch {
      setBlocked(null);
      return null;
    }
  }, [username]);

  const blockProfile = React.useCallback(async () => {
    const API_BASE = getBrowserApiBase();
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
    };
    const candidates: Array<{ url: string; body?: Record<string, unknown> | null }> = [
      { url: `${API_BASE}/api/profile/${encodeURIComponent(username)}/block/`, body: { username } },
      { url: `${API_BASE}/api/block-profile/`, body: { username } },
    ];
    for (const c of candidates) {
      try {
        const r = await fetch(c.url, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: c.body ? JSON.stringify(c.body) : undefined,
        });
        if (r.ok) return true;
      } catch { /* noop */ }
    }
    return false;
  }, [username]);

  const unblockProfile = React.useCallback(async () => {
    const API_BASE = getBrowserApiBase();
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
    };
    const candidates: Array<{ url: string; body?: Record<string, unknown> | null }> = [
      { url: `${API_BASE}/api/profile/${encodeURIComponent(username)}/unblock/` },
      { url: `${API_BASE}/api/unblock-profile/`, body: { username } },
    ];
    for (const c of candidates) {
      try {
        const r = await fetch(c.url, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: c.body ? JSON.stringify(c.body) : undefined,
        });
        if (r.ok) return true;
      } catch { /* noop */ }
    }
    return false;
  }, [username]);

  const removeFollower = React.useCallback(async () => {
    const API_BASE = getBrowserApiBase();
    const myUsername = profile?.username;
    if (!myUsername) return false;
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
    };
    try {
      const r = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(myUsername)}/remove-follower/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ username }),
      });
      if (!r.ok) return false;
      const data = await r.json().catch(() => ({} as { removed_profiles?: unknown }));
      const removedProfiles = Array.isArray((data as { removed_profiles?: unknown }).removed_profiles)
        ? ((data as { removed_profiles: unknown[] }).removed_profiles as unknown[])
        : [];
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('navumi:remove-follower', {
            detail: { targetUsername: username, removedProfileIds: removedProfiles },
          }));
        }
      } catch { /* noop */ }
      return true;
    } catch {
      return false;
    }
  }, [username, profile?.username]);

  const openRemoveFollowerConfirm = React.useCallback(() => {
    let modalId: string | null = null;
    const node = (
      <StackConfirmModal
        title="Отписать пользователя от себя?"
        cancelLabel="Отмена"
        confirmLabel="Отписать"
        onCancel={() => { if (modalId) closeModal(modalId); }}
        onConfirm={async () => {
          const ok = await removeFollower();
          if (!ok) {
            try { alert('Не удалось отписать пользователя'); } catch {}
            return;
          }
          setIsFollower(false);
        }}
      />
    );
    modalId = openModal({ node });
  }, [removeFollower, openModal, closeModal]);

  const openBlockConfirm = React.useCallback(() => {
    let modalId: string | null = null;
    const node = (
      <StackConfirmModal
        title="Вы уверены, что хотите заблокировать пользователя?"
        cancelLabel="Отмена"
        confirmLabel="Заблокировать"
        onCancel={() => { if (modalId) closeModal(modalId); }}
        onConfirm={async () => {
          const ok = await blockProfile();
          if (!ok) {
            try { alert('Не удалось заблокировать пользователя'); } catch {}
            return;
          }
          setBlocked(true);
        }}
      />
    );
    modalId = openModal({ node });
  }, [blockProfile, openModal, closeModal]);

  const openUnblockConfirm = React.useCallback(() => {
    let modalId: string | null = null;
    const node = (
      <StackConfirmModal
        title="Уверены, что хотите разблокировать пользователя?"
        cancelLabel="Отмена"
        confirmLabel="Разблокировать"
        onCancel={() => { if (modalId) closeModal(modalId); }}
        onConfirm={async () => {
          const ok = await unblockProfile();
          if (!ok) {
            try { alert('Не удалось разблокировать пользователя'); } catch {}
            return;
          }
          setBlocked(false);
        }}
      />
    );
    modalId = openModal({ node });
  }, [unblockProfile, openModal, closeModal]);

  const handleSwitchOther = async () => {
    const API_BASE = getBrowserApiBase();
    try {
      if (!otherProfile) return;
      const res = await fetch(
        `${API_BASE}/api/profile/switch/by-username/${otherProfile.username}/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTimeout(() => { try { checkAuth(); } catch {} }, 200);
        try { router.push(`/${data.username || otherProfile.username}/`); } catch {}
      }
    } catch {
      try { alert('Сетевая ошибка при переключении профиля'); } catch {}
    }
  };

  const pickString = React.useCallback((obj: unknown, keys: string[]): string => {
    const r = (obj as Record<string, unknown>) || {};
    for (const k of keys) {
      const v = r[k];
      if (typeof v === 'string' && v) return v;
    }
    return '';
  }, []);

  const headerRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      try { document.documentElement.style.setProperty('--profile-header-h', `${el.offsetHeight}px`); } catch { }
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // Принудительно показываем header, если он скрыт без причины (не из-за hide-header класса)
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!headerRef.current) return;
    
    const checkAndFix = () => {
      const el = headerRef.current;
      if (!el) return;
      
      const hasHideHeaderClass = document.body.classList.contains('hide-header');
      const computed = window.getComputedStyle(el);
      
      // Если hide-header класс отсутствует, но header скрыт - принудительно показываем
      if (!hasHideHeaderClass && computed.display === 'none') {
        // eslint-disable-next-line no-console
        console.log('[ProfileHeaderCompact] fixing display: none', {
          username,
          isOverlay,
          hasHideHeaderClass,
          computedDisplay: computed.display,
          willSetDisplay: 'block',
        });
        el.style.display = 'block';
      }
    };
    
    // Проверяем с задержками, чтобы дать время на рендер
    const timeoutId1 = setTimeout(checkAndFix, 50);
    const timeoutId2 = setTimeout(checkAndFix, 150);
    const timeoutId3 = setTimeout(checkAndFix, 300);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [username, isOverlay]);

  // Логируем состояние при рендере и проверяем computed styles
  React.useEffect(() => {
    const checkHeaderVisibility = () => {
      if (typeof document === 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[ProfileHeaderCompact] render (no document)', {
          username,
          isOverlay,
          isOwner,
          showBackButton: isOverlay || !isOwner,
        });
        return;
      }
      
      if (!headerRef.current) {
        // eslint-disable-next-line no-console
        console.log('[ProfileHeaderCompact] render (no ref)', {
          username,
          isOverlay,
          isOwner,
          showBackButton: isOverlay || !isOwner,
          hasHideHeaderClass: document.body.classList.contains('hide-header'),
        });
        return;
      }
      
      const headerEl = headerRef.current;
      const computed = window.getComputedStyle(headerEl);
      const rect = headerEl.getBoundingClientRect();
      const inlineStyle = headerEl.getAttribute('style') || '';
      
      // Проверяем все возможные причины display: none
      const allRules: string[] = [];
      try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule && rule.selectorText) {
                try {
                  if (headerEl.matches(rule.selectorText)) {
                    const style = rule.style;
                    if (style.display === 'none') {
                      allRules.push(`CSS rule: ${rule.selectorText} { display: none }`);
                    }
                  }
                } catch { /* ignore selector errors */ }
              }
            }
          } catch { /* ignore sheet access errors */ }
        }
      } catch { /* ignore */ }
      
      // eslint-disable-next-line no-console
      console.log('[ProfileHeaderCompact] render + visibility check', {
        username,
        isOverlay,
        isOwner,
        showBackButton: isOverlay || !isOwner,
        hasHideHeaderClass: document.body.classList.contains('hide-header'),
        headerVisible: true, // header всегда рендерится
        inlineStyle,
        cssRulesHidingHeader: allRules,
        computedStyles: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          zIndex: computed.zIndex,
          position: computed.position,
          top: computed.top,
          left: computed.left,
        },
        boundingRect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          visible: rect.width > 0 && rect.height > 0 && rect.top >= 0,
        },
        parentClasses: headerEl.parentElement?.className || '',
        headerClasses: headerEl.className,
        parentElement: headerEl.parentElement ? {
          tagName: headerEl.parentElement.tagName,
          className: headerEl.parentElement.className,
          computedDisplay: window.getComputedStyle(headerEl.parentElement).display,
          inlineStyle: headerEl.parentElement.getAttribute('style') || '',
        } : null,
      });
    };
    
    // Проверяем с задержками, чтобы дать время на рендер
    checkHeaderVisibility();
    const timeoutId1 = setTimeout(checkHeaderVisibility, 100);
    const timeoutId2 = setTimeout(checkHeaderVisibility, 300);
    const timeoutId3 = setTimeout(checkHeaderVisibility, 500);
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [username, isOverlay, isOwner]);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 bg-white border-b">
      <div className="max-w-4xl mx-auto px-2 py-8 sm:px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 px-2">
          {(isOverlay || !isOwner) && (
            <button
              onClick={handleBack}
              className="p-1 rounded-md hover:bg-gray-100 active:bg-gray-200"
              aria-label="Назад"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <div className="truncate font-semibold text-lg">{username}</div>
        </div>

        <div>
          {isOwner ? (
            <div className="relative">
              <button
                className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200"
                aria-label="Меню"
                onClick={() => {
                  profileMenuModal.open({
                    onEdit: () => setEditOpen(true),
                    onSettings: () => setSettingsOpen(true),
                    onLogout: () => setLogoutOpen(true),
                    hasClientProfile: !!hasClientProfile,
                    hasClubProfile: !!hasClubProfile,
                    otherProfileUsername: otherProfile?.username || null,
                    onSwitchOther: otherProfile ? handleSwitchOther : undefined,
                  });
                }}
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200"
                aria-label="Ещё"
                onClick={() => {
                  const run = async () => {
                    const refreshed = (authenticated && !hasTemporaryToken())
                      ? await refreshBlockedState()
                      : null;
                    const isBlocked = (refreshed ?? blocked) === true;
                    profileActionsModal.open({
                      onShare: async () => {
                        profileActionsModal.close();
                        await share();
                      },
                      onReport: () => {
                        profileActionsModal.close();
                        if (!authenticated) { setLoginRequiredOpen(true); return; }
                        if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                        setReportOpen(true);
                      },
                      onBlockToggle: () => {
                        profileActionsModal.close();
                        if (!authenticated) { setLoginRequiredOpen(true); return; }
                        if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                        if (isBlocked) openUnblockConfirm();
                        else openBlockConfirm();
                      },
                      onRemoveFollower: isFollower
                        ? () => {
                          profileActionsModal.close();
                          if (!authenticated) { setLoginRequiredOpen(true); return; }
                          if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                          openRemoveFollowerConfirm();
                        }
                        : undefined,
                      blockLabel: isBlocked ? 'Разблокировать' : 'Заблокировать',
                      blockDestructive: !isBlocked,
                    });
                  };
                  void run();
                }}
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Модалки владельца */}
      {isOwner && editOpen && profile && (
        profile.role === 'club' ? (
          isMobile ? (
            <EditClubProfileMobilePage open={editOpen} onClose={() => setEditOpen(false)} initialData={{
              username: profile.username,
              club_name: profile.club_name ?? '',
              telegram: pickString(profile, ['telegram_username','telegram']),
              instagram: pickString(profile, ['instagram_username','instagram']),
              phone_number: pickString(profile, ['phone_number']),
              website: pickString(profile, ['website']),
              description: pickString(profile, ['description']),
              profile_picture: profile.profile_picture ?? '',
            }} />
          ) : (
            <EditClubProfileModal isOpen={editOpen} onClose={() => setEditOpen(false)} initialData={{
              username: profile.username,
              club_name: profile.club_name ?? '',
              telegram: pickString(profile, ['telegram_username','telegram']),
              instagram: pickString(profile, ['instagram_username','instagram']),
              phone_number: pickString(profile, ['phone_number']),
              website: pickString(profile, ['website']),
              description: pickString(profile, ['description']),
              profile_picture: profile.profile_picture ?? '',
            }} />
          )
        ) : (
          isMobile ? (
            <EditClientProfileMobilePage open={editOpen} onClose={() => setEditOpen(false)} initialData={{
              username: profile.username,
              full_name: profile.full_name ?? '',
              telegram: pickString(profile, ['telegram_username','telegram']),
              instagram: pickString(profile, ['instagram_username','instagram']),
              website: pickString(profile, ['website']),
              description: pickString(profile, ['description']),
              profile_picture: profile.profile_picture ?? '',
            }} />
          ) : (
            <EditClientProfileModal isOpen={editOpen} onClose={() => setEditOpen(false)} initialData={{
              username: profile.username,
              full_name: profile.full_name ?? '',
              telegram: pickString(profile, ['telegram_username','telegram']),
              instagram: pickString(profile, ['instagram_username','instagram']),
              website: pickString(profile, ['website']),
              description: pickString(profile, ['description']),
              profile_picture: profile.profile_picture ?? '',
            }} />
          )
        )
      )}

      {isOwner && settingsOpen && profile && (
        <ProfileSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} currentProfile={profile} />
      )}

      {isOwner && profile && (
        <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} username={profile.username} />
      )}

      {/* Жалоба на профиль — используем общий модуль, передаём ссылку и username */}
      {!isOwner && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          kind={'profile'}
          targetId={0}
          linkHint={`/${username}`}
          profileUsername={username}
        />
      )}
      {!isOwner && mounted && createPortal(
        <>
          <ConfirmModal
            open={loginRequiredOpen}
            onCancel={() => setLoginRequiredOpen(false)}
            onConfirm={() => {
              setLoginRequiredOpen(false);
              clearScreens();
              setTimeout(() => {
                try { location.assign('/auth/login'); } catch {}
              }, 150);
            }}
            title="Это действие доступно только авторизованным пользователям"
            cancelLabel="Отмена"
            confirmLabel="Войти"
            variant="simple"
          />
          <CompleteProfileActionModal
            open={completeProfileModalOpen}
            onClose={() => setCompleteProfileModalOpen(false)}
          />
        </>,
        document.body
      )}
    </header>
  );
}
