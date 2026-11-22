import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Mail,
  Phone,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
  Video as VideoIcon,
  XCircle,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CONTENT_RETENTION_PERIOD_MS,
  DEFAULT_CONTENT_RETENTION_SETTINGS,
  deleteTopicCascade,
  deleteVideoCascade,
  getAdminUserPrivateDetails,
  moderateVideoPost,
  updateTopicStatus,
  updateUserAccountStatus,
  updateUserVerificationBadge,
} from '../services/forumService';
import {
  AccountStatus,
  COMMUNITY_SAFETY_RULES,
  ContentRetentionPeriod,
  ContentRetentionSettings,
  Report,
  Topic,
  UserProfile,
  VERIFICATION_BADGE_META,
  VERIFICATION_BADGE_TIERS,
  VerificationBadgeType,
  VideoPost,
  computeMemberControlSerial,
  findCommunityRule,
  formatMemberCode,
  normalizeAccountStatus,
  normalizeBoardCategory,
  normalizeVerificationBadge,
} from '../types';
import { Avatar, OnlineStatusPill } from './Avatar';
import { MemberIdVerifier } from './MemberIdVerifier';
import { VerificationBadge } from './VerificationBadge';

interface ModerationViewProps {
  reports: Report[];
  currentUserUid: string | null;
  onUpdateStatus: (reportId: string, status: 'reviewed' | 'dismissed') => Promise<void>;
  onOpenTopic: (topicId: string) => void;
  onOpenVideo?: (videoId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  embedded?: boolean;
  hideVideoTabForUsers?: boolean;
  onToggleHideVideoTab?: () => void | Promise<void>;
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
  signupLastSeenMs?: number;
}

const RETENTION_DURATION_OPTIONS: Array<{
  value: ContentRetentionPeriod;
  labelSw: string;
  labelEn: string;
}> = [
  { value: '1w', labelSw: 'Wiki 1 (Siku 7)', labelEn: '1 Week (7 days)' },
  { value: '3m', labelSw: 'Miezi 3 (Siku 90)', labelEn: '3 Months (90 days)' },
  { value: '6m', labelSw: 'Miezi 6 (Siku 180)', labelEn: '6 Months (180 days)' },
  { value: '1y', labelSw: 'Mwaka 1 (Siku 365)', labelEn: '1 Year (365 days)' },
  { value: '5y', labelSw: 'Miaka 5', labelEn: '5 Years' },
  { value: '10y', labelSw: 'Miaka 10', labelEn: '10 Years' },
];

type AdminSection = 'members' | 'verify_id' | 'posts' | 'videos' | 'reports';
type MemberFilter = 'all' | 'active' | 'suspended';
type PostFilter = 'all' | 'open' | 'locked' | 'archived';
type VideoFilter = 'all' | 'live' | 'blocked';

export const ModerationView: React.FC<ModerationViewProps> = ({
  reports,
  currentUserUid,
  onUpdateStatus,
  onOpenTopic,
  onOpenVideo,
  onToast,
  embedded = false,
  hideVideoTabForUsers = false,
  onToggleHideVideoTab,
  retentionSettings = DEFAULT_CONTENT_RETENTION_SETTINGS,
  retentionProgress,
  onUpdateRetentionSettings,
  onRunRetentionNow,
  signupLastSeenMs = 0,
}) => {
  const {
    tr,
    formatTime,
    getReportReasonLabel,
    getBadgeLabel,
    getBadgeDescription,
    getBoardLabel,
  } = useLanguage();

  const [section, setSection] = useState<AdminSection>('members');
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [privateDetails, setPrivateDetails] = useState<
    Record<string, { email: string; phoneNumber: string }>
  >({});
  const fetchedPrivateUidsRef = useRef<Set<string>>(new Set());

  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');
  const [memberSortNewest, setMemberSortNewest] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [lockPromptUid, setLockPromptUid] = useState<string | null>(null);
  const [lockRuleNumber, setLockRuleNumber] = useState<number>(1);
  const [lockReasonDraft, setLockReasonDraft] = useState('');

  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<PostFilter>('all');
  const [updatingTopicId, setUpdatingTopicId] = useState<string | null>(null);
  const [confirmDeleteTopicId, setConfirmDeleteTopicId] = useState<string | null>(null);

  const [allVideos, setAllVideos] = useState<VideoPost[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videoSearch, setVideoSearch] = useState('');
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all');
  const [updatingVideoId, setUpdatingVideoId] = useState<string | null>(null);
  const [blockVideoPromptId, setBlockVideoPromptId] = useState<string | null>(null);
  const [blockVideoRuleNum, setBlockVideoRuleNum] = useState<number>(1);
  const [blockVideoReasonDraft, setBlockVideoReasonDraft] = useState('');
  const [confirmDeleteVideoId, setConfirmDeleteVideoId] = useState<string | null>(null);

  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    setLoadingMembers(true);
    const path = 'users';
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list: UserProfile[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: data.uid || d.id,
            displayName: data.displayName || 'Mwanachama',
            photoURL: data.photoURL || '',
            bio: data.bio || '',
            role: data.role === 'moderator' ? 'moderator' : 'member',
            verificationBadge: normalizeVerificationBadge(data.verificationBadge),
            accountStatus: normalizeAccountStatus(data.accountStatus),
            suspendedReason:
              typeof data.suspendedReason === 'string' ? data.suspendedReason : '',
            suspendedRuleNumber: Number(data.suspendedRuleNumber || 0),
            topicsCount: Number(data.topicsCount || 0),
            repliesCount: Number(data.repliesCount || 0),
            followersCount: Number(data.followersCount || 0),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        list.sort((a, b) => {
          const rank = (badge: VerificationBadgeType) => {
            switch (badge) {
              case 'owner':
                return 0;
              case 'government':
                return 1;
              case 'organization':
                return 2;
              case 'journalist':
                return 3;
              case 'educator':
                return 4;
              case 'creator':
                return 5;
              case 'individual':
                return 6;
              default:
                return 7;
            }
          };
          const diff = rank(a.verificationBadge) - rank(b.verificationBadge);
          if (diff !== 0) return diff;
          return a.displayName.localeCompare(b.displayName);
        });
        setMembers(list);
        setLoadingMembers(false);
      },
      (error) => {
        setLoadingMembers(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const missingUids = members
      .map((m) => m.uid)
      .filter((uid) => !fetchedPrivateUidsRef.current.has(uid));

    if (missingUids.length === 0) return;

    missingUids.forEach((uid) => fetchedPrivateUidsRef.current.add(uid));
    let cancelled = false;

    void getAdminUserPrivateDetails(missingUids)
      .then((details) => {
        if (cancelled) return;
        setPrivateDetails((prev) => ({ ...prev, ...details }));
      })
      .catch((err) => {
        console.error('Failed loading private user details:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [members]);

  useEffect(() => {
    setLoadingTopics(true);
    const path = 'topics';
    const unsub = onSnapshot(
      collection(db, 'topics'),
      (snapshot) => {
        const list: Topic[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || '',
            body: data.body || '',
            category: data.category,
            tags: Array.isArray(data.tags) ? data.tags : [],
            authorId: data.authorId,
            authorName: data.authorName || 'Mwanachama',
            authorPhoto: data.authorPhoto || '',
            status: data.status || 'open',
            isPinned: Boolean(data.isPinned),
            repliesCount: Number(data.repliesCount || 0),
            upvotesCount: Number(data.upvotesCount || 0),
            acceptedReplyId: data.acceptedReplyId || '',
            company: data.company || '',
            location: data.location || '',
            jobType: data.jobType || '',
            deadline: data.deadline || '',
            applyInfo: data.applyInfo || '',
            coverImage: data.coverImage || '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            lastActivityAt: data.lastActivityAt || data.createdAt || null,
          };
        });
        list.sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });
        setAllTopics(list);
        setLoadingTopics(false);
      },
      (error) => {
        setLoadingTopics(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    setLoadingVideos(true);
    const path = 'videos';
    const unsub = onSnapshot(
      collection(db, 'videos'),
      (snapshot) => {
        const list: VideoPost[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            mediaType: data.mediaType === 'photo' ? 'photo' : 'video',
            videoUrl: String(data.videoUrl || ''),
            photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls.map(String) : [],
            audioUrl: String(data.audioUrl || ''),
            cloudinaryPublicId: String(data.cloudinaryPublicId || ''),
            thumbnailUrl: String(data.thumbnailUrl || ''),
            caption: String(data.caption || ''),
            soundName: String(data.soundName || ''),
            tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Mwanachama'),
            authorPhoto: String(data.authorPhoto || ''),
            durationSec: Number(data.durationSec || 0),
            likesCount: Number(data.likesCount || 0),
            commentsCount: Number(data.commentsCount || 0),
            sharesCount: Number(data.sharesCount || 0),
            allowComments: data.allowComments !== false,
            allowDownload: data.allowDownload !== false,
            allowLikes: data.allowLikes !== false,
            showLikeCount: data.showLikeCount !== false,
            autoReplyEnabled: Boolean(data.autoReplyEnabled),
            autoReplyTrigger: data.autoReplyTrigger === 'keyword' ? 'keyword' : 'all',
            autoReplyKeyword: String(data.autoReplyKeyword || ''),
            autoReplyMessage: String(data.autoReplyMessage || ''),
            isArchived: Boolean(data.isArchived),
            moderationRuleNumber: Number(data.moderationRuleNumber || 0),
            moderationReason: typeof data.moderationReason === 'string' ? data.moderationReason : '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        list.sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });
        setAllVideos(list);
        setLoadingVideos(false);
      },
      (error) => {
        setLoadingVideos(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, []);

  const verifiedCount = useMemo(
    () => members.filter((m) => m.verificationBadge !== 'none').length,
    [members]
  );
  const suspendedCount = useMemo(
    () => members.filter((m) => m.accountStatus === 'suspended').length,
    [members]
  );
  const archivedTopicsCount = useMemo(
    () => allTopics.filter((t) => t.status === 'archived').length,
    [allTopics]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const filtered = members.filter((m) => {
      const status: AccountStatus = m.accountStatus === 'suspended' ? 'suspended' : 'active';
      if (memberFilter === 'active' && status !== 'active') return false;
      if (memberFilter === 'suspended' && status !== 'suspended') return false;
      if (!q) return true;
      const priv = privateDetails[m.uid];
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.bio.toLowerCase().includes(q) ||
        m.uid.toLowerCase().includes(q) ||
        formatMemberCode(m.uid).toLowerCase().includes(q) ||
        computeMemberControlSerial(m.uid).toLowerCase().includes(q) ||
        (priv?.email || '').toLowerCase().includes(q) ||
        (priv?.phoneNumber || '').toLowerCase().includes(q) ||
        VERIFICATION_BADGE_META[m.verificationBadge].label.toLowerCase().includes(q) ||
        getBadgeLabel(m.verificationBadge).toLowerCase().includes(q)
      );
    });
    if (memberSortNewest) {
      return [...filtered].sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt ? b.createdAt.toMillis() : 0;
        if (bm !== am) return bm - am;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    return filtered;
  }, [members, memberSearch, memberFilter, memberSortNewest, privateDetails, getBadgeLabel]);

  const filteredTopics = useMemo(() => {
    const q = postSearch.trim().toLowerCase();
    return allTopics.filter((t) => {
      if (postFilter !== 'all' && t.status !== postFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.authorName.toLowerCase().includes(q) ||
        normalizeBoardCategory(t.category).toLowerCase().includes(q)
      );
    });
  }, [allTopics, postSearch, postFilter]);

  const topicStatusById = useMemo(() => {
    const map = new Map<string, Topic['status']>();
    allTopics.forEach((t) => map.set(t.id, t.status));
    return map;
  }, [allTopics]);

  const videoById = useMemo(() => {
    const map = new Map<string, VideoPost>();
    allVideos.forEach((v) => map.set(v.id, v));
    return map;
  }, [allVideos]);

  const filteredVideos = useMemo(() => {
    const q = videoSearch.trim().toLowerCase();
    return allVideos.filter((v) => {
      if (videoFilter === 'live' && v.isArchived) return false;
      if (videoFilter === 'blocked' && !v.isArchived) return false;
      if (!q) return true;
      return (
        v.caption.toLowerCase().includes(q) ||
        v.authorName.toLowerCase().includes(q) ||
        v.soundName.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allVideos, videoSearch, videoFilter]);

  const handleAssignBadge = async (member: UserProfile, nextBadge: VerificationBadgeType) => {
    if (member.verificationBadge === nextBadge) return;
    setUpdatingUid(member.uid);
    try {
      await updateUserVerificationBadge(member.uid, nextBadge);
      const label = getBadgeLabel(nextBadge);
      onToast(
        tr(
          `Akaunti ya ${member.displayName} imewekwa: ${label}.`,
          `${member.displayName}'s account updated to: ${label}.`
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kusasisha beji ya uthibitisho.', 'Failed to update verification badge.'),
        'error'
      );
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleSuspendAccount = async (
    member: UserProfile,
    reason: string,
    ruleNumber?: number
  ) => {
    setUpdatingUid(member.uid);
    const chosenRule = ruleNumber ? findCommunityRule(ruleNumber) : null;
    const effectiveReason =
      reason.trim() ||
      (chosenRule
        ? `${chosenRule.titleSw} — ${chosenRule.summarySw}`
        : tr('Ukiukaji wa maadili ya jukwaa.', 'Violation of community guidelines.'));
    try {
      await updateUserAccountStatus(
        member.uid,
        'suspended',
        effectiveReason,
        chosenRule ? chosenRule.number : undefined
      );
      setLockPromptUid(null);
      setLockReasonDraft('');
      setLockRuleNumber(1);
      onToast(
        tr(
          `Akaunti ya ${member.displayName} imefungwa${chosenRule ? ` (Kanuni #${chosenRule.number})` : ''} na arifa imetumwa.`,
          `${member.displayName}'s account has been closed${chosenRule ? ` (Rule #${chosenRule.number})` : ''} and notified.`
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufunga akaunti.', 'Failed to close account.'),
        'error'
      );
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleRestoreAccount = async (member: UserProfile) => {
    setUpdatingUid(member.uid);
    try {
      await updateUserAccountStatus(member.uid, 'active', '');
      onToast(
        tr(
          `Akaunti ya ${member.displayName} imefunguliwa tena.`,
          `${member.displayName}'s account has been reopened.`
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufungua akaunti.', 'Failed to reopen account.'),
        'error'
      );
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleToggleArchivePost = async (topic: Topic) => {
    setUpdatingTopicId(topic.id);
    const nextStatus = topic.status === 'archived' ? 'open' : 'archived';
    try {
      await updateTopicStatus(topic.id, nextStatus);
      onToast(
        nextStatus === 'archived'
          ? tr(
              'Chapisho limefungwa na kuondolewa kwa watumiaji wengine.',
              'Post closed and removed from public view.'
            )
          : tr('Chapisho limerejeshwa hewani.', 'Post restored to public view.')
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kubadilisha hali ya chapisho.', 'Failed to update post status.'),
        'error'
      );
    } finally {
      setUpdatingTopicId(null);
    }
  };

  const handlePermanentDeletePost = async (topicId: string) => {
    setUpdatingTopicId(topicId);
    try {
      await deleteTopicCascade(topicId);
      setConfirmDeleteTopicId(null);
      onToast(tr('Chapisho limefutwa kabisa.', 'Post permanently deleted.'));
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufuta chapisho.', 'Failed to delete post.'),
        'error'
      );
    } finally {
      setUpdatingTopicId(null);
    }
  };

  const handleModerateVideo = async (
    video: VideoPost,
    opts: { isArchived: boolean; ruleNumber?: number; reason?: string }
  ) => {
    setUpdatingVideoId(video.id);
    const chosenRule = opts.ruleNumber ? findCommunityRule(opts.ruleNumber) : null;
    try {
      await moderateVideoPost(video, opts);
      setBlockVideoPromptId(null);
      setBlockVideoReasonDraft('');
      onToast(
        opts.isArchived
          ? tr(
              `Video imefungiwa${chosenRule ? ` (Kanuni #${chosenRule.number})` : ''} na mwandishi amearifiwa.`,
              `Video blocked${chosenRule ? ` (Rule #${chosenRule.number})` : ''} and creator notified.`
            )
          : tr('Video imerejeshwa hewani na mwandishi amearifiwa.', 'Video restored and creator notified.')
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kubadilisha hali ya video.', 'Failed to moderate video.'),
        'error'
      );
    } finally {
      setUpdatingVideoId(null);
    }
  };

  const handlePermanentDeleteVideo = async (videoId: string) => {
    setUpdatingVideoId(videoId);
    try {
      await deleteVideoCascade(videoId);
      setConfirmDeleteVideoId(null);
      onToast(tr('Video imefutwa kabisa.', 'Video permanently deleted.'));
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufuta video.', 'Failed to delete video.'),
        'error'
      );
    } finally {
      setUpdatingVideoId(null);
    }
  };

  const handleCloseReportedPost = async (report: Report) => {
    setUpdatingTopicId(report.topicId);
    try {
      if (report.targetType === 'video') {
        const vid = videoById.get(report.topicId);
        if (vid) {
          await moderateVideoPost(vid, {
            isArchived: true,
            ruleNumber: report.ruleNumber || 1,
            reason: report.reason,
          });
        }
      } else {
        await updateTopicStatus(report.topicId, 'archived');
      }
      if (report.status === 'pending') {
        await onUpdateStatus(report.id, 'reviewed');
      }
      onToast(
        tr(
          'Maudhui yaliyoripotiwa yamefungiwa na kuondolewa hadharani.',
          'Reported content blocked and removed from public view.'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufunga maudhui.', 'Failed to block content.'),
        'error'
      );
    } finally {
      setUpdatingTopicId(null);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'rounded-xl border border-slate-200 bg-white p-5 sm:p-6'
          : 'mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8'
      }
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div>
          {embedded ? (
            <h2 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
              {tr('Kipengele Maalumu cha Mmiliki (Utawala)', 'Owner Control Suite')}
            </h2>
          ) : (
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              {tr('Jopo la Usimamizi wa Malosha Forums', 'Malosha Forums Owner Panel')}
            </h1>
          )}
          <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {tr(
              'Ona jumla ya wafuasi na taarifa zao kamili, weka beji za uthibitisho, funga akaunti za wakiukaji, na ondoa machapisho yenye maudhui mabaya.',
              'View total members and full user details, assign verification badges, close accounts, and remove harmful posts.'
            )}
          </p>
        </div>

        {/* Section Switcher */}
        <div
          role="group"
          aria-label={tr('Sehemu za usimamizi', 'Admin sections')}
          className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-1 shrink-0"
        >
          <button
            type="button"
            onClick={() => setSection('members')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'members'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {tr('Wanachama', 'Members')} ({members.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSection('verify_id')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'verify_id'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Hakiki ID', 'Verify ID')}</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('posts')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'posts'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {tr('Machapisho', 'Posts')} ({allTopics.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSection('videos')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'videos'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <VideoIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {tr('Video', 'Videos')} ({allVideos.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSection('reports')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'reports'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {tr('Ripoti', 'Reports')} ({pendingCount})
            </span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[11px] font-semibold text-slate-600">
            {tr('Jumla ya Wafuasi / Wanachama', 'Total Members / Followers')}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0E2640] tabular-nums">
            {loadingMembers ? '—' : members.length}
          </p>
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5">
          <p className="text-[11px] font-semibold text-sky-900">
            {tr('Akaunti Zenye Beji', 'Verified Badges')}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1D4E89] tabular-nums">
            {loadingMembers ? '—' : verifiedCount}
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50/70 p-3.5">
          <p className="text-[11px] font-semibold text-red-900">
            {tr('Akaunti Zilizofungwa', 'Closed Accounts')}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700 tabular-nums">
            {loadingMembers ? '—' : suspendedCount}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5">
          <p className="text-[11px] font-semibold text-amber-900">
            {tr('Machapisho Yaliyoondolewa', 'Removed Posts')}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-800 tabular-nums">
            {loadingTopics ? '—' : archivedTopicsCount}
          </p>
        </div>
      </div>

      {/* Owner Quick Visibility Switch: Hide Video Icon for Regular Users */}
      {onToggleHideVideoTab && (
        <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                hideVideoTabForUsers
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-sky-100 text-[#1D4E89]'
              }`}
            >
              {hideVideoTabForUsers ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900 sm:text-sm">
                {tr(
                  'Uonekano wa Kipengele cha Video kwa Watumiaji',
                  'Video Feature Visibility for Users'
                )}
              </p>
              <p className="text-[11px] text-slate-600">
                {hideVideoTabForUsers
                  ? tr(
                      'Icon ya Video imefichwa kwa watumiaji wengine wote (Mmiliki pekee ndiye anaiona).',
                      'Video icon is currently hidden from all non-admin users.'
                    )
                  : tr(
                      'Icon ya Video inaonekana wazi kwa watumiaji wote kwenye menu ya juu na chini.',
                      'Video icon is visible to everyone in navigation.'
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onToggleHideVideoTab()}
            className={`inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              hideVideoTabForUsers
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-rose-700 text-white hover:bg-rose-800'
            }`}
          >
            {hideVideoTabForUsers ? (
              <>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Onyesha Video kwa Wote', 'Show Video Tab')}</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Ficha Video kwa Watumiaji', 'Hide Video Tab')}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Owner Automated Content Retention & Sequential Database Cleanup Plan (Kijiweni & Video) */}
      {onUpdateRetentionSettings && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 sm:text-sm">
                  {tr(
                    'Mpango wa Kufuta Machapisho ya Zamani (Database Auto-Clean)',
                    'Automated Content Retention & Database Cleanup'
                  )}
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                  {tr(
                    'Weka muda kwa Kijiweni au Video. Ukiwasha swichi, machapisho yote yaliyopitiliza muda huo yatafutwa moja baada ya nyingine hadi kwenye database.',
                    'Set retention age for Kijiweni or Video posts. Turning a switch ON deletes expired items sequentially one-by-one from the database.'
                  )}
                </p>
              </div>
            </div>

            {(retentionSettings.kijiweniEnabled || retentionSettings.videoEnabled) && onRunRetentionNow && (
              <button
                type="button"
                disabled={Boolean(retentionProgress?.runningKijiweni || retentionProgress?.runningVideo)}
                onClick={() => onRunRetentionNow('both')}
                className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
              >
                {retentionProgress?.runningKijiweni || retentionProgress?.runningVideo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>{tr('Inafuta...', 'Cleaning...')}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Kagua & Futa Sasa', 'Scan & Clean Now')}</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Plan 1: Kijiweni Posts */}
            {(() => {
              const cutoffMs = Date.now() - CONTENT_RETENTION_PERIOD_MS[retentionSettings.kijiweniPeriod];
              const matchingCount = allTopics.filter((t) => {
                if (normalizeBoardCategory(t.category) !== 'Kijiweni') return false;
                const ms = t.createdAt ? t.createdAt.toMillis() : 0;
                return ms > 0 && ms <= cutoffMs;
              }).length;
              const isRunning = Boolean(retentionProgress?.runningKijiweni);

              return (
                <div
                  className={`rounded-xl border p-3.5 transition-colors ${
                    retentionSettings.kijiweniEnabled
                      ? 'border-amber-300 bg-amber-50/45'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-slate-900 sm:text-sm">
                          {tr('Machapisho ya Kijiweni', 'Kijiweni Posts')}
                        </p>
                        <p className="text-[11px] text-slate-600 tabular-nums">
                          {tr(
                            `Yaliyopitiliza muda: ${matchingCount}`,
                            `Expired matching posts: ${matchingCount}`
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={retentionSettings.kijiweniEnabled}
                      aria-label={tr(
                        'Washa au zima kufuta Kijiweni kiotomatiki',
                        'Toggle Kijiweni auto-delete'
                      )}
                      onClick={() =>
                        void onUpdateRetentionSettings({
                          kijiweniEnabled: !retentionSettings.kijiweniEnabled,
                        })
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89] ${
                        retentionSettings.kijiweniEnabled ? 'bg-rose-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                          retentionSettings.kijiweniEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      {tr('Futa post za Kijiweni zilizozidi:', 'Delete Kijiweni posts older than:')}
                    </label>
                    <select
                      value={retentionSettings.kijiweniPeriod}
                      onChange={(e) =>
                        void onUpdateRetentionSettings({
                          kijiweniPeriod: e.target.value as ContentRetentionPeriod,
                        })
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#1D4E89] focus:outline-none"
                    >
                      {RETENTION_DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {tr(opt.labelSw, opt.labelEn)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isRunning && retentionProgress && (
                    <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-900 tabular-nums">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          <span>{tr('Inafuta 1 kwa 1:', 'Deleting 1-by-1:')}</span>
                        </span>
                        <span>
                          {retentionProgress.kijiweniDeleted} / {retentionProgress.kijiweniTotal || matchingCount}
                        </span>
                      </div>
                      {retentionProgress.currentLabel && (
                        <p className="mt-0.5 truncate text-[10.5px] text-rose-700">
                          {retentionProgress.currentLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Plan 2: Video Posts */}
            {(() => {
              const cutoffMs = Date.now() - CONTENT_RETENTION_PERIOD_MS[retentionSettings.videoPeriod];
              const matchingCount = allVideos.filter((v) => {
                const ms = v.createdAt ? v.createdAt.toMillis() : 0;
                return ms > 0 && ms <= cutoffMs;
              }).length;
              const isRunning = Boolean(retentionProgress?.runningVideo);

              return (
                <div
                  className={`rounded-xl border p-3.5 transition-colors ${
                    retentionSettings.videoEnabled
                      ? 'border-amber-300 bg-amber-50/45'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <VideoIcon className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-slate-900 sm:text-sm">
                          {tr('Machapisho ya Video', 'Video Posts')}
                        </p>
                        <p className="text-[11px] text-slate-600 tabular-nums">
                          {tr(
                            `Zilizopitiliza muda: ${matchingCount}`,
                            `Expired matching videos: ${matchingCount}`
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={retentionSettings.videoEnabled}
                      aria-label={tr(
                        'Washa au zima kufuta Video kiotomatiki',
                        'Toggle Video auto-delete'
                      )}
                      onClick={() =>
                        void onUpdateRetentionSettings({
                          videoEnabled: !retentionSettings.videoEnabled,
                        })
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89] ${
                        retentionSettings.videoEnabled ? 'bg-rose-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                          retentionSettings.videoEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      {tr('Futa Video zilizozidi muda:', 'Delete videos older than:')}
                    </label>
                    <select
                      value={retentionSettings.videoPeriod}
                      onChange={(e) =>
                        void onUpdateRetentionSettings({
                          videoPeriod: e.target.value as ContentRetentionPeriod,
                        })
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#1D4E89] focus:outline-none"
                    >
                      {RETENTION_DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {tr(opt.labelSw, opt.labelEn)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isRunning && retentionProgress && (
                    <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-900 tabular-nums">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          <span>{tr('Inafuta 1 kwa 1:', 'Deleting 1-by-1:')}</span>
                        </span>
                        <span>
                          {retentionProgress.videoDeleted} / {retentionProgress.videoTotal || matchingCount}
                        </span>
                      </div>
                      {retentionProgress.currentLabel && (
                        <p className="mt-0.5 truncate text-[10.5px] text-rose-700">
                          {retentionProgress.currentLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {section === 'verify_id' ? (
        <div className="mt-6">
          <MemberIdVerifier />
        </div>
      ) : section === 'members' ? (
        <div className="mt-6 space-y-5">
          {/* Verification Color Legend (7 Tiers) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                'owner',
                'government',
                'organization',
                'journalist',
                'educator',
                'creator',
                'individual',
              ] as VerificationBadgeType[]
            ).map(
              (tier) => {
                const meta = VERIFICATION_BADGE_META[tier];
                const count = members.filter((m) => m.verificationBadge === tier).length;
                return (
                  <div
                    key={tier}
                    className={`rounded-lg border p-3.5 ${meta.borderClass} ${meta.softBgClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <VerificationBadge badge={tier} size="md" showLabel />
                      <span className="font-mono text-xs font-bold text-slate-700 tabular-nums">
                        {count}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-slate-700">
                      {getBadgeDescription(tier)}
                    </p>
                  </div>
                );
              }
            )}
          </div>

          {/* Search + Status Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={tr(
                  'Tafuta kwa jina, ID (MLF-...), serial, barua pepe, simu, au beji...',
                  'Search by name, ID (MLF-...), serial, email, phone, or badge...'
                )}
                aria-label={tr('Tafuta wanachama', 'Search members')}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label={tr('Chuja hali ya akaunti', 'Filter account status')}
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shrink-0"
            >
              {(
                [
                  { id: 'all', label: tr('Zote', 'All') },
                  { id: 'active', label: tr('Hai', 'Active') },
                  { id: 'suspended', label: tr('Zimefungwa', 'Closed') },
                ] as { id: MemberFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMemberFilter(f.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    memberFilter === f.id
                      ? 'bg-[#0E2640] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMemberSortNewest((prev) => !prev)}
                className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  memberSortNewest
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {memberSortNewest ? tr('Wapya Kwanza', 'Newest First') : tr('Kwa Cheo', 'By Badge')}
              </button>
            </div>
          </div>

          {/* Members List with Full Details */}
          {loadingMembers ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {tr('Inapakia orodha ya wanachama...', 'Loading members...')}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
              <Users className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
              {tr(
                'Hakuna akaunti zilizolingana na utafutaji wako.',
                'No accounts matched your search.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg">
              {filteredMembers.map((member) => {
                const isSelf = currentUserUid === member.uid;
                const busy = updatingUid === member.uid;
                const badgeMeta = VERIFICATION_BADGE_META[member.verificationBadge];
                const isSuspended = member.accountStatus === 'suspended';
                const priv = privateDetails[member.uid];
                const showLockPrompt = lockPromptUid === member.uid;

                return (
                  <div
                    key={member.uid}
                    className={`p-4 sm:px-5 ${isSuspended ? 'bg-red-50/40' : ''}`}
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar
                          name={member.displayName}
                          photoURL={member.photoURL}
                          size="md"
                          uid={member.uid}
                          showOnlineIndicator
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-900">
                              {member.displayName}
                            </span>
                            <VerificationBadge badge={member.verificationBadge} size="sm" />
                            <OnlineStatusPill uid={member.uid} />
                            {(() => {
                              const joinedMs = member.createdAt ? member.createdAt.toMillis() : 0;
                              const isRecent =
                                !isSelf &&
                                joinedMs > 0 &&
                                (joinedMs > signupLastSeenMs ||
                                  Date.now() - joinedMs < 24 * 60 * 60 * 1000);
                              return isRecent ? (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                                  {tr('Mpya', 'New')}
                                </span>
                              ) : null;
                            })()}
                            {isSuspended && (
                              <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Akaunti Imefungwa', 'Account Closed')}</span>
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[11px] font-medium text-slate-500">
                                ({tr('Wewe', 'You')})
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 tabular-nums">
                            <span className={`font-medium ${badgeMeta.textClass}`}>
                              {getBadgeLabel(member.verificationBadge)}
                            </span>{' '}
                            · {tr('Mada', 'Posts')} {member.topicsCount} ·{' '}
                            {tr('Majibu', 'Replies')} {member.repliesCount}
                          </p>

                          {/* Full Owner-Only User Info */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              <span className="font-medium">
                                {priv?.email || tr('Hakuna barua pepe', 'No email')}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              <span className="font-medium tabular-nums">
                                {priv?.phoneNumber || tr('Hajaweka namba', 'No phone')}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              <span>
                                {tr('Alijiunga', 'Joined')}:{' '}
                                {member.createdAt ? formatTime(member.createdAt) : '—'}
                              </span>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-600">
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-bold text-[#1D4E89]">
                              ID: {formatMemberCode(member.uid)}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">
                              Serial: {computeMemberControlSerial(member.uid)}
                            </span>
                            <span className="text-slate-400 break-all">UID: {member.uid}</span>
                          </div>

                          {member.bio && (
                            <p className="text-xs text-slate-600">{member.bio}</p>
                          )}

                          {(isSuspended && (member.suspendedReason || member.suspendedRuleNumber)) && (
                            <div className="space-y-0.5 text-xs font-medium text-red-800">
                              {Boolean(member.suspendedRuleNumber) && (() => {
                                const rule = findCommunityRule(member.suspendedRuleNumber);
                                return rule ? (
                                  <p className="font-bold">
                                    {tr(`Kanuni #${rule.number}`, `Rule #${rule.number}`)}:{' '}
                                    {tr(rule.titleSw, rule.titleEn)}
                                  </p>
                                ) : null;
                              })()}
                              {member.suspendedReason && (
                                <p>
                                  {tr('Sababu ya kufungwa', 'Closure reason')}:{' '}
                                  {member.suspendedReason}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Owner Controls per Member */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <label htmlFor={`badge-${member.uid}`} className="sr-only">
                          {tr('Chagua beji kwa', 'Choose badge for')} {member.displayName}
                        </label>
                        <select
                          id={`badge-${member.uid}`}
                          disabled={busy}
                          value={member.verificationBadge}
                          onChange={(e) =>
                            void handleAssignBadge(member, e.target.value as VerificationBadgeType)
                          }
                          className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-[#1D4E89] focus:outline-none disabled:opacity-60"
                        >
                          {VERIFICATION_BADGE_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {getBadgeLabel(tier)}
                            </option>
                          ))}
                        </select>

                        {!isSelf &&
                          (isSuspended ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRestoreAccount(member)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
                            >
                              <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Fungua Akaunti', 'Reopen Account')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setLockPromptUid(showLockPrompt ? null : member.uid);
                                setLockReasonDraft('');
                              }}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
                            >
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Funga Akaunti', 'Close Account')}</span>
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Inline Lock Confirmation Box with 13 Rules Selector */}
                    {showLockPrompt && !isSuspended && !isSelf && (
                      <div className="mt-3 space-y-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-xs font-semibold text-red-900">
                          {tr(
                            `Funga akaunti ya ${member.displayName}? Atapata ujumbe wa kanuni aliyovunja kwenye akaunti yake.`,
                            `Close ${member.displayName}'s account? They will receive an in-account notice with the violated rule.`
                          )}
                        </p>
                        <div>
                          <label className="block text-[11px] font-bold text-red-900">
                            {tr('Chagua Sheria Iliyokiukwa (Kanuni #1 – #13)', 'Select Violated Rule (#1 – #13)')}
                          </label>
                          <select
                            value={lockRuleNumber}
                            onChange={(e) => setLockRuleNumber(Number(e.target.value))}
                            className="mt-1 min-h-[38px] w-full rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-red-500 focus:outline-none"
                          >
                            {COMMUNITY_SAFETY_RULES.map((rule) => (
                              <option key={rule.number} value={rule.number}>
                                #{rule.number} · {tr(rule.titleSw, rule.titleEn)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            maxLength={250}
                            value={lockReasonDraft}
                            onChange={(e) => setLockReasonDraft(e.target.value)}
                            placeholder={tr(
                              'Maelezo ya ziada kwa mtumiaji (hiari)...',
                              'Additional reason for the user (optional)...'
                            )}
                            className="min-h-[38px] flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleSuspendAccount(member, lockReasonDraft, lockRuleNumber)
                              }
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                            >
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Thibitisha Kufunga', 'Confirm Closure')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setLockPromptUid(null);
                                setLockReasonDraft('');
                              }}
                              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {tr('Ghairi', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : section === 'posts' ? (
        <div className="mt-6 space-y-4">
          {/* Post Search & Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={postSearch}
                onChange={(e) => setPostSearch(e.target.value)}
                placeholder={tr(
                  'Tafuta chapisho kwa kichwa, maelezo, au mwandishi...',
                  'Search posts by title, content, or author...'
                )}
                aria-label={tr('Tafuta machapisho', 'Search posts')}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label={tr('Chuja hali ya chapisho', 'Filter post status')}
              className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-1 shrink-0"
            >
              {(
                [
                  { id: 'all', label: tr('Yote', 'All') },
                  { id: 'open', label: tr('Hewani', 'Live') },
                  { id: 'locked', label: tr('Yamefungwa Maoni', 'Locked') },
                  { id: 'archived', label: tr('Yaliyoondolewa', 'Removed') },
                ] as { id: PostFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPostFilter(f.id)}
                  className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    postFilter === f.id
                      ? 'bg-[#0E2640] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingTopics ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {tr('Inapakia machapisho...', 'Loading posts...')}
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
              <FileText className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
              {tr('Hakuna machapisho yaliyopatikana.', 'No posts found.')}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg">
              {filteredTopics.map((topic) => {
                const board = normalizeBoardCategory(topic.category);
                const busy = updatingTopicId === topic.id;
                const isArchived = topic.status === 'archived';
                const confirmingDelete = confirmDeleteTopicId === topic.id;

                return (
                  <div
                    key={topic.id}
                    className={`p-4 sm:px-5 ${isArchived ? 'bg-red-50/35' : ''}`}
                  >
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#1D4E89]">
                            {getBoardLabel(board)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-800">{topic.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">{formatTime(topic.createdAt)}</span>
                          <span aria-hidden="true">·</span>
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                              <EyeOff className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Imeondolewa kwa Wengine', 'Removed from Public')}</span>
                            </span>
                          ) : topic.status === 'locked' ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                              <Lock className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Maoni Yamefungwa', 'Comments Locked')}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              {tr('Hewani', 'Live')}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-bold text-slate-900 line-clamp-1">
                          {topic.title.trim() ||
                            topic.body.trim().slice(0, 90) ||
                            tr('Chapisho la picha', 'Photo post')}
                        </p>
                        {topic.body && (
                          <p className="text-xs text-slate-600 line-clamp-2">{topic.body}</p>
                        )}
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {tr('Penda', 'Likes')} {topic.upvotesCount} ·{' '}
                          {tr('Maoni', 'Comments')} {topic.repliesCount}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenTopic(topic.id)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Fungua', 'Open')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleArchivePost(topic)}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            isArchived
                              ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                              : 'bg-amber-600 text-white hover:bg-amber-700'
                          }`}
                        >
                          {isArchived ? (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Rejesha Hewani', 'Restore Post')}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Funga / Ondoa', 'Close / Remove')}</span>
                            </>
                          )}
                        </button>

                        {confirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handlePermanentDeletePost(topic.id)}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Futa Kabisa', 'Confirm Delete')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteTopicId(null)}
                              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              {tr('Ghairi', 'Cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDeleteTopicId(topic.id)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Futa', 'Delete')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : section === 'videos' ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={videoSearch}
                onChange={(e) => setVideoSearch(e.target.value)}
                placeholder={tr(
                  'Tafuta video kwa maelezo, sauti, au mbunifu...',
                  'Search videos by caption, sound, or creator...'
                )}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-1 shrink-0">
              {(
                [
                  { id: 'all', label: tr('Zote', 'All') },
                  { id: 'live', label: tr('Hewani', 'Live') },
                  { id: 'blocked', label: tr('Zimefungiwa', 'Blocked') },
                ] as { id: VideoFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setVideoFilter(f.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    videoFilter === f.id
                      ? 'bg-[#0E2640] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingVideos ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {tr('Inapakia video...', 'Loading videos...')}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
              <VideoIcon className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
              {tr('Hakuna video zilizopatikana.', 'No videos found.')}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg">
              {filteredVideos.map((vid) => {
                const busy = updatingVideoId === vid.id;
                const showBlockPrompt = blockVideoPromptId === vid.id;
                const confirmingDelete = confirmDeleteVideoId === vid.id;
                const violatedRule = vid.moderationRuleNumber
                  ? findCommunityRule(vid.moderationRuleNumber)
                  : null;
                const thumbSrc = vid.thumbnailUrl || vid.photoUrls?.[0] || '';

                return (
                  <div
                    key={vid.id}
                    className={`p-4 sm:px-5 ${vid.isArchived ? 'bg-red-50/35' : ''}`}
                  >
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-white/40">
                              <VideoIcon className="h-5 w-5" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-slate-900">{vid.authorName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500">{formatTime(vid.createdAt)}</span>
                            <span aria-hidden="true">·</span>
                            {vid.isArchived ? (
                              <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                                <EyeOff className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Imefungiwa', 'Blocked')}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                {tr('Hewani', 'Live')}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-bold text-slate-900 line-clamp-1">
                            {vid.caption.trim() ||
                              vid.soundName ||
                              tr('Video ya mwanachama', 'Member video')}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {tr('Penda', 'Likes')} {vid.likesCount} · {tr('Maoni', 'Comments')}{' '}
                            {vid.commentsCount} · {tr('Shiriki', 'Shares')} {vid.sharesCount}
                          </p>
                          {vid.isArchived && (violatedRule || vid.moderationReason) && (
                            <p className="text-xs font-semibold text-red-800">
                              {violatedRule && (
                                <>
                                  {tr(`Kanuni #${violatedRule.number}`, `Rule #${violatedRule.number}`)}:{' '}
                                  {tr(violatedRule.titleSw, violatedRule.titleEn)}
                                  {vid.moderationReason ? ' — ' : ''}
                                </>
                              )}
                              {vid.moderationReason}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onOpenVideo && (
                          <button
                            type="button"
                            onClick={() => onOpenVideo(vid.id)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Tazama', 'Watch')}</span>
                          </button>
                        )}

                        {vid.isArchived ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleModerateVideo(vid, { isArchived: false })
                            }
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Rejesha Hewani', 'Restore Video')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setBlockVideoPromptId(showBlockPrompt ? null : vid.id);
                              setBlockVideoRuleNum(1);
                              setBlockVideoReasonDraft('');
                            }}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                          >
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Fungia Video', 'Block Video')}</span>
                          </button>
                        )}

                        {confirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handlePermanentDeleteVideo(vid.id)}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Futa Kabisa', 'Confirm Delete')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteVideoId(null)}
                              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              {tr('Ghairi', 'Cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDeleteVideoId(vid.id)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Futa', 'Delete')}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {showBlockPrompt && !vid.isArchived && (
                      <div className="mt-3 space-y-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-950">
                          {tr(
                            `Chagua Kanuni iliyokiukwa na video ya ${vid.authorName}. Mwandishi atapokea taarifa kwenye akaunti yake:`,
                            `Select the violated rule for ${vid.authorName}'s video. The creator will receive an in-account notice:`
                          )}
                        </p>
                        <select
                          value={blockVideoRuleNum}
                          onChange={(e) => setBlockVideoRuleNum(Number(e.target.value))}
                          className="min-h-[38px] w-full rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
                        >
                          {COMMUNITY_SAFETY_RULES.map((rule) => (
                            <option key={rule.number} value={rule.number}>
                              #{rule.number} · {tr(rule.titleSw, rule.titleEn)}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            maxLength={250}
                            value={blockVideoReasonDraft}
                            onChange={(e) => setBlockVideoReasonDraft(e.target.value)}
                            placeholder={tr(
                              'Maelezo ya ziada kwa mwandishi (hiari)...',
                              'Extra explanation for creator (optional)...'
                            )}
                            className="min-h-[38px] flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleModerateVideo(vid, {
                                  isArchived: true,
                                  ruleNumber: blockVideoRuleNum,
                                  reason: blockVideoReasonDraft,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                            >
                              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Thibitisha Kufungia', 'Confirm Block')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setBlockVideoPromptId(null);
                                setBlockVideoReasonDraft('');
                              }}
                              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {tr('Ghairi', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-600">
          {tr('Hakuna ripoti yoyote iliyotumwa kwa sasa.', 'No safety reports submitted yet.')}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {reports.map((report) => {
            const isVideoReport = report.targetType === 'video';
            const reportedVideo = isVideoReport ? videoById.get(report.topicId) : undefined;
            const topicStatus = topicStatusById.get(report.topicId);
            const alreadyArchived = isVideoReport
              ? Boolean(reportedVideo?.isArchived)
              : topicStatus === 'archived';
            const busyTopic = updatingTopicId === report.topicId;
            const reportedRule = report.ruleNumber ? findCommunityRule(report.ruleNumber) : null;

            return (
              <div
                key={report.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-semibold text-slate-900">
                      {getReportReasonLabel(report.reason)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-600">
                      {report.targetType === 'video'
                        ? tr('Video', 'Video')
                        : report.targetType === 'topic'
                          ? tr('Mada', 'Post')
                          : tr('Jibu', 'Comment')}
                    </span>
                    {reportedRule && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800">
                          {tr(`Kanuni #${reportedRule.number}`, `Rule #${reportedRule.number}`)}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500">{formatTime(report.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-medium ${
                        report.status === 'pending'
                          ? 'text-amber-800'
                          : report.status === 'reviewed'
                            ? 'text-emerald-800'
                            : 'text-slate-500'
                      }`}
                    >
                      {report.status === 'pending'
                        ? tr('Inasubiri', 'Pending')
                        : report.status === 'reviewed'
                          ? tr('Imekaguliwa', 'Reviewed')
                          : tr('Imepuuzwa', 'Dismissed')}
                    </span>
                    {alreadyArchived && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                        {isVideoReport
                          ? tr('Video Imefungiwa', 'Video Blocked')
                          : tr('Chapisho Limeondolewa', 'Post Removed')}
                      </span>
                    )}
                  </div>

                  {report.details && <p className="text-sm text-slate-700">{report.details}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isVideoReport ? (
                    onOpenVideo && (
                      <button
                        type="button"
                        onClick={() => onOpenVideo(report.topicId)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Tazama Video', 'Open Video')}</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenTopic(report.topicId)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Fungua Mada', 'Open Post')}</span>
                    </button>
                  )}

                  {!alreadyArchived && (isVideoReport ? Boolean(reportedVideo) : Boolean(topicStatus)) && (
                    <button
                      type="button"
                      disabled={busyTopic}
                      onClick={() => void handleCloseReportedPost(report)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {isVideoReport
                          ? tr('Fungia Video', 'Block Video')
                          : tr('Ondoa Chapisho', 'Remove Post')}
                      </span>
                    </button>
                  )}

                  {report.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(report.id, 'reviewed')}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Kamilisha', 'Resolve')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(report.id, 'dismissed')}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Puuza', 'Dismiss')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

