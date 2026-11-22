import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export interface FirestoreUserIdentity {
  ownerId: string;
  displayName: string;
  assistantName: string;
  assistantGreeting?: string;
  experienceMode: 'simple' | 'engineering';
  avatarIcon: string;
  accentTheme?: 'orange' | 'blue' | 'purple' | 'emerald';
}

export interface FirestoreUserPrivateProfile {
  ownerId: string;
  email?: string;
  roleTitle?: string;
  seniorityLevel?: 'junior' | 'mid' | 'senior' | 'architect';
  responseStyle?: 'concise' | 'detailed' | 'educational';
  userBackground?: string;
  responseGuidelines?: string;
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export function subscribeUserIdentity(
  userId: string,
  onData: (data: FirestoreUserIdentity | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}`;
  const ref = doc(db, 'users', userId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(snapshot.data() as FirestoreUserIdentity);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertUserIdentity(
  userId: string,
  data: Omit<FirestoreUserIdentity, 'ownerId'>
): Promise<void> {
  const path = `users/${userId}`;
  const ref = doc(db, 'users', userId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: userId,
        displayName: data.displayName.slice(0, 80),
        assistantName: data.assistantName.slice(0, 40),
        assistantGreeting: (data.assistantGreeting || '').slice(0, 160),
        experienceMode: data.experienceMode,
        avatarIcon: data.avatarIcon.slice(0, 16),
        accentTheme: data.accentTheme || 'orange',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: data.displayName.slice(0, 80),
        assistantName: data.assistantName.slice(0, 40),
        assistantGreeting: (data.assistantGreeting || '').slice(0, 160),
        experienceMode: data.experienceMode,
        avatarIcon: data.avatarIcon.slice(0, 16),
        accentTheme: data.accentTheme || 'orange',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertUserPrivateProfile(
  userId: string,
  data: Omit<FirestoreUserPrivateProfile, 'ownerId'>
): Promise<void> {
  const path = `users/${userId}/private/profile`;
  const ref = doc(db, 'users', userId, 'private', 'profile');
  try {
    const snap = await getDoc(ref);
    const payload = {
      email: (data.email || '').slice(0, 160),
      roleTitle: (data.roleTitle || '').slice(0, 100),
      seniorityLevel: data.seniorityLevel || 'senior',
      responseStyle: data.responseStyle || 'detailed',
      userBackground: (data.userBackground || '').slice(0, 2000),
      responseGuidelines: (data.responseGuidelines || '').slice(0, 2000),
    };
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: userId,
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
