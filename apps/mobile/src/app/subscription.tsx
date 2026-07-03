import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { getMeSubscription, getMeUsage } from '../lib/api';
import { useAppTheme } from '../theme/AppThemeContext';
import type { MeSubscriptionResponse, MeUsageResponse } from '@storygen/shared';
import AppShell from '../components/AppShell';

type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'ATIVA',
  PAST_DUE: 'EM ATRASO',
  CANCELED: 'CANCELADA',
  EXPIRED: 'EXPIRADA',
};

const STATUS_COLORS: Record<SubscriptionStatus, { bg: string; fg: string }> = {
  ACTIVE: { bg: '#DCFCE7', fg: '#15803D' },
  PAST_DUE: { bg: '#FEF3C7', fg: '#B45309' },
  CANCELED: { bg: '#FEF2F2', fg: '#DC2626' },
  EXPIRED: { bg: '#F3F4F6', fg: '#6B7280' },
};

const STORE_MANAGE_URLS: Record<string, string> = {
  APP_STORE: 'https://apps.apple.com/account/subscriptions',
  PLAY_STORE: 'https://play.google.com/store/account/subscriptions',
};

function formatPrice(priceCents: number): string {
  return `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const theme = useAppTheme();
  const ratio = limit && limit > 0 ? Math.min(used / limit, 1) : 0;
  const over = limit !== null && used >= limit;
  return (
    <View style={styles.usageItem}>
      <View style={styles.usageLabelRow}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text
          style={[
            styles.usageCount,
            { color: over ? '#DC2626' : theme.primary },
          ]}
        >
          {limit !== null ? `${used}/${limit}` : `${used}`}
        </Text>
      </View>
      {limit !== null ? (
        <View
          style={[styles.usageTrack, { backgroundColor: theme.primarySoft }]}
          accessibilityRole="progressbar"
          accessibilityLabel={`${label}: ${used} de ${limit}`}
        >
          <View
            style={[
              styles.usageFill,
              { width: `${ratio * 100}%` },
              { backgroundColor: over ? '#DC2626' : theme.primary },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function SubscriptionScreen() {
  const { accessToken } = useAuth();
  const theme = useAppTheme();

  const [subscription, setSubscription] = useState<MeSubscriptionResponse['subscription']>(null);
  const [usage, setUsage] = useState<MeUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const [subRes, usageRes] = await Promise.all([
        getMeSubscription(accessToken),
        getMeUsage(accessToken),
      ]);
      setSubscription(subRes.subscription);
      setUsage(usageRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar assinatura.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <AppShell title="Assinatura">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Assinatura">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Tentar novamente"
          >
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  const statusStyle = subscription ? STATUS_COLORS[subscription.status] : null;
  const manageUrl = subscription ? STORE_MANAGE_URLS[subscription.store] : undefined;

  return (
    <AppShell title="Assinatura">
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>Assinatura</Text>
        <Text style={styles.pageSubtitle}>Seu plano e o uso deste mês</Text>

        {subscription ? (
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{subscription.plan.name}</Text>
              {statusStyle ? (
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.fg }]}>
                    {STATUS_LABELS[subscription.status]}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.planPrice, { color: theme.primary }]}>
              {formatPrice(subscription.plan.price_cents)}
              <Text style={styles.planPriceSuffix}> /mês</Text>
            </Text>
            <Text style={styles.planPeriod}>
              Período atual até {formatDate(subscription.current_period_end)}
            </Text>

            {manageUrl ? (
              <TouchableOpacity
                style={[styles.manageButton, { backgroundColor: theme.primarySoft }]}
                onPress={() => void Linking.openURL(manageUrl)}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Gerenciar assinatura na loja"
              >
                <Text style={[styles.manageButtonText, { color: theme.primary }]}>
                  Gerenciar assinatura
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.manageHint}>
                Para alterar ou cancelar, gerencie pelo portal do cliente Stripe.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.planCard}>
            <Text style={styles.noPlanTitle}>Nenhuma assinatura</Text>
            <Text style={styles.noPlanText}>
              Você ainda não tem uma assinatura ativa. Assine um plano para gerar histórias.
            </Text>
          </View>
        )}

        {usage ? (
          <View style={styles.usageCard}>
            <Text style={styles.usageTitle}>Uso em {usage.period}</Text>
            <UsageBar
              label="Histórias no mês"
              used={usage.stories_generated}
              limit={usage.limits ? usage.limits.max_stories_per_month : null}
            />
            <UsageBar
              label="Universos"
              used={usage.universes_created}
              limit={usage.limits ? usage.limits.max_universes : null}
            />
            {!usage.limits ? (
              <Text style={styles.usageHint}>
                Sem plano ativo — limites indisponíveis.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E1B4B',
    flex: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planPrice: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  planPriceSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  planPeriod: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  manageButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  manageHint: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  noPlanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 6,
  },
  noPlanText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  usageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  usageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 14,
  },
  usageItem: {
    marginBottom: 14,
  },
  usageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  usageLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  usageCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  usageTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  usageFill: {
    height: 8,
    borderRadius: 4,
  },
  usageHint: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
