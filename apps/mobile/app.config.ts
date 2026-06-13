import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_SLUG = process.env.APP_SLUG ?? "storygen-dev";
const APP_MODE = (process.env.APP_MODE ?? "SINGLE") as "MULTI" | "SINGLE";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config, // preserva plugins (expo-router), scheme, web.bundler, ios/android do app.json
  name: APP_SLUG,
  slug: APP_SLUG,
  extra: {
    ...config.extra,
    appMode: APP_MODE,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
