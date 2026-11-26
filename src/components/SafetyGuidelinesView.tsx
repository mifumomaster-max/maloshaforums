import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';
import {
  AlertTriangle,
  Award,
  Banknote,
  BellRing,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Heart,
  Images,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Lock,
  MessageCircle,
  PenTool,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Video as VideoIcon,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ADMIN_EMAIL, auth, reauthenticateWithGooglePopup } from '../firebase';
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
  COMMUNITY_SAFETY_RULES,
  ContentRetentionPeriod,
  ContentRetentionSettings,
  MONETIZATION_PAYOUT_RATES,
  MONETIZATION_REQUIREMENTS,
  PrimaryBoard,
  Report,
  Topic,
  TopicCategory,
  UserNotification,
  VERIFICATION_BADGE_META,
  VerificationBadgeType,
  VideoPost,
  UserProfile,
  computeAuthorMetrics,
  computeMemberControlSerial,
  findCommunityRule,
  formatMemberCode,
} from '../types';
import { Avatar, OnlineStatusPill } from './Avatar';
import { BreakingNewsPosterStudio } from './BreakingNewsPosterStudio';
import { EditorialCartoonStudio } from './EditorialCartoonStudio';
import { ImageResizeModal } from './ImageResizeModal';
import { MemberIdCard } from './MemberIdCard';
import { MemberIdVerifier } from './MemberIdVerifier';
import { ModerationView } from './ModerationView';
import { OwnerEditableIdCard } from './OwnerEditableIdCard';
import { OwnerPrivatePhotoVault } from './OwnerPrivatePhotoVault';
import { TrainingCertificateStudio } from './TrainingCertificateStudio';
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
  topics?: Topic[];
  videos?: VideoPost[];
  friendsCount?: number;
  userNotifications?: UserNotification[];
  onSaveProfile: (displayName: string, bio: string, phoneNumber?: string) => Promise<void>;
  onUpdateProfilePhoto?: (photoURL: string) => Promise<void>;
  onPublishPosterTopic?: (data: {
    title: string;
    body: string;
    category: TopicCategory;
    tags: string[];
    coverImage: string;
  }) => Promise<string>;
  onSelectBoard?: (board: PrimaryBoard) => void;
  onSignIn: () => void;
  onUpdateReportStatus: (reportId: string, status: 'reviewed' | 'dismissed') => Promise<void>;
  onOpenTopic: (topicId: string) => void;
  onOpenVideo?: (videoId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  hideVideoTabForUsers?: boolean;
  onToggleHideVideoTab?: () => void | Promise<void>;
  hideMpollTabForUsers?: boolean;
  onToggleHideMpollTab?: () => void | Promise<void>;
  retentionSettings?: ContentRetentionSettings;
  retentionProgress?: {
    runningKijiweni: boolean;
    runningVideo: boolean;
    kijiweniDeleted: number;
    kijiweniTotal: number;
    videoDeleted: number;
    videoTotal: number;
    currentLabel: string;
  };
  onUpdateRetentionSettings?: (patch: {
    kijiweniEnabled?: boolean;
    kijiweniPeriod?: ContentRetentionPeriod;
    videoEnabled?: boolean;
    videoPeriod?: ContentRetentionPeriod;
  }) => Promise<void>;
  onRunRetentionNow?: (target: 'kijiweni' | 'video' | 'both') => void;
  openAdminMembersSignal?: number;
  signupLastSeenMs?: number;
}

const BADGE_LEGEND_ORDER: VerificationBadgeType[] = [
  'owner',
  'black',
  'white',
  'gray',
  'gold',
  'silver',
  'copper',
  'government',
  'organization',
  'journalist',
  'educator',
  'creator',
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
  topics = [],
  videos = [],
  friendsCount = 0,
  userNotifications = [],
  onSaveProfile,
  onUpdateProfilePhoto,
  onPublishPosterTopic,
  onSelectBoard,
  onSignIn,
  onUpdateReportStatus,
  onOpenTopic,
  onOpenVideo,
  onToast,
  hideVideoTabForUsers = false,
  onToggleHideVideoTab,
  hideMpollTabForUsers = false,
  onToggleHideMpollTab,
  retentionSettings,
  retentionProgress,
  onUpdateRetentionSettings,
  onRunRetentionNow,
  openAdminMembersSignal = 0,
  signupLastSeenMs = 0,
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
  const [profileTab, setProfileTab] = useState<'profile' | 'poster' | 'cartoon'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('malosha_owner_profile_tab');
      if (saved === 'poster' || saved === 'cartoon' || saved === 'profile') {
        return saved;
      }
    }
    return 'profile';
  });
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    profile_edit: true,
  });
  const [openPayoutsSignal, setOpenPayoutsSignal] = useState(0);

  const selectProfileTab = (next: 'profile' | 'poster' | 'cartoon') => {
    setProfileTab(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('malosha_owner_profile_tab', next);
    }
  };

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    setPasswordLinkedNow(false);
  }, [userUid]);

  useEffect(() => {
    if (!isAdmin || !onPublishPosterTopic) {
      setProfileTab('profile');
    } else if (typeof window !== 'undefined' && openAdminMembersSignal === 0) {
      const saved = window.localStorage.getItem('malosha_owner_profile_tab');
      if (saved === 'poster' || saved === 'cartoon' || saved === 'profile') {
        setProfileTab(saved);
      }
    }
  }, [isAdmin, onPublishPosterTopic, openAdminMembersSignal]);

  useEffect(() => {
    if (openAdminMembersSignal > 0 && isAdmin) {
      setProfileTab('profile');
      setOpenAccordions((prev) => ({
        ...prev,
        admin_moderation: true,
      }));
    }
  }, [openAdminMembersSignal, isAdmin]);

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
      const msg = tr(
        'Wasifu wako umehifadhiwa na kubadilishwa kwenye akaunti yako yote.',
        'Your profile has been saved and updated across your entire account.'
      );
      setSavedNotice(msg);
      onToast(msg);
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
            await reauthenticateWithGooglePopup(currentUser);
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

        {/* Dedicated Horizontal 3-Tab Bar (Icon-only on mobile, icon + label on larger screens) */}
        {userUid && isAdmin && onPublishPosterTopic && (
          <div
            role="tablist"
            aria-label={tr('Sehemu za Wasifu wa Mmiliki', 'Owner Profile Sections')}
            className="mt-5 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-100/90 p-1.5 sm:gap-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={profileTab === 'profile'}
              aria-label={tr('Wasifu & Akaunti', 'Profile & Account')}
              title={tr('Wasifu & Akaunti', 'Profile & Account')}
              onClick={() => selectProfileTab('profile')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-bold transition-all sm:px-3 sm:text-sm ${
                profileTab === 'profile'
                  ? 'bg-[#0E2640] text-white shadow-sm'
                  : 'text-slate-700 hover:bg-white/75 hover:text-slate-900'
              }`}
            >
              <UserCheck className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="hidden truncate sm:inline">{tr('Wasifu & Akaunti', 'Profile & Account')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={profileTab === 'poster'}
              aria-label={tr('Studio ya Poster', 'Poster Studio')}
              title={tr('Studio ya Poster', 'Poster Studio')}
              onClick={() => selectProfileTab('poster')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-bold transition-all sm:px-3 sm:text-sm ${
                profileTab === 'poster'
                  ? 'bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white shadow-sm'
                  : 'text-slate-700 hover:bg-white/75 hover:text-slate-900'
              }`}
            >
              <LayoutTemplate className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="hidden truncate sm:inline">{tr('Studio ya Poster', 'Poster Studio')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={profileTab === 'cartoon'}
              aria-label={tr('Studio ya Katuni', 'Cartoon Studio')}
              title={tr('Studio ya Katuni', 'Cartoon Studio')}
              onClick={() => selectProfileTab('cartoon')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-bold transition-all sm:px-3 sm:text-sm ${
                profileTab === 'cartoon'
                  ? 'bg-gradient-to-r from-[#B45309] to-[#D97706] text-white shadow-sm'
                  : 'text-slate-700 hover:bg-white/75 hover:text-slate-900'
              }`}
            >
              <PenTool className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="hidden truncate sm:inline">{tr('Studio ya Katuni', 'Cartoon Studio')}</span>
            </button>
          </div>
        )}
      </div>

      {userUid && isAdmin && onPublishPosterTopic && profileTab === 'poster' ? (
        <BreakingNewsPosterStudio
          onPublishToPlatform={onPublishPosterTopic}
          onOpenPublishedTopic={onOpenTopic}
          onNavigateBoard={(board) => {
            if (onSelectBoard) onSelectBoard(board);
          }}
          onToast={onToast}
        />
      ) : userUid && isAdmin && onPublishPosterTopic && profileTab === 'cartoon' ? (
        <EditorialCartoonStudio
          onPublishToPlatform={onPublishPosterTopic}
          onOpenPublishedTopic={onOpenTopic}
          onNavigateBoard={(board) => {
            if (onSelectBoard) onSelectBoard(board);
          }}
          onToast={onToast}
          defaultSignature={userProfile?.displayName || 'Mifumo Master'}
        />
      ) : (
        <div className="space-y-3">
          {/* Urgent Account Banners (Always Visible When Applicable) */}
          {isSuspended && !isAdmin && (() => {
            const suspendedRule = userProfile?.suspendedRuleNumber
              ? findCommunityRule(userProfile.suspendedRuleNumber)
              : null;
            return (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold">
                      {tr('Akaunti Yako Imefungwa na Mmiliki wa Jukwaa', 'Your Account Has Been Closed by the Platform Owner')}
                    </p>
                    <p className="leading-relaxed">
                      {tr(
                        'Huwezi kupost mada, ku-comment, kupenda (like), kuripoti, au kubadilisha taarifa za akaunti kwa sasa.',
                        'You cannot create posts, comment, like, report, or edit account details while your account is closed.'
                      )}
                    </p>
                    {suspendedRule && (
                      <div className="rounded-lg border border-red-200 bg-white/80 px-3 py-2 text-red-900">
                        <p className="font-bold">
                          {tr(`Sheria Iliyokiukwa — Kanuni #${suspendedRule.number}`, `Violated Rule — #${suspendedRule.number}`)}:{' '}
                          {tr(suspendedRule.titleSw, suspendedRule.titleEn)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-red-800">
                          {tr(suspendedRule.summarySw, suspendedRule.summaryEn)}
                        </p>
                      </div>
                    )}
                    {userProfile?.suspendedReason && (
                      <p className="font-semibold">
                        {tr('Sababu', 'Reason')}: {userProfile.suspendedReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Video & Account Rule-Violation Moderation Notices */}
          {userUid && (() => {
            const moderationAlerts = userNotifications.filter(
              (n) =>
                n.type === 'account_moderation' ||
                n.type === 'video_moderation' ||
                n.type === 'post_moderation'
            );
            const blockedOwnVideos = videos.filter(
              (v) => v.authorId === userUid && v.isArchived && (v.moderationRuleNumber || v.moderationReason)
            );
            if (moderationAlerts.length === 0 && blockedOwnVideos.length === 0) return null;

            return (
              <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-bold text-amber-950">
                      {tr(
                        'Taarifa za Usalama & Ukiukaji wa Sheria za Jukwaa',
                        'Account & Video Moderation Notices'
                      )}
                    </p>
                    {blockedOwnVideos.map((vid) => {
                      const r = vid.moderationRuleNumber
                        ? findCommunityRule(vid.moderationRuleNumber)
                        : null;
                      return (
                        <div
                          key={`blocked-vid-${vid.id}`}
                          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-800"
                        >
                          <p className="font-bold text-rose-800">
                            {tr('Video Yako Imefungiwa:', 'Your Video Was Blocked:')}{' '}
                            <span className="text-slate-900">
                              {vid.caption?.slice(0, 60) || vid.soundName || vid.id}
                            </span>
                          </p>
                          {r && (
                            <p className="mt-0.5 font-semibold text-rose-700">
                              {tr(`Kanuni #${r.number}`, `Rule #${r.number}`)}:{' '}
                              {tr(r.titleSw, r.titleEn)}
                            </p>
                          )}
                          {vid.moderationReason && (
                            <p className="mt-0.5 text-[11px] text-slate-600">{vid.moderationReason}</p>
                          )}
                        </div>
                      );
                    })}
                    {moderationAlerts.slice(0, 5).map((alert) => {
                      const r = alert.ruleNumber ? findCommunityRule(alert.ruleNumber) : null;
                      return (
                        <div
                          key={alert.id}
                          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-800"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className="font-bold text-slate-900">{alert.topicTitle}</p>
                            {alert.createdAt && (
                              <span className="text-[10px] text-slate-400">
                                {formatTime(alert.createdAt)}
                              </span>
                            )}
                          </div>
                          {r && (
                            <p className="mt-0.5 text-[11px] font-bold text-rose-700">
                              {tr(`Kanuni #${r.number}`, `Rule #${r.number}`)}:{' '}
                              {tr(r.titleSw, r.titleEn)}
                            </p>
                          )}
                          {alert.replyPreview && (
                            <p className="mt-0.5 text-[11px] text-slate-600">{alert.replyPreview}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {isUnverifiedOwner && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
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
                className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-[#0E2640] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                {sendingVerify
                  ? tr('Inatuma kiungo...', 'Sending link...')
                  : tr('Tuma Barua Pepe ya Uthibitisho', 'Send Verification Email')}
              </button>
            </div>
          )}

          {!userUid && (
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-600">
                {tr(
                  'Ingia kwenye akaunti yako ili kuhariri jina lako la hadhara, kupata kitambulisho, kubadilisha lugha, na kuona historia ya ripoti ulizotuma.',
                  'Sign in to your account to edit your public name, access your ID card, change language, and view your submitted safety reports.'
                )}
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="min-h-[44px] shrink-0 rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163A5F]"
              >
                {tr('Ingia / Jisajili', 'Sign in / Register')}
              </button>
            </div>
          )}

          {/* Accordion 1: Official Tanzania Member ID Card */}
          {userUid && userProfile && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.id_card)}
                onClick={() => toggleAccordion('id_card')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <CreditCard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Kitambulisho Rasmi cha Mwanachama (Tanzania)', 'Official Tanzania Member ID Card')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Kitambulisho chenye Mlima Kilimanjaro, Twiga, pakua au shiriki PNG',
                        'Tanzania ID card with Kilimanjaro & Twiga watermark, download or share PNG'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.id_card ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.id_card && (
                <div className="border-t border-slate-100 px-3.5 pb-5 pt-2 sm:px-5">
                  <MemberIdCard
                    profile={userProfile}
                    isAdmin={isAdmin}
                    onToast={onToast}
                  />
                </div>
              )}
            </section>
          )}

          {/* Accordion 1B (Owner Only): Second Editable Specimen ID Card */}
          {userUid && isAdmin && userProfile && (
            <section className="overflow-hidden rounded-xl border border-sky-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.owner_custom_id)}
                onClick={() => toggleAccordion('owner_custom_id')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sky-50/40 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#1245A8] ring-1 ring-sky-200">
                    <CreditCard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr(
                        'Kitambulisho cha Pili (Mmiliki — Kinachohaririwa)',
                        'Second Editable ID Card (Owner Only)'
                      )}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Hariri picha, majina, namba, saini, na vichwa vyote kisha pakua PNG',
                        'Edit all fields, portrait, hologram, signature & headers, then export PNG'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.owner_custom_id ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.owner_custom_id && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <OwnerEditableIdCard
                    ownerUid={userUid}
                    ownerPhotoUrl={userProfile.photoURL}
                    ownerDisplayName={userProfile.displayName}
                    onToast={onToast}
                  />
                </div>
              )}
            </section>
          )}

          {/* Accordion 2: Profile Photo & Details Editor */}
          {userUid && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.profile_edit)}
                onClick={() => toggleAccordion('profile_edit')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#1D4E89] ring-1 ring-sky-200">
                    <UserCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Taarifa za Wasifu & Picha', 'Profile Details & Photo')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Badilisha picha ya akaunti/kitambulisho, jina, simu na utambulisho mfupi',
                        'Update profile & ID photo, display name, phone number, and bio'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.profile_edit ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.profile_edit && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  {userProfile && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
                      {userProfile.verificationBadge !== 'none' ? (
                        <VerificationBadge
                          badge={userProfile.verificationBadge}
                          size="md"
                          showLabel
                          fullLabel
                        />
                      ) : (
                        <span className="text-xs text-slate-500">
                          {tr(
                            'Akaunti ya Kawaida (Haijathibitishwa kwa beji)',
                            'Standard Account (No verification badge)'
                          )}
                        </span>
                      )}
                      {isSuspended && !isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          <span>{tr('Akaunti Imefungwa', 'Account Closed')}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {userProfile && (
                    <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 sm:flex-row sm:items-center">
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

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={uploadingPhoto || isSuspended}
                          onClick={() => photoInputRef.current?.click()}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
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
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
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
                          className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <span className="block text-xs font-semibold text-slate-700">
                          {tr(
                            'Barua Pepe (Binafsi — Haionekani Hadharani)',
                            'Email Address (Private — Never Shown Publicly)'
                          )}
                        </span>
                        <p className="mt-1.5 flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600">
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
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 sm:max-w-sm"
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
                        className="min-h-[44px] rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
                      >
                        {saving
                          ? tr('Inahifadhi...', 'Saving...')
                          : tr('Hifadhi Wasifu', 'Save Profile')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          )}

          {/* Accordion 3: Creator Metrics, Hard Monetization Rules & Monthly Payouts */}
          {userUid && userProfile && (() => {
            const ownMetrics = computeAuthorMetrics(
              topics,
              userUid,
              userProfile.followersCount || 0,
              videos,
              friendsCount,
              {
                repliesGivenCount: userProfile.repliesCount || 0,
                accountCreatedAt: userProfile.createdAt,
                verificationBadge: userProfile.verificationBadge,
                accountStatus: userProfile.accountStatus,
                emailVerified: userEmailVerified,
                hasProfilePhoto: Boolean(userProfile.photoURL),
                bioLength: (userProfile.bio || '').trim().length,
              }
            );
            const criteria = [
              {
                label: tr('Wafuasi (Followers)', 'Followers'),
                currentText: ownMetrics.followersCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minFollowers.toLocaleString(),
                met: ownMetrics.followersCount >= MONETIZATION_REQUIREMENTS.minFollowers,
              },
              {
                label: tr('Marafiki (Friends / DM)', 'Friends / Direct Contacts'),
                currentText: ownMetrics.friendsCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minFriends.toLocaleString(),
                met: ownMetrics.friendsCount >= MONETIZATION_REQUIREMENTS.minFriends,
              },
              {
                label: tr('Machapisho Yote (Posts)', 'Total Posts'),
                currentText: ownMetrics.postsCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minPosts.toLocaleString(),
                met: ownMetrics.postsCount >= MONETIZATION_REQUIREMENTS.minPosts,
              },
              {
                label: tr('Makala za Kina (Articles)', 'In-Depth Articles (Makala)'),
                currentText: ownMetrics.articlesCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minArticles.toLocaleString(),
                met: ownMetrics.articlesCount >= MONETIZATION_REQUIREMENTS.minArticles,
              },
              {
                label: tr('Video Zilizopakiwa', 'Videos Posted'),
                currentText: ownMetrics.videosCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minVideos.toLocaleString(),
                met: ownMetrics.videosCount >= MONETIZATION_REQUIREMENTS.minVideos,
              },
              {
                label: tr('Likes Ulizopokea', 'Likes Received'),
                currentText: ownMetrics.totalLikesReceived.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minLikes.toLocaleString(),
                met: ownMetrics.totalLikesReceived >= MONETIZATION_REQUIREMENTS.minLikes,
              },
              {
                label: tr('Maoni Uliyopokea', 'Comments Received'),
                currentText: ownMetrics.totalCommentsReceived.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minComments.toLocaleString(),
                met: ownMetrics.totalCommentsReceived >= MONETIZATION_REQUIREMENTS.minComments,
              },
              {
                label: tr('Shares / Kushirikiwa', 'Shares Received'),
                currentText: ownMetrics.totalSharesReceived.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minShares.toLocaleString(),
                met: ownMetrics.totalSharesReceived >= MONETIZATION_REQUIREMENTS.minShares,
              },
              {
                label: tr('Majibu Uliyoandika (Replies)', 'Replies Written'),
                currentText: ownMetrics.repliesGivenCount.toLocaleString(),
                targetText: MONETIZATION_REQUIREMENTS.minRepliesGiven.toLocaleString(),
                met: ownMetrics.repliesGivenCount >= MONETIZATION_REQUIREMENTS.minRepliesGiven,
              },
              {
                label: tr('Umri wa Akaunti (Siku)', 'Account Age (Days)'),
                currentText: `${ownMetrics.accountAgeDays.toLocaleString()} ${tr('siku', 'd')}`,
                targetText: `${MONETIZATION_REQUIREMENTS.minAccountDays.toLocaleString()} ${tr('siku', 'd')}`,
                met: ownMetrics.accountAgeDays >= MONETIZATION_REQUIREMENTS.minAccountDays,
              },
              {
                label: tr('Beji Rasmi ya Uthibitisho', 'Official Verification Badge'),
                currentText: ownMetrics.hasVerificationBadge
                  ? getBadgeLabel(userProfile.verificationBadge, true)
                  : tr('Hana', 'None'),
                targetText: tr('Inahitajika', 'Required'),
                met: ownMetrics.hasVerificationBadge,
              },
              {
                label: tr('Email Verified, Picha, Bio & Rekodi Safi', 'Verified Email, Profile & Clean Standing'),
                currentText: ownMetrics.hasCleanVerifiedAccount
                  ? tr('Kamili', 'Verified')
                  : tr('Haijakamilika', 'Incomplete'),
                targetText: tr('Kamili (100%)', '100% Clean'),
                met: ownMetrics.hasCleanVerifiedAccount,
              },
            ];

            const canSeeMonthlyPayout = isAdmin || ownMetrics.isEligibleForMonetization;

            return (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  aria-expanded={Boolean(openAccordions.stats_monetization)}
                  onClick={() => toggleAccordion('stats_monetization')}
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      <Award className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                        {tr('Masharti Magumu ya Kulipwa & Kiasi cha Pesa', 'Creator Payout Criteria & Monthly Earnings')}
                      </h2>
                      <p className="truncate text-xs text-slate-500 tabular-nums">
                        {ownMetrics.isEligibleForMonetization
                          ? tr(
                              `Umefuzu vigezo vyote ${ownMetrics.totalCriteriaCount}/${ownMetrics.totalCriteriaCount} · Malipo ya Mwezi: TZS ${ownMetrics.monthlyTotalPayoutTzs.toLocaleString()}`,
                              `All ${ownMetrics.totalCriteriaCount}/${ownMetrics.totalCriteriaCount} met · Monthly Payout: TZS ${ownMetrics.monthlyTotalPayoutTzs.toLocaleString()}`
                            )
                          : isAdmin
                            ? tr(
                                `Vigezo ${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} (${ownMetrics.progressPercent}%) · Muonekano wa Mmiliki: Makadirio TZS ${ownMetrics.projectedMonthlyWithBaseTzs.toLocaleString()}/mwezi`,
                                `Criteria ${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} (${ownMetrics.progressPercent}%) · Owner View: Est. TZS ${ownMetrics.projectedMonthlyWithBaseTzs.toLocaleString()}/mo`
                              )
                            : tr(
                                `Vigezo ${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} (${ownMetrics.progressPercent}%) · Malipo ya mwezi yamefungwa mpaka ukamilishe vyote 12`,
                                `${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} criteria (${ownMetrics.progressPercent}%) · Monthly payouts locked until all 12 met`
                              )}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                      openAccordions.stats_monetization ? 'rotate-180 text-[#0E2640]' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {openAccordions.stats_monetization && (
                  <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                    {/* Header Progress & Status */}
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-sky-50/40 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold tracking-wide text-slate-900 uppercase">
                            {tr(
                              'Masharti 12 Magumu ya Kuanza Kulipwa',
                              '12 Strict Creator Payout Requirements'
                            )}
                          </span>
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {tr(
                              'Lazima ukamilishe vigezo vyote 12 kwa asilimia 100% ili mfumo uanze kuhesabu na kuonyesha malipo yako ya mwezi.',
                              'All 12 strict thresholds must reach 100% before monthly payouts unlock and become visible.'
                            )}
                          </p>
                        </div>
                        <span
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                            ownMetrics.isEligibleForMonetization
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {ownMetrics.isEligibleForMonetization
                            ? tr('Amekidhi Vigezo Vyote 12/12!', 'Eligible 12/12 Complete!')
                            : `${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} · ${ownMetrics.progressPercent}%`}
                        </span>
                      </div>

                      {/* Top KPI Row */}
                      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <Users className="mx-auto h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.followersCount.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Wafuasi', 'Followers')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <UserPlus className="mx-auto h-4 w-4 text-sky-600" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.friendsCount.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Marafiki', 'Friends')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <Sparkles className="mx-auto h-4 w-4 text-amber-600" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.postsCount.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Post', 'Posts')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <FileText className="mx-auto h-4 w-4 text-indigo-600" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.articlesCount.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Makala', 'Articles')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <VideoIcon className="mx-auto h-4 w-4 text-purple-600" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.videosCount.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Video', 'Videos')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <Heart className="mx-auto h-4 w-4 text-rose-600" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.totalLikesReceived.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Likes', 'Likes')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <MessageCircle className="mx-auto h-4 w-4 text-emerald-700" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.totalCommentsReceived.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Maoni', 'Comments')}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                          <Share2 className="mx-auto h-4 w-4 text-cyan-700" aria-hidden="true" />
                          <p className="mt-1 font-display text-base font-bold text-slate-900 tabular-nums">
                            {ownMetrics.totalSharesReceived.toLocaleString()}
                          </p>
                          <p className="text-[10.5px] font-medium text-slate-600">{tr('Shares', 'Shares')}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-amber-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            ownMetrics.isEligibleForMonetization ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${ownMetrics.progressPercent}%` }}
                        />
                      </div>

                      {/* All 12 Criteria Grid */}
                      <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {criteria.map((c) => (
                          <div
                            key={c.label}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs"
                          >
                            <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                              {c.met ? (
                                <CheckCircle2
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Circle
                                  className="h-3.5 w-3.5 shrink-0 text-slate-300"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate">{c.label}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px] font-bold text-slate-900 tabular-nums">
                              {c.currentText} / {c.targetText}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Published Payout Schedule (Rates in TZS) */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                          <h3 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
                            {tr(
                              'Viwango Rasmi vya Malipo Baada ya Kufuzu (TZS)',
                              'Official Creator Payout Rates Upon Qualification (TZS)'
                            )}
                          </h3>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                          {tr('Kima cha Chini cha Kutoa:', 'Min. Payout:')}{' '}
                          <strong className="text-slate-900">
                            TZS {MONETIZATION_PAYOUT_RATES.minWithdrawalTzs.toLocaleString()}
                          </strong>
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                        {[
                          {
                            label: tr('Posho ya Mwezi', 'Monthly Base'),
                            amount: `TZS ${MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs.toLocaleString()}`,
                          },
                          {
                            label: tr('Kila Makala', 'Per Article'),
                            amount: `TZS ${MONETIZATION_PAYOUT_RATES.perArticleTzs.toLocaleString()}`,
                          },
                          {
                            label: tr('Kila Video', 'Per Video'),
                            amount: `TZS ${MONETIZATION_PAYOUT_RATES.perVideoTzs.toLocaleString()}`,
                          },
                          {
                            label: tr('Kila Post', 'Per Post'),
                            amount: `TZS ${MONETIZATION_PAYOUT_RATES.perPostTzs.toLocaleString()}`,
                          },
                          {
                            label: tr('Likes 100', '100 Likes'),
                            amount: `TZS ${(MONETIZATION_PAYOUT_RATES.perLikeTzs * 100).toLocaleString()}`,
                          },
                          {
                            label: tr('Maoni 10', '10 Comments'),
                            amount: `TZS ${(MONETIZATION_PAYOUT_RATES.perCommentTzs * 10).toLocaleString()}`,
                          },
                          {
                            label: tr('Shares 10', '10 Shares'),
                            amount: `TZS ${(MONETIZATION_PAYOUT_RATES.perShareTzs * 10).toLocaleString()}`,
                          },
                        ].map((rate) => (
                          <div
                            key={rate.label}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                          >
                            <p className="text-[10.5px] font-medium text-slate-500">{rate.label}</p>
                            <p className="mt-0.5 font-mono text-xs font-bold text-emerald-800 tabular-nums">
                              {rate.amount}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monthly Earnings Panel — Locked for non-eligible users; Always full for Owner */}
                    {canSeeMonthlyPayout ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50/55 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                            <h3 className="text-xs font-bold tracking-wide text-emerald-950 uppercase">
                              {isAdmin && !ownMetrics.isEligibleForMonetization
                                ? tr(
                                    'Muonekano wa Mmiliki — Hesabu Zote za Malipo (Kabla ya Kufuzu)',
                                    'Owner Full Visibility — All Payout Calculations (Pre-Qualification)'
                                  )
                                : tr('Malipo Yako ya Mwezi Huu', 'Your Monthly Payout Summary')}
                            </h3>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenAccordions((prev) => ({ ...prev, admin_moderation: true }));
                                setOpenPayoutsSignal((n) => n + 1);
                              }}
                              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#163A5F]"
                            >
                              <Banknote className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                              <span>
                                {tr(
                                  'Angalia Malipo ya Wanachama Wote',
                                  'View All Members Payout Ledger'
                                )}
                              </span>
                            </button>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-emerald-200 bg-white p-3">
                            <p className="text-[11px] font-semibold text-slate-500">
                              {ownMetrics.isEligibleForMonetization
                                ? tr('Malipo Halisi ya Mwezi Huu', 'Unlocked Monthly Payout')
                                : tr('Makadirio ya Shughuli za Mwezi (Bila Posho)', 'This Month Activity Value')}
                            </p>
                            <p className="mt-1 font-mono text-lg font-extrabold text-emerald-800 tabular-nums">
                              TZS{' '}
                              {(ownMetrics.isEligibleForMonetization
                                ? ownMetrics.monthlyTotalPayoutTzs
                                : ownMetrics.monthlyEngagementPayoutTzs
                              ).toLocaleString()}
                            </p>
                          </div>

                          <div className="rounded-lg border border-emerald-200 bg-white p-3">
                            <p className="text-[11px] font-semibold text-slate-500">
                              {tr('Malipo ya Mwezi + Posho (Ukifuzu)', 'Projected Monthly Total (+Base)')}
                            </p>
                            <p className="mt-1 font-mono text-lg font-extrabold text-slate-900 tabular-nums">
                              TZS {ownMetrics.projectedMonthlyWithBaseTzs.toLocaleString()}
                            </p>
                          </div>

                          <div className="rounded-lg border border-emerald-200 bg-white p-3">
                            <p className="text-[11px] font-semibold text-slate-500">
                              {tr('Thamani ya Jumla ya Maudhui Yote', 'Cumulative Engagement Value')}
                            </p>
                            <p className="mt-1 font-mono text-lg font-extrabold text-[#1D4E89] tabular-nums">
                              TZS {ownMetrics.lifetimeEstimatedValueTzs.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-950 tabular-nums">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Calendar className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                            <span>{tr('Mwezi Huu:', 'This Month:')}</span>
                          </span>
                          <span>
                            {tr('Post', 'Posts')}: <strong>{ownMetrics.monthlyPostsCount}</strong>
                          </span>
                          <span>
                            {tr('Makala', 'Articles')}: <strong>{ownMetrics.monthlyArticlesCount}</strong>
                          </span>
                          <span>
                            {tr('Video', 'Videos')}: <strong>{ownMetrics.monthlyVideosCount}</strong>
                          </span>
                          <span>
                            {tr('Likes', 'Likes')}: <strong>{ownMetrics.monthlyLikesReceived.toLocaleString()}</strong>
                          </span>
                          <span>
                            {tr('Maoni', 'Comments')}: <strong>{ownMetrics.monthlyCommentsReceived.toLocaleString()}</strong>
                          </span>
                          <span>
                            {tr('Shares', 'Shares')}: <strong>{ownMetrics.monthlySharesReceived.toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-100/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
                            <Lock className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {tr(
                                'Malipo Yako ya Mwezi Bado Yamefungwa',
                                'Your Monthly Payouts Are Currently Locked'
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                              {tr(
                                `Malipo yataanza na kiasi chako cha mwezi kitaanza kuonekana hapa mara tu utakapotimiza vigezo vyote ${ownMetrics.totalCriteriaCount}. Kwa sasa umetimiza ${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} (${ownMetrics.progressPercent}%).`,
                                `Monthly earnings begin and unlock here only after all ${ownMetrics.totalCriteriaCount} strict criteria are fulfilled (currently ${ownMetrics.metCriteriaCount}/${ownMetrics.totalCriteriaCount} · ${ownMetrics.progressPercent}%).`
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold text-slate-700 tabular-nums">
                          {ownMetrics.metCriteriaCount} / {ownMetrics.totalCriteriaCount}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

          {/* Accordion 4: Complete Registration Records */}
          {userUid && userProfile && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.registration_summary)}
                onClick={() => toggleAccordion('registration_summary')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                    <ClipboardList className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Kumbukumbu Kamili za Usajili', 'Complete Registration Records')}
                    </h2>
                    <p className="truncate text-xs text-slate-500 tabular-nums">
                      {tr(
                        `ID: ${memberCode} · Serial: ${controlSerial}`,
                        `ID: ${memberCode} · Serial: ${controlSerial}`
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.registration_summary ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.registration_summary && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                    <p className="text-xs text-slate-600">
                      {tr(
                        'Muhtasari wa kumbukumbu zote zilizosajiliwa kwenye akaunti yako ya Malosha Forums.',
                        'Full record of your registered account details on Malosha Forums.'
                      )}
                    </p>
                    {!userEmailVerified && userEmail && (
                      <button
                        type="button"
                        disabled={sendingVerify}
                        onClick={() => void handleSendOwnerVerification()}
                        className="min-h-[38px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                      >
                        {sendingVerify
                          ? tr('Inatuma...', 'Sending...')
                          : tr('Thibitisha Email Yako', 'Verify Email')}
                      </button>
                    )}
                  </div>

                  <dl className="grid grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 text-xs sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
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
                      <dd className="flex min-w-0 items-center gap-1.5">
                        <span className="max-w-[140px] truncate font-mono text-[11px] font-semibold text-slate-700">
                          {userUid}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyUid()}
                          className="inline-flex min-h-[30px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
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
            </section>
          )}

          {/* Accordion 5: Password & Security */}
          {userUid && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.security_password)}
                onClick={() => toggleAccordion('security_password')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {hasPasswordProvider
                        ? tr('Usalama & Badilisha Nenosiri', 'Security & Change Password')
                        : tr('Usalama & Weka Nenosiri', 'Security & Set Login Password')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Sasisha nenosiri lako la kuingia au tuma kiungo cha kurejesha nenosiri',
                        'Update your login password or request a password reset link'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.security_password ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.security_password && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-xs leading-relaxed text-slate-600">
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
                              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
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
                            className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
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
                          className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
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
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0E2640] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60 sm:text-sm"
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
              )}
            </section>
          )}

          {/* Accordion 6: Language & Phone Notifications */}
          {(userUid || isNotificationSupported()) && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.preferences_alerts)}
                onClick={() => toggleAccordion('preferences_alerts')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#D97706] ring-1 ring-amber-200">
                    <BellRing className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Lugha & Arifa za Simu', 'Language & Phone Notifications')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        `Lugha: ${lang === 'sw' ? 'Kiswahili' : 'English'} · Mipangilio ya arifa za simu`,
                        `Language: ${lang === 'sw' ? 'Swahili' : 'English'} · App alert settings`
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.preferences_alerts ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.preferences_alerts && (
                <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2.5">
                      <Globe className="h-4 w-4 shrink-0 text-[#1D4E89]" aria-hidden="true" />
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
                      className="inline-flex shrink-0 rounded-lg border border-slate-300 bg-white p-1"
                    >
                      <button
                        type="button"
                        onClick={() => setLang('sw')}
                        className={`min-h-[38px] rounded-md px-3.5 py-1 text-xs font-semibold transition-colors ${
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
                        className={`min-h-[38px] rounded-md px-3.5 py-1 text-xs font-semibold transition-colors ${
                          lang === 'en'
                            ? 'bg-[#1D4E89] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        English
                      </button>
                    </div>
                  </div>

                  {isNotificationSupported() && (
                    <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 sm:flex-row sm:items-center">
                      <div className="flex items-start gap-2.5">
                        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
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

                      <div className="flex shrink-0 items-center gap-2">
                        {notifPerm === 'granted' && phoneAlertsOn && (
                          <button
                            type="button"
                            onClick={() => void handleSendTestAlert()}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {tr('Jaribu Arifa', 'Test Alert')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleTogglePhoneAlerts()}
                          className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
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
                </div>
              )}
            </section>
          )}

          {/* Accordion 7: User's Safety Reports */}
          {userUid && !isAdmin && myReports.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.my_reports)}
                onClick={() => toggleAccordion('my_reports')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base tabular-nums">
                      {tr(`Ripoti Zako za Usalama (${myReports.length})`, `Your Safety Reports (${myReports.length})`)}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr('Fuatilia hali ya ukaguzi wa ripoti ulizotuma', 'Track review status of your submitted reports')}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.my_reports ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.my_reports && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
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
          )}

          {/* Accordion 7B (Owner): A4 Institutional Training Certificate Studio */}
          {userUid && isAdmin && (
            <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.admin_training_certificates)}
                onClick={() => toggleAccordion('admin_training_certificates')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-amber-50/40 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#B48224] ring-1 ring-amber-200">
                    <Award className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr(
                        'Tengeneza Cheti cha Mafunzo (A4 · Mmiliki)',
                        'A4 Training Certificate Studio (Owner)'
                      )}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Tengeneza vyeti vya kiofisi vya A4 vyenye watermark, pakua PDF au picha (PNG)',
                        'Issue institutional A4 certificates with watermarks, download PDF or PNG'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.admin_training_certificates ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.admin_training_certificates && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <TrainingCertificateStudio
                    ownerUid={userUid}
                    ownerDisplayName={userProfile?.displayName}
                    onToast={onToast}
                  />
                </div>
              )}
            </section>
          )}

          {/* Accordion 8 (Owner): Anti-Fake Member ID Checker */}
          {userUid && isAdmin && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.admin_id_verifier)}
                onClick={() => toggleAccordion('admin_id_verifier')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0E2640] ring-1 ring-sky-200">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Hakiki Kitambulisho cha Mwanachama (Mmiliki)', 'Verify Member ID Card (Owner)')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Kagua namba ya kitambulisho na serial kuzuia vitambulisho bandia',
                        'Verify card numbers and security serials against registry'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.admin_id_verifier ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.admin_id_verifier && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <MemberIdVerifier />
                </div>
              )}
            </section>
          )}

          {/* Accordion 9 (Owner): Member Moderation & Platform Controls */}
          {userUid && isAdmin && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.admin_moderation)}
                onClick={() => toggleAccordion('admin_moderation')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
                    <Users className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr('Usimamizi wa Wanachama & Ripoti (Mmiliki)', 'Member Management & Reports (Owner)')}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Toa beji za uthibitisho, funga/fungua akaunti, na kagua ripoti',
                        'Grant verification badges, manage accounts, and review reports'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.admin_moderation ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.admin_moderation && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <ModerationView
                    embedded
                    reports={myReports}
                    currentUserUid={userUid}
                    onUpdateStatus={onUpdateReportStatus}
                    onOpenTopic={onOpenTopic}
                    onOpenVideo={onOpenVideo}
                    onToast={onToast}
                    hideVideoTabForUsers={hideVideoTabForUsers}
                    onToggleHideVideoTab={onToggleHideVideoTab}
                    hideMpollTabForUsers={hideMpollTabForUsers}
                    onToggleHideMpollTab={onToggleHideMpollTab}
                    retentionSettings={retentionSettings}
                    retentionProgress={retentionProgress}
                    onUpdateRetentionSettings={onUpdateRetentionSettings}
                    onRunRetentionNow={onRunRetentionNow}
                    signupLastSeenMs={signupLastSeenMs}
                    openPayoutsSignal={openPayoutsSignal}
                  />
                </div>
              )}
            </section>
          )}

          {/* Accordion 10: Verification Badge Tiers Legend */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={Boolean(openAccordions.badges_legend)}
              onClick={() => toggleAccordion('badges_legend')}
              className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                    {tr('Alama (Beji) za Uthibitisho wa Akaunti', 'Account Verification Badges')}
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {tr(
                      'Daraja 13 za rangi na madini (Black, White, Kijivu, Gold, Silver, Copper na zaidi)',
                      '13 official badge tiers (Black, White, Gray, Gold, Silver, Copper, and role colors)'
                    )}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                  openAccordions.badges_legend ? 'rotate-180 text-[#0E2640]' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {openAccordions.badges_legend && (
              <div className="border-t border-slate-100 p-4 sm:p-5">
                <p className="text-xs leading-relaxed text-slate-600">
                  {tr(
                    'Ili kuongeza uaminifu na kuwatambua wanachama wa madaraja yote (Black, White, Kijivu, Gold, Silver, Copper na taasisi), Malosha Forums linatumia rangi 13 rasmi za uthibitisho:',
                    'To recognize community trust and creator tiers (including Black, White, Gray, Gold, Silver, Copper, and official roles), Malosha Forums supports 13 verification badge tiers:'
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
                        <div className="shrink-0 pt-0.5">
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
              </div>
            )}
          </section>

          {/* Accordion 11: Safety Pillars & 13 Social Media Community Rules */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={Boolean(openAccordions.safety_rules)}
              onClick={() => toggleAccordion('safety_rules')}
              className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1D4E89] ring-1 ring-slate-200">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                    {tr('Usalama wa Akaunti & Sheria 13 za Jukwaa', 'Account Safety & 13 Platform Rules')}
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {tr(
                      'Sheria 13 rasmi za mitandao ya kijamii na ulinzi wa akaunti yako',
                      '13 official social media safety rules & enforcement notice policy'
                    )}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                  openAccordions.safety_rules ? 'rotate-180 text-[#0E2640]' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {openAccordions.safety_rules && (
              <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <UserCheck className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
                    <h3 className="mt-2.5 font-display text-base font-semibold text-slate-900">
                      {tr('1. Akaunti Zilizothibitishwa', '1. Verified Accounts')}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {tr(
                        'Kila chapisho na jibu huthibitishwa na akaunti halali (Google au Barua Pepe) ili kuzuia akaunti bandia na ujumbe wa taka.',
                        'Every post and reply is backed by valid account authentication (Google or Email) to deter fake accounts and spam.'
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <Lock className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
                    <h3 className="mt-2.5 font-display text-base font-semibold text-slate-900">
                      {tr('2. Faragha ya Taarifa Binafsi', '2. Personal Privacy')}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {tr(
                        'Barua pepe na namba yako ya simu huhifadhiwa kwenye mkusanyiko maalum wa siri unaoweza kusomwa na wewe pekee.',
                        'Your email address and phone number are stored in a private collection accessible only to you.'
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <ShieldCheck className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
                    <h3 className="mt-2.5 font-display text-base font-semibold text-slate-900">
                      {tr('3. Udhibiti & Arifa za Sheria', '3. Rule Enforcement & Alerts')}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {tr(
                        'Akaunti ikifungwa au video ikifungiwa kwa kukiuka mojawapo ya sheria hizi 13, mhusika hupokea ujumbe rasmi ukibainisha sheria aliyovunja.',
                        'Whenever an account is suspended or a video is blocked, the owner receives a clear in-account notice citing the exact rule broken.'
                      )}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {tr(
                        'Sheria 13 Zinazoongoza Mitandao ya Kijamii (Malosha Forums)',
                        '13 Standard Social Media Rules (Malosha Forums)'
                      )}
                    </h3>
                    <span className="rounded-md bg-[#0E2640] px-2 py-0.5 text-[11px] font-bold text-white">
                      {tr('Kanuni 13 Rasmi', '13 Official Rules')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {tr(
                      'Zingatia kanuni hizi ili kulinda akaunti yako na kubaki kwenye vigezo vya kulipwa. Ukiuka wowote hufungia video au kufunga akaunti kwa kutaja namba ya kanuni:',
                      'Follow these 13 community standards to protect your account and payout eligibility:'
                    )}
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {COMMUNITY_SAFETY_RULES.map((rule) => (
                      <div
                        key={rule.number}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E2640] font-mono text-xs font-extrabold text-white">
                          {rule.number}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 sm:text-[13px]">
                            {tr(rule.titleSw, rule.titleEn)}
                          </h4>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                            {tr(rule.summarySw, rule.summaryEn)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Accordion 12 (Owner): Private Personal Photo Vault (Bottom of Profile below 13 Rules) */}
          {userUid && isAdmin && (
            <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
              <button
                type="button"
                aria-expanded={Boolean(openAccordions.admin_private_photos)}
                onClick={() => toggleAccordion('admin_private_photos')}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-emerald-50/40 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <Images className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                      {tr(
                        'Kabati la Picha Binafsi (Mmiliki Pekee)',
                        'Owner Private Photo Vault (Owner Only)'
                      )}
                    </h2>
                    <p className="truncate text-xs text-slate-500">
                      {tr(
                        'Mafile ya siri (PIN), 0 MB cache, mpangilio wa Google Photos & upakiaji wenye asilimia unaoendelea simu ikizima',
                        'Locked secret folders, 0 MB cache, Google Photos grid & resumable upload queue'
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                    openAccordions.admin_private_photos ? 'rotate-180 text-[#0E2640]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {openAccordions.admin_private_photos && (
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <OwnerPrivatePhotoVault
                    ownerUid={userUid}
                    onToast={onToast}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

