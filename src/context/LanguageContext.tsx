import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  PrimaryBoard,
  ReportReason,
  VERIFICATION_BADGE_META,
  VerificationBadgeType,
} from '../types';

export type AppLanguage = 'sw' | 'en';

const STORAGE_KEY = 'malosha_forums_lang_v2';

interface LanguageContextValue {
  lang: AppLanguage;
  isEn: boolean;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  tr: (sw: string, en: string) => string;
  formatTime: (ts: Timestamp | null | undefined) => string;
  getBoardLabel: (board: PrimaryBoard) => string;
  getBoardDescription: (board: PrimaryBoard) => string;
  getJobTypeLabel: (jobType: string) => string;
  getMakalaSectionLabel: (section: string) => string;
  getMakalaCoverLabel: (label: string) => string;
  getReportReasonLabel: (reason: ReportReason) => string;
  getBadgeLabel: (badge: VerificationBadgeType, short?: boolean) => string;
  getBadgeDescription: (badge: VerificationBadgeType) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const JOB_TYPE_EN: Record<string, string> = {
  'Ajira Kamili': 'Full-Time Job',
  'Mafunzo (Internship)': 'Internship',
  'Kazi za Muda': 'Part-Time / Gig',
  'Ufadhili & Ruzuku': 'Grants & Fellowships',
};

const MAKALA_SECTION_EN: Record<string, string> = {
  Habari: 'News',
  Uchumi: 'Economy',
  Teknolojia: 'Technology',
  Jamii: 'Society',
  Kilimo: 'Agriculture',
  Michezo: 'Sports',
  Elimu: 'Education',
  Afya: 'Health',
};

const MAKALA_COVER_EN: Record<string, string> = {
  'Teknolojia & Ubunifu': 'Tech & Innovation',
  'Kilimo cha Kisasa': 'Modern Agriculture',
  'Nishati Jadidifu': 'Renewable Energy',
  'Elimu & Vijana': 'Education & Youth',
};

const REPORT_REASON_EN: Record<ReportReason, string> = {
  spam: 'Spam or Promotional Content',
  harassment: 'Harassment or Abusive Language',
  misinformation: 'Misinformation or False Claims',
  unlawful: 'Unlawful or Unsafe Content',
  other: 'Other Reason',
};

const BADGE_EN: Record<
  VerificationBadgeType,
  { label: string; shortLabel: string; description: string }
> = {
  none: {
    label: 'Standard Account',
    shortLabel: 'No Badge',
    description: 'Standard Malosha Forums member',
  },
  individual: {
    label: 'Verified Individual',
    shortLabel: 'Individual',
    description: 'Verified individual member or public figure',
  },
  organization: {
    label: 'Verified Organization / Company',
    shortLabel: 'Organization',
    description: 'Verified company, NGO, private institution, or media outlet',
  },
  government: {
    label: 'Government Institution',
    shortLabel: 'Government',
    description: 'Official ministry, council, agency, or government department',
  },
  owner: {
    label: 'Platform Owner',
    shortLabel: 'Owner',
    description: 'Official founder and owner of Malosha Forums',
  },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    if (typeof window === 'undefined') return 'sw';
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === 'en' ? 'en' : 'sw';
    } catch {
      return 'sw';
    }
  });

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'sw' ? 'en' : 'sw');
  }, [lang, setLang]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.title =
      lang === 'en'
        ? 'Malosha Forums — Community Discussions'
        : 'Malosha Forums — Jukwaa la Mijadala';
  }, [lang]);

  const isEn = lang === 'en';

  const tr = useCallback((sw: string, en: string) => (lang === 'en' ? en : sw), [lang]);

  const formatTime = useCallback(
    (ts: Timestamp | null | undefined): string => {
      if (!ts) return lang === 'en' ? 'Just now' : 'Sasa hivi';
      const date = ts.toDate();
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));

      if (diffSec < 45) return lang === 'en' ? 'Just now' : 'Sasa hivi';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) {
        if (lang === 'en') {
          return diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
        }
        return diffMin === 1 ? 'Dakika 1 iliyopita' : `Dakika ${diffMin} zilizopita`;
      }
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) {
        if (lang === 'en') {
          return diffHours === 1 ? '1 hr ago' : `${diffHours} hrs ago`;
        }
        return diffHours === 1 ? 'Saa 1 iliyopita' : `Saa ${diffHours} zilizopita`;
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) {
        if (lang === 'en') {
          return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
        }
        return diffDays === 1 ? 'Jana' : `Siku ${diffDays} zilizopita`;
      }

      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    },
    [lang]
  );

  const getBoardLabel = useCallback(
    (board: PrimaryBoard) => {
      if (lang === 'sw') return board;
      if (board === 'Fursa') return 'Opportunities';
      if (board === 'Makala') return 'Articles';
      return 'Kijiweni';
    },
    [lang]
  );

  const getBoardDescription = useCallback(
    (board: PrimaryBoard) => {
      if (lang === 'en') {
        if (board === 'Fursa') {
          return 'Youth job listings, internships, fellowships, and grant opportunities.';
        }
        if (board === 'Makala') {
          return 'In-depth journalism, newsroom reports, and community analysis.';
        }
        return 'Share thoughts, casual conversations, likes, comments, and connect with friends.';
      }
      if (board === 'Fursa') {
        return 'Matangazo ya ajira mbalimbali za vijana, mafunzo kwa vitendo, na ufadhili.';
      }
      if (board === 'Makala') {
        return 'Makala za kina na uchambuzi wa habari kwa mtindo wa uandishi wa habari.';
      }
      return 'Chapisha mawazo, gumzo huru, penda (like), toa maoni, na ushiriki na marafiki.';
    },
    [lang]
  );

  const getJobTypeLabel = useCallback(
    (jobType: string) => (lang === 'en' ? JOB_TYPE_EN[jobType] || jobType : jobType),
    [lang]
  );

  const getMakalaSectionLabel = useCallback(
    (section: string) => (lang === 'en' ? MAKALA_SECTION_EN[section] || section : section),
    [lang]
  );

  const getMakalaCoverLabel = useCallback(
    (label: string) => (lang === 'en' ? MAKALA_COVER_EN[label] || label : label),
    [lang]
  );

  const getReportReasonLabel = useCallback(
    (reason: ReportReason) => {
      if (lang === 'en') return REPORT_REASON_EN[reason];
      const swLabels: Record<ReportReason, string> = {
        spam: 'Ujumbe wa Taka / Matangazo (Spam)',
        harassment: 'Lugha Chafu au Unyanyasaji',
        misinformation: 'Taarifa za Uongo au Upotoshaji',
        unlawful: 'Maudhui Yasiyo Halali au Hatari',
        other: 'Sababu Nyingine',
      };
      return swLabels[reason];
    },
    [lang]
  );

  const getBadgeLabel = useCallback(
    (badge: VerificationBadgeType, short = false) => {
      if (lang === 'en') {
        return short ? BADGE_EN[badge].shortLabel : BADGE_EN[badge].label;
      }
      return short
        ? VERIFICATION_BADGE_META[badge].shortLabel
        : VERIFICATION_BADGE_META[badge].label;
    },
    [lang]
  );

  const getBadgeDescription = useCallback(
    (badge: VerificationBadgeType) =>
      lang === 'en' ? BADGE_EN[badge].description : VERIFICATION_BADGE_META[badge].description,
    [lang]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      isEn,
      setLang,
      toggleLang,
      tr,
      formatTime,
      getBoardLabel,
      getBoardDescription,
      getJobTypeLabel,
      getMakalaSectionLabel,
      getMakalaCoverLabel,
      getReportReasonLabel,
      getBadgeLabel,
      getBadgeDescription,
    }),
    [
      lang,
      isEn,
      setLang,
      toggleLang,
      tr,
      formatTime,
      getBoardLabel,
      getBoardDescription,
      getJobTypeLabel,
      getMakalaSectionLabel,
      getMakalaCoverLabel,
      getReportReasonLabel,
      getBadgeLabel,
      getBadgeDescription,
    ]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
