import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import {
  clearPendingRegistrationMeta,
  setPendingRegistrationMeta,
  syncUserProfile,
} from '../services/forumService';
import { useLanguage } from '../context/LanguageContext';
import { AuthPromptReason } from '../types';

interface AuthViewProps {
  promptReason?: AuthPromptReason | null;
  onBack: () => void;
  onSuccess: (user: User, isNewUser: boolean) => void | Promise<void>;
}

const LAST_EMAIL_KEY = 'malosha_last_auth_email_v1';

const GoogleGIcon: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

function extractErrorDetails(err: unknown): { code: string; message: string } {
  if (typeof err === 'object' && err !== null) {
    const maybeCode = 'code' in err ? String((err as { code?: unknown }).code || '') : '';
    const rawMsg =
      'message' in err ? String((err as { message?: unknown }).message || '') : String(err);

    if (rawMsg.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawMsg) as { error?: string; path?: string };
        return {
          code: maybeCode || 'firestore-error',
          message: parsed.error || rawMsg,
        };
      } catch {
        // Ignore JSON parse fallback
      }
    }
    return { code: maybeCode, message: rawMsg };
  }
  return { code: '', message: String(err || '') };
}

export const AuthView: React.FC<AuthViewProps> = ({
  promptReason = null,
  onBack,
  onSuccess,
}) => {
  const { tr } = useLanguage();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(LAST_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const saveLastEmail = (val: string) => {
    try {
      window.localStorage.setItem(LAST_EMAIL_KEY, val.trim());
    } catch {
      // Ignore storage failure
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleBusy(true);

    try {
      const popupPromise = signInWithPopup(auth, googleProvider);
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(Object.assign(new Error('Google popup timeout'), { code: 'auth/popup-timeout' }));
        }, 12000);
      });

      const cred = await Promise.race([popupPromise, timeoutPromise]);
      await syncUserProfile(cred.user);
      if (cred.user.email) saveLastEmail(cred.user.email);
      await onSuccess(cred.user, false);
    } catch (err) {
      const { code, message } = extractErrorDetails(err);
      console.error('Google Sign-In error:', code, message, err);

      if (
        (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') &&
        !isInIframe
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.error('Google Redirect fallback error:', redirectErr);
        }
      }

      setMode('register');

      if (code === 'auth/popup-timeout') {
        setErrorMsg(
          tr(
            'Dirisha la Google halikuitikia kwa wakati. Unaweza kujisajili au kuingia kwa urahisi kupitia fomu ya hapa chini.',
            'Google sign-in did not respond in time. You can easily register or sign in using the form below.'
          )
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          tr(
            `Kikoa hiki (${currentHost}) hakijaidhinishwa kwenye Firebase Google Auth. Ongeza "${currentHost}" kwenye Firebase Console → Authentication → Settings → Authorized domains, AU jisajili hapa chini.`,
            `Domain "${currentHost}" is not authorized in Firebase Auth. Add it in Firebase Console → Authentication → Settings → Authorized domains, OR register below.`
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          tr(
            'Huduma ya Google Sign-In haijawashwa kwenye Firebase Console. Tumia fomu ya hapa chini kujisajili kwa Jina, Simu, Email na Nenosiri.',
            'Google Sign-In is not enabled in Firebase Console. Use the form below to register with Name, Phone, Email and Password.'
          )
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          tr(
            'Kivinjari kimezuia dirisha la Google (Popup Blocked). Ruhusu popups au jisajili hapa chini.',
            'Your browser blocked the Google popup. Allow popups or register below.'
          )
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg(
          tr(
            'Dirisha la kuingia na Google lilifungwa kabla ya kukamilika. Jaribu tena au jisajili kwa Email hapa chini.',
            'Google sign-in was closed before completing. Try again or register with Email below.'
          )
        );
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg(
          tr(
            'Tatizo la mtandao wakati wa kuwasiliana na Google. Hakikisha una intaneti kisha jaribu tena.',
            'Network error while connecting to Google. Check your connection and try again.'
          )
        );
      } else {
        setErrorMsg(
          tr(
            `Imeshindwa kuingia na Google (${code || message || 'hitilafu'}). Tafadhali tumia fomu ya hapa chini kujisajili au kuingia.`,
            `Google sign-in failed (${code || message || 'error'}). Please use the form below to register or sign in.`
          )
        );
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleBusy(false);
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(tr('Tafadhali weka barua pepe sahihi.', 'Please enter a valid email address.'));
      return;
    }

    if (password.length < 6) {
      setErrorMsg(
        tr('Nenosiri lazima liwe na herufi angalau 6.', 'Password must be at least 6 characters.')
      );
      return;
    }

    if (mode === 'register') {
      const cleanName = fullName.trim();
      const cleanPhone = phoneNumber.trim();
      const digitsOnly = cleanPhone.replace(/\D/g, '');

      if (cleanName.length < 2) {
        setErrorMsg(tr('Tafadhali jaza jina lako kamili.', 'Please enter your full name.'));
        return;
      }
      if (digitsOnly.length < 9 || cleanPhone.length > 30) {
        setErrorMsg(
          tr(
            'Tafadhali weka namba ya simu sahihi (angalau tarakimu 9).',
            'Please enter a valid phone number (at least 9 digits).'
          )
        );
        return;
      }

      setFormBusy(true);
      // Set pending meta BEFORE creating user so onAuthStateChanged & syncUserProfile serialize cleanly without a race condition
      setPendingRegistrationMeta(cleanEmail, {
        displayName: cleanName,
        phoneNumber: cleanPhone,
      });

      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
        await syncUserProfile(cred.user, {
          displayName: cleanName,
          phoneNumber: cleanPhone,
        });
        saveLastEmail(cleanEmail);
        void sendEmailVerification(cred.user).catch(() => {});
        await onSuccess(cred.user, true);
      } catch (err) {
        clearPendingRegistrationMeta(cleanEmail);
        const { code, message } = extractErrorDetails(err);
        console.error('Register error:', code, message, err);

        if (code === 'auth/email-already-in-use') {
          setMode('login');
          setErrorMsg(
            tr(
              'Barua pepe hii tayari ina akaunti. Tumekuhamishia kwenye sehemu ya "Ingia" — weka nenosiri lako ili uingie (baada ya hapo hutaombwa tena mpaka utoke).',
              'This email already has an account. Switched to "Sign In" — enter your password once to stay signed in.'
            )
          );
        } else if (code === 'auth/weak-password') {
          setErrorMsg(
            tr(
              'Nenosiri ni dhaifu sana. Tumia angalau herufi 6 au mchanganyiko wa namba.',
              'Password is too weak. Use at least 6 characters.'
            )
          );
        } else if (code === 'auth/invalid-email') {
          setErrorMsg(tr('Muundo wa barua pepe si sahihi.', 'Invalid email address format.'));
        } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          setErrorMsg(
            tr(
              'Usajili wa Email/Password bado haujawashwa kwenye Firebase Console. Nenda Firebase Console → Authentication → Sign-in method → Email/Password → Enable.',
              'Email/Password sign-up is not enabled in Firebase Console. Go to Firebase Console → Authentication → Sign-in method → Email/Password → Enable.'
            )
          );
        } else if (code === 'auth/network-request-failed') {
          setErrorMsg(
            tr(
              'Tatizo la mtandao. Hakikisha una intaneti kisha jaribu tena.',
              'Network error. Check your internet connection and try again.'
            )
          );
        } else {
          setErrorMsg(
            tr(
              `Imeshindwa kusajili akaunti (${code || message || 'hitilafu'}). Tafadhali jaribu tena.`,
              `Failed to create account (${code || message || 'error'}). Please try again.`
            )
          );
        }
      } finally {
        setFormBusy(false);
      }
      return;
    }

    // Login mode
    setFormBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await syncUserProfile(cred.user);
      saveLastEmail(cleanEmail);
      await onSuccess(cred.user, false);
    } catch (err) {
      const { code, message } = extractErrorDetails(err);
      console.error('Email login error:', code, message, err);

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          tr(
            'Barua pepe au nenosiri si sahihi. Kama huna akaunti bado, chagua "Jisajili (Mpya)".',
            'Incorrect email or password. If you do not have an account yet, choose "Register (New)".'
          )
        );
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg(
          tr(
            'Majaribio mengi yameshindikana. Subiri kidogo kisha jaribu tena.',
            'Too many failed attempts. Please wait a moment and try again.'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          tr(
            'Kuingia kwa Email/Password bado hakujawashwa kwenye Firebase Console (Authentication → Sign-in method → Email/Password).',
            'Email/Password sign-in is not enabled in Firebase Console (Authentication → Sign-in method → Email/Password).'
          )
        );
      } else {
        setErrorMsg(
          tr(
            `Imeshindwa kuingia (${code || message || 'hitilafu'}). Tafadhali jaribu tena.`,
            `Failed to sign in (${code || message || 'error'}). Please try again.`
          )
        );
      }
    } finally {
      setFormBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg('');
    setInfoMsg('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(
        tr(
          'Andika barua pepe yako kwanza kisha gusa "Umesahau nenosiri?".',
          'Enter your email address first, then click "Forgot password?".'
        )
      );
      return;
    }

    setFormBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg(
        tr(
          `Kiungo cha kubadilisha nenosiri kimetumwa kwenda ${cleanEmail}. Angalia kikasha chako (au Spam).`,
          `A password reset link has been sent to ${cleanEmail}. Check your inbox (or Spam).`
        )
      );
    } catch (err) {
      const { code, message } = extractErrorDetails(err);
      setErrorMsg(
        tr(
          `Imeshindwa kutuma kiungo cha nenosiri (${code || message || 'hitilafu'}).`,
          `Could not send reset email (${code || message || 'error'}).`
        )
      );
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-5 pb-24 sm:px-6 sm:py-8 md:pb-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{tr('Rudi Kwenye Jukwaa', 'Back to Forum')}</span>
      </button>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* In-App Header */}
        <div className="border-b border-white/10 bg-[#0E2640] px-5 py-5 text-white sm:px-6">
          <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
            {tr('Akaunti ya Malosha Forums', 'Malosha Forums Account')}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-200 sm:text-[13px]">
            {tr(
              'Ingia na Google au jisajili kwa Jina, Simu, Barua Pepe na Nenosiri ili kuchapisha mada na kushiriki mijadala.',
              'Sign in with Google or register with Name, Phone, Email & Password to post topics and join discussions.'
            )}
          </p>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {promptReason && (
            <div
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950"
            >
              <p className="font-bold text-[#9A5B04]">
                {promptReason === 'comment'
                  ? tr('Tengeneza Akaunti ili Utoe Maoni', 'Create an Account to Comment')
                  : promptReason === 'like'
                    ? tr('Tengeneza Akaunti ili Upende (Like)', 'Create an Account to Like')
                    : promptReason === 'chat'
                      ? tr('Tengeneza Akaunti ili Ushiriki Mchart', 'Create an Account to Join Mchart')
                      : tr('Tengeneza Akaunti ili Uchapishie Mada', 'Create an Account to Post')}
              </p>
              <p className="mt-0.5">
                {tr(
                  'Unaweza kuendelea na Google papo hapo au kujisajili kawaida kwa kujaza Jina, Namba ya Simu, Email na Nenosiri hapa chini.',
                  'You can continue with Google immediately or register below using your Name, Phone Number, Email, and Password.'
                )}
              </p>
            </div>
          )}

          {/* Persistent Session Assurance */}
          <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-[#0E2640]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4E89]" aria-hidden="true" />
            <p>
              {tr(
                'Ukiisha ingia au kujisajili mara moja, utaingia moja kwa moja bila kujaza nenosiri tena mpaka utakapobonyeza Toka (Logout).',
                'Once signed in, you will remain signed in automatically without re-entering your password until you log out.'
              )}
            </p>
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            disabled={formBusy}
            onClick={() => {
              if (googleBusy) {
                setGoogleBusy(false);
                return;
              }
              void handleGoogleSignIn();
            }}
            className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <GoogleGIcon />
            <span>
              {googleBusy
                ? tr('Inawasiliana na Google... (Gusa kusitisha)', 'Connecting to Google... (Tap to cancel)')
                : tr('Endelea na Google', 'Continue with Google')}
            </span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs font-medium text-slate-500">
              {tr('au tumia barua pepe na nenosiri', 'or use email & password')}
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label={tr('Chagua njia ya akaunti', 'Choose account mode')}
            className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                mode === 'register'
                  ? 'bg-white text-[#0E2640] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr('Jisajili (Mpya)', 'Register (New)')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                mode === 'login'
                  ? 'bg-white text-[#0E2640] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr('Ingia (Nina Akaunti)', 'Sign In')}
            </button>
          </div>

          {/* Diagnostic / Error Alert */}
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs leading-relaxed text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <p className="break-words">{errorMsg}</p>
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <p>{infoMsg}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmitForm} className="space-y-4">
            {mode === 'register' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="auth-page-fullname"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Jina Kamili', 'Full Name')}
                  </label>
                  <div className="relative mt-1.5">
                    <UserIcon
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-page-fullname"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={tr('Mfano: Asha Juma', 'e.g. Asha Juma')}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-page-phone"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Namba ya Simu', 'Phone Number')}
                  </label>
                  <div className="relative mt-1.5">
                    <Phone
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-page-phone"
                      type="tel"
                      required
                      maxLength={30}
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={tr('Mfano: 0712 345 678', 'e.g. +255 712 345 678')}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-page-email"
                className="block text-xs font-semibold text-slate-700"
              >
                {tr('Barua Pepe (Email)', 'Email Address')}
              </label>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="auth-page-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jina@mfano.com"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-page-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {tr('Nenosiri (Password)', 'Password')}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    disabled={formBusy}
                    onClick={() => {
                      void handleForgotPassword();
                    }}
                    className="text-xs font-semibold text-[#1D4E89] hover:underline"
                  >
                    {tr('Umesahau nenosiri?', 'Forgot password?')}
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="auth-page-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr('Angalau herufi 6', 'At least 6 characters')}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-11 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={
                    showPassword
                      ? tr('Ficha nenosiri', 'Hide password')
                      : tr('Onyesha nenosiri', 'Show password')
                  }
                  className="absolute top-1/2 right-1 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={formBusy}
              className="mt-1 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#0E2640] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#163A5F] disabled:opacity-60"
            >
              {formBusy
                ? mode === 'register'
                  ? tr('Inasajili akaunti...', 'Creating account...')
                  : tr('Inaingia...', 'Signing in...')
                : mode === 'register'
                  ? tr('Jisajili Sasa', 'Create Account')
                  : tr('Ingia Kwenye Akaunti', 'Sign In')}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
