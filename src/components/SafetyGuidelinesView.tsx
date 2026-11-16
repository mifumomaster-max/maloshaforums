import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';
import {
  AlertTriangle,
  BellRing,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ADMIN_EMAIL, auth, googleProvider } from '../firebase';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import {
  PhoneNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  isPhoneAlertsEnabled,
  requestPhoneNotificationPermission,
  sendPhoneNotification,
  setPhoneAlertsEnabled,
} from '../services/notificationService';
import {
  Report,
  VERIFICATION_BADGE_META,
  VerificationBadgeType,
  UserProfile,
  computeMemberControlSerial,
  formatMemberCode,
} from '../types';
import { Avatar, OnlineStatusPill } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { MemberIdCard } from './MemberIdCard';
import { MemberIdVerifier } from './MemberIdVerifier';
import { ModerationView } from './ModerationView';
import { VerificationBadge } from './VerificationBadge';

interface SafetyGuidelinesViewProps {
  userUid: string | null;
  userEmail: string | null;
  userEmailVerified?: boolean;
  userCreationTime?: string;
  userLastSignInTime?: string;
  userProviders?: string[];
  userPhone?: string;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isSuspended?: boolean;
  myReports: Report[];
  onSaveProfile: (displayName: string, bio: string, phoneNumber?: string) => Promise<void>;
  onUpdateProfilePhoto?: (photoURL: string) => Promise<void>;
  onSignIn: () => void;
  onUpdateReportStatus: (reportId: string, status: 'reviewed' | 'dismissed') => Promise<void>;
  onOpenTopic: (topicId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

const BADGE_LEGEND_ORDER: VerificationBadgeType[] = [
  'owner',
  'government',
  'organization',
  'individual',
];

export const SafetyGuidelinesView: React.FC<SafetyGuidelinesViewProps> = ({
  userUid,
  userEmail,
  userEmailVerified = false,
  userCreationTime = '',
  userLastSignInTime = '',
  userProviders = [],
  userPhone = '',
  userProfile,
  isAdmin,
  isSuspended = false,
  myReports,
  onSaveProfile,
  onUpdateProfilePhoto,
  onSignIn,
  onUpdateReportStatus,
  onOpenTopic,
  onToast,
}) => {
  const { lang, setLang, tr, formatTime, getReportReasonLabel, getBadgeLabel, getBadgeDescription } =
    useLanguage();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [phone, setPhone] = useState(userPhone);
  const [saving, setSaving] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');
  const [notifPerm, setNotifPerm] = useState<PhoneNotificationPermission>(() =>
    getNotificationPermission()
  );
  const [phoneAlertsOn, setPhoneAlertsOn] = useState<boolean>(() => isPhoneAlertsEnabled());

  // Profile Photo Upload + Crop State
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Password Update / Setup State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);
  const [passwordLinkedNow, setPasswordLinkedNow] = useState(false);

  useEffect(() => {
    setPasswordLinkedNow(false);
  }, [userUid]);

  const hasPasswordProvider = useMemo(
    () => userProviders.includes('password') || passwordLinkedNow,
    [userProviders, passwordLinkedNow]
  );
  const hasGoogleProvider = useMemo(
    () => userProviders.includes('google.com'),
    [userProviders]
  );
  const memberCode = useMemo(
    () => (userUid ? formatMemberCode(userUid) : ''),
    [userUid]
  );
  const controlSerial = useMemo(
    () => (userUid ? computeMemberControlSerial(userUid) : ''),
    [userUid]
  );

  const formatFullDate = (ts?: { toDate: () => Date } | null, isoFallback?: string): string => {
    const d = ts ? ts.toDate() : isoFallback ? new Date(isoFallback) : null;
    if (!d || Number.isNaN(d.getTime())) return tr('Haijarekodiwa', 'Not recorded');
    try {
      return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  const handleTogglePhoneAlerts = async () => {
    if (!isNotificationSupported()) {
      onToast(
        tr(
          'Kivinjari au kifaa hiki hakiauni arifa za simu.',
          'This device or browser does not support notifications.'
        ),
        'error'
      );
      return;
    }

    if (notifPerm === 'granted') {
      const next = !phoneAlertsOn;
      setPhoneAlertsEnabled(next);
      setPhoneAlertsOn(next);
      onToast(
        next
          ? tr('Arifa za simu zimewashwa!', 'Phone notifications enabled!')
          : tr('Arifa za simu zimezimwa.', 'Phone notifications muted.')
      );
      return;
    }

    const res = await requestPhoneNotificationPermission();
    setNotifPerm(res);
    if (res === 'granted') {
      setPhoneAlertsOn(true);
      onToast(
        tr(
          'Arifa za simu zimewashwa! Utapata ujumbe mpya wa taarifa papo hapo.',
          'Phone alerts active! You will receive new updates immediately.'
        )
      );
    } else if (res === 'denied') {
      onToast(
        tr(
          'Ruhusa imezuiwa. Fungua Settings ya App au Browser ili kuwezesha Notifications.',
          'Permission blocked. Open App/Browser Settings to enable Notifications.'
        ),
        'error'
      );
    }
  };

  const handleSendTestAlert = async () => {
    const ok = await sendPhoneNotification({
      title: 'Malosha Forums',
      body: tr(
        'Jaribio la arifa limefanikiwa! Taarifa mpya zitaonekana hapa kwenye simu yako.',
        'Notification test successful! New updates will appear on your phone.'
      ),
      tag: 'malosha-test-alert',
    });
    if (ok) {
      onToast(tr('Arifa ya majaribio imetumwa!', 'Test notification sent!'));
    } else {
      onToast(
        tr('Washa ruhusa ya arifa kwanza kabla ya kujaribu.', 'Enable notification permission first.'),
        'error'
      );
    }
  };

  const isUnverifiedOwner =
    Boolean(userUid) &&
    !isAdmin &&
    (userEmail || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleSendOwnerVerification = async () => {
    if (!auth.currentUser) return;
    setSendingVerify(true);
    try {
      await sendEmailVerification(auth.currentUser);
      onToast(
        tr(
          'Kiungo cha uthibitisho kimetumwa kwenye mifumomaster@gmail.com. Thibitisha kisha fanya refresh au ingia kwa Google.',
          'Verification link sent to mifumomaster@gmail.com. Verify and refresh, or sign in with Google.'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kutuma barua pepe ya uthibitisho.', 'Failed to send verification email.'),
        'error'
      );
    } finally {
      setSendingVerify(false);
    }
  };

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName);
      setBio(userProfile.bio);
    }
  }, [userProfile]);

  useEffect(() => {
    setPhone(userPhone);
  }, [userPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedNotice('');
    try {
      await onSaveProfile(displayName, bio, phone);
      setSavedNotice(
        tr('Wasifu wako umehifadhiwa kikamilifu.', 'Your profile has been saved.')
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuhifadhi wasifu.', 'Failed to save profile.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast(
        tr('Tafadhali chagua faili la picha pekee.', 'Please choose an image file only.'),
        'error'
      );
      return;
    }
    setPendingPhotoFile(file);
  };

  const handleConfirmPhotoCrop = async (resizedFile: File) => {
    setPendingPhotoFile(null);
    if (!onUpdateProfilePhoto) return;
    setUploadingPhoto(true);
    try {
      const uploadedUrl = await uploadImageToCloudinary(resizedFile);
      await onUpdateProfilePhoto(uploadedUrl);
      onToast(
        tr(
          'Picha ya wasifu na kitambulisho chako zimebadilishwa papo hapo!',
          'Your profile and member ID card photo have been updated!'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha mpya.', 'Failed to upload new photo.'),
        'error'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    if (!onUpdateProfilePhoto) return;
    setUploadingPhoto(true);
    try {
      await onUpdateProfilePhoto('');
      onToast(
        tr(
          'Picha imeondolewa kwenye wasifu na kitambulisho chako.',
          'Photo removed from your profile and ID card.'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuondoa picha.', 'Failed to remove photo.'),
        'error'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      setPasswordError(
        tr('Barua pepe ya akaunti haikupatikana.', 'Account email address is unavailable.')
      );
      return;
    }

    if (hasPasswordProvider && currentPassword.length < 1) {
      setPasswordError(
        tr('Tafadhali ingiza nenosiri lako la sasa.', 'Please enter your current password.')
      );
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(
        tr(
          'Nenosiri jipya lazima liwe na angalau herufi 6.',
          'New password must be at least 6 characters long.'
        )
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        tr(
          'Nenosiri jipya na uthibitisho havifanani.',
          'New password and confirmation do not match.'
        )
      );
      return;
    }

    if (hasPasswordProvider && currentPassword === newPassword) {
      setPasswordError(
        tr(
          'Nenosiri jipya haliwezi kufanana na la sasa.',
          'New password cannot be the same as your current password.'
        )
      );
      return;
    }

    setPasswordBusy(true);
    try {
      if (hasPasswordProvider) {
        const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, cred);
        await updatePassword(currentUser, newPassword);
        setPasswordSuccess(
          tr(
            'Nenosiri lako la kuingia limebadilishwa kikamilifu.',
            'Your login password has been updated successfully.'
          )
        );
      } else {
        const cred = EmailAuthProvider.credential(currentUser.email, newPassword);
        try {
          await linkWithCredential(currentUser, cred);
        } catch (linkErr) {
          const linkCode =
            typeof linkErr === 'object' && linkErr !== null && 'code' in linkErr
              ? String((linkErr as { code?: unknown }).code || '')
              : '';
          if (linkCode === 'auth/requires-recent-login') {
            await reauthenticateWithPopup(currentUser, googleProvider);
            await linkWithCredential(currentUser, cred);
          } else {
            throw linkErr;
          }
        }
        setPasswordLinkedNow(true);
        setPasswordSuccess(
          tr(
            'Nenosiri lako limewekwa! Sasa unaweza kuingia pia kwa barua pepe na nenosiri.',
            'Password set! You can now also sign in with your email and password.'
          )
        );
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onToast(
        tr('Nenosiri limehifadhiwa kikamilifu!', 'Password saved successfully!')
      );
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setPasswordError(
          tr(
            'Nenosiri la sasa si sahihi. Hakikisha umeandika kwa usahihi au tumia chaguo la kutuma kiungo kwa Email.',
            'Current password is incorrect. Double-check it or use the email reset link option.'
          )
        );
      } else if (code === 'auth/weak-password') {
        setPasswordError(
          tr(
            'Nenosiri jipya ni dhaifu sana. Tumia mchanganyiko wa herufi na namba angalau 6.',
            'New password is too weak. Use at least 6 characters.'
          )
        );
      } else if (code === 'auth/too-many-requests') {
        setPasswordError(
          tr(
            'Majaribio mengi yameshindikana. Subiri kidogo kisha jaribu tena.',
            'Too many failed attempts. Please wait a moment and try again.'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setPasswordError(
          tr(
            'Kuingia kwa Email/Password hakujawashwa kwenye Firebase Auth.',
            'Email/Password authentication is not enabled in Firebase Auth.'
          )
        );
      } else if (code === 'auth/requires-recent-login') {
        setPasswordError(
          tr(
            'Kwa usalama, toka kisha uingie tena ili kubadilisha nenosiri.',
            'For security, please sign out and sign back in to change your password.'
          )
        );
      } else {
        setPasswordError(
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kubadilisha nenosiri.', 'Failed to update password.')
        );
      }
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSendPasswordResetEmail = async () => {
    const targetEmail = auth.currentUser?.email || userEmail;
    if (!targetEmail) return;
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordBusy(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setPasswordSuccess(
        tr(
          `Kiungo cha kubadilisha nenosiri kimetumwa kwenda ${targetEmail}. Angalia Inbox au Spam.`,
          `Password reset link sent to ${targetEmail}. Check your Inbox or Spam.`
        )
      );
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kutuma barua pepe ya nenosiri.', 'Failed to send password reset email.')
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleCopyUid = async () => {
    if (!userUid) return;
    try {
      await navigator.clipboard.writeText(userUid);
      setCopiedUid(true);
      window.setTimeout(() => setCopiedUid(false), 1800);
    } catch {
      onToast(userUid, 'success');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleSelectPhotoFile}
        className="sr-only"
      />

      <ImageResizeModal
        file={pendingPhotoFile}
        defaultPreset="1:1"
        onCancel={() => setPendingPhotoFile(null)}
        onConfirm={(resizedFile) => void handleConfirmPhotoCrop(resizedFile)}
      />

      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl [text-wrap:balance]">
              {tr('Wasifu wa Akaunti na Usalama', 'Account Profile & Safety')}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              {isAdmin
                ? tr(
                    'Simamia taarifa zako binafsi, picha, nenosiri, kitambulisho, wanachama na usalama wa mfumo.',
                    'Manage your profile, photo, password, ID card, members, and platform safety.'
                  )
                : tr(
                    'Hariri taarifa zako, badilisha picha ya profile na kitambulisho, badilisha nenosiri, na angalia taarifa zote za usajili wako.',
                    'Edit your profile, update your profile & ID photo, change your password, and view all registration details.'
                  )}
            </p>
          </div>

          {userUid && userProfile && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shrink-0">
              <div className="relative shrink-0">
                <Avatar
                  name={userProfile.displayName}
                  photoURL={userProfile.photoURL}
                  size="lg"
                  uid={userUid}
                  showOnlineIndicator
                />
                {!isSuspended && (
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    title={tr('Badilisha Picha', 'Change Photo')}
                    aria-label={tr('Badilisha Picha ya Wasifu', 'Change Profile Photo')}
                    className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#1D4E89] text-white shadow-xs transition-colors hover:bg-[#0E2640] disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-slate-900">
                    {userProfile.displayName}
                  </span>
                  <VerificationBadge badge={userProfile.verificationBadge} size="sm" />
                  <OnlineStatusPill uid={userUid} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {tr('Mada', 'Posts')} {userProfile.topicsCount} · {tr('Majibu', 'Replies')}{' '}
                  {userProfile.repliesCount}
                  {isAdmin && (
                    <span className="font-semibold text-[#1D4E89]">
                      {' '}
                      · {tr('Msimamizi', 'Admin')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile Editor, Language Setting & User's Reports */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            {tr('Wasifu Wako', 'Your Profile')}
          </h2>
          {userUid && userProfile && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isSuspended && !isAdmin && (
                <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 font-bold text-red-800">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Akaunti Imefungwa', 'Account Closed')}</span>
                </span>
              )}
              {userProfile.verificationBadge !== 'none' ? (
                <VerificationBadge
                  badge={userProfile.verificationBadge}
                  size="md"
                  showLabel
                  fullLabel
                />
              ) : (
                <span className="text-slate-500">
                  {tr(
                    'Akaunti ya Kawaida (Haijathibitishwa kwa beji)',
                    'Standard Account (No verification badge)'
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {isSuspended && !isAdmin && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-bold">
                  {tr('Akaunti Yako Imefungwa na Mmiliki wa Jukwaa', 'Your Account Has Been Closed by the Platform Owner')}
                </p>
                <p className="leading-relaxed">
                  {tr(
                    'Huwezi kupost mada, ku-comment, kupenda (like), kuripoti, au kubadilisha taarifa za akaunti kwa sasa.',
                    'You cannot create posts, comment, like, report, or edit account details while your account is closed.'
                  )}
                </p>
                {userProfile?.suspendedReason && (
                  <p className="font-semibold">
                    {tr('Sababu', 'Reason')}: {userProfile.suspendedReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isUnverifiedOwner && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
            <p className="text-sm font-bold">
              {tr('Thibitisha Barua Pepe ya Mmiliki (mifumomaster@gmail.com)', 'Verify Owner Email (mifumomaster@gmail.com)')}
            </p>
            <p className="mt-1 leading-relaxed text-amber-900">
              {tr(
                'Kwa usalama wa mfumo, jopo la mmiliki linafunguka mara tu barua pepe ya mifumomaster@gmail.com ikithibitishwa (au ukiingia kwa Google).',
                'For platform security, owner controls unlock once mifumomaster@gmail.com is verified (or when signing in with Google).'
              )}
            </p>
            <button
              type="button"
              disabled={sendingVerify}
              onClick={() => void handleSendOwnerVerification()}
              className="mt-3 inline-flex min-h-[38px] items-center rounded-lg bg-[#0E2640] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
            >
              {sendingVerify
                ? tr('Inatuma kiungo...', 'Sending link...')
                : tr('Tuma Barua Pepe ya Uthibitisho', 'Send Verification Email')}
            </button>
          </div>
        )}

        {/* Phone Notifications Setting for Mobile App / PWA */}
        {isNotificationSupported() && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <BellRing className="mt-0.5 h-4 w-4 text-[#D97706] shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {tr('Arifa za Simu (App Notifications)', 'Phone Notifications (PWA Alerts)')}
                </p>
                <p className="text-[11px] text-slate-600">
                  {notifPerm === 'granted' && phoneAlertsOn
                    ? tr(
                        'Imewashwa — utapokea ujumbe wa taarifa mpya kwenye simu yako.',
                        'Active — you will receive new post alerts on your device.'
                      )
                    : notifPerm === 'denied'
                      ? tr(
                          'Imezuiwa na kivinjari/simu. Ruhusu Notifications kupitia Settings ya kifaa.',
                          'Blocked by device/browser. Enable Notifications in device Settings.'
                        )
                      : tr(
                          'Washa ili upate taarifa papo hapo simu yako ikiwa imeweka app ya Malosha.',
                          'Enable to get instant alerts when Malosha is installed on your phone.'
                        )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {notifPerm === 'granted' && phoneAlertsOn && (
                <button
                  type="button"
                  onClick={() => void handleSendTestAlert()}
                  className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tr('Jaribu Arifa', 'Test Alert')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleTogglePhoneAlerts()}
                className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  notifPerm === 'granted' && phoneAlertsOn
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-[#0E2640] text-white hover:bg-[#163A5F]'
                }`}
              >
                {notifPerm === 'granted'
                  ? phoneAlertsOn
                    ? tr('Zimewashwa · Zima', 'Enabled · Mute')
                    : tr('Zimezimwa · Washa', 'Muted · Enable')
                  : tr('Washa Arifa za Simu', 'Enable Phone Alerts')}
              </button>
            </div>
          </div>
        )}

        {!userUid ? (
          <div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-600">
              {tr(
                'Ingia kwenye akaunti yako ili kuhariri jina lako la hadhara, kubadilisha lugha, na kuona historia ya ripoti ulizotuma.',
                'Sign in to your account to edit your public name, change language, and view your submitted safety reports.'
              )}
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="min-h-[40px] rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163A5F]"
            >
              {tr('Ingia / Jisajili', 'Sign in / Register')}
            </button>
          </div>
        ) : (
          <>
            {/* Language Preference Control inside Authenticated Account */}
            <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-[#1D4E89] shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {tr('Lugha ya Akaunti Yako', 'Your Account Language')}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {tr(
                      'Chagua lugha unayopendelea kutumia ndani ya Malosha Forums.',
                      'Choose your preferred display language across Malosha Forums.'
                    )}
                  </p>
                </div>
              </div>

              <div
                role="group"
                aria-label={tr('Badilisha lugha', 'Switch language')}
                className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setLang('sw')}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    lang === 'sw'
                      ? 'bg-[#1D4E89] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kiswahili
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    lang === 'en'
                      ? 'bg-[#1D4E89] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Profile & Member ID Photo Uploader */}
            {userProfile && (
              <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3.5">
                  <Avatar
                    name={userProfile.displayName}
                    photoURL={userProfile.photoURL}
                    size="lg"
                    uid={userUid}
                    showOnlineIndicator
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {tr('Picha ya Wasifu na Kitambulisho', 'Profile & ID Card Photo')}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {tr(
                        'Ukibadilisha picha hapa, picha ya akaunti yako na Kitambulisho chako cha Mwanachama hubadilika papo hapo.',
                        'Updating your photo here immediately updates both your account avatar and Member ID Card.'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={uploadingPhoto || isSuspended}
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    )}
                    <span>
                      {uploadingPhoto
                        ? tr('Inapakia Picha...', 'Uploading...')
                        : tr('Badilisha Picha', 'Change Photo')}
                    </span>
                  </button>

                  {userProfile.photoURL && (
                    <button
                      type="button"
                      disabled={uploadingPhoto || isSuspended}
                      onClick={() => void handleRemoveProfilePhoto()}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                      <span>{tr('Ondoa', 'Remove')}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {tr('Jina Linaloonekana Hadharani', 'Public Display Name')}
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  minLength={1}
                  maxLength={80}
                  disabled={saving || isSuspended}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  {tr(
                    'Barua Pepe (Binafsi — Haionekani Hadharani)',
                    'Email Address (Private — Never Shown Publicly)'
                  )}
                </span>
                <p className="mt-1.5 min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600">
                  {userEmail || tr('Imefichwa', 'Hidden')}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="profile-phone" className="block text-xs font-semibold text-slate-700">
                {tr(
                  'Namba ya Simu (Binafsi — Haionekani Hadharani)',
                  'Phone Number (Private — Never Shown Publicly)'
                )}
              </label>
              <input
                id="profile-phone"
                type="tel"
                maxLength={30}
                disabled={saving || isSuspended}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={tr('Mfano: +255 712 345 678', 'e.g. +255 712 345 678')}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 sm:max-w-sm"
              />
            </div>

            <div>
              <label htmlFor="profile-bio" className="block text-xs font-semibold text-slate-700">
                {tr('Utambulisho Mfupi (Hiari)', 'Short Bio (Optional)')}
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={300}
                disabled={saving || isSuspended}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={tr(
                  'Mfano: Mhandisi wa programu anayependa usalama wa mitandao...',
                  'Example: Software engineer passionate about digital communities...'
                )}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            {savedNotice && <p className="text-xs font-medium text-emerald-800">{savedNotice}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || isSuspended}
                className="min-h-[40px] rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                {saving
                  ? tr('Inahifadhi...', 'Saving...')
                  : tr('Hifadhi Wasifu', 'Save Profile')}
              </button>
            </div>
          </form>

          {/* Complete Registration Details Summary */}
          {userProfile && (
            <div className="mt-7 border-t border-slate-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
                    {tr('Taarifa Zote za Usajili Wako', 'Your Complete Registration Details')}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {tr(
                      'Muhtasari wa kumbukumbu zote zilizosajiliwa kwenye akaunti yako ya Malosha Forums.',
                      'Full record of your registered account details on Malosha Forums.'
                    )}
                  </p>
                </div>
                {!userEmailVerified && userEmail && (
                  <button
                    type="button"
                    disabled={sendingVerify}
                    onClick={() => void handleSendOwnerVerification()}
                    className="min-h-[36px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {sendingVerify
                      ? tr('Inatuma...', 'Sending...')
                      : tr('Thibitisha Email Yako', 'Verify Email')}
                  </button>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 text-xs sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Jina Kamili la Usajili', 'Registered Name')}
                  </dt>
                  <dd className="truncate font-semibold text-slate-900">
                    {userProfile.displayName}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Barua Pepe (Email)', 'Email Address')}
                  </dt>
                  <dd className="truncate font-semibold text-slate-900">
                    {userEmail || tr('Haijawekwa', 'Not set')}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Uthibitisho wa Email', 'Email Verification')}
                  </dt>
                  <dd
                    className={`font-semibold ${
                      userEmailVerified ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {userEmailVerified
                      ? tr('Imethibitishwa', 'Verified')
                      : tr('Haijathibitishwa', 'Not verified')}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Namba ya Simu', 'Phone Number')}
                  </dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {userPhone || tr('Haijawekwa', 'Not set')}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Namba ya Kitambulisho', 'Member ID No.')}
                  </dt>
                  <dd className="font-mono font-bold text-[#0E2640] tabular-nums">
                    {memberCode}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Namba ya Usalama (Serial)', 'Security Serial')}
                  </dt>
                  <dd className="font-mono font-bold text-[#0E2640] tabular-nums">
                    {controlSerial}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Njia ya Kuingia', 'Sign-In Method')}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {[
                      hasGoogleProvider ? 'Google' : null,
                      hasPasswordProvider ? tr('Barua Pepe & Nenosiri', 'Email & Password') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || tr('Akaunti ya Malosha', 'Malosha Account')}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Wadhifa & Beji', 'Role & Badge')}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {isAdmin
                      ? tr('Mmiliki wa Mfumo', 'Platform Owner')
                      : userProfile.role === 'moderator'
                        ? tr('Msimamizi', 'Moderator')
                        : tr('Mwanachama', 'Member')}{' '}
                    · {getBadgeLabel(userProfile.verificationBadge)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Tarehe ya Kusajiliwa', 'Registered On')}
                  </dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {formatFullDate(userProfile.createdAt, userCreationTime)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Mara ya Mwisho Kuingia', 'Last Sign-In')}
                  </dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {formatFullDate(null, userLastSignInTime)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Hali ya Akaunti', 'Account Status')}
                  </dt>
                  <dd
                    className={`font-semibold ${
                      isSuspended && !isAdmin ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {isSuspended && !isAdmin
                      ? tr('Imefungwa', 'Closed')
                      : tr('Hai / Active', 'Active')}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
                  <dt className="font-medium text-slate-500">
                    {tr('Namba ya Akaunti (UID)', 'Account UID')}
                  </dt>
                  <dd className="flex items-center gap-1.5 min-w-0">
                    <span className="max-w-[140px] truncate font-mono text-[11px] font-semibold text-slate-700">
                      {userUid}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyUid()}
                      className="inline-flex min-h-[28px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {copiedUid ? (
                        <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-500" aria-hidden="true" />
                      )}
                      <span>{copiedUid ? tr('Imenakiliwa', 'Copied') : tr('Nakili', 'Copy')}</span>
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Change or Set Login Password */}
          <div className="mt-7 border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4E89]" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
                    {hasPasswordProvider
                      ? tr('Badilisha Nenosiri la Kuingia', 'Change Login Password')
                      : tr('Weka Nenosiri la Kuingia (Email & Password)', 'Set Login Password')}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    {hasPasswordProvider
                      ? tr(
                          'Imarisha usalama wa akaunti yako kwa kuweka nenosiri jipya lenye angalau herufi 6.',
                          'Update your login password anytime using at least 6 characters.'
                        )
                      : tr(
                          'Akaunti yako iliingia kupitia Google. Weka nenosiri hapa ili uweze kuingia pia kwa Barua Pepe na Nenosiri.',
                          'You signed in with Google. Set a password here so you can also sign in using Email & Password.'
                        )}
                  </p>
                </div>
              </div>

              {hasPasswordProvider && userEmail && (
                <button
                  type="button"
                  disabled={passwordBusy}
                  onClick={() => void handleSendPasswordResetEmail()}
                  className="text-xs font-semibold text-[#1D4E89] hover:underline disabled:opacity-60"
                >
                  {tr('Umesahau nenosiri la sasa? Tuma kwa Email', 'Forgot current password? Send reset email')}
                </button>
              )}
            </div>

            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {hasPasswordProvider && (
                  <div>
                    <label
                      htmlFor="profile-current-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      {tr('Nenosiri la Sasa', 'Current Password')}
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="profile-current-password"
                        type={showCurrentPw ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        disabled={passwordBusy}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={tr('Weka nenosiri la sasa', 'Enter current password')}
                        className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw((p) => !p)}
                        aria-label={
                          showCurrentPw
                            ? tr('Ficha nenosiri', 'Hide password')
                            : tr('Onyesha nenosiri', 'Show password')
                        }
                        className="absolute top-1/2 right-1 flex min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-800"
                      >
                        {showCurrentPw ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="profile-new-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Nenosiri Jipya', 'New Password')}
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="profile-new-password"
                      type={showNewPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      disabled={passwordBusy}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={tr('Angalau herufi 6', 'At least 6 characters')}
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((p) => !p)}
                      aria-label={
                        showNewPw
                          ? tr('Ficha nenosiri', 'Hide password')
                          : tr('Onyesha nenosiri', 'Show password')
                      }
                      className="absolute top-1/2 right-1 flex min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-800"
                    >
                      {showNewPw ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="profile-confirm-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Thibitisha Nenosiri Jipya', 'Confirm New Password')}
                  </label>
                  <input
                    id="profile-confirm-password"
                    type={showNewPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={passwordBusy}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={tr('Rudia nenosiri jipya', 'Repeat new password')}
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                  />
                </div>
              </div>

              {passwordError && (
                <p className="text-xs font-medium text-red-700">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-xs font-medium text-emerald-800">{passwordSuccess}</p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordBusy}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0E2640] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60 sm:text-sm"
                >
                  {passwordBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Lock className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  )}
                  <span>
                    {passwordBusy
                      ? tr('Inasasisha Nenosiri...', 'Updating Password...')
                      : hasPasswordProvider
                        ? tr('Badilisha Nenosiri', 'Update Password')
                        : tr('Weka Nenosiri', 'Set Password')}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {userProfile && (
            <MemberIdCard
              profile={userProfile}
              isAdmin={isAdmin}
              onToast={onToast}
            />
          )}
          </>
        )}

        {userUid && !isAdmin && myReports.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900 tabular-nums">
              {tr('Ripoti Zako za Usalama', 'Your Safety Reports')} ({myReports.length})
            </h3>
            <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {myReports.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {getReportReasonLabel(rep.reason)}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {rep.targetType === 'topic'
                        ? tr('Mada', 'Post')
                        : tr('Jibu', 'Comment')}{' '}
                      · {formatTime(rep.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`font-medium ${
                      rep.status === 'reviewed'
                        ? 'text-emerald-800'
                        : rep.status === 'dismissed'
                          ? 'text-slate-500'
                          : 'text-amber-800'
                    }`}
                  >
                    {rep.status === 'reviewed'
                      ? tr('Imekaguliwa', 'Reviewed')
                      : rep.status === 'dismissed'
                        ? tr('Imepuuzwa', 'Dismissed')
                        : tr('Inasubiri Ukaguzi', 'Pending Review')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Owner Anti-Fake ID Checker & Controls Embedded Directly inside Profile */}
      {userUid && isAdmin && (
        <>
          <MemberIdVerifier />
          <ModerationView
            embedded
            reports={myReports}
            currentUserUid={userUid}
            onUpdateStatus={onUpdateReportStatus}
            onOpenTopic={onOpenTopic}
            onToast={onToast}
          />
        </>
      )}

      {/* Verification Badge Tiers Legend */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-slate-900">
          {tr('Alama (Beji) za Uthibitisho wa Akaunti', 'Account Verification Badges')}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {tr(
            'Ili kuongeza uaminifu kwenye mijadala, matangazo ya ajira, na taarifa rasmi, Malosha Forums linatumia rangi nne tofauti za alama za uthibitisho:',
            'To build trust across discussions, job listings, and official announcements, Malosha Forums uses four distinct verification badge colors:'
          )}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BADGE_LEGEND_ORDER.map((tier) => {
            const meta = VERIFICATION_BADGE_META[tier];
            return (
              <div
                key={tier}
                className={`flex items-start gap-3 rounded-lg border p-3.5 ${meta.borderClass} ${meta.softBgClass}`}
              >
                <div className="pt-0.5 shrink-0">
                  <VerificationBadge badge={tier} size="md" />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${meta.textClass}`}>
                    {getBadgeLabel(tier)}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-700">
                    {getBadgeDescription(tier)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Three Safety Pillars */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <UserCheck className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            {tr('1. Akaunti Zilizothibitishwa', '1. Verified Accounts')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {tr(
              'Kila chapisho na jibu huthibitishwa na akaunti halali (Google au Barua Pepe) ili kuzuia akaunti bandia na ujumbe wa taka.',
              'Every post and reply is backed by valid account authentication (Google or Email) to deter fake accounts and spam.'
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Lock className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            {tr('2. Faragha ya Taarifa Binafsi', '2. Personal Privacy')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {tr(
              'Barua pepe na namba yako ya simu huhifadhiwa kwenye mkusanyiko maalum wa siri unaoweza kusomwa na wewe pekee.',
              'Your email address and phone number are stored in a private collection accessible only to you.'
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <ShieldCheck className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            {tr('3. Udhibiti na Uwajibikaji', '3. Moderation & Accountability')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {tr(
              'Mada zinaweza kufungwa na waanzishaji wake, na ripoti za maudhui yasiyofaa hukaguliwa haraka na wasimamizi.',
              'Authors can lock discussions, and flagged content reports are promptly reviewed by platform admins.'
            )}
          </p>
        </div>
      </div>

      {/* Community Rules List */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-slate-900">
          {tr('Maadili ya Kushiriki Mijadala', 'Community Guidelines')}
        </h2>
        <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-slate-700">
          <li>
            {tr(
              'Jadili hoja kwa staha; epuka matusi, kejeli, au mashambulizi binafsi.',
              'Discuss topics respectfully; avoid insults, harassment, or personal attacks.'
            )}
          </li>
          <li>
            {tr(
              'Usichapishe taarifa za siri za watu wengine (namba za simu, anwani, au nyaraka).',
              'Never share private personal data of others (phone numbers, addresses, or documents).'
            )}
          </li>
          <li>
            {tr(
              'Hakikisha kichwa cha mada kinaeleza wazi jambo unalolileta mezani.',
              'Ensure your post title clearly describes the subject or opportunity you are sharing.'
            )}
          </li>
          <li>
            {tr(
              'Tumia kitufe cha “Kubali Jibu” kusaidia wengine kupata suluhisho haraka.',
              'Use the "Accept Answer" button to help readers find verified solutions quickly.'
            )}
          </li>
          <li>
            {tr(
              'Ukiona maudhui yenye hatari au matangazo ya taka, tumia kitufe cha “Ripoti”.',
              'If you spot harmful content or spam, use the "Report" button.'
            )}
          </li>
        </ul>
      </section>
    </div>
  );
};

