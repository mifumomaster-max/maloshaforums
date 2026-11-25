import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Crop,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, signInWithGooglePopup } from '../firebase';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import {
  clearPendingRegistrationMeta,
  setPendingRegistrationMeta,
  syncUserProfile,
} from '../services/forumService';
import { useLanguage } from '../context/LanguageContext';
import { AuthPromptReason } from '../types';
import { ImageResizeModal } from './ImageResizeModal';

interface AuthViewProps {
  promptReason?: AuthPromptReason | null;
  onBack: () => void;
  onSuccess: (user: User, isNewUser: boolean, phoneNumber?: string) => void | Promise<void>;
}

const BRAND_TITLE_FULL = 'Malosha Forums';

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

async function storeBrowserPasswordCredential(
  email: string,
  password: string,
  displayName?: string | null
): Promise<void> {
  if (typeof window === 'undefined' || !('PasswordCredential' in window)) return;
  try {
    const PasswordCredentialCtor = (
      window as unknown as {
        PasswordCredential?: new (data: {
          id: string;
          password: string;
          name?: string;
        }) => Credential;
      }
    ).PasswordCredential;
    if (PasswordCredentialCtor && navigator.credentials?.store) {
      const cred = new PasswordCredentialCtor({
        id: email,
        password,
        name: displayName || email,
      });
      await navigator.credentials.store(cred);
    }
  } catch {
    // Browser credential storage optional
  }
}

export const AuthView: React.FC<AuthViewProps> = ({
  promptReason = null,
  onBack,
  onSuccess,
}) => {
  const { tr } = useLanguage();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration Profile Picture & Crop/Resize State
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [rawSelectedPhoto, setRawSelectedPhoto] = useState<File | null>(null);
  const [pendingCropPhoto, setPendingCropPhoto] = useState<File | null>(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState('');
  const uploadedPhotoCacheRef = useRef<{ file: File | null; url: string }>({
    file: null,
    url: '',
  });

  // Letter-by-letter "Malosha Forums" Typewriter State
  const [visibleChars, setVisibleChars] = useState<number>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return BRAND_TITLE_FULL.length;
    }
    return 1;
  });

  const [googleBusy, setGoogleBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [uploadStageLabel, setUploadStageLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const googlePopupLockRef = useRef(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  // Clean letter-by-letter reveal for "Malosha Forums" (loops gracefully after resting)
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisibleChars(BRAND_TITLE_FULL.length);
      return;
    }

    let timerId = 0;
    if (visibleChars < BRAND_TITLE_FULL.length) {
      timerId = window.setTimeout(() => {
        setVisibleChars((prev) => prev + 1);
      }, 115);
    } else {
      timerId = window.setTimeout(() => {
        setVisibleChars(1);
      }, 3400);
    }

    return () => window.clearTimeout(timerId);
  }, [visibleChars]);

  // Keep preview URL clean
  useEffect(() => {
    if (!profilePhotoFile) {
      setProfilePhotoPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(profilePhotoFile);
    setProfilePhotoPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [profilePhotoFile]);

  const handlePickProfilePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(tr('Chagua faili la picha (JPG, PNG, WEBP).', 'Please select an image file.'));
      return;
    }
    setErrorMsg('');
    setRawSelectedPhoto(file);
    setPendingCropPhoto(file);
  };

  // Fast, in-place Google popup sign-in
  const handleGoogleSignIn = async () => {
    if (googlePopupLockRef.current || googleBusy) return;
    googlePopupLockRef.current = true;
    setErrorMsg('');
    setInfoMsg('');
    setGoogleBusy(true);

    try {
      const cred = await signInWithGooglePopup();
      void syncUserProfile(cred.user).catch((syncErr) => {
        console.warn('Background Google profile sync:', syncErr);
      });
      await onSuccess(cred.user, false);
    } catch (err) {
      const { code, message } = extractErrorDetails(err);
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        message.includes('Pending promise was never set')
      ) {
        setInfoMsg(
          tr(
            'Dirisha la Google lilifungwa. Gusa tena "Continue with Google" au ingia kwa barua pepe hapo juu.',
            'Google window was closed. Tap "Continue with Google" again or sign in above.'
          )
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          tr(
            `Kikoa (${currentHost}) hakijaidhinishwa kwa Google. Tumia fomu ya juu.`,
            `Domain (${currentHost}) is not authorized for Google Sign-In. Use email sign-in above.`
          )
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          tr(
            'Kivinjari kimezuia dirisha la Google (Popup). Ruhusu popups au jisajili kwa barua pepe.',
            'Browser blocked Google popup. Allow popups or sign up with email above.'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          tr(
            'Huduma ya Google Sign-In bado haijawashwa kwenye Firebase Console. Tumia barua pepe.',
            'Google Sign-In is not enabled in Firebase Console. Please use email & password.'
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
      googlePopupLockRef.current = false;
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
      let uploadedPhotoUrl = '';

      try {
        if (profilePhotoFile) {
          if (
            uploadedPhotoCacheRef.current.file === profilePhotoFile &&
            uploadedPhotoCacheRef.current.url
          ) {
            uploadedPhotoUrl = uploadedPhotoCacheRef.current.url;
          } else {
            setUploadStageLabel(tr('Inapakia picha...', 'Uploading photo...'));
            uploadedPhotoUrl = await uploadImageToCloudinary(profilePhotoFile);
            uploadedPhotoCacheRef.current = {
              file: profilePhotoFile,
              url: uploadedPhotoUrl,
            };
          }
        }

        setUploadStageLabel(tr('Inatengeneza akaunti...', 'Creating account...'));
        setPendingRegistrationMeta(cleanEmail, {
          displayName: cleanName,
          phoneNumber: cleanPhone || undefined,
          photoURL: uploadedPhotoUrl || undefined,
        });

        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        void storeBrowserPasswordCredential(cleanEmail, password, cleanName);
        void updateProfile(cred.user, {
          displayName: cleanName,
          ...(uploadedPhotoUrl ? { photoURL: uploadedPhotoUrl } : {}),
        }).catch(() => {});
        void syncUserProfile(cred.user, {
          displayName: cleanName,
          phoneNumber: cleanPhone || undefined,
          photoURL: uploadedPhotoUrl || undefined,
        }).catch((syncErr) => {
          console.warn('Background register profile sync:', syncErr);
        });
        void sendEmailVerification(cred.user).catch(() => {});
        await onSuccess(cred.user, true, cleanPhone);
      } catch (err) {
        clearPendingRegistrationMeta(cleanEmail);
        const { code, message } = extractErrorDetails(err);

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
        } else if (message.includes('Cloudinary') || message.includes('picha')) {
          setErrorMsg(message);
        } else {
          setErrorMsg(
            tr('Imeshindwa kusajili akaunti. Tafadhali jaribu tena.', 'Could not create account. Please try again.')
          );
        }
      } finally {
        setFormBusy(false);
        setUploadStageLabel('');
      }
      return;
    }

    // Login mode (Persistent auto-login until explicit sign out)
    setFormBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      void storeBrowserPasswordCredential(
        cleanEmail,
        password,
        cred.user.displayName || cleanEmail
      );
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
      ? tr('Ingia au jisajili kupiga kura yako kwenye Mpoll.', 'Sign in or sign up to cast your Mpoll vote.')
      : promptReason === 'comment'
        ? tr('Ingia au jisajili kutoa maoni yako.', 'Sign in or sign up to comment.')
        : promptReason === 'chat'
          ? tr('Ingia au jisajili kushiriki Mchart.', 'Sign in or sign up to join Mchart.')
          : promptReason === 'post'
            ? tr('Ingia au jisajili kuchapisha mada mpya.', 'Sign in or sign up to create a post.')
            : null;

  const isTypingTitle = visibleChars < BRAND_TITLE_FULL.length;

  return (
    <div className="h-[100dvh] w-full overflow-y-auto overscroll-y-contain bg-gradient-to-br from-[#061527] via-[#0C2544] to-[#133863] px-3 py-4 sm:px-6 sm:py-6 flex flex-col items-center">
      <section className="relative my-auto w-full max-w-[388px] sm:max-w-[432px] overflow-hidden rounded-3xl border border-sky-200/75 bg-gradient-to-b from-[#EAF3FF] via-[#F2F8FF] to-[#E8F7F2] shadow-[0_22px_55px_rgba(3,12,28,0.52)] flex flex-col">
        {pendingCropPhoto ? (
          <div className="min-h-[520px] max-h-[86dvh] flex flex-col">
            <ImageResizeModal
              inline
              file={pendingCropPhoto}
              defaultPreset="1:1"
              showCircleGuide
              showLivePreview
              titleSw="Kata & Rekebisha Picha ya Wasifu"
              titleEn="Crop & Resize Profile Photo"
              subtitleSw="Vuta pembe au badilisha ukubwa ili picha yako ya wasifu ipendeze."
              subtitleEn="Drag corners or adjust scale so your profile picture fits cleanly."
              confirmLabelSw="Hifadhi Picha"
              confirmLabelEn="Save Photo"
              onCancel={() => setPendingCropPhoto(null)}
              onConfirm={(resizedFile) => {
                uploadedPhotoCacheRef.current = { file: null, url: '' };
                setProfilePhotoFile(resizedFile);
                setPendingCropPhoto(null);
              }}
            />
          </div>
        ) : (
          <>
            {/* Multi-Colored Rotating World Globe Watermark Layer */}
            <div
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden pt-20"
            >
              <div className="relative h-[300px] w-[300px] sm:h-[340px] sm:w-[340px] opacity-[0.17]">
                <svg
                  viewBox="0 0 240 240"
                  fill="none"
                  className="h-full w-full animate-malosha-globe-spin"
                >
                  <defs>
                    <radialGradient id="maloshaOceanGrad" cx="38%" cy="34%" r="68%">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.52" />
                      <stop offset="55%" stopColor="#0284C7" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#1D4E89" stopOpacity="0.38" />
                    </radialGradient>
                  </defs>
                  <circle
                    cx="120"
                    cy="120"
                    r="88"
                    fill="url(#maloshaOceanGrad)"
                    stroke="#0284C7"
                    strokeWidth="2.4"
                  />
                  <path
                    d="M72 62C84 55 98 61 103 73C107 82 95 92 98 102C101 112 114 114 112 126C110 138 97 148 92 162C88 172 78 168 74 156C69 142 62 132 66 118C70 105 56 96 58 82C60 72 64 67 72 62Z"
                    fill="#10B981"
                    fillOpacity="0.62"
                    stroke="#059669"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M126 56C145 52 167 64 176 80C184 95 174 114 164 122C156 128 159 144 151 156C142 168 128 162 126 146C124 132 132 122 126 112C118 98 115 80 120 66C122 61 124 58 126 56Z"
                    fill="#10B981"
                    fillOpacity="0.6"
                    stroke="#059669"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M158 148C168 144 182 152 183 163C184 172 173 182 162 178C152 174 150 153 158 148Z"
                    fill="#34D399"
                    fillOpacity="0.65"
                    stroke="#059669"
                    strokeWidth="1.1"
                  />
                  <ellipse cx="120" cy="120" rx="88" ry="26" stroke="#0284C7" strokeWidth="1.5" />
                  <ellipse
                    cx="120"
                    cy="120"
                    rx="80"
                    ry="56"
                    stroke="#0EA5E9"
                    strokeWidth="1.35"
                    strokeDasharray="4 4"
                  />
                  <line x1="34" y1="86" x2="206" y2="86" stroke="#0284C7" strokeWidth="1.2" />
                  <line x1="34" y1="154" x2="206" y2="154" stroke="#0284C7" strokeWidth="1.2" />
                  <line x1="32" y1="120" x2="208" y2="120" stroke="#F59E0B" strokeWidth="1.9" />
                  <ellipse cx="120" cy="120" rx="28" ry="88" stroke="#0284C7" strokeWidth="1.5" />
                  <ellipse cx="120" cy="120" rx="58" ry="88" stroke="#0EA5E9" strokeWidth="1.4" />
                  <line x1="120" y1="32" x2="120" y2="208" stroke="#0284C7" strokeWidth="1.7" />
                  <ellipse
                    cx="120"
                    cy="120"
                    rx="106"
                    ry="34"
                    transform="rotate(-24 120 120)"
                    stroke="#F59E0B"
                    strokeWidth="1.8"
                    strokeDasharray="6 5"
                  />
                  <circle cx="120" cy="32" r="4" fill="#F59E0B" />
                  <circle cx="208" cy="120" r="4" fill="#10B981" />
                  <circle cx="120" cy="208" r="4" fill="#0EA5E9" />
                  <circle cx="32" cy="120" r="4" fill="#F43F5E" />
                </svg>
                <svg
                  viewBox="0 0 240 240"
                  fill="none"
                  className="animate-malosha-globe-orbit absolute inset-0 h-full w-full"
                >
                  <circle
                    cx="120"
                    cy="120"
                    r="112"
                    stroke="#6366F1"
                    strokeWidth="1.4"
                    strokeDasharray="4 8"
                  />
                  <circle cx="120" cy="8" r="4.2" fill="#F59E0B" />
                  <circle cx="120" cy="232" r="3.8" fill="#10B981" />
                </svg>
              </div>
            </div>

            {/* Brand Header: Large Circular Fade-Animated Logo + Letter-by-Letter "Malosha Forums" */}
            <div className="relative z-10 shrink-0 overflow-hidden bg-gradient-to-br from-[#091D33] via-[#0E2A4A] to-[#174678] px-4 pt-4 pb-3.5 text-center text-white">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#10B981] via-[#F59E0B] to-[#38BDF8]" />

              <div className="mx-auto flex flex-col items-center">
                <div className="animate-malosha-logo-fade h-[76px] w-[76px] sm:h-[88px] sm:w-[88px] rounded-full bg-gradient-to-br from-amber-300 via-sky-300 to-emerald-400 p-[3px] shadow-[0_0_26px_rgba(56,189,248,0.38)] ring-2 ring-white/25">
                  <img
                    src="/icon.svg"
                    alt="Malosha Forums"
                    className="h-full w-full rounded-full bg-[#091C32] object-cover"
                  />
                </div>

                <h1
                  aria-label="Malosha Forums"
                  className="mt-2.5 grid place-items-center font-display text-[22px] sm:text-[26px] font-extrabold tracking-tight leading-tight"
                >
                  <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
                    Malosha Forums
                  </span>
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 justify-self-start whitespace-nowrap"
                  >
                    {BRAND_TITLE_FULL.slice(0, visibleChars)
                      .split('')
                      .map((ch, idx) => (
                        <span
                          key={`${idx}-${ch}`}
                          className={idx >= 8 ? 'text-amber-300' : 'text-white'}
                        >
                          {ch}
                        </span>
                      ))}
                    <span
                      className={`ml-0.5 inline-block h-[0.86em] w-[2px] align-middle bg-amber-300 ${
                        isTypingTitle ? 'opacity-100' : 'opacity-0 transition-opacity duration-300'
                      }`}
                    />
                  </span>
                </h1>

                <p className="mt-1 max-w-[300px] text-[11px] font-medium text-sky-100/90 leading-snug line-clamp-1">
                  {promptHintText ||
                    tr(
                      'Mijadala, Makala, Fursa, Video, Mchart & Mpoll.',
                      'Forums, Articles, Opportunities, Video, Mchart & Mpoll.'
                    )}
                </p>
              </div>
            </div>

            {/* Compact Card Body (Zero Blank Space on Login or Register) */}
            <div className="relative z-10 px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="mx-auto w-full max-w-[306px] sm:max-w-[328px] space-y-3">
                {/* Keep Strictly Two Tabs: Sign In (1st) & Register (2nd) */}
                {mode === 'forgot' ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-white/90 px-3 py-2 shadow-2xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <KeyRound className="h-4 w-4 shrink-0 text-[#0284C7]" aria-hidden="true" />
                      <span className="truncate text-xs font-extrabold text-[#0E2640]">
                        {tr('Badilisha Nenosiri', 'Reset Password')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className="shrink-0 whitespace-nowrap text-xs font-bold text-[#0284C7] hover:underline"
                    >
                      {tr('Rudi Kuingia', 'Back to Sign In')}
                    </button>
                  </div>
                ) : (
                  <div
                    role="tablist"
                    aria-label={tr('Chagua njia ya akaunti', 'Choose account mode')}
                    className="grid grid-cols-2 gap-1 rounded-xl border border-sky-200/90 bg-white/75 p-1 shadow-2xs"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'login'}
                      onClick={() => {
                        setMode('login');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-extrabold transition-all whitespace-nowrap ${
                        mode === 'login'
                          ? 'bg-gradient-to-r from-[#0E2640] to-[#1D4E89] text-white shadow-sm'
                          : 'text-slate-700 hover:text-[#0E2640]'
                      }`}
                    >
                      {tr('Ingia', 'Sign In')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'register'}
                      onClick={() => {
                        setMode('register');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-extrabold transition-all whitespace-nowrap ${
                        mode === 'register'
                          ? 'bg-gradient-to-r from-[#0284C7] to-[#0D9488] text-white shadow-sm'
                          : 'text-slate-700 hover:text-[#0E2640]'
                      }`}
                    >
                      {tr('Jisajili', 'Register')}
                    </button>
                  </div>
                )}

                {/* Alerts */}
                {errorMsg && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2 text-[11.5px] leading-snug text-rose-900"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                    <p className="break-words">{errorMsg}</p>
                  </div>
                )}

                {infoMsg && (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-[11.5px] leading-snug text-emerald-900"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <p>{infoMsg}</p>
                  </div>
                )}

                {/* Main Auth Form with Compact, Colorful Inputs */}
                <form
                  onSubmit={handleSubmitForm}
                  autoComplete="on"
                  method="post"
                  action="#"
                  className="space-y-2.5"
                >
                  {mode === 'register' && (
                    <>
                      {/* Registration Profile Picture + Resize + Name/Phone Row */}
                      <div className="flex items-center gap-3 rounded-2xl border border-sky-200/80 bg-white/85 p-2.5 shadow-2xs">
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handlePickProfilePhoto}
                          className="hidden"
                        />

                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            aria-label={tr('Weka picha ya wasifu', 'Upload profile picture')}
                            className="group relative flex h-[66px] w-[66px] items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#0284C7] bg-gradient-to-br from-sky-100 to-emerald-100 text-[#0E2640] shadow-xs transition-transform hover:scale-[1.03] active:scale-[0.98]"
                          >
                            {profilePhotoPreviewUrl ? (
                              <img
                                src={profilePhotoPreviewUrl}
                                alt={tr('Picha ya wasifu', 'Profile preview')}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center">
                                <Camera className="h-5 w-5 text-[#0284C7]" aria-hidden="true" />
                                <span className="mt-0.5 text-[9px] font-extrabold text-[#0E2640]">
                                  {tr('Picha', 'Photo')}
                                </span>
                              </div>
                            )}
                          </button>

                          {profilePhotoFile && (
                            <button
                              type="button"
                              onClick={() => {
                                setProfilePhotoFile(null);
                                setRawSelectedPhoto(null);
                                uploadedPhotoCacheRef.current = { file: null, url: '' };
                              }}
                              aria-label={tr('Ondoa picha', 'Remove photo')}
                              className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-rose-600 text-white shadow-sm hover:bg-rose-700"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-[11px] font-extrabold text-[#0E2640] leading-tight">
                            {tr('Picha ya Wasifu (Hiari)', 'Profile Photo (Optional)')}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-[#0284C7]/12 px-2.5 py-1 text-[11px] font-bold text-[#0369A1] hover:bg-[#0284C7]/20 whitespace-nowrap"
                            >
                              <Camera className="h-3 w-3" aria-hidden="true" />
                              <span>
                                {profilePhotoFile
                                  ? tr('Badilisha', 'Change')
                                  : tr('Chagua Picha', 'Choose')}
                              </span>
                            </button>
                            {profilePhotoFile && (
                              <button
                                type="button"
                                onClick={() => setPendingCropPhoto(rawSelectedPhoto || profilePhotoFile)}
                                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-500/25 whitespace-nowrap"
                              >
                                <Crop className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Resize', 'Resize')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Name & Phone Compact Inputs */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="auth-page-fullname"
                            className="block text-[11px] font-bold text-indigo-950"
                          >
                            {tr('Jina Kamili', 'Full Name')}
                          </label>
                          <div className="relative mt-0.5">
                            <UserIcon
                              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-indigo-600"
                              aria-hidden="true"
                            />
                            <input
                              id="auth-page-fullname"
                              name="name"
                              type="text"
                              required
                              minLength={2}
                              maxLength={80}
                              autoComplete="name"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder={tr('Asha Juma', 'Full name')}
                              className="h-[40px] w-full rounded-xl border border-indigo-300 bg-[#F5F3FF] pr-2 pl-8 text-[15px] sm:text-sm font-medium text-[#0A1F36] placeholder:text-[11.5px] placeholder:text-indigo-400 shadow-2xs focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-colors"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="auth-page-phone"
                            className="block text-[11px] font-bold text-emerald-950"
                          >
                            {tr('Simu (Hiari)', 'Phone (Opt.)')}
                          </label>
                          <div className="relative mt-0.5">
                            <Phone
                              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600"
                              aria-hidden="true"
                            />
                            <input
                              id="auth-page-phone"
                              name="tel"
                              type="tel"
                              maxLength={30}
                              autoComplete="tel"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              placeholder="0712..."
                              className="h-[40px] w-full rounded-xl border border-emerald-300 bg-[#ECFDF5] pr-2 pl-8 text-[15px] sm:text-sm font-medium text-[#0A1F36] placeholder:text-[11.5px] placeholder:text-emerald-600/60 shadow-2xs focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Compact Colorful Email Input */}
                  <div>
                    <label
                      htmlFor="auth-page-email"
                      className="block text-[11px] font-bold text-[#0E2640]"
                    >
                      {tr('Barua Pepe (Email)', 'Email Address')}
                    </label>
                    <div className="relative mt-0.5">
                      <Mail
                        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#0284C7]"
                        aria-hidden="true"
                      />
                      <input
                        id="auth-page-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        required
                        autoComplete={mode === 'register' ? 'email' : 'username'}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jina@mfano.com"
                        className="h-[42px] w-full rounded-xl border border-sky-300 bg-[#FFFFFF] pr-3 pl-9 text-[15px] sm:text-sm font-medium text-[#0A1F36] placeholder:text-[12px] placeholder:text-sky-600/55 shadow-2xs focus:border-[#0284C7] focus:ring-2 focus:ring-sky-500/25 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Compact Colorful Password Input */}
                  {mode !== 'forgot' && (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="auth-page-password"
                          className="block text-[11px] font-bold text-[#0E2640]"
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
                          className="text-[11px] font-bold text-[#0284C7] hover:underline whitespace-nowrap"
                        >
                          {tr('Umesahau nenosiri?', 'Forgot password?')}
                        </button>
                      </div>
                      <div className="relative mt-0.5">
                        <Lock
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#B45309]"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-page-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={tr('Angalau herufi 6', 'At least 6 characters')}
                          className="h-[42px] w-full rounded-xl border border-amber-300/90 bg-[#FFFDF5] pr-10 pl-9 text-[15px] sm:text-sm font-medium text-[#0A1F36] placeholder:text-[12px] placeholder:text-amber-700/50 shadow-2xs focus:border-[#D97706] focus:bg-white focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={
                            showPassword
                              ? tr('Ficha nenosiri', 'Hide password')
                              : tr('Onyesha nenosiri', 'Show password')
                          }
                          className="absolute top-1/2 right-1 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-lg text-[#0E2640] hover:bg-amber-100/75 transition-colors"
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

                  {/* Primary Submit Button */}
                  <div className="flex justify-center pt-1">
                    <button
                      type="submit"
                      disabled={formBusy || googleBusy}
                      className={`flex h-[44px] w-[248px] sm:w-[270px] items-center justify-center rounded-xl px-5 text-xs sm:text-sm font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap ${
                        mode === 'register'
                          ? 'bg-gradient-to-r from-[#0284C7] to-[#0D9488]'
                          : 'bg-gradient-to-r from-[#0E2640] to-[#1D4E89]'
                      }`}
                    >
                      {formBusy
                        ? uploadStageLabel ||
                          (mode === 'forgot'
                            ? tr('Inatuma ujumbe...', 'Sending reset email...')
                            : mode === 'register'
                              ? tr('Inasajili...', 'Creating account...')
                              : tr('Inaingia...', 'Signing in...'))
                        : mode === 'forgot'
                          ? tr('Tuma Ujumbe Kwenye Email', 'Send Reset Link')
                          : mode === 'register'
                            ? tr('Jisajili Sasa', 'Create Account')
                            : tr('Ingia Kwenye Akaunti', 'Sign In')}
                    </button>
                  </div>
                </form>

                {/* Divider */}
                <div className="relative flex items-center">
                  <div className="flex-1 border-t border-sky-200/80" />
                  <span className="px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    {tr('au', 'or')}
                  </span>
                  <div className="flex-1 border-t border-sky-200/80" />
                </div>

                {/* Google Sign-In & Bottom Go Back Button */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    disabled={formBusy || googleBusy}
                    onClick={() => {
                      void handleGoogleSignIn();
                    }}
                    className="flex h-[44px] w-[248px] sm:w-[270px] items-center justify-center gap-2.5 rounded-xl border border-sky-200 bg-white px-4 text-xs sm:text-sm font-bold text-slate-900 shadow-2xs transition-colors hover:bg-sky-50 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
                  >
                    <GoogleGIcon />
                    <span>{googleBusy ? 'Connecting...' : 'Continue with Google'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onBack}
                    aria-label={tr('Rudi Nyuma Kwenye Jukwaa', 'Go Back to Forum')}
                    className="flex h-[42px] w-[248px] sm:w-[270px] items-center justify-center gap-2 rounded-xl border border-slate-300/90 bg-white/75 px-4 text-xs sm:text-sm font-bold text-[#0E2640] transition-colors hover:bg-white active:scale-[0.98] whitespace-nowrap"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{tr('Rudi Nyuma', 'Go Back')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom-most Card Ownership Footer */}
            <div className="relative z-10 shrink-0 border-t border-sky-200/75 bg-white/65 px-3 py-2.5 text-center backdrop-blur-[2px]">
              <p className="text-[10.5px] sm:text-xs font-semibold text-slate-600 leading-snug">
                Jukwaa hili limetengenezwa na{' '}
                <span className="font-extrabold text-[#0E2640]">David Malosha Amos</span>,{' '}
                Mkurugenzi Mkuu wa <span className="font-extrabold text-[#1D4E89]">MBT</span>.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
