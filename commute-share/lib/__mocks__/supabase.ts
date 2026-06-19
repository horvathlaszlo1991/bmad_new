// Manual mock for lib/supabase — used by Jest when jest.mock('./supabase') is called
// or when automock is enabled. Prevents expo-secure-store ESM import from running.
export const supabase = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  },
};
