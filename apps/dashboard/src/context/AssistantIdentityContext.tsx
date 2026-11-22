import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  DEFAULT_ASSISTANT_NAME,
  WorkspaceExperienceMode,
  normalizeAssistantName,
  normalizeExperienceMode,
} from '../services/assistantIdentity';
import { getAccountStorageKey } from '../services/accountScope';
import { fetchUserProfileApi, saveUserProfileApi } from '../services/api/profile';
import {
  getUserProfile,
  saveUserProfile,
  UserProfileData,
} from '../shared/common/UserProfileModal';
import {
  auth,
  subscribeUserIdentity,
  upsertUserIdentity,
  upsertUserPrivateProfile,
} from '../services/firebase';

export interface AssistantIdentityContextValue {
  assistantName: string;
  experienceMode: WorkspaceExperienceMode;
  profile: UserProfileData;
  firebaseUser: FirebaseUser | null;
  syncedWithCloud: boolean;
  setAssistantName: (nextName: string) => Promise<void>;
  setExperienceMode: (nextMode: WorkspaceExperienceMode) => Promise<void>;
  updateIdentityProfile: (patch: Partial<UserProfileData>) => Promise<void>;
  refreshIdentity: () => Promise<void>;
}

const AssistantIdentityContext = createContext<AssistantIdentityContextValue | null>(null);

function readStoredMode(): WorkspaceExperienceMode {
  try {
    const raw = localStorage.getItem(getAccountStorageKey('jarvis_experience_mode'));
    return normalizeExperienceMode(raw);
  } catch {
    return 'engineering';
  }
}

function persistStoredMode(mode: WorkspaceExperienceMode): void {
  try {
    localStorage.setItem(getAccountStorageKey('jarvis_experience_mode'), mode);
  } catch {}
}

export const AssistantIdentityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [profile, setProfile] = useState<UserProfileData>(() => getUserProfile());
  const [assistantName, setAssistantNameState] = useState<string>(() =>
    normalizeAssistantName(getUserProfile().assistantName)
  );
  const [experienceMode, setExperienceModeState] = useState<WorkspaceExperienceMode>(() =>
    normalizeExperienceMode(getUserProfile().experienceMode || readStoredMode())
  );
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [syncedWithCloud, setSyncedWithCloud] = useState(false);

  // Sync dynamic document title with assistant name
  useEffect(() => {
    const safeName = normalizeAssistantName(assistantName);
    document.title = `${safeName} AI Hub`;
  }, [assistantName]);

  const applyMergedProfile = useCallback((next: UserProfileData) => {
    const normalizedName = normalizeAssistantName(next.assistantName);
    const normalizedMode = normalizeExperienceMode(next.experienceMode || readStoredMode());
    const finalProfile: UserProfileData = {
      ...next,
      assistantName: normalizedName,
      experienceMode: normalizedMode,
    };
    setProfile(finalProfile);
    setAssistantNameState(normalizedName);
    setExperienceModeState(normalizedMode);
    saveUserProfile(finalProfile);
    persistStoredMode(normalizedMode);
  }, []);

  const refreshIdentity = useCallback(async () => {
    const local = getUserProfile();
    setProfile(local);
    setAssistantNameState(normalizeAssistantName(local.assistantName));
    setExperienceModeState(normalizeExperienceMode(local.experienceMode || readStoredMode()));

    try {
      const apiProfile = await fetchUserProfileApi();
      if (apiProfile) {
        applyMergedProfile({
          ...local,
          ...apiProfile,
          assistantName: normalizeAssistantName(apiProfile.assistantName || local.assistantName),
          experienceMode: normalizeExperienceMode(
            apiProfile.experienceMode || local.experienceMode || readStoredMode()
          ),
        });
      }
    } catch {
      // Fall back silently to local scoped storage when backend profile is unavailable
    }
  }, [applyMergedProfile]);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  // Listen to Firebase Auth state & real-time Firestore identity document
  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      if (!user) {
        setSyncedWithCloud(false);
        return;
      }

      unsubDoc = subscribeUserIdentity(
        user.uid,
        (docData) => {
          setSyncedWithCloud(true);
          if (docData) {
            const current = getUserProfile();
            applyMergedProfile({
              ...current,
              displayName: docData.displayName || current.displayName,
              assistantName: normalizeAssistantName(docData.assistantName),
              assistantGreeting: docData.assistantGreeting ?? current.assistantGreeting,
              experienceMode: normalizeExperienceMode(docData.experienceMode),
              avatarIcon: docData.avatarIcon || current.avatarIcon,
            });
          } else if (user.emailVerified) {
            const current = getUserProfile();
            void upsertUserIdentity(user.uid, {
              displayName: user.displayName || current.displayName || 'Usuário',
              assistantName: normalizeAssistantName(current.assistantName),
              assistantGreeting: current.assistantGreeting || '',
              experienceMode: normalizeExperienceMode(current.experienceMode || readStoredMode()),
              avatarIcon: current.avatarIcon || (user.displayName?.[0]?.toUpperCase() ?? 'J'),
              accentTheme: 'orange',
            }).catch(() => {});
          }
        },
        () => {
          setSyncedWithCloud(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, [applyMergedProfile]);

  const persistEverywhere = useCallback(
    async (nextProfile: UserProfileData) => {
      applyMergedProfile(nextProfile);

      // Persist to backend API (best-effort)
      try {
        await saveUserProfileApi({
          displayName: nextProfile.displayName,
          roleTitle: nextProfile.roleTitle,
          avatarIcon: nextProfile.avatarIcon,
          seniorityLevel: nextProfile.seniorityLevel,
          responseStyle: nextProfile.responseStyle,
          userBackground: nextProfile.userBackground,
          responseGuidelines: nextProfile.responseGuidelines,
          assistantName: normalizeAssistantName(nextProfile.assistantName),
          assistantGreeting: nextProfile.assistantGreeting || '',
          experienceMode: normalizeExperienceMode(nextProfile.experienceMode),
        });
      } catch {}

      // Persist to Firestore when signed in with a verified Firebase account
      const activeUser = auth.currentUser;
      if (activeUser && activeUser.emailVerified) {
        try {
          await upsertUserIdentity(activeUser.uid, {
            displayName: nextProfile.displayName || activeUser.displayName || 'Usuário',
            assistantName: normalizeAssistantName(nextProfile.assistantName),
            assistantGreeting: nextProfile.assistantGreeting || '',
            experienceMode: normalizeExperienceMode(nextProfile.experienceMode),
            avatarIcon: nextProfile.avatarIcon || 'J',
            accentTheme: 'orange',
          });
          await upsertUserPrivateProfile(activeUser.uid, {
            email: activeUser.email || '',
            roleTitle: nextProfile.roleTitle,
            seniorityLevel: nextProfile.seniorityLevel,
            responseStyle: nextProfile.responseStyle,
            userBackground: nextProfile.userBackground,
            responseGuidelines: nextProfile.responseGuidelines,
          });
        } catch {}
      }
    },
    [applyMergedProfile]
  );

  const setAssistantName = useCallback(
    async (nextName: string) => {
      const normalized = normalizeAssistantName(nextName);
      await persistEverywhere({
        ...profile,
        assistantName: normalized,
        experienceMode,
      });
    },
    [experienceMode, persistEverywhere, profile]
  );

  const setExperienceMode = useCallback(
    async (nextMode: WorkspaceExperienceMode) => {
      const normalized = normalizeExperienceMode(nextMode);
      await persistEverywhere({
        ...profile,
        assistantName,
        experienceMode: normalized,
      });
    },
    [assistantName, persistEverywhere, profile]
  );

  const updateIdentityProfile = useCallback(
    async (patch: Partial<UserProfileData>) => {
      const merged: UserProfileData = {
        ...profile,
        ...patch,
        assistantName: normalizeAssistantName(patch.assistantName ?? profile.assistantName ?? assistantName),
        experienceMode: normalizeExperienceMode(patch.experienceMode ?? profile.experienceMode ?? experienceMode),
      };
      await persistEverywhere(merged);
    },
    [assistantName, experienceMode, persistEverywhere, profile]
  );

  return (
    <AssistantIdentityContext.Provider
      value={{
        assistantName,
        experienceMode,
        profile,
        firebaseUser,
        syncedWithCloud,
        setAssistantName,
        setExperienceMode,
        updateIdentityProfile,
        refreshIdentity,
      }}
    >
      {children}
    </AssistantIdentityContext.Provider>
  );
};

export function useAssistantIdentity(): AssistantIdentityContextValue {
  const ctx = useContext(AssistantIdentityContext);
  if (ctx) return ctx;
  const fallbackProfile = getUserProfile();
  return {
    assistantName: normalizeAssistantName(fallbackProfile.assistantName || DEFAULT_ASSISTANT_NAME),
    experienceMode: normalizeExperienceMode(fallbackProfile.experienceMode),
    profile: fallbackProfile,
    firebaseUser: null,
    syncedWithCloud: false,
    setAssistantName: async () => {},
    setExperienceMode: async () => {},
    updateIdentityProfile: async () => {},
    refreshIdentity: async () => {},
  };
}
