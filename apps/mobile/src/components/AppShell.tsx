import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { getConfig } from '../lib/api';

const SIDEBAR_WIDTH = 230;
const BREAKPOINT = 760;

type NavItem = {
  label: string;
  route: string;
};

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

function useNavLinks(): { mainLinks: NavItem[]; adminLinks: NavItem[]; isAdmin: boolean } {
  const { role } = useAuth();
  const appMode = useAppMode();

  const isAdmin = role === 'ADMIN' || role === 'MODERATOR';

  const mainLinks: NavItem[] = [
    { label: '📖 Histórias', route: '/' },
    { label: '✨ Gerar história', route: '/generate' },
    // Descoberta de universos públicos só faz sentido no modo MULTI (RF-30)
    ...(appMode === 'MULTI' ? [{ label: '🔭 Descobrir', route: '/explore' }] : []),
    { label: '👶 Perfis infantis', route: '/child-profiles' },
    { label: '⭐ Assinatura', route: '/subscription' },
  ];

  const adminLinks: NavItem[] = [
    { label: '🧒 Personagens', route: '/admin/characters' },
    { label: '🎭 Temas', route: '/admin/themes' },
  ];

  return { mainLinks, adminLinks, isAdmin };
}

function SidebarContent({
  onNav,
}: {
  onNav?: () => void;
}) {
  const router = useRouter() as ReturnType<typeof useRouter> & { push: (r: string) => void };
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { mainLinks, adminLinks, isAdmin } = useNavLinks();

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
      <View style={styles.sidebarHeader}>
        <Text style={styles.appTitle}>StoryGen</Text>
      </View>

      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.navSection}>
          {mainLinks.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, isActive(item.route) && styles.navItemActive]}
              onPress={() => handleNav(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text
                style={[
                  styles.navItemText,
                  isActive(item.route) && styles.navItemTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isAdmin && (
          <View style={styles.navSection}>
            <Text style={styles.sectionLabel}>Administração</Text>
            {adminLinks.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.navItem, isActive(item.route) && styles.navItemActive]}
                onPress={() => handleNav(item.route)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Text
                  style={[
                    styles.navItemText,
                    isActive(item.route) && styles.navItemTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.sidebarFooter}>
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
  const isWide = width >= BREAKPOINT;

  if (isWide) {
    return (
      <View style={styles.rootWide}>
        <View style={styles.sidebar}>
          <SidebarContent />
        </View>
        <View style={styles.content}>
          {children}
        </View>
      </View>
    );
  }

  // Narrow: top bar with title + nav links row
  return (
    <View style={styles.rootNarrow}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{title}</Text>
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
  const { signOut } = useAuth();
  const { mainLinks, adminLinks, isAdmin } = useNavLinks();

  function isActive(route: string) {
    if (route === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(route);
  }

  const links = isAdmin ? [...mainLinks, ...adminLinks] : mainLinks;

  return (
    <View style={styles.narrowNav}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.narrowNavContent}>
        {links.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.narrowNavItem, isActive(item.route) && styles.narrowNavItemActive]}
            onPress={() => router.push(item.route)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.narrowNavText, isActive(item.route) && styles.narrowNavTextActive]}>
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
    backgroundColor: '#FAF5FF',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#EDE9FE',
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
    borderBottomColor: '#EDE9FE',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: -0.5,
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
  navItem: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: '#EDE9FE',
  },
  navItemText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  navItemTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#EDE9FE',
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
    backgroundColor: '#FAF5FF',
  },
  topBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#7C3AED',
  },
  narrowNav: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
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
  narrowNavItemActive: {
    backgroundColor: '#EDE9FE',
  },
  narrowNavText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  narrowNavTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  contentNarrow: {
    flex: 1,
  },
});
