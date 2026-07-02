import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { register, login, refresh, recordConsent, getMe, logout, setAuthHandlers } from '../lib/api';
import { resetAppModeCache } from '../components/AppShell';
import { resetThemeCache } from '../theme/AppThemeContext';
import type { RegisterInput, LoginInput, ConsentInput } from '@storygen/shared';

const ACCESS_TOKEN_KEY = 'storygen_access_token';
const REFRESH_TOKEN_KEY = 'storygen_refresh_token';
const HAS_CONSENT_KEY = 'storygen_has_consent';

type UserRole = 'USER' | 'MODERATOR' | 'ADMIN';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  hasConsent: boolean;
  isLoading: boolean;
  role: UserRole | null;
  email: string | null;
  userId: string | null;
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

async function fetchAndApplyMe(
  accessToken: string,
  setState: React.Dispatch<React.SetStateAction<AuthState>>,
): Promise<void> {
  try {
    const me = await getMe(accessToken);
    // RF-02: consentimento é derivado do servidor (has_parental_consent) —
    // um responsável que já consentiu não revê o gate em outro dispositivo.
    // O SecureStore fica só como cache otimista para o boot offline.
    //
    // Guarda anti-obsolescência: se o token corrente mudou (signOut ou refresh)
    // desde que este /me foi disparado, ignora o resultado E não reescreve o
    // cache de consentimento — evita que um /me do boot ressuscite o papel/
    // consentimento do usuário anterior após o signOut.
    setState((s) => {
      if (s.accessToken !== accessToken) return s;
      // Token confere → persiste o cache otimista de consentimento (best-effort).
      void SecureStore.setItemAsync(
        HAS_CONSENT_KEY,
        me.has_parental_consent ? 'true' : 'false',
      ).catch(() => {
        // acceptable on web
      });
      return {
        ...s,
        role: me.role,
        email: me.email,
        userId: me.id,
        hasConsent: me.has_parental_consent,
      };
    });
  } catch {
    // tolerate failure — role stays null and hasConsent keeps the cached value
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    hasConsent: false,
    isLoading: true,
    role: null,
    email: null,
    userId: null,
  });

  // Espelho síncrono do estado: permite que handlers estáveis (refresh-on-401,
  // signOut) leiam sempre os tokens correntes sem closures obsoletas.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
            setState((s) => ({
              ...s,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              hasConsent,
              isLoading: false,
            }));
            void fetchAndApplyMe(tokens.access_token, setState);
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
    // Aguarda /me para derivar hasConsent do servidor antes do gate navegar
    await fetchAndApplyMe(tokens.access_token, setState);
  }, []);

  const registerFn = useCallback(async (input: RegisterInput) => {
    const tokens = await register(input);
    await saveTokens(tokens.access_token, tokens.refresh_token);
    setState((s) => ({
      ...s,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    }));
    // Aguarda /me para derivar hasConsent do servidor antes do gate navegar
    await fetchAndApplyMe(tokens.access_token, setState);
  }, []);

  const signOut = useCallback(async () => {
    // Best-effort: invalida o refresh token no servidor ANTES de limpar o
    // armazenamento local (lê os tokens correntes via stateRef).
    const { accessToken, refreshToken } = stateRef.current;
    if (accessToken && refreshToken) {
      try {
        await logout(refreshToken, accessToken);
      } catch {
        // ignora — logout é best-effort (rede/token expirado)
      }
    }
    // Limpa caches de módulo (modo do app + tema/marca) para que o próximo
    // usuário não herde nav/branding do anterior.
    resetAppModeCache();
    resetThemeCache();
    await clearTokens();
    setState({
      accessToken: null,
      refreshToken: null,
      hasConsent: false,
      isLoading: false,
      role: null,
      email: null,
      userId: null,
    });
  }, []);

  // Registra os handlers de refresh-on-401 no módulo de API. Os helpers
  // (get/post/patch/put/del) renovam o access token automaticamente em 401
  // (single-flight) e refazem a requisição; se o refresh falhar, onAuthLost
  // dispara signOut.
  useEffect(() => {
    setAuthHandlers({
      getRefreshToken: () => stateRef.current.refreshToken,
      onTokens: (tokens) => {
        void saveTokens(tokens.access_token, tokens.refresh_token);
        setState((s) => ({
          ...s,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        }));
      },
      onAuthLost: () => {
        void signOut();
      },
    });
    return () => setAuthHandlers(null);
  }, [signOut]);

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
