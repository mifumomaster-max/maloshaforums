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
  ArrowUpCircle,
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
  Flag,
  Flame,
  Gauge,
  Headphones,
  Heart,
  HeartCrack,
  HelpCircle,
  Image as ImageIcon,
  Languages,
  Loader2,
  Lock,
  Maximize,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Monitor,
  Music2,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Repeat,
  Reply as ReplyIcon,
  Send,
  Settings,
  Settings2,
  Share2,
  ShieldAlert,
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
  Wifi,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import {
  buildWatermarkedVideoDownloadUrl,
  downloadWatermarkedPhoto,
  ensureMaloshaOutroCardPublicId,
  ensureMaloshaWatermarkLogoPublicId,
  needsBrowserVideoTranscode,
  optimizeCloudinaryPhotoUrl,
  optimizeCloudinaryVideoPlaybackUrl,
  prewarmCloudinaryVideoUrl,
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
  submitReport,
  toggleFollowUser,
  toggleVideoLike,
  updateVideoSettings,
} from '../services/forumService';
import {
  COMMUNITY_SAFETY_RULES,
  VideoAutoReplyTrigger,
  VideoComment,
  VideoPost,
  findCommunityRule,
} from '../types';
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
const CREATOR_VIDEO_DEFAULTS_KEY = 'malosha_video_creator_defaults_v1';
const LEGACY_CREATOR_DEFAULTS_KEY = 'malosha_tiktok_creator_defaults_v1';
const AUTO_NEXT_VIDEO_KEY = 'malosha_video_autonext_v1';
const DESKTOP_FRAME_MODE_KEY = 'malosha_video_desktop_frame_v1';
const DATA_SAVER_VIDEO_KEY = 'malosha_video_data_saver_v1';
const NOT_INTERESTED_VIDEOS_KEY = 'malosha_not_interested_videos_v1';
const BG_AUDIO_VIDEO_KEY = 'malosha_video_bg_audio_v1';

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
    const raw =
      window.localStorage.getItem(CREATOR_VIDEO_DEFAULTS_KEY) ||
      window.localStorage.getItem(LEGACY_CREATOR_DEFAULTS_KEY);
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
  const videoRefCallbacksRef = useRef<Map<string, (el: HTMLVideoElement | null) => void>>(new Map());
  const audioRefCallbacksRef = useRef<Map<string, (el: HTMLAudioElement | null) => void>>(new Map());
  const slideRefCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());

  const getVideoRefCallback = useCallback((videoId: string) => {
    let cb = videoRefCallbacksRef.current.get(videoId);
    if (!cb) {
      cb = (el: HTMLVideoElement | null) => {
        if (el) {
          videoRefs.current[videoId] = el;
        } else {
          delete videoRefs.current[videoId];
        }
      };
      videoRefCallbacksRef.current.set(videoId, cb);
    }
    return cb;
  }, []);

  const getAudioRefCallback = useCallback((videoId: string) => {
    let cb = audioRefCallbacksRef.current.get(videoId);
    if (!cb) {
      cb = (el: HTMLAudioElement | null) => {
        if (el) {
          audioRefs.current[videoId] = el;
        } else {
          delete audioRefs.current[videoId];
        }
      };
      audioRefCallbacksRef.current.set(videoId, cb);
    }
    return cb;
  }, []);

  const getSlideRefCallback = useCallback((videoId: string) => {
    let cb = slideRefCallbacksRef.current.get(videoId);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) {
          slideRefs.current[videoId] = el;
        } else {
          delete slideRefs.current[videoId];
        }
      };
      slideRefCallbacksRef.current.set(videoId, cb);
    }
    return cb;
  }, []);

  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [feedMode, setFeedMode] = useState<'mix' | 'foryou' | 'following' | 'saved' | 'private'>('mix');
  const [mixSeed, setMixSeed] = useState<number>(() => Math.floor(Math.random() * 900_000) + 1000);
  const [justPublishedId, setJustPublishedId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [needsSoundTapPrompt, setNeedsSoundTapPrompt] = useState(false);
  const needsSoundTapPromptRef = useRef(false);
  const soundUnlockedOnPointerDownRef = useRef(false);
  const [pausedByTap, setPausedByTap] = useState(false);
  const pausedByTapRef = useRef(false);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
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
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem(DATA_SAVER_VIDEO_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [backgroundAudioMode, setBackgroundAudioMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(BG_AUDIO_VIDEO_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [captionsOverlayEnabled, setCaptionsOverlayEnabled] = useState(false);
  const [captionLang, setCaptionLang] = useState<'sw' | 'en'>('sw');
  const [notInterestedIds, setNotInterestedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(NOT_INTERESTED_VIDEOS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });
  const [longPressSheetVideo, setLongPressSheetVideo] = useState<VideoPost | null>(null);
  const [whyPostVideo, setWhyPostVideo] = useState<VideoPost | null>(null);
  const [reportSheetVideo, setReportSheetVideo] = useState<VideoPost | null>(null);
  const [reportRuleNumber, setReportRuleNumber] = useState<number>(0);
  const [reportReasonText, setReportReasonText] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

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
  const [bufferingVideoId, setBufferingVideoId] = useState<string | null>(null);
  const [stalledPlayPromptId, setStalledPlayPromptId] = useState<string | null>(null);
  const [endedOutroVideoId, setEndedOutroVideoId] = useState<string | null>(null);
  const [transcodeToggledVideoIds, setTranscodeToggledVideoIds] = useState<Record<string, boolean>>({});
  const [hevcForceH264Ids, setHevcForceH264Ids] = useState<Record<string, boolean>>({});
  const scrollRafRef = useRef<number | null>(null);
  const outroTimerRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    pausedByTapRef.current = pausedByTap;
  }, [pausedByTap]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    needsSoundTapPromptRef.current = needsSoundTapPrompt;
  }, [needsSoundTapPrompt]);

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
  const commentsScrollRef = useRef<HTMLDivElement>(null);

  // Settings / Post Options / Sound Drawer states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsVideoId, setSettingsVideoId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [soundDrawerVideo, setSoundDrawerVideo] = useState<VideoPost | null>(null);

  // Live edit state inside Settings drawer for post owner
  const [editCaption, setEditCaption] = useState('');
  const [editSoundName, setEditSoundName] = useState('');
  const [editRemoveAudio, setEditRemoveAudio] = useState(false);
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [editAllowDownload, setEditAllowDownload] = useState(true);
  const [editAllowLikes, setEditAllowLikes] = useState(true);
  const [editShowLikeCount, setEditShowLikeCount] = useState(true);
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [editAutoReplyEnabled, setEditAutoReplyEnabled] = useState(false);
  const [editAutoReplyTrigger, setEditAutoReplyTrigger] = useState<VideoAutoReplyTrigger>('all');
  const [editAutoReplyKeyword, setEditAutoReplyKeyword] = useState('');
  const [editAutoReplyMessage, setEditAutoReplyMessage] = useState('');

  // Upload Studio Modal state (Video OR Multi-Photo Carousel + Music + Post Settings)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMediaType, setUploadMediaType] = useState<'video' | 'photo'>('video');
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const photoFilesInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Video upload state
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [videoPreviewError, setVideoPreviewError] = useState(false);
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
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.removeAttribute('src');
        previewAudioRef.current.load();
      }
      if (audioFileInputRef.current) audioFileInputRef.current.value = '';
      setSelectedVideoFile(null);
      setVideoPreviewUrl('');
      setVideoPreviewError(false);
      setSelectedPhotos([]);
      setStudioPhotoPreviewIdx(0);
      setSelectedAudioFile(null);
      setReusedAudioUrl('');
      setAudioPreviewUrl('');
      setAudioPreviewPlaying(false);
      setSoundInput('');
      setUploadOpen(true);
    }
  }, [uploadModalSignal, user, isSuspended, isAdmin, onSignIn, onToast, tr]);

  // Pre-warm Malosha watermark logo & outro card on Cloudinary silently in background
  useEffect(() => {
    void ensureMaloshaWatermarkLogoPublicId();
    void ensureMaloshaOutroCardPublicId();
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
    setEditRemoveAudio(false);
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
      const next = new Set(bookmarkedIds);
      const added = !next.has(videoId);
      if (added) next.add(videoId);
      else next.delete(videoId);
      setBookmarkedIds(next);
      try {
        window.localStorage.setItem(BOOKMARKED_VIDEOS_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore quota errors
      }
      onToast(
        added
          ? tr('Chapisho limehifadhiwa kwenye Malosha Forums!', 'Post saved to your Malosha Forums bookmarks!')
          : tr('Limeondolewa kwenye zilizohifadhiwa.', 'Removed from saved posts.')
      );
    },
    [bookmarkedIds, onToast, tr]
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
      return videos.filter(
        (v) => !v.isArchived && !notInterestedIds.has(v.id) && followingByAuthor[v.authorId]
      );
    }
    if (feedMode === 'saved') {
      return videos.filter(
        (v) => bookmarkedIds.has(v.id) && (!v.isArchived || (user && v.authorId === user.uid))
      );
    }
    if (feedMode === 'private') {
      return videos.filter((v) => v.isArchived && user && v.authorId === user.uid);
    }
    const publicList = videos.filter((v) => !v.isArchived && !notInterestedIds.has(v.id));
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
  }, [videos, feedMode, followingByAuthor, bookmarkedIds, notInterestedIds, user, mixSeed, justPublishedId]);

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

  // Detect active snap slide via IntersectionObserver + Scroll position fallback
  useEffect(() => {
    const root = feedScrollRef.current;
    if (!root || visibleVideos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const vidId = entry.target.getAttribute('data-video-id');
            if (!vidId) continue;
            const idx = visibleVideos.findIndex((v) => v.id === vidId);
            if (idx >= 0) {
              setActiveIndex(idx);
              setPausedByTap(false);
              setBufferingVideoId(null);
              setStalledPlayPromptId(null);
            }
          }
        }
      },
      { root, threshold: [0.55] }
    );

    visibleVideos.forEach((v) => {
      const el = slideRefs.current[v.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleVideos]);

  const handleFeedScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const root = feedScrollRef.current;
      if (!root || visibleVideos.length === 0) return;
      const h = root.clientHeight;
      if (h <= 0) return;
      const nextIdx = Math.max(0, Math.min(visibleVideos.length - 1, Math.round(root.scrollTop / h)));
      if (nextIdx !== activeIndexRef.current) {
        activeIndexRef.current = nextIdx;
        setActiveIndex(nextIdx);
        setPausedByTap(false);
        setBufferingVideoId(null);
        setStalledPlayPromptId(null);
      }
    });
  }, [visibleVideos.length]);

  const activePost = visibleVideos[activeIndex] || null;
  const activeVideoId = activePost?.id || null;

  const openSettingsModal = useCallback(
    (targetPostId?: string | null) => {
      setSettingsVideoId(targetPostId ?? activePost?.id ?? null);
      setSettingsOpen(true);
    },
    [activePost?.id]
  );

  const closeSettingsModal = useCallback(() => {
    setSettingsOpen(false);
    setSettingsVideoId(null);
  }, []);

  const tryPlayMediaElement = useCallback(async (el: HTMLMediaElement, videoId: string, retryDepth = 0) => {
    if (pausedByTapRef.current) return;
    if (!el.paused && !el.ended && el.readyState >= 2) {
      setStalledPlayPromptId((curr) => (curr === videoId ? null : curr));
      setBufferingVideoId((curr) => (curr === videoId ? null : curr));
      return;
    }
    if (el.error || el.networkState === 3) {
      el.load();
    }
    try {
      await el.play();
      setStalledPlayPromptId((curr) => (curr === videoId ? null : curr));
      setBufferingVideoId((curr) => (curr === videoId ? null : curr));
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'AbortError') {
        if (retryDepth < 2) {
          window.setTimeout(() => {
            if (!pausedByTapRef.current && videoRefs.current[videoId] === el) {
              void tryPlayMediaElement(el, videoId, retryDepth + 1);
            }
          }, 120);
        }
        return;
      }

      // If browser blocked unmuted autoplay on initial load, start muted right away so video moves instead of freezing like a photo, and prompt 1 tap for sound
      if (!el.muted) {
        el.muted = true;
        if (!mutedRef.current) {
          needsSoundTapPromptRef.current = true;
          setNeedsSoundTapPrompt(true);
        }
        try {
          await el.play();
          setBufferingVideoId((curr) => (curr === videoId ? null : curr));
          setStalledPlayPromptId((curr) => (curr === videoId ? null : curr));
          return;
        } catch (mutedErr) {
          const mutedErrName = mutedErr instanceof Error ? mutedErr.name : '';
          if (mutedErrName === 'AbortError') {
            if (retryDepth < 2) {
              window.setTimeout(() => {
                if (!pausedByTapRef.current && videoRefs.current[videoId] === el) {
                  void tryPlayMediaElement(el, videoId, retryDepth + 1);
                }
              }, 120);
            }
            return;
          }
        }
      }

      setBufferingVideoId((curr) => (curr === videoId ? null : curr));
      setStalledPlayPromptId(videoId);
    }
  }, []);

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      if (visibleVideos.length === 0) return;
      if (outroTimerRef.current) {
        window.clearTimeout(outroTimerRef.current);
        outroTimerRef.current = null;
      }
      const bounded = Math.max(0, Math.min(visibleVideos.length - 1, nextIndex));
      const target = visibleVideos[bounded];
      if (!target) return;
      setEndedOutroVideoId(null);
      setPausedByTap(false);
      setBufferingVideoId(null);
      setStalledPlayPromptId(null);
      setActiveIndex(bounded);
      const el = slideRefs.current[target.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [visibleVideos]
  );

  const handleToggleAutoNext = useCallback(() => {
    const next = !autoScrollNext;
    setAutoScrollNext(next);
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
  }, [autoScrollNext, onToast, tr]);

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
    setStalledPlayPromptId(null);
    feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    onToast(tr('Video zimechanganywa upya (Mpya & Zamani)!', 'Feed reshuffled (New & Old mix)!'));
  }, [onToast, tr]);

  const handleToggleDataSaver = useCallback(
    (explicitNext?: boolean) => {
      const next = typeof explicitNext === 'boolean' ? explicitNext : !dataSaverMode;
      setDataSaverMode(next);
      setTranscodeToggledVideoIds({});
      try {
        window.localStorage.setItem(DATA_SAVER_VIDEO_KEY, String(next));
      } catch {
        // Non-fatal
      }
      onToast(
        next
          ? tr(
              'Data Saver IMEWASHWA: Video na picha zinatumia MB chache sana.',
              'Data Saver ON: Streaming lightweight video & photo sizes to save MBs.'
            )
          : tr(
              'Data Saver IMEZIMWA: Unatazama ubora wa juu (HD).',
              'Data Saver OFF: Streaming original high quality.'
            )
      );
    },
    [dataSaverMode, onToast, tr]
  );

  const handleToggleBackgroundAudio = useCallback(
    (explicitNext?: boolean) => {
      const next = typeof explicitNext === 'boolean' ? explicitNext : !backgroundAudioMode;
      setBackgroundAudioMode(next);
      try {
        window.localStorage.setItem(BG_AUDIO_VIDEO_KEY, String(next));
      } catch {
        // Non-fatal
      }
      onToast(
        next
          ? tr(
              'Sauti ya Nyuma IMEWASHWA: Sauti itaendelea kusikika hata ukiwa nje ya skrini.',
              'Background Audio ON: Audio keeps playing in background.'
            )
          : tr('Sauti ya Nyuma IMEZIMWA.', 'Background Audio OFF.')
      );
    },
    [backgroundAudioMode, onToast, tr]
  );

  const handleMarkNotInterested = useCallback(
    (video: VideoPost) => {
      const next = new Set(notInterestedIds);
      next.add(video.id);
      setNotInterestedIds(next);
      try {
        window.localStorage.setItem(NOT_INTERESTED_VIDEOS_KEY, JSON.stringify([...next]));
      } catch {
        // Non-fatal
      }
      setLongPressSheetVideo(null);
      onToast(
        tr(
          'Sawa! Tumeondoa chapisho hili kwenye orodha yako.',
          'Got it! Hidden from your video feed.'
        )
      );
    },
    [notInterestedIds, onToast, tr]
  );

  const handleTriggerPiP = useCallback(
    async (video: VideoPost) => {
      const el = videoRefs.current[video.id] as
        | (HTMLVideoElement & {
            webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture') => void;
          })
        | null;
      if (!el || video.mediaType === 'photo') {
        onToast(
          tr(
            'Picture-in-Picture inafanya kazi kwenye video pekee.',
            'Picture-in-Picture works on video clips only.'
          ),
          'error'
        );
        return;
      }
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
        if (typeof el.requestPictureInPicture === 'function') {
          await el.requestPictureInPicture();
          onToast(tr('Picture-in-Picture imewashwa!', 'Picture-in-Picture active!'));
        } else if (typeof el.webkitSetPresentationMode === 'function') {
          el.webkitSetPresentationMode('picture-in-picture');
          onToast(tr('Picture-in-Picture imewashwa!', 'Picture-in-Picture active!'));
        } else {
          onToast(
            tr(
              'Kivinjari hiki hakiruhusu Picture-in-Picture.',
              'Picture-in-Picture is not supported in this browser.'
            ),
            'error'
          );
        }
      } catch {
        onToast(
          tr(
            'Cheza video kwanza au ruhusu PiP kwenye kivinjari chako.',
            'Play the video first or allow PiP in your browser.'
          ),
          'error'
        );
      }
    },
    [onToast, tr]
  );

  // Background audio MediaSession & visibility persistence
  useEffect(() => {
    if (!backgroundAudioMode || !activePost) return;
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: activePost.caption?.slice(0, 80) || activePost.soundName || 'Malosha Video',
          artist: activePost.authorName || 'Malosha Forums',
          album: 'Malosha Forums Video',
          artwork: activePost.thumbnailUrl
            ? [{ src: activePost.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' }]
            : undefined,
        });
        navigator.mediaSession.setActionHandler('play', () => {
          const el = videoRefs.current[activePost.id] || audioRefs.current[activePost.id];
          if (el) void el.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          const el = videoRefs.current[activePost.id] || audioRefs.current[activePost.id];
          if (el) el.pause();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          const nextIdx = activeIndexRef.current + 1 < visibleVideos.length ? activeIndexRef.current + 1 : 0;
          scrollToIndex(nextIdx);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          const prevIdx = activeIndexRef.current > 0 ? activeIndexRef.current - 1 : Math.max(0, visibleVideos.length - 1);
          scrollToIndex(prevIdx);
        });
      } catch {
        // Browser may restrict mediaSession
      }
    }

    const onVisibility = () => {
      if (document.hidden && backgroundAudioMode && !pausedByTapRef.current) {
        const audEl = audioRefs.current[activePost.id];
        const vidEl = videoRefs.current[activePost.id];
        if (audEl && audEl.paused) void audEl.play().catch(() => {});
        else if (vidEl && vidEl.paused) void vidEl.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [backgroundAudioMode, activePost, visibleVideos.length, scrollToIndex]);

  // Data-saver single-stream playback: play active <video>/<audio> whenever playback state or source updates
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([vidId, el]) => {
      if (!el) return;
      if (vidId === activeVideoId) {
        el.muted = muted || needsSoundTapPromptRef.current || Boolean(activePost?.audioUrl);
        el.playbackRate = playbackSpeed;
        if (!pausedByTap && !uploadOpen && !settingsOpen) {
          void tryPlayMediaElement(el, vidId);
        } else {
          el.pause();
        }
      } else {
        el.pause();
      }
    });

    Object.entries(audioRefs.current).forEach(([vidId, el]) => {
      if (!el) return;
      if (vidId === activeVideoId) {
        el.muted = muted || needsSoundTapPromptRef.current;
        el.playbackRate = playbackSpeed;
        if (!pausedByTap && !uploadOpen && !settingsOpen) {
          void tryPlayMediaElement(el, vidId);
        } else {
          el.pause();
        }
      } else {
        el.pause();
      }
    });
  }, [
    activeVideoId,
    activePost?.audioUrl,
    pausedByTap,
    muted,
    uploadOpen,
    settingsOpen,
    playbackSpeed,
    dataSaverMode,
    transcodeToggledVideoIds,
    hevcForceH264Ids,
    tryPlayMediaElement,
  ]);

  // First tap or key press anywhere automatically restores full sound when browser blocked initial unmuted autoplay
  useEffect(() => {
    if (!needsSoundTapPrompt || muted || !activeVideoId) return;
    const unlockSoundOnGesture = () => {
      soundUnlockedOnPointerDownRef.current = true;
      window.setTimeout(() => {
        soundUnlockedOnPointerDownRef.current = false;
      }, 350);
      setNeedsSoundTapPrompt(false);
      const vidEl = videoRefs.current[activeVideoId];
      const audEl = audioRefs.current[activeVideoId];
      if (vidEl) {
        vidEl.muted = Boolean(activePost?.audioUrl);
        if (vidEl.paused && !pausedByTapRef.current) {
          void vidEl.play().catch(() => {});
        }
      }
      if (audEl) {
        audEl.muted = false;
        if (audEl.paused && !pausedByTapRef.current) {
          void audEl.play().catch(() => {});
        }
      }
    };

    window.addEventListener('pointerdown', unlockSoundOnGesture, { capture: true, once: true });
    window.addEventListener('keydown', unlockSoundOnGesture, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockSoundOnGesture, true);
      window.removeEventListener('keydown', unlockSoundOnGesture, true);
    };
  }, [needsSoundTapPrompt, muted, activeVideoId, activePost?.audioUrl]);

  // Pause inactive slide media streams & clear any pending outro timer when switching activeVideoId
  useEffect(() => {
    if (outroTimerRef.current) {
      window.clearTimeout(outroTimerRef.current);
      outroTimerRef.current = null;
    }
    setEndedOutroVideoId(null);

    // Pause any non-active video/audio elements without touching the newly active slide's src
    Object.entries(videoRefs.current).forEach(([vidId, el]) => {
      if (vidId === activeVideoId || !el) return;
      el.pause();
    });
    Object.entries(audioRefs.current).forEach(([vidId, el]) => {
      if (vidId === activeVideoId || !el) return;
      el.pause();
      el.currentTime = 0;
    });
  }, [activeVideoId]);

  // Progress watchdog: if an active video is frozen at 0:00 (e.g., uncached 200 accept-ranges:none transcode or HEVC hvc1 codec), fall back automatically to fast 206 stream or H.264
  useEffect(() => {
    if (!activePost || activePost.mediaType === 'photo' || pausedByTap || uploadOpen || settingsOpen) {
      return;
    }
    const vidId = activePost.id;
    const rawUrl = activePost.videoUrl || '';
    const elStart = videoRefs.current[vidId];
    const startTime = elStart?.currentTime || 0;

    const timer = window.setTimeout(() => {
      const el = videoRefs.current[vidId];
      if (!el || pausedByTapRef.current) return;

      const progressed = el.currentTime - startTime > 0.08 || (el.readyState >= 3 && !el.paused);
      const hasZeroVideoDimensions = el.duration > 0 && el.videoWidth === 0 && el.videoHeight === 0;

      if (progressed && !hasZeroVideoDimensions) {
        setBufferingVideoId((curr) => (curr === vidId ? null : curr));
        return;
      }

      if (hasZeroVideoDimensions && !hevcForceH264Ids[vidId]) {
        setHevcForceH264Ids((prev) => ({ ...prev, [vidId]: true }));
        return;
      }

      if (dataSaverMode && !transcodeToggledVideoIds[vidId] && !needsBrowserVideoTranscode(rawUrl)) {
        const ecoUrl = optimizeCloudinaryVideoPlaybackUrl(rawUrl, { dataSaver: true });
        prewarmCloudinaryVideoUrl(ecoUrl);
        setTranscodeToggledVideoIds((prev) => ({ ...prev, [vidId]: true }));
        return;
      }

      if (!hevcForceH264Ids[vidId]) {
        setHevcForceH264Ids((prev) => ({ ...prev, [vidId]: true }));
        return;
      }

      // Already exhausted fallbacks — try explicit play or show subtle tap-to-play overlay
      if (el.paused) {
        void tryPlayMediaElement(el, vidId);
      }
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [
    activePost,
    pausedByTap,
    uploadOpen,
    settingsOpen,
    dataSaverMode,
    transcodeToggledVideoIds,
    hevcForceH264Ids,
    tryPlayMediaElement,
  ]);

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

  const handleTogglePlayPause = useCallback(
    (targetVideo?: VideoPost | null) => {
      const vid = targetVideo || activePost;
      if (!vid) return;
      const vidEl = videoRefs.current[vid.id];
      const audEl = audioRefs.current[vid.id];
      const nextPaused = !pausedByTapRef.current;
      pausedByTapRef.current = nextPaused;
      setPausedByTap(nextPaused);

      if (nextPaused) {
        if (vidEl) vidEl.pause();
        if (audEl) audEl.pause();
      } else {
        if (outroTimerRef.current) {
          window.clearTimeout(outroTimerRef.current);
          outroTimerRef.current = null;
        }
        if (endedOutroVideoId === vid.id) {
          setEndedOutroVideoId(null);
          if (vidEl) vidEl.currentTime = 0;
        }
        setStalledPlayPromptId(null);
        setNeedsSoundTapPrompt(false);
        if (vidEl) {
          if (vidEl.error || vidEl.networkState === 3) {
            vidEl.load();
          }
          vidEl.muted = muted || Boolean(vid.audioUrl);
          void vidEl.play().catch((err) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            setStalledPlayPromptId(vid.id);
          });
        }
        if (audEl) {
          audEl.muted = muted;
          void audEl.play().catch(() => {});
        }
      }
    },
    [activePost, endedOutroVideoId, muted]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  const handleStagePointerDown = useCallback(
    (video: VideoPost, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      longPressOriginRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(18);
        }
        setLongPressSheetVideo(video);
      }, 450);
    },
    [clearLongPressTimer]
  );

  const handleStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const origin = longPressOriginRef.current;
      if (!origin || !longPressTimerRef.current) return;
      const dist = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
      if (dist > 10) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer]
  );

  const handleStagePointerClick = useCallback(
    (video: VideoPost, e: React.MouseEvent<HTMLDivElement>) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
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

      const vidEl = videoRefs.current[video.id];
      const audEl = audioRefs.current[video.id];
      const slideIdx = visibleVideos.findIndex((v) => v.id === video.id);
      if (slideIdx >= 0 && slideIdx !== activeIndex) {
        setActiveIndex(slideIdx);
        pausedByTapRef.current = false;
        setPausedByTap(false);
        setStalledPlayPromptId(null);
        return;
      }

      // If user just tapped to unlock sound from the muted autoplay fallback, keep video playing!
      if (soundUnlockedOnPointerDownRef.current) {
        soundUnlockedOnPointerDownRef.current = false;
        return;
      }

      // Resume immediately if stalled or paused or outro showing (never force-mute!)
      if (vidEl && (vidEl.paused || pausedByTapRef.current || endedOutroVideoId === video.id)) {
        if (singleTapTimerRef.current) {
          window.clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        if (outroTimerRef.current) {
          window.clearTimeout(outroTimerRef.current);
          outroTimerRef.current = null;
        }
        if (endedOutroVideoId === video.id) {
          setEndedOutroVideoId(null);
          vidEl.currentTime = 0;
        }
        if (vidEl.error || vidEl.networkState === 3) {
          vidEl.load();
        }
        pausedByTapRef.current = false;
        setPausedByTap(false);
        setStalledPlayPromptId(null);
        setNeedsSoundTapPrompt(false);
        vidEl.muted = muted || Boolean(video.audioUrl);
        void vidEl.play().catch(() => {});
        if (audEl) {
          audEl.muted = muted;
          void audEl.play().catch(() => {});
        }
        lastTapRef.current = { id: video.id, time: now };
        return;
      }

      lastTapRef.current = { id: video.id, time: now };
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        const isPhotoPost = video.mediaType === 'photo' || !video.videoUrl;
        const isMultiPhoto = isPhotoPost && (video.photoUrls?.length || 0) > 1;
        if (isMultiPhoto && x < rect.width * 0.25) {
          stepPhotoSlide(video.id, video.photoUrls!.length, -1);
        } else if (isMultiPhoto && x > rect.width * 0.75) {
          stepPhotoSlide(video.id, video.photoUrls!.length, 1);
        } else if (!isPhotoPost || Boolean(video.audioUrl)) {
          handleTogglePlayPause(video);
        }
        singleTapTimerRef.current = null;
      }, 220);
    },
    [
      likedVideoIds,
      handleToggleLike,
      stepPhotoSlide,
      visibleVideos,
      activeIndex,
      muted,
      endedOutroVideoId,
      handleTogglePlayPause,
    ]
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

  const handleSubmitVideoReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportSheetVideo || submittingReport) return;
    if (!user) {
      onToast(tr('Ingia kwanza ili kuripoti chapisho.', 'Sign in first to report.'), 'error');
      onSignIn();
      return;
    }
    const chosenRule = reportRuleNumber ? findCommunityRule(reportRuleNumber) : null;
    const trimmed = reportReasonText.trim();
    if (!chosenRule && trimmed.length < 3) {
      onToast(
        tr('Chagua sheria iliyovunjwa au andika sababu fupi.', 'Select a rule or enter a short reason.'),
        'error'
      );
      return;
    }
    const finalReason = chosenRule
      ? `Kanuni #${chosenRule.number} (${chosenRule.titleSw})${trimmed ? `: ${trimmed}` : ''}`
      : trimmed;
    setSubmittingReport(true);
    const reportReason: 'spam' | 'harassment' | 'misinformation' | 'unlawful' | 'other' =
      chosenRule?.number === 11
        ? 'spam'
        : chosenRule?.number === 3 || chosenRule?.number === 4
          ? 'harassment'
          : chosenRule?.number === 6
            ? 'misinformation'
            : chosenRule?.number === 1 || chosenRule?.number === 2 || chosenRule?.number === 5 || chosenRule?.number === 12
              ? 'unlawful'
              : 'other';
    try {
      await submitReport(
        user.uid,
        'video',
        reportSheetVideo.id,
        reportSheetVideo.id,
        reportReason,
        finalReason,
        chosenRule ? chosenRule.number : undefined
      );
      setReportSheetVideo(null);
      setReportRuleNumber(0);
      setReportReasonText('');
      onToast(
        tr(
          'Ripoti imetumwa kwa timu ya usalama ya Malosha Forums!',
          'Report submitted to Malosha Forums moderation team!'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma ripoti.', 'Failed to submit report.'),
        'error'
      );
    } finally {
      setSubmittingReport(false);
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

    if (video.mediaType === 'photo' || (!video.videoUrl && (video.photoUrls?.length || 0) > 0)) {
      const photos = video.photoUrls || [];
      const currentIdx = Math.min(photoSlideByVideoId[video.id] || 0, Math.max(0, photos.length - 1));
      const activeImgUrl = photos[currentIdx] || video.thumbnailUrl;
      if (!activeImgUrl) {
        setDownloadingId(null);
        return;
      }
      onToast(
        tr(
          'Inaandaa picha yenye logo & watermark ya @malosha forums...',
          'Preparing photo with @malosha forums watermark...'
        )
      );
      try {
        await downloadWatermarkedPhoto(
          activeImgUrl,
          video.authorName,
          `malosha-forums-photo-${video.id.slice(0, 6)}.jpg`
        );
        onToast(
          tr(
            'Picha imepakuliwa na watermark ya @malosha forums!',
            'Photo downloaded with @malosha forums watermark!'
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
        'Inaandaa video yenye logo (@malosha forums) na lebo ya mwisho...',
        'Preparing MP4 with @malosha forums watermark & end label...'
      )
    );
    const fileName = `malosha-forums-${video.id.slice(0, 6)}.mp4`;

    try {
      const [logoPid, outroPid] = await Promise.all([
        ensureMaloshaWatermarkLogoPublicId(),
        ensureMaloshaOutroCardPublicId(),
      ]);
      const liveEl = videoRefs.current[video.id];
      const measuredDuration =
        liveEl && Number.isFinite(liveEl.duration) && liveEl.duration > 0
          ? Math.round(liveEl.duration)
          : video.durationSec || 0;

      const candidateUrls = [
        outroPid
          ? buildWatermarkedVideoDownloadUrl(video.videoUrl, video.authorName, {
              logoPublicId: logoPid,
              outroPublicId: outroPid,
              durationSec: measuredDuration,
              outroMode: 'splice',
              dataSaver: dataSaverMode,
            })
          : '',
        logoPid && measuredDuration >= 3
          ? buildWatermarkedVideoDownloadUrl(video.videoUrl, video.authorName, {
              logoPublicId: logoPid,
              durationSec: measuredDuration,
              outroMode: 'endOverlay',
              dataSaver: dataSaverMode,
            })
          : '',
        buildWatermarkedVideoDownloadUrl(video.videoUrl, video.authorName, {
          logoPublicId: logoPid,
          outroMode: 'watermarkOnly',
          dataSaver: dataSaverMode,
        }),
        buildWatermarkedVideoDownloadUrl(video.videoUrl, video.authorName, {
          outroMode: 'watermarkOnly',
          dataSaver: dataSaverMode,
        }),
      ].filter((u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx);

      let chosenBlob: Blob | null = null;
      const chosenUrl = candidateUrls[0] || video.videoUrl;

      for (const candUrl of candidateUrls) {
        try {
          const res = await fetch(candUrl);
          if (!res.ok) continue;
          const b = await res.blob();
          if (b && b.size > 1000 && (!b.type || b.type.startsWith('video/') || b.type === 'application/octet-stream')) {
            chosenBlob = b;
            break;
          }
        } catch {
          // Try next tier
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

      const dlMb = chosenBlob ? `${(chosenBlob.size / (1024 * 1024)).toFixed(1)} MB` : '';
      onToast(
        dlMb
          ? tr(
              `Video imepakuliwa (${dlMb}) ikiwa na ubora mzuri, logo ya @malosha forums & lebo ya mwisho!`,
              `Downloaded (${dlMb}) in compact HD with @malosha forums watermark & end label!`
            )
          : tr(
              'Video imepakuliwa ikiwa na ubora mzuri, watermark ya @malosha forums & lebo ya mwisho!',
              'Video downloaded in compact HD with @malosha forums watermark & outro label!'
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
        closeSettingsModal();
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
      window.requestAnimationFrame(() => {
        const el = commentsScrollRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
      });
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
      const nextSoundName = editRemoveAudio
        ? editSoundName.trim() === activeSettingsVideo.soundName
          ? activeSettingsVideo.mediaType === 'photo'
            ? `Picha - ${activeSettingsVideo.authorName}`
            : `Sauti Halisi - ${activeSettingsVideo.authorName}`
          : editSoundName.trim() || `Sauti Halisi - ${activeSettingsVideo.authorName}`
        : editSoundName;
      await updateVideoSettings(activeSettingsVideo.id, {
        caption: editCaption,
        soundName: nextSoundName,
        ...(editRemoveAudio ? { audioUrl: '' } : {}),
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
      onToast(tr('Mipangilio ya chapisho imehifadhiwa kwenye Malosha Forums!', 'Post settings saved on Malosha Forums!'));
      closeSettingsModal();
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
      window.localStorage.setItem(CREATOR_VIDEO_DEFAULTS_KEY, JSON.stringify(nextDefaults));
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
    setVideoPreviewError(false);
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
    const target = selectedPhotos.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = selectedPhotos.filter((p) => p.id !== id);
    setSelectedPhotos(next);
    setStudioPhotoPreviewIdx((idx) => Math.max(0, Math.min(idx, Math.max(0, next.length - 1))));
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
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.removeAttribute('src');
      previewAudioRef.current.load();
    }
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = '';
    }
    setSelectedAudioFile(null);
    setReusedAudioUrl('');
    setAudioPreviewUrl('');
    setAudioPreviewPlaying(false);
    setSoundInput('');
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

  const resetStudioUploadState = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.removeAttribute('src');
      previewAudioRef.current.load();
    }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    if (photoFilesInputRef.current) photoFilesInputRef.current.value = '';
    if (audioFileInputRef.current) audioFileInputRef.current.value = '';
    setSelectedVideoFile(null);
    setVideoPreviewUrl('');
    setVideoPreviewError(false);
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
  };

  const closeUploadModal = () => {
    if (uploading) return;
    resetStudioUploadState();
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
      window.localStorage.setItem(CREATOR_VIDEO_DEFAULTS_KEY, JSON.stringify(studioSettings));
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
      {/* Clean Top Bar */}
      {!clearScreenMode ? (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex items-center justify-between gap-2 bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3 pt-2.5 pb-5 sm:px-4 ${
            isMobilePortraitFrame ? 'md:max-w-[440px] md:pt-3.5' : 'sm:px-6'
          }`}
        >
          <div className="pointer-events-auto flex items-center gap-1.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={tr('Rudi Jukwaani', 'Back to Forum')}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-white/90 drop-shadow transition-opacity hover:text-white md:hidden"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
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
                resetStudioUploadState();
                setUploadOpen(true);
              }}
              title={tr('Pakia video au picha', 'Upload video or photo')}
              aria-label={tr('Pakia video au picha', 'Create post')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/60 text-white drop-shadow transition-transform hover:scale-105 active:scale-95"
            >
              <Plus className="h-4.5 w-4.5 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          <div className="pointer-events-auto flex min-w-0 flex-1 items-center justify-start gap-2.5 overflow-x-auto px-1 sm:justify-center sm:gap-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                { id: 'mix', label: tr('Mix', 'Mix') },
                { id: 'foryou', label: tr('Mpya', 'For You') },
                {
                  id: 'following',
                  label: tr('Wanaofuatwa', 'Following'),
                  hasDot: Object.values(followingByAuthor).some(Boolean),
                },
                { id: 'saved', label: tr('Hifadhi', 'Saved') },
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
                hasDot?: boolean;
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
                  className={`relative flex shrink-0 flex-col items-center py-1 text-[12px] whitespace-nowrap drop-shadow transition-colors sm:text-sm ${
                    active ? 'font-extrabold text-white' : 'font-semibold text-white/65 hover:text-white/90'
                  }`}
                >
                  <span className="relative inline-flex items-center">
                    {mode.label}
                    {mode.hasDot && (
                      <span
                        className="ml-0.5 -mt-2.5 h-1.5 w-1.5 rounded-full bg-[#FE2C55]"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    className={`mt-1 h-[2.5px] rounded-full transition-all ${
                      active ? 'w-5 bg-white' : 'w-0 bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => handleToggleDataSaver()}
              title={
                dataSaverMode
                  ? tr('Okoa MB Imewashwa — Gusa kuweka HD', 'Data Saver ON — Tap for HD')
                  : tr('Ubora wa HD — Gusa Kuokoa MB', 'HD Quality — Tap to Save MBs')
              }
              aria-label={
                dataSaverMode
                  ? tr('Okoa MB Imewashwa', 'Data Saver ON')
                  : tr('Okoa MB Imezimwa', 'Data Saver OFF')
              }
              className="relative flex h-8 w-8 items-center justify-center drop-shadow transition-transform active:scale-90"
            >
              <Wifi
                className={`h-4.5 w-4.5 ${
                  dataSaverMode ? 'text-emerald-400' : 'text-white/80 hover:text-white'
                }`}
                aria-hidden="true"
              />
              <span
                className={`absolute right-0.5 bottom-0.5 text-[7px] leading-none font-black ${
                  dataSaverMode ? 'text-emerald-300' : 'text-white/75'
                }`}
              >
                {dataSaverMode ? 'MB' : 'HD'}
              </span>
            </button>

            {activePost && !(activePost.mediaType === 'photo' && !activePost.audioUrl) && (
              <>
                <button
                  type="button"
                  onClick={() => handleTogglePlayPause(activePost)}
                  title={pausedByTap ? tr('Cheza Video', 'Play Video') : tr('Simamisha Video', 'Pause Video')}
                  aria-label={pausedByTap ? tr('Cheza Video', 'Play Video') : tr('Simamisha Video', 'Pause Video')}
                  className="flex h-8 w-8 items-center justify-center text-white/90 drop-shadow transition-transform hover:text-white active:scale-90"
                >
                  {pausedByTap ? (
                    <Play className="h-4.5 w-4.5 fill-white" aria-hidden="true" />
                  ) : (
                    <Pause className="h-4.5 w-4.5 fill-white" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextMuted = !muted;
                    setMuted(nextMuted);
                    setNeedsSoundTapPrompt(false);
                    const vidEl = videoRefs.current[activePost.id];
                    const audEl = audioRefs.current[activePost.id];
                    if (vidEl) vidEl.muted = nextMuted || Boolean(activePost.audioUrl);
                    if (audEl) audEl.muted = nextMuted;
                  }}
                  title={muted ? tr('Washa Sauti', 'Unmute') : tr('Zima Sauti', 'Mute')}
                  aria-label={muted ? tr('Washa Sauti', 'Unmute') : tr('Zima Sauti', 'Mute')}
                  className="flex h-8 w-8 items-center justify-center drop-shadow transition-transform active:scale-90"
                >
                  {muted ? (
                    <VolumeX className="h-5 w-5 text-rose-400" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-white/90 hover:text-white" aria-hidden="true" />
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => openSettingsModal(activePost?.id || null)}
              title={tr('Mipangilio Yote ya Video', 'All Video Settings')}
              aria-label={tr('Mipangilio Yote ya Video', 'All Video Settings')}
              className="flex h-8 w-8 items-center justify-center text-white/90 drop-shadow transition-transform hover:text-white active:scale-90"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
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
                resetStudioUploadState();
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
          onScroll={handleFeedScroll}
          className={`h-full w-full snap-y snap-mandatory ${
            commentsVideoId ? 'overflow-hidden' : 'overflow-y-scroll'
          } scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          {visibleVideos.map((video, idx) => {
            const isActive = idx === activeIndex;
            const isPhotoMode = (video.mediaType === 'photo' || !video.videoUrl) && (video.photoUrls?.length || 0) > 0;
            const isSilentPhoto = isPhotoMode && !video.audioUrl;
            const photoList = video.photoUrls || [];
            const activePhotoIdx = Math.min(
              photoSlideByVideoId[video.id] || 0,
              Math.max(0, photoList.length - 1)
            );
            const rawInactivePosterSrc = isPhotoMode
              ? photoList[0] || video.thumbnailUrl || ''
              : video.thumbnailUrl || '';
            const inactivePosterSrc = rawInactivePosterSrc
              ? optimizeCloudinaryPhotoUrl(rawInactivePosterSrc, { dataSaver: dataSaverMode })
              : '';
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
                ref={getSlideRefCallback(video.id)}
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

                {/* Authentic Mobile Portrait Container (edge-to-edge on Phone, 9:16 mobile frame on PC) */}
                <div
                  className={
                    isMobilePortraitFrame
                      ? 'relative h-full w-full overflow-hidden bg-black md:my-2 md:h-[calc(100%-1rem)] md:w-auto md:aspect-[9/16] md:max-w-[440px] md:rounded-3xl md:ring-1 md:ring-white/15 md:shadow-[0_20px_60px_rgba(0,0,0,0.9)]'
                      : 'relative h-full w-full overflow-hidden bg-black'
                  }
                >
                {/* Full-Screen Media Stage: Long-press opens Quick Options Sheet; active slide streams only */}
                <div
                  onClick={(e) => handleStagePointerClick(video, e)}
                  onPointerDown={(e) => handleStagePointerDown(video, e)}
                  onPointerMove={handleStagePointerMove}
                  onPointerUp={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearLongPressTimer();
                    setLongPressSheetVideo(video);
                  }}
                  onTouchStart={handleStageTouchStart}
                  onTouchEnd={(e) => handleStageTouchEnd(video, e)}
                  className="relative h-full w-full cursor-pointer touch-pan-y"
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
                      {!isPhotoMode && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="flex h-13 w-13 items-center justify-center rounded-full bg-black/45 text-white/90">
                            <Play className="ml-0.5 h-6 w-6 fill-white/90" aria-hidden="true" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isPhotoMode ? (
                    <>
                      {/* Crisp Photo on Pure Black Stage (eco-optimized when Data Saver is ON) */}
                      <img
                        src={optimizeCloudinaryPhotoUrl(photoList[activePhotoIdx], {
                          dataSaver: dataSaverMode,
                        })}
                        alt={video.caption || video.authorName}
                        className={`relative z-[1] h-full w-full transition-opacity duration-300 ${
                          fitMode === 'cover' ? 'object-cover' : 'object-contain'
                        }`}
                      />

                      {/* Background Attached Music Audio Track (Active Slide Only) */}
                      {video.audioUrl && (
                        <audio
                          key={`audio-${video.id}`}
                          ref={getAudioRefCallback(video.id)}
                          src={video.audioUrl}
                          autoPlay={!pausedByTap && !uploadOpen}
                          loop
                          muted={muted}
                          preload={dataSaverMode ? 'metadata' : 'auto'}
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
                      {(() => {
                        const forceH264 = Boolean(hevcForceH264Ids[video.id]);
                        const useOptimizedStream =
                          forceH264 ||
                          ((dataSaverMode || needsBrowserVideoTranscode(video.videoUrl)) &&
                            !transcodeToggledVideoIds[video.id]);
                        const fallbackStreamUrl = needsBrowserVideoTranscode(video.videoUrl)
                          ? optimizeCloudinaryVideoPlaybackUrl(video.videoUrl, {
                              dataSaver: false,
                              forceH264: true,
                            })
                          : video.videoUrl;
                        const playableVideoUrl = useOptimizedStream
                          ? optimizeCloudinaryVideoPlaybackUrl(video.videoUrl, {
                              dataSaver: dataSaverMode,
                              forceH264,
                            })
                          : fallbackStreamUrl;
                        return (
                          <video
                            key={`${video.id}-${forceH264 ? 'h264' : useOptimizedStream ? (dataSaverMode ? 'eco' : 'opt') : 'raw'}`}
                            ref={getVideoRefCallback(video.id)}
                            src={playableVideoUrl}
                            poster={video.thumbnailUrl || undefined}
                            autoPlay={!pausedByTap && !uploadOpen && !settingsOpen}
                            playsInline
                            loop={false}
                            preload="auto"
                            muted={muted || needsSoundTapPrompt || Boolean(video.audioUrl)}
                            onLoadStart={() => {
                              if (isActive && !pausedByTapRef.current) {
                                setBufferingVideoId(video.id);
                              }
                            }}
                            onLoadedMetadata={(e) => {
                              const el = e.currentTarget;
                              if (el.duration > 0 && el.videoWidth === 0 && el.videoHeight === 0 && !hevcForceH264Ids[video.id]) {
                                setHevcForceH264Ids((prev) => ({ ...prev, [video.id]: true }));
                                return;
                              }
                              setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                            }}
                            onLoadedData={(e) => {
                              setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                              if (isActive && e.currentTarget.paused && !pausedByTapRef.current && !uploadOpen && !settingsOpen) {
                                void tryPlayMediaElement(e.currentTarget, video.id);
                              }
                            }}
                            onCanPlay={(e) => {
                              setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                              if (isActive && e.currentTarget.paused && !pausedByTapRef.current && !uploadOpen && !settingsOpen) {
                                void tryPlayMediaElement(e.currentTarget, video.id);
                              }
                            }}
                            onCanPlayThrough={() => {
                              setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                            }}
                            onWaiting={() => {
                              if (isActive && !pausedByTapRef.current) setBufferingVideoId(video.id);
                            }}
                            onPlaying={() => {
                              setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                              setStalledPlayPromptId((curr) => (curr === video.id ? null : curr));
                              setEndedOutroVideoId((curr) => (curr === video.id ? null : curr));
                            }}
                            onError={() => {
                              if (!transcodeToggledVideoIds[video.id] && fallbackStreamUrl !== playableVideoUrl) {
                                setTranscodeToggledVideoIds((prev) => ({
                                  ...prev,
                                  [video.id]: true,
                                }));
                              } else if (!hevcForceH264Ids[video.id]) {
                                setHevcForceH264Ids((prev) => ({ ...prev, [video.id]: true }));
                              } else {
                                setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                                setStalledPlayPromptId(video.id);
                              }
                            }}
                            onEnded={() => {
                              if (outroTimerRef.current) {
                                window.clearTimeout(outroTimerRef.current);
                              }
                              setEndedOutroVideoId(video.id);
                              outroTimerRef.current = window.setTimeout(() => {
                                outroTimerRef.current = null;
                                setEndedOutroVideoId((curr) => (curr === video.id ? null : curr));
                                if (autoScrollNext && visibleVideos.length > 1) {
                                  const nextIdx =
                                    activeIndexRef.current + 1 < visibleVideos.length
                                      ? activeIndexRef.current + 1
                                      : 0;
                                  scrollToIndex(nextIdx);
                                } else {
                                  const el = videoRefs.current[video.id];
                                  if (el) {
                                    el.currentTime = 0;
                                    void el.play().catch(() => {});
                                  }
                                }
                              }, 2000);
                            }}
                            onTimeUpdate={(e) => {
                              const el = e.currentTarget;
                              if ((!el.paused && el.readyState >= 2) || el.currentTime > 0.05) {
                                setBufferingVideoId((curr) => (curr === video.id ? null : curr));
                              }
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
                        );
                      })()}
                      {video.audioUrl && (
                        <audio
                          key={`audio-${video.id}`}
                          ref={getAudioRefCallback(video.id)}
                          src={video.audioUrl}
                          autoPlay={!pausedByTap && !uploadOpen && !settingsOpen}
                          loop
                          muted={muted}
                          preload={dataSaverMode ? 'metadata' : 'auto'}
                        />
                      )}
                    </>
                  )}

                  {/* End-of-Video Official Malosha Forums Outro Label */}
                  {isActive && !isPhotoMode && endedOutroVideoId === video.id && (
                    <div className="absolute inset-0 z-25 flex flex-col items-center justify-center bg-gradient-to-b from-[#07182B]/90 via-[#0D2643]/92 to-[#061322]/95 px-6 text-center backdrop-blur-md">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/75 bg-[#0A1E33] shadow-[0_0_32px_rgba(251,191,36,0.3)] ring-2 ring-amber-400/60">
                        <div className="flex flex-col items-center">
                          <span className="flex h-6 w-8 items-center justify-center rounded-md bg-amber-400 text-[#0E2640]">
                            <MessageCircle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                          </span>
                          <span className="mt-1 text-[9px] font-black tracking-wide text-white leading-none">
                            MALOSHA
                          </span>
                          <span className="text-[7px] font-bold tracking-wider text-amber-300 leading-none">
                            FORUMS
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 font-display text-lg font-extrabold tracking-tight text-white drop-shadow">
                        @malosha forums
                      </p>
                      <div className="mt-2 flex h-1 w-28 overflow-hidden rounded-full">
                        <span className="flex-1 bg-[#1EB53A]" />
                        <span className="w-2 bg-[#FCD116]" />
                        <span className="w-4 bg-[#0F172A]" />
                        <span className="w-2 bg-[#FCD116]" />
                        <span className="flex-1 bg-[#00A3DD]" />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-sky-200/90">
                        MALOSHA FORUMS TANZANIA
                      </p>
                      <span className="mt-3 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold text-white/90">
                        {autoScrollNext && visibleVideos.length > 1
                          ? tr('Inafuata video nyingine...', 'Up next...')
                          : tr('Gusa kutazama tena', 'Tap to replay')}
                      </span>
                    </div>
                  )}

                  {/* Minimal Status Badges Only (Photo Count / Private / Speed) */}
                  {!clearScreenMode &&
                    ((isPhotoMode && photoList.length > 1) ||
                      video.isArchived ||
                      (playbackSpeed !== 1 && !isPhotoMode)) && (
                      <div className="pointer-events-none absolute top-16 left-3 z-10 flex items-center gap-2 sm:left-4">
                        {isPhotoMode && photoList.length > 1 && (
                          <span className="rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                            {activePhotoIdx + 1} / {photoList.length}
                          </span>
                        )}

                        {video.isArchived && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-950/85 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                            {tr('Binafsi', 'Private')}
                          </span>
                        )}

                        {playbackSpeed !== 1 && !isPhotoMode && (
                          <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                            {playbackSpeed}x
                          </span>
                        )}
                      </div>
                    )}

                  {/* Buffering Spinner While Stream Starts */}
                  {isActive && !isPhotoMode && bufferingVideoId === video.id && !pausedByTap && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white/85 drop-shadow" aria-hidden="true" />
                    </div>
                  )}

                  {/* Center Play Button Overlay When Paused or Tap Needed (Videos or Audio-Photos Only) */}
                  {isActive &&
                    !isSilentPhoto &&
                    endedOutroVideoId !== video.id &&
                    ((!isPhotoMode && (pausedByTap || stalledPlayPromptId === video.id)) ||
                      (isPhotoMode && Boolean(video.audioUrl) && pausedByTap)) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNeedsSoundTapPrompt(false);
                        if (pausedByTapRef.current) {
                          handleTogglePlayPause(video);
                        } else {
                          const vidEl = videoRefs.current[video.id];
                          const audEl = audioRefs.current[video.id];
                          setStalledPlayPromptId(null);
                          if (vidEl) {
                            if (vidEl.error || vidEl.networkState === 3) {
                              vidEl.load();
                            }
                            vidEl.muted = muted || Boolean(video.audioUrl);
                            void vidEl.play().catch(() => {});
                          }
                          if (audEl) {
                            audEl.muted = muted;
                            void audEl.play().catch(() => {});
                          }
                        }
                      }}
                      aria-label={tr('Cheza video', 'Play video')}
                      className="absolute inset-0 z-15 flex items-center justify-center focus:outline-none"
                    >
                      <Play className="ml-1 h-14 w-14 fill-white/80 text-white/80 drop-shadow-[0_4px_16px_rgba(0,0,0,0.75)] transition-transform active:scale-95" aria-hidden="true" />
                    </button>
                  )}

                  {/* Quick One-Tap Sound Unlock Banner When Browser Autoplay Policy Blocked Initial Sound */}
                  {isActive &&
                    !isSilentPhoto &&
                    needsSoundTapPrompt &&
                    !muted &&
                    !pausedByTap &&
                    endedOutroVideoId !== video.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNeedsSoundTapPrompt(false);
                          const vidEl = videoRefs.current[video.id];
                          const audEl = audioRefs.current[video.id];
                          if (vidEl) {
                            vidEl.muted = Boolean(video.audioUrl);
                            if (vidEl.paused) void vidEl.play().catch(() => {});
                          }
                          if (audEl) {
                            audEl.muted = false;
                            if (audEl.paused) void audEl.play().catch(() => {});
                          }
                        }}
                        className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-black/75 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        <span>{tr('Gusa popote kuwasha sauti', 'Tap anywhere for sound')}</span>
                      </button>
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

                  {/* Live Captions & Translation Overlay */}
                  {isActive && captionsOverlayEnabled && !clearScreenMode && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-20 bottom-28 left-3.5 z-25 max-w-md rounded-xl bg-black/75 px-3 py-2 text-xs text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md sm:right-24 sm:left-5"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide text-sky-300 uppercase">
                          <Languages className="h-3 w-3" aria-hidden="true" />
                          {captionLang === 'sw' ? tr('Maelezo (SW)', 'Captions (SW)') : 'Captions (EN)'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setCaptionLang((l) => (l === 'sw' ? 'en' : 'sw'))}
                            className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-white/25"
                          >
                            {captionLang === 'sw' ? 'EN' : 'SW'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCaptionsOverlayEnabled(false)}
                            aria-label={tr('Funga', 'Close')}
                            className="rounded p-0.5 text-white/70 hover:text-white"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <p className="leading-snug font-medium text-white/95">
                        {video.caption
                          ? captionLang === 'en'
                            ? `${video.caption} — Shared by ${video.authorName} on Malosha Forums.`
                            : video.caption
                          : captionLang === 'en'
                            ? `Now playing ${video.soundName || 'original audio'} by ${video.authorName}.`
                            : `Inacheza: ${video.soundName || 'Sauti halisi'} ya ${video.authorName}.`}
                      </p>
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

                {/* Clean Right Vertical Action Rail */}
                {!clearScreenMode && (
                  <div className="absolute right-2.5 bottom-6 z-20 flex flex-col items-center gap-3.5 sm:right-4 sm:bottom-8">
                    {/* Creator Avatar + Overlapping Red '+' Follow Badge */}
                    <div className="relative mb-1.5">
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
                          className={`absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full shadow-md transition-transform hover:scale-110 ${
                            isFollowing ? 'bg-emerald-500 text-white' : 'bg-[#FE2C55] text-white'
                          }`}
                        >
                          {isFollowing ? (
                            <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3 w-3 stroke-[3]" aria-hidden="true" />
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
                      <Heart
                        className={`h-8 w-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform group-active:scale-125 ${
                          !likesAllowed
                            ? 'text-white/40'
                            : isLiked
                              ? 'fill-[#FE2C55] text-[#FE2C55]'
                              : 'fill-white text-white'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] tabular-nums">
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
                      <span className="relative flex items-center justify-center transition-transform group-active:scale-110">
                        <MessageCircle
                          className={`h-8 w-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] ${
                            commentsAllowed ? 'fill-white text-white' : 'text-white/50'
                          }`}
                          aria-hidden="true"
                        />
                        {!commentsAllowed && (
                          <Lock
                            className="absolute -right-1 -bottom-0.5 h-3 w-3 text-rose-400"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] tabular-nums">
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
                      <Bookmark
                        className={`h-7.5 w-7.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform group-active:scale-110 ${
                          isBookmarked
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-white text-white'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
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
                      {downloadingId === video.id ? (
                        <Loader2 className="h-7 w-7 animate-spin text-amber-400 drop-shadow" aria-hidden="true" />
                      ) : !downloadAllowed ? (
                        <Lock className="h-7 w-7 text-white/55 drop-shadow" aria-hidden="true" />
                      ) : (
                        <Download
                          className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform group-active:scale-110"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
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
                      <Share2
                        className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform group-active:scale-110"
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] tabular-nums">
                        {video.sharesCount > 0
                          ? formatCompactCount(video.sharesCount)
                          : tr('Shiriki', 'Share')}
                      </span>
                    </button>

                    {/* More / Settings Sheet */}
                    <button
                      type="button"
                      onClick={() => openSettingsModal(video.id)}
                      className="group flex min-w-[44px] flex-col items-center focus:outline-none"
                      aria-label={tr('Mipangilio ya Chapisho', 'Post Settings')}
                    >
                      <MoreHorizontal
                        className="h-6 w-6 text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform group-active:scale-110"
                        aria-hidden="true"
                      />
                    </button>

                    {/* Rotating Vinyl Disc (Only shown for Video or Photo+Music posts) */}
                    {!isSilentPhoto && (
                      <button
                        type="button"
                        onClick={() => setSoundDrawerVideo(video)}
                        title={tr('Tumia Sauti / Muziki Huu', 'Use This Sound')}
                        aria-label={tr('Tumia Sauti / Muziki Huu', 'Use This Sound')}
                        className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border-[5px] border-neutral-800 bg-neutral-950 p-0.5 shadow-lg ring-1 ring-white/25 transition-transform hover:scale-110 ${
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
                    )}
                  </div>
                )}

                {/* Clean Bottom-Left Creator Info, Caption, Inline Tags & Sound */}
                {!clearScreenMode && (
                  <div className="pointer-events-none absolute right-20 bottom-5 left-3.5 z-20 max-w-xl space-y-1.5 sm:right-24 sm:bottom-6 sm:left-5">
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
                        className="text-sm font-extrabold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] hover:underline sm:text-[15px]"
                      >
                        {video.authorName}
                      </button>
                      <AuthorVerificationBadge uid={video.authorId} size="sm" />
                      {video.autoReplyEnabled && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 drop-shadow">
                          <Bot className="h-3 w-3" aria-hidden="true" />
                          <span>Auto-reply</span>
                        </span>
                      )}
                      {video.createdAt && (
                        <span className="text-[11px] font-medium text-white/70 drop-shadow">
                          · {formatTime(video.createdAt)}
                        </span>
                      )}
                    </div>

                    {video.caption && (
                      <div className="pointer-events-auto text-xs leading-snug text-white/95 drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)] sm:text-[13px]">
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
                            className="mt-0.5 text-[11px] font-bold text-white/80 hover:underline"
                          >
                            {captionExpanded ? tr('Funga', 'Less') : tr('zaidi', 'more')}
                          </button>
                        )}
                      </div>
                    )}

                    {video.tags.length > 0 && (
                      <div className="pointer-events-auto flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-bold text-white/90 drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]">
                        {video.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
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
                            className={`h-1.5 rounded-full transition-all ${
                              pIdx === activePhotoIdx
                                ? 'w-4 bg-white'
                                : 'w-1.5 bg-white/45 hover:bg-white/75'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {(!isSilentPhoto || Boolean(video.soundName)) && (
                      <button
                        type="button"
                        onClick={() => setSoundDrawerVideo(video)}
                        className="pointer-events-auto flex max-w-full items-center gap-1.5 pt-0.5 text-xs font-semibold text-white/90 drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)] hover:text-white"
                      >
                        <Music2 className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden="true" />
                        <span className="truncate">
                          {video.soundName || `Sauti Halisi - ${video.authorName}`}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {/* Sleek Bottom Progress Scrubber + Compact Pause/Play */}
                {isActive && !isPhotoMode && !clearScreenMode && (
                  <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-2 pb-1 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePlayPause(video);
                      }}
                      title={pausedByTap ? tr('Cheza', 'Play') : tr('Simamisha', 'Pause')}
                      aria-label={pausedByTap ? tr('Cheza video', 'Play video') : tr('Simamisha video', 'Pause video')}
                      className="flex h-6 w-6 shrink-0 items-center justify-center text-white/90 drop-shadow transition-transform hover:text-white active:scale-90"
                    >
                      {pausedByTap ? (
                        <Play className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
                      ) : (
                        <Pause className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
                      )}
                    </button>
                    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-100"
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
                      <span className="pr-1 text-[9.5px] font-semibold text-white/80 tabular-nums drop-shadow">
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

      {/* Slide-Up Comments Drawer (Threaded + Creator Auto-Reply + Lock Support) */}
      {commentsVideoId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] overscroll-contain md:items-center"
          onClick={() => setCommentsVideoId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[76dvh] max-h-[76dvh] w-full flex-col overflow-hidden overscroll-contain rounded-t-3xl bg-white text-slate-900 shadow-2xl md:h-[600px] md:max-h-[600px] md:max-w-md md:rounded-2xl"
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

            <div
              ref={commentsScrollRef}
              className="min-h-0 flex-1 space-y-3.5 touch-pan-y overflow-y-auto overscroll-contain px-4 py-3 [overflow-anchor:auto]"
            >
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

      {/* Sound / Music Drawer ("Use This Sound") */}
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

      {/* Complete Video & Creator Settings Sheet (Always Accessible) */}
      {(settingsOpen || Boolean(activeSettingsVideo)) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center"
          onClick={closeSettingsModal}
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
                    {tr('Mipangilio Yote ya Video (Malosha)', 'All Video & Creator Settings')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeSettingsModal}
                  aria-label={tr('Funga', 'Close')}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* Quick Post Action Grid (when viewing a post) */}
              {activeSettingsVideo && (
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleShareVideo(activeSettingsVideo);
                      closeSettingsModal();
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
                      closeSettingsModal();
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
                      closeSettingsModal();
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
                      closeSettingsModal();
                    }}
                    className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-100 p-2 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
                  >
                    <EyeOff className="h-5 w-5 text-slate-700" aria-hidden="true" />
                    <span>{tr('Skrini Safi', 'Clear UI')}</span>
                  </button>
                </div>
              )}

              {/* Viewer Playback Settings */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-extrabold tracking-wide text-slate-600 uppercase">
                  {tr('Mipangilio ya Kutazama', 'Playback & Display Settings')}
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
                        ? tr('Jaza skrini nzima (Full)', 'Fill full screen (Cover)')
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
                      {tr('Washa Sauti ya Video (Audio)', 'Video Sound On')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {muted
                        ? tr('Sauti imezimwa (Muted)', 'Audio is muted')
                        : tr('Sauti inacheza', 'Audio is playing')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!muted}
                    onChange={(e) => setMuted(!e.target.checked)}
                    className="h-5 w-5 accent-[#FE2C55]"
                  />
                </label>

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
                        ? tr('Fremu ya Simu 9:16 (Portrait)', 'Malosha 9:16 Mobile Portrait Frame')
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

                {/* Interactive Data Saver Switch */}
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                  <div className="pr-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                      <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      <span>{tr('Okoa Bando (Data Saver)', 'Data Saver (Low MB)')}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-800">
                      {dataSaverMode
                        ? tr(
                            'Imewashwa: Video & picha zinatumia MB chache sana.',
                            'ON: Compresses stream & photos to use minimal data.'
                          )
                        : tr(
                            'Imezimwa: Unatazama ubora halisi (HD).',
                            'OFF: Streams full HD quality.'
                          )}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dataSaverMode}
                    onClick={() => handleToggleDataSaver()}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      dataSaverMode ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        dataSaverMode ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </label>
              </div>

              {/* Author / Admin Creator Controls OR Global Creator Upload Defaults */}
              {activeSettingsVideo &&
              Boolean(user && (isAdmin || user.uid === activeSettingsVideo.authorId)) ? (
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

                  {activeSettingsVideo.audioUrl && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/75 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900">
                          {editRemoveAudio
                            ? tr('Muziki wa ziada utaondolewa ukihifadhi', 'Attached music will be removed on save')
                            : tr('Chapisho hili lina muziki ulioambatanishwa', 'This post has attached music')}
                        </p>
                        <p className="truncate text-[11px] text-slate-600">
                          {activeSettingsVideo.soundName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditRemoveAudio((r) => !r)}
                        className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-bold ${
                          editRemoveAudio
                            ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {editRemoveAudio
                            ? tr('Rejesha', 'Undo')
                            : tr('Ondoa Muziki', 'Remove Music')}
                        </span>
                      </button>
                    </div>
                  )}

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
              ) : (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold tracking-wide text-slate-700 uppercase">
                      {tr('Chaguo-Msingi za Kupakia (Creator Defaults)', 'Default Post Settings')}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          window.localStorage.setItem(
                            CREATOR_VIDEO_DEFAULTS_KEY,
                            JSON.stringify(studioSettings)
                          );
                        } catch {
                          // Ignore quota
                        }
                        onToast(tr('Mipangilio ya chaguo-msingi imehifadhiwa!', 'Creator defaults saved!'));
                      }}
                      className="rounded-lg bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1D4E89]"
                    >
                      {tr('Hifadhi', 'Save')}
                    </button>
                  </div>

                  <div className="space-y-2 divide-y divide-slate-200/70 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <label className="flex cursor-pointer items-center justify-between pt-0.5">
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
                    <label className="flex cursor-pointer items-center justify-between pt-2">
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
                    <label className="flex cursor-pointer items-center justify-between pt-2">
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
                    <label className="flex cursor-pointer items-center justify-between pt-2">
                      <span className="text-xs font-bold text-slate-800">
                        {tr('Washa Auto-Reply Kiotomatiki', 'Enable Auto-Reply')}
                      </span>
                      <input
                        type="checkbox"
                        checked={studioSettings.autoReplyEnabled}
                        onChange={(e) =>
                          setStudioSettings((s) => ({ ...s, autoReplyEnabled: e.target.checked }))
                        }
                        className="h-5 w-5 accent-emerald-600"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Malosha Studio Upload Modal (Video OR Photo Carousel + Music + Settings) */}
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
                    {tr('Video, Picha + Muziki · Malosha Forums Studio', 'Video or Photo + Music · Malosha Studio')}
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
                  <span>{tr('Picha / + Muziki', 'Photos / + Music')}</span>
                </button>
              </div>

              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm,.m4v,.3gp,.mkv"
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
                        {tr('MP4, MOV, 3GP, au WEBM (Upeo MB 95)', 'MP4, MOV, 3GP, or WEBM (Max 95MB)')}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="relative overflow-hidden rounded-xl bg-black">
                    {!videoPreviewError ? (
                      <video
                        key={videoPreviewUrl}
                        src={videoPreviewUrl}
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        onLoadedMetadata={(e) => {
                          const dur = Math.round(e.currentTarget.duration || 0);
                          if (dur > 0) setDetectedDuration(dur);
                        }}
                        onError={() => setVideoPreviewError(true)}
                        className="max-h-64 w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center text-white">
                        <VideoIcon className="h-9 w-9 text-[#22D3EE]" aria-hidden="true" />
                        <p className="text-xs font-bold">{selectedVideoFile?.name}</p>
                        <p className="max-w-xs text-[11px] leading-relaxed text-slate-300">
                          {tr(
                            'Video imechaguliwa! Itabadilishwa kiotomatiki kuwa MP4 (H.264) na kucheza kikamilifu mara tu ukishachapisha.',
                            'Video selected! It will automatically transcode to universal H.264 MP4 and play smoothly once published.'
                          )}
                        </p>
                      </div>
                    )}
                    {selectedVideoFile && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-300">
                        <span className="font-semibold text-white">
                          {(selectedVideoFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        <span className="text-emerald-300">
                          {tr(
                            'Itabanwa kiotomatiki kuokoa MB bila kupoteza ubora',
                            'Auto-optimized to save MBs without losing quality'
                          )}
                        </span>
                      </div>
                    )}
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

              {/* Attach Music / Audio Section (Scoped Strictly to This Post Only) */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Music2 className="h-4 w-4 shrink-0 text-[#FE2C55]" aria-hidden="true" />
                      <span className="text-xs font-extrabold text-slate-900">
                        {tr('Muziki / Sauti ya Chapisho Hili (Si lazima)', 'Post Music / Sound (Optional)')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-slate-500">
                      {tr(
                        'Muziki utakaouchagua hapa utatumika kwenye chapisho hili pekee.',
                        'Music attached here plays only on this post.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => audioFileInputRef.current?.click()}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 text-[11px] font-bold text-white hover:bg-[#1D4E89] disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {audioPreviewUrl
                        ? tr('Badilisha Muziki', 'Change Audio')
                        : tr('Pakia MP3/Sauti', 'Upload Audio')}
                    </span>
                  </button>
                </div>

                {audioPreviewUrl ? (
                  <div className="space-y-2 rounded-xl bg-white p-2.5 ring-1 ring-emerald-200">
                    <div className="flex items-center justify-between gap-2">
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
                        <p className="text-[10.5px] font-semibold text-emerald-700">
                          {tr('Imeambatanishwa kwa chapisho hili pekee', 'Attached to this post only')}
                        </p>
                      </div>
                      {!uploading && (
                        <button
                          type="button"
                          onClick={handleClearSelectedAudio}
                          aria-label={tr('Ondoa muziki', 'Remove music')}
                          className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-red-50 px-2.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Ondoa Muziki', 'Remove')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                      <span>
                        {uploadMediaType === 'video'
                          ? tr('Hakuna muziki wa ziada — video itacheza na sauti yake halisi.', 'No extra music — video keeps its original audio.')
                          : tr('Hakuna muziki ulioambatanishwa (picha pekee).', 'No music attached (silent photos).')}
                      </span>
                      {soundInput.trim() && !uploading && (
                        <button
                          type="button"
                          onClick={handleClearSelectedAudio}
                          className="ml-2 shrink-0 font-bold text-red-600 hover:underline"
                        >
                          {tr('Futa Jina', 'Clear')}
                        </button>
                      )}
                    </div>

                    {reusableCommunityTracks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-slate-500">
                          {tr(
                            'Au chagua wimbo hapa chini ukiutaka (si lazima):',
                            'Or tap a sound below if you want to reuse it (optional):'
                          )}
                        </p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {reusableCommunityTracks.map((track) => (
                            <button
                              key={track.audioUrl}
                              type="button"
                              onClick={() => handleSelectReusableTrack(track)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-[#FE2C55] hover:text-[#FE2C55]"
                            >
                              <Disc3 className="h-3.5 w-3.5 text-[#FE2C55]" aria-hidden="true" />
                              <span className="max-w-[140px] truncate">{track.soundName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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

              {/* Collapsible Malosha Forums Post Settings (Auto-Reply, Comments, Likes, Download) */}
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
                        'Mipangilio ya Chapisho (Auto-Reply, Maoni, Pakua)',
                        'Post Settings (Auto-Reply, Comments, Download)'
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
      {/* Long-Press 3-Card Quick Options Sheet */}
      {longPressSheetVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[1px] md:items-center"
          onClick={() => setLongPressSheetVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[26px] bg-[#F2F3F5] px-3.5 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-slate-900 shadow-2xl md:max-w-md md:rounded-[26px] md:pb-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />

            <div className="space-y-2.5">
              {/* Group 1: Not interested & Report */}
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-xs">
                <button
                  type="button"
                  onClick={() => handleMarkNotInterested(longPressSheetVideo)}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <HeartCrack className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Sipendezwi nayo (Not interested)', 'Not interested')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = longPressSheetVideo;
                    setLongPressSheetVideo(null);
                    setReportRuleNumber(0);
                    setReportReasonText('');
                    setReportSheetVideo(target);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <Flag className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Ripoti (Report)', 'Report')}</span>
                </button>
              </div>

              {/* Group 2: Speed, Clear display, Auto scroll, Data Saver, Captions, PiP, Background audio */}
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-xs">
                {/* Speed Segmented Pills */}
                <div className="flex min-h-[50px] items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-3.5 text-[14px] font-semibold text-slate-900">
                    <Gauge className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                    <span>{tr('Kasi (Speed)', 'Speed')}</span>
                  </div>
                  <div className="flex items-center rounded-xl bg-[#F2F3F5] p-0.5">
                    {([0.5, 1, 1.5, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          playbackSpeed === spd
                            ? 'bg-white text-slate-950 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {spd.toFixed(1)}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear display */}
                <button
                  type="button"
                  onClick={() => {
                    setClearScreenMode((v) => !v);
                    setLongPressSheetVideo(null);
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3.5">
                    <Maximize className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                    <span>{tr('Skrini safi (Clear display)', 'Clear display')}</span>
                  </span>
                  {clearScreenMode && (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      ON
                    </span>
                  )}
                </button>

                {/* Auto scroll Toggle */}
                <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex items-center gap-3.5 text-[14px] font-semibold text-slate-900">
                    <ArrowUpCircle className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                    <span>{tr('Sogeza kiotomatiki (Auto scroll)', 'Auto scroll')}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoScrollNext}
                    onClick={handleToggleAutoNext}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      autoScrollNext ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        autoScrollNext ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Data Saver Toggle (Okoa MB) */}
                <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-3.5">
                    <Wifi className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <div>
                      <p className="text-[14px] font-semibold text-slate-900">
                        {tr('Data Saver (Okoa MB)', 'Data Saver')}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {tr('Tumia MB chache ukitazama', 'Use fewer MBs while watching')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dataSaverMode}
                    onClick={() => handleToggleDataSaver()}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      dataSaverMode ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        dataSaverMode ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Captions and translation */}
                <button
                  type="button"
                  onClick={() => {
                    setCaptionsOverlayEnabled((v) => !v);
                    setLongPressSheetVideo(null);
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3.5">
                    <Languages className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                    <span>{tr('Maelezo & Tafsiri (Captions)', 'Captions and translation')}</span>
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      captionsOverlayEnabled
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {captionsOverlayEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Picture-in-Picture */}
                <button
                  type="button"
                  onClick={() => {
                    const target = longPressSheetVideo;
                    setLongPressSheetVideo(null);
                    void handleTriggerPiP(target);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <PictureInPicture2 className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Picture-in-Picture (Dirisha Dogo)', 'Picture-in-Picture')}</span>
                </button>

                {/* Background audio Toggle */}
                <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex items-center gap-3.5 text-[14px] font-semibold text-slate-900">
                    <Headphones className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                    <span>{tr('Sauti ya nyuma (Background audio)', 'Background audio')}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={backgroundAudioMode}
                    onClick={() => handleToggleBackgroundAudio()}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      backgroundAudioMode ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        backgroundAudioMode ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Group 3: Why this post, Promote, Download */}
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-xs">
                <button
                  type="button"
                  onClick={() => {
                    const target = longPressSheetVideo;
                    setLongPressSheetVideo(null);
                    setWhyPostVideo(target);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <HelpCircle className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Kwa nini chapisho hili? (Why this post)', 'Why this post')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = longPressSheetVideo;
                    setLongPressSheetVideo(null);
                    void handleShareVideo(target);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <Flame className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Tangaza / Shiriki (Promote)', 'Promote')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = longPressSheetVideo;
                    setLongPressSheetVideo(null);
                    void handleDownloadWatermarkedMedia(target);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3.5 px-4 py-3 text-left text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <Download className="h-5 w-5 shrink-0 text-slate-800" aria-hidden="true" />
                  <span>{tr('Pakua na Alama ya Malosha (Download)', 'Download')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Why This Post Info Modal */}
      {whyPostVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => setWhyPostVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {tr('Kwa Nini Unaona Chapisho Hili?', 'Why You See This Post')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWhyPostVideo(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
              <p>
                {tr(
                  `Chapisho hili la ${whyPostVideo.authorName} linaonyeshwa kwenye Malosha Forums kutokana na:`,
                  `This post by ${whyPostVideo.authorName} appears in your Malosha Forums feed because:`
                )}
              </p>
              <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-slate-700">
                <li>
                  •{' '}
                  {followingByAuthor[whyPostVideo.authorId]
                    ? tr('Unamfuatilia mbunifu huyu.', 'You follow this creator.')
                    : tr('Ni miongoni mwa video maarufu au mpya jukwaani.', 'It is active or trending in the community.')}
                </li>
                {whyPostVideo.tags.length > 0 && (
                  <li>
                    • {tr('Mada zinazohusika:', 'Related tags:')}{' '}
                    <span className="font-semibold">{whyPostVideo.tags.map((t) => `#${t}`).join(' ')}</span>
                  </li>
                )}
                <li>
                  • {tr('Unaweza kubonyeza "Sipendezwi nayo" wakati wowote kuboresha orodha yako.', 'Tap "Not interested" anytime to customize your feed.')}
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setWhyPostVideo(null)}
              className="mt-4 min-h-[40px] w-full rounded-xl bg-[#0E2640] text-xs font-bold text-white hover:bg-[#1D4E89]"
            >
              {tr('Sawa, Nimeelewa', 'Got It')}
            </button>
          </div>
        </div>
      )}

      {/* Report Video Modal (Select from 13 Rules + Reason) */}
      {reportSheetVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !submittingReport && setReportSheetVideo(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSubmitVideoReport(e)}
            className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" aria-hidden="true" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {tr('Ripoti Chapisho Hili', 'Report This Post')}
                </h3>
              </div>
              <button
                type="button"
                disabled={submittingReport}
                onClick={() => setReportSheetVideo(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3.5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  {tr('Chagua Sheria Iliyokiukwa (1 – 13)', 'Select Violated Rule (1 – 13)')}
                </label>
                <select
                  value={reportRuleNumber}
                  onChange={(e) => setReportRuleNumber(Number(e.target.value))}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                >
                  <option value={0}>
                    {tr('-- Chagua Kanuni (Hiari) --', '-- Select Rule (Optional) --')}
                  </option>
                  {COMMUNITY_SAFETY_RULES.map((rule) => (
                    <option key={rule.number} value={rule.number}>
                      #{rule.number} · {tr(rule.titleSw, rule.titleEn)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  {tr('Maelezo ya Ziada', 'Additional Details')}
                </label>
                <textarea
                  rows={3}
                  maxLength={350}
                  value={reportReasonText}
                  onChange={(e) => setReportReasonText(e.target.value)}
                  placeholder={tr(
                    'Eleza kwa ufupi tatizo lililopo kwenye video/picha hii...',
                    'Briefly explain why you are reporting this post...'
                  )}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={submittingReport}
                onClick={() => setReportSheetVideo(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submittingReport}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {submittingReport && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{tr('Tuma Ripoti', 'Submit Report')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
