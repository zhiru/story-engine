import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { register, login, refresh, recordConsent } from '../lib/api';
import type { RegisterInput, LoginInput, ConsentInput } from '@storygen/shared';

const ACCESS_TOKEN_KEY = 'storygen_access_token';
const REFRESH_TOKEN_KEY = 'storygen_refresh_token';
const HAS_CONSENT_KEY = 'storygen_has_consent';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  hasConsent: boolean;
  isLoading: boolean;
};

type AuthContextType = AuthState & {
  signIn: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  grantConsent: (input: ConsentInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

async function saveTokens(accessToken: string, refreshToken: string) {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // SecureStore may no-op on web — acceptable
  }
}

async function clearTokens() {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(HAS_CONSENT_KEY);
  } catch {
    // acceptable on web
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    hasConsent: false,
    isLoading: true,
  });

  // Load persisted tokens on mount
  useEffect(() => {
    void (async () => {
      try {
        const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        const hasConsentStr = await SecureStore.getItemAsync(HAS_CONSENT_KEY);
        const hasConsent = hasConsentStr === 'true';

        if (accessToken && refreshToken) {
          // Try to refresh the access token on startup
          try {
            const tokens = await refresh(refreshToken);
            await saveTokens(tokens.access_token, tokens.refresh_token);
            setState({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              hasConsent,
              isLoading: false,
            });
            return;
          } catch {
            // Refresh failed — clear tokens and go to login
            await clearTokens();
          }
        }
      } catch {
        // SecureStore error on web — ignore
      }
      setState((s) => ({ ...s, isLoading: false }));
    })();
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const tokens = await login(input);
    await saveTokens(tokens.access_token, tokens.refresh_token);
    setState((s) => ({
      ...s,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    }));
  }, []);

  const registerFn = useCallback(async (input: RegisterInput) => {
    const tokens = await register(input);
    await saveTokens(tokens.access_token, tokens.refresh_token);
    setState((s) => ({
      ...s,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    }));
  }, []);

  const signOut = useCallback(async () => {
    await clearTokens();
    setState({
      accessToken: null,
      refreshToken: null,
      hasConsent: false,
      isLoading: false,
    });
  }, []);

  const grantConsent = useCallback(
    async (input: ConsentInput) => {
      if (!state.accessToken) throw new Error('Not authenticated');
      await recordConsent(input, state.accessToken);
      try {
        await SecureStore.setItemAsync(HAS_CONSENT_KEY, 'true');
      } catch {
        // acceptable on web
      }
      setState((s) => ({ ...s, hasConsent: true }));
    },
    [state.accessToken],
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        register: registerFn,
        signOut,
        grantConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
