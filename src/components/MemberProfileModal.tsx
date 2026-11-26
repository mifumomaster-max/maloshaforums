import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Banknote,
  CheckCircle2,
  Circle,
  ExternalLink,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquarePlus,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { useLanguage } from '../context/LanguageContext';
import {
  checkIsFollowingUser,
  fetchMemberPublicProfile,
  toggleFollowUser,
} from '../services/forumService';
import {
  AuthPromptReason,
  MONETIZATION_PAYOUT_RATES,
  MONETIZATION_REQUIREMENTS,
  Topic,
  UserProfile,
  VideoPost,
  computeAuthorMetrics,
  formatMemberCode,
  normalizeBoardCategory,
} from '../types';
import { Avatar, OnlineStatusPill } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface MemberProfileModalProps {
  memberUid: string | null;
  fallbackName?: string;
  fallbackPhoto?: string;
  currentUser: User | null;
  currentUserDisplayName: string;
  currentUserPhoto: string;
  topics: Topic[];
  videos?: VideoPost[];
  isAdmin?: boolean;
  isSuspended?: boolean;
  onClose: () => void;
  onSignIn: (reason?: AuthPromptReason) => void;
  onStartPrivateChat?: (target: {
    uid: string;
    displayName: string;
    photoURL?: string;
  }) => Promise<void> | void;
  onOpenTopic?: (topicId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  memberUid,
  fallbackName = 'Mwanachama',
  fallbackPhoto = '',
  currentUser,
  currentUserDisplayName,
  currentUserPhoto,
  topics,
  videos = [],
  isAdmin = false,
  isSuspended = false,
  onClose,
  onSignIn,
  onStartPrivateChat,
  onOpenTopic,
  onToast,
}) => {
  const { tr, formatTime, getBoardLabel, getBadgeLabel } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [followersDelta, setFollowersDelta] = useState(0);

  useEffect(() => {
    if (!memberUid) {
      setProfile(null);
      setFollowing(false);
      setFollowersDelta(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFollowersDelta(0);

    void Promise.all([
      fetchMemberPublicProfile(memberUid),
      currentUser && currentUser.uid !== memberUid
        ? checkIsFollowingUser(memberUid, currentUser.uid)
        : Promise.resolve(false),
    ]).then(([loadedProfile, isFollowing]) => {
      if (cancelled) return;
      setProfile(loadedProfile);
      setFollowing(isFollowing);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [memberUid, currentUser]);

  const effectiveName = profile?.displayName || fallbackName || 'Mwanachama';
  const effectivePhoto = profile?.photoURL || fallbackPhoto || '';
  const effectiveFollowersCount = Math.max(
    0,
    (profile?.followersCount || 0) + followersDelta
  );

  const metrics = useMemo(
    () =>
      memberUid
        ? computeAuthorMetrics(topics, memberUid, effectiveFollowersCount, videos, 0, {
            repliesGivenCount: profile?.repliesCount || 0,
            accountCreatedAt: profile?.createdAt || null,
            verificationBadge: profile?.verificationBadge || 'none',
            accountStatus: profile?.accountStatus || 'active',
            hasProfilePhoto: Boolean(effectivePhoto),
            bioLength: (profile?.bio || '').trim().length,
          })
        : computeAuthorMetrics([], '', 0, [], 0),
    [topics, videos, memberUid, effectiveFollowersCount, profile, effectivePhoto]
  );

  const isSelf = currentUser?.uid === memberUid;

  const recentPosts = useMemo(() => {
    if (!memberUid) return [];
    return topics
      .filter(
        (t) =>
          t.authorId === memberUid &&
          t.status !== 'archived' &&
          (t.status !== 'private' || isSelf)
      )
      .slice(0, 5);
  }, [topics, memberUid, isSelf]);

  if (!memberUid) return null;

  const isTargetSuspended = profile?.accountStatus === 'suspended';

  const handleToggleFollow = async () => {
    if (!currentUser) {
      onToast(
        tr(
          'Ingia kwenye akaunti yako ili kuweza kufuatilia wanachama.',
          'Sign in to follow community members.'
        ),
        'error'
      );
      onClose();
      onSignIn();
      return;
    }
    if (isSelf || followBusy) return;
    if (isSuspended) {
      onToast(
        tr('Akaunti yako imefungwa.', 'Your account is suspended.'),
        'error'
      );
      return;
    }

    setFollowBusy(true);
    const prevFollowing = following;
    try {
      const next = await toggleFollowUser(
        memberUid,
        currentUser,
        currentUserDisplayName,
        currentUserPhoto,
        prevFollowing
      );
      setFollowing(next);
      setFollowersDelta((d) => d + (next ? 1 : -1));
      onToast(
        next
          ? tr(`Umeanza kumfuata ${effectiveName}.`, `You are now following ${effectiveName}.`)
          : tr(`Umeacha kumfuata ${effectiveName}.`, `Unfollowed ${effectiveName}.`)
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kusasisha ufuatiliaji.', 'Failed to update follow status.'),
        'error'
      );
    } finally {
      setFollowBusy(false);
    }
  };

  const handleStartDm = async () => {
    if (!onStartPrivateChat || startingChat || isSelf) return;
    if (!currentUser) {
      onClose();
      onSignIn('chat');
      return;
    }
    if (isSuspended) {
      onToast(
        tr('Akaunti yako imefungwa.', 'Your account is suspended.'),
        'error'
      );
      return;
    }
    setStartingChat(true);
    try {
      await onStartPrivateChat({
        uid: memberUid,
        displayName: effectiveName,
        photoURL: effectivePhoto,
      });
      onClose();
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufungua mazungumzo.', 'Failed to start chat.'),
        'error'
      );
    } finally {
      setStartingChat(false);
    }
  };

  const criteriaItems = [
    {
      label: tr('Wafuasi (Followers)', 'Followers'),
      currentText: metrics.followersCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minFollowers.toLocaleString(),
      met: metrics.followersCount >= MONETIZATION_REQUIREMENTS.minFollowers,
    },
    {
      label: tr('Marafiki (Friends)', 'Friends'),
      currentText: metrics.friendsCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minFriends.toLocaleString(),
      met: metrics.friendsCount >= MONETIZATION_REQUIREMENTS.minFriends,
    },
    {
      label: tr('Machapisho Yote (Posts)', 'Total Posts'),
      currentText: metrics.postsCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minPosts.toLocaleString(),
      met: metrics.postsCount >= MONETIZATION_REQUIREMENTS.minPosts,
    },
    {
      label: tr('Makala za Kina', 'Makala Articles'),
      currentText: metrics.articlesCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minArticles.toLocaleString(),
      met: metrics.articlesCount >= MONETIZATION_REQUIREMENTS.minArticles,
    },
    {
      label: tr('Video Zilizopakiwa', 'Videos Posted'),
      currentText: metrics.videosCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minVideos.toLocaleString(),
      met: metrics.videosCount >= MONETIZATION_REQUIREMENTS.minVideos,
    },
    {
      label: tr('Likes Zilizopokelewa', 'Likes Received'),
      currentText: metrics.totalLikesReceived.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minLikes.toLocaleString(),
      met: metrics.totalLikesReceived >= MONETIZATION_REQUIREMENTS.minLikes,
    },
    {
      label: tr('Maoni Yaliyopokelewa', 'Comments Received'),
      currentText: metrics.totalCommentsReceived.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minComments.toLocaleString(),
      met: metrics.totalCommentsReceived >= MONETIZATION_REQUIREMENTS.minComments,
    },
    {
      label: tr('Shares Zilizopokelewa', 'Shares Received'),
      currentText: metrics.totalSharesReceived.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minShares.toLocaleString(),
      met: metrics.totalSharesReceived >= MONETIZATION_REQUIREMENTS.minShares,
    },
    {
      label: tr('Majibu Aliyoandika', 'Replies Written'),
      currentText: metrics.repliesGivenCount.toLocaleString(),
      targetText: MONETIZATION_REQUIREMENTS.minRepliesGiven.toLocaleString(),
      met: metrics.repliesGivenCount >= MONETIZATION_REQUIREMENTS.minRepliesGiven,
    },
    {
      label: tr('Umri wa Akaunti (Siku)', 'Account Age (Days)'),
      currentText: `${metrics.accountAgeDays.toLocaleString()} ${tr('siku', 'd')}`,
      targetText: `${MONETIZATION_REQUIREMENTS.minAccountDays.toLocaleString()} ${tr('siku', 'd')}`,
      met: metrics.accountAgeDays >= MONETIZATION_REQUIREMENTS.minAccountDays,
    },
    {
      label: tr('Beji ya Uthibitisho', 'Verification Badge'),
      currentText: metrics.hasVerificationBadge
        ? getBadgeLabel(profile?.verificationBadge || 'none', true)
        : tr('Hana', 'None'),
      targetText: tr('Lazima', 'Required'),
      met: metrics.hasVerificationBadge,
    },
    {
      label: tr('Wasifu Kamili & Rekodi Safi', 'Complete Profile & Clean Standing'),
      currentText: metrics.hasCleanVerifiedAccount
        ? tr('Safi', 'Clean')
        : tr('Bado', 'Incomplete'),
      targetText: tr('Kamili', '100%'),
      met: metrics.hasCleanVerifiedAccount,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr(`Wasifu wa ${effectiveName}`, `${effectiveName}'s Profile`)}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        {/* Top Banner Header */}
        <div className="relative shrink-0 bg-gradient-to-r from-[#0E2640] via-[#163A5F] to-[#1D4E89] px-5 pt-5 pb-12 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-sky-200 uppercase">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Wasifu wa Mwanachama', 'Member Profile')}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Funga wasifu', 'Close profile')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="-mt-9 flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-3.5">
              <div className="rounded-full bg-white p-1 shadow-md">
                <Avatar
                  name={effectiveName}
                  photoURL={effectivePhoto}
                  uid={memberUid}
                  showOnlineIndicator
                  size="lg"
                />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="truncate font-display text-lg font-bold text-slate-900 sm:text-xl">
                    {effectiveName}
                  </h2>
                  {profile && profile.verificationBadge !== 'none' && (
                    <VerificationBadge
                      badge={profile.verificationBadge}
                      size="md"
                      showLabel
                    />
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <OnlineStatusPill uid={memberUid} />
                  <span className="font-mono text-[11px] font-semibold text-[#1D4E89]">
                    ID: {formatMemberCode(memberUid)}
                  </span>
                  {profile?.verificationBadge && profile.verificationBadge !== 'none' && (
                    <span>· {getBadgeLabel(profile.verificationBadge)}</span>
                  )}
                </div>
              </div>
            </div>

            {!isSelf && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => void handleToggleFollow()}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                    following
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-[#1D4E89] text-white hover:bg-[#163A5F]'
                  }`}
                >
                  {followBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : following ? (
                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {following ? tr('Unafuatilia', 'Following') : tr('Fuata', 'Follow')}
                  </span>
                </button>

                {onStartPrivateChat && (
                  <button
                    type="button"
                    disabled={startingChat}
                    onClick={() => void handleStartDm()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#075E54] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#064E46] disabled:opacity-60"
                  >
                    {startingChat ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{tr('Ujumbe Binafsi', 'Private Chat')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#1D4E89]" aria-hidden="true" />
              <span>{tr('Inapakia taarifa za akaunti...', 'Loading profile details...')}</span>
            </div>
          ) : (
            <>
              {isTargetSuspended && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{tr('Akaunti hii imefungwa na msimamizi.', 'This account is suspended.')}</span>
                </div>
              )}

              {profile?.bio && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
                  {profile.bio}
                </p>
              )}
            </>
          )}

          {/* KPI Summary Cards */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Users className="mx-auto h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.followersCount.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Wafuasi', 'Followers')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <VideoIcon className="mx-auto h-4 w-4 text-purple-600" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.videosCount.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Video', 'Videos')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Sparkles className="mx-auto h-4 w-4 text-amber-600" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.postsCount.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Post', 'Posts')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Heart className="mx-auto h-4 w-4 text-rose-600" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.totalLikesReceived.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Likes', 'Likes')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center col-span-2 sm:col-span-1">
              <MessageCircle className="mx-auto h-4 w-4 text-emerald-700" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.totalCommentsReceived.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Maoni', 'Comments')}
              </p>
            </div>
          </div>

          {/* Creator Monetization Eligibility & Rules */}
          <div className="mt-5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  {tr('Masharti 12 Magumu ya Kulipwa', '12 Strict Payout Criteria')}
                </h3>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  metrics.isEligibleForMonetization
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {metrics.isEligibleForMonetization
                  ? tr('Amekidhi 12/12!', 'Eligible 12/12!')
                  : `${metrics.metCriteriaCount}/${metrics.totalCriteriaCount} · ${metrics.progressPercent}%`}
              </span>
            </div>

            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  metrics.isEligibleForMonetization ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
                style={{ width: `${metrics.progressPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {criteriaItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                    {item.met ? (
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
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-slate-900 tabular-nums">
                    {item.currentText}/{item.targetText}
                  </span>
                </div>
              ))}
            </div>

            {/* Monthly Payout Amount Section: Unlocked only at 12/12 or for Owner */}
            <div className="mt-3.5 rounded-lg border border-slate-200 bg-white p-3">
              {isAdmin || metrics.isEligibleForMonetization ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 uppercase">
                      <Banknote className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      <span>
                        {isAdmin && !metrics.isEligibleForMonetization
                          ? tr(
                              'Muonekano wa Mmiliki — Makadirio ya Malipo (Kabla Hajafuzu)',
                              'Owner View — Monthly Payout Estimate (Pre-Qualification)'
                            )
                          : tr('Malipo ya Mwezi Huu (TZS)', 'Monthly Payout (TZS)')}
                      </span>
                    </span>
                    <span className="font-mono text-xs font-extrabold text-emerald-800 tabular-nums">
                      TZS{' '}
                      {(metrics.isEligibleForMonetization
                        ? metrics.monthlyTotalPayoutTzs
                        : metrics.projectedMonthlyWithBaseTzs
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10.5px] text-slate-600 tabular-nums">
                    <div>
                      <span className="block text-slate-400">{tr('Shughuli Mwezi Huu', 'This Month')}</span>
                      <strong className="font-mono text-slate-900">
                        TZS {metrics.monthlyEngagementPayoutTzs.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-slate-400">{tr('Posho ya Mwezi', 'Monthly Base')}</span>
                      <strong className="font-mono text-slate-900">
                        TZS {MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-slate-400">{tr('Thamani Yote', 'Lifetime Est.')}</span>
                      <strong className="font-mono text-[#1D4E89]">
                        TZS {metrics.lifetimeEstimatedValueTzs.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                  <span>
                    {tr(
                      `Malipo ya mwezi (Posho TZS ${MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs.toLocaleString()}+ na shughuli) yamefungwa mpaka vigezo vyote 12 vitimie.`,
                      `Monthly payouts (TZS ${MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs.toLocaleString()}+ base & activity) unlock only after all 12 criteria are met.`
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Recent Posts by Member */}
          {recentPosts.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                {tr('Machapisho ya Hivi Karibuni', 'Recent Posts')}
              </h3>
              <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {recentPosts.map((post) => {
                  const board = normalizeBoardCategory(post.category);
                  const label =
                    post.title.trim() ||
                    post.body.trim().slice(0, 72) ||
                    tr('Chapisho la picha', 'Photo post');
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => {
                        onOpenTopic?.(post.id);
                        onClose();
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {getBoardLabel(board)} · {formatTime(post.createdAt)} ·{' '}
                          {post.upvotesCount} likes · {post.repliesCount}{' '}
                          {tr('maoni', 'comments')}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
