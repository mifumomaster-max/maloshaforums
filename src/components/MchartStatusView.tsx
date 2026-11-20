import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  optimizeCloudinaryUrl,
  optimizeCloudinaryVideoPlaybackUrl,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
} from '../services/cloudinaryService';
import {
  createMchartStatus,
  deleteMchartStatus,
  markStatusViewed,
} from '../services/forumService';
import {
  AuthPromptReason,
  MchartStatus,
  MchartStatusView as MchartStatusViewItem,
  MemberDirectoryCandidate,
  StatusPrivacyMode,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { AuthorVerificationBadge } from './VerificationBadge';

const SEEN_STATUS_IDS_KEY = 'malosha_seen_status_ids_v1';
const STORY_DURATION_MS = 6500;

interface MchartStatusTabProps {
  statuses: MchartStatus[];
  loading: boolean;
  user: User | null;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  embedded?: boolean;
  memberCandidates: MemberDirectoryCandidate[];
  onStartPrivateChatWith: (
    target: { uid: string; displayName: string; photoURL?: string },
    initialMessage?: string
  ) => Promise<void>;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

interface AuthorStatusGroup {
  authorId: string;
  authorName: string;
  authorPhoto: string;
  items: MchartStatus[];
  latestMs: number;
  hasUnseen: boolean;
  hasPrivate: boolean;
}

export const MchartStatusTab: React.FC<MchartStatusTabProps> = ({
  statuses,
  loading,
  user,
  userDisplayName,
  userPhoto,
  isSuspended = false,
  embedded = false,
  memberCandidates,
  onStartPrivateChatWith,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime } = useLanguage();
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(SEEN_STATUS_IDS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });

  // Upload & Composer State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [stagedMediaType, setStagedMediaType] = useState<'image' | 'video'>('image');
  const [stagedImageUrl, setStagedImageUrl] = useState('');
  const [stagedVideoUrl, setStagedVideoUrl] = useState('');
  const [stagedDurationSec, setStagedDurationSec] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [privacyMode, setPrivacyMode] = useState<StatusPrivacyMode>('members');
  const [selectedViewerIds, setSelectedViewerIds] = useState<string[]>([]);
  const [viewerSearch, setViewerSearch] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Story Viewer State
  const [viewerGroupAuthorId, setViewerGroupAuthorId] = useState<string | null>(null);
  const [viewerSlideIndex, setViewerSlideIndex] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [statusVideoMuted, setStatusVideoMuted] = useState(false);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const [statusViewers, setStatusViewers] = useState<MchartStatusViewItem[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [dmReplyText, setDmReplyText] = useState('');
  const [sendingDmReply, setSendingDmReply] = useState(false);

  const markLocalStatusSeen = useCallback((statusId: string) => {
    setSeenIds((prev) => {
      if (prev.has(statusId)) return prev;
      const next = new Set(prev);
      next.add(statusId);
      try {
        window.localStorage.setItem(
          SEEN_STATUS_IDS_KEY,
          JSON.stringify(Array.from(next).slice(-300))
        );
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  }, []);

  // Only show active (<24h) statuses
  const activeStatuses = useMemo(() => {
    const now = Date.now();
    return statuses.filter((s) => !s.expiresAt || s.expiresAt.toMillis() > now);
  }, [statuses]);

  const myStatuses = useMemo(() => {
    if (!user) return [];
    return activeStatuses
      .filter((s) => s.authorId === user.uid)
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt ? b.createdAt.toMillis() : 0;
        return am - bm;
      });
  }, [activeStatuses, user]);

  const otherGroups = useMemo<AuthorStatusGroup[]>(() => {
    const map = new Map<string, AuthorStatusGroup>();
    activeStatuses.forEach((s) => {
      if (user && s.authorId === user.uid) return;
      const ms = s.createdAt ? s.createdAt.toMillis() : Date.now();
      const existing = map.get(s.authorId);
      const isUnseen = !seenIds.has(s.id);
      if (!existing) {
        map.set(s.authorId, {
          authorId: s.authorId,
          authorName: s.authorName,
          authorPhoto: s.authorPhoto,
          items: [s],
          latestMs: ms,
          hasUnseen: isUnseen,
          hasPrivate: s.privacy === 'selected',
        });
      } else {
        existing.items.push(s);
        if (ms > existing.latestMs) existing.latestMs = ms;
        if (isUnseen) existing.hasUnseen = true;
        if (s.privacy === 'selected') existing.hasPrivate = true;
      }
    });

    const list = Array.from(map.values());
    list.forEach((g) => {
      g.items.sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt ? b.createdAt.toMillis() : 0;
        return am - bm;
      });
    });

    // Unseen first, then most recent
    return list.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestMs - a.latestMs;
    });
  }, [activeStatuses, user, seenIds]);

  const allGroupsForNavigation = useMemo<AuthorStatusGroup[]>(() => {
    const groups: AuthorStatusGroup[] = [];
    if (user && myStatuses.length > 0) {
      groups.push({
        authorId: user.uid,
        authorName: userDisplayName,
        authorPhoto: userPhoto,
        items: myStatuses,
        latestMs: myStatuses[myStatuses.length - 1]?.createdAt?.toMillis() || Date.now(),
        hasUnseen: false,
        hasPrivate: myStatuses.some((s) => s.privacy === 'selected'),
      });
    }
    return [...groups, ...otherGroups];
  }, [user, myStatuses, userDisplayName, userPhoto, otherGroups]);

  const activeGroupIndex = useMemo(() => {
    if (!viewerGroupAuthorId) return -1;
    return allGroupsForNavigation.findIndex((g) => g.authorId === viewerGroupAuthorId);
  }, [allGroupsForNavigation, viewerGroupAuthorId]);

  const activeGroup = activeGroupIndex >= 0 ? allGroupsForNavigation[activeGroupIndex] : null;
  const currentSlide = activeGroup ? activeGroup.items[viewerSlideIndex] || null : null;

  // Record view receipt when viewing another member's status
  useEffect(() => {
    if (!currentSlide || !user) return;
    markLocalStatusSeen(currentSlide.id);
    if (currentSlide.authorId !== user.uid) {
      void markStatusViewed(currentSlide, user, userDisplayName, userPhoto);
    }
  }, [currentSlide, user, userDisplayName, userPhoto, markLocalStatusSeen]);

  // Listen to viewer list ONLY when the status owner opens the viewers drawer
  useEffect(() => {
    if (
      !viewersSheetOpen ||
      !currentSlide ||
      !user ||
      currentSlide.authorId !== user.uid
    ) {
      setStatusViewers([]);
      return;
    }

    setLoadingViewers(true);
    const path = `mchart_statuses/${currentSlide.id}/views`;
    const q = query(collection(db, path), where('statusAuthorId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: MchartStatusViewItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            statusId: String(data.statusId || currentSlide.id),
            statusAuthorId: String(data.statusAuthorId || user.uid),
            viewerId: String(data.viewerId || d.id),
            viewerName: String(data.viewerName || 'Mwanachama'),
            viewerPhoto: String(data.viewerPhoto || ''),
            viewedAt: data.viewedAt || null,
          };
        });
        list.sort((a, b) => {
          const am = a.viewedAt ? a.viewedAt.toMillis() : 0;
          const bm = b.viewedAt ? b.viewedAt.toMillis() : 0;
          return bm - am;
        });
        setStatusViewers(list);
        setLoadingViewers(false);
      },
      (error) => {
        setLoadingViewers(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [viewersSheetOpen, currentSlide, user]);

  const goToNextSlide = useCallback(() => {
    if (!activeGroup) return;
    if (viewerSlideIndex + 1 < activeGroup.items.length) {
      setViewerSlideIndex((i) => i + 1);
      setStoryProgress(0);
      setViewersSheetOpen(false);
      return;
    }
    if (activeGroupIndex + 1 < allGroupsForNavigation.length) {
      const nextGroup = allGroupsForNavigation[activeGroupIndex + 1];
      setViewerGroupAuthorId(nextGroup.authorId);
      setViewerSlideIndex(0);
      setStoryProgress(0);
      setViewersSheetOpen(false);
      return;
    }
    setViewerGroupAuthorId(null);
    setViewerSlideIndex(0);
    setStoryProgress(0);
    setViewersSheetOpen(false);
  }, [activeGroup, viewerSlideIndex, activeGroupIndex, allGroupsForNavigation]);

  const goToPrevSlide = useCallback(() => {
    if (!activeGroup) return;
    if (viewerSlideIndex > 0) {
      setViewerSlideIndex((i) => i - 1);
      setStoryProgress(0);
      setViewersSheetOpen(false);
      return;
    }
    if (activeGroupIndex > 0) {
      const prevGroup = allGroupsForNavigation[activeGroupIndex - 1];
      setViewerGroupAuthorId(prevGroup.authorId);
      setViewerSlideIndex(Math.max(0, prevGroup.items.length - 1));
      setStoryProgress(0);
      setViewersSheetOpen(false);
    }
  }, [activeGroup, viewerSlideIndex, activeGroupIndex, allGroupsForNavigation]);

  const isCurrentSlideVideo =
    currentSlide?.mediaType === 'video' && Boolean(currentSlide?.videoUrl);

  // Auto-advance timer for image story slides (video slides advance onEnded)
  useEffect(() => {
    if (
      !currentSlide ||
      isCurrentSlideVideo ||
      isPaused ||
      viewersSheetOpen ||
      dmReplyText.trim().length > 0
    ) {
      return;
    }
    const tickMs = 60;
    const step = (tickMs / STORY_DURATION_MS) * 100;
    const timer = window.setInterval(() => {
      setStoryProgress((prev) => {
        if (prev + step >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => goToNextSlide(), 0);
          return 100;
        }
        return prev + step;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [currentSlide, isCurrentSlideVideo, isPaused, viewersSheetOpen, dmReplyText, goToNextSlide]);

  // Pause/resume video story when user holds screen or opens viewers/reply sheet
  useEffect(() => {
    const vid = storyVideoRef.current;
    if (!vid || !isCurrentSlideVideo) return;
    const shouldPause = isPaused || viewersSheetOpen || dmReplyText.trim().length > 0;
    if (shouldPause) {
      vid.pause();
    } else {
      void vid.play().catch(() => {
        // Fallback if unmuted autoplay blocked by browser policy
        vid.muted = true;
        setStatusVideoMuted(true);
        void vid.play().catch(() => {});
      });
    }
  }, [isCurrentSlideVideo, currentSlide?.id, isPaused, viewersSheetOpen, dmReplyText]);

  const handleOpenAddStatus = () => {
    if (!user) {
      onSignIn('chat');
      return;
    }
    if (isSuspended) {
      onToast(
        tr('Akaunti yako imesimamishwa kuweka status.', 'Your account is suspended from posting statuses.'),
        'error'
      );
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isVideo =
      file.type.startsWith('video/') ||
      /\.(mp4|mov|webm|m4v|3gp|mkv|avi|mpeg)$/i.test(file.name);

    if (isVideo) {
      setStagedMediaType('video');
      setStagedImageUrl('');
      setStagedVideoUrl('');
      setStagedDurationSec(0);
      setUploadProgress(0);
      setUploadingImage(true);
      setComposerOpen(true);
      try {
        const res = await uploadVideoToCloudinary(file, (pct) => setUploadProgress(pct));
        setStagedVideoUrl(res.secureUrl);
        setStagedImageUrl(
          res.thumbnailUrl || 'https://res.cloudinary.com/demo/image/upload/w_720,f_jpg/sample.jpg'
        );
        setStagedDurationSec(res.durationSec || 0);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kupakia video ya Status.', 'Failed to upload status video.');
        onToast(msg, 'error');
        setComposerOpen(false);
      } finally {
        setUploadingImage(false);
      }
      return;
    }

    setStagedMediaType('image');
    setStagedVideoUrl('');
    setStagedDurationSec(0);
    setPendingCropFile(file);
  };

  const handleConfirmCroppedImage = async (resizedFile: File) => {
    setPendingCropFile(null);
    setStagedMediaType('image');
    setStagedVideoUrl('');
    setStagedDurationSec(0);
    setUploadProgress(0);
    setUploadingImage(true);
    setComposerOpen(true);
    try {
      const url = await uploadImageToCloudinary(resizedFile);
      setStagedImageUrl(url);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha ya Status.', 'Failed to upload status photo.');
      onToast(msg, 'error');
      setComposerOpen(false);
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePublishStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const ready =
      stagedMediaType === 'video' ? Boolean(stagedVideoUrl) : Boolean(stagedImageUrl);
    if (!user || !ready || publishing || uploadingImage) return;
    if (privacyMode === 'selected' && selectedViewerIds.length === 0) {
      onToast(
        tr(
          'Chagua angalau mtu mmoja wa kuona status hii ya siri.',
          'Select at least one member to share this private status with.'
        ),
        'error'
      );
      return;
    }
    setPublishing(true);
    try {
      await createMchartStatus(user, userDisplayName, userPhoto, {
        mediaType: stagedMediaType,
        imageUrl: stagedImageUrl,
        videoUrl: stagedMediaType === 'video' ? stagedVideoUrl : '',
        durationSec: stagedMediaType === 'video' ? stagedDurationSec : 0,
        caption,
        privacy: privacyMode,
        allowedViewerIds: privacyMode === 'selected' ? selectedViewerIds : [],
      });
      setComposerOpen(false);
      setStagedMediaType('image');
      setStagedImageUrl('');
      setStagedVideoUrl('');
      setStagedDurationSec(0);
      setCaption('');
      setPrivacyMode('members');
      setSelectedViewerIds([]);
      setViewerSearch('');
      onToast(
        stagedMediaType === 'video'
          ? tr('Status yako ya video imechapishwa (Saa 24).', 'Your 24h video status has been posted.')
          : tr('Status yako ya picha imechapishwa (Saa 24).', 'Your 24h photo status has been posted.')
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kuchapisha status.', 'Failed to post status.'),
        'error'
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteCurrentStatus = (status: MchartStatus) => {
    onRequestConfirm({
      title: tr('Futa Status Hii?', 'Delete This Status?'),
      message: tr(
        'Picha hii ya Status itaondolewa mara moja kwa watu wote.',
        'This status photo will be permanently removed for all viewers.'
      ),
      confirmLabel: tr('Futa Status', 'Delete Status'),
      destructive: true,
      action: async () => {
        await deleteMchartStatus(status.id);
        setViewersSheetOpen(false);
        setViewerGroupAuthorId(null);
        onToast(tr('Status imefutwa.', 'Status deleted.'));
      },
    });
  };

  const handleSendStatusDmReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSlide || !user) {
      onSignIn('chat');
      return;
    }
    const clean = dmReplyText.trim();
    if (!clean || sendingDmReply) return;
    setSendingDmReply(true);
    try {
      const prefix = currentSlide.caption
        ? `[Status: "${currentSlide.caption.slice(0, 45)}"] ${clean}`
        : `[Kuhusu Status yako ya picha] ${clean}`;
      await onStartPrivateChatWith(
        {
          uid: currentSlide.authorId,
          displayName: currentSlide.authorName,
          photoURL: currentSlide.authorPhoto,
        },
        prefix
      );
      setDmReplyText('');
      setViewerGroupAuthorId(null);
      onToast(
        tr(
          `Jibu lako la siri limetumwa kwa ${currentSlide.authorName}.`,
          `Your private reply was sent to ${currentSlide.authorName}.`
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma jibu.', 'Failed to send reply.'),
        'error'
      );
    } finally {
      setSendingDmReply(false);
    }
  };

  const filteredMemberCandidates = useMemo(() => {
    const q = viewerSearch.trim().toLowerCase();
    return memberCandidates.filter((m) => {
      if (user && m.uid === user.uid) return false;
      if (!q) return true;
      return m.displayName.toLowerCase().includes(q);
    });
  }, [memberCandidates, viewerSearch, user]);

  const latestMyStatus = myStatuses.length > 0 ? myStatuses[myStatuses.length - 1] : null;

  return (
    <div
      className={
        embedded
          ? 'rounded-2xl border border-slate-200 bg-white shadow-xs'
          : 'h-full overflow-y-auto bg-[#F4F7FA] px-3 py-4 sm:px-5 sm:py-5'
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp,.mp4,.mov,.webm,.m4v,.3gp"
        onChange={handleFileSelected}
        className="hidden"
      />

      {embedded ? (
        <div className="p-3 sm:p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {tr('Status za Picha & Video (Saa 24)', 'Photo & Video Status (24h)')}
              </h3>
              {activeStatuses.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-[#075E54] tabular-nums">
                  {activeStatuses.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenAddStatus}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-[#075E54] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#064E46]"
            >
              <Plus className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
              <span>{tr('Weka Status', 'Add Status')}</span>
            </button>
          </div>

          <div className="flex items-start gap-3 overflow-x-auto pb-1">
            {/* My Status Ring */}
            <div className="flex w-16 shrink-0 flex-col items-center">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (myStatuses.length > 0 && user) {
                      setViewerGroupAuthorId(user.uid);
                      setViewerSlideIndex(0);
                      setStoryProgress(0);
                    } else {
                      handleOpenAddStatus();
                    }
                  }}
                  className="block rounded-full focus:outline-none"
                  aria-label={tr('Status Yangu', 'My Status')}
                >
                  <div
                    className={`rounded-full p-[2.5px] ${
                      myStatuses.length > 0
                        ? 'bg-gradient-to-tr from-[#00A884] to-[#25D366]'
                        : 'bg-slate-200'
                    }`}
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-100">
                      {latestMyStatus?.imageUrl ? (
                        <img
                          src={optimizeCloudinaryUrl(latestMyStatus.imageUrl, 160)}
                          alt={tr('Status Yangu', 'My Status')}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Avatar name={userDisplayName} photoURL={userPhoto} size="md" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddStatus}
                  aria-label={tr('Ongeza picha kwenye status', 'Add photo status')}
                  className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00A884] text-white shadow-xs hover:bg-[#075E54]"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <span className="mt-1 w-full truncate text-center text-[11px] font-semibold text-slate-800">
                {myStatuses.length > 0
                  ? tr(`Yangu (${myStatuses.length})`, `Mine (${myStatuses.length})`)
                  : tr('Weka Yako', 'My Status')}
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-3">
                {[1, 2, 3].map((k) => (
                  <div key={k} className="flex w-16 shrink-0 flex-col items-center gap-1 animate-pulse">
                    <div className="h-14 w-14 rounded-full bg-slate-200" />
                    <div className="h-2.5 w-12 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : otherGroups.length === 0 ? (
              <div className="flex flex-1 items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">
                {myStatuses.length > 0
                  ? tr(
                      'Status yako iko hewani! Gusa duara lako kuona picha au idadi ya waliotazama.',
                      'Your status is live! Tap your circle to view it or check who viewed.'
                    )
                  : tr(
                      'Hakuna status ya mwanachama mwingine sasa. Kuwa wa kwanza kuweka picha!',
                      'No active member statuses yet. Tap Add Status to share a 24h photo!'
                    )}
              </div>
            ) : (
              otherGroups.map((group) => {
                const latest = group.items[group.items.length - 1];
                return (
                  <button
                    key={group.authorId}
                    type="button"
                    onClick={() => {
                      setViewerGroupAuthorId(group.authorId);
                      const firstUnseenIdx = group.items.findIndex((item) => !seenIds.has(item.id));
                      setViewerSlideIndex(firstUnseenIdx >= 0 ? firstUnseenIdx : 0);
                      setStoryProgress(0);
                      setViewersSheetOpen(false);
                    }}
                    className="flex w-16 shrink-0 flex-col items-center focus:outline-none"
                  >
                    <div className="relative">
                      <div
                        className={`rounded-full p-[2.5px] ${
                          group.hasUnseen
                            ? 'bg-gradient-to-tr from-[#00A884] to-[#25D366]'
                            : 'bg-slate-300'
                        }`}
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-100">
                          {latest?.imageUrl ? (
                            <img
                              src={optimizeCloudinaryUrl(latest.imageUrl, 160)}
                              alt={group.authorName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Avatar name={group.authorName} photoURL={group.authorPhoto} size="md" />
                            </div>
                          )}
                        </div>
                      </div>
                      {group.hasPrivate && (
                        <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-amber-500 text-white">
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <span className="mt-1 w-full truncate text-center text-[11px] font-semibold text-slate-700">
                      {group.authorName}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Privacy Promise Pill */}
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-[#064E46]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00A884]" aria-hidden="true" />
            <p className="leading-relaxed">
              {tr(
                'Status za Mchart ni kwa wanachama waliosajiliwa pekee na hufutika kiotomatiki baada ya saa 24. Unaweza pia kuchagua watu maalum pekee waone status yako.',
                'Mchart Statuses are private to signed-in members only and expire automatically after 24 hours. You can restrict each status to selected people only.'
              )}
            </p>
          </div>

          {/* My Status Card */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between gap-3 p-4">
              <button
                type="button"
                onClick={() => {
                  if (myStatuses.length > 0 && user) {
                    setViewerGroupAuthorId(user.uid);
                    setViewerSlideIndex(0);
                    setStoryProgress(0);
                  } else {
                    handleOpenAddStatus();
                  }
                }}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="relative shrink-0">
                  <div
                    className={`rounded-full p-[2.5px] ${
                      myStatuses.length > 0
                        ? 'bg-gradient-to-tr from-[#00A884] to-[#25D366]'
                        : 'bg-slate-200'
                    }`}
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-slate-100">
                      {latestMyStatus?.imageUrl ? (
                        <img
                          src={optimizeCloudinaryUrl(latestMyStatus.imageUrl, 160)}
                          alt={tr('Status Yangu', 'My Status')}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Avatar name={userDisplayName} photoURL={userPhoto} size="md" />
                        </div>
                      )}
                    </div>
                  </div>
                  {myStatuses.length === 0 && (
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00A884] text-white">
                      <Plus className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {tr('Status Yangu', 'My Status')}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {myStatuses.length > 0
                      ? tr(
                          `Status ${myStatuses.length} hewani · Bonyeza kutazama au kuona waliotazama`,
                          `${myStatuses.length} active status(es) · Tap to view & see viewers`
                        )
                      : tr(
                          'Bonyeza kuweka picha au video ya Status (Saa 24)',
                          'Tap to post a new 24h photo or video status'
                        )}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenAddStatus}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-[#075E54] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#064E46]"
              >
                <Camera className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                <span>{tr('Weka Status', 'Add Status')}</span>
              </button>
            </div>
          </section>

          {/* Active Statuses List */}
          {!user ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center shadow-xs">
              <Lock className="mx-auto h-8 w-8 text-[#075E54]" aria-hidden="true" />
              <h3 className="mt-2.5 text-sm font-bold text-slate-900">
                {tr(
                  'Ingia kuona na kuweka Status za Picha',
                  'Sign in to view & post Photo Statuses'
                )}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">
                {tr(
                  'Ili kulinda faragha za wanachama, Status za Mchart huonekana kwa wanachama walioingia kwenye akaunti pekee.',
                  'To protect member privacy, Mchart Statuses are visible only to signed-in members.'
                )}
              </p>
              <button
                type="button"
                onClick={() => onSignIn('chat')}
                className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#075E54] px-5 py-2 text-xs font-bold text-white hover:bg-[#064E46]"
              >
                <span>{tr('Ingia / Fungua Akaunti', 'Sign In')}</span>
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((k) => (
                <div
                  key={k}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 animate-pulse"
                >
                  <div className="h-12 w-12 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-36 rounded bg-slate-200" />
                    <div className="h-3 w-24 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {tr('Status za Wanachama (Saa 24)', 'Member Updates (24h)')}
                </h3>
              </div>

              {otherGroups.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Camera className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {tr(
                      'Hakuna Status mpya za wanachama wengine kwa sasa.',
                      'No active statuses from other members yet.'
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {tr(
                      'Kuwa wa kwanza kushiriki picha ya leo na wana Malosha!',
                      'Be the first to share a 24h photo status today!'
                    )}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {otherGroups.map((group) => {
                    const latest = group.items[group.items.length - 1];
                    return (
                      <button
                        key={group.authorId}
                        type="button"
                        onClick={() => {
                          setViewerGroupAuthorId(group.authorId);
                          const firstUnseenIdx = group.items.findIndex((item) => !seenIds.has(item.id));
                          setViewerSlideIndex(firstUnseenIdx >= 0 ? firstUnseenIdx : 0);
                          setStoryProgress(0);
                          setViewersSheetOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <div
                          className={`shrink-0 rounded-full p-[2.5px] ${
                            group.hasUnseen
                              ? 'bg-gradient-to-tr from-[#00A884] to-[#25D366]'
                              : 'bg-slate-300'
                          }`}
                        >
                          <div className="rounded-full bg-white p-0.5">
                            <Avatar name={group.authorName} photoURL={group.authorPhoto} size="md" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-900">
                              {group.authorName}
                            </span>
                            <AuthorVerificationBadge uid={group.authorId} size="xs" />
                            {group.hasPrivate && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                                {tr('Siri', 'Private')}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {group.items.length > 1
                              ? tr(
                                  `Picha ${group.items.length} · ${formatTime(latest?.createdAt || null)}`,
                                  `${group.items.length} photos · ${formatTime(latest?.createdAt || null)}`
                                )
                              : formatTime(latest?.createdAt || null)}
                          </p>
                        </div>

                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {latest?.imageUrl && (
                            <img
                              src={optimizeCloudinaryUrl(latest.imageUrl, 160)}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Image Crop Modal for Status */}
      <ImageResizeModal
        file={pendingCropFile}
        defaultPreset="4:5"
        onCancel={() => setPendingCropFile(null)}
        onConfirm={(resizedFile) => void handleConfirmCroppedImage(resizedFile)}
      />

      {/* New Status Composer Modal (Portaled above MobileBottomNav with pinned submit footer) */}
      {composerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tr('Weka Status ya Picha', 'Create Photo Status')}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))] sm:p-4"
          >
            <div className="flex max-h-[84dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between bg-[#075E54] px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                  {stagedMediaType === 'video' ? (
                    <Film className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  ) : (
                    <Camera className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  )}
                  <h3 className="text-sm font-bold">
                    {stagedMediaType === 'video'
                      ? tr('Chapisha Status ya Video (Saa 24)', 'Post 24h Video Status')
                      : tr('Chapisha Status ya Picha (Saa 24)', 'Post 24h Photo Status')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setStagedMediaType('image');
                    setStagedImageUrl('');
                    setStagedVideoUrl('');
                    setStagedDurationSec(0);
                    setCaption('');
                  }}
                  aria-label={tr('Funga', 'Close')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handlePublishStatus} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
                  {uploadingImage ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <Loader2 className="h-6 w-6 animate-spin text-[#075E54]" />
                      <span>
                        {stagedMediaType === 'video'
                          ? tr(
                              `Inapakia video ya Status... ${uploadProgress > 0 ? `${uploadProgress}%` : ''}`,
                              `Uploading status video... ${uploadProgress > 0 ? `${uploadProgress}%` : ''}`
                            )
                          : tr('Inapakia picha ya Status...', 'Uploading status photo...')}
                      </span>
                    </div>
                  ) : stagedMediaType === 'video' && stagedVideoUrl ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
                      <video
                        src={optimizeCloudinaryVideoPlaybackUrl(stagedVideoUrl)}
                        poster={stagedImageUrl || undefined}
                        controls
                        playsInline
                        className="mx-auto max-h-52 w-full object-contain"
                      />
                    </div>
                  ) : stagedImageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                      <img
                        src={stagedImageUrl}
                        alt={tr('Hakiki ya Status', 'Status preview')}
                        className="mx-auto max-h-52 w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {tr('Maelezo mafupi kwenye picha (hiari)', 'Caption (optional)')}
                    </label>
                    <input
                      type="text"
                      maxLength={280}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder={tr('Andika ujumbe mfupi...', 'Add a short caption...')}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-[#075E54] focus:bg-white focus:outline-none"
                    />
                  </div>

                  {/* Privacy Selector */}
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Lock className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                      <span>{tr('Faragha ya Status (Nani Aone?)', 'Status Privacy (Who Can View?)')}</span>
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPrivacyMode('members')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                          privacyMode === 'members'
                            ? 'border-[#075E54] bg-[#075E54] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Wanachama Wote', 'All Members')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrivacyMode('selected')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                          privacyMode === 'selected'
                            ? 'border-[#075E54] bg-[#075E54] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Watu Maalum Tu', 'Selected Only')}</span>
                      </button>
                    </div>

                    {privacyMode === 'selected' && (
                      <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                        <input
                          type="search"
                          value={viewerSearch}
                          onChange={(e) => setViewerSearch(e.target.value)}
                          placeholder={tr('Tafuta majina ya kuwaruhusu...', 'Search members to allow...')}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#075E54] focus:outline-none"
                        />
                        <div className="max-h-36 space-y-1 overflow-y-auto">
                          {filteredMemberCandidates.length === 0 ? (
                            <p className="py-2 text-center text-[11px] text-slate-500">
                              {tr(
                                'Hakuna majina yanayolingana kwa sasa.',
                                'No matching members found right now.'
                              )}
                            </p>
                          ) : (
                            filteredMemberCandidates.slice(0, 30).map((m) => {
                              const checked = selectedViewerIds.includes(m.uid);
                              return (
                                <label
                                  key={m.uid}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedViewerIds((prev) =>
                                        checked
                                          ? prev.filter((id) => id !== m.uid)
                                          : prev.length < 50
                                            ? [...prev, m.uid]
                                            : prev
                                      );
                                    }}
                                    className="h-4 w-4 accent-[#075E54]"
                                  />
                                  <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                                  <span className="truncate font-semibold text-slate-800">
                                    {m.displayName}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-[#075E54]">
                          {tr(
                            `Walioteuliwa: ${selectedViewerIds.length}/50`,
                            `Selected: ${selectedViewerIds.length}/50`
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pinned Submit Footer - Always Visible Above Mobile Navigation */}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(false);
                      setStagedMediaType('image');
                      setStagedImageUrl('');
                      setStagedVideoUrl('');
                      setStagedDurationSec(0);
                    }}
                    className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {tr('Ghairi', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      uploadingImage ||
                      (stagedMediaType === 'video' ? !stagedVideoUrl : !stagedImageUrl) ||
                      publishing
                    }
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#00A884] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#008F6F] disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {publishing
                        ? tr('Inachapisha...', 'Posting...')
                        : tr('Chapisha Status', 'Post Status')}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Fullscreen WhatsApp-Style Story Viewer (Portaled above bottom navigation) */}
      {activeGroup &&
        currentSlide &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={activeGroup.authorName}
            className="fixed inset-0 z-[90] flex flex-col bg-black text-white select-none"
            onPointerDown={() => setIsPaused(true)}
            onPointerUp={() => setIsPaused(false)}
            onPointerCancel={() => setIsPaused(false)}
          >
          {/* Progress Bars */}
          <div className="mx-auto flex w-full max-w-2xl gap-1.5 px-3 pt-3">
            {activeGroup.items.map((item, idx) => {
              const widthPct =
                idx < viewerSlideIndex
                  ? 100
                  : idx === viewerSlideIndex
                    ? Math.min(100, Math.max(0, storyProgress))
                    : 0;
              return (
                <div
                  key={item.id}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
                >
                  <div
                    className="h-full rounded-full bg-white transition-all duration-75"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Story Header */}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar
                name={activeGroup.authorName}
                photoURL={activeGroup.authorPhoto}
                size="sm"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-white">
                    {user && activeGroup.authorId === user.uid
                      ? tr('Status Yangu', 'My Status')
                      : activeGroup.authorName}
                  </p>
                  <AuthorVerificationBadge uid={activeGroup.authorId} size="xs" />
                  {currentSlide.privacy === 'selected' && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      {tr('Siri', 'Private')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/75">
                  {formatTime(currentSlide.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isCurrentSlideVideo && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatusVideoMuted((prev) => !prev);
                  }}
                  aria-label={
                    statusVideoMuted
                      ? tr('Washa sauti ya video', 'Unmute status video')
                      : tr('Zima sauti ya video', 'Mute status video')
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  {statusVideoMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              )}
              {user && currentSlide.authorId === user.uid && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCurrentStatus(currentSlide);
                  }}
                  aria-label={tr('Futa status', 'Delete status')}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-red-300 hover:bg-red-500/30 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerGroupAuthorId(null);
                  setViewersSheetOpen(false);
                }}
                aria-label={tr('Funga status', 'Close status viewer')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Story Media Area (Photo or Video) with Left/Right Tap Navigation */}
          <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 items-center justify-center overflow-hidden px-2">
            {isCurrentSlideVideo && currentSlide.videoUrl ? (
              <video
                key={currentSlide.id}
                ref={storyVideoRef}
                src={optimizeCloudinaryVideoPlaybackUrl(currentSlide.videoUrl)}
                poster={currentSlide.imageUrl || undefined}
                autoPlay
                playsInline
                muted={statusVideoMuted}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                    setStoryProgress(Math.min(100, (vid.currentTime / vid.duration) * 100));
                  }
                }}
                onEnded={() => {
                  setStoryProgress(100);
                  goToNextSlide();
                }}
                className="max-h-full max-w-full rounded-xl object-contain"
              />
            ) : (
              <img
                src={currentSlide.imageUrl}
                alt={currentSlide.caption || activeGroup.authorName}
                className="max-h-full max-w-full rounded-xl object-contain"
                referrerPolicy="no-referrer"
              />
            )}

            {/* Tap Zones */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevSlide();
              }}
              aria-label={tr('Iliyotangulia', 'Previous status')}
              className="absolute inset-y-0 left-0 w-1/3 cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToNextSlide();
              }}
              aria-label={tr('Inayofuata', 'Next status')}
              className="absolute inset-y-0 right-0 w-2/3 cursor-pointer focus:outline-none"
            />

            {/* Subtle Desktop Arrows */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevSlide();
              }}
              aria-label={tr('Iliyotangulia', 'Previous')}
              className="hidden sm:flex absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToNextSlide();
              }}
              aria-label={tr('Inayofuata', 'Next')}
              className="hidden sm:flex absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Caption + Bottom Action Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-2xl space-y-2.5 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pt-3 pb-4"
          >
            {currentSlide.caption && (
              <p className="text-center text-sm leading-relaxed text-white">
                {currentSlide.caption}
              </p>
            )}

            {user && currentSlide.authorId === user.uid ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setViewersSheetOpen((prev) => !prev)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/25"
                >
                  <Eye className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  <span>
                    {tr(
                      `Waliotazama: ${currentSlide.viewsCount}`,
                      `Viewed by: ${currentSlide.viewsCount}`
                    )}
                  </span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendStatusDmReply} className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 ring-1 ring-white/20">
                  <MessageCircle className="h-4 w-4 shrink-0 text-[#25D366]" aria-hidden="true" />
                  <input
                    type="text"
                    maxLength={500}
                    value={dmReplyText}
                    onChange={(e) => setDmReplyText(e.target.value)}
                    placeholder={tr(
                      `Jibu binafsi (DM) kwa ${currentSlide.authorName}...`,
                      `Reply privately to ${currentSlide.authorName}...`
                    )}
                    className="w-full bg-transparent text-sm text-white placeholder-white/65 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!dmReplyText.trim() || sendingDmReply}
                  aria-label={tr('Tuma jibu binafsi', 'Send private reply')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white hover:bg-[#008F6F] disabled:opacity-45"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>

          {/* Owner-Only Viewers Slide-up Sheet */}
          {viewersSheetOpen && user && currentSlide.authorId === user.uid && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[55vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl"
            >
              <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Eye className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  <span>
                    {tr(
                      `Waliotazama Status Yako (${statusViewers.length})`,
                      `Viewed by (${statusViewers.length})`
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewersSheetOpen(false)}
                  aria-label={tr('Funga', 'Close')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto p-3">
                {loadingViewers ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {tr('Inapakia waliotazama...', 'Loading viewers...')}
                  </p>
                ) : statusViewers.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {tr('Bado hakuna aliyetazama status hii.', 'No views recorded yet.')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {statusViewers.map((v) => (
                      <div key={v.viewerId} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={v.viewerName} photoURL={v.viewerPhoto} size="sm" />
                          <span className="text-sm font-semibold text-slate-900">
                            {v.viewerName}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {formatTime(v.viewedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
