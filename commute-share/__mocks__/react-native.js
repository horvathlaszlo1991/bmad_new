// Stub for react-native in Jest (node environment)
// Only the Platform API is needed by lib/supabase.ts.
module.exports = {
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
  },
};
