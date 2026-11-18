import { Timestamp } from 'firebase/firestore';

export type PrimaryBoard = 'Kijiweni' | 'Fursa' | 'Makala';

export type TopicCategory =
  | PrimaryBoard
  | 'Habari na Hoja'
  | 'Jukwaa la Siasa'
  | 'Jamii Intelligence'
  | 'Biashara & Uchumi'
  | 'Mahusiano (MMU)'
  | 'Teknolojia & Sayansi'
  | 'Elimu & Ajira'
  | 'Michezo & Burudani'
  | 'Teknolojia'
  | 'Biashara'
  | 'Elimu'
  | 'Jamii'
  | 'Sayansi'
  | 'Michezo';

export interface BoardDefinition {
  id: PrimaryBoard;
  title: string;
  description: string;
}

export const FORUM_BOARDS: BoardDefinition[] = [
  {
    id: 'Kijiweni',
    title: 'Kijiweni',
    description: 'Chapisha mawazo, gumzo huru, penda (like), toa maoni, na ushiriki na marafiki.',
  },
  {
    id: 'Fursa',
    title: 'Fursa',
    description: 'Matangazo ya ajira mbalimbali za vijana, mafunzo kwa vitendo, na ufadhili.',
  },
  {
    id: 'Makala',
    title: 'Makala',
    description: 'Makala za kina na uchambuzi wa habari kwa mtindo wa uandishi wa habari.',
  },
];

export const JOB_TYPES = [
  'Ajira Kamili',
  'Mafunzo (Internship)',
  'Kazi za Muda',
  'Ufadhili & Ruzuku',
] as const;

import techAfricaCover from './assets/images/makala_tech_africa_1794671923666.jpg';
import kilimoKisasaCover from './assets/images/makala_kilimo_kisasa_1794671924292.jpg';
import nishatiJuaCover from './assets/images/makala_nishati_jua_1794671924767.jpg';
import elimuVijanaCover from './assets/images/makala_elimu_vijana_1794671924801.jpg';

export const MAKALA_COVERS = [
  {
    label: 'Teknolojia & Ubunifu',
    path: techAfricaCover,
  },
  {
    label: 'Kilimo cha Kisasa',
    path: kilimoKisasaCover,
  },
  {
    label: 'Nishati Jadidifu',
    path: nishatiJuaCover,
  },
  {
    label: 'Elimu & Vijana',
    path: elimuVijanaCover,
  },
] as const;

const LEGACY_COVER_MAP: Record<string, string> = {
  '/src/assets/images/makala_tech_africa_1794671923666.jpg': techAfricaCover,
  '/src/assets/images/makala_kilimo_kisasa_1794671924292.jpg': kilimoKisasaCover,
  '/src/assets/images/makala_nishati_jua_1794671924767.jpg': nishatiJuaCover,
  '/src/assets/images/makala_elimu_vijana_1794671924801.jpg': elimuVijanaCover,
};

export function resolveMakalaCover(cover?: string): string {
  if (!cover) return '';
  return LEGACY_COVER_MAP[cover] || cover;
}

export const MAKALA_SECTIONS = [
  'Habari',
  'Uchumi',
  'Teknolojia',
  'Jamii',
  'Kilimo',
  'Michezo',
  'Elimu',
  'Afya',
] as const;

export type MakalaSection = (typeof MAKALA_SECTIONS)[number];

const SECTION_SYNONYMS: Record<string, MakalaSection> = {
  habari: 'Habari',
  news: 'Habari',
  siasa: 'Habari',
  taifa: 'Habari',
  ripoti: 'Habari',
  uchambuzi: 'Habari',
  nishati: 'Habari',
  uchumi: 'Uchumi',
  biashara: 'Uchumi',
  fedha: 'Uchumi',
  soko: 'Uchumi',
  economy: 'Uchumi',
  business: 'Uchumi',
  teknolojia: 'Teknolojia',
  technologia: 'Teknolojia',
  tech: 'Teknolojia',
  tehama: 'Teknolojia',
  kidijitali: 'Teknolojia',
  digital: 'Teknolojia',
  jamii: 'Jamii',
  maendeleo: 'Jamii',
  familia: 'Jamii',
  mazingira: 'Jamii',
  vijana: 'Jamii',
  community: 'Jamii',
  kilimo: 'Kilimo',
  ufugaji: 'Kilimo',
  mazao: 'Kilimo',
  shamba: 'Kilimo',
  agriculture: 'Kilimo',
  michezo: 'Michezo',
  soka: 'Michezo',
  mpira: 'Michezo',
  riadha: 'Michezo',
  sports: 'Michezo',
  elimu: 'Elimu',
  shule: 'Elimu',
  chuo: 'Elimu',
  masomo: 'Elimu',
  education: 'Elimu',
  afya: 'Afya',
  tiba: 'Afya',
  hospitali: 'Afya',
  lishe: 'Afya',
  health: 'Afya',
};

export function getMakalaSection(tags: string[], title = ''): MakalaSection {
  const normalizedMap = new Map<string, MakalaSection>(
    MAKALA_SECTIONS.map((sec) => [sec.toLowerCase(), sec])
  );

  // 1. Exact canonical Makala section match in tags
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase();
    const match = normalizedMap.get(clean);
    if (match) return match;
  }

  // 2. Synonym match in tags
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase();
    if (SECTION_SYNONYMS[clean]) {
      return SECTION_SYNONYMS[clean];
    }
  }

  // 3. Keyword hint from article title if tags lacked section metadata
  const lowerTitle = title.toLowerCase();
  if (lowerTitle) {
    for (const [keyword, section] of Object.entries(SECTION_SYNONYMS)) {
      if (keyword.length >= 4 && lowerTitle.includes(keyword)) {
        return section;
      }
    }
  }

  return 'Habari';
}

export function matchesMakalaSection(
  topic: Pick<Topic, 'tags' | 'title' | 'createdAt'>,
  selectedSection: string
): boolean {
  if (selectedSection === 'all') return true;
  if (selectedSection === 'recent') {
    const createdMs = topic.createdAt ? topic.createdAt.toMillis() : Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - createdMs <= sevenDaysMs;
  }
  return getMakalaSection(topic.tags, topic.title).toLowerCase() === selectedSection.toLowerCase();
}

export const TOPIC_CATEGORIES: PrimaryBoard[] = FORUM_BOARDS.map((b) => b.id);

export function normalizeBoardCategory(cat: string): PrimaryBoard {
  if (cat === 'Kijiweni' || cat === 'Fursa' || cat === 'Makala') {
    return cat;
  }

  const fursaSet = new Set(['Biashara & Uchumi', 'Elimu & Ajira', 'Biashara', 'Elimu']);
  if (fursaSet.has(cat)) return 'Fursa';

  const makalaSet = new Set(['Jamii Intelligence', 'Teknolojia & Sayansi', 'Teknolojia', 'Sayansi']);
  if (makalaSet.has(cat)) return 'Makala';

  return 'Kijiweni';
}

export type TopicStatus = 'open' | 'locked' | 'archived';

export type VerificationBadgeType =
  | 'none'
  | 'individual'
  | 'organization'
  | 'government'
  | 'owner'
  | 'journalist'
  | 'educator'
  | 'creator';

export interface VerificationBadgeMeta {
  id: VerificationBadgeType;
  label: string;
  shortLabel: string;
  description: string;
  fillHex: string;
  textClass: string;
  softBgClass: string;
  borderClass: string;
}

export const VERIFICATION_BADGE_META: Record<VerificationBadgeType, VerificationBadgeMeta> = {
  none: {
    id: 'none',
    label: 'Akaunti ya Kawaida',
    shortLabel: 'Hakuna Beji',
    description: 'Mwanachama wa kawaida wa Malosha Forums',
    fillHex: '#94A3B8',
    textClass: 'text-slate-600',
    softBgClass: 'bg-slate-100',
    borderClass: 'border-slate-200',
  },
  individual: {
    id: 'individual',
    label: 'Mtu Binafsi (Bluu)',
    shortLabel: 'Mtu Binafsi',
    description: 'Mwanachama binafsi au mtu mashuhuri aliyethibitishwa',
    fillHex: '#1D9BF0',
    textClass: 'text-[#0284C7]',
    softBgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  organization: {
    id: 'organization',
    label: 'Shirika / Kampuni (Zambarau)',
    shortLabel: 'Shirika',
    description: 'Kampuni, taasisi binafsi, NGO, au chombo cha habari',
    fillHex: '#7C3AED',
    textClass: 'text-[#6D28D9]',
    softBgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
  },
  government: {
    id: 'government',
    label: 'Taasisi ya Serikali (Kijani)',
    shortLabel: 'Serikali',
    description: 'Wizara, halmashauri, wakala, au idara rasmi ya serikali',
    fillHex: '#16A34A',
    textClass: 'text-[#15803D]',
    softBgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  journalist: {
    id: 'journalist',
    label: 'Mwandishi / Mhariri wa Habari (Nyekundu)',
    shortLabel: 'Mwandishi',
    description: 'Mwandishi wa habari, mchambuzi wa vyombo vya habari, au mhariri aliyeidhinishwa',
    fillHex: '#DC2626',
    textClass: 'text-[#B91C1C]',
    softBgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
  educator: {
    id: 'educator',
    label: 'Mwalimu / Mtafiti / Mshauri (Teal)',
    shortLabel: 'Mwalimu',
    description: 'Mtaalamu wa elimu, mtafiti, au mshauri wa taaluma na ajira',
    fillHex: '#0D9488',
    textClass: 'text-[#0F766E]',
    softBgClass: 'bg-teal-50',
    borderClass: 'border-teal-200',
  },
  creator: {
    id: 'creator',
    label: 'Mbunifu / Mchambuzi Bora (Pink)',
    shortLabel: 'Mbunifu',
    description: 'Mbunifu mashuhuri wa maudhui na mchangiaji mkuu wa jamii',
    fillHex: '#DB2777',
    textClass: 'text-[#BE185D]',
    softBgClass: 'bg-pink-50',
    borderClass: 'border-pink-200',
  },
  owner: {
    id: 'owner',
    label: 'Mmiliki wa Jukwaa (Dhahabu)',
    shortLabel: 'Mmiliki',
    description: 'Mwanzilishi na mmiliki rasmi wa jukwaa la Malosha Forums',
    fillHex: '#D97706',
    textClass: 'text-[#B45309]',
    softBgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
  },
};

export const VERIFICATION_BADGE_TIERS: VerificationBadgeType[] = [
  'none',
  'individual',
  'organization',
  'government',
  'journalist',
  'educator',
  'creator',
  'owner',
];

export function normalizeVerificationBadge(val: unknown): VerificationBadgeType {
  if (
    val === 'individual' ||
    val === 'organization' ||
    val === 'government' ||
    val === 'owner' ||
    val === 'journalist' ||
    val === 'educator' ||
    val === 'creator'
  ) {
    return val;
  }
  return 'none';
}

export type AccountStatus = 'active' | 'suspended';

export function normalizeAccountStatus(val: unknown): AccountStatus {
  return val === 'suspended' ? 'suspended' : 'active';
}

export type AuthPromptReason = 'comment' | 'like' | 'post' | 'chat';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  bio: string;
  role: 'member' | 'moderator';
  verificationBadge: VerificationBadgeType;
  accountStatus?: AccountStatus;
  suspendedReason?: string;
  topicsCount: number;
  repliesCount: number;
  followersCount?: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export const MONETIZATION_REQUIREMENTS = {
  minFollowers: 50,
  minPosts: 10,
  minLikes: 100,
  minComments: 20,
} as const;

export interface AuthorMetricsSummary {
  postsCount: number;
  totalLikesReceived: number;
  totalCommentsReceived: number;
  followersCount: number;
  metCriteriaCount: number;
  totalCriteriaCount: number;
  progressPercent: number;
  isEligibleForMonetization: boolean;
}

export function computeAuthorMetrics(
  topics: Pick<Topic, 'authorId' | 'upvotesCount' | 'repliesCount' | 'status'>[],
  authorUid: string,
  followersCount = 0
): AuthorMetricsSummary {
  let postsCount = 0;
  let totalLikesReceived = 0;
  let totalCommentsReceived = 0;

  for (const t of topics) {
    if (t.authorId === authorUid && t.status !== 'archived') {
      postsCount += 1;
      totalLikesReceived += Math.max(0, Number(t.upvotesCount || 0));
      totalCommentsReceived += Math.max(0, Number(t.repliesCount || 0));
    }
  }

  const cleanFollowers = Math.max(0, Number(followersCount || 0));
  const fRatio = Math.min(1, cleanFollowers / MONETIZATION_REQUIREMENTS.minFollowers);
  const pRatio = Math.min(1, postsCount / MONETIZATION_REQUIREMENTS.minPosts);
  const lRatio = Math.min(1, totalLikesReceived / MONETIZATION_REQUIREMENTS.minLikes);
  const cRatio = Math.min(1, totalCommentsReceived / MONETIZATION_REQUIREMENTS.minComments);

  const met = [fRatio >= 1, pRatio >= 1, lRatio >= 1, cRatio >= 1].filter(Boolean).length;
  const progressPercent = Math.round(((fRatio + pRatio + lRatio + cRatio) / 4) * 100);

  return {
    postsCount,
    totalLikesReceived,
    totalCommentsReceived,
    followersCount: cleanFollowers,
    metCriteriaCount: met,
    totalCriteriaCount: 4,
    progressPercent,
    isEligibleForMonetization: met === 4,
  };
}

export interface MemberIdRecord {
  cardNumber: string;
  controlSerial: string;
  uid: string;
  displayName: string;
  photoURL: string;
  role: 'member' | 'moderator';
  verificationBadge: VerificationBadgeType;
  accountStatus: AccountStatus;
  issuedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MemberIdVerificationResult {
  authentic: boolean;
  reason: 'valid' | 'suspended' | 'serial_mismatch' | 'not_found';
  record: MemberIdRecord | null;
  source: 'registry' | 'users_fallback' | 'none';
}

export type PresenceArea = 'kijiweni' | 'video' | 'fursa' | 'makala' | 'mchart' | 'profile' | 'forum';

export interface UserPresence {
  uid: string;
  displayName: string;
  photoURL?: string;
  isOnline: boolean;
  isTypingInMchart: boolean;
  replyingToName: string;
  activeArea: PresenceArea;
  lastSeenAt: Timestamp | null;
  typingUpdatedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export function formatMemberCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (clean.slice(0, 8) || 'MEMBER01').padEnd(8, '0');
  return `MLF-${suffix}`;
}

export function computeMemberControlSerial(uid: string): string {
  const input = `${uid}:MALOSHA-FORUMS-ID-2026`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ c, 0x85ebca6b) + i) >>> 0;
  }
  const combined = ((h1 ^ h2) >>> 0) % 1000000;
  return `00${String(combined).padStart(6, '0')}`;
}

export interface Topic {
  id: string;
  title: string;
  body: string;
  category: TopicCategory;
  tags: string[];
  authorId: string;
  authorName: string;
  authorPhoto: string;
  status: TopicStatus;
  isPinned: boolean;
  repliesCount: number;
  upvotesCount: number;
  acceptedReplyId: string;
  company?: string;
  location?: string;
  jobType?: string;
  deadline?: string;
  applyInfo?: string;
  coverImage?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  lastActivityAt: Timestamp | null;
}

export interface Reply {
  id: string;
  topicId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  body: string;
  parentReplyId: string;
  isAcceptedAnswer: boolean;
  upvotesCount: number;
  isDeleted: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'misinformation'
  | 'unlawful'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Ujumbe wa Taka / Matangazo (Spam)',
  harassment: 'Lugha Chafu au Unyanyasaji',
  misinformation: 'Taarifa za Uongo au Upotoshaji',
  unlawful: 'Maudhui Yasiyo Halali au Hatari',
  other: 'Sababu Nyingine',
};

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'topic' | 'reply';
  targetId: string;
  topicId: string;
  reason: ReportReason;
  details: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: Timestamp | null;
}

export type ChatAttachmentType = 'none' | 'image' | 'document';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  attachmentType: ChatAttachmentType;
  attachmentUrl: string;
  attachmentName: string;
  attachmentSize: number;
  attachmentMime: string;
  replyToId: string;
  replyToSenderName: string;
  replyToPreview: string;
  isDeleted: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type NoteLockTargetMode = 'all' | 'selected';
export type NoteAccessStatus = 'pending' | 'unlocked' | 'locked';

export interface MchartNote {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  subtitle?: string;
  body: string;
  summary: string;
  fileName: string;
  wordCount: number;
  isArchived: boolean;
  isPinned: boolean;
  pdfUrl?: string;
  pdfFileName?: string;
  pdfSize?: number;
  noteType?: 'text' | 'pdf' | 'mixed';
  isLocked?: boolean;
  lockedTargetMode?: NoteLockTargetMode;
  lockPrice?: number;
  lockCurrency?: string;
  paymentInstructions?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MchartNoteContent {
  noteId: string;
  body: string;
  pdfUrl: string;
  pdfFileName: string;
  pdfSize: number;
  updatedAt: Timestamp | null;
}

export interface MchartNoteAccess {
  noteId: string;
  userId: string;
  userName: string;
  status: NoteAccessStatus;
  paymentReference: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type NavTab =
  | 'all'
  | 'kijiweni'
  | 'video'
  | 'fursa'
  | 'makala'
  | 'chat'
  | 'trending'
  | 'safety'
  | 'auth';
export type SortMode = 'newest' | 'votes' | 'oldest';

export type UserNotificationType = 'comment_reply' | 'post_comment';

export interface UserNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorPhoto: string;
  type: UserNotificationType;
  topicId: string;
  topicTitle: string;
  topicCategory: PrimaryBoard;
  replyId: string;
  parentReplyId: string;
  replyPreview: string;
  isRead: boolean;
  createdAt: Timestamp | null;
}

export interface NavUnreadCounts {
  kijiweni: number;
  video?: number;
  fursa: number;
  makala: number;
  chat: number;
}

export interface DirectChatThread {
  chatId: string;
  participantA: string;
  participantB: string;
  participants: [string, string];
  participantAName: string;
  participantAPhoto: string;
  participantBName: string;
  participantBPhoto: string;
  lastMessageText: string;
  lastSenderId: string;
  lastMessageAt: Timestamp | null;
  unreadCountA: number;
  unreadCountB: number;
  lastReadAtA: Timestamp | null;
  lastReadAtB: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface DirectChatMessage {
  id: string;
  chatId: string;
  participants: [string, string];
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  attachmentType: ChatAttachmentType;
  attachmentUrl: string;
  attachmentName: string;
  attachmentSize: number;
  attachmentMime: string;
  replyToId: string;
  replyToSenderName: string;
  replyToPreview: string;
  isDeleted: boolean;
  viewOnce?: boolean;
  viewOnceConsumed?: boolean;
  viewOnceOpenedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type StatusPrivacyMode = 'members' | 'selected';

export interface MchartStatus {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  imageUrl: string;
  caption: string;
  privacy: StatusPrivacyMode;
  allowedViewerIds: string[];
  audienceTokens: string[];
  viewsCount: number;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
}

export interface MchartStatusView {
  statusId: string;
  statusAuthorId: string;
  viewerId: string;
  viewerName: string;
  viewerPhoto: string;
  viewedAt: Timestamp | null;
}

export interface MemberDirectoryCandidate {
  uid: string;
  displayName: string;
  photoURL: string;
  isOnline?: boolean;
}

export interface SharedMediaPayload {
  id: number;
  file: File | null;
  title: string;
  text: string;
}

export type VideoMediaType = 'video' | 'photo';
export type VideoAutoReplyTrigger = 'all' | 'keyword';

export interface VideoPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  mediaType?: VideoMediaType;
  videoUrl: string;
  photoUrls?: string[];
  audioUrl?: string;
  cloudinaryPublicId: string;
  thumbnailUrl: string;
  caption: string;
  soundName: string;
  tags: string[];
  durationSec: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isArchived: boolean;
  allowComments?: boolean;
  allowDownload?: boolean;
  allowLikes?: boolean;
  showLikeCount?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  autoReplyTrigger?: VideoAutoReplyTrigger;
  autoReplyKeyword?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VideoComment {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  body: string;
  parentCommentId?: string;
  replyToAuthorName?: string;
  isAutoReply?: boolean;
  isDeleted: boolean;
  createdAt: Timestamp | null;
}


