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

export type TopicStatus = 'open' | 'locked' | 'archived' | 'private';

export type VerificationBadgeType =
  | 'none'
  | 'individual'
  | 'organization'
  | 'government'
  | 'owner'
  | 'journalist'
  | 'educator'
  | 'creator'
  | 'black'
  | 'white'
  | 'gray'
  | 'gold'
  | 'silver'
  | 'copper';

export interface VerificationBadgeMeta {
  id: VerificationBadgeType;
  label: string;
  shortLabel: string;
  description: string;
  fillHex: string;
  strokeHex?: string;
  checkHex?: string;
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
  black: {
    id: 'black',
    label: 'Daraja la Juu (Black / Nyeusi)',
    shortLabel: 'Black',
    description: 'Beji Nyeusi ya heshima ya kipekee kwa wanachama na viongozi mashuhuri wa jukwaa',
    fillHex: '#111827',
    strokeHex: '#030712',
    checkHex: '#FFFFFF',
    textClass: 'text-slate-900',
    softBgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
  },
  white: {
    id: 'white',
    label: 'Utambulisho Safi (White / Nyeupe)',
    shortLabel: 'White',
    description: 'Beji Nyeupe ya uwazi, uadilifu na uthibitisho kamili wa utambulisho',
    fillHex: '#FFFFFF',
    strokeHex: '#334155',
    checkHex: '#0F172A',
    textClass: 'text-slate-800',
    softBgClass: 'bg-white',
    borderClass: 'border-slate-300',
  },
  gray: {
    id: 'gray',
    label: 'Mtaalamu & Mhakiki (Kijivu / Gray)',
    shortLabel: 'Kijivu',
    description: 'Beji ya Kijivu kwa wakaguzi wa maudhui, wachambuzi wa mifumo na washauri',
    fillHex: '#6B7280',
    strokeHex: '#4B5563',
    checkHex: '#FFFFFF',
    textClass: 'text-gray-700',
    softBgClass: 'bg-gray-100',
    borderClass: 'border-gray-300',
  },
  gold: {
    id: 'gold',
    label: 'Daraja la Dhahabu (Gold)',
    shortLabel: 'Gold',
    description: 'Beji ya Dhahabu kwa wabunifu waliotimiza vigezo vya juu vya ubora na mapato',
    fillHex: '#EAB308',
    strokeHex: '#A16207',
    checkHex: '#FFFFFF',
    textClass: 'text-amber-700',
    softBgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
  },
  silver: {
    id: 'silver',
    label: 'Daraja la Fedha (Silver)',
    shortLabel: 'Silver',
    description: 'Beji ya Fedha kwa wachangiaji wakubwa wenye rekodi thabiti ya mijadala',
    fillHex: '#CBD5E1',
    strokeHex: '#475569',
    checkHex: '#0F172A',
    textClass: 'text-slate-700',
    softBgClass: 'bg-slate-50',
    borderClass: 'border-slate-300',
  },
  copper: {
    id: 'copper',
    label: 'Daraja la Shaba (Copper)',
    shortLabel: 'Copper',
    description: 'Beji ya Shaba kwa wabunifu wanaokua kwa kasi na kuongeza ushiriki wa jamii',
    fillHex: '#B87333',
    strokeHex: '#7C2D12',
    checkHex: '#FFFFFF',
    textClass: 'text-[#9A4E1A]',
    softBgClass: 'bg-orange-50',
    borderClass: 'border-orange-300',
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
  'black',
  'white',
  'gray',
  'gold',
  'silver',
  'copper',
  'owner',
];

export function normalizeVerificationBadge(val: unknown): VerificationBadgeType {
  if (val === 'kijivu') return 'gray';
  if (
    val === 'individual' ||
    val === 'organization' ||
    val === 'government' ||
    val === 'owner' ||
    val === 'journalist' ||
    val === 'educator' ||
    val === 'creator' ||
    val === 'black' ||
    val === 'white' ||
    val === 'gray' ||
    val === 'gold' ||
    val === 'silver' ||
    val === 'copper'
  ) {
    return val;
  }
  return 'none';
}

export type AccountStatus = 'active' | 'suspended';

export function normalizeAccountStatus(val: unknown): AccountStatus {
  return val === 'suspended' ? 'suspended' : 'active';
}

export type AuthPromptReason = 'comment' | 'like' | 'post' | 'chat' | 'vote';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  bio: string;
  profileDetailsPublic?: boolean;
  role: 'member' | 'moderator';
  verificationBadge: VerificationBadgeType;
  accountStatus?: AccountStatus;
  suspendedReason?: string;
  suspendedRuleNumber?: number;
  topicsCount: number;
  repliesCount: number;
  followersCount?: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CommunitySafetyRule {
  number: number;
  titleSw: string;
  titleEn: string;
  summarySw: string;
  summaryEn: string;
}

export const COMMUNITY_SAFETY_RULES: CommunitySafetyRule[] = [
  {
    number: 1,
    titleSw: 'Heshima na Kuzuia Unyanyasaji',
    titleEn: 'Respect & Anti-Harassment',
    summarySw:
      'Ni marufuku kutukana, kudhalilisha, kukashifu, au kumfuatilia mwanachama mwingine kwa lengo la kumuumiza au kumtisha.',
    summaryEn:
      'Insults, humiliation, bullying, stalking, or targeted harassment of any member are strictly prohibited.',
  },
  {
    number: 2,
    titleSw: 'Kuzuia Kauli za Chuki na Ubaguzi',
    titleEn: 'No Hate Speech or Discrimination',
    summarySw:
      'Hairuhusiwi kuchapisha maneno ya chuki, uchochezi, au ubaguzi wa kabila, dini, jinsia, ulemavu, au asili ya mtu.',
    summaryEn:
      'Hate speech or discrimination based on tribe, religion, gender, disability, or origin is not allowed.',
  },
  {
    number: 3,
    titleSw: 'Kuzuia Maudhui ya Ngono na Uchi',
    titleEn: 'No Nudity or Sexual Content',
    summarySw:
      'Video, picha, au maandishi yenye uchi, picha za ngono, au maudhui machafu yamepigwa marufuku kabisa kwenye jukwaa.',
    summaryEn:
      'Nudity, pornography, sexually explicit media, or adult solicitation is strictly forbidden.',
  },
  {
    number: 4,
    titleSw: 'Kuzuia Vurugu, Vitisho na Maudhui ya Kutisha',
    titleEn: 'No Violence, Threats, or Graphic Media',
    summarySw:
      'Usichapishe vitisho vya kuumiza, kuhamasisha vurugu, kujidhuru, au video/picha zenye damu na ukatili wa kutisha.',
    summaryEn:
      'Do not post threats of harm, incitement to violence, self-harm encouragement, or graphic gore.',
  },
  {
    number: 5,
    titleSw: 'Ulinzi na Usalama wa Watoto',
    titleEn: 'Child Safety & Protection',
    summarySw:
      'Maudhui yoyote yanayomdhalilisha, kumnyanyasa, au kumweka mtoto hatarini yatafungiwa mara moja na akaunti kufungwa.',
    summaryEn:
      'Any content exploiting, endangering, or harming minors results in immediate removal and account closure.',
  },
  {
    number: 6,
    titleSw: 'Kuzuia Taarifa za Uongo na Upotoshaji',
    titleEn: 'No Misinformation or Fake News',
    summarySw:
      'Epuka kusambaza habari za uongo, uzushi wa hatari wa kiafya/kijamii, au taarifa za upotoshaji zinazopotosha umma.',
    summaryEn:
      'Do not spread fabricated news, dangerous health/public hoaxes, or deceptive misinformation.',
  },
  {
    number: 7,
    titleSw: 'Kuzuia Utapeli, Ulaghai na Wizi wa Fedha',
    titleEn: 'No Scams, Fraud, or Phishing',
    summarySw:
      'Ni marufuku kuendesha utapeli, upatu usio halali, kuomba namba za siri za benki/simu, au viungo vya wizi wa akaunti.',
    summaryEn:
      'Scams, pyramid schemes, phishing links, or stealing financial/login credentials are strictly banned.',
  },
  {
    number: 8,
    titleSw: 'Haki Miliki na Umiliki wa Maudhui',
    titleEn: 'Copyright & Intellectual Property',
    summarySw:
      'Chapisha video, sauti, picha, au maandishi yako halisi au uliyoruhusiwa; usibe kazi za wabunifu wengine bila idhini.',
    summaryEn:
      'Only post media, audio, or text you own or have permission to share; respect creator copyrights.',
  },
  {
    number: 9,
    titleSw: 'Kulinda Faragha ya Watu Wengine (Doxxing)',
    titleEn: 'Privacy & No Doxxing',
    summarySw:
      'Usichapishe namba za simu za siri, anwani za makazi, NIDA, au nyaraka za mtu mwingine bila ridhaa yake.',
    summaryEn:
      'Never expose another person’s private phone numbers, addresses, IDs, or personal documents without consent.',
  },
  {
    number: 10,
    titleSw: 'Kuzuia Akaunti Bandia na Kuiga Watu',
    titleEn: 'No Impersonation or Fake Identities',
    summarySw:
      'Hairuhusiwi kujifanya kiongozi, taasisi, mwandishi, au mwanachama mwingine kwa lengo la kupotosha au kutapeli.',
    summaryEn:
      'Impersonating individuals, officials, brands, or journalists to mislead members is prohibited.',
  },
  {
    number: 11,
    titleSw: 'Kuzuia Spam na Matangazo Yasiyo na Mpangilio',
    titleEn: 'No Spam or Repetitive Abuse',
    summarySw:
      'Usirudie-rudie ujumbe uleule, viungo visivyohusiana, au maoni ya roboti yanayoharibu mijadala na Mchart.',
    summaryEn:
      'Do not flood feeds, comments, or Mchart with repetitive spam, unsolicited links, or bot abuse.',
  },
  {
    number: 12,
    titleSw: 'Kuzuia Bidhaa na Shughuli Haramu',
    titleEn: 'No Illegal Goods or Regulated Contraband',
    summarySw:
      'Ni marufuku kutangaza au kuuza dawa za kulevya, silaha haramu, au shughuli zinazokiuka sheria za nchi.',
    summaryEn:
      'Promoting or selling illegal drugs, weapons, or unlawful services is strictly forbidden.',
  },
  {
    number: 13,
    titleSw: 'Uadilifu wa Jukwaa na Ripoti za Kweli',
    titleEn: 'Platform Integrity & Honest Reporting',
    summarySw:
      'Usijaribu kudanganya mfumo wa likes/maoni, kufanya ripoti za uongo ili kumfungia mtu, au kuharibu usalama wa mfumo.',
    summaryEn:
      'Do not manipulate engagement, file false abuse reports, or attempt to bypass platform security controls.',
  },
];

export function findCommunityRule(ruleNumber?: number | null): CommunitySafetyRule | null {
  if (!ruleNumber || !Number.isFinite(ruleNumber)) return null;
  return COMMUNITY_SAFETY_RULES.find((r) => r.number === Math.round(ruleNumber)) || null;
}

export const MONETIZATION_REQUIREMENTS = {
  minFollowers: 100_000,
  minFriends: 10_000,
  minPosts: 25_000,
  minArticles: 1_500,
  minVideos: 5_000,
  minLikes: 1_000_000,
  minComments: 250_000,
  minShares: 100_000,
  minRepliesGiven: 10_000,
  minAccountDays: 365,
  requireVerificationBadge: true,
  requireCleanVerifiedAccount: true,
} as const;

export const MONETIZATION_PAYOUT_RATES = {
  currency: 'TZS',
  monthlyBaseAllowanceTzs: 250_000,
  perArticleTzs: 5_000,
  perVideoTzs: 2_500,
  perPostTzs: 500,
  perLikeTzs: 5,
  perCommentTzs: 25,
  perShareTzs: 50,
  minWithdrawalTzs: 50_000,
} as const;

export interface AuthorMetricsOptions {
  repliesGivenCount?: number;
  accountCreatedAt?: Timestamp | null;
  verificationBadge?: VerificationBadgeType;
  accountStatus?: AccountStatus;
  emailVerified?: boolean;
  hasProfilePhoto?: boolean;
  bioLength?: number;
}

export interface AuthorMetricsSummary {
  followersCount: number;
  friendsCount: number;
  videosCount: number;
  postsCount: number;
  articlesCount: number;
  totalLikesReceived: number;
  totalCommentsReceived: number;
  totalSharesReceived: number;
  repliesGivenCount: number;
  accountAgeDays: number;
  hasVerificationBadge: boolean;
  hasCleanVerifiedAccount: boolean;
  monthlyPostsCount: number;
  monthlyArticlesCount: number;
  monthlyVideosCount: number;
  monthlyLikesReceived: number;
  monthlyCommentsReceived: number;
  monthlySharesReceived: number;
  monthlyBasePayoutTzs: number;
  monthlyEngagementPayoutTzs: number;
  monthlyTotalPayoutTzs: number;
  projectedMonthlyWithBaseTzs: number;
  lifetimeEstimatedValueTzs: number;
  metCriteriaCount: number;
  totalCriteriaCount: number;
  progressPercent: number;
  isEligibleForMonetization: boolean;
}

export function computeAuthorMetrics(
  topics: Pick<Topic, 'authorId' | 'category' | 'upvotesCount' | 'repliesCount' | 'sharesCount' | 'status' | 'createdAt'>[],
  authorUid: string,
  followersCount = 0,
  videos: Pick<VideoPost, 'authorId' | 'likesCount' | 'commentsCount' | 'sharesCount' | 'isArchived' | 'createdAt'>[] = [],
  friendsCount = 0,
  options: AuthorMetricsOptions = {}
): AuthorMetricsSummary {
  let postsCount = 0;
  let articlesCount = 0;
  let videosCount = 0;
  let totalLikesReceived = 0;
  let totalCommentsReceived = 0;
  let totalSharesReceived = 0;

  let monthlyPostsCount = 0;
  let monthlyArticlesCount = 0;
  let monthlyVideosCount = 0;
  let monthlyLikesReceived = 0;
  let monthlyCommentsReceived = 0;
  let monthlySharesReceived = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isCurrentMonth = (ts?: Timestamp | null) => {
    if (!ts) return false;
    const d = ts.toDate();
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };

  for (const t of topics) {
    if (t.authorId === authorUid && t.status !== 'archived' && t.status !== 'private') {
      const likes = Math.max(0, Number(t.upvotesCount || 0));
      const comments = Math.max(0, Number(t.repliesCount || 0));
      const shares = Math.max(0, Number(t.sharesCount || 0));
      const isArticle = normalizeBoardCategory(String(t.category || 'Kijiweni')) === 'Makala';

      postsCount += 1;
      if (isArticle) articlesCount += 1;
      totalLikesReceived += likes;
      totalCommentsReceived += comments;
      totalSharesReceived += shares;

      if (isCurrentMonth(t.createdAt)) {
        monthlyPostsCount += 1;
        if (isArticle) monthlyArticlesCount += 1;
        monthlyLikesReceived += likes;
        monthlyCommentsReceived += comments;
        monthlySharesReceived += shares;
      }
    }
  }

  for (const v of videos) {
    if (v.authorId === authorUid && !v.isArchived) {
      const likes = Math.max(0, Number(v.likesCount || 0));
      const comments = Math.max(0, Number(v.commentsCount || 0));
      const shares = Math.max(0, Number(v.sharesCount || 0));

      videosCount += 1;
      totalLikesReceived += likes;
      totalCommentsReceived += comments;
      totalSharesReceived += shares;

      if (isCurrentMonth(v.createdAt)) {
        monthlyVideosCount += 1;
        monthlyLikesReceived += likes;
        monthlyCommentsReceived += comments;
        monthlySharesReceived += shares;
      }
    }
  }

  const cleanFollowers = Math.max(0, Number(followersCount || 0));
  const cleanFriends = Math.max(0, Number(friendsCount || 0));
  const cleanRepliesGiven = Math.max(0, Number(options.repliesGivenCount || 0));
  const accountAgeDays = options.accountCreatedAt
    ? Math.max(0, Math.floor((Date.now() - options.accountCreatedAt.toMillis()) / 86_400_000))
    : 0;
  const hasVerificationBadge = Boolean(
    options.verificationBadge && options.verificationBadge !== 'none'
  );
  const notSuspended = options.accountStatus !== 'suspended';
  const emailOk = options.emailVerified === undefined ? true : Boolean(options.emailVerified);
  const profileOk =
    (options.hasProfilePhoto === undefined ? true : Boolean(options.hasProfilePhoto)) &&
    (options.bioLength === undefined ? true : options.bioLength >= 20);
  const hasCleanVerifiedAccount = notSuspended && emailOk && profileOk;

  const ratios = [
    Math.min(1, cleanFollowers / MONETIZATION_REQUIREMENTS.minFollowers),
    Math.min(1, cleanFriends / MONETIZATION_REQUIREMENTS.minFriends),
    Math.min(1, postsCount / MONETIZATION_REQUIREMENTS.minPosts),
    Math.min(1, articlesCount / MONETIZATION_REQUIREMENTS.minArticles),
    Math.min(1, videosCount / MONETIZATION_REQUIREMENTS.minVideos),
    Math.min(1, totalLikesReceived / MONETIZATION_REQUIREMENTS.minLikes),
    Math.min(1, totalCommentsReceived / MONETIZATION_REQUIREMENTS.minComments),
    Math.min(1, totalSharesReceived / MONETIZATION_REQUIREMENTS.minShares),
    Math.min(1, cleanRepliesGiven / MONETIZATION_REQUIREMENTS.minRepliesGiven),
    Math.min(1, accountAgeDays / MONETIZATION_REQUIREMENTS.minAccountDays),
    hasVerificationBadge ? 1 : 0,
    hasCleanVerifiedAccount ? 1 : 0,
  ];

  const met = ratios.filter((r) => r >= 1).length;
  const totalCriteriaCount = ratios.length;
  const isEligibleForMonetization = met === totalCriteriaCount;
  const progressPercent = Math.round(
    (ratios.reduce((sum, r) => sum + r, 0) / totalCriteriaCount) * 100
  );

  const regularMonthlyPosts = Math.max(0, monthlyPostsCount - monthlyArticlesCount);
  const monthlyEngagementPayoutTzs =
    regularMonthlyPosts * MONETIZATION_PAYOUT_RATES.perPostTzs +
    monthlyArticlesCount * MONETIZATION_PAYOUT_RATES.perArticleTzs +
    monthlyVideosCount * MONETIZATION_PAYOUT_RATES.perVideoTzs +
    monthlyLikesReceived * MONETIZATION_PAYOUT_RATES.perLikeTzs +
    monthlyCommentsReceived * MONETIZATION_PAYOUT_RATES.perCommentTzs +
    monthlySharesReceived * MONETIZATION_PAYOUT_RATES.perShareTzs;

  const monthlyBasePayoutTzs = isEligibleForMonetization
    ? MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs
    : 0;
  const monthlyTotalPayoutTzs = isEligibleForMonetization
    ? monthlyBasePayoutTzs + monthlyEngagementPayoutTzs
    : 0;
  const projectedMonthlyWithBaseTzs =
    MONETIZATION_PAYOUT_RATES.monthlyBaseAllowanceTzs + monthlyEngagementPayoutTzs;

  const regularTotalPosts = Math.max(0, postsCount - articlesCount);
  const lifetimeEstimatedValueTzs =
    regularTotalPosts * MONETIZATION_PAYOUT_RATES.perPostTzs +
    articlesCount * MONETIZATION_PAYOUT_RATES.perArticleTzs +
    videosCount * MONETIZATION_PAYOUT_RATES.perVideoTzs +
    totalLikesReceived * MONETIZATION_PAYOUT_RATES.perLikeTzs +
    totalCommentsReceived * MONETIZATION_PAYOUT_RATES.perCommentTzs +
    totalSharesReceived * MONETIZATION_PAYOUT_RATES.perShareTzs;

  return {
    followersCount: cleanFollowers,
    friendsCount: cleanFriends,
    videosCount,
    postsCount,
    articlesCount,
    totalLikesReceived,
    totalCommentsReceived,
    totalSharesReceived,
    repliesGivenCount: cleanRepliesGiven,
    accountAgeDays,
    hasVerificationBadge,
    hasCleanVerifiedAccount,
    monthlyPostsCount,
    monthlyArticlesCount,
    monthlyVideosCount,
    monthlyLikesReceived,
    monthlyCommentsReceived,
    monthlySharesReceived,
    monthlyBasePayoutTzs,
    monthlyEngagementPayoutTzs,
    monthlyTotalPayoutTzs,
    projectedMonthlyWithBaseTzs,
    lifetimeEstimatedValueTzs,
    metCriteriaCount: met,
    totalCriteriaCount,
    progressPercent,
    isEligibleForMonetization,
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

export type PresenceArea = 'kijiweni' | 'video' | 'fursa' | 'makala' | 'mchart' | 'votes' | 'profile' | 'forum';

export interface UserPresence {
  uid: string;
  displayName: string;
  photoURL?: string;
  isOnline: boolean;
  isTypingInMchart: boolean;
  typingChatId?: string;
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

export type KijiweniFontStyle =
  | 'sans'
  | 'scholarly'
  | 'classic'
  | 'editorial'
  | 'handwriting'
  | 'mono';

export interface KijiweniFontOption {
  id: KijiweniFontStyle;
  labelSw: string;
  labelEn: string;
  fontFamilyCss: string;
  bodySizeClass: string;
}

export const KIJIWENI_FONT_STYLES: readonly KijiweniFontOption[] = [
  {
    id: 'sans',
    labelSw: 'Kisasa (Safi)',
    labelEn: 'Modern Sans',
    fontFamilyCss: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    bodySizeClass: 'text-[15px]',
  },
  {
    id: 'scholarly',
    labelSw: 'Kisomi (Lora)',
    labelEn: 'Scholarly Book',
    fontFamilyCss: "'Lora', 'Fraunces', Georgia, serif",
    bodySizeClass: 'text-[15.5px]',
  },
  {
    id: 'classic',
    labelSw: 'Klasiki (Garamond)',
    labelEn: 'Classic Serif',
    fontFamilyCss: "'Cormorant Garamond', Georgia, serif",
    bodySizeClass: 'text-[17.5px]',
  },
  {
    id: 'editorial',
    labelSw: 'Jarida (Playfair)',
    labelEn: 'Editorial Print',
    fontFamilyCss: "'Playfair Display', Georgia, serif",
    bodySizeClass: 'text-[15.5px]',
  },
  {
    id: 'handwriting',
    labelSw: 'Mkono (Mwandiko)',
    labelEn: 'Handwriting',
    fontFamilyCss: "'Caveat', cursive",
    bodySizeClass: 'text-[19px]',
  },
  {
    id: 'mono',
    labelSw: 'Taipu (Mono)',
    labelEn: 'Typewriter',
    fontFamilyCss: "'JetBrains Mono', ui-monospace, monospace",
    bodySizeClass: 'text-[13.5px]',
  },
];

export function normalizeKijiweniFontStyle(value: unknown): KijiweniFontStyle {
  if (
    value === 'scholarly' ||
    value === 'classic' ||
    value === 'editorial' ||
    value === 'handwriting' ||
    value === 'mono'
  ) {
    return value;
  }
  return 'sans';
}

export function getKijiweniFontMeta(value: unknown): KijiweniFontOption {
  const id = normalizeKijiweniFontStyle(value);
  return KIJIWENI_FONT_STYLES.find((opt) => opt.id === id) || KIJIWENI_FONT_STYLES[0];
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
  sharesCount?: number;
  acceptedReplyId: string;
  company?: string;
  location?: string;
  jobType?: string;
  deadline?: string;
  applyInfo?: string;
  coverImage?: string;
  images?: string[];
  bodyFontStyle?: KijiweniFontStyle;
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
  targetType: 'topic' | 'reply' | 'video';
  targetId: string;
  topicId: string;
  reason: ReportReason;
  ruleNumber?: number;
  details: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: Timestamp | null;
}

export type ChatAttachmentType = 'none' | 'image' | 'document' | 'audio';

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
  audioDurationSec?: number;
  replyToId: string;
  replyToSenderName: string;
  replyToPreview: string;
  reactions?: Record<string, string[]>;
  isEdited?: boolean;
  forwardedFromName?: string;
  isDeleted: boolean;
  deletedForUids?: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MchartGroupSettings {
  groupName: string;
  groupPhotoUrl: string;
  description: string;
  isLocked: boolean;
  disappearAfterSeconds: number;
  kickedUids: string[];
  inviteCode: string;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface MchartGroupReadCursor {
  uid: string;
  displayName: string;
  photoURL: string;
  lastReadAt: Timestamp | null;
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
  visibility?: 'public' | 'private';
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
  | 'votes'
  | 'safety'
  | 'auth';
export type SortMode = 'newest' | 'votes' | 'oldest' | 'mixed';

export type UserNotificationType =
  | 'comment_reply'
  | 'post_comment'
  | 'account_moderation'
  | 'video_moderation'
  | 'post_moderation';

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
  ruleNumber?: number;
  ruleTitle?: string;
  isRead: boolean;
  createdAt: Timestamp | null;
  readAt?: Timestamp | null;
}

export interface NavUnreadCounts {
  kijiweni: number;
  video?: number;
  fursa: number;
  makala: number;
  chat: number;
  votes?: number;
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
  blockedByUids?: string[];
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
  audioDurationSec?: number;
  replyToId: string;
  replyToSenderName: string;
  replyToPreview: string;
  reactions?: Record<string, string[]>;
  isEdited?: boolean;
  forwardedFromName?: string;
  isDeleted: boolean;
  deletedForUids?: string[];
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
  mediaType?: 'image' | 'video';
  imageUrl: string;
  videoUrl?: string;
  durationSec?: number;
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
  verificationBadge?: VerificationBadgeType;
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
  moderationRuleNumber?: number;
  moderationReason?: string;
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

export interface SiteNavSettings {
  hideVideoTabForUsers: boolean;
  hideMpollTabForUsers?: boolean;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export type ContentRetentionPeriod = '1w' | '3m' | '6m' | '1y' | '5y' | '10y';

export interface ContentRetentionSettings {
  kijiweniEnabled: boolean;
  kijiweniPeriod: ContentRetentionPeriod;
  videoEnabled: boolean;
  videoPeriod: ContentRetentionPeriod;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface OwnerCustomIdCardData {
  cardId: string;
  ownerUid: string;
  headerTopLeftSw: string;
  headerTopLeftEn: string;
  headerTopRightSw: string;
  headerTopRightEn: string;
  idNumberLabel: string;
  idNumber: string;
  surnameLabel: string;
  surname: string;
  givenNamesLabel: string;
  givenNames: string;
  dobLabel: string;
  dateOfBirth: string;
  sexLabel: string;
  sex: string;
  nationalityLabel: string;
  nationality: string;
  signatureLabel: string;
  signatureText: string;
  signaturePath: string;
  portraitUrl: string;
  hologramPhotoUrl: string;
  showSpecimenStamp: boolean;
  specimenText: string;
  showRightEmblem: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type CertificateOrientation = 'landscape' | 'portrait';
export type CertificateTheme = 'navy_gold' | 'emerald_gold' | 'burgundy_gold';

export interface TrainingCertificateData {
  certId: string;
  serialNumber: string;
  issuerUid: string;
  orientation: CertificateOrientation;
  theme: CertificateTheme;
  institutionName: string;
  institutionSubtitle: string;
  institutionLogoUrl: string;
  kickerText: string;
  certificateTitle: string;
  certificateSubtitle: string;
  introLine: string;
  recipientUid: string;
  recipientName: string;
  completionLine: string;
  courseTitle: string;
  courseDetails: string;
  durationText: string;
  gradeText: string;
  issueDateText: string;
  issueLocation: string;
  signatory1Name: string;
  signatory1Title: string;
  signatory1SigText: string;
  signatory1SigPath: string;
  showSignatory2: boolean;
  signatory2Name: string;
  signatory2Title: string;
  signatory2SigText: string;
  signatory2SigPath: string;
  sealText: string;
  watermarkText: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OwnerPrivatePhoto {
  photoId: string;
  ownerUid: string;
  fileHash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  imageUrl: string;
  album: string;
  caption: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OwnerPhotoFolder {
  folderId: string;
  ownerUid: string;
  name: string;
  parentId: string;
  pinHash: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const POLL_CATEGORIES = [
  'Jamii',
  'Siasa',
  'Uongozi',
  'Biashara',
  'Teknolojia',
  'Elimu',
  'Michezo',
  'Mengineyo',
] as const;

export type PollCategory = (typeof POLL_CATEGORIES)[number];
export type PollQuestionType = 'single' | 'multiple' | 'yes_no' | 'rating' | 'open_opinion';
export type PollStyle =
  | 'standard'
  | 'social_x'
  | 'whatsapp'
  | 'candidate_election'
  | 'school_election'
  | 'local_govt'
  | 'open_opinion';
export type PollStatus = 'open' | 'closed' | 'draft';
export type PollResultsVisibility = 'always' | 'after_vote' | 'after_close' | 'owner_only';
export const POLL_THEME_COLORS = [
  'cobalt',
  'emerald',
  'violet',
  'amber',
  'crimson',
  'teal',
  'indigo',
  'rose',
  'cyan',
  'slate',
] as const;
export type PollThemeColor = (typeof POLL_THEME_COLORS)[number];

export type PollGender = 'male' | 'female' | 'other';

export interface PollOption {
  id: string;
  label: string;
  subtitle?: string;
  positionTitle?: string;
  gender?: PollGender;
  imageUrl?: string;
  color?: string;
}

export interface Poll {
  id: string;
  pollId: string;
  question: string;
  description: string;
  imageUrl?: string;
  category: PollCategory;
  questionType: PollQuestionType;
  pollStyle: PollStyle;
  themeColor?: PollThemeColor;
  institutionName: string;
  options: PollOption[];
  optionIds: string[];
  maxChoices: number;
  status: PollStatus;
  resultsVisibility: PollResultsVisibility;
  allowVoteChange: boolean;
  anonymousMode: boolean;
  showVoterCount: boolean;
  showLivePercentages?: boolean;
  shuffleOptions?: boolean;
  allowComments?: boolean;
  quorumTarget?: number;
  allowShare: boolean;
  isPinned: boolean;
  hasDeadline: boolean;
  endsAt: Timestamp | null;
  totalBallots: number;
  commentsCount: number;
  tournamentId?: string;
  tournamentRound?: number;
  tournamentGroupLabel?: string;
  createdBy: string;
  createdByName: string;
  createdByPhoto: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TournamentCandidate {
  id: string;
  name: string;
  gender: PollGender;
  positionTitle?: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface TournamentStageGroup {
  pollId: string;
  label: string;
  genderTrack: 'all' | 'male' | 'female';
  candidateIds: string[];
  advanceCount: number;
}

export interface TournamentStageRecord {
  round: number;
  title: string;
  isFinal: boolean;
  isTieBreaker?: boolean;
  groups: TournamentStageGroup[];
  advancingIds: string[];
  eliminatedIds: string[];
  tiedIds?: string[];
  tiedNeededCount?: number;
  status: 'active' | 'awaiting_tiebreaker' | 'completed';
  startedAtMs: number;
  completedAtMs?: number;
}

export interface PollTournament {
  id: string;
  tournamentId: string;
  title: string;
  description: string;
  institutionName: string;
  category: PollCategory;
  positionTitle: string;
  targetWinnersCount: number;
  useGenderQuota: boolean;
  requiredMaleCount: number;
  requiredFemaleCount: number;
  groupSize: number;
  roundDurationMinutes: number;
  status: 'active' | 'completed';
  currentRound: number;
  totalPlannedRounds: number;
  candidates: TournamentCandidate[];
  stages: TournamentStageRecord[];
  winnerIds: string[];
  winnerVotes?: Record<string, number>;
  createdBy: string;
  createdByName: string;
  createdByPhoto: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PollComment {
  id: string;
  pollId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  body: string;
  parentCommentId: string;
  likesCount: number;
  isDeleted: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PollTally {
  pollId: string;
  optionId: string;
  votesCount: number;
  updatedAt: Timestamp | null;
}

export interface PollBallot {
  pollId: string;
  userId: string;
  voterName: string;
  voterPhoto: string;
  selectedOptionIds: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PlatformLockSettings {
  isLocked: boolean;
  reason: string;
  lockedByUid: string;
  lockedByEmail: string;
  lockedByName: string;
  lockedAt: Timestamp | null;
  unlockedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PlatformLockEmailResult {
  ok: boolean;
  sent: boolean;
  configured: boolean;
  provider?: string;
  recipient: string;
  mailtoUrl: string;
  unlockUrl: string;
  errorDetail?: string;
}

export interface NotificationSoundSettings {
  soundUrl: string;
  soundName: string;
  durationSec: number;
  updatedBy: string;
  updatedAt: Timestamp | null;
}


