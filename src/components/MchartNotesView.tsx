import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Clock,
  Code2,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode2,
  FileDown,
  FileText,
  FileUp,
  FolderArchive,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Pin,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import {
  NotePdfUploadResult,
  uploadNotePdfToCloudinary,
} from '../services/cloudinaryService';
import {
  createMchartNote,
  deleteMchartNote,
  fetchProtectedNoteContent,
  fetchUserNoteAccess,
  formatRawTextAsStructuredNote,
  submitNotePaymentRequest,
  updateMchartNote,
} from '../services/forumService';
import {
  MchartNote,
  MchartNoteAccess,
  MchartNoteContent,
  NoteLockTargetMode,
  normalizeVerificationBadge,
  UserProfile,
} from '../types';
import {
  applyMakalaFormatAction,
  MakalaFormatAction,
  restoreTextareaSelectionAndScroll,
} from '../utils/makalaSelectionFormatter';
import {
  downloadNoteAsPdf,
  downloadNoteAsTextFile,
  downloadUploadedPdfFile,
} from '../utils/notePdfGenerator';
import {
  InlineMediaInsertModal,
  InsertedInlineMedia,
  computeTextAfterInlineMediaInsert,
} from './InlineMediaInsertModal';
import { MakalaFormatToolbar } from './MakalaFormatToolbar';
import { extractPlainTextFromPdfFile, MobilePdfNoteReader } from './MobilePdfNoteReader';
import {
  extractAllCodeBlocksFromNote,
  NoteFormattedRenderer,
} from './NoteFormattedRenderer';
import { NoteLockManageModal } from './NoteLockManageModal';

type NoteFileFilter = 'all' | 'pinned' | 'code' | 'pdf' | 'archived';

const NOTE_DRAFT_STORAGE_KEY = 'malosha_mchart_note_draft_v1';

interface MchartNotesViewProps {
  notes: MchartNote[];
  loading: boolean;
  user: User | null;
  userDisplayName: string;
  isAdmin: boolean;
  readNoteIds?: Set<string>;
  onMarkNoteRead?: (noteId: string) => void;
  onSignIn?: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatPriceLabel(price?: number, currency = 'TZS'): string {
  const safe = Number(price || 0);
  if (safe <= 0) return '';
  return `${currency} ${safe.toLocaleString()}`;
}

function noteHasCodeBlock(note: MchartNote): boolean {
  return /```|~~~/.test(note.body || '');
}

function noteHasInlineImage(note: MchartNote): boolean {
  return /!\[[^\]]*\]\(https:\/\/[^\s)]+\)/i.test(note.body || '');
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export const MchartNotesView: React.FC<MchartNotesViewProps> = ({
  notes,
  loading,
  user,
  userDisplayName,
  isAdmin,
  readNoteIds,
  onMarkNoteRead,
  onSignIn,
  onToast,
}) => {
  const { tr, formatTime } = useLanguage();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [loadingEditNoteId, setLoadingEditNoteId] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [subtitleInput, setSubtitleInput] = useState('');
  const [pinNote, setPinNote] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<NotePdfUploadResult | null>(null);
  const [selectedWordCount, setSelectedWordCount] = useState(0);

  // Composer lock/payment options
  const [composerLockEnabled, setComposerLockEnabled] = useState(false);
  const [composerLockMode, setComposerLockMode] = useState<NoteLockTargetMode>('all');
  const [composerLockPrice, setComposerLockPrice] = useState('5000');
  const [composerLockCurrency, setComposerLockCurrency] = useState('TZS');
  const [composerPayInstructions, setComposerPayInstructions] = useState('');
  const [composerMembers, setComposerMembers] = useState<UserProfile[]>([]);
  const [selectedLockedUids, setSelectedLockedUids] = useState<Set<string>>(new Set());

  const [selectedNote, setSelectedNote] = useState<MchartNote | null>(null);
  const [lockModalNote, setLockModalNote] = useState<MchartNote | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<MchartNote | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [fontStep, setFontStep] = useState<'sm' | 'md' | 'lg'>('md');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<NoteFileFilter>('all');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const noteBodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [inlineMediaPicker, setInlineMediaPicker] = useState<{
    atIndex: number;
    replaceAt: boolean;
  } | null>(null);

  // Access & Protected Content State
  const [myAccessByNoteId, setMyAccessByNoteId] = useState<Record<string, MchartNoteAccess | null>>({});
  const [protectedContentMap, setProtectedContentMap] = useState<Record<string, MchartNoteContent>>({});
  const [loadingProtectedContent, setLoadingProtectedContent] = useState(false);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [submittingPaymentReq, setSubmittingPaymentReq] = useState(false);

  // Restore draft for new note when admin opens composer
  useEffect(() => {
    if (!isAdmin || editingNoteId) return;
    try {
      const saved = window.localStorage.getItem(NOTE_DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { title?: string; subtitle?: string; rawText?: string };
        if (!rawText && parsed.rawText) setRawText(parsed.rawText);
        if (!titleInput && parsed.title) setTitleInput(parsed.title);
        if (!subtitleInput && parsed.subtitle) setSubtitleInput(parsed.subtitle);
      }
    } catch {
      // Ignore draft restore errors
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Autosave draft for new notes
  useEffect(() => {
    if (!isAdmin || editingNoteId) return;
    try {
      if (!rawText.trim() && !titleInput.trim() && !subtitleInput.trim()) {
        window.localStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          NOTE_DRAFT_STORAGE_KEY,
          JSON.stringify({ title: titleInput, subtitle: subtitleInput, rawText })
        );
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [isAdmin, editingNoteId, titleInput, subtitleInput, rawText]);

  // Keep selectedNote & lockModalNote synced with live Firestore updates
  const liveSelectedNote = useMemo(() => {
    if (!selectedNote) return null;
    return notes.find((n) => n.id === selectedNote.id) || selectedNote;
  }, [notes, selectedNote]);

  const liveLockModalNote = useMemo(() => {
    if (!lockModalNote) return null;
    return notes.find((n) => n.id === lockModalNote.id) || lockModalNote;
  }, [notes, lockModalNote]);

  // Load member list when owner selects "Specific Users" lock mode during creation
  useEffect(() => {
    if (!isAdmin || !composerOpen || !composerLockEnabled || composerLockMode !== 'selected') {
      return;
    }
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            displayName: String(data.displayName || 'Mwanachama'),
            photoURL: String(data.photoURL || ''),
            bio: String(data.bio || ''),
            role: (data.role === 'moderator' ? 'moderator' : 'member') as 'member' | 'moderator',
            verificationBadge: normalizeVerificationBadge(data.verificationBadge),
            topicsCount: Number(data.topicsCount || 0),
            repliesCount: Number(data.repliesCount || 0),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        })
        .filter((u) => u.verificationBadge !== 'owner')
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      setComposerMembers(list);
    });
    return () => unsub();
  }, [isAdmin, composerOpen, composerLockEnabled, composerLockMode]);

  // Fetch current user's access status for all locked notes
  useEffect(() => {
    if (!user) {
      setMyAccessByNoteId({});
      return;
    }
    const lockedIds = notes.filter((n) => n.isLocked).map((n) => n.id);
    if (lockedIds.length === 0) return;

    let cancelled = false;
    Promise.all(
      lockedIds.map(async (noteId) => {
        const rec = await fetchUserNoteAccess(noteId, user.uid);
        return { noteId, rec };
      })
    ).then((results) => {
      if (cancelled) return;
      setMyAccessByNoteId((prev) => {
        const next = { ...prev };
        results.forEach(({ noteId, rec }) => {
          next[noteId] = rec;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [user, notes]);

  // Real-time access listener on actively viewed locked note (auto-unlocks live!)
  useEffect(() => {
    if (!user || !liveSelectedNote || !liveSelectedNote.isLocked || isAdmin) return;
    const accessRef = doc(db, 'mchart_notes', liveSelectedNote.id, 'access', user.uid);
    const unsub = onSnapshot(
      accessRef,
      (snap) => {
        if (!snap.exists()) {
          setMyAccessByNoteId((prev) => ({ ...prev, [liveSelectedNote.id]: null }));
          return;
        }
        const d = snap.data();
        const st =
          d.status === 'unlocked' || d.status === 'locked' || d.status === 'pending'
            ? d.status
            : 'pending';
        setMyAccessByNoteId((prev) => ({
          ...prev,
          [liveSelectedNote.id]: {
            noteId: liveSelectedNote.id,
            userId: user.uid,
            userName: String(d.userName || userDisplayName),
            status: st,
            paymentReference: String(d.paymentReference || ''),
            createdAt: d.createdAt || null,
            updatedAt: d.updatedAt || null,
          },
        }));
      },
      () => {
        // Ignore read error when doc does not exist yet
      }
    );
    return () => unsub();
  }, [user, liveSelectedNote, isAdmin, userDisplayName]);

  const isNoteLockedForViewer = (note: MchartNote): boolean => {
    if (isAdmin) return false;
    if (!note.isLocked) return false;
    if (!user) return true;
    const access = myAccessByNoteId[note.id];
    if (access?.status === 'unlocked') return false;
    if (note.lockedTargetMode === 'selected') {
      return access?.status === 'locked' || access?.status === 'pending';
    }
    return true;
  };

  // Load protected body & PDF URL automatically when owner or unlocked user opens a locked note
  useEffect(() => {
    if (!liveSelectedNote || !liveSelectedNote.isLocked) return;
    let lockedOut = false;
    if (!isAdmin) {
      if (!user) {
        lockedOut = true;
      } else {
        const access = myAccessByNoteId[liveSelectedNote.id];
        if (access?.status === 'unlocked') {
          lockedOut = false;
        } else if (liveSelectedNote.lockedTargetMode === 'selected') {
          lockedOut = access?.status === 'locked' || access?.status === 'pending';
        } else {
          lockedOut = true;
        }
      }
    }
    if (lockedOut) return;
    if (protectedContentMap[liveSelectedNote.id]) return;

    let cancelled = false;
    setLoadingProtectedContent(true);
    void fetchProtectedNoteContent(liveSelectedNote.id)
      .then((content) => {
        if (cancelled || !content) return;
        setProtectedContentMap((prev) => ({ ...prev, [liveSelectedNote.id]: content }));
      })
      .catch(() => {
        // Handled by fallback or access guard
      })
      .finally(() => {
        if (!cancelled) setLoadingProtectedContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [liveSelectedNote, isAdmin, user, myAccessByNoteId, protectedContentMap]);

  const openNoteReader = (note: MchartNote) => {
    setSelectedNote(note);
    setPaymentRefInput('');
    onMarkNoteRead?.(note.id);
  };

  const resolveNoteWithContent = async (note: MchartNote): Promise<MchartNote> => {
    if (!note.isLocked) return note;
    const cached = protectedContentMap[note.id];
    if (cached) {
      return {
        ...note,
        body: cached.body || note.body,
        pdfUrl: cached.pdfUrl || note.pdfUrl,
        pdfFileName: cached.pdfFileName || note.pdfFileName,
        pdfSize: cached.pdfSize || note.pdfSize,
      };
    }
    const fetched = await fetchProtectedNoteContent(note.id);
    if (fetched) {
      setProtectedContentMap((prev) => ({ ...prev, [note.id]: fetched }));
      return {
        ...note,
        body: fetched.body || note.body,
        pdfUrl: fetched.pdfUrl || note.pdfUrl,
        pdfFileName: fetched.pdfFileName || note.pdfFileName,
        pdfSize: fetched.pdfSize || note.pdfSize,
      };
    }
    return note;
  };

  const sortedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          (n.subtitle || '').toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          n.fileName.toLowerCase().includes(q) ||
          (n.pdfFileName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const am = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        const bm = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        return bm - am;
      });
  }, [notes, searchQuery]);

  const filterCounts = useMemo(() => {
    const nonArchived = sortedNotes.filter((n) => !n.isArchived);
    const archived = sortedNotes.filter((n) => n.isArchived);
    return {
      all: nonArchived.length,
      pinned: nonArchived.filter((n) => n.isPinned).length,
      code: nonArchived.filter((n) => noteHasCodeBlock(n)).length,
      pdf: nonArchived.filter((n) => Boolean(n.pdfUrl || n.pdfFileName)).length,
      archived: archived.length,
    };
  }, [sortedNotes]);

  const displayedFiles = useMemo(() => {
    if (activeFilter === 'archived') {
      return sortedNotes.filter((n) => n.isArchived);
    }
    const base = searchQuery.trim()
      ? sortedNotes
      : sortedNotes.filter((n) => !n.isArchived);
    if (activeFilter === 'pinned') return base.filter((n) => n.isPinned);
    if (activeFilter === 'code') return base.filter((n) => noteHasCodeBlock(n));
    if (activeFilter === 'pdf') return base.filter((n) => Boolean(n.pdfUrl || n.pdfFileName));
    return base;
  }, [sortedNotes, activeFilter, searchQuery]);

  const previewFormatted = useMemo(() => {
    if (!rawText.trim()) return null;
    return formatRawTextAsStructuredNote(rawText, titleInput, subtitleInput);
  }, [rawText, titleInput, subtitleInput]);

  const rawWordCount = useMemo(() => countWords(rawText), [rawText]);

  const syncSelectionStats = (el: HTMLTextAreaElement | null) => {
    if (!el) {
      setSelectedWordCount(0);
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) {
      setSelectedWordCount(0);
      return;
    }
    const slice = el.value.slice(start, end).trim();
    if (!slice) {
      setSelectedWordCount(0);
      return;
    }
    setSelectedWordCount(slice.split(/\s+/).filter(Boolean).length);
  };

  const handleApplyFormat = (action: MakalaFormatAction, fallbackSample: string) => {
    const el = noteBodyTextareaRef.current;
    const { nextBody, nextSelStart, nextSelEnd, snapshot } = applyMakalaFormatAction(
      rawText,
      el,
      action,
      fallbackSample
    );
    setRawText(nextBody);
    setShowPreview(false);
    restoreTextareaSelectionAndScroll(el, nextSelStart, nextSelEnd, snapshot);
    window.requestAnimationFrame(() => {
      syncSelectionStats(noteBodyTextareaRef.current);
    });
  };

  const handleAutoFormatNote = () => {
    if (!rawText.trim()) return;
    const formatted = formatRawTextAsStructuredNote(rawText, titleInput, subtitleInput);
    if (!titleInput.trim() && formatted.title) {
      setTitleInput(formatted.title);
    }
    if (!subtitleInput.trim() && formatted.subtitle) {
      setSubtitleInput(formatted.subtitle);
    }
    setRawText(formatted.body);
    onToast(
      tr(
        'Notes zimepangwa kisomi na code/amri zimehifadhiwa kwenye kisanduku cha kunakili!',
        'Notes structured cleanly with code & commands isolated!'
      )
    );
  };

  const resetComposer = () => {
    setEditingNoteId(null);
    setRawText('');
    setTitleInput('');
    setSubtitleInput('');
    setPinNote(false);
    setPendingPdf(null);
    setShowPreview(false);
    setSelectedWordCount(0);
    setComposerLockEnabled(false);
    setComposerLockMode('all');
    setSelectedLockedUids(new Set());
    setInlineMediaPicker(null);
    setComposerOpen(false);
  };

  const startEditNote = async (note: MchartNote) => {
    if (!isAdmin || loadingEditNoteId) return;
    setLoadingEditNoteId(note.id);
    try {
      const resolved = await resolveNoteWithContent(note);
      setEditingNoteId(note.id);
      setTitleInput(resolved.title);
      setSubtitleInput(resolved.subtitle || '');
      setRawText(resolved.body || '');
      setPinNote(Boolean(resolved.isPinned));
      setPendingPdf(null);
      setShowPreview(false);
      setComposerLockEnabled(Boolean(resolved.isLocked));
      setSelectedNote(null);
      setComposerOpen(true);
    } catch {
      onToast(tr('Imeshindwa kufungua faili kwa uhariri.', 'Failed to load file for editing.'), 'error');
    } finally {
      setLoadingEditNoteId(null);
    }
  };

  const handlePdfPicked = async (file: File | undefined) => {
    if (!file || !user || !isAdmin) return;
    setUploadingPdf(true);
    try {
      const [uploaded, extractedText] = await Promise.all([
        uploadNotePdfToCloudinary(file),
        extractPlainTextFromPdfFile(file),
      ]);
      setPendingPdf(uploaded);
      if (!titleInput.trim()) {
        const cleanName = uploaded.fileName
          .replace(/\.pdf$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        if (cleanName) setTitleInput(cleanName);
      }
      if (!rawText.trim() && extractedText.trim().length >= 10) {
        setRawText(extractedText);
      }
      onToast(
        tr(
          `PDF "${uploaded.fileName}" imepakiwa tayari kusomwa ndani ya mfumo.`,
          `PDF "${uploaded.fileName}" uploaded and ready for in-app reading.`
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia faili la PDF.', 'Failed to upload PDF file.'),
        'error'
      );
    } finally {
      setUploadingPdf(false);
    }
  };

  const handlePublishNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin || publishing || uploadingPdf) return;
    if (rawText.trim().length < 5 && !pendingPdf) {
      onToast(
        tr(
          'Bandika maandishi ya notes au pakia faili la PDF.',
          'Please paste note text or upload a PDF file.'
        ),
        'error'
      );
      return;
    }

    if (editingNoteId) {
      setPublishing(true);
      try {
        const { updatedBody } = await updateMchartNote(editingNoteId, {
          title: titleInput,
          subtitle: subtitleInput,
          rawText,
          isPinned: pinNote,
        });
        if (updatedBody) {
          setProtectedContentMap((prev) => {
            if (!prev[editingNoteId]) return prev;
            return {
              ...prev,
              [editingNoteId]: {
                ...prev[editingNoteId],
                body: updatedBody,
              },
            };
          });
        }
        resetComposer();
        onToast(tr('Mabadiliko ya faili la notes yamehifadhiwa!', 'Study file updated!'));
      } catch (err) {
        onToast(
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kuhifadhi mabadiliko.', 'Failed to update note.'),
          'error'
        );
      } finally {
        setPublishing(false);
      }
      return;
    }

    const numericPrice = Math.max(
      0,
      Math.floor(Number(composerLockPrice.replace(/[^0-9]/g, '') || 0))
    );

    if (
      composerLockEnabled &&
      composerLockMode === 'selected' &&
      selectedLockedUids.size === 0
    ) {
      onToast(
        tr(
          'Chagua angalau mwanachama mmoja wa kufungia note hii.',
          'Select at least one member to lock for this note.'
        ),
        'error'
      );
      return;
    }

    setPublishing(true);
    try {
      const lockedUsers = composerMembers
        .filter((m) => selectedLockedUids.has(m.uid))
        .map((m) => ({ uid: m.uid, displayName: m.displayName }));

      await createMchartNote(user, userDisplayName, {
        rawText,
        title: titleInput,
        subtitle: subtitleInput,
        isPinned: pinNote,
        isArchived: false,
        ...(pendingPdf
          ? {
              pdfUrl: pendingPdf.url,
              pdfFileName: pendingPdf.fileName,
              pdfSize: pendingPdf.fileSize,
            }
          : {}),
        isLocked: composerLockEnabled,
        lockedTargetMode: composerLockMode,
        lockPrice: numericPrice,
        lockCurrency: composerLockCurrency,
        paymentInstructions: composerPayInstructions,
        lockedUsers,
      });

      try {
        window.localStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
      resetComposer();
      onToast(
        tr(
          'Faili jipya la notes limepangwa kisomi na kuhifadhiwa!',
          'Study file formatted and saved!'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuhifadhi note.', 'Failed to publish note.'),
        'error'
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyAllCode = async (bodyText: string) => {
    const snippets = extractAllCodeBlocksFromNote(bodyText);
    if (snippets.length === 0) return;
    try {
      await navigator.clipboard.writeText(snippets.join('\n\n'));
      onToast(
        tr(
          `Code / amri ${snippets.length} zimenakiliwa tayari!`,
          `Copied ${snippets.length} code/command block(s)!`
        )
      );
    } catch {
      onToast(tr('Imeshindwa kunakili code.', 'Failed to copy code.'), 'error');
    }
  };

  const handleDownloadPdf = async (note: MchartNote) => {
    if (isNoteLockedForViewer(note)) {
      openNoteReader(note);
      onToast(
        tr('Lipia note hii kwanza ili uweze kusoma na kupakua PDF.', 'Pay to unlock this note before downloading.'),
        'error'
      );
      return;
    }
    if (downloadingId === note.id) return;
    setDownloadingId(note.id);
    try {
      const resolved = await resolveNoteWithContent(note);
      if (resolved.pdfUrl && resolved.noteType === 'pdf') {
        await downloadUploadedPdfFile(resolved.pdfUrl, resolved.pdfFileName || resolved.fileName);
      } else {
        await downloadNoteAsPdf(resolved);
      }
      onToast(
        tr(
          `PDF "${resolved.title}" imepakuliwa kwenye simu yako.`,
          `PDF "${resolved.title}" downloaded to your device.`
        )
      );
    } catch {
      onToast(tr('Imeshindwa kutengeneza PDF.', 'Could not generate PDF.'), 'error');
    } finally {
      setDownloadingId((curr) => (curr === note.id ? null : curr));
    }
  };

  const handleCopyNote = async (note: MchartNote) => {
    if (isNoteLockedForViewer(note)) {
      onToast(
        tr(
          'Note hii imefungwa na msimamizi — huwezi kunakili wala kusoma.',
          'This note is locked — copying and reading are disabled.'
        ),
        'error'
      );
      return;
    }
    try {
      const resolved = await resolveNoteWithContent(note);
      const header = resolved.subtitle
        ? `${resolved.title}\n${resolved.subtitle}`
        : resolved.title;
      await navigator.clipboard.writeText(`${header}\n\n${resolved.body}`);
      setCopiedId(note.id);
      window.setTimeout(() => setCopiedId((c) => (c === note.id ? null : c)), 2000);
      onToast(tr('Maandishi ya note yamenakiliwa.', 'Note text copied.'));
    } catch {
      onToast(tr('Imeshindwa kunakili.', 'Could not copy.'), 'error');
    }
  };

  const handleSubmitPaymentRequest = async (e: React.FormEvent, note: MchartNote) => {
    e.preventDefault();
    if (!user) {
      onSignIn?.();
      return;
    }
    if (submittingPaymentReq) return;
    setSubmittingPaymentReq(true);
    try {
      await submitNotePaymentRequest(note.id, user, userDisplayName, paymentRefInput);
      setMyAccessByNoteId((prev) => ({
        ...prev,
        [note.id]: {
          noteId: note.id,
          userId: user.uid,
          userName: userDisplayName,
          status: 'pending',
          paymentReference: paymentRefInput,
          createdAt: null,
          updatedAt: null,
        },
      }));
      setPaymentRefInput('');
      onToast(
        tr(
          'Ombi lako la kufunguliwa limetumwa kwa mmiliki! Note itafunguka punde tu akithibitisha.',
          'Payment confirmation sent to owner! This note will unlock automatically once approved.'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma ombi.', 'Failed sending request.'),
        'error'
      );
    } finally {
      setSubmittingPaymentReq(false);
    }
  };

  const handleToggleArchive = async (note: MchartNote) => {
    if (!isAdmin) return;
    try {
      await updateMchartNote(note.id, { isArchived: !note.isArchived });
      onToast(
        !note.isArchived
          ? tr('Note imehifadhiwa kwenye Mafaili ya Nyuma.', 'Note moved to Archive Files.')
          : tr('Note imerejeshwa kwenye Notes za Sasa.', 'Note restored to Active Notes.')
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kusasisha.', 'Update failed.'),
        'error'
      );
    }
  };

  const handleTogglePin = async (note: MchartNote) => {
    if (!isAdmin) return;
    try {
      await updateMchartNote(note.id, { isPinned: !note.isPinned });
      onToast(
        !note.isPinned
          ? tr('Note imebandikwa juu.', 'Note pinned.')
          : tr('Bandiko limeondolewa.', 'Note unpinned.')
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kusasisha.', 'Update failed.'),
        'error'
      );
    }
  };

  const handleDeleteNote = (note: MchartNote) => {
    if (!isAdmin) return;
    setPendingDeleteNote(note);
  };

  const executeDeleteNote = async (note: MchartNote) => {
    if (!isAdmin || deletingNoteId) return;
    setDeletingNoteId(note.id);
    try {
      await deleteMchartNote(note.id);
      if (selectedNote?.id === note.id) setSelectedNote(null);
      setPendingDeleteNote(null);
      onToast(tr('Note imefutwa.', 'Note deleted.'));
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kufuta note.', 'Failed to delete note.'),
        'error'
      );
    } finally {
      setDeletingNoteId(null);
    }
  };

  if (liveLockModalNote) {
    return (
      <NoteLockManageModal
        inline
        note={liveLockModalNote}
        onClose={() => setLockModalNote(null)}
        onToast={onToast}
      />
    );
  }

  if (inlineMediaPicker !== null) {
    return (
      <InlineMediaInsertModal
        inline
        isOpen
        onClose={() => setInlineMediaPicker(null)}
        onToast={onToast}
        onInsert={(media: InsertedInlineMedia) => {
          const picker = inlineMediaPicker ?? {
            atIndex: noteBodyTextareaRef.current?.selectionStart ?? rawText.length,
            replaceAt: false,
          };
          const { nextText, nextCursor } = computeTextAfterInlineMediaInsert(
            rawText,
            picker.atIndex,
            picker.replaceAt,
            media
          );
          setRawText(nextText);
          setInlineMediaPicker(null);
          setShowPreview(false);
          window.requestAnimationFrame(() => {
            const el = noteBodyTextareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(nextCursor, nextCursor);
          });
        }}
      />
    );
  }

  const fontSizeClass =
    fontStep === 'sm'
      ? 'text-[14px]'
      : fontStep === 'lg'
        ? 'text-[17px] sm:text-[18px]'
        : 'text-[15.5px] sm:text-[16px]';

  // Dedicated Mobile-Friendly Note & PDF Reader Pane (or Payment Lock Gate)
  if (liveSelectedNote) {
    const lockedForViewer = isNoteLockedForViewer(liveSelectedNote);
    const protectedData = protectedContentMap[liveSelectedNote.id];
    const effectiveBody =
      liveSelectedNote.isLocked && protectedData ? protectedData.body : liveSelectedNote.body;
    const effectivePdfUrl =
      liveSelectedNote.isLocked && protectedData
        ? protectedData.pdfUrl
        : liveSelectedNote.pdfUrl || '';
    const effectivePdfName =
      (liveSelectedNote.isLocked && protectedData?.pdfFileName) ||
      liveSelectedNote.pdfFileName ||
      liveSelectedNote.fileName;

    const readMins = Math.max(1, Math.ceil(liveSelectedNote.wordCount / 180));
    const hasPdf = Boolean(effectivePdfUrl);
    const isPdfOnly = liveSelectedNote.noteType === 'pdf' && hasPdf;
    const myAccess = myAccessByNoteId[liveSelectedNote.id];
    const priceLabel = formatPriceLabel(
      liveSelectedNote.lockPrice,
      liveSelectedNote.lockCurrency || 'TZS'
    );

    return (
      <div className="flex h-full flex-col overflow-hidden bg-[#FAF9F5]">
        {/* Sticky Mobile Reader Bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => setSelectedNote(null)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0E2640] hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{tr('Rudi Kwenye Mafaili', 'Back to Files')}</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => void handleTogglePin(liveSelectedNote)}
                  title={
                    liveSelectedNote.isPinned
                      ? tr('Ondoa Pin juu', 'Unpin file')
                      : tr('Bandika juu (Pin)', 'Pin file to top')
                  }
                  className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition-colors ${
                    liveSelectedNote.isPinned
                      ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">
                    {liveSelectedNote.isPinned ? tr('Ime-Pin', 'Pinned') : tr('Pin', 'Pin')}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={loadingEditNoteId === liveSelectedNote.id}
                  onClick={() => void startEditNote(liveSelectedNote)}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-[#0E2640] hover:bg-slate-50"
                >
                  {loadingEditNoteId === liveSelectedNote.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Edit3 className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{tr('Hariri', 'Edit')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLockModalNote(liveSelectedNote)}
                  className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition-colors ${
                    liveSelectedNote.isLocked
                      ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {liveSelectedNote.isLocked ? (
                    <Lock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                  )}
                  <span className="hidden md:inline">
                    {liveSelectedNote.isLocked ? tr('Kufuli', 'Lock') : tr('Funga', 'Lock')}
                  </span>
                </button>
              </>
            )}

            {!lockedForViewer && !isPdfOnly && (
              <div
                role="group"
                aria-label={tr('Ukubwa wa maandishi', 'Text size')}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5"
              >
                {(['sm', 'md', 'lg'] as const).map((sz, i) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontStep(sz)}
                    className={`min-h-[32px] rounded-lg px-2 text-xs font-bold transition-colors ${
                      fontStep === sz
                        ? 'bg-[#075E54] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {i === 0 ? 'A-' : i === 1 ? 'A' : 'A+'}
                  </button>
                ))}
              </div>
            )}

            {!lockedForViewer &&
              !isPdfOnly &&
              extractAllCodeBlocksFromNote(effectiveBody).length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleCopyAllCode(effectiveBody)}
                  title={tr('Nakili code au amri zote zilizo ndani ya faili hili', 'Copy all code/commands')}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-[#25D366] hover:bg-slate-800"
                >
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{tr('Nakili Code', 'Copy Code')}</span>
                </button>
              )}

            {!lockedForViewer && !isPdfOnly && (
              <button
                type="button"
                onClick={() => void handleCopyNote(liveSelectedNote)}
                aria-label={tr('Nakili note yote', 'Copy all text')}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copiedId === liveSelectedNote.id ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{tr('Nakili', 'Copy')}</span>
              </button>
            )}

            {!lockedForViewer && !isPdfOnly && (
              <button
                type="button"
                onClick={() => {
                  downloadNoteAsTextFile({ ...liveSelectedNote, body: effectiveBody });
                  onToast(tr('Faili la .MD limepakuliwa.', 'Markdown file downloaded.'));
                }}
                title={tr('Pakua faili la maandishi (.md)', 'Export .md file')}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileDown className="h-4 w-4 text-[#0E2640]" aria-hidden="true" />
                <span className="hidden lg:inline">.MD</span>
              </button>
            )}

            {!lockedForViewer && (
              <button
                type="button"
                disabled={downloadingId === liveSelectedNote.id}
                onClick={() => void handleDownloadPdf(liveSelectedNote)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#075E54] px-3 text-xs font-bold text-white hover:bg-[#064E46] disabled:opacity-60"
              >
                {downloadingId === liveSelectedNote.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#25D366]" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                )}
                <span>{tr('Pakua PDF', 'Save PDF')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Mobile-Optimized Reading Body OR Payment Gate */}
        <div className="flex-1 overflow-y-auto px-3.5 py-5 sm:px-8 sm:py-7">
          <article className="mx-auto max-w-2xl">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {liveSelectedNote.isPinned && (
                <>
                  <span className="inline-flex items-center gap-1 font-bold text-[#0E2640]">
                    <Pin className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                    <span>{tr('Faili Lililo-Pin', 'Pinned File')}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {liveSelectedNote.isLocked && (
                <>
                  <span className="inline-flex items-center gap-1 font-bold text-amber-800">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{priceLabel || tr('Note ya Kulipia', 'Paid Note')}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="font-mono text-[11px] font-semibold text-slate-600">
                {liveSelectedNote.pdfFileName
                  ? `PDF · ${liveSelectedNote.pdfFileName}`
                  : liveSelectedNote.fileName.replace(/\.txt$/i, '.pdf')}
              </span>
              {!isPdfOnly && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr(`Dakika ${readMins} za kusoma`, `${readMins} min read`)}</span>
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{formatTime(liveSelectedNote.createdAt)}</span>
            </div>

            <h1 className="font-display text-2xl font-bold leading-tight text-[#0E2640] sm:text-[28px] [text-wrap:balance]">
              {liveSelectedNote.title}
            </h1>

            {liveSelectedNote.subtitle && (
              <p className="mt-2 text-[15px] font-medium leading-relaxed text-slate-600 sm:text-base">
                {liveSelectedNote.subtitle}
              </p>
            )}

            <p className="mt-2.5 text-xs font-medium text-slate-500">
              {tr('Imeandaliwa na', 'Prepared by')}{' '}
              <strong className="text-[#0E2640]">{liveSelectedNote.authorName}</strong>
              {!isPdfOnly &&
                ` · ${tr(`Maneno ${liveSelectedNote.wordCount.toLocaleString()}`, `${liveSelectedNote.wordCount.toLocaleString()} words`)}`}
            </p>

            {/* Locked Note Gate (Strict Admin Lock OR Payment Wall) */}
            {lockedForViewer ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                      <Lock className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-[#0E2640]">
                        {(liveSelectedNote.lockPrice || 0) > 0
                          ? tr('Notes Hii Imefungwa Kwa Malipo', 'This Note Is Locked Behind Payment')
                          : tr('Notes Hii Imefungwa na Msimamizi', 'This Note Is Locked by Admin')}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {(liveSelectedNote.lockPrice || 0) > 0
                          ? tr(
                              'Lipia kiasi kilichowekwa na mmiliki ili kufungua maandishi yote, code, na PDF.',
                              'Pay the required fee set by the owner to unlock full notes, code snippets, and PDF.'
                            )
                          : tr(
                              'Msimamizi amefunga note hii isisomwe. Huwezi kusoma maudhui, code, wala PDF hadi msimamizi akufungulie.',
                              'An admin has locked this note. You cannot read its contents, code, or PDF until unlocked by the admin.'
                            )}
                      </p>
                    </div>
                  </div>

                  {priceLabel && (
                    <div className="rounded-xl bg-[#0E2640] px-4 py-2.5 text-left sm:text-right">
                      <p className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                        {tr('Kiasi cha Kulipia', 'Unlock Fee')}
                      </p>
                      <p className="font-display text-xl font-bold text-[#25D366] tabular-nums">
                        {priceLabel}
                      </p>
                    </div>
                  )}
                </div>

                {/* Owner's Message */}
                {(liveSelectedNote.paymentInstructions || (liveSelectedNote.lockPrice || 0) > 0) && (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-[#0E2640] uppercase">
                      {(liveSelectedNote.lockPrice || 0) > 0
                        ? tr('Ujumbe & Maelekezo ya Malipo', 'Payment Instructions')
                        : tr('Ujumbe wa Msimamizi', 'Admin Notice')}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {liveSelectedNote.paymentInstructions ||
                        tr(
                          `Tafadhali lipia ${priceLabel || 'ada ya note'} kisha tuma jina au kumbukumbu ya malipo yako hapa chini ili mmiliki akufungulie note hii.`,
                          `Please pay ${priceLabel || 'the required fee'} and submit your transaction reference below so the owner can unlock this note for you.`
                        )}
                    </p>
                  </div>
                )}

                {!user ? (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
                    <p className="text-xs font-medium text-slate-700">
                      {tr('Ingia au fungua akaunti yako kwanza.', 'Sign in or create an account first.')}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSignIn?.()}
                      className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#075E54] px-5 py-2 text-xs font-bold text-white hover:bg-[#064E46]"
                    >
                      {tr('Ingia / Jisajili', 'Sign In')}
                    </button>
                  </div>
                ) : (liveSelectedNote.lockPrice || 0) <= 0 ? (
                  <div className="mt-5 rounded-xl border border-red-200 bg-red-50/70 p-4 text-center">
                    <p className="text-xs font-semibold text-red-900">
                      {tr(
                        'Ufikiaji wa note hii umezuiwa kabisa na msimamizi kwa akaunti yako.',
                        'Access to this note is strictly blocked by the platform administrator.'
                      )}
                    </p>
                  </div>
                ) : myAccess?.status === 'pending' ? (
                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#075E54]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-bold text-[#0E2640]">
                          {tr(
                            'Ombi Lako la Malipo Linasubiri Uthibitisho',
                            'Your Payment Request Is Waiting Approval'
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {tr(
                            'Mmiliki akishathibitisha malipo yako, note hii itafunguka moja kwa moja kwenye skrini hii.',
                            'Once the owner confirms your payment, this note will unlock automatically right here.'
                          )}
                        </p>
                        {myAccess.paymentReference && (
                          <p className="mt-2 text-xs font-semibold text-slate-600">
                            {tr('Kumbukumbu yako:', 'Your reference:')} {myAccess.paymentReference}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => void handleSubmitPaymentRequest(e, liveSelectedNote)}
                    className="mt-5 space-y-3"
                  >
                    <div>
                      <label
                        htmlFor="note-pay-ref-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        {tr(
                          'Weka Namba Uliolipia au Kumbukumbu ya Muamala (SMS / M-Pesa)',
                          'Enter Your Payment Phone Number or Transaction Reference'
                        )}
                      </label>
                      <input
                        id="note-pay-ref-input"
                        type="text"
                        required
                        maxLength={240}
                        value={paymentRefInput}
                        onChange={(e) => setPaymentRefInput(e.target.value)}
                        placeholder={tr(
                          'Mfano: Nimelipa M-Pesa 0712 345 678 (Ref: ABC123)',
                          'e.g. Paid via M-Pesa 0712 345 678 (Ref: ABC123)'
                        )}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#075E54] focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingPaymentReq || !paymentRefInput.trim()}
                      className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#075E54] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#064E46] disabled:opacity-55"
                    >
                      {submittingPaymentReq ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                      )}
                      <span>
                        {submittingPaymentReq
                          ? tr('Inatuma Ombi...', 'Submitting...')
                          : tr('Nimelipia — Omba Kufunguliwa', 'I Have Paid — Request Unlock')}
                      </span>
                    </button>
                  </form>
                )}
              </div>
            ) : liveSelectedNote.isLocked && loadingProtectedContent && !protectedData ? (
              <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-12 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-[#075E54]" aria-hidden="true" />
                <p className="mt-2.5 text-xs font-semibold text-slate-600">
                  {tr('Inafungua maudhui kamili ya note...', 'Loading unlocked note content...')}
                </p>
              </div>
            ) : (
              <>
                {!isPdfOnly && (
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <NoteFormattedRenderer
                      body={effectiveBody}
                      fontSizeClass={fontSizeClass}
                      onCopyCodeSuccess={(msg) => onToast(msg)}
                    />
                  </div>
                )}

                {hasPdf && effectivePdfUrl && (
                  <div
                    className={
                      isPdfOnly
                        ? 'mt-4 border-t border-slate-200 pt-3'
                        : 'mt-6 border-t border-slate-200 pt-5'
                    }
                  >
                    <MobilePdfNoteReader
                      pdfUrl={effectivePdfUrl}
                      fileName={effectivePdfName}
                      fallbackBody={effectiveBody}
                      onDownload={() => void handleDownloadPdf(liveSelectedNote)}
                    />
                  </div>
                )}
              </>
            )}

            {isAdmin && (
              <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => void handleTogglePin(liveSelectedNote)}
                  className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                    liveSelectedNote.isPinned
                      ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Pin className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <span>
                    {liveSelectedNote.isPinned
                      ? tr('Ondoa Pin', 'Unpin File')
                      : tr('Bandika Juu (Pin)', 'Pin File')}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={loadingEditNoteId === liveSelectedNote.id}
                  onClick={() => void startEditNote(liveSelectedNote)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#0E2640] hover:bg-slate-50"
                >
                  <Edit3 className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
                  <span>{tr('Hariri Faili Hili', 'Edit File')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLockModalNote(liveSelectedNote)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Kufuli, Bei & Wanachama', 'Lock, Price & Members')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleArchive(liveSelectedNote)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  {liveSelectedNote.isArchived ? (
                    <>
                      <ArchiveRestore className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
                      <span>{tr('Rejesha Mafaili ya Sasa', 'Restore to Active')}</span>
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      <span>{tr('Hifadhi Kwenye Kumbukumbu', 'Archive File')}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(liveSelectedNote)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Futa Faili', 'Delete')}</span>
                </button>
              </div>
            )}

            {pendingDeleteNote?.id === liveSelectedNote.id && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
                <span className="font-bold">
                  {tr('Futa faili hili kabisa?', 'Delete this file permanently?')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(deletingNoteId)}
                    onClick={() => setPendingDeleteNote(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700"
                  >
                    {tr('Ghairi', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(deletingNoteId)}
                    onClick={() => void executeDeleteNote(liveSelectedNote)}
                    className="rounded-lg bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingNoteId ? '...' : tr('Futa Kabisa', 'Delete')}
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>
      </div>
    );
  }

  // Notes Digital File Cabinet Overview
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F5F7FA]">
      {/* Search, Filter Tabs & New File Action */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-3.5 py-3 sm:px-5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('Tafuta faili la notes, code, au PDF...', 'Search study files, code, or PDF...')}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#075E54] focus:bg-white focus:outline-none sm:text-sm"
            />
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (composerOpen) {
                  resetComposer();
                } else {
                  setEditingNoteId(null);
                  setComposerOpen(true);
                }
              }}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#075E54] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#064E46]"
            >
              {composerOpen ? (
                <>
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Funga Fomu', 'Close Form')}</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  <span>{tr('Weka Notes / Pakia PDF', 'New Study File / PDF')}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* File Folder Filter Strip */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'all', label: tr('Mafaili Yote', 'All Files'), count: filterCounts.all },
              { id: 'pinned', label: tr('Yaliyo-Pin', 'Pinned'), count: filterCounts.pinned },
              { id: 'code', label: tr('Code & Amri', 'Code & Cmd'), count: filterCounts.code },
              { id: 'pdf', label: tr('PDF', 'PDFs'), count: filterCounts.pdf },
              { id: 'archived', label: tr('Kumbukumbu', 'Archive'), count: filterCounts.archived },
            ] as { id: NoteFileFilter; label: string; count: number }[]
          ).map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  active
                    ? 'border-[#075E54] bg-[#075E54] text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded px-1 text-[10px] tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Notes File Cabinet & Composer */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5">
        {pendingDeleteNote && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
            <span className="font-bold">
              {tr(`Futa "${pendingDeleteNote.title}" kabisa?`, `Delete "${pendingDeleteNote.title}" permanently?`)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={Boolean(deletingNoteId)}
                onClick={() => setPendingDeleteNote(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={Boolean(deletingNoteId)}
                onClick={() => void executeDeleteNote(pendingDeleteNote)}
                className="rounded-lg bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingNoteId ? '...' : tr('Futa Kabisa', 'Delete')}
              </button>
            </div>
          </div>
        )}

        {/* Owner Scholarly Notes & PDF Publisher / Editor */}
        {isAdmin && composerOpen && (
          <form
            onSubmit={(e) => void handlePublishNote(e)}
            className="mb-5 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0E2640] sm:text-lg">
                  <Sparkles className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
                  <span>
                    {editingNoteId
                      ? tr('Hariri Faili la Notes', 'Edit Study File')
                      : tr('Weka Faili la Notes Kitaalamu au PDF', 'Create Study File or PDF')}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {tr(
                    'Bila kikomo cha maneno · Pamba kisomi (nukuu, angaza, rangi, orodha, herufi kubwa) na funga code/amri ndani ya kisanduku cha kunakili.',
                    'Unlimited words · Full scholarly formatting (quotes, highlights, colors, lists, case) with isolated copyable code/command blocks.'
                  )}
                </p>
              </div>
              {editingNoteId && (
                <button
                  type="button"
                  onClick={resetComposer}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {tr('Ghairi Uhariri', 'Cancel Edit')}
                </button>
              )}
            </div>

            <div className="mt-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="mchart-note-title"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Kichwa Kikuu / Jina la Faili (Hiari)', 'Main Title / File Name (Optional)')}
                  </label>
                  <input
                    id="mchart-note-title"
                    type="text"
                    maxLength={160}
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder={tr('Mfano: Mwongozo wa React & Server Commands', 'e.g. Modern Web API & CLI Guide')}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#075E54] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mchart-note-subtitle"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tr('Kichwa Kidogo / Subtitle (Hiari)', 'Subtitle (Optional)')}
                  </label>
                  <input
                    id="mchart-note-subtitle"
                    type="text"
                    maxLength={220}
                    value={subtitleInput}
                    onChange={(e) => setSubtitleInput(e.target.value)}
                    placeholder={tr(
                      'Mfano: Hatua za msingi, picha, na amri za terminal',
                      'e.g. Step-by-step lessons with images and commands'
                    )}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#075E54] focus:outline-none"
                  />
                </div>
              </div>

              {/* PDF Upload Box (shown when creating new note) */}
              {!editingNoteId && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      void handlePdfPicked(file);
                    }}
                  />
                  {pendingPdf ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {pendingPdf.fileName}
                          </p>
                          <p className="text-[11px] text-emerald-700">
                            {formatBytes(pendingPdf.fileSize)} ·{' '}
                            {tr('PDF tayari kusomwa kwenye simu', 'PDF ready for mobile reader')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingPdf(null)}
                        aria-label={tr('Ondoa PDF', 'Remove PDF')}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          {tr('Pakia Faili la PDF (Hiari)', 'Upload PDF Document (Optional)')}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {tr(
                            'Hadi MB 15 · Wasomaji watafungua na kusoma kwenye simu',
                            'Up to 15 MB · Opens directly in mobile reader'
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={uploadingPdf}
                        onClick={() => pdfInputRef.current?.click()}
                        className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-[#075E54] bg-white px-3.5 py-1.5 text-xs font-bold text-[#075E54] transition-colors hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {uploadingPdf ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <FileUp className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>
                          {uploadingPdf
                            ? tr('Inapakia PDF...', 'Uploading PDF...')
                            : tr('Chagua PDF', 'Select PDF')}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Body Textarea + Full Makala Scholarly Toolbar + Live Preview */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="mchart-note-body"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      {pendingPdf
                        ? tr('Maelezo ya Ziada ya Notes (Hiari ukishaweka PDF)', 'Additional Notes Text (Optional with PDF)')
                        : tr('Andika au Bandika Notes & Code / Amri Hapa', 'Write or Paste Notes & Code / Commands Here')}
                    </label>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-[#075E54] tabular-nums">
                      {tr(
                        `Maneno ${rawWordCount.toLocaleString()} · Herufi ${rawText.length.toLocaleString()} · Bila Kikomo`,
                        `${rawWordCount.toLocaleString()} words · ${rawText.length.toLocaleString()} chars · Unlimited`
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    disabled={!rawText.trim()}
                    className="inline-flex min-h-[34px] items-center gap-1 text-xs font-bold text-[#075E54] hover:underline disabled:opacity-40"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {showPreview
                        ? tr('Hariri Maandishi', 'Edit Text')
                        : tr('Hakiki Faili Kisomi', 'Preview Study File')}
                    </span>
                  </button>
                </div>

                {!showPreview && (
                  <MakalaFormatToolbar
                    selectedWordCount={selectedWordCount}
                    showCodeAction
                    showDividerAction
                    onApplyFormat={handleApplyFormat}
                    onOpenInlineMedia={() => {
                      setShowPreview(false);
                      setInlineMediaPicker({
                        atIndex: noteBodyTextareaRef.current?.selectionStart ?? rawText.length,
                        replaceAt: false,
                      });
                    }}
                    onAutoFormat={handleAutoFormatNote}
                  />
                )}

                {showPreview && previewFormatted ? (
                  <div className="mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-emerald-200 bg-[#FAF9F5] p-4">
                    <p className="font-mono text-[11px] font-bold text-[#075E54]">
                      {tr('Mwonekano wa Faili Kisomi', 'Scholarly Study File Preview')} ·{' '}
                      {previewFormatted.fileName}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-[#0E2640]">
                      {previewFormatted.title}
                    </h3>
                    {previewFormatted.subtitle && (
                      <p className="mt-0.5 text-sm font-medium text-slate-600">
                        {previewFormatted.subtitle}
                      </p>
                    )}
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <NoteFormattedRenderer
                        body={previewFormatted.body}
                        fontSizeClass="text-[15px]"
                        onCopyCodeSuccess={(msg) => onToast(msg)}
                        previewMode
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    id="mchart-note-body"
                    ref={noteBodyTextareaRef}
                    rows={10}
                    required={!pendingPdf}
                    value={rawText}
                    onSelect={(e) => syncSelectionStats(e.currentTarget)}
                    onKeyUp={(e) => syncSelectionStats(e.currentTarget)}
                    onMouseUp={(e) => syncSelectionStats(e.currentTarget)}
                    onBlur={() => setSelectedWordCount(0)}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      const cursor = e.target.selectionStart ?? nextVal.length;
                      const wasAtTyped =
                        nextVal.length > rawText.length &&
                        nextVal.length - rawText.length <= 2 &&
                        cursor > 0 &&
                        nextVal[cursor - 1] === '@';
                      setRawText(nextVal);
                      if (wasAtTyped) {
                        setInlineMediaPicker({ atIndex: cursor - 1, replaceAt: true });
                      }
                    }}
                    placeholder={tr(
                      'Andika au bandika notes ndefu bila kikomo... Highlight maneno kuweka Angaza, Rangi, Nukuu, Orodha, Herufi Kubwa au Code/Amri. Andika @ popote kupakia picha au video.',
                      'Write or paste unlimited notes... Highlight words to format highlights, colors, quotes, lists, case, or Code/Commands. Type @ anywhere to insert media.'
                    )}
                    className="w-full rounded-b-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900 focus:border-[#075E54] focus:outline-none"
                  />
                )}
              </div>

              {/* Lock / Paid Note Configuration inside Composer (for new files) */}
              {!editingNoteId && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Lock className="h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
                      <div>
                        <span className="block text-xs font-bold text-slate-900">
                          {tr('Funga Note Hii Kwa Malipo (Paid Lock)', 'Lock This Note Behind Payment')}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {tr(
                            'Watumiaji hawataweza kusoma mpaka walipie kiasi utakachoweka',
                            'Users must pay the set fee before reading'
                          )}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={composerLockEnabled}
                      onChange={(e) => setComposerLockEnabled(e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-[#075E54] focus:ring-[#075E54]"
                    />
                  </label>

                  {composerLockEnabled && (
                    <div className="mt-3.5 space-y-3 border-t border-slate-200 pt-3.5">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setComposerLockMode('all')}
                          className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                            composerLockMode === 'all'
                              ? 'border-[#0E2640] bg-white text-[#0E2640]'
                              : 'border-slate-200 bg-transparent text-slate-600'
                          }`}
                        >
                          <Lock className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
                          <span>{tr('Funga kwa Wote Hadi Walipie', 'Lock for All Until Paid')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerLockMode('selected')}
                          className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                            composerLockMode === 'selected'
                              ? 'border-[#0E2640] bg-white text-[#0E2640]'
                              : 'border-slate-200 bg-transparent text-slate-600'
                          }`}
                        >
                          <Users className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                          <span>{tr('Funga Watumiaji Maalumu Tu', 'Lock Specific Users Only')}</span>
                        </button>
                      </div>

                      {composerLockMode === 'selected' && (
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                          <p className="mb-1.5 text-[11px] font-bold text-slate-700">
                            {tr(
                              `Chagua Wanachama wa Kufungia (${selectedLockedUids.size} wamechaguliwa):`,
                              `Select Members to Lock (${selectedLockedUids.size} selected):`
                            )}
                          </p>
                          <div className="max-h-36 space-y-1 overflow-y-auto">
                            {composerMembers.map((m) => {
                              const checked = selectedLockedUids.has(m.uid);
                              return (
                                <label
                                  key={m.uid}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedLockedUids((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(m.uid)) next.delete(m.uid);
                                        else next.add(m.uid);
                                        return next;
                                      });
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-[#075E54]"
                                  />
                                  <span className="truncate font-medium text-slate-800">
                                    {m.displayName}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label
                            htmlFor="composer-lock-price"
                            className="block text-[11px] font-semibold text-slate-700"
                          >
                            {tr('Kiasi cha Kulipia (0 = Funga kabisa bila malipo)', 'Price Amount (0 = Strict admin lock)')}
                          </label>
                          <input
                            id="composer-lock-price"
                            type="number"
                            min={0}
                            value={composerLockPrice}
                            onChange={(e) => setComposerLockPrice(e.target.value)}
                            className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-[#075E54] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="composer-lock-currency"
                            className="block text-[11px] font-semibold text-slate-700"
                          >
                            {tr('Sarafu', 'Currency')}
                          </label>
                          <select
                            id="composer-lock-currency"
                            value={composerLockCurrency}
                            onChange={(e) => setComposerLockCurrency(e.target.value)}
                            className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2 text-sm font-bold text-slate-900 focus:border-[#075E54] focus:outline-none"
                          >
                            <option value="TZS">TZS</option>
                            <option value="KES">KES</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="composer-pay-msg"
                          className="block text-[11px] font-semibold text-slate-700"
                        >
                          {tr('Ujumbe wa Kulipia (Namba ya Malipo / Maelekezo)', 'Payment Message / Instructions')}
                        </label>
                        <textarea
                          id="composer-pay-msg"
                          rows={2}
                          maxLength={500}
                          value={composerPayInstructions}
                          onChange={(e) => setComposerPayInstructions(e.target.value)}
                          placeholder={tr(
                            'Mfano: Lipia M-Pesa 07XX XXX XXX (Jina: Malosha) kisha tuma muamala hapa chini kufunguliwa.',
                            'e.g. Pay via M-Pesa 07XX XXX XXX and submit reference below to unlock.'
                          )}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-[#075E54] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={pinNote}
                    onChange={(e) => setPinNote(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#075E54] focus:ring-[#075E54]"
                  />
                  <span>{tr('Bandika juu kabisa (Pin File)', 'Pin file to top')}</span>
                </label>

                <button
                  type="submit"
                  disabled={publishing || uploadingPdf || (rawText.trim().length < 5 && !pendingPdf)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#075E54] px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#064E46] disabled:opacity-50"
                >
                  <FileText className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  <span>
                    {publishing
                      ? tr('Inahifadhi Faili...', 'Saving File...')
                      : editingNoteId
                        ? tr('Hifadhi Mabadiliko ya Faili', 'Save File Changes')
                        : tr('Panga & Hifadhi Faili', 'Format & Save Study File')}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Unified Digital Study Files Explorer (Pinned first -> Newest on Top -> Oldest at Bottom) */}
        {loading ? (
          <div className="space-y-3 py-4">
            <div className="h-20 animate-pulse rounded-2xl bg-white" />
            <div className="h-20 animate-pulse rounded-2xl bg-white" />
            <div className="h-20 animate-pulse rounded-2xl bg-white" />
          </div>
        ) : displayedFiles.length === 0 ? (
          <div className="mx-auto my-8 max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
            <FolderArchive className="mx-auto h-9 w-9 text-[#075E54]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold text-slate-900">
              {searchQuery.trim()
                ? tr('Hakuna faili lililolingana na utafutaji', 'No matching study files found')
                : activeFilter === 'archived'
                  ? tr('Hakuna Mafaili Kwenye Kumbukumbu', 'No Archived Files')
                  : activeFilter === 'pinned'
                    ? tr('Hakuna Mafaili Yaliyo-Pin Bado', 'No Pinned Files Yet')
                    : tr('Bado Hakuna Mafaili ya Notes', 'No Study Files Yet')}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {isAdmin
                ? tr(
                    'Bonyeza "Weka Notes / Pakia PDF" hapo juu ili kuunda faili jipya la kusoma.',
                    'Click "New Study File / PDF" above to create a study file.'
                  )
                : tr(
                    'Mmiliki akiweka faili jipya la notes litaonekana hapa juu kabisa ili ulifungue na kusoma.',
                    'When the owner adds a study file, it will appear at the top ready to open and read.'
                  )}
            </p>
          </div>
        ) : (
          <section aria-label={tr('Mafaili ya Notes', 'Study Files Cabinet')}>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#0E2640] uppercase">
                <FolderOpen className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
                <span>
                  {activeFilter === 'archived'
                    ? tr('Mafaili ya Kumbukumbu', 'Archived Study Files')
                    : tr('Mafaili ya Notes (Mpya Juu)', 'Study Files (Newest First)')}
                </span>
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                {tr(`Mafaili ${displayedFiles.length}`, `${displayedFiles.length} file(s)`)}
              </span>
            </div>

            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {displayedFiles.map((fileNote) => {
                const hasPdf = Boolean(fileNote.pdfUrl || fileNote.pdfFileName);
                const hasCode = noteHasCodeBlock(fileNote);
                const hasImg = noteHasInlineImage(fileNote);
                const readMins = Math.max(1, Math.ceil((fileNote.wordCount || 1) / 180));
                const isUnreadItem =
                  Boolean(readNoteIds) &&
                  !readNoteIds?.has(fileNote.id) &&
                  fileNote.authorId !== user?.uid;
                const lockedForViewer = isNoteLockedForViewer(fileNote);
                const priceLabel = formatPriceLabel(
                  fileNote.lockPrice,
                  fileNote.lockCurrency || 'TZS'
                );
                const displayFileName = (fileNote.pdfFileName || fileNote.fileName).replace(
                  /\.txt$/i,
                  '.pdf'
                );

                return (
                  <div
                    key={fileNote.id}
                    className={`flex flex-col justify-between gap-3 p-3.5 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:px-4 ${
                      isUnreadItem ? 'bg-emerald-50/35' : ''
                    } ${fileNote.isPinned ? 'border-l-4 border-l-amber-500' : ''}`}
                  >
                    {/* Clickable File Identity & Info */}
                    <button
                      type="button"
                      onClick={() => openNoteReader(fileNote)}
                      className="group flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div
                        className={`relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${
                          lockedForViewer
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : hasPdf
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : hasCode
                                ? 'border-slate-700 bg-slate-900 text-[#25D366]'
                                : 'border-emerald-200 bg-emerald-50 text-[#075E54]'
                        }`}
                      >
                        {lockedForViewer ? (
                          <Lock className="h-5 w-5" aria-hidden="true" />
                        ) : hasCode && !hasPdf ? (
                          <FileCode2 className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <FileText className="h-5 w-5" aria-hidden="true" />
                        )}
                        <span className="mt-0.5 text-[8px] font-black tracking-wider uppercase">
                          {lockedForViewer
                            ? 'LOCK'
                            : hasPdf
                              ? 'PDF'
                              : hasCode
                                ? 'CODE'
                                : 'NOTE'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {isUnreadItem && (
                            <span className="rounded bg-[#075E54] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                              {tr('MPYA', 'NEW')}
                            </span>
                          )}
                          {fileNote.isPinned && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                              <span>{tr('Ime-Pin', 'Pinned')}</span>
                            </span>
                          )}
                          {fileNote.isLocked && (
                            <span
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                lockedForViewer
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-emerald-50 text-[#075E54]'
                              }`}
                            >
                              {lockedForViewer ? (
                                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                              ) : (
                                <LockOpen className="h-2.5 w-2.5" aria-hidden="true" />
                              )}
                              <span>
                                {lockedForViewer
                                  ? priceLabel || tr('Imefungwa', 'Locked')
                                  : tr('Imefunguliwa', 'Unlocked')}
                              </span>
                            </span>
                          )}
                          <span className="truncate font-mono text-[11px] font-semibold text-slate-500">
                            {displayFileName}
                          </span>
                        </div>

                        <p className="mt-1 truncate font-display text-[15px] font-bold text-[#0E2640] group-hover:text-[#075E54] sm:text-base">
                          {fileNote.title}
                        </p>

                        {fileNote.subtitle && (
                          <p className="mt-0.5 truncate text-xs font-medium text-slate-600">
                            {fileNote.subtitle}
                          </p>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {fileNote.noteType !== 'pdf' && (
                            <span className="tabular-nums">
                              {tr(
                                `Maneno ${fileNote.wordCount.toLocaleString()} · Dakika ${readMins}`,
                                `${fileNote.wordCount.toLocaleString()} words · ${readMins} min`
                              )}
                            </span>
                          )}
                          {hasCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                                <Code2 className="h-3 w-3 text-[#075E54]" aria-hidden="true" />
                                <span>{tr('Code/Amri', 'Code/Cmd')}</span>
                              </span>
                            </>
                          )}
                          {hasImg && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                                <ImageIcon className="h-3 w-3 text-[#075E54]" aria-hidden="true" />
                                <span>{tr('Picha', 'Photos')}</span>
                              </span>
                            </>
                          )}
                          {hasPdf && fileNote.pdfSize ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-red-700">
                                {formatBytes(fileNote.pdfSize)}
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span>{formatTime(fileNote.createdAt)}</span>
                        </div>
                      </div>
                    </button>

                    {/* File Actions */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => openNoteReader(fileNote)}
                        className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white ${
                          lockedForViewer
                            ? 'bg-[#0E2640] hover:bg-[#163A5F]'
                            : 'bg-[#075E54] hover:bg-[#064E46]'
                        }`}
                      >
                        {lockedForViewer ? (
                          <Lock className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                        ) : (
                          <FolderOpen className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                        )}
                        <span>
                          {lockedForViewer
                            ? tr(`Fungua (${priceLabel || 'Lipia'})`, 'Unlock')
                            : tr('Fungua File', 'Open File')}
                        </span>
                      </button>

                      {!lockedForViewer && (
                        <button
                          type="button"
                          disabled={downloadingId === fileNote.id}
                          onClick={() => void handleDownloadPdf(fileNote)}
                          aria-label={tr(
                            `Pakua PDF ${fileNote.title}`,
                            `Download PDF ${fileNote.title}`
                          )}
                          className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          {downloadingId === fileNote.id ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-[#075E54]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Download
                              className="h-3.5 w-3.5 text-[#075E54]"
                              aria-hidden="true"
                            />
                          )}
                          <span>PDF</span>
                        </button>
                      )}

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleTogglePin(fileNote)}
                            title={
                              fileNote.isPinned
                                ? tr('Ondoa Pin', 'Unpin file')
                                : tr('Bandika juu (Pin)', 'Pin file to top')
                            }
                            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                              fileNote.isPinned
                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            disabled={loadingEditNoteId === fileNote.id}
                            onClick={() => void startEditNote(fileNote)}
                            title={tr('Hariri Faili', 'Edit File')}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-[#0E2640] hover:bg-slate-100"
                          >
                            {loadingEditNoteId === fileNote.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setLockModalNote(fileNote)}
                            title={tr('Dhibiti Kufuli / Malipo', 'Manage Lock / Payment')}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                              fileNote.isLocked
                                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {fileNote.isLocked ? (
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleToggleArchive(fileNote)}
                            title={
                              fileNote.isArchived
                                ? tr('Rejesha Kwenye Mafaili', 'Restore to Files')
                                : tr('Hifadhi Kwenye Kumbukumbu', 'Archive File')
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            {fileNote.isArchived ? (
                              <ArchiveRestore className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                            ) : (
                              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteNote(fileNote)}
                            title={tr('Futa Faili', 'Delete file')}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
