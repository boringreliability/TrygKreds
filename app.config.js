/**
 * Dynamic layer over app.json.
 *
 * Expo calls this with app.json already parsed and passed in as `config`, so
 * app.json stays the readable, declarative source of truth and this file does
 * exactly one thing: inject the Google Maps key from the environment.
 *
 * The key is not committed, which matters in a public repository. It is
 * restricted by package name and signing certificate in the Google Cloud
 * console; that restriction is what protects it, since the key ships inside
 * every APK either way.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
    },
  },
});
