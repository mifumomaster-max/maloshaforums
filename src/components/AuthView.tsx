import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
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
  onSuccess: (user: User, isNewUser: boolean, phoneNumber?: string) => void | Promise<void>;
}

const LAST_EMAIL_KEY = 'malosha_last_auth_email_v1';

const GoogleGIcon: React.FC = () => (
  <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
  const [mode, setMode] = useState<'register' | 'login' | 'forgot'>('register');
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

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const saveLastEmail = (val: string) => {
    try {
      window.localStorage.setItem(LAST_EMAIL_KEY, val.trim());
    } catch {
      // Ignore storage failure
    }
  };

  // Fast, in-place Google popup sign-in (zero redirect bounce, background profile sync)
  const handleGoogleSignIn = async () => {
    if (googleBusy) return;
    setErrorMsg('');
    setInfoMsg('');
    setGoogleBusy(true);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user.email) saveLastEmail(cred.user.email);
      void syncUserProfile(cred.user).catch((syncErr) => {
        console.warn('Background Google profile sync:', syncErr);
      });
      await onSuccess(cred.user, false);
    } catch (err) {
      const { code } = extractErrorDetails(err);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setInfoMsg(
          tr(
            'Dirisha la Google lilifungwa. Gusa tena "Continue with Google" au ingia kwa barua pepe hapo juu.',
            'Google window was closed. Tap "Continue with Google" again or sign in above.'
          )
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          tr(
            `Kikoa (${currentHost}) hakijaidhinishwa kwa Google. Ongeza kwenye Firebase Authorized Domains au tumia fomu ya juu.`,
            `Domain (${currentHost}) is not authorized for Google Sign-In. Use email sign-in above or authorize it.`
          )
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          tr(
            'Kivinjari kimezuia dirisha la Google (Popup). Ruhusu popups au jisajili kwa barua pepe hapo juu.',
            'Browser blocked the Google popup. Allow popups or sign up with email above.'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          tr(
            'Huduma ya Google Sign-In bado haijawashwa kwenye Firebase Console. Tumia barua pepe na nenosiri hapo juu.',
            'Google Sign-In is not enabled in Firebase Console. Please use email & password above.'
          )
        );
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg(
          tr(
            'Tatizo la mtandao. Hakikisha intaneti ipo kisha jaribu tena.',
            'Network connection error. Please check your internet and try again.'
          )
        );
      } else {
        setErrorMsg(
          tr(
            'Imeshindwa kuunganisha na Google kwa sasa. Jaribu tena au ingia kwa barua pepe.',
            'Could not connect with Google right now. Please try again or use email.'
          )
        );
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (mode === 'forgot') {
      await handleForgotPasswordSubmit();
      return;
    }

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
        setErrorMsg(tr('Tafadhali andika jina lako kamili.', 'Please enter your full name.'));
        return;
      }
      if (cleanPhone.length > 0 && (digitsOnly.length < 9 || cleanPhone.length > 30)) {
        setErrorMsg(
          tr(
            'Weka namba sahihi ya simu (tarakimu 9+) au acha wazi.',
            'Enter a valid phone number (9+ digits) or leave blank.'
          )
        );
        return;
      }

      setFormBusy(true);
      setPendingRegistrationMeta(cleanEmail, {
        displayName: cleanName,
        phoneNumber: cleanPhone || undefined,
      });

      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        saveLastEmail(cleanEmail);
        void updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
        void syncUserProfile(cred.user, {
          displayName: cleanName,
          phoneNumber: cleanPhone || undefined,
        }).catch((syncErr) => {
          console.warn('Background register profile sync:', syncErr);
        });
        void sendEmailVerification(cred.user).catch(() => {});
        await onSuccess(cred.user, true, cleanPhone);
      } catch (err) {
        clearPendingRegistrationMeta(cleanEmail);
        const { code } = extractErrorDetails(err);

        if (code === 'auth/email-already-in-use') {
          setMode('login');
          setInfoMsg(
            tr(
              'Barua pepe hii tayari imesajiliwa. Tumekuhamishia kwenye "Ingia" — weka nenosiri lako au gusa "Umesahau nenosiri?".',
              'This email is already registered. Switched to "Sign In" — enter your password or tap "Forgot password?".'
            )
          );
        } else if (code === 'auth/weak-password') {
          setErrorMsg(
            tr('Nenosiri ni dhaifu. Tumia angalau herufi 6.', 'Password is too weak. Use at least 6 characters.')
          );
        } else if (code === 'auth/invalid-email') {
          setErrorMsg(tr('Barua pepe si sahihi.', 'Invalid email address.'));
        } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          setErrorMsg(
            tr(
              'Usajili wa Email bado haujawashwa kwenye Firebase Console. Tumia "Continue with Google" hapa chini.',
              'Email registration is not enabled in Firebase Console. Please use "Continue with Google" below.'
            )
          );
        } else if (code === 'auth/network-request-failed') {
          setErrorMsg(
            tr('Tatizo la mtandao. Hakikisha una intaneti kisha jaribu tena.', 'Network error. Check connection and try again.')
          );
        } else {
          setErrorMsg(
            tr('Imeshindwa kusajili akaunti. Tafadhali jaribu tena.', 'Could not create account. Please try again.')
          );
        }
      } finally {
        setFormBusy(false);
      }
      return;
    }

    // Login mode (Fast sign-in)
    setFormBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      saveLastEmail(cleanEmail);
      void syncUserProfile(cred.user).catch((syncErr) => {
        console.warn('Background login profile sync:', syncErr);
      });
      await onSuccess(cred.user, false);
    } catch (err) {
      const { code } = extractErrorDetails(err);

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          tr(
            'Barua pepe au nenosiri si sahihi. Kama umesahau nenosiri, gusa "Umesahau nenosiri?".',
            'Incorrect email or password. If you forgot your password, tap "Forgot password?".'
          )
        );
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg(
          tr(
            'Majaribio mengi yameshindikana. Subiri kidogo au tumia "Umesahau nenosiri?".',
            'Too many attempts. Please wait briefly or use "Forgot password?".'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          tr(
            'Kuingia kwa Email hakujawashwa bado. Tumia "Continue with Google" hapa chini.',
            'Email sign-in is not enabled yet. Please use "Continue with Google" below.'
          )
        );
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg(
          tr('Tatizo la mtandao. Hakikisha intaneti ipo kisha jaribu tena.', 'Network error. Please try again.')
        );
      } else {
        setErrorMsg(tr('Imeshindwa kuingia. Tafadhali jaribu tena.', 'Sign in failed. Please try again.'));
      }
    } finally {
      setFormBusy(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    setErrorMsg('');
    setInfoMsg('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(
        tr(
          'Andika barua pepe yako hapo chini ili tukutumie ujumbe wa kubadilisha nenosiri.',
          'Enter your email address below to receive a password reset email.'
        )
      );
      return;
    }

    setFormBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      saveLastEmail(cleanEmail);
      setInfoMsg(
        tr(
          `Ujumbe wa kubadilisha nenosiri umetumwa kwenda ${cleanEmail}. Fungua email yako (angalia Inbox au Spam) kubadilisha nenosiri lako.`,
          `Password reset email sent to ${cleanEmail}. Check your Inbox or Spam folder to set a new password.`
        )
      );
    } catch (err) {
      const { code } = extractErrorDetails(err);
      if (code === 'auth/user-not-found') {
        setErrorMsg(
          tr(
            'Hakuna akaunti yenye barua pepe hiyo. Hakikisha umeandika sawa au jisajili upya.',
            'No account found with that email address. Please check or create a new account.'
          )
        );
      } else if (code === 'auth/invalid-email') {
        setErrorMsg(tr('Barua pepe si sahihi.', 'Please enter a valid email address.'));
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg(
          tr('Maombi mengi kwa muda mfupi. Subiri kidogo kisha jaribu tena.', 'Too many requests. Wait briefly and try again.')
        );
      } else {
        setErrorMsg(
          tr('Imeshindwa kutuma ujumbe wa kubadilisha nenosiri. Jaribu tena.', 'Failed to send password reset email.')
        );
      }
    } finally {
      setFormBusy(false);
    }
  };

  const promptHintText =
    promptReason === 'vote'
      ? tr('Jisajili au ingia kupiga kura yako kwenye Mpoll.', 'Sign up or sign in to cast your Mpoll vote.')
      : promptReason === 'comment'
        ? tr('Jisajili au ingia kutoa maoni yako.', 'Sign up or sign in to comment.')
        : promptReason === 'chat'
          ? tr('Jisajili au ingia kushiriki Mchart.', 'Sign up or sign in to join Mchart.')
          : promptReason === 'post'
            ? tr('Jisajili au ingia kuchapisha mada mpya.', 'Sign up or sign in to create a post.')
            : null;

  return (
    <div className="fixed inset-0 sm:static h-[100dvh] w-full overflow-hidden overscroll-none bg-white sm:bg-gradient-to-b sm:from-[#EDF3FA] sm:via-[#F1F4F8] sm:to-[#E2EAF4] p-0 sm:px-5 sm:py-5 flex items-stretch sm:items-center justify-center">
      <section className="relative w-full h-[100dvh] sm:h-auto sm:max-w-[440px] sm:max-h-[calc(100dvh-28px)] overflow-hidden overscroll-none rounded-none sm:rounded-3xl border-0 sm:border sm:border-slate-200/90 bg-white sm:shadow-xl flex flex-col justify-between">
        {/* Rotating World Globe Watermark Layer Behind Registration Card Content */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden pt-16 sm:pt-20"
        >
          <div className="relative w-[330px] h-[330px] sm:w-[370px] sm:h-[370px] opacity-[0.075] sm:opacity-[0.085]">
            <svg
              viewBox="0 0 240 240"
              fill="none"
              className="w-full h-full text-[#1D4E89] animate-malosha-globe-spin"
            >
              {/* Outer globe sphere */}
              <circle cx="120" cy="120" r="88" stroke="currentColor" strokeWidth="2.2" />
              {/* Latitude lines */}
              <ellipse cx="120" cy="120" rx="88" ry="26" stroke="currentColor" strokeWidth="1.5" />
              <ellipse cx="120" cy="120" rx="80" ry="56" stroke="currentColor" strokeWidth="1.35" strokeDasharray="4 4" />
              <line x1="34" y1="86" x2="206" y2="86" stroke="currentColor" strokeWidth="1.2" />
              <line x1="34" y1="154" x2="206" y2="154" stroke="currentColor" strokeWidth="1.2" />
              <line x1="32" y1="120" x2="208" y2="120" stroke="currentColor" strokeWidth="1.7" />
              {/* Longitude meridians */}
              <ellipse cx="120" cy="120" rx="28" ry="88" stroke="currentColor" strokeWidth="1.5" />
              <ellipse cx="120" cy="120" rx="58" ry="88" stroke="currentColor" strokeWidth="1.4" />
              <line x1="120" y1="32" x2="120" y2="208" stroke="currentColor" strokeWidth="1.7" />
              {/* Tilted orbital ring & cardinal nodes */}
              <ellipse
                cx="120"
                cy="120"
                rx="106"
                ry="34"
                transform="rotate(-24 120 120)"
                stroke="#0E2640"
                strokeWidth="1.4"
                strokeDasharray="6 5"
              />
              <circle cx="120" cy="32" r="3.5" fill="currentColor" />
              <circle cx="208" cy="120" r="3.5" fill="currentColor" />
              <circle cx="120" cy="208" r="3.5" fill="currentColor" />
              <circle cx="32" cy="120" r="3.5" fill="currentColor" />
            </svg>
            <svg
              viewBox="0 0 240 240"
              fill="none"
              className="absolute inset-0 w-full h-full text-[#0E2640] animate-malosha-globe-orbit"
            >
              <circle
                cx="120"
                cy="120"
                r="112"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="3 9"
              />
              <circle cx="120" cy="8" r="3.5" fill="currentColor" />
              <circle cx="120" cy="232" r="3" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Compact Brand Header: Inline Back Pill + Circular Logo on Top + Malosha Forums Below */}
        <div className="relative z-10 shrink-0 overflow-hidden bg-gradient-to-br from-[#0A1F36] via-[#0E2640] to-[#1A4373] px-4 pt-2.5 pb-2 sm:px-5 sm:pt-4 sm:pb-3.5 text-center text-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#38BDF8]" />

          <button
            type="button"
            onClick={onBack}
            className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/95 backdrop-blur-xs transition-colors hover:bg-white/20"
            aria-label={tr('Rudi Kwenye Jukwaa', 'Back to Forum')}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Rudi', 'Back')}</span>
          </button>

          <div className="mx-auto flex flex-col items-center">
            <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-full p-0.5 sm:p-1 bg-gradient-to-br from-amber-300/70 via-white/30 to-sky-400/60 shadow-md">
              <img
                src="/icon.svg"
                alt="Malosha Forums"
                className="h-full w-full rounded-full object-cover bg-[#0B1F35]"
              />
            </div>

            <h1 className="mt-1 sm:mt-2 font-display text-base sm:text-xl font-extrabold tracking-tight text-white leading-tight">
              Malosha Forums
            </h1>
            <p className="mt-0.5 text-[10.5px] sm:text-xs text-sky-100/85 max-w-[290px] sm:max-w-xs mx-auto leading-tight line-clamp-1">
              {promptHintText ||
                tr(
                  'Mijadala, Habari, Fursa, Video, Mchart & Mpoll.',
                  'Forums, Articles, Opportunities, Video, Mchart & Mpoll.'
                )}
            </p>
          </div>
        </div>

        {/* Card Body: Fits cleanly on one mobile screen with zero bounce */}
        <div className="relative z-10 flex-1 flex flex-col justify-center overflow-y-auto overscroll-none px-4 py-2 sm:p-5">
          <div className="w-full space-y-2 sm:space-y-3">
            {/* Tabs: Register / Sign In (or Back when inside Forgot Password view) */}
            {mode === 'forgot' ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-sky-50/95 border border-sky-200/80 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <KeyRound className="h-4 w-4 shrink-0 text-[#1D4E89]" />
                  <span className="text-xs font-extrabold text-[#0E2640] truncate">
                    {tr('Badilisha Nenosiri Kupitia Email', 'Reset Password via Email')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setInfoMsg('');
                  }}
                  className="text-xs font-bold text-[#1D4E89] hover:underline shrink-0"
                >
                  {tr('Rudi Kuingia', 'Back to Sign In')}
                </button>
              </div>
            ) : (
              <div
                role="tablist"
                aria-label={tr('Chagua njia ya akaunti', 'Choose account mode')}
                className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/95 p-1"
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
                  className={`min-h-[34px] sm:min-h-[38px] rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-all sm:text-sm ${
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
                  className={`min-h-[34px] sm:min-h-[38px] rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-all sm:text-sm ${
                    mode === 'login'
                      ? 'bg-white text-[#0E2640] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tr('Ingia (Nina Akaunti)', 'Sign In')}
                </button>
              </div>
            )}

            {/* Feedback Alerts */}
            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-1.5 text-[11px] leading-snug text-rose-900"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                <p className="break-words">{errorMsg}</p>
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/95 px-3 py-1.5 text-[11px] leading-snug text-emerald-900"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <p>{infoMsg}</p>
              </div>
            )}

            {/* Primary Email Form (ON TOP) */}
            <form onSubmit={handleSubmitForm} className="space-y-2 sm:space-y-2.5">
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="auth-page-fullname"
                      className="block text-[11px] font-bold text-slate-700"
                    >
                      {tr('Jina Kamili', 'Full Name')}
                    </label>
                    <div className="relative mt-0.5">
                      <UserIcon
                        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
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
                        placeholder={tr('Asha Juma', 'Full name')}
                        className="h-[38px] sm:h-[42px] w-full rounded-xl border border-slate-300 bg-white/92 backdrop-blur-[1px] pr-2 pl-8 text-[16px] sm:text-sm text-slate-900 placeholder:text-[12px] placeholder:text-slate-400 focus:border-[#1D4E89] focus:ring-2 focus:ring-[#1D4E89]/15 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="auth-page-phone"
                      className="block text-[11px] font-bold text-slate-700"
                    >
                      {tr('Simu (Hiari)', 'Phone (Optional)')}
                    </label>
                    <div className="relative mt-0.5">
                      <Phone
                        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="auth-page-phone"
                        type="tel"
                        maxLength={30}
                        autoComplete="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder={tr('0712...', '+255...')}
                        className="h-[38px] sm:h-[42px] w-full rounded-xl border border-slate-300 bg-white/92 backdrop-blur-[1px] pr-2 pl-8 text-[16px] sm:text-sm text-slate-900 placeholder:text-[12px] placeholder:text-slate-400 focus:border-[#1D4E89] focus:ring-2 focus:ring-[#1D4E89]/15 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-page-email"
                  className="block text-[11px] font-bold text-slate-700"
                >
                  {tr('Barua Pepe (Email)', 'Email Address')}
                </label>
                <div className="relative mt-0.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
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
                    className="h-[38px] sm:h-[42px] w-full rounded-xl border border-slate-300 bg-white/92 backdrop-blur-[1px] pr-3 pl-8 text-[16px] sm:text-sm text-slate-900 placeholder:text-[12px] placeholder:text-slate-400 focus:border-[#1D4E89] focus:ring-2 focus:ring-[#1D4E89]/15 focus:outline-none"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="auth-page-password"
                      className="block text-[11px] font-bold text-slate-700"
                    >
                      {tr('Nenosiri (Password)', 'Password')}
                    </label>
                    <button
                      type="button"
                      disabled={formBusy}
                      onClick={() => {
                        setMode('forgot');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className="text-[11px] font-bold text-[#1D4E89] hover:underline"
                    >
                      {tr('Umesahau nenosiri?', 'Forgot password?')}
                    </button>
                  </div>
                  <div className="relative mt-0.5">
                    <Lock
                      className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
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
                      className="h-[38px] sm:h-[42px] w-full rounded-xl border border-slate-300 bg-white/92 backdrop-blur-[1px] pr-10 pl-8 text-[16px] sm:text-sm text-slate-900 placeholder:text-[12px] placeholder:text-slate-400 focus:border-[#1D4E89] focus:ring-2 focus:ring-[#1D4E89]/15 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={
                        showPassword
                          ? tr('Ficha nenosiri', 'Hide password')
                          : tr('Onyesha nenosiri', 'Show password')
                      }
                      className="absolute top-1/2 right-1 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-slate-800"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={formBusy || googleBusy}
                className="flex h-[40px] sm:h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0E2640] to-[#1D4E89] px-4 text-xs sm:text-sm font-extrabold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60"
              >
                {formBusy
                  ? mode === 'forgot'
                    ? tr('Inatuma ujumbe...', 'Sending reset email...')
                    : mode === 'register'
                      ? tr('Inasajili...', 'Creating account...')
                      : tr('Inaingia...', 'Signing in...')
                  : mode === 'forgot'
                    ? tr('Tuma Ujumbe Kwenye Email', 'Send Reset Link to Email')
                    : mode === 'register'
                      ? tr('Jisajili Sasa', 'Create Account')
                      : tr('Ingia Kwenye Akaunti', 'Sign In')}
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {tr('au', 'or')}
              </span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            {/* Google Sign-In BELOW Email Form — Strictly English "Continue with Google" */}
            <button
              type="button"
              disabled={formBusy || googleBusy}
              onClick={() => {
                void handleGoogleSignIn();
              }}
              className="flex h-[40px] sm:h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white/95 px-4 text-xs sm:text-sm font-bold text-slate-900 shadow-2xs transition-colors hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
            >
              <GoogleGIcon />
              <span>{googleBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>
          </div>
        </div>

        {/* Bottom-most Card Ownership Footer */}
        <div className="relative z-10 shrink-0 border-t border-slate-100 bg-slate-50/92 backdrop-blur-[2px] px-3 py-2 sm:px-4 sm:py-2.5 text-center">
          <p className="text-[10.5px] sm:text-xs font-semibold text-slate-600 leading-snug">
            Jukwaa hili limetengenezwa na{' '}
            <span className="font-extrabold text-[#0E2640]">David Malosha Amos</span>,{' '}
            Mkurugenzi Mkuu wa <span className="font-extrabold text-[#1D4E89]">MBT</span>.
          </p>
        </div>
      </section>
    </div>
  );
};
