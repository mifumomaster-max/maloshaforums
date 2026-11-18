import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
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
  MONETIZATION_REQUIREMENTS,
  Topic,
  UserProfile,
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
        ? computeAuthorMetrics(topics, memberUid, effectiveFollowersCount)
        : computeAuthorMetrics([], '', 0),
    [topics, memberUid, effectiveFollowersCount]
  );

  const recentPosts = useMemo(() => {
    if (!memberUid) return [];
    return topics
      .filter((t) => t.authorId === memberUid && t.status !== 'archived')
      .slice(0, 5);
  }, [topics, memberUid]);

  if (!memberUid) return null;

  const isSelf = currentUser?.uid === memberUid;
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
      label: tr('Wanaofuatilia (Followers)', 'Followers'),
      current: metrics.followersCount,
      target: MONETIZATION_REQUIREMENTS.minFollowers,
      met: metrics.followersCount >= MONETIZATION_REQUIREMENTS.minFollowers,
    },
    {
      label: tr('Machapisho hai (Posts)', 'Active Posts'),
      current: metrics.postsCount,
      target: MONETIZATION_REQUIREMENTS.minPosts,
      met: metrics.postsCount >= MONETIZATION_REQUIREMENTS.minPosts,
    },
    {
      label: tr('Likes zilizopokelewa', 'Likes Received'),
      current: metrics.totalLikesReceived,
      target: MONETIZATION_REQUIREMENTS.minLikes,
      met: metrics.totalLikesReceived >= MONETIZATION_REQUIREMENTS.minLikes,
    },
    {
      label: tr('Maoni yaliyopokelewa', 'Comments Received'),
      current: metrics.totalCommentsReceived,
      target: MONETIZATION_REQUIREMENTS.minComments,
      met: metrics.totalCommentsReceived >= MONETIZATION_REQUIREMENTS.minComments,
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

          {/* 4 KPI Summary Cards */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Users className="mx-auto h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.followersCount}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Wanaomfuatilia', 'Followers')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Sparkles className="mx-auto h-4 w-4 text-amber-600" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.postsCount}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Machapisho', 'Posts')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <Heart className="mx-auto h-4 w-4 text-rose-600" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.totalLikesReceived}
              </p>
              <p className="text-[11px] font-medium text-slate-600">
                {tr('Likes Alizopata', 'Likes')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
              <MessageCircle className="mx-auto h-4 w-4 text-emerald-700" aria-hidden="true" />
              <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                {metrics.totalCommentsReceived}
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
                  {tr('Masharti ya Kuanza Kulipwa', 'Creator Monetization Criteria')}
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
                  ? tr('Amekidhi Masharti Yote!', 'Eligible for Payouts!')
                  : `${metrics.progressPercent}% ${tr('imefikiwa', 'complete')}`}
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
                  className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-slate-700">
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
                  <span className="font-mono text-[11px] font-bold text-slate-900 tabular-nums">
                    {item.current}/{item.target}
                  </span>
                </div>
              ))}
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
