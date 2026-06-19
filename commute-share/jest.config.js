/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', esModuleInterop: true } }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  globals: {
    // Expo defines __DEV__ at runtime; provide it for Jest's node environment
    __DEV__: true,
  },
  moduleNameMapper: {
    // Stub out Expo/RN native modules that use ESM and can't run in Node
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
  },
};
