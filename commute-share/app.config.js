export default ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return {
    ...config,
    ios: {
      ...config.ios,
      config: { googleMapsApiKey: mapsKey },
    },
    android: {
      ...config.android,
      config: { googleMaps: { apiKey: mapsKey } },
    },
    plugins: [
      ...(config.plugins ?? []).filter(
        (p) => (Array.isArray(p) ? p[0] : p) !== 'react-native-maps',
      ),
      ['react-native-maps', { androidGoogleMapsApiKey: mapsKey, iosGoogleMapsApiKey: mapsKey }],
    ],
  };
};
