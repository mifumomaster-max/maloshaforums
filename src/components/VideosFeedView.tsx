import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FastForward,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Monitor,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Reply as ReplyIcon,
  Send,
  Settings2,
  Share2,
  Shuffle,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Video as VideoIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import {
  buildWatermarkedVideoDownloadUrl,
  downloadWatermarkedPhoto,
  ensureMaloshaWatermarkLogoPublicId,
  uploadAudioToCloudinary,
  uploadPhotoCarouselToCloudinary,
  uploadVideoToCloudinary,
} from '../services/cloudinaryService';
import {
  addVideoComment,
  checkIsFollowingUser,
  createVideoPost,
  deleteVideoComment,
  deleteVideoPost,
  incrementVideoShareCount,
  toggleFollowUser,
  toggleVideoLike,
  updateVideoSettings,
} from '../services/forumService';
import { VideoAutoReplyTrigger, VideoComment, VideoPost } from '../types';
import { Avatar } from './Avatar';
import { AuthorVerificationBadge } from './VerificationBadge';

interface VideosFeedViewProps {
  videos: VideoPost[];
  loading: boolean;
  likedVideoIds: Set<string>;
  user: User | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  uploadModalSignal?: number;
  initialVideoId?: string | null;
  onBack?: () => void;
  onAuthorClick?: (author: { uid: string; displayName: string; photoURL?: string }) => void;
  onSignIn: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

interface CreatorDefaultSettings {
  allowComments: boolean;
  allowDownload: boolean;
  allowLikes: boolean;
  showLikeCount: boolean;
  autoReplyEnabled: boolean;
  autoReplyTrigger: VideoAutoReplyTrigger;
  autoReplyKeyword: string;
  autoReplyMessage: string;
}

const BOOKMARKED_VIDEOS_KEY = 'malosha_bookmarked_videos_v1';
const CREATOR_TIKTOK_DEFAULTS_KEY = 'malosha_tiktok_creator_defaults_v1';
const AUTO_NEXT_VIDEO_KEY = 'malosha_video_autonext_v1';
const DESKTOP_FRAME_MODE_KEY = 'malosha_video_desktop_frame_v1';

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = (seed >>> 0) || 1;
  const nextRand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DEFAULT_CREATOR_SETTINGS: CreatorDefaultSettings = {
  allowComments: true,
  allowDownload: true,
  allowLikes: true,
  showLikeCount: true,
  autoReplyEnabled: false,
  autoReplyTrigger: 'all',
  autoReplyKeyword: '',
  autoReplyMessage: 'Asante sana kwa maoni yako! Karibu tuwasiliane pia kupitia Mchart.',
};

function loadCreatorDefaultSettings(): CreatorDefaultSettings {
  if (typeof window === 'undefined') return DEFAULT_CREATOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CREATOR_TIKTOK_DEFAULTS_KEY);
    if (!raw) return DEFAULT_CREATOR_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CreatorDefaultSettings>;
    return {
      allowComments: parsed.allowComments !== false,
      allowDownload: parsed.allowDownload !== false,
      allowLikes: parsed.allowLikes !== false,
      showLikeCount: parsed.showLikeCount !== false,
      autoReplyEnabled: Boolean(parsed.autoReplyEnabled),
      autoReplyTrigger: parsed.autoReplyTrigger === 'keyword' ? 'keyword' : 'all',
      autoReplyKeyword: typeof parsed.autoReplyKeyword === 'string' ? parsed.autoReplyKeyword : '',
      autoReplyMessage:
        typeof parsed.autoReplyMessage === 'string' && parsed.autoReplyMessage.trim()
          ? parsed.autoReplyMessage
          : DEFAULT_CREATOR_SETTINGS.autoReplyMessage,
    };
  } catch {
    return DEFAULT_CREATOR_SETTINGS;
  }
}

function formatCompactCount(n: number): string {
  const clean = Math.max(0, Number(n || 0));
  if (clean >= 1_000_000) return `${(clean / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (clean >= 1_000) return `${(clean / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(clean);
}

function formatDurationMMSS(sec: number): string {
  const total = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const VideosFeedView: React.FC<VideosFeedViewProps> = ({
  videos,
  loading,
  likedVideoIds,
  user,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended = false,
  uploadModalSignal = 0,
  initialVideoId = null,
  onBack,
  onAuthorClick,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime } = useLanguage();
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [feedMode, setFeedMode] = useState<'mix' | 'foryou' | 'following' | 'saved' | 'private'>('mix');
  const [mixSeed, setMixSeed] = useState<number>(() => Math.floor(Math.random() * 900_000) + 1000);
  const [justPublishedId, setJustPublishedId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [pausedByTap, setPausedByTap] = useState(false);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);
  const [autoScrollNext, setAutoScrollNext] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem(AUTO_NEXT_VIDEO_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [desktopFrameMode, setDesktopFrameMode] = useState<'mobile' | 'wide'>(() => {
    if (typeof window === 'undefined') return 'mobile';
    try {
      const saved = window.localStorage.getItem(DESKTOP_FRAME_MODE_KEY);
      return saved === 'wide' ? 'wide' : 'mobile';
    } catch {
      return 'mobile';
    }
  });
  const [clearScreenMode, setClearScreenMode] = useState(false);

  const [photoSlideByVideoId, setPhotoSlideByVideoId] = useState<Record<string, number>>({});
  const [progressById, setProgressById] = useState<Record<string, { current: number; duration: number }>>({});
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [heartBurst, setHeartBurst] = useState<{ id: string; key: number; x: number; y: number } | null>(null);

  const [followingByAuthor, setFollowingByAuthor] = useState<Record<string, boolean>>({});
  const [followBusyByAuthor, setFollowBusyByAuthor] = useState<Record<string, boolean>>({});
  const [likeBusyIds, setLikeBusyIds] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(BOOKMARKED_VIDEOS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });

  // Comments drawer state
  const [commentsVideoId, setCommentsVideoId] = useState<string | null>(null);
  const [videoComments, setVideoComments] = useState<VideoComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingToComment, setReplyingToComment] = useState<VideoComment | null>(null);
  const [sendingComment, setSendingComment] = useState(false);

  // Settings / Post Options / Sound Drawer states
  const [settingsVideoId, setSettingsVideoId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [soundDrawerVideo, setSoundDrawerVideo] = useState<VideoPost | null>(null);

  // Live edit state inside Settings drawer for post owner
  const [editCaption, setEditCaption] = useState('');
  const [editSoundName, setEditSoundName] = useState('');
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [editAllowDownload, setEditAllowDownload] = useState(true);
  const [editAllowLikes, setEditAllowLikes] = useState(true);
  const [editShowLikeCount, setEditShowLikeCount] = useState(true);
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [editAutoReplyEnabled, setEditAutoReplyEnabled] = useState(false);
  const [editAutoReplyTrigger, setEditAutoReplyTrigger] = useState<VideoAutoReplyTrigger>('all');
  const [editAutoReplyKeyword, setEditAutoReplyKeyword] = useState('');
  const [editAutoReplyMessage, setEditAutoReplyMessage] = useState('');

  // Upload Studio Modal state (Video OR Multi-Photo Carousel + Music + TikTok Settings)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMediaType, setUploadMediaType] = useState<'video' | 'photo'>('video');
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const photoFilesInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Video upload state
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [detectedDuration, setDetectedDuration] = useState(0);

  // Photo carousel upload state
  const [selectedPhotos, setSelectedPhotos] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [studioPhotoPreviewIdx, setStudioPhotoPreviewIdx] = useState(0);

  // Audio / Music upload state
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [reusedAudioUrl, setReusedAudioUrl] = useState('');
  const [audioPreviewPlaying, setAudioPreviewPlaying] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('');

  // Metadata + Settings inside Upload Studio
  const [captionInput, setCaptionInput] = useState('');
  const [soundInput, setSoundInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [studioShowSettings, setStudioShowSettings] = useState(false);
  const [studioSettings, setStudioSettings] = useState<CreatorDefaultSettings>(() =>
    loadCreatorDefaultSettings()
  );
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadStageLabel, setUploadStageLabel] = useState('');

  // Available reusable community tracks extracted from existing posts with audioUrl
  const reusableCommunityTracks = useMemo(() => {
    const map = new Map<string, { soundName: string; audioUrl: string; authorName: string }>();
    for (const v of videos) {
      if (v.audioUrl && v.audioUrl.startsWith('https://') && !map.has(v.audioUrl)) {
        map.set(v.audioUrl, {
          soundName: v.soundName || `Sauti - ${v.authorName}`,
          audioUrl: v.audioUrl,
          authorName: v.authorName,
        });
      }
    }
    return Array.from(map.values()).slice(0, 12);
  }, [videos]);

  // Open uploader when global floating + button pressed while on Video tab
  const prevSignalRef = useRef(uploadModalSignal);
  useEffect(() => {
    if (uploadModalSignal > prevSignalRef.current) {
      prevSignalRef.current = uploadModalSignal;
      if (!user) {
        onToast(
          tr('Ingia kwanza ili kupakia video au picha.', 'Sign in first to post a video or photo.'),
          'error'
        );
        onSignIn();
        return;
      }
      if (isSuspended && !isAdmin) {
        onToast(
          tr('Akaunti yako imefungwa. Huwezi kupakia maudhui.', 'Your account is closed.'),
          'error'
        );
        return;
      }
      setUploadOpen(true);
    }
  }, [uploadModalSignal, user, isSuspended, isAdmin, onSignIn, onToast, tr]);

  // Pre-warm Malosha watermark badge on Cloudinary silently in background
  useEffect(() => {
    void ensureMaloshaWatermarkLogoPublicId();
  }, []);

  // Sync owner settings form when opening Settings drawer for a specific video
  const activeSettingsVideo = useMemo(
    () => videos.find((v) => v.id === settingsVideoId) || null,
    [videos, settingsVideoId]
  );

  useEffect(() => {
    if (!activeSettingsVideo) return;
    setEditCaption(activeSettingsVideo.caption || '');
    setEditSoundName(activeSettingsVideo.soundName || '');
    setEditAllowComments(activeSettingsVideo.allowComments !== false);
    setEditAllowDownload(activeSettingsVideo.allowDownload !== false);
    setEditAllowLikes(activeSettingsVideo.allowLikes !== false);
    setEditShowLikeCount(activeSettingsVideo.showLikeCount !== false);
    setEditIsPrivate(Boolean(activeSettingsVideo.isArchived));
    setEditAutoReplyEnabled(Boolean(activeSettingsVideo.autoReplyEnabled));
    setEditAutoReplyTrigger(activeSettingsVideo.autoReplyTrigger === 'keyword' ? 'keyword' : 'all');
    setEditAutoReplyKeyword(activeSettingsVideo.autoReplyKeyword || '');
    setEditAutoReplyMessage(
      activeSettingsVideo.autoReplyMessage ||
        loadCreatorDefaultSettings().autoReplyMessage
    );
  }, [activeSettingsVideo]);

  const ownPrivateCount = useMemo(
    () => videos.filter((v) => v.isArchived && user && v.authorId === user.uid).length,
    [videos, user]
  );

  // Persist bookmarks locally
  const toggleBookmark = useCallback(
    (videoId: string) => {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        const added = !next.has(videoId);
        if (added) next.add(videoId);
        else next.delete(videoId);
        try {
          window.localStorage.setItem(BOOKMARKED_VIDEOS_KEY, JSON.stringify([...next]));
        } catch {
          // Ignore quota errors
        }
        onToast(
          added
            ? tr('Chapisho limehifadhiwa kwenye Orodha Yako!', 'Post saved to your bookmarks!')
            : tr('Limeondolewa kwenye zilizohifadhiwa.', 'Removed from saved posts.')
        );
        return next;
      });
    },
    [onToast, tr]
  );

  // Check follow statuses for visible creators
  useEffect(() => {
    if (!user?.uid || videos.length === 0) {
      setFollowingByAuthor({});
      return;
    }
    const uniqueAuthors = Array.from(
      new Set(videos.map((v) => v.authorId).filter((aid) => aid && aid !== user.uid))
    );
    let cancelled = false;
    void Promise.all(
      uniqueAuthors.map(async (aid) => {
        const ok = await checkIsFollowingUser(aid, user.uid);
        return [aid, ok] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setFollowingByAuthor((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, videos]);

  const visibleVideos = useMemo(() => {
    if (feedMode === 'following') {
      return videos.filter((v) => !v.isArchived && followingByAuthor[v.authorId]);
    }
    if (feedMode === 'saved') {
      return videos.filter(
        (v) => bookmarkedIds.has(v.id) && (!v.isArchived || (user && v.authorId === user.uid))
      );
    }
    if (feedMode === 'private') {
      return videos.filter((v) => v.isArchived && user && v.authorId === user.uid);
    }
    const publicList = videos.filter((v) => !v.isArchived);
    if (feedMode === 'foryou') {
      return publicList;
    }
    // Mix mode: interleave Newer half & Older half so feed alternates fresh and classic clips
    const pinned = justPublishedId
      ? publicList.find((v) => v.id === justPublishedId) || null
      : null;
    const rest = pinned ? publicList.filter((v) => v.id !== pinned.id) : publicList;
    if (rest.length <= 2) {
      return pinned ? [pinned, ...rest] : rest;
    }
    const mid = Math.ceil(rest.length / 2);
    const newerBucket = seededShuffle(rest.slice(0, mid), mixSeed);
    const olderBucket = seededShuffle(rest.slice(mid), mixSeed + 7919);
    const mixed: VideoPost[] = [];
    const maxLen = Math.max(newerBucket.length, olderBucket.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < newerBucket.length) mixed.push(newerBucket[i]);
      if (i < olderBucket.length) mixed.push(olderBucket[i]);
    }
    return pinned ? [pinned, ...mixed] : mixed;
  }, [videos, feedMode, followingByAuthor, bookmarkedIds, user, mixSeed, justPublishedId]);

  // Deep link jump to a specific video ID if present
  useEffect(() => {
    if (!initialVideoId || visibleVideos.length === 0) return;
    const idx = visibleVideos.findIndex((v) => v.id === initialVideoId);
    if (idx >= 0) {
      setActiveIndex(idx);
      const slide = slideRefs.current[initialVideoId];
      if (slide) {
        slide.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }
  }, [initialVideoId, visibleVideos]);

  // Clamp activeIndex if list shrinks
  useEffect(() => {
    if (visibleVideos.length > 0 && activeIndex >= visibleVideos.length) {
      setActiveIndex(0);
    }
  }, [visibleVideos.length, activeIndex]);

  // Detect active snap slide via IntersectionObserver
  useEffect(() => {
    const root = feedScrollRef.current;
    if (!root || visibleVideos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const vidId = entry.target.getAttribute('data-video-id');
            if (!vidId) continue;
            const idx = visibleVideos.findIndex((v) => v.id === vidId);
            if (idx >= 0) {
              setActiveIndex(idx);
              setPausedByTap(false);
            }
          }
        }
      },
      { root, threshold: [0.65] }
    );

    visibleVideos.forEach((v) => {
      const el = slideRefs.current[v.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleVideos]);

  const activePost = visibleVideos[activeIndex] || null;
  const activeVideoId = activePost?.id || null;

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      if (visibleVideos.length === 0) return;
      const bounded = Math.max(0, Math.min(visibleVideos.length - 1, nextIndex));
      const target = visibleVideos[bounded];
      if (!target) return;
      setPausedByTap(false);
      setActiveIndex(bounded);
      const el = slideRefs.current[target.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [visibleVideos]
  );

  const handleToggleAutoNext = useCallback(() => {
    setAutoScrollNext((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTO_NEXT_VIDEO_KEY, String(next));
      } catch {
        // Non-fatal
      }
      onToast(
        next
          ? tr('Auto-Next Imewashwa: Video inayofuata itacheza moja kwa moja.', 'Auto-Next ON: Next video plays automatically.')
          : tr('Auto-Next Imezimwa: Video itajirudia.', 'Auto-Next OFF: Current video loops.')
      );
      return next;
    });
  }, [onToast, tr]);

  const handleSetDesktopFrameMode = useCallback((mode: 'mobile' | 'wide') => {
    setDesktopFrameMode(mode);
    try {
      window.localStorage.setItem(DESKTOP_FRAME_MODE_KEY, mode);
    } catch {
      // Non-fatal
    }
  }, []);

  const handleReshuffleMix = useCallback(() => {
    setMixSeed(Math.floor(Math.random() * 900_000) + 1000);
    setFeedMode('mix');
    setActiveIndex(0);
    setPausedByTap(false);
    feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    onToast(tr('Video zimechanganywa upya (Mpya & Zamani)!', 'Feed reshuffled (New & Old mix)!'));
  }, [onToast, tr]);

  // Sync HTMLVideoElement & HTMLAudioElement playback, speed, and mute state
  // Data-saver single-stream playback: ONLY active slide mounts <video>/<audio>; unload previous streams immediately
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([vidId, el]) => {
      if (!el) return;
      if (vidId === activeVideoId) {
        el.muted = muted || Boolean(activePost?.audioUrl);
        el.playbackRate = playbackSpeed;
        if (!pausedByTap && !uploadOpen) {
          const playPromise = el.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              if (!el.muted) {
                el.muted = true;
                setMuted(true);
                void el.play().catch(() => {});
              }
            });
          }
        } else {
          el.pause();
        }
      } else {
        el.pause();
        el.removeAttribute('src');
        el.load();
        delete videoRefs.current[vidId];
      }
    });

    Object.entries(audioRefs.current).forEach(([vidId, el]) => {
      if (!el) return;
      if (vidId === activeVideoId) {
        el.muted = muted;
        if (!pausedByTap && !uploadOpen) {
          const playPromise = el.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              if (!el.muted) {
                el.muted = true;
                setMuted(true);
                void el.play().catch(() => {});
              }
            });
          }
        } else {
          el.pause();
        }
      } else {
        el.pause();
        el.removeAttribute('src');
        el.load();
        delete audioRefs.current[vidId];
      }
    });
  }, [activeVideoId, activePost?.audioUrl, pausedByTap, muted, uploadOpen, playbackSpeed]);

  // Auto-advance slides for Photo Carousel posts (or single-photo posts when Auto-Next is ON)
  useEffect(() => {
    if (!activePost || activePost.mediaType !== 'photo') return;
    const totalPhotos = activePost.photoUrls?.length || 0;
    if (pausedByTap || uploadOpen || commentsVideoId || settingsVideoId) {
      return;
    }

    if (totalPhotos <= 1) {
      if (!autoScrollNext || visibleVideos.length <= 1) return;
      const singleTimer = window.setTimeout(() => {
        const nextIdx = activeIndex + 1 < visibleVideos.length ? activeIndex + 1 : 0;
        scrollToIndex(nextIdx);
      }, 6000);
      return () => window.clearTimeout(singleTimer);
    }

    const timer = window.setInterval(() => {
      setPhotoSlideByVideoId((prev) => {
        const current = prev[activePost.id] || 0;
        const next = current + 1;
        if (next >= totalPhotos) {
          if (autoScrollNext && visibleVideos.length > 1) {
            const nextIdx = activeIndex + 1 < visibleVideos.length ? activeIndex + 1 : 0;
            window.setTimeout(() => scrollToIndex(nextIdx), 120);
          }
          return { ...prev, [activePost.id]: 0 };
        }
        return { ...prev, [activePost.id]: next };
      });
    }, 4200);

    return () => window.clearInterval(timer);
  }, [
    activePost,
    pausedByTap,
    uploadOpen,
    commentsVideoId,
    settingsVideoId,
    autoScrollNext,
    activeIndex,
    visibleVideos.length,
    scrollToIndex,
  ]);

  // Release active video/audio streams cleanly when leaving the page or unmounting
  useEffect(() => {
    return () => {
      Object.values(videoRefs.current).forEach((el) => {
        if (!el) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
      Object.values(audioRefs.current).forEach((el) => {
        if (!el) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
      if (previewAudioRef.current) previewAudioRef.current.pause();
    };
  }, []);

  // Keyboard navigation on desktop (ArrowUp / ArrowDown / ArrowLeft / ArrowRight / Space)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (uploadOpen || commentsVideoId || settingsVideoId || soundDrawerVideo) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPausedByTap((p) => !p);
      } else if (activePost?.mediaType === 'photo' && (activePost.photoUrls?.length || 0) > 1) {
        const len = activePost.photoUrls!.length;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setPhotoSlideByVideoId((prev) => ({
            ...prev,
            [activePost.id]: ((prev[activePost.id] || 0) + 1) % len,
          }));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setPhotoSlideByVideoId((prev) => ({
            ...prev,
            [activePost.id]: ((prev[activePost.id] || 0) - 1 + len) % len,
          }));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeIndex,
    activePost,
    scrollToIndex,
    uploadOpen,
    commentsVideoId,
    settingsVideoId,
    soundDrawerVideo,
  ]);

  // Listen to real-time comments when drawer opens
  useEffect(() => {
    if (!commentsVideoId) {
      setVideoComments([]);
      setReplyingToComment(null);
      return;
    }
    setLoadingComments(true);
    const q = query(
      collection(db, 'videos', commentsVideoId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(180)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: VideoComment[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              videoId: String(data.videoId || commentsVideoId),
              authorId: String(data.authorId || ''),
              authorName: String(data.authorName || 'Mwanachama'),
              authorPhoto: String(data.authorPhoto || ''),
              body: String(data.body || ''),
              parentCommentId: typeof data.parentCommentId === 'string' ? data.parentCommentId : '',
              replyToAuthorName:
                typeof data.replyToAuthorName === 'string' ? data.replyToAuthorName : '',
              isAutoReply: Boolean(data.isAutoReply),
              isDeleted: Boolean(data.isDeleted),
              createdAt: (data.createdAt as Timestamp | null) || null,
            };
          })
          .filter((c) => !c.isDeleted);
        setVideoComments(rows);
        setLoadingComments(false);
      },
      () => {
        setLoadingComments(false);
      }
    );
    return () => unsub();
  }, [commentsVideoId]);

  const handleToggleLike = useCallback(
    async (video: VideoPost) => {
      if (video.allowLikes === false && !isAdmin && user?.uid !== video.authorId) {
        onToast(
          tr('Mwandishi amezima Likes kwenye chapisho hili.', 'Likes are disabled by the creator.'),
          'error'
        );
        return;
      }
      if (!user) {
        onToast(tr('Ingia ili kupenda chapisho hili.', 'Sign in to like this post.'), 'error');
        onSignIn();
        return;
      }
      if (isSuspended && !isAdmin) {
        onToast(tr('Akaunti yako imefungwa.', 'Your account is closed.'), 'error');
        return;
      }
      if (likeBusyIds[video.id]) return;
      setLikeBusyIds((prev) => ({ ...prev, [video.id]: true }));
      try {
        await toggleVideoLike(video.id, user.uid, likedVideoIds.has(video.id));
      } catch (err) {
        onToast(
          err instanceof Error ? err.message : tr('Imeshindwa kupenda.', 'Failed to like.'),
          'error'
        );
      } finally {
        setLikeBusyIds((prev) => ({ ...prev, [video.id]: false }));
      }
    },
    [user, isSuspended, isAdmin, likeBusyIds, likedVideoIds, onSignIn, onToast, tr]
  );

  const stepPhotoSlide = useCallback((videoId: string, total: number, delta: number) => {
    if (total <= 1) return;
    setPhotoSlideByVideoId((prev) => ({
      ...prev,
      [videoId]: ((prev[videoId] || 0) + delta + total) % total,
    }));
  }, []);

  const handleStagePointerClick = useCallback(
    (video: VideoPost, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = Date.now();
      const last = lastTapRef.current;

      if (last && last.id === video.id && now - last.time < 280) {
        if (singleTapTimerRef.current) {
          window.clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;
        setHeartBurst({ id: video.id, key: now, x, y });
        window.setTimeout(() => {
          setHeartBurst((curr) => (curr && curr.key === now ? null : curr));
        }, 720);
        if (!likedVideoIds.has(video.id) && video.allowLikes !== false) {
          void handleToggleLike(video);
        }
        return;
      }

      lastTapRef.current = { id: video.id, time: now };
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        const isMultiPhoto = video.mediaType === 'photo' && (video.photoUrls?.length || 0) > 1;
        if (isMultiPhoto && x < rect.width * 0.25) {
          stepPhotoSlide(video.id, video.photoUrls!.length, -1);
        } else if (isMultiPhoto && x > rect.width * 0.75) {
          stepPhotoSlide(video.id, video.photoUrls!.length, 1);
        } else {
          setPausedByTap((prev) => !prev);
        }
        singleTapTimerRef.current = null;
      }, 240);
    },
    [likedVideoIds, handleToggleLike, stepPhotoSlide]
  );

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchSwipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleStageTouchEnd = (video: VideoPost, e: React.TouchEvent<HTMLDivElement>) => {
    if (video.mediaType !== 'photo' || (video.photoUrls?.length || 0) <= 1) return;
    const start = touchSwipeStartRef.current;
    touchSwipeStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      stepPhotoSlide(video.id, video.photoUrls!.length, dx < 0 ? 1 : -1);
    }
  };

  const handleFollowCreator = async (video: VideoPost) => {
    if (!user) {
      onToast(tr('Ingia ili kumfuatilia mbunifu huyu.', 'Sign in to follow this creator.'), 'error');
      onSignIn();
      return;
    }
    if (video.authorId === user.uid) return;
    if (followBusyByAuthor[video.authorId]) return;

    const current = Boolean(followingByAuthor[video.authorId]);
    setFollowBusyByAuthor((prev) => ({ ...prev, [video.authorId]: true }));
    try {
      const next = await toggleFollowUser(
        video.authorId,
        user,
        userDisplayName,
        userPhoto,
        current
      );
      setFollowingByAuthor((prev) => ({ ...prev, [video.authorId]: next }));
      onToast(
        next
          ? tr(`Sasa unamfuatilia ${video.authorName}!`, `Now following ${video.authorName}!`)
          : tr(`Umeacha kumfuatilia ${video.authorName}.`, `Unfollowed ${video.authorName}.`)
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa.', 'Failed.'), 'error');
    } finally {
      setFollowBusyByAuthor((prev) => ({ ...prev, [video.authorId]: false }));
    }
  };

  const handleDownloadWatermarkedMedia = async (video: VideoPost) => {
    if (video.allowDownload === false && !isAdmin && user?.uid !== video.authorId) {
      onToast(
        tr('Mwandishi amezima kipakuzi kwenye chapisho hili.', 'Downloads disabled by creator.'),
        'error'
      );
      return;
    }
    if (downloadingId) return;
    setDownloadingId(video.id);

    const safeFileAuthor =
      video.authorName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') || 'creator';

    if (video.mediaType === 'photo') {
      const photos = video.photoUrls || [];
      const currentIdx = Math.min(photoSlideByVideoId[video.id] || 0, Math.max(0, photos.length - 1));
      const activeImgUrl = photos[currentIdx] || video.thumbnailUrl;
      if (!activeImgUrl) {
        setDownloadingId(null);
        return;
      }
      onToast(
        tr(
          'Inaandaa picha yenye logo & watermark ya Malosha Forums...',
          'Preparing photo with Malosha Forums watermark...'
        )
      );
      try {
        await downloadWatermarkedPhoto(
          activeImgUrl,
          video.authorName,
          `malosha-forums-${safeFileAuthor}-${video.id.slice(0, 6)}.png`
        );
        onToast(
          tr(
            'Picha imepakuliwa na nembo ya Malosha Forums!',
            'Photo downloaded with Malosha Forums watermark!'
          )
        );
      } catch (err) {
        onToast(
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kupakua picha.', 'Failed to download photo.'),
          'error'
        );
      } finally {
        setDownloadingId(null);
      }
      return;
    }

    onToast(
      tr(
        'Inaandaa video yenye logo & watermark ya Malosha Forums...',
        'Preparing MP4 with Malosha Forums logo watermark...'
      )
    );
    const fileName = `malosha-forums-${safeFileAuthor}-${video.id.slice(0, 6)}.mp4`;

    try {
      const logoPid = await ensureMaloshaWatermarkLogoPublicId();
      const primaryUrl = buildWatermarkedVideoDownloadUrl(
        video.videoUrl,
        video.authorName,
        logoPid
      );
      const fallbackUrl = buildWatermarkedVideoDownloadUrl(video.videoUrl, video.authorName, '');

      let chosenBlob: Blob | null = null;
      let chosenUrl = primaryUrl;

      try {
        const res = await fetch(primaryUrl);
        if (res.ok) chosenBlob = await res.blob();
      } catch {
        chosenBlob = null;
      }

      if (!chosenBlob && fallbackUrl !== primaryUrl) {
        try {
          const res2 = await fetch(fallbackUrl);
          if (res2.ok) {
            chosenBlob = await res2.blob();
            chosenUrl = fallbackUrl;
          }
        } catch {
          chosenBlob = null;
        }
      }

      if (chosenBlob && chosenBlob.size > 0) {
        const blobUrl = URL.createObjectURL(chosenBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      } else {
        const a = document.createElement('a');
        a.href = chosenUrl || video.videoUrl;
        a.download = fileName;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      onToast(
        tr(
          'Video imepakuliwa na nembo ya Malosha Forums!',
          'Video downloaded with Malosha Forums watermark!'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakua video.', 'Failed to download video.'),
        'error'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShareVideo = async (video: VideoPost) => {
    const shareUrl = `${window.location.origin}/?tab=video&v=${encodeURIComponent(video.id)}`;
    const shareTitle = `${video.authorName} · Malosha Forums`;
    const shareText = video.caption
      ? `${video.caption.slice(0, 120)} — Tazama kwenye Malosha Forums`
      : `Tazama chapisho jipya la ${video.authorName} kwenye Malosha Forums`;

    let shared = false;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        shared = true;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    if (!shared && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        onToast(tr('Kiungo kimenakiliwa!', 'Link copied to clipboard!'));
      } catch {
        onToast(shareUrl);
      }
    }
    void incrementVideoShareCount(video.id);
  };

  const handleDeleteVideo = (video: VideoPost) => {
    if (!onRequestConfirm) return;
    onRequestConfirm({
      title: tr('Futa Chapisho Hili?', 'Delete This Post?'),
      message: tr(
        'Chapisho hili litaondolewa moja kwa moja kwenye orodha ya Video.',
        'This post will be permanently removed from the Video feed.'
      ),
      confirmLabel: tr('Ndiyo, Futa', 'Yes, Delete'),
      destructive: true,
      action: async () => {
        await deleteVideoPost(video.id);
        setSettingsVideoId(null);
        onToast(tr('Chapisho limefutwa kikamilifu.', 'Post deleted.'));
      },
    });
  };

  const activeCommentsVideo = useMemo(
    () => videos.find((v) => v.id === commentsVideoId) || null,
    [videos, commentsVideoId]
  );

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentsVideoId || !activeCommentsVideo) return;
    if (
      activeCommentsVideo.allowComments === false &&
      !isAdmin &&
      user?.uid !== activeCommentsVideo.authorId
    ) {
      onToast(
        tr('Mwandishi amefunga maoni kwenye chapisho hili.', 'Comments are turned off for this post.'),
        'error'
      );
      return;
    }
    if (!user) {
      onToast(tr('Ingia ili kuweka maoni.', 'Sign in to comment.'), 'error');
      onSignIn();
      return;
    }
    if (isSuspended && !isAdmin) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is closed.'), 'error');
      return;
    }
    if (!commentText.trim() || sendingComment) return;

    setSendingComment(true);
    try {
      await addVideoComment(commentsVideoId, user, userDisplayName, userPhoto, commentText, {
        parentCommentId: replyingToComment?.id || '',
        replyToAuthorName: replyingToComment?.authorName || '',
        postContext: {
          authorId: activeCommentsVideo.authorId,
          authorName: activeCommentsVideo.authorName,
          authorPhoto: activeCommentsVideo.authorPhoto,
          autoReplyEnabled: activeCommentsVideo.autoReplyEnabled,
          autoReplyMessage: activeCommentsVideo.autoReplyMessage,
          autoReplyTrigger: activeCommentsVideo.autoReplyTrigger,
          autoReplyKeyword: activeCommentsVideo.autoReplyKeyword,
        },
      });
      setCommentText('');
      setReplyingToComment(null);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma maoni.', 'Failed to send comment.'),
        'error'
      );
    } finally {
      setSendingComment(false);
    }
  };

  // Save owner settings inside Settings Drawer
  const handleSavePostSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSettingsVideo || savingSettings) return;
    if (editAutoReplyEnabled && !editAutoReplyMessage.trim()) {
      onToast(
        tr('Andika ujumbe wa Auto-Reply kabla ya kuiwasha.', 'Enter an Auto-Reply message first.'),
        'error'
      );
      return;
    }

    setSavingSettings(true);
    try {
      await updateVideoSettings(activeSettingsVideo.id, {
        caption: editCaption,
        soundName: editSoundName,
        isArchived: editIsPrivate,
        allowComments: editAllowComments,
        allowDownload: editAllowDownload,
        allowLikes: editAllowLikes,
        showLikeCount: editShowLikeCount,
        autoReplyEnabled: editAutoReplyEnabled,
        autoReplyTrigger: editAutoReplyTrigger,
        autoReplyKeyword: editAutoReplyKeyword,
        autoReplyMessage: editAutoReplyMessage,
      });
      onToast(tr('Mipangilio ya TikTok imehifadhiwa!', 'Post settings saved!'));
      setSettingsVideoId(null);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi mipangilio.', 'Failed to save settings.'),
        'error'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettingsAsDefault = () => {
    const nextDefaults: CreatorDefaultSettings = {
      allowComments: editAllowComments,
      allowDownload: editAllowDownload,
      allowLikes: editAllowLikes,
      showLikeCount: editShowLikeCount,
      autoReplyEnabled: editAutoReplyEnabled,
      autoReplyTrigger: editAutoReplyTrigger,
      autoReplyKeyword: editAutoReplyKeyword,
      autoReplyMessage: editAutoReplyMessage || DEFAULT_CREATOR_SETTINGS.autoReplyMessage,
    };
    setStudioSettings(nextDefaults);
    try {
      window.localStorage.setItem(CREATOR_TIKTOK_DEFAULTS_KEY, JSON.stringify(nextDefaults));
    } catch {
      // Ignore quota errors
    }
    onToast(
      tr(
        'Mipangilio hii imehifadhiwa kama chaguo-msingi la akaunti yako!',
        'Saved as your default creator settings!'
      )
    );
  };

  // Studio pickers
  const handlePickVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setDetectedDuration(0);
  };

  const handlePickPhotoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 10 - selectedPhotos.length);
    if (remainingSlots === 0) {
      onToast(tr('Unaweza kuweka picha hadi 10 pekee.', 'Maximum 10 photos allowed.'), 'error');
      return;
    }

    const picked = files.slice(0, remainingSlots).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedPhotos((prev) => [...prev, ...picked]);
  };

  const removeStudioPhoto = (id: string) => {
    setSelectedPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      setStudioPhotoPreviewIdx((idx) => Math.max(0, Math.min(idx, Math.max(0, next.length - 1))));
      return next;
    });
  };

  const moveStudioPhoto = (index: number, delta: number) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= selectedPhotos.length) return;
    setSelectedPhotos((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
    setStudioPhotoPreviewIdx(targetIdx);
  };

  const handlePickAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setSelectedAudioFile(file);
    setReusedAudioUrl('');
    setAudioPreviewUrl(objUrl);
    setAudioPreviewPlaying(false);
    if (!soundInput.trim()) {
      const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setSoundInput(cleanName.slice(0, 100));
    }
  };

  const handleSelectReusableTrack = (track: { soundName: string; audioUrl: string }) => {
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setSelectedAudioFile(null);
    setReusedAudioUrl(track.audioUrl);
    setAudioPreviewUrl(track.audioUrl);
    setSoundInput(track.soundName);
    setAudioPreviewPlaying(false);
  };

  const handleClearSelectedAudio = () => {
    if (previewAudioRef.current) previewAudioRef.current.pause();
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setSelectedAudioFile(null);
    setReusedAudioUrl('');
    setAudioPreviewUrl('');
    setAudioPreviewPlaying(false);
  };

  const toggleStudioAudioPreview = () => {
    const el = previewAudioRef.current;
    if (!el || !audioPreviewUrl) return;
    if (audioPreviewPlaying) {
      el.pause();
      setAudioPreviewPlaying(false);
    } else {
      void el.play().then(() => setAudioPreviewPlaying(true)).catch(() => {});
    }
  };

  const handleUseSoundFromPost = (post: VideoPost) => {
    setSoundDrawerVideo(null);
    if (!user) {
      onToast(tr('Ingia kwanza ili kutumia sauti hii.', 'Sign in first to use this sound.'), 'error');
      onSignIn();
      return;
    }
    if (isSuspended && !isAdmin) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is closed.'), 'error');
      return;
    }
    if (post.audioUrl) {
      setSelectedAudioFile(null);
      setReusedAudioUrl(post.audioUrl);
      setAudioPreviewUrl(post.audioUrl);
    } else {
      setSelectedAudioFile(null);
      setReusedAudioUrl('');
      setAudioPreviewUrl('');
    }
    setSoundInput(post.soundName);
    setUploadMediaType('photo');
    setUploadOpen(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    if (previewAudioRef.current) previewAudioRef.current.pause();
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setSelectedVideoFile(null);
    setVideoPreviewUrl('');
    setSelectedPhotos([]);
    setStudioPhotoPreviewIdx(0);
    setSelectedAudioFile(null);
    setReusedAudioUrl('');
    setAudioPreviewUrl('');
    setAudioPreviewPlaying(false);
    setDetectedDuration(0);
    setCaptionInput('');
    setSoundInput('');
    setTagsInput('');
    setUploadPct(0);
    setUploadStageLabel('');
    setUploadOpen(false);
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }
    if (isSuspended && !isAdmin) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is closed.'), 'error');
      return;
    }

    if (uploadMediaType === 'video' && !selectedVideoFile) {
      onToast(tr('Chagua faili la video kwanza.', 'Select a video file first.'), 'error');
      return;
    }
    if (uploadMediaType === 'photo' && selectedPhotos.length === 0) {
      onToast(tr('Chagua angalau picha 1 kwanza.', 'Select at least 1 photo first.'), 'error');
      return;
    }
    if (studioSettings.autoReplyEnabled && !studioSettings.autoReplyMessage.trim()) {
      onToast(
        tr('Andika ujumbe wa Auto-Reply au izime.', 'Enter an Auto-Reply message or turn it off.'),
        'error'
      );
      return;
    }

    // Persist creator defaults if configured
    try {
      window.localStorage.setItem(CREATOR_TIKTOK_DEFAULTS_KEY, JSON.stringify(studioSettings));
    } catch {
      // Non-fatal
    }

    setUploading(true);
    setUploadPct(2);
    try {
      let finalAudioUrl = reusedAudioUrl;
      let audioDuration = 0;

      if (selectedAudioFile) {
        setUploadStageLabel(tr('Inapakia muziki/sauti...', 'Uploading audio track...'));
        const audioRes = await uploadAudioToCloudinary(selectedAudioFile, (pct) => {
          setUploadPct(Math.max(2, Math.round(pct * 0.25)));
        });
        finalAudioUrl = audioRes.secureUrl;
        audioDuration = audioRes.durationSec;
      }

      const tags = tagsInput
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 5);

      let newId = '';

      if (uploadMediaType === 'photo') {
        setUploadStageLabel(
          tr(
            `Inapakia picha ${selectedPhotos.length}...`,
            `Uploading ${selectedPhotos.length} photo(s)...`
          )
        );
        const photoUrls = await uploadPhotoCarouselToCloudinary(
          selectedPhotos.map((p) => p.file),
          (pct) => {
            const base = selectedAudioFile ? 25 : 5;
            setUploadPct(base + Math.round((pct / 100) * (100 - base)));
          }
        );

        newId = await createVideoPost(user, userDisplayName, userPhoto, {
          mediaType: 'photo',
          videoUrl: '',
          photoUrls,
          audioUrl: finalAudioUrl,
          thumbnailUrl: photoUrls[0] || '',
          caption: captionInput,
          soundName: soundInput,
          tags,
          durationSec: audioDuration || selectedPhotos.length * 4,
          allowComments: studioSettings.allowComments,
          allowDownload: studioSettings.allowDownload,
          allowLikes: studioSettings.allowLikes,
          showLikeCount: studioSettings.showLikeCount,
          autoReplyEnabled: studioSettings.autoReplyEnabled,
          autoReplyTrigger: studioSettings.autoReplyTrigger,
          autoReplyKeyword: studioSettings.autoReplyKeyword,
          autoReplyMessage: studioSettings.autoReplyMessage,
        });
      } else {
        setUploadStageLabel(tr('Inapakia video kwenye wingu...', 'Uploading video...'));
        const uploaded = await uploadVideoToCloudinary(selectedVideoFile!, (pct) => {
          const base = selectedAudioFile ? 25 : 2;
          setUploadPct(base + Math.round((pct / 100) * (100 - base)));
        });

        newId = await createVideoPost(user, userDisplayName, userPhoto, {
          mediaType: 'video',
          videoUrl: uploaded.secureUrl,
          audioUrl: finalAudioUrl,
          cloudinaryPublicId: uploaded.publicId,
          thumbnailUrl: uploaded.thumbnailUrl,
          caption: captionInput,
          soundName: soundInput,
          tags,
          durationSec: uploaded.durationSec || detectedDuration,
          allowComments: studioSettings.allowComments,
          allowDownload: studioSettings.allowDownload,
          allowLikes: studioSettings.allowLikes,
          showLikeCount: studioSettings.showLikeCount,
          autoReplyEnabled: studioSettings.autoReplyEnabled,
          autoReplyTrigger: studioSettings.autoReplyTrigger,
          autoReplyKeyword: studioSettings.autoReplyKeyword,
          autoReplyMessage: studioSettings.autoReplyMessage,
        });
      }

      closeUploadModal();
      setJustPublishedId(newId);
      setFeedMode('mix');
      setActiveIndex(0);
      window.setTimeout(() => {
        if (feedScrollRef.current) {
          feedScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const slide = slideRefs.current[newId];
        if (slide) slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 180);

      onToast(
        uploadMediaType === 'photo'
          ? tr('Picha na muziki zimechapishwa!', 'Photo post published!')
          : tr('Video yako imechapishwa kwenye Malosha Video!', 'Your video is now live!')
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kupakia.', 'Upload failed.'),
        'error'
      );
    } finally {
      setUploading(false);
      setUploadStageLabel('');
    }
  };

  // Organize threaded comments (top-level comments + child replies under each)
  const structuredComments = useMemo(() => {
    const byId = new Set(videoComments.map((c) => c.id));
    const roots: VideoComment[] = [];
    const repliesByParent = new Map<string, VideoComment[]>();

    for (const c of videoComments) {
      if (c.parentCommentId && byId.has(c.parentCommentId)) {
        const arr = repliesByParent.get(c.parentCommentId) || [];
        arr.push(c);
        repliesByParent.set(c.parentCommentId, arr);
      } else {
        roots.push(c);
      }
    }
    return { roots, repliesByParent };
  }, [videoComments]);

  // True Full-Screen Mobile View above dark bottom nav + centered theater height on Desktop
  const stageHeightClass =
    'h-[calc(100dvh-58px-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-var(--malosha-header-h,104px))]';
  const isMobilePortraitFrame = desktopFrameMode === 'mobile';

  return (
    <div className={`relative w-full overflow-hidden bg-black text-white select-none ${stageHeightClass}`}>
      {/* TikTok Top Overlay Bar (fits Mobile edge-to-edge and aligns cleanly over 9:16 PC frame) */}
      {!clearScreenMode ? (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex items-center justify-between gap-1.5 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2.5 pt-2.5 pb-6 sm:px-3 ${
            isMobilePortraitFrame ? 'md:max-w-[440px] md:pt-4' : 'sm:px-6'
          }`}
        >
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={tr('Rudi Jukwaani', 'Back to Forum')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md ring-1 ring-white/20 hover:bg-black/75 md:hidden"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full bg-black/50 p-1 backdrop-blur-md ring-1 ring-white/15 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  { id: 'mix', label: tr('Mix', 'Mix') },
                  { id: 'foryou', label: tr('Mpya', 'New') },
                  { id: 'following', label: tr('Wanaofuatwa', 'Following') },
                  { id: 'saved', label: tr('Zilizohifadhiwa', 'Saved') },
                  ...(ownPrivateCount > 0
                    ? [
                        {
                          id: 'private' as const,
                          label: tr(`Binafsi (${ownPrivateCount})`, `Private (${ownPrivateCount})`),
                        },
                      ]
                    : []),
                ] satisfies readonly {
                  id: 'mix' | 'foryou' | 'following' | 'saved' | 'private';
                  label: string;
                }[]
              ).map((mode) => {
                const active = feedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      if (mode.id === 'mix' && feedMode === 'mix') {
                        handleReshuffleMix();
                        return;
                      }
                      setFeedMode(mode.id);
                      setActiveIndex(0);
                      feedScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                    className={`min-h-[30px] rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-all sm:text-xs ${
                      active ? 'bg-white text-slate-950 shadow-sm' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {feedMode === 'mix' && visibleVideos.length > 2 && (
              <button
                type="button"
                onClick={handleReshuffleMix}
                title={tr('Changanya video (Mpya & Zamani)', 'Reshuffle Mix')}
                aria-label={tr('Changanya video', 'Reshuffle Mix')}
                className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-black/50 text-sky-300 backdrop-blur-md ring-1 ring-white/20 transition-colors hover:bg-black/75 active:scale-95"
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleAutoNext}
              title={
                autoScrollNext
                  ? tr('Auto-Next Imewashwa (Gusa kuzima)', 'Auto-Next ON (Tap to turn off)')
                  : tr('Auto-Next Imezimwa (Gusa kuwasha)', 'Auto-Next OFF (Tap to turn on)')
              }
              aria-label={tr('Washa au zima video inayofuata kiotomatiki', 'Toggle Auto-Next')}
              className={`inline-flex h-8.5 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-extrabold backdrop-blur-md ring-1 transition-all active:scale-95 ${
                autoScrollNext
                  ? 'bg-emerald-500/25 text-emerald-300 ring-emerald-400/50'
                  : 'bg-black/50 text-white/75 ring-white/20 hover:text-white'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{autoScrollNext ? 'Auto' : 'Loop'}</span>
            </button>

            {visibleVideos.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const nextIdx = activeIndex + 1 < visibleVideos.length ? activeIndex + 1 : 0;
                  scrollToIndex(nextIdx);
                }}
                title={tr('Cheza video inayofuata', 'Play next video')}
                aria-label={tr('Cheza video inayofuata', 'Play next video')}
                className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md ring-1 ring-white/20 transition-colors hover:bg-black/75 active:scale-95"
              >
                <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              title={muted ? tr('Washa Sauti', 'Unmute') : tr('Zima Sauti', 'Mute')}
              aria-label={muted ? tr('Washa Sauti', 'Unmute') : tr('Zima Sauti', 'Mute')}
              className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md ring-1 ring-white/20 transition-colors hover:bg-black/75"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              )}
            </button>

            {activePost && (
              <button
                type="button"
                onClick={() => setSettingsVideoId(activePost.id)}
                title={tr('Mipangilio ya TikTok', 'TikTok Settings')}
                aria-label={tr('Mipangilio ya TikTok', 'TikTok Settings')}
                className="hidden h-8.5 w-8.5 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md ring-1 ring-white/20 transition-colors hover:bg-black/75 sm:flex"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onToast(
                    tr('Ingia kwanza ili kupakia video au picha.', 'Sign in first to post.'),
                    'error'
                  );
                  onSignIn();
                  return;
                }
                if (isSuspended && !isAdmin) {
                  onToast(tr('Akaunti yako imefungwa.', 'Your account is closed.'), 'error');
                  return;
                }
                setUploadOpen(true);
              }}
              aria-label={tr('Pakia video au picha', 'Create post')}
              className="inline-flex h-8.5 items-center gap-1 rounded-full bg-gradient-to-r from-[#FE2C55] to-[#E11D48] px-2.5 text-xs font-extrabold text-white shadow-[0_4px_14px_rgba(254,44,85,0.45)] transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[2.8]" aria-hidden="true" />
              <span className="hidden sm:inline">{tr('Pakia', 'Create')}</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setClearScreenMode(false)}
          aria-label={tr('Rudisha Vitufe', 'Show Controls')}
          className="fixed top-4 right-3 z-30 flex h-10 items-center gap-1.5 rounded-full bg-black/65 px-3.5 text-xs font-bold text-white backdrop-blur-md ring-1 ring-white/25 md:top-20"
        >
          <Eye className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <span>{tr('Onyesha Vitufe', 'Show UI')}</span>
        </button>
      )}

      {/* Desktop Previous / Next Quick Arrow Buttons */}
      {!clearScreenMode && visibleVideos.length > 1 && (
        <div className="pointer-events-none fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2.5 md:flex">
          <button
            type="button"
            disabled={activeIndex <= 0}
            onClick={() => scrollToIndex(activeIndex - 1)}
            aria-label={tr('Chapisho lililopita', 'Previous post')}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md ring-1 ring-white/20 transition-all hover:bg-black/85 disabled:opacity-30"
          >
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white/75 tabular-nums ring-1 ring-white/10">
            {activeIndex + 1}/{visibleVideos.length}
          </span>
          <button
            type="button"
            onClick={() => {
              const nextIdx = activeIndex + 1 < visibleVideos.length ? activeIndex + 1 : 0;
              scrollToIndex(nextIdx);
            }}
            aria-label={tr('Chapisho linalofuata', 'Next post')}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md ring-1 ring-white/20 transition-all hover:bg-black/85"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && videos.length === 0 ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="h-9 w-9 animate-spin text-[#FE2C55]" aria-hidden="true" />
          <p className="text-sm font-medium text-white/80">
            {tr('Inapakia Malosha Reels...', 'Loading Malosha Reels...')}
          </p>
        </div>
      ) : visibleVideos.length === 0 ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
            <VideoIcon className="h-10 w-10 text-[#22D3EE]" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-1.5">
            <h2 className="font-display text-xl font-bold text-white">
              {feedMode === 'following'
                ? tr('Bado Hujamfuatilia Mbunifu Yeyote', 'No Posts From Followed Creators')
                : feedMode === 'saved'
                  ? tr('Huna Machapisho Yaliyohifadhiwa', 'No Saved Posts Yet')
                  : feedMode === 'private'
                    ? tr('Huna Machapisho ya Binafsi', 'No Private Posts')
                    : tr('Karibu Malosha Reels', 'Welcome to Malosha Reels')}
            </h2>
            <p className="text-xs leading-relaxed text-white/75 sm:text-sm">
              {feedMode === 'following'
                ? tr(
                    'Gusa alama ya + kwenye picha ya mbunifu unayempenda ili kuona machapisho yake hapa.',
                    'Tap + on any creator avatar to see their latest posts here.'
                  )
                : feedMode === 'saved'
                  ? tr(
                      'Gusa alama ya kuhifadhi (Bookmark) kwenye chapisho lolote ulitazame tena baadaye.',
                      'Tap Bookmark on any post to keep it saved here.'
                    )
                  : tr(
                      'Pakia video fupi au picha zilizoambatanishwa na muziki moja kwa moja kutoka kwenye simu au PC!',
                      'Post short videos or photo carousels with background music directly from your phone or computer!'
                    )}
            </p>
          </div>
          {feedMode === 'mix' || feedMode === 'foryou' ? (
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onSignIn();
                  return;
                }
                setUploadOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#FE2C55] to-[#E11D48] px-6 py-2.5 text-sm font-extrabold text-white shadow-lg transition-transform hover:scale-105"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Pakia Video au Picha', 'Post Video or Photo')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFeedMode('mix')}
              className="min-h-[44px] rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-100"
            >
              {tr('Rudi Kwenye Mix', 'Go to Mix')}
            </button>
          )}
        </div>
      ) : (
        /* Full-Screen Vertical Snap Feed Container */
        <div
          ref={feedScrollRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleVideos.map((video, idx) => {
            const isActive = idx === activeIndex;
            const isPhotoMode = video.mediaType === 'photo' && (video.photoUrls?.length || 0) > 0;
            const photoList = video.photoUrls || [];
            const activePhotoIdx = Math.min(
              photoSlideByVideoId[video.id] || 0,
              Math.max(0, photoList.length - 1)
            );
            const inactivePosterSrc = isPhotoMode
              ? photoList[0] || video.thumbnailUrl || ''
              : video.thumbnailUrl || '';
            const isLiked = likedVideoIds.has(video.id);
            const isBookmarked = bookmarkedIds.has(video.id);
            const isFollowing = Boolean(followingByAuthor[video.authorId]);
            const prog = progressById[video.id] || {
              current: 0,
              duration: video.durationSec || 0,
            };
            const progressPct =
              prog.duration > 0 ? Math.min(100, (prog.current / prog.duration) * 100) : 0;
            const captionLong = video.caption.length > 105;
            const captionExpanded = Boolean(expandedCaptions[video.id]);
            const commentsAllowed = video.allowComments !== false;
            const likesAllowed = video.allowLikes !== false;
            const showLikeCount = video.showLikeCount !== false;
            const downloadAllowed = video.allowDownload !== false;

            return (
              <div
                key={video.id}
                ref={(el) => {
                  slideRefs.current[video.id] = el;
                }}
                data-video-id={video.id}
                className="relative flex h-full w-full snap-start snap-always items-center justify-center overflow-hidden bg-black"
              >
                {/* Cinematic Blurred Backdrop on Desktop sides when in Mobile Portrait Frame */}
                {isMobilePortraitFrame && inactivePosterSrc && (
                  <img
                    src={inactivePosterSrc}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-30 blur-3xl md:block"
                  />
                )}

                {/* Authentic TikTok Mobile Portrait Container (edge-to-edge on Phone, 9:16 mobile frame on PC) */}
                <div
                  className={
                    isMobilePortraitFrame
                      ? 'relative h-full w-full overflow-hidden bg-black md:my-2 md:h-[calc(100%-1rem)] md:w-auto md:aspect-[9/16] md:max-w-[440px] md:rounded-3xl md:ring-1 md:ring-white/15 md:shadow-[0_20px_60px_rgba(0,0,0,0.9)]'
                      : 'relative h-full w-full overflow-hidden bg-black'
                  }
                >
                {/* Full-Screen Media Stage: ONLY active slide opens video/audio stream (Okoa Bando!) */}
                <div
                  onClick={(e) => handleStagePointerClick(video, e)}
                  onTouchStart={handleStageTouchStart}
                  onTouchEnd={(e) => handleStageTouchEnd(video, e)}
                  className="relative h-full w-full cursor-pointer"
                >
                  {!isActive ? (
                    /* Inactive Slide Placeholder: Zero video/audio network requests until swiped into view */
                    <div className="relative h-full w-full bg-black">
                      {inactivePosterSrc ? (
                        <img
                          src={inactivePosterSrc}
                          alt={video.caption || video.authorName}
                          loading="lazy"
                          className={`h-full w-full ${
                            fitMode === 'cover' ? 'object-cover' : 'object-contain'
                          }`}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black">
                          <VideoIcon className="h-12 w-12 text-white/20" aria-hidden="true" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-xs ring-1 ring-white/25">
                          <Play className="ml-0.5 h-6 w-6 fill-white/90" aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  ) : isPhotoMode ? (
                    <>
                      {/* Blurred Ambient Backdrop when Contain mode */}
                      {fitMode === 'contain' && photoList[activePhotoIdx] && (
                        <img
                          src={photoList[activePhotoIdx]}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
                        />
                      )}

                      {/* Full-Screen Edge-to-Edge Active Photo */}
                      <img
                        src={photoList[activePhotoIdx]}
                        alt={video.caption || video.authorName}
                        className={`relative z-[1] h-full w-full transition-opacity duration-300 ${
                          fitMode === 'cover' ? 'object-cover' : 'object-contain'
                        }`}
                      />

                      {/* Background Attached Music Audio Track (Active Slide Only) */}
                      {video.audioUrl && (
                        <audio
                          key={`audio-${video.id}`}
                          ref={(el) => {
                            const prev = audioRefs.current[video.id];
                            if (!el && prev) {
                              prev.pause();
                              prev.removeAttribute('src');
                              prev.load();
                            }
                            audioRefs.current[video.id] = el;
                          }}
                          src={video.audioUrl}
                          autoPlay={!pausedByTap && !uploadOpen}
                          loop
                          muted={muted}
                          preload="auto"
                        />
                      )}

                      {/* Multi-Photo Top Segmented Carousel Indicator */}
                      {photoList.length > 1 && !clearScreenMode && (
                        <div className="pointer-events-none absolute inset-x-3 top-14 z-20 flex items-center gap-1 sm:inset-x-5">
                          {photoList.map((pUrl, pIdx) => (
                            <div
                              key={`${pUrl}-${pIdx}`}
                              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  pIdx < activePhotoIdx
                                    ? 'w-full bg-white'
                                    : pIdx === activePhotoIdx
                                      ? 'w-full bg-gradient-to-r from-[#22D3EE] to-[#FE2C55]'
                                      : 'w-0 bg-transparent'
                                }`}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Desktop Carousel Prev / Next Arrows */}
                      {photoList.length > 1 && !clearScreenMode && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              stepPhotoSlide(video.id, photoList.length, -1);
                            }}
                            aria-label={tr('Picha iliyopita', 'Previous photo')}
                            className="absolute top-1/2 left-3 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm ring-1 ring-white/20 hover:bg-black/75 sm:flex"
                          >
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              stepPhotoSlide(video.id, photoList.length, 1);
                            }}
                            aria-label={tr('Picha inayofuata', 'Next photo')}
                            className="absolute top-1/2 right-16 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm ring-1 ring-white/20 hover:bg-black/75 sm:flex"
                          >
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <video
                        key={video.id}
                        ref={(el) => {
                          const prev = videoRefs.current[video.id];
                          if (!el && prev) {
                            prev.pause();
                            prev.removeAttribute('src');
                            prev.load();
                          }
                          videoRefs.current[video.id] = el;
                        }}
                        src={video.videoUrl}
                        poster={video.thumbnailUrl || undefined}
                        autoPlay={!pausedByTap && !uploadOpen}
                        playsInline
                        loop={!autoScrollNext || visibleVideos.length <= 1}
                        preload="auto"
                        muted={muted || Boolean(video.audioUrl)}
                        onEnded={() => {
                          if (autoScrollNext && visibleVideos.length > 1) {
                            const nextIdx =
                              activeIndex + 1 < visibleVideos.length ? activeIndex + 1 : 0;
                            scrollToIndex(nextIdx);
                          } else {
                            const el = videoRefs.current[video.id];
                            if (el) {
                              el.currentTime = 0;
                              void el.play().catch(() => {});
                            }
                          }
                        }}
                        onTimeUpdate={(e) => {
                          const el = e.currentTarget;
                          setProgressById((prev) => ({
                            ...prev,
                            [video.id]: {
                              current: el.currentTime || 0,
                              duration: Number.isFinite(el.duration)
                                ? el.duration
                                : video.durationSec || 0,
                            },
                          }));
                        }}
                        className={`h-full w-full ${
                          fitMode === 'cover' ? 'object-cover' : 'object-contain'
                        }`}
                      />
                      {video.audioUrl && (
                        <audio
                          key={`audio-${video.id}`}
                          ref={(el) => {
                            const prev = audioRefs.current[video.id];
                            if (!el && prev) {
                              prev.pause();
                              prev.removeAttribute('src');
                              prev.load();
                            }
                            audioRefs.current[video.id] = el;
                          }}
                          src={video.audioUrl}
                          autoPlay={!pausedByTap && !uploadOpen}
                          loop
                          muted={muted}
                          preload="auto"
                        />
                      )}
                    </>
                  )}

                  {/* Subtle Brand Corner Watermark & Mode Tag */}
                  {!clearScreenMode && (
                    <div className="pointer-events-none absolute top-16 left-3 z-10 flex flex-wrap items-center gap-1.5 sm:left-4">
                      <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-2 py-1 backdrop-blur-[2px] ring-1 ring-white/15">
                        <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-[#0E2640]">
                          {isPhotoMode ? (
                            <ImageIcon className="h-2.5 w-2.5" aria-hidden="true" />
                          ) : (
                            <VideoIcon className="h-2.5 w-2.5" aria-hidden="true" />
                          )}
                        </span>
                        <span className="text-[10px] font-extrabold tracking-wide text-white/95">
                          Malosha Forums
                        </span>
                      </div>

                      {isPhotoMode && photoList.length > 1 && (
                        <span className="rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-sky-200 backdrop-blur-[2px] ring-1 ring-white/15 tabular-nums">
                          {activePhotoIdx + 1} / {photoList.length}
                        </span>
                      )}

                      {video.isArchived && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-950/80 px-2 py-1 text-[10px] font-bold text-rose-200 ring-1 ring-rose-400/40">
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                          {tr('Binafsi', 'Private')}
                        </span>
                      )}

                      {playbackSpeed !== 1 && !isPhotoMode && (
                        <span className="rounded-lg bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                          {playbackSpeed}x
                        </span>
                      )}
                    </div>
                  )}

                  {/* Center Play Icon When Paused */}
                  {isActive && pausedByTap && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm ring-1 ring-white/25">
                        <Play className="ml-1 h-8 w-8 fill-white" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {/* Double-Tap Heart Animation */}
                  {heartBurst && heartBurst.id === video.id && (
                    <div
                      key={heartBurst.key}
                      style={{
                        left: `${heartBurst.x}px`,
                        top: `${heartBurst.y}px`,
                      }}
                      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 animate-ping"
                    >
                      <Heart className="h-20 w-20 fill-[#FE2C55] text-[#FE2C55] drop-shadow-[0_4px_18px_rgba(254,44,85,0.85)]" />
                    </div>
                  )}

                  {/* Bottom Readability Gradient */}
                  {!clearScreenMode && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* TikTok Right Vertical Action Rail */}
                {!clearScreenMode && (
                  <div className="absolute right-2 bottom-10 z-20 flex flex-col items-center gap-3 sm:right-5 sm:bottom-12">
                    {/* Creator Avatar + Quick Follow '+' Badge */}
                    <div className="relative mb-1">
                      <button
                        type="button"
                        onClick={() =>
                          onAuthorClick?.({
                            uid: video.authorId,
                            displayName: video.authorName,
                            photoURL: video.authorPhoto,
                          })
                        }
                        aria-label={video.authorName}
                        className="block rounded-full ring-2 ring-white shadow-lg transition-transform hover:scale-105"
                      >
                        <Avatar
                          name={video.authorName}
                          photoURL={video.authorPhoto}
                          size="lg"
                          uid={video.authorId}
                        />
                      </button>
                      {(!user || user.uid !== video.authorId) && (
                        <button
                          type="button"
                          disabled={Boolean(followBusyByAuthor[video.authorId])}
                          onClick={() => void handleFollowCreator(video)}
                          aria-label={
                            isFollowing ? tr('Acha kufuatilia', 'Unfollow') : tr('Fuatilia', 'Follow')
                          }
                          className={`absolute -bottom-2 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full shadow-md ring-2 ring-black transition-transform hover:scale-110 ${
                            isFollowing ? 'bg-emerald-500 text-white' : 'bg-[#FE2C55] text-white'
                          }`}
                        >
                          {isFollowing ? (
                            <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Heart / Like */}
                    <button
                      type="button"
                      disabled={Boolean(likeBusyIds[video.id])}
                      onClick={() => void handleToggleLike(video)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none"
                      aria-label={tr('Penda chapisho', 'Like post')}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-xs transition-transform group-active:scale-125">
                        <Heart
                          className={`h-7 w-7 transition-colors drop-shadow ${
                            !likesAllowed
                              ? 'text-white/40'
                              : isLiked
                                ? 'fill-[#FE2C55] text-[#FE2C55]'
                                : 'fill-white/10 text-white'
                          }`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-[11px] font-bold text-white drop-shadow tabular-nums">
                        {!likesAllowed
                          ? tr('Zimezimwa', 'Off')
                          : showLikeCount
                            ? formatCompactCount(video.likesCount)
                            : tr('Penda', 'Like')}
                      </span>
                    </button>

                    {/* Comments Drawer Trigger */}
                    <button
                      type="button"
                      onClick={() => setCommentsVideoId(video.id)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none"
                      aria-label={tr('Maoni', 'Comments')}
                    >
                      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-xs transition-transform group-active:scale-110">
                        <MessageCircle
                          className={`h-7 w-7 drop-shadow ${
                            commentsAllowed ? 'fill-white/15 text-white' : 'text-white/50'
                          }`}
                          aria-hidden="true"
                        />
                        {!commentsAllowed && (
                          <Lock
                            className="absolute right-1.5 bottom-1.5 h-3 w-3 text-rose-400"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-white drop-shadow tabular-nums">
                        {commentsAllowed
                          ? formatCompactCount(video.commentsCount)
                          : tr('Zimefungwa', 'Off')}
                      </span>
                    </button>

                    {/* Bookmark / Save */}
                    <button
                      type="button"
                      onClick={() => toggleBookmark(video.id)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none"
                      aria-label={tr('Hifadhi', 'Save')}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-xs transition-transform group-active:scale-110">
                        <Bookmark
                          className={`h-6.5 w-6.5 drop-shadow transition-colors ${
                            isBookmarked
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-white/10 text-white'
                          }`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-[11px] font-bold text-white drop-shadow">
                        {isBookmarked ? tr('Imehifadhiwa', 'Saved') : tr('Hifadhi', 'Save')}
                      </span>
                    </button>

                    {/* Watermarked Download */}
                    <button
                      type="button"
                      disabled={downloadingId === video.id}
                      onClick={() => void handleDownloadWatermarkedMedia(video)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none disabled:opacity-75"
                      aria-label={tr('Pakua na watermark', 'Download with watermark')}
                    >
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-xs transition-transform group-active:scale-110 ${
                          downloadAllowed ? 'ring-1 ring-amber-400/55' : 'opacity-50 ring-1 ring-white/20'
                        }`}
                      >
                        {downloadingId === video.id ? (
                          <Loader2 className="h-5.5 w-5.5 animate-spin text-amber-400" aria-hidden="true" />
                        ) : !downloadAllowed ? (
                          <Lock className="h-5 w-5 text-white/70" aria-hidden="true" />
                        ) : (
                          <Download className="h-5.5 w-5.5 text-amber-300 drop-shadow" aria-hidden="true" />
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-amber-200 drop-shadow">
                        {downloadingId === video.id
                          ? tr('Inapakua...', 'Saving...')
                          : downloadAllowed
                            ? tr('Pakua', 'Save')
                            : tr('Imefungwa', 'Locked')}
                      </span>
                    </button>

                    {/* Share */}
                    <button
                      type="button"
                      onClick={() => void handleShareVideo(video)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none"
                      aria-label={tr('Shiriki', 'Share')}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-xs transition-transform group-active:scale-110">
                        <Share2 className="h-6 w-6 text-white drop-shadow" aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-bold text-white drop-shadow tabular-nums">
                        {video.sharesCount > 0
                          ? formatCompactCount(video.sharesCount)
                          : tr('Shiriki', 'Share')}
                      </span>
                    </button>

                    {/* More / Settings Sheet */}
                    <button
                      type="button"
                      onClick={() => setSettingsVideoId(video.id)}
                      className="group flex min-w-[44px] flex-col items-center gap-0.5 focus:outline-none"
                      aria-label={tr('Mipangilio ya Chapisho', 'Post Settings')}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/20 backdrop-blur-xs transition-transform group-active:scale-110">
                        <MoreHorizontal className="h-5 w-5 text-white" aria-hidden="true" />
                      </span>
                    </button>

                    {/* Rotating TikTok Audio Vinyl Disc (Click to Use Sound!) */}
                    <button
                      type="button"
                      onClick={() => setSoundDrawerVideo(video)}
                      title={tr('Tumia Sauti / Muziki Huu', 'Use This Sound')}
                      aria-label={tr('Tumia Sauti / Muziki Huu', 'Use This Sound')}
                      className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-full border-[6px] border-slate-900 bg-gradient-to-br from-slate-700 to-slate-950 p-1 shadow-lg ring-1 ring-white/30 transition-transform hover:scale-110 ${
                        isActive && !pausedByTap ? 'animate-malosha-spin' : ''
                      }`}
                    >
                      <Avatar
                        name={video.authorName}
                        photoURL={video.authorPhoto}
                        size="sm"
                        uid={video.authorId}
                      />
                    </button>
                  </div>
                )}

                {/* TikTok Bottom-Left Creator Info, Caption, Tags, Auto-Reply Badge & Audio Track */}
                {!clearScreenMode && (
                  <div className="pointer-events-none absolute right-20 bottom-6 left-3 z-20 max-w-xl space-y-2 sm:right-24 sm:bottom-7 sm:left-6">
                    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onAuthorClick?.({
                            uid: video.authorId,
                            displayName: video.authorName,
                            photoURL: video.authorPhoto,
                          })
                        }
                        className="text-sm font-extrabold text-white drop-shadow hover:underline sm:text-base"
                      >
                        @{video.authorName}
                      </button>
                      <AuthorVerificationBadge uid={video.authorId} size="sm" />
                      {video.autoReplyEnabled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-xs">
                          <Bot className="h-3 w-3" aria-hidden="true" />
                          <span>Auto-reply</span>
                        </span>
                      )}
                      {video.createdAt && (
                        <span className="text-[11px] font-medium text-white/75 drop-shadow">
                          · {formatTime(video.createdAt)}
                        </span>
                      )}
                    </div>

                    {video.caption && (
                      <div className="pointer-events-auto text-xs leading-relaxed text-white/95 drop-shadow sm:text-sm">
                        <p className={captionExpanded ? '' : 'line-clamp-2'}>{video.caption}</p>
                        {captionLong && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCaptions((prev) => ({
                                ...prev,
                                [video.id]: !captionExpanded,
                              }))
                            }
                            className="mt-0.5 text-[11px] font-bold text-amber-300 hover:underline"
                          >
                            {captionExpanded ? tr('Funga', 'Less') : tr('Soma zaidi', 'More')}
                          </button>
                        )}
                      </div>
                    )}

                    {video.tags.length > 0 && (
                      <div className="pointer-events-auto flex flex-wrap gap-1.5">
                        {video.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold text-sky-200 backdrop-blur-xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Multi-Photo Dot Switcher if Photo Carousel */}
                    {isPhotoMode && photoList.length > 1 && (
                      <div className="pointer-events-auto flex items-center gap-1.5 pt-0.5">
                        {photoList.map((_, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() =>
                              setPhotoSlideByVideoId((prev) => ({ ...prev, [video.id]: pIdx }))
                            }
                            aria-label={`Photo ${pIdx + 1}`}
                            className={`h-2 rounded-full transition-all ${
                              pIdx === activePhotoIdx
                                ? 'w-5 bg-white'
                                : 'w-2 bg-white/45 hover:bg-white/75'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setSoundDrawerVideo(video)}
                      className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-white/95 ring-1 ring-white/15 backdrop-blur-xs hover:bg-black/55"
                    >
                      <Music2 className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                      <span className="truncate">
                        {video.soundName}
                        {video.audioUrl ? ` · ${tr('Muziki Unacheza', 'Music Attached')}` : ' · Malosha Forums'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Interactive Bottom Playback Scrubber Bar (Video Mode) */}
                {isActive && !isPhotoMode && !clearScreenMode && (
                  <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-1 py-0.5">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#22D3EE] via-white to-[#FE2C55] transition-[width] duration-100"
                        style={{ width: `${progressPct}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, prog.duration)}
                        step={0.1}
                        value={prog.current}
                        aria-label={tr('Endeleza video', 'Seek video')}
                        onChange={(e) => {
                          const targetTime = Number(e.target.value);
                          const el = videoRefs.current[video.id];
                          if (el) el.currentTime = targetTime;
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </div>
                    {prog.duration > 0 && (
                      <span className="pr-2 text-[9.5px] font-semibold text-white/75 tabular-nums">
                        {formatDurationMMSS(prog.current)} / {formatDurationMMSS(prog.duration)}
                      </span>
                    )}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TikTok Slide-Up Comments Drawer (Threaded + Creator Auto-Reply + Lock Support) */}
      {commentsVideoId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center"
          onClick={() => setCommentsVideoId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[76dvh] w-full flex-col rounded-t-3xl bg-white text-slate-900 shadow-2xl md:h-[600px] md:max-w-md md:rounded-2xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" />
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[#FE2C55]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-slate-900 tabular-nums">
                  {tr('Maoni', 'Comments')} (
                  {activeCommentsVideo ? activeCommentsVideo.commentsCount : videoComments.length})
                </h3>
                {activeCommentsVideo?.autoReplyEnabled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                    <Bot className="h-3 w-3" aria-hidden="true" />
                    Auto-reply
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCommentsVideoId(null)}
                aria-label={tr('Funga maoni', 'Close comments')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
              {loadingComments ? (
                <div className="flex items-center justify-center py-10 text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{tr('Inapakia maoni...', 'Loading comments...')}</span>
                </div>
              ) : videoComments.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  {activeCommentsVideo?.allowComments === false
                    ? tr(
                        'Mwandishi amezima maoni kwenye chapisho hili.',
                        'The creator turned off comments on this post.'
                      )
                    : tr(
                        'Bado hakuna maoni. Kuwa wa kwanza kutoa maoni yako!',
                        'No comments yet. Be the first to comment!'
                      )}
                </div>
              ) : (
                structuredComments.roots.map((c) => {
                  const childReplies = structuredComments.repliesByParent.get(c.id) || [];
                  const renderCommentRow = (item: VideoComment, isChild = false) => {
                    const canDeleteComment = Boolean(user && (isAdmin || user.uid === item.authorId));
                    const isPostCreator = activeCommentsVideo?.authorId === item.authorId;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-2.5 ${
                          isChild ? 'ml-9 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onAuthorClick?.({
                              uid: item.authorId,
                              displayName: item.authorName,
                              photoURL: item.authorPhoto,
                            })
                          }
                          className="shrink-0"
                        >
                          <Avatar
                            name={item.authorName}
                            photoURL={item.authorPhoto}
                            size="sm"
                            uid={item.authorId}
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-slate-900">
                              {item.authorName}
                            </span>
                            <AuthorVerificationBadge uid={item.authorId} size="xs" />
                            {isPostCreator && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#FE2C55]">
                                {tr('Mwandishi', 'Creator')}
                              </span>
                            )}
                            {item.isAutoReply && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                                <Bot className="h-2.5 w-2.5" aria-hidden="true" />
                                Auto-reply
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              {item.createdAt ? formatTime(item.createdAt) : ''}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-700 break-words">
                            {item.replyToAuthorName && !item.isAutoReply && (
                              <span className="mr-1 font-bold text-[#1D4E89]">
                                @{item.replyToAuthorName}
                              </span>
                            )}
                            {item.body}
                          </p>
                          {!isChild &&
                            (activeCommentsVideo?.allowComments !== false ||
                              isAdmin ||
                              user?.uid === activeCommentsVideo?.authorId) && (
                              <button
                                type="button"
                                onClick={() => setReplyingToComment(item)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900"
                              >
                                <ReplyIcon className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Jibu', 'Reply')}</span>
                              </button>
                            )}
                        </div>
                        {canDeleteComment && (
                          <button
                            type="button"
                            onClick={() => void deleteVideoComment(commentsVideoId, item.id)}
                            aria-label={tr('Futa maoni', 'Delete comment')}
                            className="shrink-0 p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div key={c.id} className="space-y-2">
                      {renderCommentRow(c, false)}
                      {childReplies.map((child) => renderCommentRow(child, true))}
                    </div>
                  );
                })
              )}
            </div>

            {activeCommentsVideo?.allowComments === false &&
            !isAdmin &&
            user?.uid !== activeCommentsVideo?.authorId ? (
              <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3.5 text-xs font-semibold text-slate-500 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
                <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span>
                  {tr(
                    'Maoni yamefungwa na mwandishi.',
                    'Comments are turned off by the creator.'
                  )}
                </span>
              </div>
            ) : (
              <div className="border-t border-slate-200 bg-slate-50">
                {replyingToComment && (
                  <div className="flex items-center justify-between bg-sky-50 px-4 py-1.5 text-[11px] font-semibold text-sky-900">
                    <span className="truncate">
                      {tr('Unamjibu', 'Replying to')}{' '}
                      <strong>@{replyingToComment.authorName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyingToComment(null)}
                      className="text-sky-700 hover:text-sky-950"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(e) => void handleSubmitComment(e)}
                  className="flex items-center gap-2 px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
                >
                  {user ? (
                    <>
                      <input
                        type="text"
                        maxLength={1000}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={
                          replyingToComment
                            ? tr(
                                `Jibu maoni ya @${replyingToComment.authorName}...`,
                                `Reply to @${replyingToComment.authorName}...`
                              )
                            : tr('Andika maoni yako...', 'Add a comment...')
                        }
                        className="min-h-[44px] flex-1 rounded-full border border-slate-300 bg-white px-4 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim() || sendingComment}
                        aria-label={tr('Tuma maoni', 'Send comment')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FE2C55] text-white transition-opacity disabled:opacity-45"
                      >
                        {sendingComment ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="min-h-[44px] w-full rounded-full bg-[#0E2640] py-2.5 text-xs font-bold text-white"
                    >
                      {tr('Ingia ili Kuandika Maoni', 'Sign in to Comment')}
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TikTok Sound / Music Drawer ("Use This Sound") */}
      {soundDrawerVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center"
          onClick={() => setSoundDrawerVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-900 shadow-2xl md:max-w-md md:rounded-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0E2640] via-[#1D4E89] to-[#FE2C55] text-white shadow-md">
                  <Disc3 className="h-8 w-8 animate-malosha-spin" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-wide text-[#FE2C55] uppercase">
                    {tr('Sauti / Muziki wa Chapisho', 'Post Sound / Audio')}
                  </p>
                  <h3 className="truncate text-base font-extrabold text-slate-900">
                    {soundDrawerVideo.soundName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {tr('Imetumiwa na', 'Posted by')} @{soundDrawerVideo.authorName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSoundDrawerVideo(null)}
                aria-label={tr('Funga', 'Close')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {soundDrawerVideo.audioUrl && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <audio controls src={soundDrawerVideo.audioUrl} className="w-full" />
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => handleUseSoundFromPost(soundDrawerVideo)}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FE2C55] to-[#E11D48] px-4 text-sm font-extrabold text-white shadow-md transition-transform hover:brightness-105 active:scale-[0.99]"
              >
                <Music2 className="h-4.5 w-4.5" aria-hidden="true" />
                <span>
                  {tr('Tumia Sauti Hii Kupakia Picha / Video', 'Use This Sound for New Post')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TikTok Settings & Creator Controls Sheet */}
      {activeSettingsVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center"
          onClick={() => setSettingsVideoId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[86dvh] w-full overflow-y-auto rounded-t-3xl bg-white text-slate-900 shadow-2xl md:max-w-lg md:rounded-2xl"
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pt-2.5 pb-3">
              <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4.5 w-4.5 text-[#0E2640]" aria-hidden="true" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {tr('Mipangilio ya TikTok & Chapisho', 'TikTok & Post Settings')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsVideoId(null)}
                  aria-label={tr('Funga', 'Close')}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* Quick TikTok Action Grid */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleShareVideo(activeSettingsVideo);
                    setSettingsVideoId(null);
                  }}
                  className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-100 p-2 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
                >
                  <Share2 className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
                  <span>{tr('Shiriki', 'Share')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      `${window.location.origin}/?tab=video&v=${encodeURIComponent(activeSettingsVideo.id)}`
                    );
                    onToast(tr('Kiungo kimenakiliwa!', 'Link copied!'));
                    setSettingsVideoId(null);
                  }}
                  className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-100 p-2 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
                >
                  <Copy className="h-5 w-5 text-slate-700" aria-hidden="true" />
                  <span>{tr('Nakili Link', 'Copy Link')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadWatermarkedMedia(activeSettingsVideo);
                    setSettingsVideoId(null);
                  }}
                  className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-amber-50 p-2 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  <Download className="h-5 w-5 text-amber-700" aria-hidden="true" />
                  <span>{tr('Pakua', 'Download')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClearScreenMode((v) => !v);
                    setSettingsVideoId(null);
                  }}
                  className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-100 p-2 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
                >
                  <EyeOff className="h-5 w-5 text-slate-700" aria-hidden="true" />
                  <span>{tr('Skrini Safi', 'Clear UI')}</span>
                </button>
              </div>

              {/* Viewer Playback Settings */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-extrabold tracking-wide text-slate-600 uppercase">
                  {tr('Mipangilio ya Kutazama', 'Playback Preferences')}
                </h4>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      <FastForward className="h-4 w-4 text-[#FE2C55]" aria-hidden="true" />
                      {tr('Kasi ya Video (Speed)', 'Playback Speed')}
                    </span>
                    <span className="text-[#1D4E89]">{playbackSpeed}x</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {([0.5, 1, 1.5, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd)}
                        className={`min-h-[38px] rounded-xl text-xs font-extrabold transition-colors ${
                          playbackSpeed === spd
                            ? 'bg-[#0E2640] text-white'
                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {tr('Mwonekano wa Fremu (Screen Fit)', 'Screen Fit Mode')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fitMode === 'cover'
                        ? tr('Jaza skrini nzima (TikTok Full)', 'Fill full screen (Cover)')
                        : tr('Onyesha fremu halisi (Contain)', 'Fit full frame (Contain)')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFitMode((f) => (f === 'cover' ? 'contain' : 'cover'))}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    {fitMode === 'cover' ? (
                      <>
                        <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Contain</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Full Cover</span>
                      </>
                    )}
                  </button>
                </div>

                <label className="flex cursor-pointer items-center justify-between pt-1">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {tr('Endelea Inayofuata Kiotomatiki (Auto-Next)', 'Auto-Play Next Video')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {tr(
                        'Video/picha ikimaliza inashuka na kucheza inayofuata moja kwa moja',
                        'Automatically scroll and play next clip when current finishes'
                      )}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoScrollNext}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAutoScrollNext(next);
                      try {
                        window.localStorage.setItem(AUTO_NEXT_VIDEO_KEY, String(next));
                      } catch {
                        // Non-fatal
                      }
                    }}
                    className="h-5 w-5 accent-[#FE2C55]"
                  />
                </label>

                <div className="hidden items-center justify-between pt-1 md:flex">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {tr('Mwonekano wa Simu (Mobile View)', 'Desktop Stage View')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {desktopFrameMode === 'mobile'
                        ? tr('Fremu ya Simu 9:16 kama TikTok', 'TikTok 9:16 Mobile Portrait Frame')
                        : tr('Skrini nzima ya kompyuta', 'Full Widescreen Canvas')}
                    </p>
                  </div>
                  <div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
                    <button
                      type="button"
                      onClick={() => handleSetDesktopFrameMode('mobile')}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold ${
                        desktopFrameMode === 'mobile'
                          ? 'bg-[#0E2640] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Mobile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDesktopFrameMode('wide')}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold ${
                        desktopFrameMode === 'wide'
                          ? 'bg-[#0E2640] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Wide</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] font-semibold text-emerald-900">
                  <span>
                    {tr('Okoa Bando: Hufungua video iliyofikiwa pekee', 'Data Saver: Loads active stream only')}
                  </span>
                  <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                    ON
                  </span>
                </div>
              </div>

              {/* Author / Admin TikTok Creator Settings */}
              {Boolean(user && (isAdmin || user.uid === activeSettingsVideo.authorId)) && (
                <form
                  onSubmit={(e) => void handleSavePostSettings(e)}
                  className="space-y-4 rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold tracking-wide text-[#FE2C55] uppercase">
                      {tr('Mipangilio ya Mwandishi (Creator Controls)', 'Creator Post Controls')}
                    </h4>
                    <button
                      type="button"
                      onClick={handleSaveSettingsAsDefault}
                      className="text-[11px] font-bold text-[#1D4E89] hover:underline"
                    >
                      {tr('Weka Kama Chaguo-Msingi', 'Save as Default')}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      {tr('Hariri Maelezo (Caption)', 'Edit Caption')}
                    </label>
                    <textarea
                      rows={2}
                      maxLength={600}
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      {tr('Jina la Sauti / Muziki', 'Sound Name')}
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={editSoundName}
                      onChange={(e) => setEditSoundName(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2.5 divide-y divide-slate-200/70 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <label className="flex cursor-pointer items-center justify-between pt-0.5">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Maoni (Comments)', 'Allow Comments')}
                      </span>
                      <input
                        type="checkbox"
                        checked={editAllowComments}
                        onChange={(e) => setEditAllowComments(e.target.checked)}
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between pt-2.5">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Kupenda (Likes)', 'Allow Likes')}
                      </span>
                      <input
                        type="checkbox"
                        checked={editAllowLikes}
                        onChange={(e) => setEditAllowLikes(e.target.checked)}
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between pt-2.5">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Onyesha Idadi ya Likes', 'Show Like Count')}
                      </span>
                      <input
                        type="checkbox"
                        checked={editShowLikeCount}
                        onChange={(e) => setEditShowLikeCount(e.target.checked)}
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between pt-2.5">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Kupakua na Watermark (Download)', 'Allow Watermarked Download')}
                      </span>
                      <input
                        type="checkbox"
                        checked={editAllowDownload}
                        onChange={(e) => setEditAllowDownload(e.target.checked)}
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between pt-2.5">
                      <div>
                        <span className="text-xs font-bold text-slate-800">
                          {tr('Fanya Binafsi (Only Me)', 'Private (Only Me)')}
                        </span>
                        <p className="text-[10.5px] text-slate-500">
                          {tr('Wengine hawataona chapisho hili', 'Hide this post from public feed')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={editIsPrivate}
                        onChange={(e) => setEditIsPrivate(e.target.checked)}
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>
                  </div>

                  {/* Creator Auto-Reply Configuration */}
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                    <label className="flex cursor-pointer items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4.5 w-4.5 text-emerald-700" aria-hidden="true" />
                        <div>
                          <p className="text-xs font-extrabold text-emerald-950">
                            {tr('Auto-Reply Kwenye Maoni', 'Comments Auto-Reply')}
                          </p>
                          <p className="text-[10.5px] text-emerald-800">
                            {tr(
                              'Jibu maoni ya watazamaji papo hapo kiotomatiki',
                              'Automatically reply when viewers comment'
                            )}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={editAutoReplyEnabled}
                        onChange={(e) => setEditAutoReplyEnabled(e.target.checked)}
                        className="h-5 w-5 accent-emerald-600"
                      />
                    </label>

                    {editAutoReplyEnabled && (
                      <div className="space-y-2.5 border-t border-emerald-200/80 pt-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditAutoReplyTrigger('all')}
                            className={`min-h-[36px] rounded-lg px-2 text-[11px] font-bold ${
                              editAutoReplyTrigger === 'all'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-white text-slate-700 ring-1 ring-emerald-200'
                            }`}
                          >
                            {tr('Maoni Yote', 'All Comments')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditAutoReplyTrigger('keyword')}
                            className={`min-h-[36px] rounded-lg px-2 text-[11px] font-bold ${
                              editAutoReplyTrigger === 'keyword'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-white text-slate-700 ring-1 ring-emerald-200'
                            }`}
                          >
                            {tr('Neno Maalum (Keyword)', 'Specific Keyword')}
                          </button>
                        </div>

                        {editAutoReplyTrigger === 'keyword' && (
                          <input
                            type="text"
                            maxLength={60}
                            value={editAutoReplyKeyword}
                            onChange={(e) => setEditAutoReplyKeyword(e.target.value)}
                            placeholder={tr('Mfano: bei, mawasiliano, link', 'e.g. price, link, info')}
                            className="min-h-[40px] w-full rounded-xl border border-emerald-300 bg-white px-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        )}

                        <textarea
                          rows={2}
                          maxLength={300}
                          value={editAutoReplyMessage}
                          onChange={(e) => setEditAutoReplyMessage(e.target.value)}
                          placeholder={tr(
                            'Andika jibu la kiotomatiki...',
                            'Write your auto-reply message...'
                          )}
                          className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteVideo(activeSettingsVideo)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-red-50 px-3.5 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>{tr('Futa', 'Delete')}</span>
                    </button>
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#0E2640] px-5 text-xs font-extrabold text-white shadow-sm hover:bg-[#1D4E89] disabled:opacity-50"
                    >
                      {savingSettings && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      <span>{tr('Hifadhi Mipangilio', 'Save Changes')}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TikTok Studio Upload Modal (Video OR Photo Carousel + Music + Settings) */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={closeUploadModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white text-slate-900 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#22D3EE] to-[#FE2C55] text-white">
                  {uploadMediaType === 'photo' ? (
                    <ImageIcon className="h-4.5 w-4.5" aria-hidden="true" />
                  ) : (
                    <VideoIcon className="h-4.5 w-4.5" aria-hidden="true" />
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    {tr('Malosha Reels Studio', 'Malosha Reels Studio')}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {tr('Video, Picha + Muziki · Mtindo wa TikTok', 'Video or Photo + Music · Full TikTok')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={closeUploadModal}
                aria-label={tr('Funga', 'Close')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(e) => void handlePublishPost(e)} className="space-y-4 p-5">
              {/* Media Mode Selector: Video vs Photo Carousel */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setUploadMediaType('video')}
                  className={`flex min-h-[42px] items-center justify-center gap-2 rounded-lg text-xs font-extrabold transition-all ${
                    uploadMediaType === 'video'
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <VideoIcon className="h-4 w-4 text-[#FE2C55]" aria-hidden="true" />
                  <span>{tr('Pakia Video', 'Video')}</span>
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setUploadMediaType('photo')}
                  className={`flex min-h-[42px] items-center justify-center gap-2 rounded-lg text-xs font-extrabold transition-all ${
                    uploadMediaType === 'photo'
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                  <span>{tr('Picha + Muziki', 'Photos + Music')}</span>
                </button>
              </div>

              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.mov,.webm,.m4v"
                onChange={handlePickVideoFile}
                className="sr-only"
              />
              <input
                ref={photoFilesInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/*"
                multiple
                onChange={handlePickPhotoFiles}
                className="sr-only"
              />
              <input
                ref={audioFileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
                onChange={handlePickAudioFile}
                className="sr-only"
              />

              {uploadMediaType === 'video' ? (
                !videoPreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => videoFileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-9 text-center transition-colors hover:border-[#FE2C55] hover:bg-rose-50/40"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-[#FE2C55]">
                      <Upload className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {tr('Chagua Video Kutoka Kwenye Simu / PC', 'Select Video From Phone or PC')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tr('MP4, MOV, au WEBM (Upeo MB 95)', 'MP4, MOV, or WEBM (Max 95MB)')}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="relative overflow-hidden rounded-xl bg-black">
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      onLoadedMetadata={(e) => {
                        const dur = Math.round(e.currentTarget.duration || 0);
                        if (dur > 0) setDetectedDuration(dur);
                      }}
                      className="max-h-64 w-full object-contain"
                    />
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => videoFileInputRef.current?.click()}
                        className="absolute top-2.5 right-2.5 rounded-lg bg-black/75 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25 hover:bg-black"
                      >
                        {tr('Badilisha Video', 'Change Video')}
                      </button>
                    )}
                  </div>
                )
              ) : (
                <div className="space-y-2.5">
                  {selectedPhotos.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => photoFilesInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-9 text-center transition-colors hover:border-[#1D4E89] hover:bg-sky-50/40"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#1D4E89]">
                        <ImageIcon className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {tr('Chagua Picha (1 hadi 10) Kutoka Simu / PC', 'Select 1 to 10 Photos')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tr(
                            'Unaweza kuweka picha moja au albamu ya picha nyingi na muziki',
                            'Post a single photo or a swipeable photo carousel with music'
                          )}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* Large Active Carousel Preview */}
                      <div className="relative overflow-hidden rounded-xl bg-slate-950">
                        <img
                          src={selectedPhotos[studioPhotoPreviewIdx]?.previewUrl || selectedPhotos[0].previewUrl}
                          alt="Preview"
                          className="max-h-64 w-full object-contain"
                        />
                        <div className="absolute top-2.5 left-2.5 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
                          {studioPhotoPreviewIdx + 1} / {selectedPhotos.length}
                        </div>
                        {!uploading && selectedPhotos.length < 10 && (
                          <button
                            type="button"
                            onClick={() => photoFilesInputRef.current?.click()}
                            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg bg-black/75 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25 hover:bg-black"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Ongeza Picha', 'Add Photos')}</span>
                          </button>
                        )}
                      </div>

                      {/* Thumbnail Reorder & Remove Strip */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {selectedPhotos.map((p, idx) => (
                          <div
                            key={p.id}
                            className={`relative shrink-0 overflow-hidden rounded-xl border-2 ${
                              idx === studioPhotoPreviewIdx
                                ? 'border-[#FE2C55]'
                                : 'border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setStudioPhotoPreviewIdx(idx)}
                              className="block h-16 w-16"
                            >
                              <img
                                src={p.previewUrl}
                                alt={`Slide ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                            {!uploading && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => removeStudioPhoto(p.id)}
                                  aria-label={tr('Ondoa picha', 'Remove photo')}
                                  className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white hover:bg-red-600"
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/65 px-1 py-0.5 text-white">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => moveStudioPhoto(idx, -1)}
                                    className="disabled:opacity-30"
                                    aria-label="Move left"
                                  >
                                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === selectedPhotos.length - 1}
                                    onClick={() => moveStudioPhoto(idx, 1)}
                                    className="disabled:opacity-30"
                                    aria-label="Move right"
                                  >
                                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Attach Music / Audio Section */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music2 className="h-4 w-4 text-[#FE2C55]" aria-hidden="true" />
                    <span className="text-xs font-extrabold text-slate-900">
                      {tr('Ambatanisha Muziki / Sauti', 'Attach Music / Sound')}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => audioFileInputRef.current?.click()}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 text-[11px] font-bold text-white hover:bg-[#1D4E89] disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Pakia MP3/Sauti', 'Upload Audio')}</span>
                  </button>
                </div>

                {audioPreviewUrl ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
                    <audio
                      ref={previewAudioRef}
                      src={audioPreviewUrl}
                      onEnded={() => setAudioPreviewPlaying(false)}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={toggleStudioAudioPreview}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FE2C55] text-white"
                      aria-label={audioPreviewPlaying ? tr('Simamisha', 'Pause') : tr('Cheza', 'Play')}
                    >
                      {audioPreviewPlaying ? (
                        <Pause className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900">
                        {selectedAudioFile?.name || soundInput || tr('Sauti Iliyochaguliwa', 'Selected Audio')}
                      </p>
                      <p className="text-[10.5px] text-emerald-700">
                        {tr('Tayari kucheza kwenye chapisho', 'Ready to play on post')}
                      </p>
                    </div>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={handleClearSelectedAudio}
                        aria-label={tr('Ondoa muziki', 'Remove audio')}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : reusableCommunityTracks.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-500">
                      {tr('Au chagua wimbo uliotumiwa kwenye Malosha Reels:', 'Or pick a sound from feed:')}
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {reusableCommunityTracks.map((track) => (
                        <button
                          key={track.audioUrl}
                          type="button"
                          onClick={() => handleSelectReusableTrack(track)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 hover:border-[#FE2C55] hover:text-[#FE2C55]"
                        >
                          <Disc3 className="h-3.5 w-3.5 text-[#FE2C55]" aria-hidden="true" />
                          <span className="max-w-[140px] truncate">{track.soundName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {tr(
                      'Chagua wimbo (MP3, M4A, WAV, AAC) kutoka kwenye simu yako uambatanishe na picha au video.',
                      'Select an MP3, M4A, WAV, or AAC audio file from your device.'
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  {tr('Maelezo (Caption)', 'Caption')}
                </label>
                <textarea
                  rows={2}
                  maxLength={600}
                  disabled={uploading}
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  placeholder={tr(
                    'Andika maelezo mafupi yanayovutia...',
                    'Write an engaging caption...'
                  )}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    {tr('Jina la Sauti / Wimbo', 'Sound / Song Title')}
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    disabled={uploading}
                    value={soundInput}
                    onChange={(e) => setSoundInput(e.target.value)}
                    placeholder={`Sauti Halisi - ${userDisplayName}`}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    {tr('Hashtags', 'Hashtags')}
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    disabled={uploading}
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="#burudani #vijana #malosha"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Collapsible TikTok Post Settings (Auto-Reply, Comments, Likes, Download) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setStudioShowSettings((s) => !s)}
                  className="flex min-h-[44px] w-full items-center justify-between px-3.5 text-xs font-extrabold text-slate-800"
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-[#FE2C55]" aria-hidden="true" />
                    <span>
                      {tr(
                        'Mipangilio ya TikTok (Auto-Reply, Maoni, Pakua)',
                        'TikTok Settings (Auto-Reply, Comments, Download)'
                      )}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${studioShowSettings ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {studioShowSettings && (
                  <div className="space-y-3 border-t border-slate-200 bg-white p-3.5 rounded-b-xl">
                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Maoni (Comments)', 'Allow Comments')}
                      </span>
                      <input
                        type="checkbox"
                        checked={studioSettings.allowComments}
                        onChange={(e) =>
                          setStudioSettings((s) => ({ ...s, allowComments: e.target.checked }))
                        }
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Likes', 'Allow Likes')}
                      </span>
                      <input
                        type="checkbox"
                        checked={studioSettings.allowLikes}
                        onChange={(e) =>
                          setStudioSettings((s) => ({ ...s, allowLikes: e.target.checked }))
                        }
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Onyesha Idadi ya Likes', 'Show Like Count')}
                      </span>
                      <input
                        type="checkbox"
                        checked={studioSettings.showLikeCount}
                        onChange={(e) =>
                          setStudioSettings((s) => ({ ...s, showLikeCount: e.target.checked }))
                        }
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Ruhusu Kupakua na Watermark', 'Allow Watermarked Download')}
                      </span>
                      <input
                        type="checkbox"
                        checked={studioSettings.allowDownload}
                        onChange={(e) =>
                          setStudioSettings((s) => ({ ...s, allowDownload: e.target.checked }))
                        }
                        className="h-5 w-5 accent-[#FE2C55]"
                      />
                    </label>

                    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
                          <Bot className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                          {tr('Washa Auto-Reply Kwenye Maoni', 'Enable Comments Auto-Reply')}
                        </span>
                        <input
                          type="checkbox"
                          checked={studioSettings.autoReplyEnabled}
                          onChange={(e) =>
                            setStudioSettings((s) => ({
                              ...s,
                              autoReplyEnabled: e.target.checked,
                            }))
                          }
                          className="h-5 w-5 accent-emerald-600"
                        />
                      </label>

                      {studioSettings.autoReplyEnabled && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setStudioSettings((s) => ({ ...s, autoReplyTrigger: 'all' }))
                              }
                              className={`min-h-[34px] rounded-lg text-[11px] font-bold ${
                                studioSettings.autoReplyTrigger === 'all'
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-white text-slate-700 ring-1 ring-emerald-200'
                              }`}
                            >
                              {tr('Maoni Yote', 'All Comments')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setStudioSettings((s) => ({ ...s, autoReplyTrigger: 'keyword' }))
                              }
                              className={`min-h-[34px] rounded-lg text-[11px] font-bold ${
                                studioSettings.autoReplyTrigger === 'keyword'
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-white text-slate-700 ring-1 ring-emerald-200'
                              }`}
                            >
                              {tr('Neno Maalum', 'Keyword Only')}
                            </button>
                          </div>

                          {studioSettings.autoReplyTrigger === 'keyword' && (
                            <input
                              type="text"
                              maxLength={60}
                              value={studioSettings.autoReplyKeyword}
                              onChange={(e) =>
                                setStudioSettings((s) => ({
                                  ...s,
                                  autoReplyKeyword: e.target.value,
                                }))
                              }
                              placeholder={tr('Neno la kuchochea (mfano: bei)', 'Trigger keyword')}
                              className="min-h-[38px] w-full rounded-xl border border-emerald-300 bg-white px-3 text-xs text-slate-900 focus:outline-none"
                            />
                          )}

                          <textarea
                            rows={2}
                            maxLength={300}
                            value={studioSettings.autoReplyMessage}
                            onChange={(e) =>
                              setStudioSettings((s) => ({
                                ...s,
                                autoReplyMessage: e.target.value,
                              }))
                            }
                            placeholder={tr(
                              'Ujumbe utakaotumwa kiotomatiki...',
                              'Auto-reply message...'
                            )}
                            className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {uploading && (
                <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      {uploadStageLabel || tr('Inapakia...', 'Uploading...')}
                    </span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#22D3EE] to-[#FE2C55] transition-all duration-150"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={closeUploadModal}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {tr('Ghairi', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={
                    uploading ||
                    (uploadMediaType === 'video' ? !selectedVideoFile : selectedPhotos.length === 0)
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#FE2C55] to-[#E11D48] px-5 text-xs font-extrabold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : uploadMediaType === 'photo' ? (
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <VideoIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    {uploading
                      ? tr(`Inapakia ${uploadPct}%...`, `Uploading ${uploadPct}%...`)
                      : uploadMediaType === 'photo'
                        ? tr('Chapisha Picha & Muziki', 'Publish Photos')
                        : tr('Chapisha Video', 'Publish Video')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
