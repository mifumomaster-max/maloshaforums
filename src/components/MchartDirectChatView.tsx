import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  BookOpen,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Forward,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  MessageCirclePlus,
  Paperclip,
  Pin,
  Reply as ReplyIcon,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ChatAttachmentUploadResult,
  downloadChatAttachmentFile,
  optimizeCloudinaryUrl,
  uploadChatFileToCloudinary,
} from '../services/cloudinaryService';
import {
  DEFAULT_MCHART_GROUP_SETTINGS,
  editDirectMessage,
  ensureDirectChatThread,
  generateDirectMessageId,
  lookupMemberProfileByIdOrCard,
  markDirectChatRead,
  markDirectViewOnceConsumed,
  sendChatMessage,
  sendDirectMessage,
  softDeleteDirectMessage,
  toggleDirectMessageReaction,
} from '../services/forumService';
import {
  AuthPromptReason,
  ChatMessage,
  DirectChatMessage,
  DirectChatThread,
  MchartGroupReadCursor,
  MchartGroupSettings,
  MchartStatus,
  MemberDirectoryCandidate,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useUserPresence } from '../context/UserPresenceContext';
import { AuthorName, Avatar, OnlineStatusPill } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { MchartStatusTab } from './MchartStatusView';
import { EditMessageModal, ForwardMessageModal, MessageInfoModal } from './MchartMessageModals';
import { MobilePdfNoteReader } from './MobilePdfNoteReader';
import { LinkedText } from './RichText';
import { AuthorVerificationBadge } from './VerificationBadge';
import { VoiceNoteBubble, VoiceRecorderBar, formatAudioSeconds } from './VoiceNoteControls';

type OptimisticDmMessage = DirectChatMessage & { __localMs: number };

const QUICK_EMOJIS = [
  '😀',
  '😂',
  '❤️',
  '👍',
  '🙏',
  '🔥',
  '👏',
  '🎉',
  '🤝',
  '💡',
  '📌',
  '✅',
  '📷',
  '📄',
  '🇹🇿',
  '🚀',
];

function formatClockTime(ts: Timestamp | null): string {
  if (!ts) return '';
  const date = ts.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateKey(ts: Timestamp | null): string {
  const date = ts ? ts.toDate() : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function getDocBadgeInfo(fileName: string, mime: string): {
  ext: string;
  bgClass: string;
} {
  const ext = (fileName.split('.').pop() || '').toUpperCase().slice(0, 4);
  if (ext === 'PDF' || mime.includes('pdf')) {
    return { ext: 'PDF', bgClass: 'bg-red-600 text-white' };
  }
  if (ext === 'XLS' || ext === 'XLSX' || ext === 'CSV' || mime.includes('sheet') || mime.includes('excel')) {
    return { ext: ext || 'XLS', bgClass: 'bg-emerald-600 text-white' };
  }
  if (ext === 'PPT' || ext === 'PPTX' || mime.includes('presentation')) {
    return { ext: ext || 'PPT', bgClass: 'bg-amber-600 text-white' };
  }
  if (ext === 'ZIP' || mime.includes('zip')) {
    return { ext: 'ZIP', bgClass: 'bg-purple-600 text-white' };
  }
  return { ext: ext || 'DOC', bgClass: 'bg-[#1D4E89] text-white' };
}

export function getPartnerFromThread(
  thread: DirectChatThread,
  selfUid: string
): {
  uid: string;
  name: string;
  photo: string;
  unreadCount: number;
} {
  const selfIsA = selfUid === thread.participantA;
  return {
    uid: selfIsA ? thread.participantB : thread.participantA,
    name: selfIsA ? thread.participantBName : thread.participantAName,
    photo: selfIsA ? thread.participantBPhoto : thread.participantAPhoto,
    unreadCount: selfIsA ? thread.unreadCountA : thread.unreadCountB,
  };
}

const REACTION_CHOICES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MchartDirectInboxProps {
  user: User | null;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  threads: DirectChatThread[];
  statuses: MchartStatus[];
  loadingStatuses: boolean;
  memberCandidates: MemberDirectoryCandidate[];
  groupSettings?: MchartGroupSettings;
  latestGroupMessage?: ChatMessage | null;
  groupReadCursors?: MchartGroupReadCursor[];
  groupUnreadCount?: number;
  groupTypingLabel?: string;
  isKickedFromGroup?: boolean;
  onOpenGroupChat?: () => void;
  onSelectThread: (thread: DirectChatThread) => void;
  onStartPrivateChatWith: (
    target: {
      uid: string;
      displayName: string;
      photoURL?: string;
    },
    initialMessage?: string
  ) => Promise<void>;
  onSwitchToGroup: () => void;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(clean);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = clean;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const MchartDirectInbox: React.FC<MchartDirectInboxProps> = ({
  user,
  userDisplayName,
  userPhoto,
  isSuspended = false,
  threads,
  statuses,
  loadingStatuses,
  memberCandidates,
  groupSettings = DEFAULT_MCHART_GROUP_SETTINGS,
  latestGroupMessage = null,
  groupReadCursors = [],
  groupUnreadCount = 0,
  groupTypingLabel = '',
  isKickedFromGroup = false,
  onOpenGroupChat,
  onSelectThread,
  onStartPrivateChatWith,
  onSwitchToGroup,
  onSignIn,
  onToast,
}) => {
  const { tr, formatTime } = useLanguage();
  const openGroupHandler = onOpenGroupChat || onSwitchToGroup;
  const { isUserOnline, getDirectPartnerTyping } = useUserPresence();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [startingUid, setStartingUid] = useState<string | null>(null);
  const [statusFullscreen, setStatusFullscreen] = useState(false);

  const sortedThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...threads].sort((a, b) => {
      const am = a.lastMessageAt ? a.lastMessageAt.toMillis() : 0;
      const bm = b.lastMessageAt ? b.lastMessageAt.toMillis() : 0;
      return bm - am;
    });
    if (!q || !user) return list;
    return list.filter((t) => {
      const partner = getPartnerFromThread(t, user.uid);
      return (
        partner.name.toLowerCase().includes(q) ||
        t.lastMessageText.toLowerCase().includes(q)
      );
    });
  }, [threads, search, user]);

  const existingPartnerUids = useMemo(() => {
    const set = new Set<string>();
    if (!user) return set;
    threads.forEach((t) => {
      const partner = getPartnerFromThread(t, user.uid);
      set.add(partner.uid);
    });
    return set;
  }, [threads, user]);

  const allMembersAZ = useMemo(() => {
    return memberCandidates
      .filter((m) => !user || m.uid !== user.uid)
      .slice()
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      );
  }, [memberCandidates, user]);

  const directoryMatchesAZ = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allMembersAZ;
    return allMembersAZ.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [allMembersAZ, search]);

  const groupedDirectoryAZ = useMemo(() => {
    const groups: { letter: string; members: MemberDirectoryCandidate[] }[] = [];
    const byLetter = new Map<string, MemberDirectoryCandidate[]>();
    directoryMatchesAZ.forEach((m) => {
      const first = (m.displayName.trim().charAt(0) || '#').toUpperCase();
      const letter = /^[A-Z]$/.test(first) ? first : '#';
      const arr = byLetter.get(letter);
      if (arr) arr.push(m);
      else byLetter.set(letter, [m]);
    });
    const keys = Array.from(byLetter.keys()).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
    keys.forEach((letter) => {
      const members = byLetter.get(letter) || [];
      groups.push({ letter, members });
    });
    return groups;
  }, [directoryMatchesAZ]);

  const filteredCandidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return allMembersAZ;
    return allMembersAZ.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [allMembersAZ, memberSearch]);

  const handleDirectLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = memberSearch.trim();
    if (!q) return;
    setLookingUp(true);
    try {
      const found = await lookupMemberProfileByIdOrCard(q);
      if (!found) {
        onToast(
          tr(
            'Hakuna mwanachama aliyepatikana kwa namba hiyo ya MLF au kitambulisho.',
            'No member found matching that MLF card ID or user ID.'
          ),
          'error'
        );
        return;
      }
      if (user && found.uid === user.uid) {
        onToast(tr('Hiki ni kitambulisho chako mwenyewe.', 'That is your own account ID.'), 'error');
        return;
      }
      setStartingUid(found.uid);
      await onStartPrivateChatWith(found);
      setPickerOpen(false);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kuanza mazungumzo.', 'Could not start chat.'),
        'error'
      );
    } finally {
      setLookingUp(false);
      setStartingUid(null);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F4F7FA] p-5">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-xs">
          <Lock className="mx-auto h-9 w-9 text-[#075E54]" aria-hidden="true" />
          <h3 className="mt-3 text-base font-bold text-slate-900">
            {tr('Mazungumzo Binafsi ya Siri (DM)', 'Private 1-on-1 Chats')}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            {tr(
              'Ingia kwenye akaunti yako ili uweze kuchart moja kwa moja na mwanachama mmoja kwa faragha kamili baina yenu wawili pekee.',
              'Sign in to message individual members privately with strict two-participant privacy.'
            )}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onSignIn('chat')}
              className="min-h-[42px] rounded-xl bg-[#075E54] px-4 py-2 text-xs font-bold text-white hover:bg-[#064E46]"
            >
              {tr('Ingia Kuanza Kuchart Binafsi', 'Sign In to Start Private Chat')}
            </button>
            <button
              type="button"
              onClick={openGroupHandler}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tr('Rudi Kwenye Kundi Kuu', 'Back to Group Chat')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 bg-[#F4F7FA]">
      <div
        className={`h-full px-3 py-3.5 sm:px-5 sm:py-4 ${
          statusFullscreen ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <div className="mx-auto max-w-3xl space-y-3">
          {/* Privacy Guarantee */}
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-[#064E46]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00A884]" aria-hidden="true" />
            <p className="leading-relaxed">
              {tr(
                'Faragha Imelindwa: Mazungumzo binafsi yanasomwa na nyinyi wawili pekee (mtumaji na mpokeaji). Hakuna mtu wa tatu wala msimamizi anayeweza kuyafikia.',
                'Privacy Protected: Private 1-on-1 chats are readable strictly by the two participants only.'
              )}
            </p>
          </div>

          {/* Embedded Status Strip inside Private Chat */}
          <MchartStatusTab
            embedded
            statuses={statuses}
            loading={loadingStatuses}
            user={user}
            userDisplayName={userDisplayName}
            userPhoto={userPhoto}
            isSuspended={isSuspended}
            memberCandidates={memberCandidates}
            onStartPrivateChatWith={onStartPrivateChatWith}
            onSignIn={onSignIn}
            onToast={onToast}
            onFullscreenActiveChange={setStatusFullscreen}
          />

        {/* Search + New Private Chat Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('Tafuta mazungumzo au jina...', 'Search conversations...')}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#075E54] focus:outline-none sm:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((prev) => !prev)}
            className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#075E54] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#064E46]"
          >
            <MessageCirclePlus className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
            <span>
              {pickerOpen
                ? tr('Funga Orodha', 'Close Picker')
                : tr('Anza Chat na Mtu', 'New Private Chat')}
            </span>
          </button>
        </div>

        {/* Member Picker Drawer */}
        {pickerOpen && (
          <section className="overflow-hidden rounded-2xl border border-[#BFD7F2] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#075E54]">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>{tr('Chagua Mwanachama wa Kuchart Naye', 'Select Member to Message')}</span>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label={tr('Funga', 'Close')}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDirectLookup} className="flex gap-2 border-b border-slate-100 p-3">
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={tr(
                  'Tafuta jina au weka namba ya MLF (mf. MLF-AB12CD34)...',
                  'Search name or enter MLF card number...'
                )}
                className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900 focus:border-[#075E54] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={lookingUp || !memberSearch.trim()}
                className="min-h-[38px] shrink-0 rounded-xl bg-[#00A884] px-3.5 text-xs font-bold text-white hover:bg-[#008F6F] disabled:opacity-50"
              >
                {lookingUp ? tr('Inatafuta...', 'Finding...') : tr('Tafuta ID', 'Lookup ID')}
              </button>
            </form>

            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {filteredCandidates.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  {tr(
                    'Hakuna mwanachama aliyepatikana kwa jina hilo. Unaweza kuandika namba yake ya MLF hapo juu.',
                    'No matching active members found. You can look up a member by their MLF card ID above.'
                  )}
                </p>
              ) : (
                filteredCandidates.map((m) => {
                  const online = isUserOnline(m.uid);
                  const alreadyChatted = existingPartnerUids.has(m.uid);
                  const busy = startingUid === m.uid;
                  return (
                    <button
                      key={m.uid}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStartingUid(m.uid);
                        void onStartPrivateChatWith(m).finally(() => {
                          setStartingUid(null);
                          setPickerOpen(false);
                        });
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-emerald-50/50 disabled:opacity-60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar
                          name={m.displayName}
                          photoURL={m.photoURL}
                          uid={m.uid}
                          showOnlineIndicator
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-900">
                              <AuthorName uid={m.uid} fallback={m.displayName} />
                            </span>
                            <AuthorVerificationBadge uid={m.uid} size="xs" />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {online
                              ? tr('Mtandaoni sasa', 'Online now')
                              : alreadyChatted
                                ? tr('Mna mazungumzo tayari', 'Existing chat')
                                : tr('Mwanachama wa Malosha', 'Malosha member')}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-lg bg-[#075E54]/10 px-2.5 py-1 text-[11px] font-bold text-[#075E54]">
                        {busy ? '...' : tr('Chati', 'Message')}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Unified WhatsApp Chats List (Group pinned #1 + 1-on-1 DMs) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {tr('Mazungumzo (Chats)', 'Chats')} ({sortedThreads.length + 1})
            </h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#075E54]">
              <Pin className="h-3 w-3 text-[#00A884]" aria-hidden="true" />
              {tr('Kundi lipo juu', 'Group pinned')}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* #1 PINNED COMMUNITY GROUP CHAT ROW */}
            {(() => {
              const q = search.trim().toLowerCase();
              const latestText = latestGroupMessage
                ? latestGroupMessage.isDeleted
                  ? tr('Ujumbe ulifutwa', 'Message deleted')
                  : latestGroupMessage.text.trim() ||
                    (latestGroupMessage.attachmentType === 'audio'
                      ? `🎤 ${tr('Ujumbe wa sauti', 'Voice note')}`
                      : latestGroupMessage.attachmentType === 'image'
                        ? `📷 ${tr('Picha', 'Photo')}`
                        : `📄 ${latestGroupMessage.attachmentName || tr('Nyaraka', 'Document')}`)
                : tr('Gusa hapa kufungua kundi kuu la gumzo', 'Tap to open community group chat');
              const matchesSearch =
                !q ||
                groupSettings.groupName.toLowerCase().includes(q) ||
                latestText.toLowerCase().includes(q);
              if (!matchesSearch) return null;

              const isOwnLatestGroup = Boolean(
                latestGroupMessage && user && latestGroupMessage.senderId === user.uid && !latestGroupMessage.isDeleted
              );
              const latestGroupMs = latestGroupMessage?.createdAt ? latestGroupMessage.createdAt.toMillis() : 0;
              const groupMsgWasReadBySomeone = Boolean(
                isOwnLatestGroup &&
                  latestGroupMs > 0 &&
                  groupReadCursors.some(
                    (r) => r.uid !== user.uid && r.lastReadAt && r.lastReadAt.toMillis() >= latestGroupMs
                  )
              );

              return (
                <button
                  type="button"
                  onClick={openGroupHandler}
                  className="flex w-full items-center gap-3 bg-emerald-50/45 px-4 py-3 text-left transition-colors hover:bg-emerald-50"
                >
                  <div className="relative h-11 w-11 shrink-0">
                    {groupSettings.groupPhotoUrl ? (
                      <img
                        src={groupSettings.groupPhotoUrl}
                        alt={groupSettings.groupName}
                        referrerPolicy="no-referrer"
                        className="h-11 w-11 rounded-full border border-[#00A884]/40 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#075E54] text-white shadow-xs">
                        <Users className="h-5 w-5 text-[#25D366]" aria-hidden="true" />
                      </div>
                    )}
                    <span
                      title={tr('Imebandikwa juu', 'Pinned at top')}
                      className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#00A884] text-white ring-2 ring-white"
                    >
                      <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-slate-900">
                          {groupSettings.groupName}
                        </span>
                        {groupSettings.isLocked && (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                        )}
                        {groupSettings.disappearAfterSeconds > 0 && (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-[#00A884]" aria-hidden="true" />
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                        {latestGroupMessage?.createdAt ? formatTime(latestGroupMessage.createdAt) : ''}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {isKickedFromGroup ? (
                        <p className="truncate text-xs font-semibold text-red-600">
                          {tr('Umeondolewa kwenye kundi na msimamizi', 'Removed from group')}
                        </p>
                      ) : groupTypingLabel ? (
                        <p className="truncate text-xs font-bold italic text-[#00A884]">
                          {groupTypingLabel}
                        </p>
                      ) : (
                        <p className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-600">
                          {isOwnLatestGroup &&
                            (groupMsgWasReadBySomeone ? (
                              <CheckCheck className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
                            ) : (
                              <CheckCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                            ))}
                          <span className="truncate">
                            {latestGroupMessage ? (
                              <>
                                <span className="font-semibold text-[#075E54]">
                                  {latestGroupMessage.senderId === user.uid
                                    ? tr('Wewe: ', 'You: ')
                                    : `${latestGroupMessage.senderName}: `}
                                </span>
                                {latestText}
                              </>
                            ) : (
                              latestText
                            )}
                          </span>
                        </p>
                      )}
                      {groupUnreadCount > 0 && !isKickedFromGroup && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-extrabold text-[#064E46] tabular-nums">
                          {groupUnreadCount > 99 ? '99+' : groupUnreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })()}

            {/* 1-on-1 DM THREADS BELOW PINNED GROUP */}
            {sortedThreads.length === 0 ? (
              <div className="px-5 py-7 text-center">
                <Lock className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-xs font-bold text-slate-700">
                  {tr(
                    'Bado huna mazungumzo binafsi (DM) na mtu mmoja.',
                    'No private 1-on-1 conversations yet.'
                  )}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] text-slate-500">
                  {tr(
                    'Bonyeza "Anza Chat na Mtu" hapo juu au gusa jina la mwanachama hapa chini.',
                    'Tap "New Private Chat" above or tap any member below to message.'
                  )}
                </p>
              </div>
            ) : (
              sortedThreads.map((thread) => {
                const partner = getPartnerFromThread(thread, user.uid);
                const partnerTyping = getDirectPartnerTyping(partner.uid, thread.chatId);
                const isOwnLast = thread.lastSenderId === user.uid;
                const partnerReadAt =
                  user.uid === thread.participantA ? thread.lastReadAtB : thread.lastReadAtA;
                const lastMsgMs = thread.lastMessageAt ? thread.lastMessageAt.toMillis() : 0;
                const partnerReadLast = Boolean(
                  isOwnLast &&
                    partnerReadAt &&
                    lastMsgMs > 0 &&
                    partnerReadAt.toMillis() >= lastMsgMs
                );

                return (
                  <button
                    key={thread.chatId}
                    type="button"
                    onClick={() => onSelectThread(thread)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <Avatar
                      name={partner.name}
                      photoURL={partner.photo}
                      uid={partner.uid}
                      showOnlineIndicator
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-slate-900">
                            <AuthorName uid={partner.uid} fallback={partner.name} />
                          </span>
                          <AuthorVerificationBadge uid={partner.uid} size="xs" />
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                          {thread.lastMessageAt ? formatTime(thread.lastMessageAt) : ''}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        {partnerTyping ? (
                          <p className="truncate text-xs font-bold italic text-[#00A884]">
                            {tr('anaandika...', 'typing...')}
                          </p>
                        ) : (
                          <p className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-600">
                            {isOwnLast &&
                              (partnerReadLast ? (
                                <CheckCheck
                                  className="h-3.5 w-3.5 shrink-0 text-[#0284C7]"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CheckCheck
                                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                                  aria-hidden="true"
                                />
                              ))}
                            <span className="truncate">
                              {isOwnLast ? (
                                <span className="font-semibold text-[#075E54]">
                                  {tr('Wewe: ', 'You: ')}
                                </span>
                              ) : null}
                              {thread.lastMessageText ||
                                tr('Anza kuandika ujumbe wenu wa kwanza...', 'Start your conversation...')}
                            </span>
                          </p>
                        )}
                        {partner.unreadCount > 0 && (
                          <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-extrabold text-[#064E46] tabular-nums">
                            {partner.unreadCount > 99 ? '99+' : partner.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Full WhatsApp-Style A-Z Member Contacts Directory */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {search.trim()
                  ? tr('Wanachama Waliopatikana (A–Z)', 'Matching Members (A–Z)')
                  : tr('Wanachama Wote Jukwaani (A–Z)', 'All Platform Members (A–Z)')}{' '}
                ({directoryMatchesAZ.length})
              </h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {tr('Gusa jina kuanza DM', 'Tap name to message')}
            </span>
          </div>

          {groupedDirectoryAZ.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">
              {search.trim()
                ? tr(
                    `Hakuna mwanachama aliyepatikana kwa jina "${search.trim()}".`,
                    `No member found matching "${search.trim()}".`
                  )
                : tr(
                    'Orodha ya wanachama inapakia...',
                    'Loading platform members...'
                  )}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {groupedDirectoryAZ.map((group) => (
                <div key={group.letter}>
                  <div className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50/95 px-4 py-1 text-[11px] font-extrabold tracking-wider text-[#075E54] backdrop-blur-xs">
                    {group.letter}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.members.map((m) => {
                      const online = isUserOnline(m.uid);
                      const alreadyChatted = existingPartnerUids.has(m.uid);
                      const busy = startingUid === m.uid;
                      return (
                        <button
                          key={m.uid}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setStartingUid(m.uid);
                            void onStartPrivateChatWith(m).finally(() => {
                              setStartingUid(null);
                            });
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-emerald-50/40 disabled:opacity-60"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar
                              name={m.displayName}
                              photoURL={m.photoURL}
                              uid={m.uid}
                              showOnlineIndicator
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-bold text-slate-900">
                                  {m.displayName}
                                </span>
                                <AuthorVerificationBadge uid={m.uid} size="xs" />
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {online
                                  ? tr('Mtandaoni sasa', 'Online now')
                                  : alreadyChatted
                                    ? tr('Mna mazungumzo ya siri tayari', 'Existing private chat')
                                    : tr('Mwanachama wa Malosha', 'Malosha member')}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#075E54] ring-1 ring-emerald-200/80">
                            {busy ? '...' : tr('Chati', 'Chat')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
};

interface MchartDirectRoomProps {
  thread: DirectChatThread;
  user: User;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  memberCandidates?: MemberDirectoryCandidate[];
  groupSettings?: MchartGroupSettings;
  canSendToGroup?: boolean;
  onBackToInbox: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

export const MchartDirectRoom: React.FC<MchartDirectRoomProps> = ({
  thread,
  user,
  userDisplayName,
  userPhoto,
  isSuspended = false,
  memberCandidates = [],
  groupSettings = DEFAULT_MCHART_GROUP_SETTINGS,
  canSendToGroup = true,
  onBackToInbox,
  onToast,
}) => {
  const { lang, tr } = useLanguage();
  const { setMchartTyping, getDirectPartnerTyping } = useUserPresence();
  const partner = getPartnerFromThread(thread, user.uid);
  const isPartnerTyping = getDirectPartnerTyping(partner.uid, thread.chatId);

  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticDmMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [pendingAttachment, setPendingAttachment] =
    useState<ChatAttachmentUploadResult | null>(null);
  const [viewOnceDraft, setViewOnceDraft] = useState(false);
  const [replyTo, setReplyTo] = useState<DirectChatMessage | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionPickerForId, setReactionPickerForId] = useState<string | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<DirectChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<DirectChatMessage | null>(null);
  const [infoMsg, setInfoMsg] = useState<DirectChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [activePdfDoc, setActivePdfDoc] = useState<{ url: string; name: string } | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [viewOnceModal, setViewOnceModal] = useState<{
    url: string;
    name: string;
    text?: string;
  } | null>(null);
  const [pendingCropImage, setPendingCropImage] = useState<File | null>(null);
  const [pendingDeleteMsg, setPendingDeleteMsg] = useState<DirectChatMessage | null>(null);
  const [deletingMsg, setDeletingMsg] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unseenWhileScrolled, setUnseenWhileScrolled] = useState(0);

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const autoViewOnceRef = useRef(false);
  const typingIdleTimerRef = useRef<number | null>(null);
  const initialScrolledRef = useRef(false);
  const prevNewestIdRef = useRef<string | null>(null);
  const lastMarkedReadMsgMsRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      setMchartTyping(false, '', thread.chatId);
    };
  }, [thread.chatId, setMchartTyping]);

  // Real-time messages subscription strictly filtered to participant UID (zero composite index needed)
  useEffect(() => {
    initialScrolledRef.current = false;
    prevNewestIdRef.current = null;
    setLoading(true);

    const path = `direct_chats/${thread.chatId}/messages`;
    const q = query(
      collection(db, path),
      where('participants', 'array-contains', user.uid),
      limit(250)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: DirectChatMessage[] = snapshot.docs.map((d) => {
          const data = d.data();
          const parts: [string, string] = Array.isArray(data.participants) && data.participants.length === 2
            ? [String(data.participants[0]), String(data.participants[1])]
            : thread.participants;
          return {
            id: d.id,
            chatId: String(data.chatId || thread.chatId),
            participants: parts,
            senderId: String(data.senderId || ''),
            senderName: String(data.senderName || 'Mwanachama'),
            senderPhoto: String(data.senderPhoto || ''),
            text: String(data.text || ''),
            attachmentType:
              data.attachmentType === 'image' ||
              data.attachmentType === 'document' ||
              data.attachmentType === 'audio'
                ? data.attachmentType
                : 'none',
            attachmentUrl: String(data.attachmentUrl || ''),
            attachmentName: String(data.attachmentName || ''),
            attachmentSize: Number(data.attachmentSize || 0),
            attachmentMime: String(data.attachmentMime || ''),
            audioDurationSec: Number(data.audioDurationSec || 0),
            reactions:
              data.reactions && typeof data.reactions === 'object'
                ? (data.reactions as Record<string, string[]>)
                : undefined,
            isEdited: Boolean(data.isEdited),
            forwardedFromName:
              typeof data.forwardedFromName === 'string' ? data.forwardedFromName : '',
            viewOnce: Boolean(data.viewOnce),
            viewOnceConsumed: Boolean(data.viewOnceConsumed),
            viewOnceOpenedAt: data.viewOnceOpenedAt || null,
            replyToId: String(data.replyToId || ''),
            replyToSenderName: String(data.replyToSenderName || ''),
            replyToPreview: String(data.replyToPreview || ''),
            isDeleted: Boolean(data.isDeleted),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setMessages(list);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [thread.chatId, thread.participants, user.uid]);

  // Partner's real read cursor (only turns ticks blue when partner actually read!)
  const partnerLastReadAt =
    user.uid === thread.participantA ? thread.lastReadAtB : thread.lastReadAtA;
  const partnerLastReadMs = partnerLastReadAt ? partnerLastReadAt.toMillis() : 0;

  // Mark DM thread read when visibly open AND there is unread count or newer incoming partner msg
  useEffect(() => {
    const syncRead = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const unread = user.uid === thread.participantA ? thread.unreadCountA : thread.unreadCountB;
      const selfLastReadMs =
        (user.uid === thread.participantA ? thread.lastReadAtA : thread.lastReadAtB)?.toMillis() ?? 0;
      let latestPartnerMsgMs = 0;
      messages.forEach((m) => {
        if (m.senderId !== user.uid && m.createdAt) {
          const ms = m.createdAt.toMillis();
          if (ms > latestPartnerMsgMs) latestPartnerMsgMs = ms;
        }
      });
      const needsRead =
        unread > 0 ||
        (latestPartnerMsgMs > selfLastReadMs && latestPartnerMsgMs > lastMarkedReadMsgMsRef.current);
      if (needsRead) {
        if (latestPartnerMsgMs > 0) lastMarkedReadMsgMsRef.current = latestPartnerMsgMs;
        void markDirectChatRead(thread.chatId, user.uid, thread.participantA);
      }
    };

    syncRead();
    document.addEventListener('visibilitychange', syncRead);
    return () => document.removeEventListener('visibilitychange', syncRead);
  }, [
    thread.chatId,
    thread.participantA,
    thread.unreadCountA,
    thread.unreadCountB,
    thread.lastReadAtA,
    thread.lastReadAtB,
    messages,
    user.uid,
  ]);

  // Drop optimistic sends once echoed from Firestore
  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    const serverIds = new Set(messages.map((m) => m.id));
    if (optimisticMessages.some((om) => serverIds.has(om.id))) {
      setOptimisticMessages((prev) => prev.filter((om) => !serverIds.has(om.id)));
    }
  }, [messages, optimisticMessages]);

  const pendingIdSet = useMemo(
    () => new Set(optimisticMessages.map((om) => om.id)),
    [optimisticMessages]
  );

  const chronologicalMessages = useMemo(() => {
    const serverIds = new Set(messages.map((m) => m.id));
    const pending = optimisticMessages.filter((om) => !serverIds.has(om.id));
    const merged: (DirectChatMessage & { __localMs?: number })[] = [...messages, ...pending];
    return merged.sort((a, b) => {
      const am = a.createdAt ? a.createdAt.toMillis() : (a.__localMs ?? Date.now());
      const bm = b.createdAt ? b.createdAt.toMillis() : (b.__localMs ?? Date.now());
      return am - bm;
    });
  }, [messages, optimisticMessages]);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (attachMenuRef.current && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
      if (emojiRef.current && !emojiRef.current.contains(target)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = (smooth = true) => {
    const el = scrollBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setUnseenWhileScrolled(0);
    setShowScrollBottom(false);
  };

  useEffect(() => {
    if (loading || chronologicalMessages.length === 0) return;
    const newest = chronologicalMessages[chronologicalMessages.length - 1];
    const el = scrollBoxRef.current;
    if (!el) return;

    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true;
      prevNewestIdRef.current = newest.id;
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return;
    }

    if (prevNewestIdRef.current !== newest.id) {
      prevNewestIdRef.current = newest.id;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (dist < 180 || newest.senderId === user.uid || document.activeElement === inputRef.current) {
        window.requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        setUnseenWhileScrolled(0);
      } else {
        setUnseenWhileScrolled((n) => n + 1);
      }
    }
  }, [loading, chronologicalMessages, user.uid]);

  const handleTimelineScroll = () => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(dist > 220);
    if (dist <= 60) setUnseenWhileScrolled(0);
  };

  const jumpToMessage = (messageId: string) => {
    if (!messageId) return;
    const el = document.getElementById(`dm-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(messageId);
      window.setTimeout(() => setHighlightedId(null), 1800);
    }
  };

  const formatDateDivider = (ts: Timestamp | null): string => {
    const date = ts ? ts.toDate() : new Date();
    const today = new Date();
    const key = formatDateKey(ts);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (key === todayStr) return tr('LEO', 'TODAY');
    return date.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const uploadResolvedFile = async (file: File) => {
    setAttachMenuOpen(false);
    setUploading(true);
    const shouldDefaultViewOnce = autoViewOnceRef.current;
    autoViewOnceRef.current = false;
    try {
      const uploaded = await uploadChatFileToCloudinary(file);
      setPendingAttachment(uploaded);
      setViewOnceDraft(uploaded.attachmentType === 'image' && shouldDefaultViewOnce);
      onToast(
        uploaded.attachmentType === 'image'
          ? shouldDefaultViewOnce
            ? tr('Picha ya Mara Moja (1x) iko tayari kutumwa.', 'View-Once (1x) photo ready.')
            : tr('Picha iko tayari kutumwa.', 'Photo ready to send.')
          : tr('Nyaraka iko tayari kutumwa.', 'Document ready to send.')
      );
      inputRef.current?.focus();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kupakia faili.', 'Failed to upload file.'),
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'doc') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (kind === 'image') {
      setAttachMenuOpen(false);
      setPendingCropImage(file);
    } else {
      void uploadResolvedFile(file);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSuspended) {
      onToast(tr('Akaunti yako imesimamishwa kutuma ujumbe.', 'Your account is suspended.'), 'error');
      return;
    }

    const cleanText = draft.trim();
    const attachmentToSend = pendingAttachment;
    if (!cleanText && !attachmentToSend) return;

    const replySnapshot = replyTo;
    const replyPreviewRaw = replySnapshot
      ? replySnapshot.text ||
        (replySnapshot.attachmentType === 'audio'
          ? `🎤 Sauti (${formatAudioSeconds(replySnapshot.audioDurationSec)})`
          : replySnapshot.attachmentType === 'image'
            ? '📷 Picha'
            : `📄 ${replySnapshot.attachmentName || 'Nyaraka'}`)
      : '';

    const messageId = generateDirectMessageId(thread.chatId);
    const localMs = Date.now();

    const isViewOncePhoto = Boolean(
      attachmentToSend && attachmentToSend.attachmentType === 'image' && viewOnceDraft
    );

    const optimisticItem: OptimisticDmMessage = {
      id: messageId,
      chatId: thread.chatId,
      participants: thread.participants,
      senderId: user.uid,
      senderName: userDisplayName,
      senderPhoto: userPhoto,
      text: cleanText,
      attachmentType: attachmentToSend ? attachmentToSend.attachmentType : 'none',
      attachmentUrl: attachmentToSend ? attachmentToSend.url : '',
      attachmentName: attachmentToSend ? attachmentToSend.fileName : '',
      attachmentSize: attachmentToSend ? attachmentToSend.fileSize : 0,
      attachmentMime: attachmentToSend ? attachmentToSend.mimeType : '',
      viewOnce: isViewOncePhoto,
      viewOnceConsumed: false,
      viewOnceOpenedAt: null,
      replyToId: replySnapshot ? replySnapshot.id : '',
      replyToSenderName: replySnapshot ? replySnapshot.senderName : '',
      replyToPreview: replyPreviewRaw.slice(0, 160),
      isDeleted: false,
      createdAt: null,
      updatedAt: null,
      __localMs: localMs,
    };

    setOptimisticMessages((prev) => [...prev, optimisticItem]);
    setDraft('');
    setPendingAttachment(null);
    setViewOnceDraft(false);
    setReplyTo(null);
    setEmojiOpen(false);
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    setMchartTyping(false, '', thread.chatId);

    window.requestAnimationFrame(() => {
      if (scrollBoxRef.current) {
        scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
      }
      inputRef.current?.focus();
    });

    try {
      await sendDirectMessage(user, userDisplayName, userPhoto, thread, {
        customId: messageId,
        text: cleanText,
        attachmentType: attachmentToSend ? attachmentToSend.attachmentType : 'none',
        attachmentUrl: attachmentToSend?.url,
        attachmentName: attachmentToSend?.fileName,
        attachmentSize: attachmentToSend?.fileSize,
        attachmentMime: attachmentToSend?.mimeType,
        viewOnce: isViewOncePhoto,
        replyToId: replySnapshot?.id,
        replyToSenderName: replySnapshot?.senderName,
        replyToPreview: replyPreviewRaw.slice(0, 160),
      });
    } catch (err) {
      setOptimisticMessages((prev) => prev.filter((om) => om.id !== messageId));
      setDraft(cleanText);
      if (attachmentToSend) {
        setPendingAttachment(attachmentToSend);
        setViewOnceDraft(isViewOncePhoto);
      }
      if (replySnapshot) setReplyTo(replySnapshot);
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma ujumbe.', 'Failed to send message.'),
        'error'
      );
    }
  };

  const handleSendVoiceNote = async (voice: {
    url: string;
    durationSec: number;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }) => {
    if (isSuspended) {
      onToast(tr('Akaunti yako imesimamishwa kutuma ujumbe.', 'Your account is suspended.'), 'error');
      return;
    }
    const messageId = generateDirectMessageId(thread.chatId);
    const localMs = Date.now();
    const optimisticItem: OptimisticDmMessage = {
      id: messageId,
      chatId: thread.chatId,
      participants: thread.participants,
      senderId: user.uid,
      senderName: userDisplayName,
      senderPhoto: userPhoto,
      text: '',
      attachmentType: 'audio',
      attachmentUrl: voice.url,
      attachmentName: voice.fileName,
      attachmentSize: voice.fileSize,
      attachmentMime: voice.mimeType,
      audioDurationSec: voice.durationSec,
      replyToId: replyTo ? replyTo.id : '',
      replyToSenderName: replyTo ? replyTo.senderName : '',
      replyToPreview: replyTo ? (replyTo.text || replyTo.attachmentName || '').slice(0, 160) : '',
      isDeleted: false,
      createdAt: null,
      updatedAt: null,
      __localMs: localMs,
    };
    const replySnapshot = replyTo;
    setOptimisticMessages((prev) => [...prev, optimisticItem]);
    setReplyTo(null);
    window.requestAnimationFrame(() => scrollToBottom(true));
    try {
      await sendDirectMessage(user, userDisplayName, userPhoto, thread, {
        customId: messageId,
        text: '',
        attachmentType: 'audio',
        attachmentUrl: voice.url,
        attachmentName: voice.fileName,
        attachmentSize: voice.fileSize,
        attachmentMime: voice.mimeType,
        audioDurationSec: voice.durationSec,
        replyToId: replySnapshot?.id,
        replyToSenderName: replySnapshot?.senderName,
        replyToPreview: replySnapshot ? (replySnapshot.text || '').slice(0, 160) : '',
      });
    } catch (err) {
      setOptimisticMessages((prev) => prev.filter((om) => om.id !== messageId));
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma sauti.', 'Failed to send voice note.'),
        'error'
      );
    }
  };

  const handleConfirmDelete = (msg: DirectChatMessage) => {
    setPendingDeleteMsg(msg);
  };

  const hasInlineOverlay = Boolean(
    pendingCropImage ||
      viewOnceModal ||
      lightboxImage ||
      activePdfDoc ||
      forwardingMsg ||
      infoMsg ||
      editingMsg
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#EFEAE2]">
      <div className={hasInlineOverlay ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
      {/* Partner Sub-Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToInbox}
            aria-label={tr('Rudi kwenye orodha ya chats', 'Back to chat list')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar
            name={partner.name}
            photoURL={partner.photo}
            uid={partner.uid}
            showOnlineIndicator
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold text-slate-900">
                <AuthorName uid={partner.uid} fallback={partner.name} />
              </p>
              <AuthorVerificationBadge uid={partner.uid} size="xs" />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {isPartnerTyping ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-[#00A884]">
                  <span className="inline-flex gap-0.5" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#00A884]" />
                  </span>
                  <span>{tr('anaandika...', 'typing...')}</span>
                </span>
              ) : (
                <>
                  <OnlineStatusPill uid={partner.uid} />
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Mazungumzo ya Siri (Nyinyi 2 tu)', 'Private (You 2 only)')}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Chat Canvas */}
      <div className="bg-mchart-watermark relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollBoxRef}
          onScroll={handleTimelineScroll}
          className="h-full touch-pan-y overflow-y-auto overscroll-contain px-2.5 py-2.5 sm:px-5 sm:py-4"
        >
          <div className="mx-auto mb-3 max-w-md rounded-xl bg-[#FFF3C4]/95 px-3.5 py-2 text-center text-[11px] leading-relaxed text-slate-700 shadow-xs">
            <Lock className="mr-1 inline h-3 w-3 text-[#075E54]" aria-hidden="true" />
            {tr(
              `Ujumbe huu ni wa siri kati yako na ${partner.name} pekee.`,
              `This conversation is strictly private between you and ${partner.name}.`
            )}
          </div>

          {loading ? (
            <div className="space-y-3 py-6">
              <div className="h-12 w-2/3 rounded-2xl bg-white/75 animate-pulse" />
              <div className="ml-auto h-12 w-1/2 rounded-2xl bg-[#D9FDD3]/75 animate-pulse" />
            </div>
          ) : chronologicalMessages.length === 0 ? (
            <div className="mx-auto my-8 max-w-xs rounded-2xl bg-white/90 px-5 py-6 text-center shadow-xs">
              <p className="text-sm font-bold text-slate-900">
                {tr(`Msalimie ${partner.name}!`, `Say hello to ${partner.name}!`)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {tr(
                  'Tuma ujumbe, picha au nyaraka kwa faragha kamili.',
                  'Send a private message, photo, or document.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {chronologicalMessages.map((msg, idx) => {
                const prev = idx > 0 ? chronologicalMessages[idx - 1] : null;
                const showDateDivider =
                  !prev || formatDateKey(prev.createdAt) !== formatDateKey(msg.createdAt);
                const isOwn = msg.senderId === user.uid;
                const isSameSenderAsPrev =
                  Boolean(prev) &&
                  !showDateDivider &&
                  prev?.senderId === msg.senderId &&
                  !prev?.isDeleted;
                const canDelete = Boolean(!msg.isDeleted && isOwn);
                const docBadge =
                  msg.attachmentType === 'document'
                    ? getDocBadgeInfo(msg.attachmentName, msg.attachmentMime)
                    : null;

                return (
                  <React.Fragment key={msg.id}>
                    {showDateDivider && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-lg bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-xs">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    <div
                      id={`dm-msg-${msg.id}`}
                      className={`group flex items-end gap-2 ${
                        isOwn ? 'justify-end' : 'justify-start'
                      } ${isSameSenderAsPrev ? 'mt-0.5' : 'mt-2'}`}
                    >
                      <div
                        className={`relative max-w-[84%] rounded-2xl px-3 py-2 shadow-xs transition-all sm:max-w-[70%] ${
                          isOwn
                            ? `bg-[#D9FDD3] text-slate-900 ${isSameSenderAsPrev ? '' : 'rounded-tr-xs'}`
                            : `bg-white text-slate-900 ${isSameSenderAsPrev ? '' : 'rounded-tl-xs'}`
                        } ${highlightedId === msg.id ? 'ring-2 ring-[#25D366] ring-offset-1' : ''}`}
                      >
                        {msg.isDeleted ? (
                          <div className="flex items-center gap-1.5 py-0.5 text-xs italic text-slate-500">
                            <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{tr('Ujumbe huu umefutwa', 'This message was deleted')}</span>
                          </div>
                        ) : (
                          <>
                            {msg.forwardedFromName && (
                              <div className="mb-1 flex items-center gap-1 text-[10px] italic text-slate-500">
                                <Forward className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>{tr('Umesambazwa', 'Forwarded')}</span>
                              </div>
                            )}
                            {msg.replyToId && (
                              <button
                                type="button"
                                onClick={() => jumpToMessage(msg.replyToId)}
                                className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left transition-colors ${
                                  isOwn
                                    ? 'border-[#00A884] bg-[#CBEFC5] hover:bg-[#C2E9BC]'
                                    : 'border-[#075E54] bg-slate-100 hover:bg-slate-200/80'
                                }`}
                              >
                                <p className="truncate text-[11px] font-bold text-[#075E54]">
                                  {msg.replyToSenderName || tr('Mwanachama', 'Member')}
                                </p>
                                <p className="line-clamp-2 text-[11px] text-slate-700">
                                  {msg.replyToPreview || tr('Ujumbe', 'Message')}
                                </p>
                              </button>
                            )}

                            {msg.attachmentType === 'audio' && msg.attachmentUrl && (
                              <VoiceNoteBubble
                                url={msg.attachmentUrl}
                                durationSec={msg.audioDurationSec}
                                isOwn={isOwn}
                              />
                            )}

                            {msg.attachmentType === 'image' && msg.viewOnce ? (
                              <div className="mb-1.5">
                                {isOwn ? (
                                  <div
                                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                                      msg.viewOnceConsumed
                                        ? 'border-slate-300 bg-slate-100/80 text-slate-600'
                                        : 'border-emerald-300 bg-emerald-50 text-[#075E54]'
                                    }`}
                                  >
                                    {msg.viewOnceConsumed ? (
                                      <EyeOff className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                                    ) : (
                                      <Eye className="h-4 w-4 shrink-0 text-[#00A884]" aria-hidden="true" />
                                    )}
                                    <span>
                                      {msg.viewOnceConsumed
                                        ? tr(
                                            'Picha ya Mara Moja (1x) · Imeshafunguliwa',
                                            'View-Once Photo (1x) · Opened'
                                          )
                                        : tr(
                                            'Picha ya Mara Moja (1x) · Haijafunguliwa bado',
                                            'View-Once Photo (1x) · Unopened'
                                          )}
                                    </span>
                                  </div>
                                ) : msg.viewOnceConsumed || !msg.attachmentUrl ? (
                                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                                    <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                    <span>
                                      {tr(
                                        'Picha Imeshatazamwa · Haiwezi kufunguliwa tena',
                                        'View-Once photo opened · Cannot open again'
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const capturedUrl = msg.attachmentUrl;
                                      const capturedName =
                                        msg.attachmentName || tr('Picha ya Mara Moja (1x)', 'View-Once Photo');
                                      setViewOnceModal({
                                        url: capturedUrl,
                                        name: capturedName,
                                        text: msg.text || undefined,
                                      });
                                      void markDirectViewOnceConsumed(thread.chatId, msg.id).catch(() => {});
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl border border-[#00A884] bg-emerald-50 px-3.5 py-2.5 text-left text-xs font-bold text-[#064E46] shadow-xs transition-colors hover:bg-emerald-100"
                                  >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white">
                                      <Eye className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate">
                                        {tr('Picha ya Siri (Tazama Mara 1 Tu)', 'View-Once Photo (1x)')}
                                      </p>
                                      <p className="text-[11px] font-medium text-emerald-700">
                                        {tr('Bonyeza kufungua sasa', 'Tap to view once')}
                                      </p>
                                    </div>
                                  </button>
                                )}
                              </div>
                            ) : msg.attachmentType === 'image' && msg.attachmentUrl ? (
                              <div className="mb-1.5 overflow-hidden rounded-xl border border-black/10 bg-slate-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxImage({
                                      url: msg.attachmentUrl,
                                      name: msg.attachmentName || 'Picha ya Siri',
                                    })
                                  }
                                  className="block w-full"
                                >
                                  <img
                                    src={optimizeCloudinaryUrl(msg.attachmentUrl, 640)}
                                    alt={msg.attachmentName || tr('Picha', 'Photo')}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    className="block h-auto w-full"
                                  />
                                </button>
                              </div>
                            ) : null}

                            {msg.attachmentType === 'document' &&
                              msg.attachmentUrl &&
                              docBadge && (() => {
                                const isPdfDoc = docBadge.ext === 'PDF';
                                const isBusy = downloadingDocId === msg.id;
                                const handleDocDownload = async () => {
                                  if (downloadingDocId) return;
                                  setDownloadingDocId(msg.id);
                                  try {
                                    await downloadChatAttachmentFile(
                                      msg.attachmentUrl,
                                      msg.attachmentName || (isPdfDoc ? 'nyaraka.pdf' : 'faili'),
                                      msg.attachmentMime
                                    );
                                    onToast(
                                      tr(
                                        'Faili limepakuliwa kwenye simu yako!',
                                        'File saved to your device!'
                                      )
                                    );
                                  } catch (err) {
                                    onToast(
                                      err instanceof Error
                                        ? err.message
                                        : tr('Imeshindwa kupakua faili.', 'Failed to download file.'),
                                      'error'
                                    );
                                  } finally {
                                    setDownloadingDocId(null);
                                  }
                                };
                                return (
                                  <div
                                    className={`mb-1.5 overflow-hidden rounded-xl border transition-colors ${
                                      isOwn
                                        ? 'border-[#B6E2AE] bg-[#CBEFC5]/75'
                                        : 'border-slate-200 bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 p-2.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isPdfDoc) {
                                            setActivePdfDoc({
                                              url: msg.attachmentUrl,
                                              name: msg.attachmentName || 'nyaraka.pdf',
                                            });
                                          } else {
                                            void handleDocDownload();
                                          }
                                        }}
                                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
                                      >
                                        <div
                                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${docBadge.bgClass}`}
                                        >
                                          {docBadge.ext}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-semibold text-slate-900">
                                            {msg.attachmentName || tr('Nyaraka', 'Document')}
                                          </p>
                                          <p className="text-[11px] text-slate-600">
                                            {formatFileSize(msg.attachmentSize)}
                                            {isPdfDoc
                                              ? ` · ${tr('Gusa kufungua', 'Tap to open')}`
                                              : ` · ${tr('Gusa kupakua', 'Tap to download')}`}
                                          </p>
                                        </div>
                                      </button>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        {isPdfDoc && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActivePdfDoc({
                                                url: msg.attachmentUrl,
                                                name: msg.attachmentName || 'nyaraka.pdf',
                                              })
                                            }
                                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#075E54] px-2.5 text-[11px] font-bold text-white hover:bg-[#064E46]"
                                          >
                                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                            <span>{tr('Fungua', 'Open')}</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => void handleDocDownload()}
                                          aria-label={tr('Pakua faili kwenye simu', 'Download file')}
                                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#075E54]/30 bg-white px-2.5 text-[11px] font-bold text-[#075E54] hover:bg-emerald-50 disabled:opacity-60"
                                        >
                                          {isBusy ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                          ) : (
                                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                          )}
                                          <span>{tr('Pakua', 'Save')}</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                            {msg.text && (
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-900">
                                <LinkedText text={msg.text} />
                              </p>
                            )}

                            {/* Reactions Summary Pills */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {Object.entries(msg.reactions)
                                  .filter(([, uids]) => Array.isArray(uids) && uids.length > 0)
                                  .map(([emoji, uids]) => {
                                    const reacted = uids.includes(user.uid);
                                    return (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() =>
                                          void toggleDirectMessageReaction(
                                            thread.chatId,
                                            msg.id,
                                            emoji,
                                            user.uid
                                          )
                                        }
                                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                          reacted
                                            ? 'border-[#00A884] bg-emerald-50 text-[#075E54]'
                                            : 'border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        <span>{emoji}</span>
                                        <span className="text-[10px] tabular-nums">{uids.length}</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            )}

                            {/* Inline Quick Reaction Picker */}
                            {reactionPickerForId === msg.id && (
                              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-md">
                                {REACTION_CHOICES.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      setReactionPickerForId(null);
                                      void toggleDirectMessageReaction(
                                        thread.chatId,
                                        msg.id,
                                        emoji,
                                        user.uid
                                      );
                                    }}
                                    className="rounded-full p-1 text-base transition-transform hover:scale-125"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-slate-500">
                          {!msg.isDeleted && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setReactionPickerForId((prevId) =>
                                    prevId === msg.id ? null : msg.id
                                  )
                                }
                                aria-label={tr('Weka emoji', 'React')}
                                className="inline-flex items-center rounded px-1 py-0.5 text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                              >
                                <Smile className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const payloadText =
                                    msg.text.trim() ||
                                    msg.attachmentName ||
                                    msg.attachmentUrl;
                                  void copyTextToClipboard(payloadText).then((ok) => {
                                    if (ok) {
                                      onToast(tr('Ujumbe umenakiliwa!', 'Message copied!'));
                                    }
                                  });
                                }}
                                aria-label={tr('Nakili ujumbe', 'Copy message')}
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                              >
                                <Copy className="h-3 w-3" aria-hidden="true" />
                                <span className="hidden sm:inline">{tr('Nakili', 'Copy')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyTo(msg);
                                  inputRef.current?.focus();
                                }}
                                aria-label={tr('Jibu ujumbe huu', 'Reply to this message')}
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                              >
                                <ReplyIcon className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Jibu', 'Reply')}</span>
                              </button>
                              {!msg.viewOnce && (
                                <button
                                  type="button"
                                  onClick={() => setForwardingMsg(msg)}
                                  aria-label={tr('Sambaza ujumbe', 'Forward message')}
                                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                                >
                                  <Forward className="h-3 w-3" aria-hidden="true" />
                                </button>
                              )}
                            </>
                          )}
                          {canDelete && Boolean(msg.text.trim()) && (
                            <button
                              type="button"
                              onClick={() => setEditingMsg(msg)}
                              aria-label={tr('Hariri ujumbe', 'Edit message')}
                              className="inline-flex items-center rounded px-1 py-0.5 text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                            >
                              <Edit3 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                          {isOwn && !msg.isDeleted && (
                            <button
                              type="button"
                              onClick={() => setInfoMsg(msg)}
                              aria-label={tr('Maelezo ya ujumbe', 'Message info')}
                              className="inline-flex items-center rounded px-1 py-0.5 text-slate-500 hover:bg-black/5 hover:text-[#075E54]"
                            >
                              <Info className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleConfirmDelete(msg)}
                              aria-label={tr('Futa ujumbe', 'Delete message')}
                              className="inline-flex items-center rounded px-1 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                          {msg.isEdited && !msg.isDeleted && (
                            <span className="italic text-slate-400">
                              {tr('imehaririwa', 'edited')}
                            </span>
                          )}
                          <span className="tabular-nums">
                            {formatClockTime(msg.createdAt) || tr('sasa', 'now')}
                          </span>
                          {isOwn && !msg.isDeleted && (() => {
                            const msgMs = msg.createdAt ? msg.createdAt.toMillis() : 0;
                            if (pendingIdSet.has(msg.id) || msgMs === 0) {
                              return (
                                <Check
                                  aria-label={tr('Inatuma', 'Sending')}
                                  className="h-3.5 w-3.5 text-slate-400"
                                />
                              );
                            }
                            const wasRead = partnerLastReadMs >= msgMs;
                            return (
                              <CheckCheck
                                aria-label={wasRead ? tr('Imesomwa', 'Read') : tr('Imefika', 'Delivered')}
                                className={`h-3.5 w-3.5 ${wasRead ? 'text-[#53BDEB]' : 'text-slate-400'}`}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Live Partner Typing Bubble */}
          {isPartnerTyping && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2.5 flex items-end justify-start gap-2"
            >
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-xs border border-emerald-200 bg-white px-3.5 py-2 shadow-xs">
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884]" />
                </span>
                <span className="text-xs font-semibold text-[#075E54]">
                  {tr(`${partner.name} anaandika...`, `${partner.name} is typing...`)}
                </span>
              </div>
            </div>
          )}
        </div>

        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label={tr('Shuka chini kabisa', 'Scroll to bottom')}
            className="absolute right-4 bottom-4 z-10 flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-[#075E54] shadow-md hover:bg-slate-50"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            {unseenWhileScrolled > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-extrabold text-white tabular-nums">
                {unseenWhileScrolled}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Composer Footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-[#F0F2F5] px-2.5 py-2 pb-2.5 sm:px-4 sm:py-2.5">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-[#075E54] bg-white px-3 py-2 shadow-xs">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-[#075E54]">
                {tr(`Unamjibu ${replyTo.senderName}`, `Replying to ${replyTo.senderName}`)}
              </p>
              <p className="truncate text-xs text-slate-600">
                {replyTo.text ||
                  (replyTo.attachmentType === 'image'
                    ? tr('📷 Picha', '📷 Photo')
                    : `📄 ${replyTo.attachmentName || tr('Nyaraka', 'Document')}`)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label={tr('Ghairi kujibu', 'Cancel reply')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {pendingAttachment && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#BFD7F2] bg-white px-3 py-2 shadow-xs">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {pendingAttachment.attachmentType === 'image' ? (
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                  <img
                    src={optimizeCloudinaryUrl(pendingAttachment.url, 160)}
                    alt=""
                    className={`h-full w-full object-cover ${viewOnceDraft ? 'blur-[2px] brightness-75' : ''}`}
                  />
                  {viewOnceDraft && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-white">
                      1x
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E9F1FA] text-[#1D4E89]">
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">
                  {pendingAttachment.fileName}
                </p>
                <p className="text-[11px] font-semibold text-emerald-700">
                  {formatFileSize(pendingAttachment.fileSize)} ·{' '}
                  {viewOnceDraft
                    ? tr('🔒 Mara 1 (1x) — Tayari kutumwa', '🔒 View Once (1x) — Ready')
                    : tr('Tayari kutumwa', 'Ready to send')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {pendingAttachment.attachmentType === 'image' && (
                <button
                  type="button"
                  onClick={() => setViewOnceDraft((prev) => !prev)}
                  aria-pressed={viewOnceDraft}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    viewOnceDraft
                      ? 'border-[#075E54] bg-[#075E54] text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {viewOnceDraft ? (
                    <EyeOff className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                  )}
                  <span>1x</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={uploading}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-[#00A884] px-3 py-1 text-[11px] font-extrabold text-white shadow-xs hover:bg-[#008F6F]"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Tuma', 'Send')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingAttachment(null);
                  setViewOnceDraft(false);
                }}
                aria-label={tr('Ondoa faili', 'Remove attachment')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#075E54] shadow-xs">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{tr('Inapakia faili...', 'Uploading file...')}</span>
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => handleFileChange(e, 'image')}
          className="hidden"
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(e) => handleFileChange(e, 'doc')}
          className="hidden"
        />

        {isSuspended ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {tr(
                'Akaunti yako imesimamishwa. Huwezi kutuma ujumbe.',
                'Your account is suspended from sending messages.'
              )}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
            {!recordingVoice && (
              <>
                <div className="relative" ref={emojiRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmojiOpen((prev) => !prev);
                      setAttachMenuOpen(false);
                    }}
                    aria-label={tr('Chagua emoji', 'Pick emoji')}
                    className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-[#075E54]"
                  >
                    <Smile className="h-5 w-5" aria-hidden="true" />
                  </button>

                  {emojiOpen && (
                    <div className="absolute bottom-13 left-0 z-30 grid w-60 grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => prev + emoji);
                            inputRef.current?.focus();
                          }}
                          className="flex h-10 items-center justify-center rounded-xl text-xl hover:bg-slate-100"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative" ref={attachMenuRef}>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setAttachMenuOpen((prev) => !prev);
                      setEmojiOpen(false);
                    }}
                    aria-label={tr('Ambatanisha picha au nyaraka', 'Attach photo or document')}
                    className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-[#075E54] disabled:opacity-50"
                  >
                    <Paperclip className="h-5 w-5" aria-hidden="true" />
                  </button>

                  {attachMenuOpen && (
                    <div className="absolute bottom-13 left-0 z-30 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          autoViewOnceRef.current = false;
                          imageInputRef.current?.click();
                        }}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-emerald-50"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                          <ImageIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div>
                          <p>{tr('Picha (Photo)', 'Photo / Image')}</p>
                          <p className="text-[10px] font-normal text-slate-500">JPG, PNG, WEBP</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          autoViewOnceRef.current = true;
                          imageInputRef.current?.click();
                        }}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#064E46] hover:bg-emerald-50"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[#075E54]">
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div>
                          <p>{tr('Picha ya Mara Moja (1x)', 'View-Once Photo (1x)')}</p>
                          <p className="text-[10px] font-normal text-emerald-700">
                            {tr('Inajifunga baada ya kutazamwa', 'Locks after viewing once')}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-emerald-50"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-[#1D4E89]">
                          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div>
                          <p>{tr('Nyaraka (Document)', 'Document / File')}</p>
                          <p className="text-[10px] font-normal text-slate-500">PDF, Word, Excel, ZIP</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 rounded-2xl bg-white px-3.5 py-2 shadow-xs ring-1 ring-slate-200/80 focus-within:ring-[#075E54]">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    maxLength={2000}
                    value={draft}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setDraft(nextVal);
                      if (typingIdleTimerRef.current !== null) {
                        window.clearTimeout(typingIdleTimerRef.current);
                        typingIdleTimerRef.current = null;
                      }
                      if (nextVal.trim().length > 0) {
                        setMchartTyping(true, replyTo?.senderName || '', thread.chatId);
                        typingIdleTimerRef.current = window.setTimeout(() => {
                          setMchartTyping(false, '', thread.chatId);
                          typingIdleTimerRef.current = null;
                        }, 4200);
                      } else {
                        setMchartTyping(false, '', thread.chatId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={tr(`Andika ujumbe wa siri kwa ${partner.name}...`, `Message ${partner.name}...`)}
                    className="max-h-24 w-full resize-none bg-transparent text-[15px] leading-snug text-slate-900 placeholder-slate-400 outline-none sm:text-sm"
                  />
                </div>
              </>
            )}

            {!draft.trim() && !pendingAttachment && !uploading ? (
              <VoiceRecorderBar
                disabled={isSuspended}
                onRecordingStateChange={setRecordingVoice}
                onVoiceReady={(voice) => void handleSendVoiceNote(voice)}
                onError={(msg) => onToast(msg, 'error')}
              />
            ) : (
              <button
                type="submit"
                disabled={uploading || (!draft.trim() && !pendingAttachment)}
                aria-label={tr('Tuma ujumbe', 'Send message')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm transition-colors hover:bg-[#008F6F] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send className="h-5 w-5 translate-x-[1px]" aria-hidden="true" />
              </button>
            )}
          </form>
        )}
        {pendingDeleteMsg && (
          <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-red-900">
                  {tr('Futa ujumbe huu kwenu nyote?', 'Delete this message for both of you?')}
                </p>
                <p className="truncate text-[11px] text-red-700">
                  {pendingDeleteMsg.text.trim() ||
                    pendingDeleteMsg.attachmentName ||
                    tr('Kiambatisho', 'Attachment')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={deletingMsg}
                  onClick={() => setPendingDeleteMsg(null)}
                  className="min-h-[34px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tr('Ghairi', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={deletingMsg}
                  onClick={async () => {
                    setDeletingMsg(true);
                    try {
                      await softDeleteDirectMessage(thread.chatId, pendingDeleteMsg.id);
                      setPendingDeleteMsg(null);
                      onToast(tr('Ujumbe umefutwa.', 'Message deleted.'));
                    } catch (err) {
                      onToast(
                        err instanceof Error ? err.message : tr('Imeshindwa kufuta.', 'Failed to delete.'),
                        'error'
                      );
                    } finally {
                      setDeletingMsg(false);
                    }
                  }}
                  className="min-h-[34px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deletingMsg ? '...' : tr('Futa Ujumbe', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </footer>
      </div>

      {/* Inline View-Once Photo Page */}
      {viewOnceModal && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="flex h-full min-h-0 flex-1 flex-col items-center justify-between bg-black p-4 text-white select-none"
        >
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setViewOnceModal(null)}
              aria-label={tr('Rudi', 'Back')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-bold text-white hover:bg-white/25"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Rudi', 'Back')}</span>
            </button>
            <div className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200">
              <EyeOff className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <span className="truncate">
                {tr(
                  'Picha ya Mara Moja (1x) — Ukifunga imefungwa',
                  'View-Once Photo (1x) — Locks on close'
                )}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-4">
            <img
              src={viewOnceModal.url}
              alt={viewOnceModal.name}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="pointer-events-none max-h-full max-w-full rounded-xl object-contain select-none"
              referrerPolicy="no-referrer"
            />
          </div>

          {viewOnceModal.text ? (
            <p className="max-w-xl rounded-xl bg-white/10 px-4 py-2 text-center text-sm text-white">
              {viewOnceModal.text}
            </p>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Inline Image Viewer Page */}
      {!viewOnceModal && lightboxImage && (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-950 text-white">
          <div className="flex shrink-0 items-center justify-between gap-2 bg-[#075E54] px-3 py-2.5 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label={tr('Rudi kwenye mazungumzo', 'Back to chat')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="truncate text-xs font-bold sm:text-sm">{lightboxImage.name}</p>
            </div>
            <a
              href={lightboxImage.url}
              target="_blank"
              rel="noopener noreferrer"
              download={lightboxImage.name}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-extrabold text-[#064E46] hover:brightness-105"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Pakua', 'Download')}</span>
            </a>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Inline PDF Reader Page */}
      {!viewOnceModal && !lightboxImage && activePdfDoc && (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-[#F4F7FA] text-slate-900">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#075E54] px-3 py-2.5 text-white sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActivePdfDoc(null)}
                aria-label={tr('Rudi kwenye mazungumzo', 'Back to chat')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-[10px] font-extrabold text-white">
                PDF
              </span>
              <p className="truncate text-xs font-bold sm:text-sm">{activePdfDoc.name}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void downloadChatAttachmentFile(
                  activePdfDoc.url,
                  activePdfDoc.name,
                  'application/pdf'
                ).then(() =>
                  onToast(tr('PDF imepakuliwa kwenye simu yako!', 'PDF saved to your device!'))
                );
              }}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-extrabold text-[#064E46] hover:brightness-105"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Pakua Simu', 'Save PDF')}</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-5">
            <MobilePdfNoteReader
              pdfUrl={activePdfDoc.url}
              fileName={activePdfDoc.name}
              onDownload={() => {
                void downloadChatAttachmentFile(
                  activePdfDoc.url,
                  activePdfDoc.name,
                  'application/pdf'
                ).then(() =>
                  onToast(tr('PDF imepakuliwa kwenye simu yako!', 'PDF saved to your device!'))
                );
              }}
            />
          </div>
        </div>
      )}

      {/* Inline Image Crop / Resize Page */}
      {!viewOnceModal && !lightboxImage && !activePdfDoc && pendingCropImage && (
        <ImageResizeModal
          inline
          file={pendingCropImage}
          defaultPreset="free"
          onCancel={() => setPendingCropImage(null)}
          onConfirm={(resizedFile) => {
            setPendingCropImage(null);
            void uploadResolvedFile(resizedFile);
          }}
        />
      )}

      {/* Inline Forward Page */}
      {!viewOnceModal && !lightboxImage && !activePdfDoc && !pendingCropImage && forwardingMsg && (
        <ForwardMessageModal
          isOpen
          onClose={() => setForwardingMsg(null)}
          previewText={
            forwardingMsg.text.trim() ||
            forwardingMsg.attachmentName ||
            tr('Ujumbe uliosambazwa', 'Forwarded message')
          }
          groupSettings={groupSettings}
          memberCandidates={memberCandidates}
          selfUid={user.uid}
          canSendToGroup={canSendToGroup}
          onForwardToGroup={async () => {
            await sendChatMessage(user, userDisplayName, {
              text: forwardingMsg.text,
              attachmentType: forwardingMsg.attachmentType,
              attachmentUrl: forwardingMsg.attachmentUrl,
              attachmentName: forwardingMsg.attachmentName,
              attachmentSize: forwardingMsg.attachmentSize,
              attachmentMime: forwardingMsg.attachmentMime,
              audioDurationSec: forwardingMsg.audioDurationSec,
              forwardedFromName: forwardingMsg.senderName,
            });
            onToast(tr('Ujumbe umesambazwa kwenye kundi!', 'Forwarded to group!'));
          }}
          onForwardToMember={async (member) => {
            const targetThread = await ensureDirectChatThread(user, userDisplayName, userPhoto, member);
            await sendDirectMessage(user, userDisplayName, userPhoto, targetThread, {
              text: forwardingMsg.text,
              attachmentType: forwardingMsg.attachmentType,
              attachmentUrl: forwardingMsg.attachmentUrl,
              attachmentName: forwardingMsg.attachmentName,
              attachmentSize: forwardingMsg.attachmentSize,
              attachmentMime: forwardingMsg.attachmentMime,
              audioDurationSec: forwardingMsg.audioDurationSec,
              forwardedFromName: forwardingMsg.senderName,
            });
            onToast(tr(`Umesambazwa kwa ${member.displayName}!`, `Forwarded to ${member.displayName}!`));
          }}
        />
      )}

      {/* Inline Message Info Page */}
      {!viewOnceModal &&
        !lightboxImage &&
        !activePdfDoc &&
        !pendingCropImage &&
        !forwardingMsg &&
        infoMsg && (
          <MessageInfoModal
            isOpen
            onClose={() => setInfoMsg(null)}
            messageText={infoMsg.text || infoMsg.attachmentName || ''}
            sentAt={infoMsg.createdAt || null}
            mode="direct"
            partnerName={partner.name}
            partnerPhoto={partner.photo}
            partnerReadAt={partnerLastReadAt || null}
          />
        )}

      {/* Inline Edit Message Page */}
      {!viewOnceModal &&
        !lightboxImage &&
        !activePdfDoc &&
        !pendingCropImage &&
        !forwardingMsg &&
        !infoMsg &&
        editingMsg && (
          <EditMessageModal
            isOpen
            initialText={editingMsg.text || ''}
            onClose={() => setEditingMsg(null)}
            onSave={async (nextText) => {
              await editDirectMessage(thread.chatId, editingMsg.id, nextText);
              onToast(tr('Ujumbe umehaririwa!', 'Message updated!'));
            }}
          />
        )}
    </div>
  );
};
