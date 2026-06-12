import { supabase } from './supabase';

type RegisterResult = {
  error: string | null;
  errorField?: 'username' | 'email' | 'phone' | 'general';
};

export async function register(
  username: string,
  email: string,
  password: string,
  phone: string,
): Promise<RegisterResult> {
  const { data: usernameAvail, error: usernameErr } = await supabase.rpc(
    'check_availability',
    { field_name: 'username', field_value: username },
  );
  if (usernameErr) return { error: usernameErr.message, errorField: 'general' };
  if (!usernameAvail) return { error: 'Username already taken', errorField: 'username' };

  const { data: phoneAvail, error: phoneErr } = await supabase.rpc(
    'check_availability',
    { field_name: 'phone', field_value: phone },
  );
  if (phoneErr) return { error: phoneErr.message, errorField: 'general' };
  if (!phoneAvail) {
    return {
      error: 'Number already registered — log in or use a different number',
      errorField: 'phone',
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, phone } },
  });

  if (error) return { error: error.message, errorField: 'general' };

  // Supabase returns success with empty identities when the email is already registered
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { error: 'Email already in use', errorField: 'email' };
  }

  return { error: null };
}

type LoginResult = {
  error: string | null;
  emailNotConfirmed?: boolean;
};

export async function login(email: string, password: string): Promise<LoginResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { error: null };

  if (
    error.message.toLowerCase().includes('email not confirmed') ||
    (error as { code?: string }).code === 'email_not_confirmed'
  ) {
    return { error: 'Please verify your email first', emailNotConfirmed: true };
  }
  return { error: 'Incorrect email or password' };
}

export async function verifyEmailOtp(email: string, token: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) return error.message;
  return null;
}

export async function resendVerificationEmail(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return error.message;
  return null;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
