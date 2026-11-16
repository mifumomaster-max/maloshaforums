import React, { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { AlertTriangle, BellRing, Globe, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ADMIN_EMAIL, auth } from '../firebase';
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
} from '../types';
import { Avatar } from './Avatar';
import { MemberIdCard } from './MemberIdCard';
import { ModerationView } from './ModerationView';
import { VerificationBadge } from './VerificationBadge';

interface SafetyGuidelinesViewProps {
  userUid: string | null;
  userEmail: string | null;
  userPhone?: string;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isSuspended?: boolean;
  myReports: Report[];
  onSaveProfile: (displayName: string, bio: string, phoneNumber?: string) => Promise<void>;
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
  userPhone = '',
  userProfile,
  isAdmin,
  isSuspended = false,
  myReports,
  onSaveProfile,
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl [text-wrap:balance]">
              {tr('Wasifu wa Akaunti na Usalama', 'Account Profile & Safety')}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              {isAdmin
                ? tr(
                    'Simamia taarifa zako binafsi, angalia jumla ya wanachama na taarifa zao, weka beji, funga akaunti za wakiukaji, na ondoa machapisho yenye maudhui mabaya.',
                    'Manage your profile, view all members and details, assign verification badges, close accounts, and remove harmful posts.'
                  )
                : tr(
                    'Hariri taarifa zako za hadhara, chagua lugha, fuatilia ripoti zako, na soma kanuni za usalama za Malosha Forums.',
                    'Edit your public profile, choose your language, track your reports, and read Malosha Forums safety guidelines.'
                  )}
            </p>
          </div>

          {userUid && userProfile && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shrink-0">
              <Avatar
                name={userProfile.displayName}
                photoURL={userProfile.photoURL}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-slate-900">
                    {userProfile.displayName}
                  </span>
                  <VerificationBadge badge={userProfile.verificationBadge} size="sm" />
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

      {/* Admin Controls Embedded Directly inside Profile */}
      {userUid && isAdmin && (
        <ModerationView
          embedded
          reports={myReports}
          currentUserUid={userUid}
          onUpdateStatus={onUpdateReportStatus}
          onOpenTopic={onOpenTopic}
          onToast={onToast}
        />
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

