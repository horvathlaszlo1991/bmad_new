// Stub for expo-secure-store in Jest (node environment)
// The real module uses ESM and native APIs unavailable in Node.
module.exports = {
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
};
