import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Search, ShieldCheck, Users, XCircle } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { updateUserVerificationBadge } from '../services/forumService';
import {
  Report,
  UserProfile,
  VERIFICATION_BADGE_META,
  VERIFICATION_BADGE_TIERS,
  VerificationBadgeType,
  normalizeVerificationBadge,
} from '../types';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface ModerationViewProps {
  reports: Report[];
  currentUserUid: string | null;
  onUpdateStatus: (reportId: string, status: 'reviewed' | 'dismissed') => Promise<void>;
  onOpenTopic: (topicId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  embedded?: boolean;
}

export const ModerationView: React.FC<ModerationViewProps> = ({
  reports,
  currentUserUid,
  onUpdateStatus,
  onOpenTopic,
  onToast,
  embedded = false,
}) => {
  const { tr, formatTime, getReportReasonLabel, getBadgeLabel, getBadgeDescription } =
    useLanguage();
  const [section, setSection] = useState<'badges' | 'reports'>('badges');
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberSearch, setMemberSearch] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

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

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.bio.toLowerCase().includes(q) ||
        VERIFICATION_BADGE_META[m.verificationBadge].label.toLowerCase().includes(q) ||
        getBadgeLabel(m.verificationBadge).toLowerCase().includes(q)
    );
  }, [members, memberSearch, getBadgeLabel]);

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

  return (
    <div
      className={
        embedded
          ? 'rounded-xl border border-slate-200 bg-white p-5 sm:p-6'
          : 'mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8'
      }
    >
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          {embedded ? (
            <h2 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
              {tr('Kipengele cha Msimamizi', 'Admin Controls')}
            </h2>
          ) : (
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              {tr('Jopo la Usimamizi wa Malosha Forums', 'Malosha Forums Admin Panel')}
            </h1>
          )}
          <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {tr(
              'Thibitisha akaunti kwa beji za rangi (Serikali, Mashirika, Watu Binafsi, Mmiliki) na kagua ripoti za usalama.',
              'Verify accounts with colored badges (Government, Organizations, Individuals, Owner) and review safety reports.'
            )}
          </p>
        </div>

        {/* Section Switcher */}
        <div
          role="group"
          aria-label={tr('Sehemu za usimamizi', 'Admin sections')}
          className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shrink-0"
        >
          <button
            type="button"
            onClick={() => setSection('badges')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'badges'
                ? 'bg-[#1D4E89] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {tr('Beji za Akaunti', 'Account Badges')} ({members.length})
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
            <span>
              {tr('Ripoti', 'Reports')} ({pendingCount})
            </span>
          </button>
        </div>
      </div>

      {section === 'badges' ? (
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

          {/* Member Search */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={tr(
                'Tafuta akaunti ya mwanachama, shirika, au taasisi...',
                'Search member, organization, or institution account...'
              )}
              aria-label={tr('Tafuta akaunti', 'Search accounts')}
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
            />
          </div>

          {/* Members List */}
          {loadingMembers ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {tr('Inapakia orodha ya akaunti...', 'Loading accounts...')}
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

                return (
                  <div
                    key={member.uid}
                    className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={member.displayName} photoURL={member.photoURL} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {member.displayName}
                          </span>
                          <VerificationBadge badge={member.verificationBadge} size="sm" />
                          {isSelf && (
                            <span className="text-[11px] font-medium text-slate-500">
                              ({tr('Wewe', 'You')})
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          <span className={`font-medium ${badgeMeta.textClass}`}>
                            {getBadgeLabel(member.verificationBadge)}
                          </span>{' '}
                          · {tr('Mada', 'Posts')} {member.topicsCount} ·{' '}
                          {tr('Majibu', 'Replies')} {member.repliesCount}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
          {reports.map((report) => (
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
          ))}
        </div>
      )}
    </div>
  );
};
