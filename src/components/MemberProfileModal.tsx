import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Banknote,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
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
  updateUserProfileDetailsVisibility,
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
  const [togglingVisibility, setTogglingVisibility] = useState(false);

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

  const isSelf = currentUser?.uid === memberUid;
  const effectiveName = profile?.displayName || fallbackName || 'Mwanachama';
  const effectivePhoto = profile?.photoURL || fallbackPhoto || '';
  const isDetailsPublic = Boolean(profile?.profileDetailsPublic);
  const canViewDetails = isSelf || isAdmin || isDetailsPublic;
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

  const handleToggleProfileDetailsVisibility = async () => {
    if (!isSelf || !memberUid || togglingVisibility) return;
    const nextPublic = !isDetailsPublic;
    setTogglingVisibility(true);
    try {
      const saved = await updateUserProfileDetailsVisibility(memberUid, nextPublic);
      setProfile((prev) => (prev ? { ...prev, profileDetailsPublic: saved } : prev));
      onToast(
        saved
          ? tr(
              'Taarifa za wasifu wako sasa zimewekwa wazi kwa wanachama wengine.',
              'Your profile details are now visible to other members.'
            )
          : tr(
              'Taarifa za wasifu wako sasa zimefichwa (Faragha).',
              'Your profile details are now private.'
            )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kubadilisha faragha ya wasifu.', 'Failed to update profile visibility.'),
        'error'
      );
    } finally {
      setTogglingVisibility(false);
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
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[#D5DCE4] bg-[#F4F6F9] shadow-2xl sm:rounded-2xl"
      >
        {/* Top X-Style Banner Header */}
        <div className="relative h-24 shrink-0 bg-gradient-to-r from-[#0F1419] via-[#163A5F] to-[#1D4E89] px-4 pt-3.5 text-white sm:h-28 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-100 backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
              <span>{tr('Wasifu wa Mwanachama', 'Profile')}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Funga wasifu', 'Close profile')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/55"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-5">
          {/* Overlapping Avatar (Left) + X Pill Action Buttons (Right) */}
          <div className="-mt-10 flex items-end justify-between gap-3">
            <div className="shrink-0 rounded-full bg-[#F4F6F9] p-1 shadow-sm">
              <Avatar
                name={effectiveName}
                photoURL={effectivePhoto}
                uid={memberUid}
                showOnlineIndicator
                size="lg"
              />
            </div>

            {!isSelf && (
              <div className="flex shrink-0 items-center gap-2 pb-1">
                {onStartPrivateChat && (
                  <button
                    type="button"
                    disabled={startingChat}
                    onClick={() => void handleStartDm()}
                    aria-label={tr('Ujumbe Binafsi', 'Private Chat')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#CFD9DE] bg-white px-3.5 text-xs font-bold text-[#0F1419] transition-colors hover:bg-[#E7ECEF] disabled:opacity-60"
                  >
                    {startingChat ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageSquarePlus className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                    )}
                    <span>{tr('Ujumbe', 'Message')}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => void handleToggleFollow()}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors disabled:opacity-60 ${
                    following
                      ? 'border border-[#CFD9DE] bg-white text-[#0F1419] hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                      : 'bg-[#0F1419] text-white hover:bg-[#272C30]'
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
              </div>
            )}
          </div>

          {/* Strict Single-Line Horizontal Display Name + Verification Badge */}
          <div className="mt-2.5">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
              <h2 className="min-w-0 truncate whitespace-nowrap font-sans text-lg font-extrabold tracking-tight text-[#0F1419] sm:text-xl">
                {effectiveName}
              </h2>
              {profile && profile.verificationBadge !== 'none' && (
                <span className="inline-flex shrink-0 items-center">
                  <VerificationBadge
                    badge={profile.verificationBadge}
                    size="md"
                  />
                </span>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#536471]">
              <span className="font-mono text-[12px] text-[#536471]">
                @{formatMemberCode(memberUid).toLowerCase()}
              </span>
              {profile?.verificationBadge && profile.verificationBadge !== 'none' && (
                <span className="font-medium text-[#1D4E89]">
                  · {getBadgeLabel(profile.verificationBadge, true)}
                </span>
              )}
              <OnlineStatusPill uid={memberUid} />
            </div>

            {loading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-[#536471]">
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

                {canViewDetails && profile?.bio && (
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#0F1419]">
                    {profile.bio}
                  </p>
                )}
              </>
            )}

            {/* Account Owner Quick Toggle to Hide/Publish Profile Details */}
            {isSelf && profile && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[#0F1419]">
                    {isDetailsPublic ? (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 shrink-0 text-[#1D4E89]" aria-hidden="true" />
                    )}
                    <span>
                      {isDetailsPublic
                        ? tr('Taarifa za Wasifu: Zipo Wazi', 'Profile Details: Public')
                        : tr('Taarifa za Wasifu: Zimefichwa (Faragha)', 'Profile Details: Private')}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#536471]">
                    {isDetailsPublic
                      ? tr(
                          'Wengine wanaona bio, takwimu zako (Wafuasi, Video, Post, Likes, Maoni) na machapisho yako. Taarifa za malipo hubaki siri.',
                          'Others can view your bio, stats (Followers, Videos, Posts, Likes, Comments), and posts. Payouts stay private.'
                        )
                      : tr(
                          'Wengine wanaona picha ya wasifu na jina lako tu; taarifa za kina na takwimu zimefichwa.',
                          'Others only see your profile photo and name; detailed stats and bio are hidden.'
                        )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={togglingVisibility}
                  onClick={() => void handleToggleProfileDetailsVisibility()}
                  className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors disabled:opacity-60 ${
                    isDetailsPublic
                      ? 'border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'bg-[#1D4E89] text-white hover:bg-[#163A5F]'
                  }`}
                >
                  {togglingVisibility ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : isDetailsPublic ? (
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>
                    {isDetailsPublic
                      ? tr('Ficha Taarifa', 'Hide Details')
                      : tr('Weka Wazi', 'Make Public')}
                  </span>
                </button>
              </div>
            )}

            {/* X-Style Inline Counts Bar — Visible only if owner made details public, self, or Admin */}
            {canViewDetails && !loading && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#D5DCE4] pb-3 text-[13px] text-[#536471]">
                <span>
                  <strong className="font-bold text-[#0F1419] tabular-nums">
                    {metrics.followersCount.toLocaleString()}
                  </strong>{' '}
                  {tr('Wafuasi', 'Followers')}
                </span>
                <span>
                  <strong className="font-bold text-[#0F1419] tabular-nums">
                    {metrics.postsCount.toLocaleString()}
                  </strong>{' '}
                  {tr('Machapisho', 'Posts')}
                </span>
                <span>
                  <strong className="font-bold text-[#0F1419] tabular-nums">
                    {metrics.totalLikesReceived.toLocaleString()}
                  </strong>{' '}
                  {tr('Likes', 'Likes')}
                </span>
              </div>
            )}
          </div>

          {/* Privacy Lock Card When Other User Keeps Profile Details Private */}
          {!loading && !canViewDetails && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#CBD5E1] bg-white p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#1D4E89]">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-[#0F1419]">
                  {tr(
                    'Taarifa za Kina za Wasifu Zimefichwa (Faragha)',
                    'Detailed Profile Information is Private'
                  )}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#536471]">
                  {tr(
                    'Mwenye akaunti hii hajachagua kuweka wazi taarifa zake za kina, takwimu za akaunti na maelezo binafsi. Unaweza kuendelea kumfuata au kumtumia ujumbe binafsi.',
                    'This account owner has kept their detailed stats, bio, and profile activity private. You can still follow them or send a private message.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* KPI Summary Cards */}
          {canViewDetails && !loading && (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <div className="rounded-xl border border-[#D5DCE4] bg-white p-3 text-center">
                <Users className="mx-auto h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                <p className="mt-1 font-sans text-lg font-bold text-[#0F1419] tabular-nums">
                  {metrics.followersCount.toLocaleString()}
                </p>
                <p className="text-[11px] font-medium text-[#536471]">
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
          )}

          {/* Creator Monetization Eligibility & Rules — Strictly Private to Profile Owner or Site Owner */}
          {(isSelf || isAdmin) && (
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
          )}

          {/* Recent Posts by Member */}
          {canViewDetails && !loading && recentPosts.length > 0 && (
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
