import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getConfig } from '../lib/api';

/**
 * Tema remoto (ADR-06 / RF-46): GET /config devolve `theme` como
 * Record<string,string> vindo de app_settings.theme (ver
 * apps/api/src/routes/config.ts e db/seed.ts — chaves seeded:
 * primary/secondary/background/text; logo_url/app_name são opcionais).
 * Sem rede ou sem chave, caímos nos defaults (visual atual do app).
 */
export type AppTheme = {
  /** Cor de destaque da marca (botões, links, chips ativos). */
  primary: string;
  /** Tom suave do accent (fundos de chip, nav ativa, bordas claras). */
  primarySoft: string;
  /** Cor de fundo das telas. */
  bg: string;
  /** URL do logotipo do app, quando configurado. */
  logoUrl?: string;
  /** Nome do app para o cabeçalho, quando configurado. */
  appName?: string;
};

export const DEFAULT_THEME: AppTheme = {
  primary: '#7C3AED',
  primarySoft: '#EDE9FE',
  bg: '#FAF5FF',
};

function themeFromConfig(raw: Record<string, string> | undefined): AppTheme {
  const theme = raw ?? {};
  return {
    primary: theme['primary'] || DEFAULT_THEME.primary,
    primarySoft: theme['secondary'] || DEFAULT_THEME.primarySoft,
    bg: theme['background'] || DEFAULT_THEME.bg,
    ...(theme['logo_url'] ? { logoUrl: theme['logo_url'] } : {}),
    ...(theme['app_name'] ? { appName: theme['app_name'] } : {}),
  };
}

// Cache de módulo: o tema muda raramente — evita refazer GET /config a cada
// troca de tela (mesmo padrão do cachedAppMode no AppShell).
let cachedTheme: AppTheme | null = null;

/**
 * Limpa o cache de tema. Chamado no signOut para que o próximo usuário não
 * herde a marca/tema (cores, logo, nome) do anterior.
 */
export function resetThemeCache(): void {
  cachedTheme = null;
}

const AppThemeContext = createContext<AppTheme>(DEFAULT_THEME);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [theme, setTheme] = useState<AppTheme>(cachedTheme ?? DEFAULT_THEME);

  useEffect(() => {
    if (!accessToken) return;
    if (cachedTheme) {
      setTheme(cachedTheme);
      return;
    }
    let cancelled = false;
    getConfig(accessToken)
      .then((config) => {
        cachedTheme = themeFromConfig(config.theme);
        if (!cancelled) setTheme(cachedTheme);
      })
      .catch(() => {
        // sem config, o app segue com os defaults — tolerável
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return <AppThemeContext.Provider value={theme}>{children}</AppThemeContext.Provider>;
}

/** Hook de tema remoto: { primary, primarySoft, bg, logoUrl?, appName? }. */
export function useAppTheme(): AppTheme {
  return useContext(AppThemeContext);
}
