// Stub for lib/supabase in Jest (node environment)
// Tests for pure functions (e.g. validateBookingRequest) don't need a real client.
module.exports = {
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
};
