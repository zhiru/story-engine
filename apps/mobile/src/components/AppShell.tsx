import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../theme/AppThemeContext';
import { getConfig } from '../lib/api';

const SIDEBAR_WIDTH = 230;
const BREAKPOINT = 760;

type NavItem = {
  label: string;
  route: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Menu de administração agrupado (RF-40..RF-46). MODERATOR vê apenas
 * conteúdo e moderação (denúncias); ADMIN vê todos os grupos.
 */
function buildAdminGroups(role: string | null): NavGroup[] {
  const isAdmin = role === 'ADMIN';
  const isModerator = role === 'MODERATOR';
  if (!isAdmin && !isModerator) return [];

  const groups: NavGroup[] = [
    {
      label: 'Conteúdo',
      items: [
        { label: '🧒 Personagens', route: '/admin/characters' },
        { label: '🎭 Temas', route: '/admin/themes' },
      ],
    },
    {
      label: 'Moderação',
      items: [{ label: '🚩 Denúncias', route: '/admin/reports' }],
    },
  ];

  if (isAdmin) {
    groups.push(
      {
        label: 'Gestão',
        items: [
          { label: '👥 Usuários', route: '/admin/users' },
          { label: '💳 Planos', route: '/admin/plans' },
          { label: '⚙️ Configurações', route: '/admin/settings' },
        ],
      },
      {
        label: 'IA',
        items: [
          { label: '📝 Prompts', route: '/admin/prompts' },
          { label: '🤖 Provedores de IA', route: '/admin/providers' },
        ],
      },
      {
        label: 'Governança',
        items: [
          { label: '📜 Auditoria', route: '/admin/audit' },
          { label: '🛡️ LGPD', route: '/admin/lgpd' },
        ],
      },
    );
  }

  return groups;
}

// Cache de módulo: o modo do app (SINGLE/MULTI) muda raramente — evita
// refazer GET /config a cada troca de tela.
let cachedAppMode: 'SINGLE' | 'MULTI' | null = null;

function useAppMode(): 'SINGLE' | 'MULTI' | null {
  const { accessToken } = useAuth();
  const [mode, setMode] = useState<'SINGLE' | 'MULTI' | null>(cachedAppMode);

  useEffect(() => {
    if (!accessToken || cachedAppMode) return;
    getConfig(accessToken)
      .then((config) => {
        cachedAppMode = config.appMode;
        setMode(config.appMode);
      })
      .catch(() => {
        // sem config, links extras ficam ocultos — tolerável
      });
  }, [accessToken]);

  return mode;
}

function useMainLinks(): NavItem[] {
  const appMode = useAppMode();

  return [
    { label: '📖 Histórias', route: '/' },
    { label: '✨ Gerar história', route: '/generate' },
    // Descoberta de universos públicos só faz sentido no modo MULTI (RF-30)
    ...(appMode === 'MULTI' ? [{ label: '🔭 Descobrir', route: '/explore' }] : []),
    { label: '👶 Perfis infantis', route: '/child-profiles' },
    { label: '⭐ Assinatura', route: '/subscription' },
  ];
}

/** Marca do app: logo (theme.logo_url) + nome (theme.app_name), quando presentes. */
function AppBrand({ compact = false }: { compact?: boolean }) {
  const theme = useAppTheme();
  const name = theme.appName ?? 'StoryGen';

  return (
    <View style={styles.brandRow}>
      {theme.logoUrl ? (
        <Image
          source={{ uri: theme.logoUrl }}
          style={compact ? styles.brandLogoCompact : styles.brandLogo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={`Logotipo de ${name}`}
        />
      ) : null}
      <Text
        style={[
          compact ? styles.topBarTitle : styles.appTitle,
          { color: theme.primary },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

function SidebarContent({
  onNav,
}: {
  onNav?: () => void;
}) {
  const router = useRouter() as ReturnType<typeof useRouter> & { push: (r: string) => void };
  const pathname = usePathname();
  const { signOut, role } = useAuth();
  const theme = useAppTheme();

  const adminGroups = buildAdminGroups(role);
  const mainLinks = useMainLinks();

  function handleNav(route: string) {
    router.push(route);
    onNav?.();
  }

  function isActive(route: string) {
    if (route === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(route);
  }

  return (
    <View style={styles.sidebarInner}>
      <View style={[styles.sidebarHeader, { borderBottomColor: theme.primarySoft }]}>
        <AppBrand />
      </View>

      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.navSection}>
          {mainLinks.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navItem,
                isActive(item.route) && { backgroundColor: theme.primarySoft },
              ]}
              onPress={() => handleNav(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text
                style={[
                  styles.navItemText,
                  isActive(item.route) && [
                    styles.navItemTextActive,
                    { color: theme.primary },
                  ],
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {adminGroups.length > 0 && (
          <View style={styles.navSection}>
            <Text style={styles.sectionLabel}>Administração</Text>
            {adminGroups.map((group) => (
              <View key={group.label}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {group.items.map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={[
                      styles.navItem,
                      isActive(item.route) && { backgroundColor: theme.primarySoft },
                    ]}
                    onPress={() => handleNav(item.route)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Text
                      style={[
                        styles.navItemText,
                        isActive(item.route) && [
                          styles.navItemTextActive,
                          { color: theme.primary },
                        ],
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.sidebarFooter, { borderTopColor: theme.primarySoft }]}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Sair"
        >
          <Text style={styles.signOutText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const theme = useAppTheme();
  const isWide = width >= BREAKPOINT;

  if (isWide) {
    return (
      <View style={[styles.rootWide, { backgroundColor: theme.bg }]}>
        <View style={[styles.sidebar, { borderRightColor: theme.primarySoft }]}>
          <SidebarContent />
        </View>
        <View style={styles.content}>
          {children}
        </View>
      </View>
    );
  }

  // Narrow: top bar with brand + title + nav links row
  return (
    <View style={[styles.rootNarrow, { backgroundColor: theme.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.primarySoft }]}>
        {theme.logoUrl || theme.appName ? (
          <AppBrand compact />
        ) : (
          <Text style={[styles.topBarTitle, { color: theme.primary }]}>{title}</Text>
        )}
      </View>
      <NarrowNav />
      <View style={styles.contentNarrow}>
        {children}
      </View>
    </View>
  );
}

function NarrowNav() {
  const router = useRouter() as ReturnType<typeof useRouter> & { push: (r: string) => void };
  const pathname = usePathname();
  const { signOut, role } = useAuth();
  const theme = useAppTheme();

  const adminLinks = buildAdminGroups(role).flatMap((group) => group.items);
  const mainLinks = useMainLinks();

  function isActive(route: string) {
    if (route === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(route);
  }

  const links = [...mainLinks, ...adminLinks];

  return (
    <View style={[styles.narrowNav, { borderBottomColor: theme.primarySoft }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.narrowNavContent}>
        {links.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[
              styles.narrowNavItem,
              isActive(item.route) && { backgroundColor: theme.primarySoft },
            ]}
            onPress={() => router.push(item.route)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text
              style={[
                styles.narrowNavText,
                isActive(item.route) && [
                  styles.narrowNavTextActive,
                  { color: theme.primary },
                ],
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.narrowNavItem}
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Sair"
        >
          <Text style={[styles.narrowNavText, { color: '#DC2626' }]}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide layout
  rootWide: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
  },
  sidebarInner: {
    flex: 1,
    paddingVertical: 0,
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  brandLogoCompact: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  navScroll: {
    flex: 1,
  },
  navSection: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 2,
  },
  navItem: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  navItemText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  navItemTextActive: {
    fontWeight: '700',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  signOutButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  signOutText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  // Narrow layout
  rootNarrow: {
    flex: 1,
  },
  topBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    flexShrink: 1,
  },
  narrowNav: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
  },
  narrowNavContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  narrowNavItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  narrowNavText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  narrowNavTextActive: {
    fontWeight: '700',
  },
  contentNarrow: {
    flex: 1,
  },
});
