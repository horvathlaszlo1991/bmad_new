import { useFonts } from 'expo-font';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Email not confirmed yet — keep user on verify-email, don't advance
    if (!session.user.email_confirmed_at) return;

    async function handleSession() {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session!.user.id)
        .maybeSingle();

      if (error) return;

      if (!profile) {
        // First confirmed sign-in — create profile from registration metadata
        const username = (session!.user.user_metadata?.username as string) ?? '';
        const phone = (session!.user.user_metadata?.phone as string) ?? null;
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({ id: session!.user.id, username, phone });
        if (insertError) return;
        router.replace('/(auth)/role');
        return;
      }

      if (profile.role) {
        if (!inAppGroup) router.replace('/(app)');
      } else {
        const onboardingScreens = ['role', 'profile', 'licence'];
        const currentScreen = (segments as string[])[1] ?? '';
        if (!inAuthGroup || !onboardingScreens.includes(currentScreen)) {
          router.replace('/(auth)/role');
        }
      }
    }

    handleSession();
  }, [session, segments, router]);

  return <Slot />;
}
