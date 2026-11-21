import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  Globe,
  Image as ImageIcon,
  Landmark,
  Link2,
  Lock,
  MessageCircle,
  MessageSquare,
  PieChart,
  Pin,
  Plus,
  Radio,
  RefreshCw,
  Scale,
  School,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Unlock,
  Upload,
  UserCheck,
  Users,
  Vote,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  AuthPromptReason,
  POLL_CATEGORIES,
  Poll,
  PollBallot,
  PollCategory,
  PollOption,
  PollQuestionType,
  PollResultsVisibility,
  PollStatus,
  PollStyle,
} from '../types';
import {
  CreateOrUpdatePollInput,
  buildPollShareUrl,
  canViewPollResults,
  castOrUpdatePollVote,
  createPoll,
  deletePoll,
  exportPollResultsCsv,
  fetchPollBallotsForOwner,
  fetchPollById,
  isPollEffectivelyOpen,
  isPollExpired,
  sharePoll,
  subscribePollTallies,
  togglePollPin,
  updatePoll,
  updatePollStatus,
} from '../services/pollService';
import {
  optimizeCloudinaryUrl,
  prepareSharedImageFile,
  uploadImageToCloudinary,
} from '../services/cloudinaryService';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { PollCommentsThread } from './PollCommentsThread';
import { AuthorVerificationBadge } from './VerificationBadge';

interface VotingPollsViewProps {
  polls: Poll[];
  loading: boolean;
  userBallots: Record<string, PollBallot>;
  onBallotSaved: (pollId: string, ballot: PollBallot) => void;
  user: User | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended: boolean;
  selectedPollId?: string | null;
  onClearSelectedPoll?: () => void;
  onBack?: () => void;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (text: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

const OPTION_COLORS = [
  '#1D4E89',
  '#D97706',
  '#059669',
  '#DC2626',
  '#7C3AED',
  '#0284C7',
  '#DB2777',
  '#0F766E',
];

interface PollStyleMeta {
  id: PollStyle;
  labelSw: string;
  labelEn: string;
  shortTagSw: string;
  shortTagEn: string;
  descSw: string;
  descEn: string;
  defaultCategory: PollCategory;
  institutionPlaceholderSw: string;
  institutionPlaceholderEn: string;
  optionLabelPlaceholderSw: string;
  optionLabelPlaceholderEn: string;
  optionSubtitlePlaceholderSw: string;
  optionSubtitlePlaceholderEn: string;
  supportsPortraits: boolean;
}

const POLL_STYLE_META: Record<PollStyle, PollStyleMeta> = {
  candidate_election: {
    id: 'candidate_election',
    labelSw: 'Uchaguzi wa Wagombea (Picha + Majina)',
    labelEn: 'Candidate Election (Photos + Names)',
    shortTagSw: 'Uchaguzi wa Wagombea',
    shortTagEn: 'Candidate Election',
    descSw: 'Kura yenye picha za wagombea, majina yao, nafasi na ilani fupi.',
    descEn: 'Ballot cards with candidate portraits, full names, roles and manifestos.',
    defaultCategory: 'Uongozi',
    institutionPlaceholderSw: 'Mfano: Uchaguzi wa Bodi ya Jamii / Chama',
    institutionPlaceholderEn: 'e.g., Community Board Election',
    optionLabelPlaceholderSw: 'Jina kamili la mgombea',
    optionLabelPlaceholderEn: 'Candidate full name',
    optionSubtitlePlaceholderSw: 'Nafasi / Chama / Kauli mbiu (mfano: Mwenyekiti · Uwazi)',
    optionSubtitlePlaceholderEn: 'Role / Party / Slogan',
    supportsPortraits: true,
  },
  school_election: {
    id: 'school_election',
    labelSw: 'Uchaguzi wa Shule / Chuo',
    labelEn: 'School / College Election',
    shortTagSw: 'Kura ya Shule / Chuo',
    shortTagEn: 'School Election',
    descSw: 'Kwa kura za Head Boy/Girl, Viongozi wa Darasa, Serikali ya Wanafunzi na Klabu.',
    descEn: 'For Head Boy/Girl, Student Council, Prefects & Campus Club leaders.',
    defaultCategory: 'Elimu',
    institutionPlaceholderSw: 'Mfano: Shule ya Sekondari Azania / Chuo Kikuu',
    institutionPlaceholderEn: 'e.g., Azania Secondary School / University',
    optionLabelPlaceholderSw: 'Jina la mwanafunzi mgombea',
    optionLabelPlaceholderEn: 'Student candidate name',
    optionSubtitlePlaceholderSw: 'Kidato / Kozi / Nafasi (mfano: Form V PCM · Head Prefect)',
    optionSubtitlePlaceholderEn: 'Class / Program / Role',
    supportsPortraits: true,
  },
  local_govt: {
    id: 'local_govt',
    labelSw: 'Serikali za Mitaa / Kijiji / Kata',
    labelEn: 'Local Government Election',
    shortTagSw: 'Serikali za Mitaa',
    shortTagEn: 'Local Government',
    descSw: 'Muundo rasmi wa kupigia kura viongozi wa Mtaa, Kijiji, Kitongoji au Kata.',
    descEn: 'Official civic ballot format for Street, Village, Ward & Local Councils.',
    defaultCategory: 'Siasa',
    institutionPlaceholderSw: 'Mfano: Mtaa wa Kijitonyama · Kata ya Kinondoni',
    institutionPlaceholderEn: 'e.g., Kijitonyama Street · Kinondoni Ward',
    optionLabelPlaceholderSw: 'Jina la mgombea wa mtaa/kijiji',
    optionLabelPlaceholderEn: 'Local council candidate name',
    optionSubtitlePlaceholderSw: 'Nafasi & Chama/Kundi (mfano: Mwenyekiti wa Mtaa)',
    optionSubtitlePlaceholderEn: 'Position & Affiliation',
    supportsPortraits: true,
  },
  social_x: {
    id: 'social_x',
    labelSw: 'Kura ya Mtandao wa X (Twitter Style)',
    labelEn: 'X (Twitter) Style Social Poll',
    shortTagSw: 'Mtindo wa X (Twitter)',
    shortTagEn: 'X Poll Style',
    descSw: 'Kura fupi na ya haraka ya mtandaoni yenye baa za asilimia za kisasa.',
    descEn: 'Fast, clean social-feed poll bars styled after X polls.',
    defaultCategory: 'Jamii',
    institutionPlaceholderSw: 'Mfano: @MijadalaTz · Mada ya Leo',
    institutionPlaceholderEn: 'e.g., @CommunityVoice · Today’s Topic',
    optionLabelPlaceholderSw: 'Chaguo la mjadala (mfano: Ndiyo, ianze sasa)',
    optionLabelPlaceholderEn: 'Poll choice label',
    optionSubtitlePlaceholderSw: 'Maelezo mafupi (hiari)',
    optionSubtitlePlaceholderEn: 'Short note (optional)',
    supportsPortraits: false,
  },
  whatsapp: {
    id: 'whatsapp',
    labelSw: 'Kura ya WhatsApp',
    labelEn: 'WhatsApp Style Poll',
    shortTagSw: 'Mtindo wa WhatsApp',
    shortTagEn: 'WhatsApp Poll',
    descSw: 'Muonekano wa kadi ya WhatsApp Poll yenye alama za kijani na rahisi kuchagua.',
    descEn: 'Familiar emerald WhatsApp poll rows with clear check circles.',
    defaultCategory: 'Jamii',
    institutionPlaceholderSw: 'Mfano: Kundi la Maendeleo / Wanafamilia',
    institutionPlaceholderEn: 'e.g., Community Group / Neighborhood',
    optionLabelPlaceholderSw: 'Jibu / Pendekezo',
    optionLabelPlaceholderEn: 'Option / Suggestion',
    optionSubtitlePlaceholderSw: 'Maelezo ya ziada (hiari)',
    optionSubtitlePlaceholderEn: 'Extra context (optional)',
    supportsPortraits: false,
  },
  open_opinion: {
    id: 'open_opinion',
    labelSw: 'Swali Moja la Maoni Huru (Facebook Thread)',
    labelEn: 'Open Opinion Question (Facebook Comments)',
    shortTagSw: 'Maoni Huru (Swali 1)',
    shortTagEn: 'Open Opinion Thread',
    descSw: 'Swali moja lenye picha na maelezo bila machaguo — watu wanajadili kwenye uwanja mmoja kama Facebook.',
    descEn: 'Single question with image & details, no voting options — live Facebook-style threaded discussion.',
    defaultCategory: 'Jamii',
    institutionPlaceholderSw: 'Mfano: Mjadala wa Kitaifa / Mada ya Wiki / Jamii',
    institutionPlaceholderEn: 'e.g., National Forum / Weekly Topic',
    optionLabelPlaceholderSw: 'Chaguo',
    optionLabelPlaceholderEn: 'Option',
    optionSubtitlePlaceholderSw: 'Maelezo mafupi (hiari)',
    optionSubtitlePlaceholderEn: 'Subtitle (optional)',
    supportsPortraits: false,
  },
  standard: {
    id: 'standard',
    labelSw: 'Kura ya Kawaida ya Jamii',
    labelEn: 'Standard Community Poll',
    shortTagSw: 'Kura ya Kawaida',
    shortTagEn: 'Standard Poll',
    descSw: 'Muundo wa kawaida kwa maswali ya maoni, utafiti, tathmini au kura za wazi.',
    descEn: 'Clean standard format for opinion surveys, feedback, and ratings.',
    defaultCategory: 'Jamii',
    institutionPlaceholderSw: 'Jina la kikundi au mradi (hiari)',
    institutionPlaceholderEn: 'Organization or project name (optional)',
    optionLabelPlaceholderSw: 'Chaguo',
    optionLabelPlaceholderEn: 'Option',
    optionSubtitlePlaceholderSw: 'Maelezo mafupi (hiari)',
    optionSubtitlePlaceholderEn: 'Subtitle (optional)',
    supportsPortraits: true,
  },
};

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultOptionsForStyleAndType(
  style: PollStyle,
  type: PollQuestionType,
  tr: (sw: string, en: string) => string
): PollOption[] {
  if (type === 'yes_no') {
    return [
      { id: 'opt_yes', label: tr('Ndiyo, Nakubali', 'Yes, I Agree'), color: '#059669' },
      { id: 'opt_no', label: tr('Hapana, Sikubali', 'No, I Disagree'), color: '#DC2626' },
      { id: 'opt_abstain', label: tr('Sina Msimamo / Sijui', 'Neutral / Abstain'), color: '#64748B' },
    ];
  }
  if (type === 'rating') {
    return [
      { id: 'rate_5', label: tr('5 ★ — Bora Sana', '5 ★ — Excellent'), color: '#059669' },
      { id: 'rate_4', label: tr('4 ★ — Nzuri', '4 ★ — Good'), color: '#0284C7' },
      { id: 'rate_3', label: tr('3 ★ — Wastani', '3 ★ — Average'), color: '#D97706' },
      { id: 'rate_2', label: tr('2 ★ — Dhaifu', '2 ★ — Poor'), color: '#EA580C' },
      { id: 'rate_1', label: tr('1 ★ — Hairidhishi', '1 ★ — Very Poor'), color: '#DC2626' },
    ];
  }
  if (style === 'school_election') {
    return [
      {
        id: 'opt_1',
        label: '',
        subtitle: tr('Kidato cha Tano · Mgombea Mkuu wa Shule', 'Form V · Head Prefect Candidate'),
        color: '#1D4E89',
      },
      {
        id: 'opt_2',
        label: '',
        subtitle: tr('Kidato cha Tano · Mgombea Mkuu wa Shule', 'Form V · Head Prefect Candidate'),
        color: '#059669',
      },
      {
        id: 'opt_3',
        label: '',
        subtitle: tr('Kidato cha Tano · Mgombea Mkuu wa Shule', 'Form V · Head Prefect Candidate'),
        color: '#D97706',
      },
    ];
  }
  if (style === 'local_govt') {
    return [
      {
        id: 'opt_1',
        label: '',
        subtitle: tr('Mgombea Uenyekiti wa Mtaa / Kijiji', 'Street / Village Chairperson Candidate'),
        color: '#059669',
      },
      {
        id: 'opt_2',
        label: '',
        subtitle: tr('Mgombea Uenyekiti wa Mtaa / Kijiji', 'Street / Village Chairperson Candidate'),
        color: '#1D4E89',
      },
    ];
  }
  if (style === 'candidate_election') {
    return [
      {
        id: 'opt_1',
        label: '',
        subtitle: tr('Nafasi / Ilani Fupi', 'Role / Short Manifesto'),
        color: '#1D4E89',
      },
      {
        id: 'opt_2',
        label: '',
        subtitle: tr('Nafasi / Ilani Fupi', 'Role / Short Manifesto'),
        color: '#D97706',
      },
    ];
  }
  return [
    { id: 'opt_1', label: '', color: '#1D4E89' },
    { id: 'opt_2', label: '', color: '#D97706' },
  ];
}

type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

function addDurationToNow(amount: number, unit: DurationUnit, baseMs = Date.now()): Date {
  const safeAmount = Math.max(1, Math.round(amount));
  const d = new Date(baseMs);
  switch (unit) {
    case 'minutes':
      return new Date(baseMs + safeAmount * 60 * 1000);
    case 'hours':
      return new Date(baseMs + safeAmount * 3600 * 1000);
    case 'days':
      return new Date(baseMs + safeAmount * 24 * 3600 * 1000);
    case 'weeks':
      return new Date(baseMs + safeAmount * 7 * 24 * 3600 * 1000);
    case 'months':
      d.setMonth(d.getMonth() + safeAmount);
      return d;
    case 'years':
      d.setFullYear(d.getFullYear() + safeAmount);
      return d;
  }
}

function formatRemainingCountdown(endsAtMs: number, tr: (sw: string, en: string) => string): string {
  const diff = endsAtMs - Date.now();
  if (diff <= 0) return tr('Muda umekwisha', 'Ended');
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return tr(`Imebaki dk ${Math.max(1, mins)}`, `${Math.max(1, mins)}m left`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr(`Imebaki saa ${hours}`, `${hours}h left`);
  const days = Math.floor(hours / 24);
  if (days < 14) return tr(`Imebaki siku ${days}`, `${days}d left`);
  const weeks = Math.floor(days / 7);
  if (days < 60) return tr(`Imebaki wiki ${weeks}`, `${weeks}w left`);
  const months = Math.floor(days / 30);
  if (days < 365) return tr(`Imebaki miezi ${months}`, `${months}mo left`);
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  if (remMonths > 0) {
    return tr(
      `Imebaki mwaka ${years} · miezi ${remMonths}`,
      `${years}y ${remMonths}mo left`
    );
  }
  return years === 1
    ? tr('Imebaki mwaka 1', '1y left')
    : tr(`Imebaki miaka ${years}`, `${years}y left`);
}

function getStyleIcon(style: PollStyle, size = 14) {
  switch (style) {
    case 'open_opinion':
      return <MessageSquare size={size} />;
    case 'school_election':
      return <School size={size} />;
    case 'local_govt':
      return <Landmark size={size} />;
    case 'candidate_election':
      return <UserCheck size={size} />;
    case 'whatsapp':
      return <MessageCircle size={size} />;
    case 'social_x':
      return <Globe size={size} />;
    default:
      return <Vote size={size} />;
  }
}

function isElectionStyle(style: PollStyle): boolean {
  return (
    style === 'candidate_election' ||
    style === 'school_election' ||
    style === 'local_govt'
  );
}

interface RankedOptionRow {
  rank: number;
  option: PollOption;
  count: number;
  pct: number;
  pctRounded: number;
  gapFromLeader: number;
  isLeader: boolean;
}

function buildRankedOptions(poll: Poll, tallies: Record<string, number>): {
  rows: RankedOptionRow[];
  totalSelections: number;
  topCount: number;
  leaders: RankedOptionRow[];
  runnerUp: RankedOptionRow | null;
  marginVotes: number;
  marginPct: number;
  isTie: boolean;
} {
  const totalSelections = poll.options.reduce((sum, opt) => sum + (tallies[opt.id] || 0), 0);
  const sorted = poll.options
    .map((opt, idx) => ({
      option: {
        ...opt,
        color: opt.color || OPTION_COLORS[idx % OPTION_COLORS.length],
      },
      count: tallies[opt.id] || 0,
      originalIdx: idx,
    }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.originalIdx - b.originalIdx));

  const topCount = sorted.length > 0 ? sorted[0].count : 0;

  let currentRank = 1;
  const rows: RankedOptionRow[] = sorted.map((item, idx) => {
    if (idx > 0 && item.count < sorted[idx - 1].count) {
      currentRank = idx + 1;
    }
    const pct = totalSelections > 0 ? (item.count / totalSelections) * 100 : 0;
    return {
      rank: currentRank,
      option: item.option,
      count: item.count,
      pct,
      pctRounded: Math.round(pct * 10) / 10,
      gapFromLeader: Math.max(0, topCount - item.count),
      isLeader: topCount > 0 && item.count === topCount,
    };
  });

  const leaders = rows.filter((r) => r.isLeader);
  const runnerUp = rows.find((r) => !r.isLeader) || null;
  const isTie = leaders.length > 1 && topCount > 0;
  const marginVotes =
    topCount > 0 && !isTie && runnerUp ? topCount - runnerUp.count : topCount > 0 && !isTie ? topCount : 0;
  const marginPct =
    totalSelections > 0 && !isTie && runnerUp
      ? Math.round((marginVotes / totalSelections) * 1000) / 10
      : leaders[0]?.pctRounded || 0;

  return {
    rows,
    totalSelections,
    topCount,
    leaders,
    runnerUp,
    marginVotes,
    marginPct,
    isTie,
  };
}

interface WaffleCell {
  index: number;
  optionId: string;
  label: string;
  color: string;
  pctRounded: number;
}

function buildWaffle100Grid(
  rows: RankedOptionRow[],
  totalSelections: number
): { cells: WaffleCell[]; exactBlocksByOption: Record<string, number> } {
  const exactBlocksByOption: Record<string, number> = {};
  if (totalSelections <= 0 || rows.length === 0) {
    const emptyCells: WaffleCell[] = Array.from({ length: 100 }, (_, index) => ({
      index,
      optionId: '__empty__',
      label: '',
      color: '#E2E8F0',
      pctRounded: 0,
    }));
    return { cells: emptyCells, exactBlocksByOption };
  }

  const active = rows.filter((r) => r.count > 0);
  const quotas = active.map((row, idx) => {
    const exact = (row.count / totalSelections) * 100;
    const base = Math.floor(exact);
    return {
      row,
      base,
      rem: exact - base,
      idx,
    };
  });

  const assigned = quotas.reduce((sum, q) => sum + q.base, 0);
  let remaining = Math.max(0, 100 - assigned);
  quotas
    .slice()
    .sort((a, b) =>
      b.rem !== a.rem ? b.rem - a.rem : b.row.count !== a.row.count ? b.row.count - a.row.count : a.idx - b.idx
    )
    .forEach((q) => {
      if (remaining > 0) {
        q.base += 1;
        remaining -= 1;
      }
    });

  const cells: WaffleCell[] = [];
  quotas.forEach((q) => {
    exactBlocksByOption[q.row.option.id] = q.base;
    for (let i = 0; i < q.base; i++) {
      cells.push({
        index: cells.length,
        optionId: q.row.option.id,
        label: q.row.option.label,
        color: q.row.option.color || '#1D4E89',
        pctRounded: q.row.pctRounded,
      });
    }
  });

  while (cells.length < 100) {
    cells.push({
      index: cells.length,
      optionId: '__empty__',
      label: '',
      color: '#E2E8F0',
      pctRounded: 0,
    });
  }

  return { cells: cells.slice(0, 100), exactBlocksByOption };
}

function computeElectoralIndices(
  rows: RankedOptionRow[],
  totalSelections: number,
  poll: Poll
): {
  effectiveCompetitors: number;
  hhiScore: number;
  top2CombinedPct: number;
  top3CombinedPct: number;
  majorityTargetVotes: number;
  leaderSurplusOrDeficit: number;
  decisiveMajority: boolean;
  closeRace: boolean;
  votesPerHour: number | null;
  elapsedHours: number;
  avgVotesPerOption: number;
  avgPctPerOption: number;
  restOfFieldVotes: number;
  restOfFieldPct: number;
  leaderToRunnerUpRatio: number | null;
} {
  let sumSquaredShares = 0;
  for (const r of rows) {
    if (totalSelections > 0 && r.count > 0) {
      const p = r.count / totalSelections;
      sumSquaredShares += p * p;
    }
  }
  const effectiveCompetitors =
    sumSquaredShares > 0 ? Math.round((1 / sumSquaredShares) * 10) / 10 : 0;
  const hhiScore = Math.round(sumSquaredShares * 1000);

  const top2CombinedPct =
    Math.round(((rows[0]?.pct || 0) + (rows[1]?.pct || 0)) * 10) / 10;
  const top3CombinedPct =
    Math.round(((rows[0]?.pct || 0) + (rows[1]?.pct || 0) + (rows[2]?.pct || 0)) * 10) / 10;

  const majorityTargetVotes = totalSelections > 0 ? Math.floor(totalSelections / 2) + 1 : 1;
  const leaderVotes = rows[0]?.count || 0;
  const runnerUpVotes = rows[1]?.count || 0;
  const leaderSurplusOrDeficit = leaderVotes - majorityTargetVotes;
  const decisiveMajority = totalSelections > 0 && leaderVotes >= majorityTargetVotes;
  const marginPct =
    rows.length >= 2 && totalSelections > 0 ? rows[0].pct - rows[1].pct : 100;
  const closeRace = totalSelections > 0 && rows.length >= 2 && marginPct <= 5;

  const createdMs = poll.createdAt?.toMillis() || Date.now();
  const endRefMs =
    poll.hasDeadline && poll.endsAt
      ? Math.min(Date.now(), poll.endsAt.toMillis())
      : Date.now();
  const elapsedHours = Math.max(0.1, (endRefMs - createdMs) / 3600000);
  const votesPerHour =
    poll.totalBallots > 0
      ? Math.round((poll.totalBallots / elapsedHours) * 10) / 10
      : null;

  const optionCount = Math.max(1, rows.length);
  const avgVotesPerOption = totalSelections > 0 ? Math.round((totalSelections / optionCount) * 10) / 10 : 0;
  const avgPctPerOption = Math.round((100 / optionCount) * 10) / 10;
  const restOfFieldVotes = Math.max(0, totalSelections - leaderVotes);
  const restOfFieldPct =
    totalSelections > 0 ? Math.round((restOfFieldVotes / totalSelections) * 1000) / 10 : 0;
  const leaderToRunnerUpRatio =
    runnerUpVotes > 0 ? Math.round((leaderVotes / runnerUpVotes) * 100) / 100 : null;

  return {
    effectiveCompetitors,
    hhiScore,
    top2CombinedPct,
    top3CombinedPct,
    majorityTargetVotes,
    leaderSurplusOrDeficit,
    decisiveMajority,
    closeRace,
    votesPerHour,
    elapsedHours,
    avgVotesPerOption,
    avgPctPerOption,
    restOfFieldVotes,
    restOfFieldPct,
    leaderToRunnerUpRatio,
  };
}

interface CumulativeSeriesResult {
  checkpoints: Array<{ label: string; totalsByOption: Record<string, number> }>;
  trackedOptions: RankedOptionRow[];
  maxY: number;
}

function buildCumulativeRaceSeries(
  rows: RankedOptionRow[],
  ballots: PollBallot[]
): CumulativeSeriesResult | null {
  const dated = ballots
    .map((b) => ({
      ballot: b,
      ms: (b.createdAt || b.updatedAt)?.toMillis() || 0,
    }))
    .filter((item) => item.ms > 0)
    .sort((a, b) => a.ms - b.ms);

  if (dated.length < 2) return null;

  const trackedOptions = rows.slice(0, 4);
  const runningCounts: Record<string, number> = {};
  trackedOptions.forEach((r) => {
    runningCounts[r.option.id] = 0;
  });

  const pad = (n: number) => String(n).padStart(2, '0');
  const totalPoints = Math.min(12, dated.length);
  const stepSize = Math.max(1, Math.ceil(dated.length / totalPoints));

  const checkpoints: Array<{ label: string; totalsByOption: Record<string, number> }> = [];
  dated.forEach((item, idx) => {
    item.ballot.selectedOptionIds.forEach((optId) => {
      if (optId in runningCounts) {
        runningCounts[optId] += 1;
      }
    });
    const isCheckpoint = (idx + 1) % stepSize === 0 || idx === dated.length - 1;
    if (isCheckpoint) {
      const d = new Date(item.ms);
      checkpoints.push({
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        totalsByOption: { ...runningCounts },
      });
    }
  });

  const maxY = Math.max(
    1,
    ...checkpoints.flatMap((c) => Object.values(c.totalsByOption))
  );

  return { checkpoints, trackedOptions, maxY };
}

// ============================================================================
// INLINE FULL-PAGE MPOLL BUILDER (NO POPUP / NO MODAL)
// ============================================================================
interface InlinePollBuilderProps {
  editingPoll: Poll | null;
  user: User;
  userDisplayName: string;
  userPhoto: string;
  onCancel: () => void;
  onSaved: (pollId: string, isEdit: boolean) => void;
  onToast: (text: string, kind?: 'success' | 'error') => void;
}

const InlinePollBuilder: React.FC<InlinePollBuilderProps> = ({
  editingPoll,
  user,
  userDisplayName,
  userPhoto,
  onCancel,
  onSaved,
  onToast,
}) => {
  const { tr } = useLanguage();
  const isEdit = Boolean(editingPoll);

  const [pollStyle, setPollStyle] = useState<PollStyle>(
    editingPoll?.pollStyle || 'candidate_election'
  );
  const [institutionName, setInstitutionName] = useState(
    editingPoll?.institutionName || ''
  );
  const [question, setQuestion] = useState(editingPoll?.question || '');
  const [description, setDescription] = useState(editingPoll?.description || '');
  const [questionImageUrl, setQuestionImageUrl] = useState(editingPoll?.imageUrl || '');
  const [uploadingQuestionImg, setUploadingQuestionImg] = useState(false);
  const [pendingQuestionCropFile, setPendingQuestionCropFile] = useState<File | null>(null);
  const [questionImgUrlInputOpen, setQuestionImgUrlInputOpen] = useState(false);
  const [category, setCategory] = useState<PollCategory>(editingPoll?.category || 'Uongozi');
  const [questionType, setQuestionType] = useState<PollQuestionType>(
    editingPoll?.questionType || 'single'
  );
  const [options, setOptions] = useState<PollOption[]>(
    editingPoll?.options && editingPoll.options.length >= 2
      ? editingPoll.options.map((o) => ({ ...o }))
      : getDefaultOptionsForStyleAndType('candidate_election', 'single', tr)
  );
  const [maxChoices, setMaxChoices] = useState<number>(editingPoll?.maxChoices || 2);
  const [status, setStatus] = useState<PollStatus>(editingPoll?.status || 'open');
  const [resultsVisibility, setResultsVisibility] = useState<PollResultsVisibility>(
    editingPoll?.resultsVisibility || 'always'
  );
  const [allowVoteChange, setAllowVoteChange] = useState(
    editingPoll ? editingPoll.allowVoteChange : true
  );
  const [anonymousMode, setAnonymousMode] = useState(
    editingPoll ? editingPoll.anonymousMode : false
  );
  const [showVoterCount, setShowVoterCount] = useState(
    editingPoll ? editingPoll.showVoterCount : true
  );
  const [allowShare, setAllowShare] = useState(editingPoll ? editingPoll.allowShare : true);
  const [isPinned, setIsPinned] = useState(editingPoll ? editingPoll.isPinned : false);
  const [hasDeadline, setHasDeadline] = useState(editingPoll ? editingPoll.hasDeadline : false);
  const [endsAtValue, setEndsAtValue] = useState<string>(() => {
    if (editingPoll?.hasDeadline && editingPoll.endsAt) {
      return toDatetimeLocalValue(editingPoll.endsAt.toDate());
    }
    return toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
  });
  const [uploadingOptionIdx, setUploadingOptionIdx] = useState<number | null>(null);
  const [pendingCropOption, setPendingCropOption] = useState<{ idx: number; file: File } | null>(
    null
  );
  const [urlInputIdx, setUrlInputIdx] = useState<number | null>(null);
  const [customDurationAmount, setCustomDurationAmount] = useState<number>(5);
  const [customDurationUnit, setCustomDurationUnit] = useState<DurationUnit>('minutes');
  const [activeDurationPresetKey, setActiveDurationPresetKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const questionImgInputRef = useRef<HTMLInputElement | null>(null);

  const styleMeta = POLL_STYLE_META[pollStyle];
  const isOpenOpinion = questionType === 'open_opinion';

  const handleSelectStyle = (nextStyle: PollStyle) => {
    setPollStyle(nextStyle);
    if (nextStyle === 'open_opinion') {
      setQuestionType('open_opinion');
      if (!isEdit) {
        setCategory(POLL_STYLE_META.open_opinion.defaultCategory);
      }
      return;
    }
    if (questionType === 'open_opinion') {
      setQuestionType('single');
      if (options.length < 2) {
        setOptions(getDefaultOptionsForStyleAndType(nextStyle, 'single', tr));
      }
    }
    if (!isEdit) {
      const nextMeta = POLL_STYLE_META[nextStyle];
      setCategory(nextMeta.defaultCategory);
      const hasTypedLabels = options.some((o) => o.label.trim().length > 0);
      if (!hasTypedLabels && (questionType === 'single' || questionType === 'multiple')) {
        setOptions(getDefaultOptionsForStyleAndType(nextStyle, questionType, tr));
      }
    }
  };

  const handleTypeChange = (nextType: PollQuestionType) => {
    setQuestionType(nextType);
    if (nextType === 'open_opinion') {
      setPollStyle('open_opinion');
      return;
    }
    if (pollStyle === 'open_opinion') {
      setPollStyle('standard');
    }
    if (nextType === 'yes_no' || nextType === 'rating') {
      setOptions(getDefaultOptionsForStyleAndType(pollStyle === 'open_opinion' ? 'standard' : pollStyle, nextType, tr));
    } else if (questionType === 'yes_no' || questionType === 'rating' || questionType === 'open_opinion') {
      if (options.length < 2 || questionType !== 'open_opinion') {
        setOptions(getDefaultOptionsForStyleAndType(pollStyle === 'open_opinion' ? 'standard' : pollStyle, nextType, tr));
      }
    }
  };

  const handleAddOption = () => {
    const maxAllowed = questionType === 'rating' ? 5 : 12;
    if (options.length >= maxAllowed) {
      onToast(
        tr(`Upeo ni machaguo ${maxAllowed} kwa kura moja.`, `Maximum is ${maxAllowed} options.`),
        'error'
      );
      return;
    }
    const idx = options.length;
    setOptions((prev) => [
      ...prev,
      {
        id: `opt_${Date.now().toString(36)}_${idx + 1}`,
        label: '',
        subtitle: '',
        color: OPTION_COLORS[idx % OPTION_COLORS.length],
      },
    ]);
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length <= 2) {
      onToast(
        tr('Lazima kuwe na angalau wagombea au machaguo 2.', 'At least 2 options are required.'),
        'error'
      );
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCandidateFileSelected = (idx: number, file: File | undefined) => {
    const inputEl = fileInputRefs.current[idx];
    if (inputEl) inputEl.value = '';
    if (!file) return;
    if (file.type === 'image/gif') {
      void uploadCroppedCandidatePhoto(idx, file);
      return;
    }
    setPendingCropOption({ idx, file });
  };

  const uploadCroppedCandidatePhoto = async (idx: number, croppedFile: File) => {
    setUploadingOptionIdx(idx);
    try {
      const readyFile =
        croppedFile.size > 7.5 * 1024 * 1024
          ? await prepareSharedImageFile(croppedFile)
          : croppedFile;
      const url = await uploadImageToCloudinary(readyFile);
      setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, imageUrl: url } : o)));
      onToast(
        tr('Picha imekatwa na kupakiwa kama ulivyopanga!', 'Cropped photo uploaded accurately!'),
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha.', 'Failed to upload image.');
      onToast(msg, 'error');
    } finally {
      setUploadingOptionIdx(null);
    }
  };

  const handleQuestionImgFileSelected = (file: File | undefined) => {
    if (questionImgInputRef.current) questionImgInputRef.current.value = '';
    if (!file) return;
    if (file.type === 'image/gif') {
      void uploadCroppedQuestionImage(file);
      return;
    }
    setPendingQuestionCropFile(file);
  };

  const uploadCroppedQuestionImage = async (croppedFile: File) => {
    setUploadingQuestionImg(true);
    try {
      const readyFile =
        croppedFile.size > 7.5 * 1024 * 1024
          ? await prepareSharedImageFile(croppedFile)
          : croppedFile;
      const url = await uploadImageToCloudinary(readyFile);
      setQuestionImageUrl(url);
      onToast(tr('Picha ya swali imepakiwa kikamilifu!', 'Question image uploaded!'), 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha.', 'Failed to upload image.');
      onToast(msg, 'error');
    } finally {
      setUploadingQuestionImg(false);
    }
  };

  const applyDeadlineDuration = (amount: number, unit: DurationUnit, presetKey?: string) => {
    const enforced = unit === 'minutes' ? Math.max(5, Math.round(amount)) : Math.max(1, Math.round(amount));
    const target = addDurationToNow(enforced, unit);
    setHasDeadline(true);
    setEndsAtValue(toDatetimeLocalValue(target));
    setCustomDurationAmount(enforced);
    setCustomDurationUnit(unit);
    setActiveDurationPresetKey(presetKey || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 4) {
      onToast(
        tr('Andika swali la Mpoll (angalau herufi 4).', 'Please enter a poll question (min 4 chars).'),
        'error'
      );
      return;
    }

    const cleanOptions = isOpenOpinion
      ? []
      : options
          .map((o) => ({
            ...o,
            label: o.label.trim(),
            subtitle: (o.subtitle || '').trim() || undefined,
            imageUrl: (o.imageUrl || '').trim() || undefined,
          }))
          .filter((o) => o.label.length > 0);

    if (!isOpenOpinion && cleanOptions.length < 2) {
      onToast(
        tr(
          'Weka majina ya angalau wagombea au machaguo 2.',
          'Please provide at least 2 candidate names or options.'
        ),
        'error'
      );
      return;
    }

    let endsAtDate: Date | null = null;
    if (hasDeadline) {
      const parsed = new Date(endsAtValue);
      if (Number.isNaN(parsed.getTime())) {
        onToast(tr('Chagua tarehe na muda sahihi wa mwisho.', 'Select a valid end date/time.'), 'error');
        return;
      }
      if ((!isEdit || status === 'open') && parsed.getTime() < Date.now() + 60 * 1000) {
        onToast(
          tr(
            'Muda wa mwisho lazima uwe mbele (angalau dakika 5 kutoka sasa).',
            'Closing deadline must be in the future (at least 5 minutes from now).'
          ),
          'error'
        );
        return;
      }
      endsAtDate = parsed;
    }

    setSaving(true);
    try {
      const payload: CreateOrUpdatePollInput = {
        question,
        description,
        imageUrl: questionImageUrl.trim(),
        category,
        questionType,
        pollStyle,
        institutionName,
        options: cleanOptions,
        maxChoices:
          questionType === 'multiple' ? Math.min(cleanOptions.length, Math.max(1, maxChoices)) : 1,
        status,
        resultsVisibility,
        allowVoteChange,
        anonymousMode,
        showVoterCount,
        allowShare,
        isPinned,
        hasDeadline,
        endsAtDate,
      };

      if (editingPoll) {
        await updatePoll(editingPoll.id, editingPoll, payload);
        onToast(tr('Mpoll imesasishwa!', 'Mpoll updated!'), 'success');
        onSaved(editingPoll.id, true);
      } else {
        const newId = await createPoll(user, userDisplayName, userPhoto, payload);
        onToast(
          tr('Mpoll mpya imeundwa na link fupi ipo tayari!', 'Mpoll created with a short share link!'),
          'success'
        );
        onSaved(newId, false);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuhifadhi Mpoll.', 'Failed to save Mpoll.');
      onToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top inline header bar — NO popup */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors shrink-0"
            aria-label={tr('Rudi kwenye orodha ya Mpoll', 'Back to Mpoll list')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight truncate">
              {isEdit
                ? tr('Hariri Mpoll / Uchaguzi', 'Edit Mpoll / Election')
                : tr('Tengeneza Mpoll Mpya', 'Create New Mpoll')}
            </h2>
            <p className="text-xs text-slate-500">
              {tr(
                'Chagua mtindo wa kura (Wagombea wenye picha, Shule, Serikali za Mitaa, X au WhatsApp) na weka mipangilio kamili.',
                'Choose format (Candidate portraits, School, Local Govt, X or WhatsApp) and configure full voting rules.'
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {tr('Rudi Kwenye Orodha', 'Back to List')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Choose Poll Format / Template */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Sparkles size={15} className="text-[#1D4E89]" />
                {tr('1. Chagua Aina / Mtindo wa Mpoll', '1. Choose Mpoll Format & Style')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr(
                  'Kila mtindo hupanga muonekano wa kura kwa wapiga kura na matokeo yake.',
                  'Each format tailors how voters see candidates, options, and tallies.'
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(Object.values(POLL_STYLE_META) as PollStyleMeta[]).map((item) => {
              const selected = pollStyle === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectStyle(item.id)}
                  className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                    selected
                      ? 'bg-[#1D4E89]/[0.06] border-[#1D4E89] ring-1 ring-[#1D4E89]/30'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      selected
                        ? 'bg-[#1D4E89] text-white'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {getStyleIcon(item.id, 16)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0F172A] leading-snug">
                      {tr(item.shortTagSw, item.shortTagEn)}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      {tr(item.descSw, item.descEn)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2: Question, Institution & Type */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Vote size={15} className="text-[#1D4E89]" />
            {tr('2. Swali, Taasisi na Maelezo ya Kura', '2. Question, Institution & Details')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tr('Swali au Kichwa cha Uchaguzi', 'Poll Question / Election Title')} *
              </label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={300}
                required
                placeholder={
                  pollStyle === 'school_election'
                    ? tr(
                        'Mfano: Uchaguzi wa Kiongozi Mkuu wa Wanafunzi 2026',
                        'e.g., 2026 Head Student Election'
                      )
                    : pollStyle === 'local_govt'
                      ? tr(
                          'Mfano: Nani awe Mwenyekiti wa Mtaa wetu?',
                          'e.g., Who should be our Local Street Chairperson?'
                        )
                      : tr(
                          'Andika swali lako la kura hapa...',
                          'Write your poll question here...'
                        )
                }
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tr('Jina la Shule / Mtaa / Taasisi / Kundi', 'School / Ward / Institution / Group')}{' '}
                <span className="font-normal text-slate-400">({tr('Hiari', 'Optional')})</span>
              </label>
              <div className="relative">
                <Building2
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  maxLength={120}
                  placeholder={tr(
                    styleMeta.institutionPlaceholderSw,
                    styleMeta.institutionPlaceholderEn
                  )}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89] focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {tr('Kategoria', 'Category')}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PollCategory)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89]"
                >
                  {POLL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {tr('Aina ya Uchaguzi', 'Selection Rule')}
                </label>
                <select
                  value={questionType}
                  onChange={(e) => handleTypeChange(e.target.value as PollQuestionType)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89]"
                >
                  <option value="single">{tr('Chaguo Moja (Single)', 'Single Choice')}</option>
                  <option value="multiple">{tr('Machaguo Mengi', 'Multiple Choice')}</option>
                  <option value="yes_no">{tr('Ndiyo / Hapana', 'Yes / No / Neutral')}</option>
                  <option value="rating">{tr('Kiwango (Nyota 1–5)', 'Star Rating (1–5)')}</option>
                  <option value="open_opinion">
                    {tr('Maoni Huru (Swali 1 + Uwanja wa Maoni)', 'Open Opinion (No Options · Comments Thread)')}
                  </option>
                </select>
              </div>
            </div>

            {questionType === 'multiple' && (
              <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-amber-900">
                  {tr(
                    'Idadi ya juu ya wagombea/machaguo mtu anayoweza kuchagua:',
                    'Maximum choices a single voter can pick:'
                  )}
                </span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(2, options.length)}
                  value={maxChoices}
                  onChange={(e) => setMaxChoices(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-2.5 py-1.5 text-sm font-bold bg-white border border-amber-300 rounded-md tabular-nums"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tr('Maelezo ya Ziada au Maelekezo', 'Instructions / Description')}{' '}
                <span className="font-normal text-slate-400">({tr('Hiari', 'Optional')})</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={isOpenOpinion ? 3 : 2}
                maxLength={1500}
                placeholder={
                  isOpenOpinion
                    ? tr(
                        'Eleza muktadha wa swali ili wachangiaji watoe maoni ya kina kwenye uwanja wa majadiliano...',
                        'Explain the topic background so members can share thoughtful opinions below...'
                      )
                    : tr(
                        'Eleza vigezo vya uchaguzi, muktadha, au maelekezo kwa wapiga kura...',
                        'Explain voting guidelines, criteria, or background context...'
                      )
                }
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89] focus:bg-white"
              />
            </div>

            {/* Question Photo Attachment (Great for Open Opinion & Visual Polls) */}
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon size={15} className="text-[#1D4E89]" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {tr('Ambatanisha Picha ya Swali', 'Attach Question Photo')}{' '}
                      <span className="font-normal text-slate-400">({tr('Hiari', 'Optional')})</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr(
                        'Pakia na kata picha itakayoonekana pamoja na swali na maelezo.',
                        'Upload and crop an image displayed cleanly with the question & details.'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={questionImgInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => handleQuestionImgFileSelected(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    disabled={uploadingQuestionImg}
                    onClick={() => questionImgInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors disabled:opacity-60"
                  >
                    <Upload size={13} />
                    {uploadingQuestionImg
                      ? tr('Inapakia...', 'Uploading...')
                      : questionImageUrl
                        ? tr('Badili / Kata Picha', 'Change / Crop Photo')
                        : tr('Pakia Picha', 'Upload Photo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionImgUrlInputOpen((v) => !v)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
                  >
                    {questionImgUrlInputOpen ? tr('Funga URL', 'Hide URL') : tr('Weka Link', 'Paste URL')}
                  </button>
                  {questionImageUrl && (
                    <button
                      type="button"
                      onClick={() => setQuestionImageUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-bold text-rose-700"
                    >
                      <X size={12} />
                      {tr('Ondoa', 'Remove')}
                    </button>
                  )}
                </div>
              </div>

              {questionImgUrlInputOpen && (
                <input
                  type="url"
                  value={questionImageUrl}
                  onChange={(e) => setQuestionImageUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                />
              )}

              {questionImageUrl && (
                <div className="rounded-lg border border-slate-200 bg-white p-2 overflow-hidden">
                  <img
                    src={optimizeCloudinaryUrl(questionImageUrl, 900)}
                    alt={tr('Hakiki picha ya swali', 'Question photo preview')}
                    className="w-full max-h-64 object-contain rounded-md bg-slate-50"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Step 3: Candidates / Options OR Open Opinion Discussion Confirmation */}
        {isOpenOpinion ? (
          <section className="bg-sky-50/80 border border-sky-200 rounded-xl p-4 sm:p-5 flex items-start gap-3 shadow-xs">
            <span className="w-10 h-10 rounded-xl bg-[#1D4E89] text-white flex items-center justify-center shrink-0">
              <MessageSquare size={18} />
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#0F172A]">
                {tr(
                  '3. Swali Moja la Maoni Huru (Bila Machaguo)',
                  '3. Single Open-Opinion Discussion (No Voting Options)'
                )}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {tr(
                  'Swali hili halitakuwa na machaguo ya kubofya (A/B). Watumiaji wataona swali lako, picha uliyoweka, na maelezo, kisha watachangia na kujibizana kwa mpangilio wa Facebook Thread kwenye uwanja mmoja wa maoni.',
                  'This question has zero preset options. Readers view your question, attached photo, and description, then chat and reply together in one Facebook-style comment thread.'
                )}
              </p>
            </div>
          </section>
        ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Users size={15} className="text-[#1D4E89]" />
                {isElectionStyle(pollStyle)
                  ? tr('3. Wagombea (Picha, Majina & Ilani)', '3. Candidates (Photos, Names & Roles)')
                  : tr('3. Machaguo ya Kura', '3. Poll Options')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr(
                  'Unaweza kupakia picha ya kila mgombea au chaguo moja kwa moja kutoka kwenye simu/kompyuta.',
                  'Upload a portrait photo for any candidate or option directly from your device.'
                )}
              </p>
            </div>
            {questionType !== 'rating' && (
              <button
                type="button"
                onClick={handleAddOption}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D4E89]/10 hover:bg-[#1D4E89]/15 text-[#1D4E89] text-xs font-bold transition-colors"
              >
                <Plus size={14} />
                {isElectionStyle(pollStyle)
                  ? tr('Ongeza Mgombea', 'Add Candidate')
                  : tr('Ongeza Chaguo', 'Add Option')}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {options.map((opt, idx) => {
              const color = opt.color || OPTION_COLORS[idx % OPTION_COLORS.length];
              const isUploading = uploadingOptionIdx === idx;
              return (
                <div
                  key={opt.id || idx}
                  className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                >
                  <div className="flex items-start gap-3">
                    {/* Portrait / Photo Preview + Upload Button */}
                    <div className="shrink-0 flex flex-col items-center gap-1.5">
                      <div
                        className="w-16 h-16 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center relative"
                        style={{ borderColor: opt.imageUrl ? color : undefined }}
                      >
                        {opt.imageUrl ? (
                          <img
                            src={optimizeCloudinaryUrl(opt.imageUrl, 240)}
                            alt={opt.label || `Option ${idx + 1}`}
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center text-slate-400"
                            style={{ backgroundColor: `${color}12` }}
                          >
                            <Camera size={18} style={{ color }} />
                            <span className="text-[10px] font-bold mt-0.5 tabular-nums text-slate-500">
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                          </div>
                        )}
                        {isUploading && (
                          <div className="absolute inset-0 bg-slate-900/60 text-white text-[10px] font-bold flex items-center justify-center">
                            ...
                          </div>
                        )}
                      </div>

                      <input
                        ref={(el) => {
                          fileInputRefs.current[idx] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleCandidateFileSelected(idx, e.target.files?.[0])}
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => fileInputRefs.current[idx]?.click()}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 hover:border-[#1D4E89] text-[10px] font-bold text-slate-700 transition-colors"
                          title={tr('Pakia na kata picha ya mgombea', 'Upload & crop candidate photo')}
                        >
                          <Upload size={11} />
                          {opt.imageUrl ? tr('Badili', 'Crop') : tr('Picha', 'Photo')}
                        </button>
                        {opt.imageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setOptions((prev) =>
                                prev.map((o, i) => (i === idx ? { ...o, imageUrl: undefined } : o))
                              )
                            }
                            className="p-1 rounded-md bg-white border border-slate-200 hover:text-rose-600 text-slate-400"
                            title={tr('Ondoa picha', 'Remove photo')}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Candidate Name + Subtitle + Color & Remove */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) =>
                            setOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, label: e.target.value } : o))
                            )
                          }
                          maxLength={160}
                          placeholder={`${tr(
                            styleMeta.optionLabelPlaceholderSw,
                            styleMeta.optionLabelPlaceholderEn
                          )} #${idx + 1}`}
                          className="flex-1 min-w-0 px-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:border-[#1D4E89]"
                        />
                        {options.length > 2 && questionType !== 'rating' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-400 flex items-center justify-center shrink-0 transition-colors"
                            title={tr('Ondoa chaguo', 'Remove option')}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        value={opt.subtitle || ''}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((o, i) =>
                              i === idx ? { ...o, subtitle: e.target.value } : o
                            )
                          )
                        }
                        maxLength={160}
                        placeholder={tr(
                          styleMeta.optionSubtitlePlaceholderSw,
                          styleMeta.optionSubtitlePlaceholderEn
                        )}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/20 focus:border-[#1D4E89]"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500 mr-1">
                            {tr('Rangi:', 'Color:')}
                          </span>
                          {OPTION_COLORS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() =>
                                setOptions((prev) =>
                                  prev.map((o, i) => (i === idx ? { ...o, color: hex } : o))
                                )
                              }
                              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                color === hex
                                  ? 'border-slate-900 scale-110'
                                  : 'border-white hover:scale-105'
                              }`}
                              style={{ backgroundColor: hex }}
                              aria-label={`Color ${hex}`}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => setUrlInputIdx(urlInputIdx === idx ? null : idx)}
                          className="text-[11px] font-semibold text-[#1D4E89] hover:underline"
                        >
                          {urlInputIdx === idx
                            ? tr('Funga URL ya picha', 'Hide image URL')
                            : tr('Weka link ya picha (hiari)', 'Paste image URL (optional)')}
                        </button>
                      </div>

                      {urlInputIdx === idx && (
                        <input
                          type="url"
                          value={opt.imageUrl || ''}
                          onChange={(e) =>
                            setOptions((prev) =>
                              prev.map((o, i) =>
                                i === idx ? { ...o, imageUrl: e.target.value } : o
                              )
                            )
                          }
                          maxLength={500}
                          placeholder="https://..."
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {/* Step 4: Security, Visibility & Deadlines */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-[#1D4E89]" />
            {tr('4. Usalama wa Kura, Muda na Mipangilio', '4. Vote Security, Deadlines & Settings')}
          </h3>

          <div className={`grid grid-cols-1 ${isOpenOpinion ? '' : 'sm:grid-cols-2'} gap-3`}>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tr('Hali ya Mpoll', 'Poll Status')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PollStatus)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
              >
                <option value="open">
                  {isOpenOpinion
                    ? tr('Wazi (Inapokea Maoni)', 'Open (Accepting Comments)')
                    : tr('Wazi (Inapokea Kura)', 'Open (Accepting Votes)')}
                </option>
                <option value="closed">
                  {isOpenOpinion
                    ? tr('Imefungwa (Kusoma Pekee)', 'Closed (Read Only)')
                    : tr('Imefungwa (Matokeo Pekee)', 'Closed (Results Only)')}
                </option>
                <option value="draft">{tr('Rasimu (Mmiliki Pekee)', 'Draft (Owner Only)')}</option>
              </select>
            </div>

            {!isOpenOpinion && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {tr('Wapiga Kura Waone Matokeo Lini?', 'When Voters See Results')}
                </label>
                <select
                  value={resultsVisibility}
                  onChange={(e) => setResultsVisibility(e.target.value as PollResultsVisibility)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                >
                  <option value="always">{tr('Muda Wote (Live)', 'Always Visible (Live)')}</option>
                  <option value="after_vote">
                    {tr('Baada ya Kupiga Kura', 'After Voting')}
                  </option>
                  <option value="after_close">
                    {tr('Baada ya Kura Kufungwa', 'After Poll Closes')}
                  </option>
                  <option value="owner_only">
                    {tr('Mmiliki Pekee (Siri)', 'Owner Only (Private)')}
                  </option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {!isOpenOpinion && (
              <>
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowVoteChange}
                    onChange={(e) => setAllowVoteChange(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
                  />
                  <div>
                    <div className="font-bold text-slate-800">
                      {tr('Ruhusu Kubadilisha Kura', 'Allow Vote Change')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr(
                        'Mpiga kura anaweza kubadilisha chaguo lake wakati kura bado ipo wazi.',
                        'Voters can update their choice while the poll remains open.'
                      )}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anonymousMode}
                    onChange={(e) => setAnonymousMode(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
                  />
                  <div>
                    <div className="font-bold text-slate-800">
                      {tr('Kura ya Siri Kwa Umma', 'Publicly Anonymous')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr(
                        'Wapiga kura wengine hawaoni majina ya wenzao, ila mmiliki anaona ukaguzi kamili.',
                        'Public stays private while owner retains full verified audit visibility.'
                      )}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showVoterCount}
                    onChange={(e) => setShowVoterCount(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
                  />
                  <div>
                    <div className="font-bold text-slate-800">
                      {tr('Onyesha Idadi ya Wapiga Kura', 'Show Total Voter Count')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr('Onyesha jumla ya walioshiriki kwenye kadi.', 'Display turnout count on card.')}
                    </div>
                  </div>
                </label>
              </>
            )}

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
              <input
                type="checkbox"
                checked={allowShare}
                onChange={(e) => setAllowShare(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
              />
              <div>
                <div className="font-bold text-slate-800">
                  {tr('Ruhusu Link Fupi ya Kushiriki', 'Enable Short Share Link')}
                </div>
                <div className="text-[11px] text-slate-500">
                  {tr(
                    'Wageni wataona kura na wagombea wote, kisha watahitajika kujisajili kupiga kura.',
                    'Guests preview full poll & candidates, then sign in to cast 1 ballot.'
                  )}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
              />
              <div>
                <div className="font-bold text-slate-800">
                  {tr('Bandika Juu ya Mpoll (Pin)', 'Pin to Top of Mpoll')}
                </div>
                <div className="text-[11px] text-slate-500">
                  {tr(
                    'Kura hii itaonekana kwanza kabisa watu wakifungua sehemu ya Mpoll.',
                    'Display this poll first in the Mpoll feed.'
                  )}
                </div>
              </div>
            </label>
          </div>

          {/* Deadline — 5 Minutes to Multi-Year Flexible Controls */}
          <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDeadline}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHasDeadline(checked);
                  if (checked && !endsAtValue) {
                    applyDeadlineDuration(24, 'hours', '24h');
                  }
                }}
                className="rounded border-slate-300 text-[#1D4E89] focus:ring-[#1D4E89]"
              />
              <Clock size={14} className="text-[#1D4E89]" />
              {tr(
                'Weka Muda wa Mwisho (Dakika 5 hadi Wiki, Mwezi au Mwaka)',
                'Set Closing Duration (5 Minutes up to Weeks, Months or Years)'
              )}
            </label>

            {hasDeadline && (
              <div className="space-y-3 pt-1">
                {/* Quick Presets Grouped cleanly */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500">
                    {tr('Chagua muda wa haraka:', 'Quick duration presets:')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: '5m', amount: 5, unit: 'minutes', label: tr('Dakika 5', '5 Mins') },
                        { key: '15m', amount: 15, unit: 'minutes', label: tr('Dakika 15', '15 Mins') },
                        { key: '30m', amount: 30, unit: 'minutes', label: tr('Dakika 30', '30 Mins') },
                        { key: '1h', amount: 1, unit: 'hours', label: tr('Saa 1', '1 Hour') },
                        { key: '6h', amount: 6, unit: 'hours', label: tr('Saa 6', '6 Hours') },
                        { key: '12h', amount: 12, unit: 'hours', label: tr('Saa 12', '12 Hours') },
                        { key: '1d', amount: 1, unit: 'days', label: tr('Siku 1', '1 Day') },
                        { key: '3d', amount: 3, unit: 'days', label: tr('Siku 3', '3 Days') },
                        { key: '1w', amount: 1, unit: 'weeks', label: tr('Wiki 1', '1 Week') },
                        { key: '2w', amount: 2, unit: 'weeks', label: tr('Wiki 2', '2 Weeks') },
                        { key: '1mo', amount: 1, unit: 'months', label: tr('Mwezi 1', '1 Month') },
                        { key: '3mo', amount: 3, unit: 'months', label: tr('Miezi 3', '3 Months') },
                        { key: '6mo', amount: 6, unit: 'months', label: tr('Miezi 6', '6 Months') },
                        { key: '1y', amount: 1, unit: 'years', label: tr('Mwaka 1', '1 Year') },
                      ] as Array<{ key: string; amount: number; unit: DurationUnit; label: string }>
                    ).map((preset) => {
                      const active = activeDurationPresetKey === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => applyDeadlineDuration(preset.amount, preset.unit, preset.key)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                            active
                              ? 'border-[#1D4E89] bg-[#1D4E89] text-white shadow-xs'
                              : 'border-slate-200 bg-white hover:border-[#1D4E89] text-slate-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Numeric + Unit Builder + Exact Datetime */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/80">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {tr('Au pima muda maalum (mfano: Wiki 3, Miezi 8, Miaka 2):', 'Or set custom duration:')}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={customDurationUnit === 'minutes' ? 5 : 1}
                        max={customDurationUnit === 'minutes' ? 1440 : 120}
                        value={customDurationAmount}
                        onChange={(e) => {
                          const raw = Number(e.target.value) || 1;
                          setCustomDurationAmount(raw);
                          setActiveDurationPresetKey(null);
                        }}
                        className="w-20 px-2.5 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 tabular-nums"
                      />
                      <select
                        value={customDurationUnit}
                        onChange={(e) => {
                          const unit = e.target.value as DurationUnit;
                          setCustomDurationUnit(unit);
                          if (unit === 'minutes' && customDurationAmount < 5) {
                            setCustomDurationAmount(5);
                          }
                          setActiveDurationPresetKey(null);
                        }}
                        className="flex-1 min-w-0 px-2.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                      >
                        <option value="minutes">{tr('Dakika (dak >= 5)', 'Minutes (min 5)')}</option>
                        <option value="hours">{tr('Saa', 'Hours')}</option>
                        <option value="days">{tr('Siku', 'Days')}</option>
                        <option value="weeks">{tr('Wiki', 'Weeks')}</option>
                        <option value="months">{tr('Mwezi / Miezi', 'Months')}</option>
                        <option value="years">{tr('Mwaka / Miaka', 'Years')}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => applyDeadlineDuration(customDurationAmount, customDurationUnit)}
                        className="px-3 py-2 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold shrink-0"
                      >
                        {tr('Weka', 'Apply')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {tr('Tarehe & Saa Rasmi ya Kufunga:', 'Exact Closing Date & Time:')}
                    </label>
                    <input
                      type="datetime-local"
                      value={endsAtValue}
                      min={!isEdit ? toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000)) : undefined}
                      onChange={(e) => {
                        setEndsAtValue(e.target.value);
                        setActiveDurationPresetKey(null);
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                    />
                  </div>
                </div>

                {endsAtValue && !Number.isNaN(new Date(endsAtValue).getTime()) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-[11px]">
                    <span className="text-slate-600">
                      {tr('Itafungwa tarehe:', 'Scheduled to close:')}{' '}
                      <strong className="text-[#0F172A]">
                        {new Date(endsAtValue).toLocaleString()}
                      </strong>
                    </span>
                    <span className="font-bold text-[#1D4E89]">
                      {formatRemainingCountdown(new Date(endsAtValue).getTime(), tr)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-emerald-900">
            <ShieldCheck size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {tr(
                'Ulinzi wa Kura: Kila akaunti moja inaruhusiwa kura moja tu iliyothibitishwa na Firestore. Kama mmiliki, utaona majina ya wapiga kura wote na takwimu kamili.',
                'Ballot Integrity: Strictly 1 verified ballot per account enforced by Firestore rules. As owner, you can inspect all voter names and analytics.'
              )}
            </p>
          </div>
        </section>

        {/* Sticky Inline Submit Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-end gap-2.5 shadow-xs">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {tr('Ghairi', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || uploadingOptionIdx !== null || uploadingQuestionImg}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors disabled:opacity-60"
          >
            <CheckCircle2 size={15} />
            {saving
              ? tr('Inahifadhi...', 'Saving...')
              : isEdit
                ? tr('Hifadhi Mabadiliko', 'Save Changes')
                : tr('Chapisha Mpoll Sasa', 'Publish Mpoll Now')}
          </button>
        </div>
      </form>

      {/* Candidate Portrait Interactive Crop Modal */}
      <ImageResizeModal
        file={pendingCropOption?.file || null}
        defaultPreset="1:1"
        showCircleGuide
        showLivePreview
        titleSw="Kata na Panga Picha ya Mgombea"
        titleEn="Crop & Frame Candidate Photo"
        subtitleSw="Vuta pembe au buruta mraba kuchagua sehemu halisi — itatoka vilevile ulivyoikata."
        subtitleEn="Drag corners to frame accurately — candidate photo will render exactly as cropped."
        confirmLabelSw="Kata & Pakia Picha"
        confirmLabelEn="Crop & Upload Photo"
        onCancel={() => setPendingCropOption(null)}
        onConfirm={(croppedFile) => {
          const targetIdx = pendingCropOption?.idx;
          setPendingCropOption(null);
          if (targetIdx !== undefined) {
            void uploadCroppedCandidatePhoto(targetIdx, croppedFile);
          }
        }}
      />

      {/* Question Attachment Interactive Crop Modal */}
      <ImageResizeModal
        file={pendingQuestionCropFile}
        defaultPreset="free"
        showLivePreview
        titleSw="Kata na Panga Picha ya Swali"
        titleEn="Crop & Frame Question Photo"
        subtitleSw="Chagua ukubwa au buruta fremu — picha itaambatanishwa vizuri juu ya swali na maoni."
        subtitleEn="Frame the photo accurately — it will display cleanly with the question & discussion."
        confirmLabelSw="Kata & Pakia Picha"
        confirmLabelEn="Crop & Upload Photo"
        onCancel={() => setPendingQuestionCropFile(null)}
        onConfirm={(croppedFile) => {
          setPendingQuestionCropFile(null);
          void uploadCroppedQuestionImage(croppedFile);
        }}
      />
    </div>
  );
};

// ============================================================================
// INLINE FULL-PAGE RESULTS, CHARTS & WINNER ANALYSIS (NO POPUP / NO MODAL)
// ============================================================================
interface InlinePollResultsPageProps {
  poll: Poll;
  tallies: Record<string, number>;
  isAdmin: boolean;
  userBallot: PollBallot | undefined;
  onBack: () => void;
  onEdit: (poll: Poll) => void;
  onDeleteInline: (poll: Poll) => Promise<void>;
  onToast: (text: string, kind?: 'success' | 'error') => void;
}

const InlinePollResultsPage: React.FC<InlinePollResultsPageProps> = ({
  poll,
  tallies,
  isAdmin,
  userBallot,
  onBack,
  onEdit,
  onDeleteInline,
  onToast,
}) => {
  const { tr, lang, formatTime } = useLanguage();
  const [ballots, setBallots] = useState<PollBallot[]>([]);
  const [loadingBallots, setLoadingBallots] = useState(false);
  const [voterSearch, setVoterSearch] = useState('');
  const [filterOptionId, setFilterOptionId] = useState<string>('all');
  const [hoveredOptId, setHoveredOptId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedShortUrl, setCopiedShortUrl] = useState(false);
  const [copiedBulletin, setCopiedBulletin] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');

  const loadBallots = async () => {
    if (!isAdmin) return;
    setLoadingBallots(true);
    try {
      const list = await fetchPollBallotsForOwner(poll.id);
      setBallots(list);
    } catch {
      onToast(tr('Imeshindwa kupakia orodha ya wapiga kura.', 'Failed to load voters.'), 'error');
    } finally {
      setLoadingBallots(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadBallots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.id, isAdmin]);

  const analytics = useMemo(() => buildRankedOptions(poll, tallies), [poll, tallies]);
  const waffleData = useMemo(
    () => buildWaffle100Grid(analytics.rows, analytics.totalSelections),
    [analytics.rows, analytics.totalSelections]
  );
  const indices = useMemo(
    () => computeElectoralIndices(analytics.rows, analytics.totalSelections, poll),
    [analytics.rows, analytics.totalSelections, poll]
  );
  const cumulativeSeries = useMemo(
    () => (isAdmin && ballots.length >= 2 ? buildCumulativeRaceSeries(analytics.rows, ballots) : null),
    [analytics.rows, ballots, isAdmin]
  );

  useEffect(() => {
    if (analytics.rows.length >= 1 && !analytics.rows.some((r) => r.option.id === compareLeftId)) {
      setCompareLeftId(analytics.rows[0].option.id);
    }
    if (analytics.rows.length >= 2 && !analytics.rows.some((r) => r.option.id === compareRightId)) {
      setCompareRightId(analytics.rows[1].option.id);
    } else if (analytics.rows.length === 1) {
      setCompareRightId(analytics.rows[0].option.id);
    }
  }, [analytics.rows, compareLeftId, compareRightId]);

  const isOpen = isPollEffectivelyOpen(poll);
  const expired = isPollExpired(poll);
  const shortUrl = buildPollShareUrl(poll.id);
  const styleMeta = POLL_STYLE_META[poll.pollStyle] || POLL_STYLE_META.standard;

  const optionMap = useMemo(
    () =>
      new Map(
        poll.options.map((o, idx) => [
          o.id,
          { ...o, color: o.color || OPTION_COLORS[idx % OPTION_COLORS.length] },
        ])
      ),
    [poll.options]
  );

  // Donut Chart geometry
  const donutSegments = useMemo(() => {
    const r = 64;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    return analytics.rows.map((row) => {
      const fraction = analytics.totalSelections > 0 ? row.count / analytics.totalSelections : 0;
      const dashLen = fraction * circumference;
      const seg = {
        id: row.option.id,
        label: row.option.label,
        color: row.option.color || '#1D4E89',
        count: row.count,
        pctRounded: row.pctRounded,
        dashArray: `${dashLen} ${Math.max(0, circumference - dashLen)}`,
        dashOffset: -offset,
      };
      offset += dashLen;
      return seg;
    });
  }, [analytics]);

  // Hourly Voting Momentum Buckets (from owner ballots)
  const momentumBuckets = useMemo(() => {
    if (!isAdmin || ballots.length === 0) return [];
    const buckets = new Map<string, { label: string; count: number; sortMs: number }>();
    for (const b of ballots) {
      const d = (b.createdAt || b.updatedAt)?.toDate();
      if (!d) continue;
      const bucketKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      const pad = (n: number) => String(n).padStart(2, '0');
      const label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:00`;
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.count += 1;
      } else {
        buckets.set(bucketKey, { label, count: 1, sortMs: d.getTime() });
      }
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.sortMs - b.sortMs)
      .slice(-14);
  }, [ballots, isAdmin]);

  const peakSurgeBucket = useMemo(() => {
    if (momentumBuckets.length === 0) return null;
    return momentumBuckets.reduce((best, cur) => (cur.count > best.count ? cur : best), momentumBuckets[0]);
  }, [momentumBuckets]);

  const filteredBallots = useMemo(() => {
    const q = voterSearch.trim().toLowerCase();
    return ballots.filter((b) => {
      if (filterOptionId !== 'all' && !b.selectedOptionIds.includes(filterOptionId)) {
        return false;
      }
      if (!q) return true;
      const choiceLabels = b.selectedOptionIds
        .map((id) => optionMap.get(id)?.label || id)
        .join(' ')
        .toLowerCase();
      return (
        b.voterName.toLowerCase().includes(q) ||
        b.userId.toLowerCase().includes(q) ||
        choiceLabels.includes(q)
      );
    });
  }, [ballots, filterOptionId, optionMap, voterSearch]);

  const handleCopyShort = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedShortUrl(true);
      onToast(tr('Kiungo kifupi kimenakiliwa!', 'Short link copied!'), 'success');
      window.setTimeout(() => setCopiedShortUrl(false), 2000);
    } catch {
      onToast(shortUrl);
    }
  };

  const handleCopyOfficialBulletin = async () => {
    const leader = analytics.leaders[0];
    const statusLine = isOpen
      ? tr('MATOKEO YA MOJA KWA MOJA (LIVE)', 'LIVE OFFICIAL PROJECTION')
      : tr('TANGAZO RASMI LA MSHINDI', 'OFFICIAL CERTIFIED WINNER DECLARATION');
    const lines = [
      `═══ ${statusLine} · MPOLL ═══`,
      poll.institutionName ? `${poll.institutionName} · ${poll.question}` : poll.question,
      `${tr('Jumla ya Wapiga Kura', 'Total Verified Voters')}: ${poll.totalBallots.toLocaleString()} (${analytics.totalSelections.toLocaleString()} ${tr('kura/machaguo', 'votes')})`,
      '',
      ...analytics.rows.map(
        (r, i) =>
          `${i + 1}. ${r.option.label} — ${r.count.toLocaleString()} ${tr('kura', 'votes')} (${r.pctRounded}%)`
      ),
      '',
      analytics.topCount === 0
        ? tr('Bado hakuna kura.', 'No ballots cast yet.')
        : analytics.isTie
          ? tr(
              `HALI: Sare kileleni (${analytics.leaders.map((l) => l.option.label).join(' & ')}) · ${analytics.topCount.toLocaleString()} kura (${analytics.leaders[0]?.pctRounded}%)`,
              `STATUS: Deadlocked Tie (${analytics.leaders.map((l) => l.option.label).join(' & ')}) · ${analytics.topCount.toLocaleString()} votes (${analytics.leaders[0]?.pctRounded}%)`
            )
          : tr(
              `MSHINDI / KINARA: ${leader.option.label} — ${leader.count.toLocaleString()} kura (${leader.pctRounded}%) · Pengo dhidi ya #2: +${analytics.marginVotes.toLocaleString()} (+${analytics.marginPct}%)`,
              `WINNER / LEADER: ${leader.option.label} — ${leader.count.toLocaleString()} votes (${leader.pctRounded}%) · Margin over #2: +${analytics.marginVotes.toLocaleString()} (+${analytics.marginPct}%)`
            ),
      poll.allowShare ? shortUrl : '',
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBulletin(true);
      onToast(tr('Tangazo rasmi limenakiliwa!', 'Official results bulletin copied!'), 'success');
      window.setTimeout(() => setCopiedBulletin(false), 2200);
    } catch {
      onToast(tr('Imeshindwa kunakili tangazo.', 'Failed to copy bulletin.'), 'error');
    }
  };

  const leaderRow = analytics.leaders[0] || null;
  const aboveAverageCount = analytics.rows.filter(
    (r) => r.count > 0 && r.pct >= indices.avgPctPerOption
  ).length;

  // Cumulative Pareto curve data (Rank 1..N adding up to 100%)
  const paretoPoints = useMemo(() => {
    let runningVotes = 0;
    return analytics.rows.map((row, idx) => {
      runningVotes += row.count;
      const cumPct =
        analytics.totalSelections > 0
          ? Math.round((runningVotes / analytics.totalSelections) * 1000) / 10
          : 0;
      return {
        rank: idx + 1,
        label: row.option.label,
        color: row.option.color || '#1D4E89',
        individualPct: row.pctRounded,
        cumPct,
      };
    });
  }, [analytics]);

  // Pairwise matchup rows for the Comparison Matrix Table
  const matchupComparisons = useMemo(() => {
    if (analytics.rows.length < 2 || analytics.totalSelections === 0) return [];
    const items: Array<{
      id: string;
      title: string;
      votesText: string;
      voteGap: number;
      pctSpread: number;
      ratioText: string;
      verdict: string;
    }> = [];

    const top1 = analytics.rows[0];
    const top2 = analytics.rows[1];
    const top3 = analytics.rows[2];

    const buildPair = (
      id: string,
      title: string,
      aVotes: number,
      aPct: number,
      bVotes: number,
      bPct: number,
      aName: string,
      bName: string
    ) => {
      const voteGap = aVotes - bVotes;
      const pctSpread = Math.round((aPct - bPct) * 10) / 10;
      const ratioText =
        bVotes > 0
          ? `${(aVotes / bVotes).toFixed(2)}x`
          : aVotes > 0
            ? tr('Kura zote', 'Uncontested')
            : '1.00x';
      const verdict =
        voteGap === 0
          ? tr('Wako sawa kabisa (Sare)', 'Exact dead heat')
          : voteGap > 0
            ? pctSpread >= 20
              ? tr(`${aName} ametawala kwa pengo kubwa`, `${aName} holds commanding lead`)
              : pctSpread <= 5
                ? tr(`Mchuano mkali sana kati ya ${aName} na ${bName}`, `Neck-and-neck margin`)
                : tr(`${aName} anaongoza dhidi ya ${bName}`, `${aName} ahead of ${bName}`)
            : tr(`${bName} yuko mbele kwa kura ${Math.abs(voteGap)}`, `${bName} leads by ${Math.abs(voteGap)}`);
      items.push({
        id,
        title,
        votesText: `${aVotes.toLocaleString()} vs ${bVotes.toLocaleString()}`,
        voteGap,
        pctSpread,
        ratioText,
        verdict,
      });
    };

    buildPair(
      '1v2',
      `#1 ${top1.option.label}  vs  #2 ${top2.option.label}`,
      top1.count,
      top1.pctRounded,
      top2.count,
      top2.pctRounded,
      top1.option.label,
      top2.option.label
    );

    if (top3) {
      buildPair(
        '1v3',
        `#1 ${top1.option.label}  vs  #3 ${top3.option.label}`,
        top1.count,
        top1.pctRounded,
        top3.count,
        top3.pctRounded,
        top1.option.label,
        top3.option.label
      );
      buildPair(
        '2v3',
        `#2 ${top2.option.label}  vs  #3 ${top3.option.label}`,
        top2.count,
        top2.pctRounded,
        top3.count,
        top3.pctRounded,
        top2.option.label,
        top3.option.label
      );
    }

    buildPair(
      '1vRest',
      tr(
        `#1 ${top1.option.label}  vs  Washindani Wengine Wote`,
        `#1 ${top1.option.label}  vs  Rest of Field Combined`
      ),
      top1.count,
      top1.pctRounded,
      indices.restOfFieldVotes,
      indices.restOfFieldPct,
      top1.option.label,
      tr('Wengine Wote', 'Rest of Field')
    );

    return items;
  }, [analytics.rows, analytics.totalSelections, indices.restOfFieldVotes, indices.restOfFieldPct, tr]);

  const compareLeft =
    analytics.rows.find((r) => r.option.id === compareLeftId) || analytics.rows[0] || null;
  const compareRight =
    analytics.rows.find((r) => r.option.id === compareRightId) ||
    analytics.rows[1] ||
    analytics.rows[0] ||
    null;

  // Written narrative sections grounded strictly in real tallies
  const narrativeInsights = useMemo(() => {
    if (analytics.totalSelections === 0 || !leaderRow) {
      return [];
    }
    const runner = analytics.runnerUp;
    const totalVoters = poll.totalBallots;
    const choicesPerVoter =
      totalVoters > 0 ? (analytics.totalSelections / totalVoters).toFixed(2) : '0';

    const sec1Title = isOpen
      ? tr('01. Hali ya Uongozi & Nguvu ya Kinara', '01. Leadership Standing & Strength')
      : tr('01. Hukumu Rasmi ya Mshindi', '01. Official Winner Verdict');

    const sec1Body = analytics.isTie
      ? tr(
          `Mpaka sasa kuna sare kileleni kati ya ${analytics.leaders
            .map((l) => l.option.label)
            .join(' na ')}, kila mmoja akiwa na kura ${analytics.topCount.toLocaleString()} (${
            leaderRow.pctRounded
          }% ya kura zote ${analytics.totalSelections.toLocaleString()}). Hakuna pengo lililowatenganisha bado.`,
          `There is currently a dead heat between ${analytics.leaders
            .map((l) => l.option.label)
            .join(' and ')} at ${analytics.topCount.toLocaleString()} votes each (${
            leaderRow.pctRounded
          }% of ${analytics.totalSelections.toLocaleString()} total votes).`
        )
      : tr(
          `${leaderRow.option.label} ${
            isOpen ? 'anaongoza' : 'ndiye mshindi rasmi'
          } akiwa na kura ${leaderRow.count.toLocaleString()} kati ya kura ${analytics.totalSelections.toLocaleString()} (${
            leaderRow.pctRounded
          }%). ${
            indices.decisiveMajority
              ? `Amefikia na kuvuka lengo la wingi kamili wa 50%+1 (kura ${indices.majorityTargetVotes.toLocaleString()}) kwa ziada ya kura ${indices.leaderSurplusOrDeficit.toLocaleString()}, akionyesha ridhaa ya wazi ya wapiga kura wengi.`
              : `Anaongoza kwa wingi wa kura (plurality), akihitaji kura ${Math.abs(
                  indices.leaderSurplusOrDeficit
                ).toLocaleString()} zaidi kufikisha wingi kamili wa nusu (50%+1).`
          }`,
          `${leaderRow.option.label} ${
            isOpen ? 'leads the race' : 'wins officially'
          } with ${leaderRow.count.toLocaleString()} out of ${analytics.totalSelections.toLocaleString()} votes (${
            leaderRow.pctRounded
          }%). ${
            indices.decisiveMajority
              ? `This clears the 50%+1 absolute majority threshold (${indices.majorityTargetVotes.toLocaleString()} votes) by +${indices.leaderSurplusOrDeficit.toLocaleString()}.`
              : `This is a plurality lead, sitting ${Math.abs(
                  indices.leaderSurplusOrDeficit
                ).toLocaleString()} votes shy of an absolute 50%+1 majority.`
          }`
        );

    const sec2Title = tr(
      '02. Ulinganisho wa Mchuano & Mgawanyo wa Kura',
      '02. Matchup Spread & Vote Dispersion'
    );
    const sec2Body = runner
      ? tr(
          `Mshindani wa karibu ni ${runner.option.label} mwenye kura ${runner.count.toLocaleString()} (${
            runner.pctRounded
          }%), akiwa nyuma kwa pengo la kura ${analytics.marginVotes.toLocaleString()} (tofauti ya asilimia ${
            analytics.marginPct
          }%). ${
            indices.leaderToRunnerUpRatio
              ? `Kinara amepata mara ${indices.leaderToRunnerUpRatio} ya kura za mfuasi wake. `
              : ''
          }Washindani wawili wa juu kwa pamoja wamekusanya ${indices.top2CombinedPct}% ya kura zote, na kipimo cha ushindani halisi (ENP) ni ${indices.effectiveCompetitors.toFixed(
            1
          )} kati ya machaguo ${analytics.rows.length}.`,
          `Runner-up ${runner.option.label} holds ${runner.count.toLocaleString()} votes (${
            runner.pctRounded
          }%), trailing by ${analytics.marginVotes.toLocaleString()} votes (${
            analytics.marginPct
          } percentage points). Top 2 contenders combine for ${indices.top2CombinedPct}% of all ballots with an Effective Number of Competitors (ENP) of ${indices.effectiveCompetitors.toFixed(
            1
          )} across ${analytics.rows.length} options.`
        )
      : tr(
          `Kuna chaguo moja tu lililopata kura kufikia sasa.`,
          `Only one option has recorded votes so far.`
        );

    const sec3Title = tr(
      '03. Kasi ya Ushiriki & Mwitikio wa Wapiga Kura',
      '03. Participation & Voting Velocity'
    );
    const sec3Body = tr(
      `Jumla ya wapiga kura ${totalVoters.toLocaleString()} waliohakikiwa wameshiriki ndani ya muda wa saa ${
        indices.elapsedHours < 1
          ? indices.elapsedHours.toFixed(1)
          : Math.round(indices.elapsedHours).toLocaleString()
      }, ikiwa ni wastani wa wapiga kura ${
        indices.votesPerHour ?? 0
      } kwa saa. Wastani wa kura kwa kila chaguo ni kura ${indices.avgVotesPerOption.toLocaleString()} (${
        indices.avgPctPerOption
      }%), huku chaguzi ${aboveAverageCount} zikivuka wastani huo.${
        poll.questionType === 'multiple'
          ? ` Kila mpiga kura amechagua wastani wa machaguo ${choicesPerVoter}.`
          : ''
      }`,
      `${totalVoters.toLocaleString()} verified voters participated over ${
        indices.elapsedHours < 1
          ? indices.elapsedHours.toFixed(1)
          : Math.round(indices.elapsedHours).toLocaleString()
      } hours (${indices.votesPerHour ?? 0} voters/hour). Average support per option is ${indices.avgVotesPerOption.toLocaleString()} votes (${
        indices.avgPctPerOption
      }%), with ${aboveAverageCount} option(s) outperforming the field average.${
        poll.questionType === 'multiple'
          ? ` Multi-select density averages ${choicesPerVoter} choices per voter.`
          : ''
      }`
    );

    const sec4Title = tr(
      '04. Hesabu ya Mabadiliko & Pengo la Ushindi',
      '04. Margin Gap & Field Comparison'
    );
    const sec4Body = !analytics.isTie && runner
      ? tr(
          `Washindani wengine wote nje ya kinara wamekusanya kura ${indices.restOfFieldVotes.toLocaleString()} (${
            indices.restOfFieldPct
          }%). ${
            leaderRow.count > indices.restOfFieldVotes
              ? `Hata kama kura zote za washindani wengine zingeunganishwa pamoja, bado ${leaderRow.option.label} angekuwa mbele kwa kura ${(
                  leaderRow.count - indices.restOfFieldVotes
                ).toLocaleString()}.`
              : `Ili ${runner.option.label} aweze kumpiku kinara bila kura mpya za kinara, angehitaji kuongeza kura ${(
                  analytics.marginVotes + 1
                ).toLocaleString()} zaidi ya alizonazo sasa.`
          }`,
          `All remaining contenders outside the leader total ${indices.restOfFieldVotes.toLocaleString()} votes (${
            indices.restOfFieldPct
          }%). ${
            leaderRow.count > indices.restOfFieldVotes
              ? `Even combining every other candidate together, ${leaderRow.option.label} still leads the entire field by ${(
                  leaderRow.count - indices.restOfFieldVotes
                ).toLocaleString()} votes.`
              : `To overtake the leader, ${runner.option.label} would need to gain ${(
                  analytics.marginVotes + 1
                ).toLocaleString()} net votes.`
          }`
        )
      : tr(
          `Mchuano huu bado una nafasi wazi ya kuamuliwa na kura zinazofuata.`,
          `The race remains tightly balanced across active contenders.`
        );

    return [
      { title: sec1Title, body: sec1Body },
      { title: sec2Title, body: sec2Body },
      { title: sec3Title, body: sec3Body },
      { title: sec4Title, body: sec4Body },
    ];
  }, [
    aboveAverageCount,
    analytics,
    indices,
    isOpen,
    leaderRow,
    poll.questionType,
    poll.totalBallots,
    tr,
  ]);

  return (
    <div className="space-y-4">
      {/* 1. Command Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 transition-colors"
              aria-label={tr('Rudi kwenye Mpoll', 'Back to Mpoll')}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span
                  className={`font-extrabold ${
                    isOpen ? 'text-emerald-700' : 'text-amber-700'
                  } inline-flex items-center gap-1`}
                >
                  <Radio size={12} />
                  {isOpen
                    ? tr('Moja kwa Moja · Kura Zinaendelea', 'Live · Counting')
                    : expired
                      ? tr('Rasmi · Muda Umeisha', 'Final · Closed by Clock')
                      : tr('Rasmi · Uchaguzi Umefungwa', 'Final · Certified')}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-[#1D4E89] inline-flex items-center gap-1">
                  {getStyleIcon(poll.pollStyle, 13)}
                  {tr(styleMeta.shortTagSw, styleMeta.shortTagEn)}
                </span>
                {poll.institutionName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700">{poll.institutionName}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{poll.category}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#0F172A] tracking-tight mt-1 leading-snug">
                {poll.question}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyOfficialBulletin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1D4E89]/30 bg-[#1D4E89]/5 hover:bg-[#1D4E89]/10 text-xs font-bold text-[#1D4E89] whitespace-nowrap shrink-0"
            >
              {copiedBulletin ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copiedBulletin
                ? tr('Tangazo Limenakiliwa', 'Bulletin Copied')
                : tr('Nakili Tangazo la Mshindi', 'Copy Winner Bulletin')}
            </button>
            {poll.allowShare && (
              <button
                type="button"
                onClick={handleCopyShort}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0"
              >
                {copiedShortUrl ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
                {copiedShortUrl ? tr('Link Imenakiliwa', 'Link Copied') : tr('Link Fupi', 'Short Link')}
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => exportPollResultsCsv(poll, tallies, ballots, lang)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet size={14} />
                  {tr('Pakua CSV', 'Export CSV')}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(poll)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0"
                >
                  <Edit3 size={14} />
                  {tr('Hariri', 'Edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-xs font-bold text-rose-700 whitespace-nowrap shrink-0"
                >
                  <Trash2 size={14} />
                  {tr('Futa', 'Delete')}
                </button>
              </>
            )}
          </div>
        </div>

        {poll.description && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
            {poll.description}
          </p>
        )}

        {confirmDelete && isAdmin && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-rose-900">
              {tr(
                'Una uhakika unataka kufuta Mpoll hii na kura zote?',
                'Are you sure you want to delete this poll and all its votes?'
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-md border border-rose-200 bg-white font-semibold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteInline(poll);
                  setDeleting(false);
                }}
                className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 font-bold text-white"
              >
                {deleting ? tr('Inafuta...', 'Deleting...') : tr('Thibitisha Futa', 'Confirm Delete')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Official Winner Declaration & Head-to-Head Hero Desk */}
      <div
        className={`rounded-2xl border p-4 sm:p-6 overflow-hidden relative ${
          analytics.topCount === 0
            ? 'bg-slate-50 border-slate-200'
            : analytics.isTie
              ? 'bg-gradient-to-br from-amber-50 via-amber-100/70 to-white border-amber-300'
              : 'bg-gradient-to-br from-[#071426] via-[#0F2747] to-[#1D4E89] border-[#1D4E89] text-white'
        }`}
      >
        {analytics.topCount === 0 ? (
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
              <Trophy size={22} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {tr('Hakuna Kura Zilizopigwa Bado', 'No Ballots Cast Yet')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr(
                  'Shiriki kiungo kifupi cha Mpoll ili uchambuzi kamili wa takwimu, michoro, majedwali na tangazo la mshindi vianze moja kwa moja.',
                  'Share the short Mpoll link to stream full statistical charts, comparison tables, and official winner declarations live.'
                )}
              </p>
            </div>
          </div>
        ) : analytics.isTie ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-amber-200/80 border border-amber-400 text-amber-900 flex items-center justify-center shrink-0">
                  <Scale size={24} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-amber-800">
                    {isOpen
                      ? tr('Sare ya Kura Kwa Sasa · Kura Zinapimana', 'Live Deadlock Tie')
                      : tr('Matokeo Rasmi · Sare Kileleni', 'Official Deadlock Result')}
                  </div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-amber-950 mt-0.5">
                    {analytics.leaders.map((l) => l.option.label).join(' & ')}
                  </h3>
                  <p className="text-xs font-semibold text-amber-900 mt-0.5 tabular-nums">
                    {tr(
                      `Kila mmoja ana kura ${analytics.topCount.toLocaleString()} (${analytics.leaders[0]?.pctRounded}% ya kura zote)`,
                      `Tied at ${analytics.topCount.toLocaleString()} votes each (${analytics.leaders[0]?.pctRounded}% of total)`
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : leaderRow ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {leaderRow.option.imageUrl ? (
                  <img
                    src={optimizeCloudinaryUrl(leaderRow.option.imageUrl, 320)}
                    alt={leaderRow.option.label}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover object-top border-2 border-amber-300 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-400/20 border border-amber-300/40 text-amber-300 flex items-center justify-center shrink-0">
                    <Crown size={30} />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-300">
                      <Trophy size={14} />
                      {isOpen
                        ? tr('Kinara wa Kura Kwa Sasa', 'Current Race Leader')
                        : tr('Tangazo Rasmi la Mshindi', 'Official Certified Winner')}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span
                      className={`font-bold ${
                        indices.decisiveMajority
                          ? 'text-emerald-300'
                          : indices.closeRace
                            ? 'text-amber-200'
                            : 'text-sky-200'
                      }`}
                    >
                      {indices.decisiveMajority
                        ? tr('Ushindi wa Kishindo (>50%)', 'Absolute Majority (>50%)')
                        : indices.closeRace
                          ? tr('Mchuano Mkali (<5% Pengo)', 'Tight Race (<5% Spread)')
                          : tr('Uongozi wa Wingi (Plurality)', 'Plurality Lead')}
                    </span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate mt-1">
                    {leaderRow.option.label}
                  </h3>
                  {leaderRow.option.subtitle && (
                    <p className="text-xs text-slate-200 mt-0.5 truncate">
                      {leaderRow.option.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 sm:gap-6 bg-white/10 border border-white/15 rounded-xl px-4 py-3 tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-300 font-semibold">
                    {tr('Kura Alizopata', 'Votes')}
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-white">
                    {leaderRow.count.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-300 font-semibold">
                    {tr('Asilimia', 'Vote Share')}
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-amber-300">
                    {leaderRow.pctRounded}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-300 font-semibold">
                    {tr('Pengo Juu ya #2', 'Lead Margin')}
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-emerald-300">
                    {analytics.runnerUp ? `+${analytics.marginVotes.toLocaleString()}` : '100%'}
                  </div>
                </div>
              </div>
            </div>

            {/* Head-to-Head #1 vs #2 Duel Meter */}
            {analytics.runnerUp && (
              <div className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                  <span className="text-white truncate">
                    #1 {leaderRow.option.label} · {leaderRow.pctRounded}% ({leaderRow.count.toLocaleString()})
                  </span>
                  <span className="text-emerald-300 tabular-nums">
                    {tr(
                      `Tofauti: +${analytics.marginVotes.toLocaleString()} kura (+${analytics.marginPct}%)`,
                      `Lead: +${analytics.marginVotes.toLocaleString()} votes (+${analytics.marginPct}%)`
                    )}
                  </span>
                  <span className="text-slate-200 truncate">
                    #2 {analytics.runnerUp.option.label} · {analytics.runnerUp.pctRounded}% (
                    {analytics.runnerUp.count.toLocaleString()})
                  </span>
                </div>
                {(() => {
                  const combined = leaderRow.count + analytics.runnerUp.count;
                  const leaderShareInDuel =
                    combined > 0 ? Math.round((leaderRow.count / combined) * 1000) / 10 : 50;
                  return (
                    <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-800 flex">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${leaderShareInDuel}%`,
                          backgroundColor: leaderRow.option.color || '#F59E0B',
                        }}
                      />
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${Math.max(0, 100 - leaderShareInDuel)}%`,
                          backgroundColor: analytics.runnerUp.option.color || '#64748B',
                        }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 3. 6-Card Statistical KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Wapiga Kura', 'Verified Voters')}
          </div>
          <div className="text-xl font-extrabold text-[#0F172A] mt-1">
            {poll.totalBallots.toLocaleString()}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Jumla ya Kura', 'Total Votes Cast')}
          </div>
          <div className="text-xl font-extrabold text-[#1D4E89] mt-1">
            {analytics.totalSelections.toLocaleString()}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Lengo la 50%+1', '50%+1 Majority')}
          </div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">
            {analytics.totalSelections > 0 ? indices.majorityTargetVotes.toLocaleString() : '—'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Pengo #1 vs #2', 'Lead Margin')}
          </div>
          <div className="text-xl font-extrabold text-amber-700 mt-1">
            {analytics.runnerUp
              ? `+${analytics.marginVotes.toLocaleString()}`
              : analytics.isTie
                ? tr('Sare', 'Tie')
                : '—'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Ushindani (ENP)', 'Competition (ENP)')}
          </div>
          <div className="text-xl font-extrabold text-violet-800 mt-1">
            {indices.effectiveCompetitors > 0 ? indices.effectiveCompetitors.toFixed(1) : '—'}
            <span className="text-[11px] font-semibold text-slate-400 ml-1">
              ({indices.top2CombinedPct}% Top2)
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 tabular-nums">
          <div className="text-[11px] font-semibold text-slate-500">
            {tr('Kasi ya Kura', 'Voting Rate')}
          </div>
          <div className="text-xl font-extrabold text-sky-800 mt-1">
            {indices.votesPerHour !== null ? `${indices.votesPerHour}/saa` : '0/saa'}
          </div>
        </div>
      </div>

      {/* 4. In-Depth Written Statistical Commentary (Uchambuzi wa Kina) */}
      {narrativeInsights.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A]">
                {tr(
                  'Uchambuzi wa Kina wa Kimaandishi na Takwimu',
                  'In-Depth Written Statistical Analysis'
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr(
                  'Tafsiri kamili ya kimaandishi inayoeleza nguvu ya mshindi, mgawanyo wa kura, ushindani, na mwenendo wa kura zote.',
                  'Comprehensive narrative breakdown of winner margin, dispersion, competition index, and turnout momentum.'
                )}
              </p>
            </div>
            <span className="text-xs font-bold text-[#1D4E89] tabular-nums">
              {tr(`Wastani kwa Chaguo: ${indices.avgPctPerOption}%`, `Field Average: ${indices.avgPctPerOption}%`)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {narrativeInsights.map((item) => (
              <div key={item.title} className="space-y-1">
                <h4 className="text-xs font-extrabold text-[#1D4E89]">{item.title}</h4>
                <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. 100-Unit Electorate Composition Matrix (100% Scale = 100 Blocks) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A]">
              {tr(
                'Mchoro wa Mgawanyo wa 100% ya Kura (Gridi ya Vitalu 100)',
                '100% Electorate Composition Matrix (100-Unit Visual Grid)'
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                'Kila kitalu kimoja kati ya 100 kinawakilisha asilimia 1% ya kura zote zilizopigwa — gusa jina au kitalu kuona uzito wake.',
                'Each of the 100 unit blocks equals 1% of verified votes — hover any contender or block to inspect share concentration.'
              )}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            {tr(
              `1 Kitalu = 1% · Lengo la Wingi = Vitalu 51+`,
              `1 Block = 1% · Majority Benchmark = 51+ Blocks`
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* 10x10 SVG/CSS Matrix + Continuous 100% Spectrum Bar */}
          <div className="lg:col-span-5 space-y-3">
            <div className="grid grid-cols-10 gap-1.5 max-w-[340px] mx-auto p-3 rounded-xl bg-slate-50 border border-slate-200">
              {waffleData.cells.map((cell) => {
                const isDimmed =
                  hoveredOptId !== null &&
                  cell.optionId !== '__empty__' &&
                  cell.optionId !== hoveredOptId;
                return (
                  <div
                    key={cell.index}
                    onMouseEnter={() => {
                      if (cell.optionId !== '__empty__') setHoveredOptId(cell.optionId);
                    }}
                    onMouseLeave={() => setHoveredOptId(null)}
                    className="aspect-square rounded-[4px] transition-opacity duration-150 cursor-pointer"
                    style={{
                      backgroundColor: cell.color,
                      opacity: isDimmed ? 0.22 : 1,
                    }}
                    title={
                      cell.label
                        ? `${cell.label} (${cell.pctRounded}%)`
                        : tr('Hakuna kura', 'No votes')
                    }
                  />
                );
              })}
            </div>

            {/* 100% Continuous Spectrum Stacked Bar with 50% Mark */}
            <div className="max-w-[340px] mx-auto space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 tabular-nums">
                <span>0%</span>
                <span className="text-[#0F172A]">50%</span>
                <span>100%</span>
              </div>
              <div className="relative h-3.5 w-full rounded-full bg-slate-100 overflow-hidden flex border border-slate-200">
                {analytics.rows
                  .filter((r) => r.count > 0)
                  .map((row) => (
                    <div
                      key={row.option.id}
                      onMouseEnter={() => setHoveredOptId(row.option.id)}
                      onMouseLeave={() => setHoveredOptId(null)}
                      style={{
                        width: `${row.pct}%`,
                        backgroundColor: row.option.color || '#1D4E89',
                        opacity: hoveredOptId && hoveredOptId !== row.option.id ? 0.3 : 1,
                      }}
                      className="h-full transition-opacity cursor-pointer"
                      title={`${row.option.label}: ${row.pctRounded}%`}
                    />
                  ))}
                <div
                  className="absolute inset-y-0 left-1/2 w-0.5 bg-[#0F172A] z-10 pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          {/* Contender Share & Benchmark Comparison Summary Cards */}
          <div className="lg:col-span-7 space-y-2">
            {analytics.rows.map((row) => {
              const isHovered = hoveredOptId === row.option.id;
              const blocks = waffleData.exactBlocksByOption[row.option.id] || 0;
              const beatsAvg = row.count > 0 && row.pct >= indices.avgPctPerOption;
              return (
                <div
                  key={row.option.id}
                  onMouseEnter={() => setHoveredOptId(row.option.id)}
                  onMouseLeave={() => setHoveredOptId(null)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors cursor-pointer ${
                    isHovered
                      ? 'border-[#1D4E89] bg-[#1D4E89]/[0.04]'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-7 rounded-full shrink-0"
                      style={{ backgroundColor: row.option.color || '#1D4E89' }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0F172A] truncate">
                        #{row.rank} · {row.option.label}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        <span>
                          {row.count === 0
                            ? tr('Hakuna kura bado', 'No votes yet')
                            : beatsAvg
                              ? tr(`Juu ya wastani (${indices.avgPctPerOption}%)`, `Above average (${indices.avgPctPerOption}%)`)
                              : tr(`Chini ya wastani (${indices.avgPctPerOption}%)`, `Below average (${indices.avgPctPerOption}%)`)}
                        </span>
                        {row.pct >= 50 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-emerald-700">
                              {tr('Wingi wa 50%+', '50%+ Majority')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 tabular-nums text-right">
                    <div>
                      <div className="text-xs font-extrabold text-[#0F172A]">
                        {row.count.toLocaleString()} {tr('kura', 'votes')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.gapFromLeader > 0
                          ? `-${row.gapFromLeader.toLocaleString()} ${tr('nyuma', 'behind')}`
                          : analytics.topCount > 0
                            ? tr('Kinara', 'Leader')
                            : '—'}
                      </div>
                    </div>
                    <div
                      className="min-w-[54px] px-2.5 py-1 rounded-lg text-center font-extrabold text-xs text-white"
                      style={{
                        backgroundColor: row.count > 0 ? row.option.color || '#1D4E89' : '#94A3B8',
                      }}
                    >
                      {row.pctRounded}% ({blocks})
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. Vertical Column Bar Chart + Interactive Donut Share Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Column Comparison Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <BarChart3 size={16} className="text-[#1D4E89]" />
                {tr('Chati ya Nguzo (Bar Chart ya Matokeo)', 'Vote Distribution Column Chart')}
              </h3>
              <p className="text-xs text-slate-500">
                {tr(
                  'Ulinganisho wa idadi na asilimia ya kura kwa kila mgombea au chaguo.',
                  'Side-by-side comparison of vote count and percentage share.'
                )}
              </p>
            </div>
            {userBallot && (
              <span className="text-xs font-bold text-emerald-700">
                ✓ {tr('Umeshiriki', 'You Voted')}
              </span>
            )}
          </div>

          <div className="relative pt-6 pb-2">
            <div className="relative h-56 flex items-end gap-2 sm:gap-3 border-b border-slate-200 px-1 sm:px-2">
              {[25, 50, 75, 100].map((mark) => (
                <div
                  key={mark}
                  className="absolute left-0 right-0 border-t border-dashed border-slate-200/80 pointer-events-none"
                  style={{ bottom: `${mark}%` }}
                >
                  <span className="text-[10px] font-medium text-slate-400 bg-white pr-1 -mt-2.5 inline-block tabular-nums">
                    {mark}%
                  </span>
                </div>
              ))}

              {analytics.rows.map((row) => {
                const maxPct = Math.max(10, ...analytics.rows.map((r) => r.pct));
                const barHeightPct =
                  analytics.totalSelections > 0
                    ? Math.max(4, Math.round((row.pct / Math.max(maxPct, 50)) * 100))
                    : 2;
                const color = row.option.color || '#1D4E89';
                const isHovered = hoveredOptId === row.option.id;

                return (
                  <div
                    key={row.option.id}
                    onMouseEnter={() => setHoveredOptId(row.option.id)}
                    onMouseLeave={() => setHoveredOptId(null)}
                    className="flex-1 min-w-0 h-full flex flex-col justify-end items-center relative z-10 group"
                  >
                    <div className="mb-1.5 text-center tabular-nums">
                      <div className="text-[11px] font-extrabold text-[#0F172A]">
                        {row.count.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {row.pctRounded}%
                      </div>
                    </div>

                    <div
                      className="w-full max-w-[54px] rounded-t-lg transition-all duration-500 relative overflow-hidden"
                      style={{
                        height: `${barHeightPct}%`,
                        backgroundColor: color,
                        opacity: hoveredOptId && !isHovered ? 0.5 : 1,
                      }}
                    >
                      {row.isLeader && analytics.topCount > 0 && (
                        <div className="absolute inset-x-0 top-0 h-1.5 bg-amber-300" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 sm:gap-3 px-1 sm:px-2 mt-2.5">
              {analytics.rows.map((row) => (
                <div
                  key={row.option.id}
                  className="flex-1 min-w-0 flex flex-col items-center text-center"
                >
                  {row.option.imageUrl ? (
                    <img
                      src={optimizeCloudinaryUrl(row.option.imageUrl, 120)}
                      alt={row.option.label}
                      className="w-7 h-7 rounded-full object-cover object-top border border-slate-200 mb-1"
                    />
                  ) : (
                    <span
                      className="w-3 h-3 rounded-full mb-1.5 mt-1"
                      style={{ backgroundColor: row.option.color || '#1D4E89' }}
                    />
                  )}
                  <span className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2 break-words">
                    {row.option.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SVG Donut Share Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <PieChart size={16} className="text-[#1D4E89]" />
              {tr('Mgawanyo wa Asilimia (Donut Chart)', 'Share Breakdown (Donut Chart)')}
            </h3>
            <p className="text-xs text-slate-500">
              {tr('Sehemu ya kura aliyopata kila mgombea.', 'Proportional vote share per option.')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
            <div className="relative w-44 h-44 shrink-0">
              <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="20"
                />
                {analytics.totalSelections > 0 &&
                  donutSegments.map((seg) => (
                    <circle
                      key={seg.id}
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={hoveredOptId === seg.id ? 24 : 20}
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      className="transition-all duration-300 cursor-pointer"
                      onMouseEnter={() => setHoveredOptId(seg.id)}
                      onMouseLeave={() => setHoveredOptId(null)}
                    />
                  ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none tabular-nums">
                <span className="text-2xl font-extrabold text-[#0F172A]">
                  {analytics.totalSelections.toLocaleString()}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {tr('Jumla Kura', 'Total Votes')}
                </span>
              </div>
            </div>

            <div className="w-full space-y-2">
              {analytics.rows.map((row) => (
                <div
                  key={row.option.id}
                  onMouseEnter={() => setHoveredOptId(row.option.id)}
                  onMouseLeave={() => setHoveredOptId(null)}
                  className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded-lg hover:bg-slate-50 tabular-nums"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: row.option.color || '#1D4E89' }}
                    />
                    <span className="font-semibold text-slate-800 truncate">{row.option.label}</span>
                  </div>
                  <div className="shrink-0 font-bold text-slate-700">
                    {row.count.toLocaleString()}{' '}
                    <span className="text-slate-400 font-semibold">({row.pctRounded}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7. Horizontal Benchmark Deviation Chart + Cumulative Pareto Concentration Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Horizontal Benchmark Chart with Average & 50% Lines */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              {tr(
                'Mchoro wa Ulinganisho Dhidi ya Wastani & Lengo la 50%',
                'Benchmark Comparison vs Field Average & 50% Line'
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {tr(
                `Mstari wa kijivu = Wastani (${indices.avgPctPerOption}%), Mstari mweusi = Wingi wa 50%.`,
                `Dashed gray = Field Avg (${indices.avgPctPerOption}%), Dark line = 50% Majority.`
              )}
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {analytics.rows.map((row) => {
              const color = row.option.color || '#1D4E89';
              const diffFromAvg = Math.round((row.pct - indices.avgPctPerOption) * 10) / 10;
              return (
                <div key={row.option.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="font-bold text-slate-800 truncate pr-2">
                      {row.rank}. {row.option.label}
                    </span>
                    <span className="font-semibold text-slate-600 shrink-0">
                      {row.pctRounded}%{' '}
                      <span
                        className={
                          diffFromAvg >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'
                        }
                      >
                        ({diffFromAvg >= 0 ? `+${diffFromAvg}` : diffFromAvg}% vs avg)
                      </span>
                    </span>
                  </div>
                  <div className="relative h-4 w-full rounded-md bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{
                        width: `${Math.min(100, row.pct)}%`,
                        backgroundColor: color,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 border-l-2 border-dashed border-slate-500/80 pointer-events-none"
                      style={{ left: `${Math.min(99, indices.avgPctPerOption)}%` }}
                      title={`${tr('Wastani', 'Average')}: ${indices.avgPctPerOption}%`}
                    />
                    <div
                      className="absolute inset-y-0 left-1/2 w-0.5 bg-[#0F172A]/80 pointer-events-none"
                      title="50%"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cumulative Pareto Concentration SVG Area/Line Chart */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              {tr(
                'Mchoro wa Mkusanyiko wa Kura (Cumulative Concentration)',
                'Cumulative Vote Concentration Curve'
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {tr(
                'Inaonyesha jinsi wagombea wa juu wanavyokusanya asilimia ya kura zote hadi kufikia 100%.',
                'Tracks how top-ranked options accumulate 100% of cast ballots.'
              )}
            </p>
          </div>

          {paretoPoints.length > 0 && (
            <div className="overflow-x-auto">
              <svg viewBox="0 0 440 185" className="w-full min-w-[320px] h-44 overflow-visible">
                {[25, 50, 75, 100].map((pctMark) => {
                  const y = 148 - (pctMark / 100) * 124;
                  return (
                    <g key={pctMark}>
                      <line x1="34" y1={y} x2="424" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                      <text x="28" y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px] tabular-nums">
                        {pctMark}%
                      </text>
                    </g>
                  );
                })}
                <line x1="34" y1="148" x2="424" y2="148" stroke="#CBD5E1" />
                {(() => {
                  const pts = paretoPoints.map((pt, idx) => {
                    const x =
                      paretoPoints.length === 1
                        ? 228
                        : 52 + (idx / (paretoPoints.length - 1)) * 354;
                    const y = 148 - (pt.cumPct / 100) * 124;
                    return { ...pt, x, y };
                  });
                  const linePath = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                  const areaPath =
                    pts.length >= 2
                      ? `M ${pts[0].x.toFixed(1)} 148 ` +
                        pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
                        ` L ${pts[pts.length - 1].x.toFixed(1)} 148 Z`
                      : '';
                  return (
                    <>
                      {areaPath && <path d={areaPath} fill="#1D4E89" opacity="0.10" />}
                      {pts.length >= 2 && (
                        <polyline
                          fill="none"
                          stroke="#1D4E89"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={linePath}
                        />
                      )}
                      {pts.map((p) => (
                        <g key={p.rank}>
                          <circle cx={p.x} cy={p.y} r="4.5" fill={p.color} stroke="#ffffff" strokeWidth="2">
                            <title>{`#${p.rank} ${p.label}: +${p.individualPct}% (${tr('Jumla', 'Cumulative')} ${p.cumPct}%)`}</title>
                          </circle>
                          <text
                            x={p.x}
                            y={Math.max(14, p.y - 9)}
                            textAnchor="middle"
                            className="fill-[#0F172A] text-[9px] font-bold tabular-nums"
                          >
                            {p.cumPct}%
                          </text>
                          <text
                            x={p.x}
                            y="165"
                            textAnchor="middle"
                            className="fill-slate-500 text-[9px] font-semibold tabular-nums"
                          >
                            #{p.rank}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* 8. OWNER TELEMETRY: Cumulative Vote Trajectory Multi-Line Chart + Hourly Surge */}
      {isAdmin && (cumulativeSeries || momentumBuckets.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {cumulativeSeries && (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Activity size={16} className="text-[#1D4E89]" />
                  {tr(
                    'Mbio za Kura Kadri Muda Ulivyoenda (Cumulative Race)',
                    'Cumulative Vote Trajectory (Top Contenders)'
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {tr(
                    'Ongezeko la jumla ya kura kwa wagombea wakuu tangu kura ya kwanza.',
                    'Cumulative lead evolution from the first ballot to the latest tally.'
                  )}
                </p>
              </div>

              <div className="overflow-x-auto">
                <svg viewBox="0 0 460 180" className="w-full min-w-[360px] h-44 overflow-visible">
                  {[0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = 150 - frac * 130;
                    const labelVal = Math.round(cumulativeSeries.maxY * frac);
                    return (
                      <g key={frac}>
                        <line
                          x1="34"
                          y1={y}
                          x2="446"
                          y2={y}
                          stroke="#E2E8F0"
                          strokeDasharray="3 3"
                        />
                        <text
                          x="28"
                          y={y + 3}
                          textAnchor="end"
                          className="fill-slate-400 text-[9px] tabular-nums"
                        >
                          {labelVal}
                        </text>
                      </g>
                    );
                  })}
                  <line x1="34" y1="150" x2="446" y2="150" stroke="#CBD5E1" />

                  {cumulativeSeries.trackedOptions.map((row) => {
                    const color = row.option.color || '#1D4E89';
                    const pts = cumulativeSeries.checkpoints.map((cp, idx) => {
                      const x =
                        cumulativeSeries.checkpoints.length === 1
                          ? 240
                          : 38 + (idx / (cumulativeSeries.checkpoints.length - 1)) * 404;
                      const val = cp.totalsByOption[row.option.id] || 0;
                      const y = 150 - (val / cumulativeSeries.maxY) * 130;
                      return { x, y, val, label: cp.label };
                    });
                    const polyPoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                    const lastPt = pts[pts.length - 1];

                    return (
                      <g
                        key={row.option.id}
                        opacity={hoveredOptId && hoveredOptId !== row.option.id ? 0.25 : 1}
                      >
                        <polyline
                          fill="none"
                          stroke={color}
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polyPoints}
                        />
                        {pts.map((p, pIdx) => (
                          <circle
                            key={pIdx}
                            cx={p.x}
                            cy={p.y}
                            r="3.2"
                            fill="#ffffff"
                            stroke={color}
                            strokeWidth="2"
                          >
                            <title>{`${row.option.label}: ${p.val} (${p.label})`}</title>
                          </circle>
                        ))}
                        {lastPt && (
                          <text
                            x={Math.min(444, lastPt.x + 6)}
                            y={lastPt.y + 3}
                            className="text-[10px] font-extrabold tabular-nums"
                            fill={color}
                          >
                            {lastPt.val}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <text x="38" y="168" className="fill-slate-400 text-[9px] tabular-nums">
                    {cumulativeSeries.checkpoints[0]?.label}
                  </text>
                  <text
                    x="442"
                    y="168"
                    textAnchor="end"
                    className="fill-slate-400 text-[9px] tabular-nums"
                  >
                    {cumulativeSeries.checkpoints[cumulativeSeries.checkpoints.length - 1]?.label}
                  </text>
                </svg>
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] pt-1">
                {cumulativeSeries.trackedOptions.map((row) => (
                  <span key={row.option.id} className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: row.option.color || '#1D4E89' }}
                    />
                    {row.option.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {momentumBuckets.length > 0 && (
            <div
              className={`${
                cumulativeSeries ? 'lg:col-span-5' : 'lg:col-span-12'
              } bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-700" />
                    {tr('Msukumo wa Kura Kwa Saa', 'Hourly Turnout Surge')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {tr('Vipindi vyenye kasi kubwa ya wapiga kura.', 'Peak ballot-casting windows.')}
                  </p>
                </div>
                {peakSurgeBucket && (
                  <span className="text-xs font-bold text-emerald-700 tabular-nums">
                    {tr(`Kilele: ${peakSurgeBucket.count} (${peakSurgeBucket.label})`, `Peak: ${peakSurgeBucket.count} (${peakSurgeBucket.label})`)}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[340px]">
                  <div className="h-36 flex items-end gap-1.5 border-b border-slate-200 pb-1">
                    {(() => {
                      const maxBucket = Math.max(1, ...momentumBuckets.map((b) => b.count));
                      return momentumBuckets.map((b) => {
                        const hPct = Math.max(10, Math.round((b.count / maxBucket) * 100));
                        const isPeak = peakSurgeBucket && b.label === peakSurgeBucket.label;
                        return (
                          <div
                            key={b.label}
                            className="flex-1 flex flex-col items-center justify-end h-full"
                          >
                            <span className="text-[10px] font-bold text-slate-600 mb-1 tabular-nums">
                              {b.count}
                            </span>
                            <div
                              className={`w-full max-w-[30px] rounded-t-md transition-colors ${
                                isPeak
                                  ? 'bg-[#1D4E89]'
                                  : 'bg-emerald-600/80 hover:bg-emerald-600'
                              }`}
                              style={{ height: `${hPct}%` }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {momentumBuckets.map((b) => (
                      <div
                        key={b.label}
                        className="flex-1 text-center text-[9px] text-slate-500 font-medium truncate tabular-nums"
                      >
                        {b.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 9. Interactive Head-to-Head Comparator + Comparative Matchup Matrix Table */}
      {analytics.rows.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-5">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A]">
              {tr('Ulinganisho wa Moja kwa Moja & Jedwali la Mchuano', 'Head-to-Head Comparator & Matchup Matrix')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                'Chagua wagombea au machaguo mawili yoyote kuyapima ana kwa ana, kisha kagua jedwali la ulinganisho wa mchuano.',
                'Compare any two contenders side by side and inspect full pairwise vote gaps.'
              )}
            </p>
          </div>

          {/* Interactive 1-on-1 Comparator */}
          {compareLeft && compareRight && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {tr('Upande A', 'Contender A')}
                  </label>
                  <select
                    value={compareLeft.option.id}
                    onChange={(e) => setCompareLeftId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                  >
                    {analytics.rows.map((r) => (
                      <option key={r.option.id} value={r.option.id}>
                        #{r.rank} {r.option.label} ({r.count.toLocaleString()} · {r.pctRounded}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {tr('Upande B', 'Contender B')}
                  </label>
                  <select
                    value={compareRight.option.id}
                    onChange={(e) => setCompareRightId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
                  >
                    {analytics.rows.map((r) => (
                      <option key={r.option.id} value={r.option.id}>
                        #{r.rank} {r.option.label} ({r.count.toLocaleString()} · {r.pctRounded}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(() => {
                const pairTotal = compareLeft.count + compareRight.count;
                const leftShare =
                  pairTotal > 0 ? Math.round((compareLeft.count / pairTotal) * 1000) / 10 : 50;
                const voteDiff = compareLeft.count - compareRight.count;
                const pctDiff = Math.round((compareLeft.pct - compareRight.pct) * 10) / 10;
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold tabular-nums">
                      <span className="text-[#0F172A]">
                        {compareLeft.option.label}: {compareLeft.count.toLocaleString()} ({compareLeft.pctRounded}%)
                      </span>
                      <span className="text-[#1D4E89]">
                        {compareLeft.option.id === compareRight.option.id
                          ? tr('Umechagua chaguo lilelile', 'Same option selected')
                          : voteDiff === 0
                            ? tr('Sare (Tofauti 0)', 'Exact Tie (0 diff)')
                            : voteDiff > 0
                              ? tr(
                                  `${compareLeft.option.label} mbele kwa +${voteDiff.toLocaleString()} (+${pctDiff}%)`,
                                  `${compareLeft.option.label} leads by +${voteDiff.toLocaleString()} (+${pctDiff}%)`
                                )
                              : tr(
                                  `${compareRight.option.label} mbele kwa +${Math.abs(voteDiff).toLocaleString()} (+${Math.abs(pctDiff)}%)`,
                                  `${compareRight.option.label} leads by +${Math.abs(voteDiff).toLocaleString()} (+${Math.abs(pctDiff)}%)`
                                )}
                      </span>
                      <span className="text-[#0F172A]">
                        {compareRight.option.label}: {compareRight.count.toLocaleString()} ({compareRight.pctRounded}%)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full overflow-hidden bg-slate-200 flex">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${leftShare}%`,
                          backgroundColor: compareLeft.option.color || '#1D4E89',
                        }}
                      />
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.max(0, 100 - leftShare)}%`,
                          backgroundColor: compareRight.option.color || '#64748B',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Matchup Matrix Table */}
          {matchupComparisons.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3">{tr('Ulinganisho (Matchup)', 'Comparison Pair')}</th>
                    <th className="py-2.5 px-3 text-right tabular-nums">{tr('Kura A vs B', 'Votes A vs B')}</th>
                    <th className="py-2.5 px-3 text-right tabular-nums">{tr('Pengo', 'Vote Gap')}</th>
                    <th className="py-2.5 px-3 text-right tabular-nums">{tr('Tofauti (%)', 'Spread (pp)')}</th>
                    <th className="py-2.5 px-3 text-right tabular-nums">{tr('Uwiano', 'Ratio')}</th>
                    <th className="py-2.5 px-3">{tr('Tafsiri ya Kiuchambuzi', 'Analytical Verdict')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchupComparisons.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-[#0F172A]">{m.title}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                        {m.votesText}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-[#1D4E89] tabular-nums whitespace-nowrap">
                        {m.voteGap > 0 ? `+${m.voteGap.toLocaleString()}` : m.voteGap.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-700 tabular-nums whitespace-nowrap">
                        {m.pctSpread > 0 ? `+${m.pctSpread}%` : `${m.pctSpread}%`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 tabular-nums whitespace-nowrap">
                        {m.ratioText}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{m.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 10. Comprehensive Ranked Performance Spreadsheet Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-extrabold text-[#0F172A]">
            {tr('Jedwali Kuu la Matokeo Kamili & Mchanganuo wa Nafasi', 'Complete Ranked Results & Margin Table')}
          </h3>
          {analytics.totalSelections > 0 && (
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {tr(
                `Lengo la Wingi wa 50%+1: kura ${indices.majorityTargetVotes.toLocaleString()} · Wastani: ${indices.avgPctPerOption}%`,
                `50%+1 Majority: ${indices.majorityTargetVotes.toLocaleString()} votes · Avg: ${indices.avgPctPerOption}%`
              )}
            </span>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2.5 px-3">{tr('Nafasi', 'Rank')}</th>
                <th className="py-2.5 px-3">{tr('Mgombea / Chaguo', 'Candidate / Option')}</th>
                <th className="py-2.5 px-3 text-right tabular-nums">{tr('Kura Halisi', 'Votes')}</th>
                <th className="py-2.5 px-3 text-right tabular-nums">{tr('Asilimia', 'Share')}</th>
                <th className="py-2.5 px-3 text-right tabular-nums">{tr('Tofauti na #1', 'Gap vs #1')}</th>
                <th className="py-2.5 px-3 text-right tabular-nums">{tr('Pengo na Chini', 'Lead Next')}</th>
                <th className="py-2.5 px-3">{tr('Hadhi', 'Standing')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.rows.map((row, idx) => {
                const isUserChoice = userBallot?.selectedOptionIds.includes(row.option.id);
                const nextRow = analytics.rows[idx + 1];
                const leadOverNext = nextRow ? row.count - nextRow.count : null;
                const statusLabel =
                  row.count === 0
                    ? tr('Bila Kura', 'No Votes')
                    : row.isLeader
                      ? analytics.isTie
                        ? tr('Sare Kileleni', 'Tied 1st')
                        : isOpen
                          ? tr('Anaongoza', 'Leading')
                          : tr('Mshindi Rasmi', 'Official Winner')
                      : row.pct >= indices.avgPctPerOption
                        ? tr('Juu ya Wastani', 'Above Avg')
                        : tr('Mshindani', 'Contender');

                return (
                  <tr
                    key={row.option.id}
                    className={row.isLeader && analytics.topCount > 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                  >
                    <td className="py-2.5 px-3 font-extrabold text-[#0F172A] tabular-nums">
                      #{row.rank}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5 min-w-[170px]">
                        {row.option.imageUrl ? (
                          <img
                            src={optimizeCloudinaryUrl(row.option.imageUrl, 120)}
                            alt={row.option.label}
                            className="w-8 h-8 rounded-lg object-cover object-top border border-slate-200 shrink-0"
                          />
                        ) : (
                          <span
                            className="w-2.5 h-6 rounded-full shrink-0"
                            style={{ backgroundColor: row.option.color || '#1D4E89' }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-[#0F172A] truncate">
                            {row.option.label}
                            {isUserChoice && (
                              <span className="ml-1.5 text-[11px] font-bold text-emerald-700">
                                ({tr('Kura yako', 'Yours')})
                              </span>
                            )}
                          </div>
                          {row.option.subtitle && (
                            <div className="text-[11px] text-slate-500 truncate">{row.option.subtitle}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-[#0F172A] tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-extrabold tabular-nums"
                      style={{ color: row.option.color || '#1D4E89' }}
                    >
                      {row.pctRounded}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-600 tabular-nums">
                      {row.gapFromLeader > 0 ? `-${row.gapFromLeader.toLocaleString()}` : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-600 tabular-nums">
                      {leadOverNext !== null ? `+${leadOverNext.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-700 whitespace-nowrap">
                      {row.isLeader && analytics.topCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <Trophy size={12} />
                          {statusLabel}
                        </span>
                      ) : (
                        statusLabel
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-extrabold text-[#0F172A] tabular-nums">
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3">{tr('Jumla Kuu ya Kura Zote', 'Grand Total')}</td>
                <td className="py-2.5 px-3 text-right">{analytics.totalSelections.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">{analytics.totalSelections > 0 ? '100.0%' : '0%'}</td>
                <td className="py-2.5 px-3 text-right">—</td>
                <td className="py-2.5 px-3 text-right">—</td>
                <td className="py-2.5 px-3 text-slate-600 font-semibold">
                  {poll.totalBallots.toLocaleString()} {tr('wapiga kura', 'voters')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 8. OWNER ONLY: Complete Voter Names + Choices Audit Directory */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-700" />
                {tr(
                  'Ukaguzi wa Mmiliki: Majina Kamili ya Wapiga Kura & Chaguo Lao',
                  'Owner Audit: Full Voter Names & Ballot Choices'
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {tr(
                  'Kama mmiliki wa Mpoll, unaona majina halisi ya kila akaunti iliyopiga kura, chaguo lake, na muda alipopiga.',
                  'As Mpoll owner, you see the verified name, chosen candidate/option, and timestamp for every ballot.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={loadBallots}
              disabled={loadingBallots}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700"
            >
              <RefreshCw size={13} className={loadingBallots ? 'animate-spin' : ''} />
              {tr('Onyesha Upya', 'Refresh')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={voterSearch}
                onChange={(e) => setVoterSearch(e.target.value)}
                placeholder={tr(
                  'Tafuta jina la mpiga kura au mgombea aliyemchagua...',
                  'Search voter name or chosen candidate...'
                )}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:bg-white"
              />
            </div>

            <select
              value={filterOptionId}
              onChange={(e) => setFilterOptionId(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
            >
              <option value="all">{tr('Machaguo Yote', 'All Choices')}</option>
              {poll.options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {loadingBallots ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {tr('Inapakia majina ya wapiga kura...', 'Loading verified voter list...')}
            </div>
          ) : filteredBallots.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              {tr(
                'Hakuna mpiga kura aliyepatikana kwa kichujio hiki.',
                'No matching ballots found.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {filteredBallots.map((b, i) => {
                const wasUpdated =
                  Boolean(b.createdAt && b.updatedAt) &&
                  b.updatedAt!.toMillis() - b.createdAt!.toMillis() > 2500;
                return (
                  <div
                    key={b.userId || i}
                    className="p-3 bg-white hover:bg-slate-50/80 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar photoURL={b.voterPhoto} name={b.voterName} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[#0F172A] truncate">
                            {b.voterName}
                          </span>
                          {wasUpdated && (
                            <span className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 text-[10px] font-bold">
                              {tr('Alibadilisha kura', 'Updated ballot')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {b.updatedAt
                            ? `${formatTime(b.updatedAt)} · ${b.updatedAt.toDate().toLocaleString()}`
                            : b.createdAt
                              ? `${formatTime(b.createdAt)} · ${b.createdAt.toDate().toLocaleString()}`
                              : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {b.selectedOptionIds.map((optId) => {
                        const opt = optionMap.get(optId);
                        return (
                          <span
                            key={optId}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: opt?.color || '#1D4E89' }}
                            />
                            {opt?.label || optId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// INDIVIDUAL POLL CARD (SUPPORTS ALL 6 STYLES + INLINE DELETE + GUEST PROMPT)
// ============================================================================
interface PollCardProps {
  poll: Poll;
  userBallot: PollBallot | undefined;
  onBallotSaved: (pollId: string, ballot: PollBallot) => void;
  user: User | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended: boolean;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (text: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: VotingPollsViewProps['onRequestConfirm'];
  onEdit: (poll: Poll) => void;
  onOpenResults: (pollId: string, tallies: Record<string, number>) => void;
  onDeleteInline: (poll: Poll) => Promise<void>;
  isHighlighted?: boolean;
}

const PollCard: React.FC<PollCardProps> = ({
  poll,
  userBallot,
  onBallotSaved,
  user,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended,
  onSignIn,
  onToast,
  onRequestConfirm,
  onEdit,
  onOpenResults,
  onDeleteInline,
  isHighlighted = false,
}) => {
  const { tr, lang, formatTime } = useLanguage();
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [draftSelection, setDraftSelection] = useState<string[]>(
    userBallot?.selectedOptionIds || []
  );
  const [submittingVote, setSubmittingVote] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [guestAttemptedVote, setGuestAttemptedVote] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isOpenOpinion = poll.questionType === 'open_opinion';
  const hasVoted = Boolean(userBallot && userBallot.selectedOptionIds.length > 0);
  const canSeeResults = !isOpenOpinion && canViewPollResults(poll, hasVoted, isAdmin);
  const isOpen = isPollEffectivelyOpen(poll);
  const expired = isPollExpired(poll);
  const canCastOrUpdate =
    !isOpenOpinion && isOpen && !isSuspended && (!hasVoted || poll.allowVoteChange);

  const styleMeta = POLL_STYLE_META[poll.pollStyle] || POLL_STYLE_META.standard;
  const shortUrl = buildPollShareUrl(poll.id);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen]);

  useEffect(() => {
    setDraftSelection(userBallot?.selectedOptionIds || []);
  }, [userBallot]);

  useEffect(() => {
    return subscribePollTallies(poll, canSeeResults, setTallies);
  }, [poll, canSeeResults]);

  const analytics = useMemo(() => buildRankedOptions(poll, tallies), [poll, tallies]);

  const isSelectionDirty = useMemo(() => {
    if (!hasVoted) return draftSelection.length > 0;
    const prev = [...(userBallot?.selectedOptionIds || [])].sort().join('|');
    const next = [...draftSelection].sort().join('|');
    return prev !== next && draftSelection.length > 0;
  }, [draftSelection, hasVoted, userBallot]);

  const handleToggleOption = (optionId: string) => {
    if (!user) {
      setGuestAttemptedVote(true);
      onSignIn('vote');
      return;
    }
    if (!canCastOrUpdate) return;

    if (poll.questionType === 'multiple') {
      setDraftSelection((prev) => {
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId);
        }
        if (prev.length >= poll.maxChoices) {
          onToast(
            tr(
              `Unaweza kuchagua hadi machaguo ${poll.maxChoices} pekee.`,
              `You can select up to ${poll.maxChoices} choices.`
            ),
            'error'
          );
          return prev;
        }
        return [...prev, optionId];
      });
    } else {
      setDraftSelection([optionId]);
    }
  };

  const handleSubmitVote = async () => {
    if (!user) {
      setGuestAttemptedVote(true);
      onSignIn('vote');
      return;
    }
    if (isSuspended) {
      onToast(tr('Akaunti yako imezuiwa kupiga kura.', 'Your account is suspended.'), 'error');
      return;
    }
    if (draftSelection.length === 0) {
      onToast(
        tr('Chagua jibu au mgombea mmoja kabla ya kuthibitisha.', 'Select an option before submitting.'),
        'error'
      );
      return;
    }

    setSubmittingVote(true);
    try {
      const savedBallot = await castOrUpdatePollVote(
        poll,
        user,
        userDisplayName,
        userPhoto,
        draftSelection,
        userBallot || null
      );
      onBallotSaved(poll.id, savedBallot);
      onToast(
        hasVoted
          ? tr('Kura yako imebadilishwa kikamilifu!', 'Your vote has been updated!')
          : tr('Asante! Kura yako imepokelewa kwa usalama.', 'Thank you! Your vote has been recorded.'),
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : tr('Imeshindwa kupiga kura.', 'Failed to vote.');
      onToast(msg, 'error');
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleCopyShortLink = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedId(true);
      onToast(tr('Kiungo kifupi kimenakiliwa!', 'Short link copied!'), 'success');
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      onToast(shortUrl);
    }
  };

  const handleToggleOpenClose = async () => {
    try {
      const nextStatus: PollStatus = poll.status === 'open' ? 'closed' : 'open';
      await updatePollStatus(poll.id, nextStatus);
      onToast(
        nextStatus === 'closed'
          ? tr('Mpoll imefungwa.', 'Mpoll closed.')
          : tr('Mpoll imefunguliwa tena.', 'Mpoll reopened.'),
        'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleTogglePin = async () => {
    try {
      await togglePollPin(poll.id, !poll.isPinned);
      onToast(
        !poll.isPinned ? tr('Mpoll imebandikwa juu.', 'Pinned to top.') : tr('Imebanduliwa.', 'Unpinned.'),
        'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const isWhatsAppStyle = poll.pollStyle === 'whatsapp';
  const isXStyle = poll.pollStyle === 'social_x';
  const isOpinionStyle = isOpenOpinion || poll.pollStyle === 'open_opinion';
  const isElection = !isOpenOpinion && isElectionStyle(poll.pollStyle);

  return (
    <article
      className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
        isHighlighted
          ? 'border-[#1D4E89] ring-2 ring-[#1D4E89]/15 shadow-sm'
          : isOpinionStyle
            ? 'border-violet-200 shadow-xs'
            : isWhatsAppStyle
              ? 'border-emerald-200 shadow-xs'
              : 'border-slate-200 shadow-xs hover:border-slate-300'
      }`}
    >
      {/* Top Civic / School / WhatsApp / Discussion Accent Strip */}
      {poll.pollStyle === 'local_govt' && (
        <div className="h-1.5 flex">
          <div className="flex-1 bg-[#1EB53A]" />
          <div className="w-8 bg-[#FCD116]" />
          <div className="w-12 bg-[#0F172A]" />
          <div className="w-8 bg-[#FCD116]" />
          <div className="flex-1 bg-[#00A3DD]" />
        </div>
      )}
      {poll.pollStyle === 'school_election' && <div className="h-1.5 bg-[#1D4E89]" />}
      {isWhatsAppStyle && <div className="h-1.5 bg-emerald-600" />}
      {isOpinionStyle && <div className="h-1.5 bg-violet-600" />}

      <div className="p-4 sm:p-5 space-y-4">
        {/* Card Header: Creator + Style + Institution + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar photoURL={poll.createdByPhoto} name={poll.createdByName} size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-bold text-[#0F172A] truncate">{poll.createdByName}</span>
                <AuthorVerificationBadge uid={poll.createdBy} size="xs" />
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">
                  {poll.createdAt ? formatTime(poll.createdAt) : tr('Sasa hivi', 'Just now')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                <span
                  className={`font-bold inline-flex items-center gap-1 ${
                    isOpinionStyle
                      ? 'text-violet-700'
                      : isWhatsAppStyle
                        ? 'text-emerald-700'
                        : 'text-[#1D4E89]'
                  }`}
                >
                  {getStyleIcon(poll.pollStyle, 12)}
                  {tr(styleMeta.shortTagSw, styleMeta.shortTagEn)}
                </span>
                {poll.institutionName && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-slate-700">{poll.institutionName}</span>
                  </>
                )}
                <span>·</span>
                <span>{poll.category}</span>
                {poll.isPinned && (
                  <>
                    <span>·</span>
                    <span className="font-bold text-amber-700 inline-flex items-center gap-0.5">
                      <Pin size={11} />
                      {tr('Imebandikwa', 'Pinned')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold">
            {poll.status === 'draft' ? (
              <span className="text-amber-700">{tr('Rasimu', 'Draft')}</span>
            ) : isOpen ? (
              <span className="text-emerald-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                {poll.hasDeadline && poll.endsAt
                  ? formatRemainingCountdown(poll.endsAt.toMillis(), tr)
                  : tr('Wazi', 'Open')}
              </span>
            ) : (
              <span className="text-slate-500 inline-flex items-center gap-1">
                <Lock size={12} />
                {expired ? tr('Imekwisha', 'Ended') : tr('Imefungwa', 'Closed')}
              </span>
            )}
          </div>
        </div>

        {/* Question & Description */}
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">
            {poll.question}
          </h3>
          {poll.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {poll.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-0.5">
            <span>
              {isOpenOpinion
                ? tr('Swali la Maoni Huru · Uwanja Mmoja wa Maoni', 'Open Discussion · Unified Comment Thread')
                : poll.questionType === 'multiple'
                  ? tr(`Chagua hadi ${poll.maxChoices}`, `Select up to ${poll.maxChoices}`)
                  : tr('Chaguo moja pekee', 'Single choice')}
            </span>
            {!isOpenOpinion && poll.anonymousMode && (
              <>
                <span>·</span>
                <span>{tr('Kura ya siri kwa umma', 'Anonymous publicly')}</span>
              </>
            )}
            {!isOpenOpinion && hasVoted && (
              <>
                <span>·</span>
                <span className="font-bold text-emerald-700">
                  ✓ {tr('Umeshapiga kura', 'Voted')}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Attached Photo Banner (clickable for fullscreen view) */}
        {poll.imageUrl && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900/[0.03] group relative focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/30"
            aria-label={tr('Kuza picha', 'Enlarge photo')}
          >
            <img
              src={optimizeCloudinaryUrl(poll.imageUrl, 1200)}
              alt={poll.question}
              className="w-full max-h-[420px] object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.01]"
            />
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/70 text-white text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageIcon size={12} />
              {tr('Bofya kukuza', 'Tap to zoom')}
            </span>
          </button>
        )}

        {/* Branch: Open Opinion Thread vs Voting Options */}
        {isOpenOpinion ? (
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 sm:p-4">
            <PollCommentsThread
              poll={poll}
              user={user}
              userDisplayName={userDisplayName}
              userPhoto={userPhoto}
              isAdmin={isAdmin}
              isSuspended={isSuspended}
              onSignIn={onSignIn}
              onToast={onToast}
              onRequestConfirm={onRequestConfirm}
            />
          </div>
        ) : (
          <>
            {/* Options / Candidates List tailored by Poll Style */}
            <div className={isElection ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : 'space-y-2'}>
          {poll.options.map((opt, idx) => {
            const count = tallies[opt.id] || 0;
            const pct =
              analytics.totalSelections > 0
                ? Math.round((count / analytics.totalSelections) * 1000) / 10
                : 0;
            const isSelected = draftSelection.includes(opt.id);
            const isSavedChoice = userBallot?.selectedOptionIds.includes(opt.id);
            const color =
              isWhatsAppStyle
                ? '#059669'
                : opt.color || OPTION_COLORS[idx % OPTION_COLORS.length];
            const isLeader = analytics.topCount > 0 && count === analytics.topCount;

            if (isElection || opt.imageUrl) {
              // CANDIDATE / PHOTO BALLOT CARD
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleOption(opt.id)}
                  disabled={user ? !canCastOrUpdate : false}
                  className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden ${
                    isSelected
                      ? 'border-[#1D4E89] bg-[#1D4E89]/[0.04] ring-1 ring-[#1D4E89]/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  } ${user && !canCastOrUpdate ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {canSeeResults && (
                    <div
                      className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: `${color}14`,
                      }}
                    />
                  )}

                  <div className="relative z-10 flex items-center gap-3">
                    {opt.imageUrl ? (
                      <img
                        src={optimizeCloudinaryUrl(opt.imageUrl, 220)}
                        alt={opt.label}
                        className="w-14 h-14 rounded-xl object-cover object-top border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center font-extrabold text-sm text-white shrink-0 tabular-nums"
                        style={{ backgroundColor: color }}
                      >
                        #{String(idx + 1).padStart(2, '0')}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#0F172A] truncate">
                          {opt.label}
                        </span>
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#1D4E89] border-[#1D4E89] text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                        </span>
                      </div>

                      {opt.subtitle && (
                        <p className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">
                          {opt.subtitle}
                        </p>
                      )}

                      {canSeeResults && (
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                          <span className="font-bold text-slate-700">
                            {count.toLocaleString()} {tr('kura', 'votes')}
                            {isLeader && (
                              <span className="text-amber-700 ml-1.5">
                                · {isOpen ? tr('Anaongoza', 'Leading') : tr('Mshindi', 'Winner')}
                              </span>
                            )}
                            {isSavedChoice && (
                              <span className="text-emerald-700 ml-1.5">· {tr('Yako', 'Yours')}</span>
                            )}
                          </span>
                          <span className="font-extrabold" style={{ color }}>
                            {pct}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            }

            // X / WHATSAPP / STANDARD ROW
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleToggleOption(opt.id)}
                disabled={user ? !canCastOrUpdate : false}
                className={`w-full text-left rounded-xl border transition-all relative overflow-hidden ${
                  isXStyle
                    ? isSelected
                      ? 'border-[#1D9BF0] bg-sky-50/40'
                      : 'border-slate-200 hover:bg-slate-50'
                    : isWhatsAppStyle
                      ? isSelected
                        ? 'border-emerald-500 bg-emerald-50/40'
                        : 'border-slate-200 hover:bg-emerald-50/20'
                      : isSelected
                        ? 'border-[#1D4E89] bg-[#1D4E89]/[0.04]'
                        : 'border-slate-200 hover:bg-slate-50/80'
                } ${user && !canCastOrUpdate ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {canSeeResults && (
                  <div
                    className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isXStyle
                        ? isLeader
                          ? 'rgba(29, 155, 240, 0.20)'
                          : 'rgba(148, 163, 184, 0.16)'
                        : isWhatsAppStyle
                          ? 'rgba(16, 185, 129, 0.18)'
                          : `${color}16`,
                    }}
                  />
                )}

                <div className="relative z-10 px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-5 h-5 ${
                        poll.questionType === 'multiple' ? 'rounded-md' : 'rounded-full'
                      } border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? isWhatsAppStyle
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : isXStyle
                              ? 'bg-[#1D9BF0] border-[#1D9BF0] text-white'
                              : 'bg-[#1D4E89] border-[#1D4E89] text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check size={12} />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#0F172A] truncate">
                        {opt.label}
                      </div>
                      {opt.subtitle && (
                        <div className="text-[11px] text-slate-500 truncate">{opt.subtitle}</div>
                      )}
                    </div>
                  </div>

                  {canSeeResults && (
                    <div className="shrink-0 text-right tabular-nums">
                      <span className="text-sm font-extrabold text-[#0F172A]">{pct}%</span>
                      <span className="text-[11px] text-slate-500 ml-1.5">
                        ({count.toLocaleString()})
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Guest Prompt OR Vote Submit Bar */}
        {!user ? (
          <div
            className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
              guestAttemptedVote || isHighlighted
                ? 'bg-amber-50 border-amber-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#0F172A]">
                {tr(
                  'Jisajili au Endelea na Google Ili Kupiga Kura',
                  'Sign Up or Continue with Google to Vote'
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                {tr(
                  'Unaweza kuona swali na wagombea wote hapa. Kupiga kura kunahitaji akaunti ili kulinda kura 1 kwa kila mtu.',
                  'You can view all poll details freely. Voting requires an account to enforce 1 secure ballot per voter.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSignIn('vote')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors shrink-0"
            >
              <UserCheck size={14} />
              {tr('Endelea na Google / Jisajili', 'Continue with Google / Sign Up')}
            </button>
          </div>
        ) : (
          isOpen &&
          (!hasVoted || poll.allowVoteChange) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-xs text-slate-500">
                {draftSelection.length > 0
                  ? tr(
                      `Umechagua ${draftSelection.length} — bofya thibitisha kukamilisha kura.`,
                      `Selected ${draftSelection.length} — click confirm to submit.`
                    )
                  : tr('Gusa chaguo hapo juu kupiga kura.', 'Tap an option above to vote.')}
              </div>

              <button
                type="button"
                disabled={submittingVote || !isSelectionDirty}
                onClick={handleSubmitVote}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                <Vote size={14} />
                {submittingVote
                  ? tr('Inatuma...', 'Submitting...')
                  : hasVoted
                    ? tr('Sasisha Kura Yangu', 'Update My Vote')
                    : tr('Piga Kura Sasa', 'Cast Vote Now')}
              </button>
            </div>
          )
        )}

        {/* Hidden results notice if restricted */}
        {!canSeeResults && (
          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <EyeOff size={13} className="shrink-0" />
            <span>
              {poll.resultsVisibility === 'after_vote'
                ? tr(
                    'Matokeo na chati zitaonekana mara tu utakapopiga kura yako.',
                    'Results and charts unlock right after you cast your vote.'
                  )
                : poll.resultsVisibility === 'after_close'
                  ? tr(
                      'Matokeo rasmi yatatolewa kura hii ikifungwa.',
                      'Official results will be revealed when this poll closes.'
                    )
                  : tr(
                      'Matokeo ya kura hii yamewekwa siri kwa mmiliki pekee.',
                      'Results are visible to the poll owner only.'
                    )}
            </span>
          </div>
        )}
          </>
        )}

        {/* Card Footer: Short Link + Analytics Button / Comments Count + Share + Owner Inline Controls */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 tabular-nums">
            {isOpenOpinion ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-violet-800">
                <MessageSquare size={13} className="text-violet-600" />
                {(poll.commentsCount || 0).toLocaleString()} {tr('maoni', 'comments')}
              </span>
            ) : (
              <>
                {(poll.showVoterCount || isAdmin) && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Users size={13} className="text-slate-400" />
                    {poll.totalBallots.toLocaleString()} {tr('wapiga kura', 'voters')}
                  </span>
                )}

                {canSeeResults && (
                  <button
                    type="button"
                    onClick={() => onOpenResults(poll.id, tallies)}
                    className="inline-flex items-center gap-1.5 font-bold text-[#1D4E89] hover:underline"
                  >
                    <BarChart3 size={14} />
                    {isAdmin
                      ? tr('Matokeo, Chati & Majina ya Wapiga Kura', 'Results, Charts & Voter Names')
                      : tr('Tazama Matokeo & Chati', 'View Results & Charts')}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {poll.allowShare && (
              <>
                <button
                  type="button"
                  onClick={handleCopyShortLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700"
                  title={shortUrl}
                >
                  {copiedId ? (
                    <Check size={12} className="text-emerald-600" />
                  ) : (
                    <Link2 size={12} />
                  )}
                  {tr('Link Fupi', 'Short Link')}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `${poll.question}\n${
                      isOpenOpinion
                        ? tr('Toa maoni yako kwenye Mpoll:', 'Join the discussion on Mpoll:')
                        : tr('Piga kura yako kwenye Mpoll:', 'Vote on Mpoll:')
                    }\n${shortUrl}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800"
                >
                  <MessageCircle size={12} />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => sharePoll(poll, (m) => onToast(m, 'success'), lang)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700"
                >
                  <Share2 size={12} />
                  {tr('Shiriki', 'Share')}
                </button>
              </>
            )}

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleTogglePin}
                  className={`p-1.5 rounded-lg border text-xs transition-colors ${
                    poll.isPinned
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title={poll.isPinned ? tr('Bandua', 'Unpin') : tr('Bandika juu', 'Pin to top')}
                >
                  <Pin size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleToggleOpenClose}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  title={
                    poll.status === 'open'
                      ? tr('Funga kura', 'Close poll')
                      : tr('Fungua kura', 'Open poll')
                  }
                >
                  {poll.status === 'open' ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(poll)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  title={tr('Hariri Mpoll', 'Edit Mpoll')}
                >
                  <Edit3 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen((v) => !v)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-500"
                  title={tr('Futa Mpoll', 'Delete Mpoll')}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Short Link URL Strip (clean, copy-ready) */}
        {poll.allowShare && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500">
            <span className="truncate font-mono">{shortUrl}</span>
            <button
              type="button"
              onClick={handleCopyShortLink}
              className="font-bold text-[#1D4E89] hover:underline shrink-0"
            >
              {copiedId ? tr('Imenakiliwa!', 'Copied!') : tr('Nakili', 'Copy')}
            </button>
          </div>
        )}

        {/* Inline Delete Confirmation (NO POPUP) */}
        {isAdmin && confirmDeleteOpen && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-rose-900">
              {isOpenOpinion
                ? tr('Futa Mpoll hii ya maoni na mijadala yake yote?', 'Delete this discussion Mpoll and all comments?')
                : tr('Futa Mpoll hii na kura zake zote?', 'Delete this Mpoll and all ballots?')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-2.5 py-1 rounded-md border border-rose-200 bg-white font-semibold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteInline(poll);
                  setDeleting(false);
                  setConfirmDeleteOpen(false);
                }}
                className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-700 font-bold text-white"
              >
                {deleting ? tr('Inafuta...', 'Deleting...') : tr('Thibitisha Futa', 'Confirm Delete')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Photo Lightbox Portal */}
      {lightboxOpen &&
        poll.imageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[140] bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label={tr('Funga picha', 'Close image')}
            >
              <X size={20} />
            </button>
            <img
              src={optimizeCloudinaryUrl(poll.imageUrl, 1800)}
              alt={poll.question}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[88vh] object-contain rounded-xl shadow-2xl"
            />
          </div>,
          document.body
        )}
    </article>
  );
};

// ============================================================================
// MAIN MPOLL HUB (ZERO MODALS: LIST / BUILDER / RESULTS INLINE VIEWS)
// ============================================================================
export const VotingPollsView: React.FC<VotingPollsViewProps> = ({
  polls,
  loading,
  userBallots,
  onBallotSaved,
  user,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended,
  selectedPollId,
  onClearSelectedPoll,
  onBack,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr } = useLanguage();
  const [viewMode, setViewMode] = useState<'list' | 'builder' | 'results'>('list');
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
  const [resultsPollId, setResultsPollId] = useState<string | null>(null);
  const [resultsTallies, setResultsTallies] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'voted'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deepLinkPoll, setDeepLinkPoll] = useState<Poll | null>(null);
  const [loadingDeepLink, setLoadingDeepLink] = useState(false);

  // Fallback fetch when someone opens a short share link `/?p=<id>` that isn't in initial list
  useEffect(() => {
    if (!selectedPollId) {
      setDeepLinkPoll(null);
      return;
    }
    const existing = polls.find((p) => p.id === selectedPollId);
    if (existing) {
      setDeepLinkPoll(existing);
      return;
    }
    let active = true;
    setLoadingDeepLink(true);
    fetchPollById(selectedPollId)
      .then((found) => {
        if (active) setDeepLinkPoll(found);
      })
      .catch(() => {
        if (active) setDeepLinkPoll(null);
      })
      .finally(() => {
        if (active) setLoadingDeepLink(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPollId, polls]);

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openBuilderForNew = () => {
    setEditingPoll(null);
    setViewMode('builder');
    scrollToTop();
  };

  const openBuilderForEdit = (poll: Poll) => {
    setEditingPoll(poll);
    setViewMode('builder');
    scrollToTop();
  };

  const openResultsView = (pollId: string, initialTallies: Record<string, number>) => {
    setResultsPollId(pollId);
    setResultsTallies(initialTallies);
    setViewMode('results');
    scrollToTop();
  };

  // Keep live tallies updated while on the inline Results Analytics page
  const activeResultsPoll = useMemo(() => {
    if (!resultsPollId) return null;
    return (
      polls.find((p) => p.id === resultsPollId) ||
      (deepLinkPoll?.id === resultsPollId ? deepLinkPoll : null)
    );
  }, [polls, deepLinkPoll, resultsPollId]);

  useEffect(() => {
    if (viewMode !== 'results' || !activeResultsPoll) return;
    const hasVoted = Boolean(userBallots[activeResultsPoll.id]?.selectedOptionIds?.length);
    const allowed = canViewPollResults(activeResultsPoll, hasVoted, isAdmin);
    return subscribePollTallies(activeResultsPoll, allowed, setResultsTallies);
  }, [viewMode, activeResultsPoll, userBallots, isAdmin]);

  const handleDeletePollInline = async (poll: Poll) => {
    try {
      await deletePoll(poll);
      onToast(tr('Mpoll imefutwa.', 'Mpoll deleted.'), 'success');
      if (resultsPollId === poll.id) {
        setResultsPollId(null);
        setViewMode('list');
      }
      if (selectedPollId === poll.id) {
        onClearSelectedPoll?.();
      }
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kufuta Mpoll.', 'Failed to delete.'),
        'error'
      );
    }
  };

  const combinedPolls = useMemo(() => {
    if (!deepLinkPoll) return polls;
    if (polls.some((p) => p.id === deepLinkPoll.id)) return polls;
    return [deepLinkPoll, ...polls];
  }, [polls, deepLinkPoll]);

  const filteredPolls = useMemo(() => {
    if (selectedPollId) {
      return combinedPolls.filter((p) => p.id === selectedPollId);
    }
    const q = searchQuery.trim().toLowerCase();
    return combinedPolls.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      const openNow = isPollEffectivelyOpen(p);
      if (statusFilter === 'open' && !openNow) return false;
      if (statusFilter === 'closed' && openNow) return false;
      if (statusFilter === 'voted' && !userBallots[p.id]) return false;
      if (!q) return true;
      return (
        p.question.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.institutionName.toLowerCase().includes(q) ||
        p.options.some(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.subtitle && o.subtitle.toLowerCase().includes(q))
        )
      );
    });
  }, [combinedPolls, selectedPollId, searchQuery, categoryFilter, statusFilter, userBallots]);

  const openCount = useMemo(
    () => polls.filter((p) => isPollEffectivelyOpen(p)).length,
    [polls]
  );
  const totalParticipations = useMemo(
    () => polls.reduce((sum, p) => sum + (p.totalBallots || 0), 0),
    [polls]
  );

  // SUB-VIEW 1: INLINE MPOLL BUILDER (ZERO POPUPS)
  if (viewMode === 'builder' && isAdmin && user) {
    return (
      <div className="max-w-4xl mx-auto">
        <InlinePollBuilder
          editingPoll={editingPoll}
          user={user}
          userDisplayName={userDisplayName}
          userPhoto={userPhoto}
          onCancel={() => {
            setEditingPoll(null);
            setViewMode('list');
            scrollToTop();
          }}
          onSaved={() => {
            setEditingPoll(null);
            setViewMode('list');
            scrollToTop();
          }}
          onToast={onToast}
        />
      </div>
    );
  }

  // SUB-VIEW 2: INLINE RESULTS & PROFESSIONAL ANALYTICS PAGE (ZERO POPUPS)
  if (viewMode === 'results' && activeResultsPoll) {
    return (
      <div className="max-w-5xl mx-auto">
        <InlinePollResultsPage
          poll={activeResultsPoll}
          tallies={resultsTallies}
          isAdmin={isAdmin}
          userBallot={userBallots[activeResultsPoll.id]}
          onBack={() => {
            setViewMode('list');
            scrollToTop();
          }}
          onEdit={(p) => openBuilderForEdit(p)}
          onDeleteInline={handleDeletePollInline}
          onToast={onToast}
        />
      </div>
    );
  }

  // SUB-VIEW 3: MAIN MPOLL FEED
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center shrink-0"
                aria-label={tr('Rudi', 'Back')}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#1D4E89] text-white flex items-center justify-center">
                  <Vote size={17} />
                </span>
                <div>
                  <h1 className="text-lg sm:text-xl font-extrabold text-[#0F172A] tracking-tight leading-none">
                    Mpoll
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {tr(
                      'Kura za Wagombea, Shule, Serikali za Mitaa, X, WhatsApp & Mjadala wa Maoni Huru.',
                      'Candidate, School, Local Govt, X, WhatsApp Polls & Open Opinion Discussions.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openBuilderForNew}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1D4E89] hover:bg-[#163d6c] text-white text-xs font-bold transition-colors shadow-xs"
            >
              <Plus size={16} />
              {tr('Tengeneza Mpoll Mpya', 'Create New Mpoll')}
            </button>
          )}
        </div>

        {/* Clean Metrics Line (no pill bloat) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100 tabular-nums">
          <span>
            <strong className="text-[#0F172A]">{polls.length}</strong>{' '}
            {tr('kura zote', 'total polls')}
          </span>
          <span className="text-slate-300">·</span>
          <span>
            <strong className="text-emerald-700">{openCount}</strong>{' '}
            {tr('zipo wazi sasa', 'open now')}
          </span>
          <span className="text-slate-300">·</span>
          <span>
            <strong className="text-[#1D4E89]">{totalParticipations.toLocaleString()}</strong>{' '}
            {tr('ushiriki wa wapiga kura', 'total ballots cast')}
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <ShieldCheck size={13} className="text-emerald-600" />
            {tr('Akaunti 1 = Kura 1', '1 Account = 1 Vote')}
          </span>
        </div>
      </div>

      {/* Shared Deep-Link Focus Strip */}
      {selectedPollId && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#1D4E89]">
            <ExternalLink size={15} />
            {tr(
              'Umefungua kiungo kifupi cha Mpoll hii moja kwa moja.',
              'Viewing shared Mpoll direct link.'
            )}
          </div>
          {onClearSelectedPoll && (
            <button
              type="button"
              onClick={onClearSelectedPoll}
              className="px-3 py-1.5 rounded-lg bg-white border border-sky-200 font-bold text-[#1D4E89] hover:bg-sky-100/50"
            >
              {tr('Onyesha Mpoll Zote', 'Show All Mpolls')}
            </button>
          )}
        </div>
      )}

      {/* Search & Filters (when not locked to single shared link) */}
      {!selectedPollId && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2.5 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-6 relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr(
                  'Tafuta swali, mgombea, shule, au mtaa...',
                  'Search question, candidate, school, or ward...'
                )}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'open' | 'closed' | 'voted')
                }
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
              >
                <option value="all">{tr('Hali Zote', 'All Statuses')}</option>
                <option value="open">{tr('Zipo Wazi Sasa', 'Open Now')}</option>
                <option value="closed">{tr('Zilizofungwa', 'Closed / Ended')}</option>
                {user && <option value="voted">{tr('Nilizopiga Kura', 'Voted by Me')}</option>}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/25"
              >
                <option value="all">{tr('Kategoria Zote', 'All Categories')}</option>
                {POLL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Polls Feed */}
      {loading || loadingDeepLink ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs font-semibold text-slate-500">
          {tr('Inapakia Mpoll...', 'Loading Mpolls...')}
        </div>
      ) : filteredPolls.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Vote size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0F172A]">
              {selectedPollId
                ? tr('Mpoll hii haikupatikana.', 'This Mpoll could not be found.')
                : tr('Hakuna Mpoll zilizopatikana.', 'No Mpolls found.')}
            </h3>
            <p className="text-xs text-slate-500">
              {isAdmin && !selectedPollId
                ? tr(
                    'Bofya "Tengeneza Mpoll Mpya" kuanzisha kura au uchaguzi.',
                    'Click "Create New Mpoll" to launch your first poll or election.'
                  )
                : tr('Jaribu kubadili utafutaji au vichujio.', 'Try adjusting your search or filters.')}
            </p>
          </div>
          {isAdmin && !selectedPollId && (
            <button
              type="button"
              onClick={openBuilderForNew}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4E89] text-white text-xs font-bold"
            >
              <Plus size={14} />
              {tr('Tengeneza Mpoll Mpya', 'Create New Mpoll')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPolls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              userBallot={userBallots[poll.id]}
              onBallotSaved={onBallotSaved}
              user={user}
              userDisplayName={userDisplayName}
              userPhoto={userPhoto}
              isAdmin={isAdmin}
              isSuspended={isSuspended}
              onSignIn={onSignIn}
              onToast={onToast}
              onRequestConfirm={onRequestConfirm}
              onEdit={openBuilderForEdit}
              onOpenResults={openResultsView}
              onDeleteInline={handleDeletePollInline}
              isHighlighted={selectedPollId === poll.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};
