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
    appSlug: process.env.APP_SLUG ?? "historias-da-gigi",
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000",
  },
});
