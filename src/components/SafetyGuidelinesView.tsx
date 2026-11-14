import React, { useEffect, useState } from 'react';
import { Globe, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  Report,
  VERIFICATION_BADGE_META,
  VerificationBadgeType,
  UserProfile,
} from '../types';
import { Avatar } from './Avatar';
import { ModerationView } from './ModerationView';
import { VerificationBadge } from './VerificationBadge';

interface SafetyGuidelinesViewProps {
  userUid: string | null;
  userEmail: string | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  myReports: Report[];
  onSaveProfile: (displayName: string, bio: string) => Promise<void>;
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
  userProfile,
  isAdmin,
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
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName);
      setBio(userProfile.bio);
    }
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedNotice('');
    try {
      await onSaveProfile(displayName, bio);
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
                    'Simamia taarifa zako binafsi, toa beji za uthibitisho wa akaunti, na kagua ripoti za usalama za Malosha Forums.',
                    'Manage your personal info, assign account verification badges, and review Malosha Forums safety reports.'
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
            <div className="flex items-center gap-2 text-xs">
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
              {tr('Ingia na Google', 'Sign in with Google')}
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
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
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
              <label htmlFor="profile-bio" className="block text-xs font-semibold text-slate-700">
                {tr('Utambulisho Mfupi (Hiari)', 'Short Bio (Optional)')}
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={300}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={tr(
                  'Mfano: Mhandisi wa programu anayependa usalama wa mitandao...',
                  'Example: Software engineer passionate about digital communities...'
                )}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            {savedNotice && <p className="text-xs font-medium text-emerald-800">{savedNotice}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                {saving
                  ? tr('Inahifadhi...', 'Saving...')
                  : tr('Hifadhi Wasifu', 'Save Profile')}
              </button>
            </div>
          </form>
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
              'Kila chapisho na jibu huthibitishwa na utambulisho halali wa Google ili kuzuia akaunti bandia na ujumbe wa taka.',
              'Every post and reply is backed by valid Google authentication to deter fake accounts and spam.'
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
              'Anwani yako ya barua pepe huhifadhiwa kwenye mkusanyiko maalum wa siri unaoweza kusomwa na wewe pekee.',
              'Your email address is stored in a private collection accessible only to you.'
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

