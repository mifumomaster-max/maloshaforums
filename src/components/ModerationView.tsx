import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  ExternalLink,
  EyeOff,
  FileText,
  Lock,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  deleteTopic,
  getAdminUserPrivateDetails,
  updateTopicStatus,
  updateUserAccountStatus,
  updateUserVerificationBadge,
} from '../services/forumService';
import {
  AccountStatus,
  Report,
  Topic,
  UserProfile,
  VERIFICATION_BADGE_META,
  VERIFICATION_BADGE_TIERS,
  VerificationBadgeType,
  computeMemberControlSerial,
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
  onToast: (message: string, kind?: 'success' | 'error') => void;
  embedded?: boolean;
}

type AdminSection = 'members' | 'verify_id' | 'posts' | 'reports';
type MemberFilter = 'all' | 'active' | 'suspended';
type PostFilter = 'all' | 'open' | 'locked' | 'archived';

export const ModerationView: React.FC<ModerationViewProps> = ({
  reports,
  currentUserUid,
  onUpdateStatus,
  onOpenTopic,
  onToast,
  embedded = false,
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
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [lockPromptUid, setLockPromptUid] = useState<string | null>(null);
  const [lockReasonDraft, setLockReasonDraft] = useState('');

  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<PostFilter>('all');
  const [updatingTopicId, setUpdatingTopicId] = useState<string | null>(null);
  const [confirmDeleteTopicId, setConfirmDeleteTopicId] = useState<string | null>(null);

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
            topicsCount: Number(data.topicsCount || 0),
            repliesCount: Number(data.repliesCount || 0),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        list.sort((a, b) => {
          const rank = (badge: VerificationBadgeType) =>
            badge === 'owner'
              ? 0
              : badge === 'government'
                ? 1
                : badge === 'organization'
                  ? 2
                  : badge === 'individual'
                    ? 3
                    : 4;
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
    return members.filter((m) => {
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
  }, [members, memberSearch, memberFilter, privateDetails, getBadgeLabel]);

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

  const handleSuspendAccount = async (member: UserProfile, reason: string) => {
    setUpdatingUid(member.uid);
    const effectiveReason =
      reason.trim() ||
      tr('Ukiukaji wa maadili ya jukwaa.', 'Violation of community guidelines.');
    try {
      await updateUserAccountStatus(member.uid, 'suspended', effectiveReason);
      setLockPromptUid(null);
      setLockReasonDraft('');
      onToast(
        tr(
          `Akaunti ya ${member.displayName} imefungwa. Hataweza kufanya chochote kwenye jukwaa.`,
          `${member.displayName}'s account has been closed. All platform actions are blocked.`
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
      await deleteTopic(topicId);
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

  const handleCloseReportedPost = async (report: Report) => {
    setUpdatingTopicId(report.topicId);
    try {
      await updateTopicStatus(report.topicId, 'archived');
      if (report.status === 'pending') {
        await onUpdateStatus(report.id, 'reviewed');
      }
      onToast(
        tr(
          'Chapisho lililoripotiwa limefungwa na kuondolewa kwa watumiaji wengine.',
          'Reported post closed and removed from public view.'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kufunga chapisho.', 'Failed to close post.'),
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

      {section === 'verify_id' ? (
        <div className="mt-6">
          <MemberIdVerifier />
        </div>
      ) : section === 'members' ? (
        <div className="mt-6 space-y-5">
          {/* Verification Color Legend */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['owner', 'government', 'organization', 'individual'] as VerificationBadgeType[]).map(
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
              className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shrink-0"
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

                          {isSuspended && member.suspendedReason && (
                            <p className="text-xs font-medium text-red-800">
                              {tr('Sababu ya kufungwa', 'Closure reason')}:{' '}
                              {member.suspendedReason}
                            </p>
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

                    {/* Inline Lock Confirmation Box */}
                    {showLockPrompt && !isSuspended && !isSelf && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-xs font-semibold text-red-900">
                          {tr(
                            `Funga akaunti ya ${member.displayName}? Hatoweza kupost, ku-comment, wala ku-like.`,
                            `Close ${member.displayName}'s account? They will be blocked from posting, commenting, and liking.`
                          )}
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            maxLength={250}
                            value={lockReasonDraft}
                            onChange={(e) => setLockReasonDraft(e.target.value)}
                            placeholder={tr(
                              'Sababu ya kufunga (hiari): Mf. Ukiukaji wa maadili...',
                              'Reason for closing (optional): e.g. Policy violation...'
                            )}
                            className="min-h-[38px] flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleSuspendAccount(member, lockReasonDraft)}
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
      ) : reports.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-600">
          {tr('Hakuna ripoti yoyote iliyotumwa kwa sasa.', 'No safety reports submitted yet.')}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {reports.map((report) => {
            const topicStatus = topicStatusById.get(report.topicId);
            const alreadyArchived = topicStatus === 'archived';
            const busyTopic = updatingTopicId === report.topicId;

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
                      {report.targetType === 'topic' ? tr('Mada', 'Post') : tr('Jibu', 'Comment')}
                    </span>
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
                        {tr('Chapisho Limeondolewa', 'Post Removed')}
                      </span>
                    )}
                  </div>

                  {report.details && <p className="text-sm text-slate-700">{report.details}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenTopic(report.topicId)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Fungua Mada', 'Open Post')}</span>
                  </button>

                  {!alreadyArchived && topicStatus && (
                    <button
                      type="button"
                      disabled={busyTopic}
                      onClick={() => void handleCloseReportedPost(report)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Ondoa Chapisho', 'Remove Post')}</span>
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

