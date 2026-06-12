import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#1a1a1a',
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create Account', headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ title: 'Verify Email', headerBackVisible: false }} />
      <Stack.Screen name="role" options={{ title: 'Your Role', headerBackVisible: false }} />
      <Stack.Screen name="profile" options={{ title: 'Your Profile', headerBackVisible: false }} />
      <Stack.Screen name="licence" options={{ title: 'Driver Licence', headerBackVisible: false }} />
    </Stack>
  );
}
