import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from './firebase';
import {
  NavTab,
  Report,
  ReportReason,
  SortMode,
  Topic,
  TopicCategory,
  UserProfile,
  normalizeBoardCategory,
  normalizeVerificationBadge,
} from './types';
import {
  createTopic,
  deleteTopic,
  editTopic,
  seedStarterTopics,
  submitReport,
  syncUserProfile,
  toggleTopicPin,
  toggleTopicVote,
  updateReportStatus,
  updateTopicStatus,
  updateUserProfile,
} from './services/forumService';
import { shareTopic } from './utils/formatters';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { TopicList } from './components/TopicList';
import { TopicDetail } from './components/TopicDetail';
import { TopicComposerModal } from './components/TopicComposerModal';
import { ReportModal } from './components/ReportModal';
import { SafetyGuidelinesView } from './components/SafetyGuidelinesView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { UserBadgesProvider } from './context/UserBadgesContext';

function ForumShell() {
  const { lang, setLang, tr } = useLanguage();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [votedTopicIds, setVotedTopicIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<Report[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('all');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('mada');
  });
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [inlineExpandRequest, setInlineExpandRequest] = useState(0);
  const [sharedTopicFallback, setSharedTopicFallback] = useState<Topic | null>(null);
  const [loadingSharedTopic, setLoadingSharedTopic] = useState(false);

  const [reportTarget, setReportTarget] = useState<{
    targetType: 'topic' | 'reply';
    targetId: string;
    topicId: string;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  } | null>(null);

  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const initialNewsLoadedRef = useRef(false);
  const knownNewsIdsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        try {
          await syncUserProfile(currentUser);
          const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
          setIsAdminDoc(adminSnap.exists());
        } catch (err) {
          console.error(err);
        }
      } else {
        setUserProfile(null);
        setIsAdminDoc(false);
      }
    });
    return () => unsub();
  }, []);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    return (user.email === ADMIN_EMAIL && user.emailVerified) || isAdminDoc;
  }, [user, isAdminDoc]);

  useEffect(() => {
    if (!authReady || !user) {
      setUserProfile(null);
      return;
    }

    const path = `users/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setUserProfile({
          uid: d.uid,
          displayName: d.displayName,
          photoURL: d.photoURL || '',
          bio: d.bio || '',
          role: d.role || 'member',
          verificationBadge: normalizeVerificationBadge(d.verificationBadge),
          topicsCount: Number(d.topicsCount || 0),
          repliesCount: Number(d.repliesCount || 0),
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    setLoadingTopics(true);
    const path = 'topics';
    const q = query(collection(db, 'topics'), where('status', 'in', ['open', 'locked']));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Topic[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            body: data.body,
            category: data.category,
            tags: Array.isArray(data.tags) ? data.tags : [],
            authorId: data.authorId,
            authorName: data.authorName,
            authorPhoto: data.authorPhoto || '',
            status: data.status,
            isPinned: Boolean(data.isPinned),
            repliesCount: Number(data.repliesCount || 0),
            upvotesCount: Number(data.upvotesCount || 0),
            acceptedReplyId: data.acceptedReplyId || '',
            company: data.company || '',
            location: data.location || '',
            jobType: data.jobType || '',
            deadline: data.deadline || '',
            applyInfo: data.applyInfo || '',
            coverImage: data.coverImage || '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            lastActivityAt: data.lastActivityAt || data.createdAt || null,
          };
        });
        setTopics(list);
        setLoadingTopics(false);
      },
      (error) => {
        setLoadingTopics(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady]);

  const topicsForVoteSync = useMemo(() => {
    if (sharedTopicFallback && !topics.some((t) => t.id === sharedTopicFallback.id)) {
      return [...topics, sharedTopicFallback];
    }
    return topics;
  }, [topics, sharedTopicFallback]);

  useEffect(() => {
    if (!authReady || !user || topicsForVoteSync.length === 0) {
      setVotedTopicIds(new Set());
      return;
    }

    const unsubs = topicsForVoteSync.map((t) => {
      const voteRef = doc(db, 'topics', t.id, 'votes', user.uid);
      return onSnapshot(
        voteRef,
        (snap) => {
          setVotedTopicIds((prev) => {
            const next = new Set(prev);
            if (snap.exists()) {
              next.add(t.id);
            } else {
              next.delete(t.id);
            }
            return next;
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `topics/${t.id}/votes/${user.uid}`);
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, topicsForVoteSync]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (selectedTopicId) {
      if (url.searchParams.get('mada') !== selectedTopicId) {
        url.searchParams.set('mada', selectedTopicId);
        window.history.replaceState({}, '', url.toString());
      }
    } else if (url.searchParams.has('mada')) {
      url.searchParams.delete('mada');
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedTopicId]);

  useEffect(() => {
    if (!authReady || !selectedTopicId) {
      setSharedTopicFallback(null);
      setLoadingSharedTopic(false);
      return;
    }

    if (topics.some((t) => t.id === selectedTopicId)) {
      setSharedTopicFallback(null);
      setLoadingSharedTopic(false);
      return;
    }

    let cancelled = false;
    setLoadingSharedTopic(true);

    getDoc(doc(db, 'topics', selectedTopicId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setSharedTopicFallback(null);
          return;
        }
        const data = snap.data();
        if (data.status !== 'open' && data.status !== 'locked') {
          setSharedTopicFallback(null);
          return;
        }
        setSharedTopicFallback({
          id: snap.id,
          title: data.title,
          body: data.body,
          category: data.category,
          tags: Array.isArray(data.tags) ? data.tags : [],
          authorId: data.authorId,
          authorName: data.authorName,
          authorPhoto: data.authorPhoto || '',
          status: data.status,
          isPinned: Boolean(data.isPinned),
          repliesCount: Number(data.repliesCount || 0),
          upvotesCount: Number(data.upvotesCount || 0),
          acceptedReplyId: data.acceptedReplyId || '',
          company: data.company || '',
          location: data.location || '',
          jobType: data.jobType || '',
          deadline: data.deadline || '',
          applyInfo: data.applyInfo || '',
          coverImage: data.coverImage || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          lastActivityAt: data.lastActivityAt || data.createdAt || null,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setSharedTopicFallback(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSharedTopic(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, selectedTopicId, topics]);

  useEffect(() => {
    if (!authReady || !user) {
      setReports([]);
      return;
    }

    const path = 'reports';
    const q = isAdmin
      ? query(collection(db, 'reports'))
      : query(collection(db, 'reports'), where('reporterId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Report[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            reporterId: data.reporterId,
            targetType: data.targetType,
            targetId: data.targetId,
            topicId: data.topicId,
            reason: data.reason,
            details: data.details || '',
            status: data.status,
            createdAt: data.createdAt || null,
          };
        });
        list.sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });
        setReports(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user, isAdmin]);

  const selectedTopic = useMemo(
    () =>
      topics.find((t) => t.id === selectedTopicId) ||
      (sharedTopicFallback?.id === selectedTopicId ? sharedTopicFallback : null),
    [topics, selectedTopicId, sharedTopicFallback]
  );

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast(
        tr(
          'Karibu Malosha Forums! Umeingia kikamilifu.',
          'Welcome to Malosha Forums! You are signed in.'
        )
      );
    } catch (err) {
      console.error(err);
      showToast(
        tr(
          'Imeshindwa kuingia na Google. Tafadhali jaribu tena.',
          'Failed to sign in with Google. Please try again.'
        ),
        'error'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setOnlyMine(false);
    setLang('sw');
    showToast('Umetoka kwenye akaunti yako.');
  };

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setSelectedTopicId(null);
    if (tab === 'kijiweni') {
      setSelectedCategory('Kijiweni');
    } else if (tab === 'fursa') {
      setSelectedCategory('Fursa');
    } else if (tab === 'makala') {
      setSelectedCategory('Makala');
    } else {
      setSelectedCategory('all');
    }
  };

  const handleSelectBoard = (board: TopicCategory) => {
    const normalized = normalizeBoardCategory(board);
    setSelectedCategory(normalized);
    setSelectedTopicId(null);
    if (normalized === 'Kijiweni') setActiveTab('kijiweni');
    else if (normalized === 'Fursa') setActiveTab('fursa');
    else setActiveTab('makala');
  };

  const latestMakala = useMemo(() => {
    return topics
      .filter((t) => normalizeBoardCategory(t.category) === 'Makala')
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      });
  }, [topics]);

  useEffect(() => {
    if (loadingTopics) return;
    if (!initialNewsLoadedRef.current) {
      knownNewsIdsRef.current = new Set(latestMakala.map((m) => m.id));
      initialNewsLoadedRef.current = true;
      return;
    }
    const newlyPublished = latestMakala.find((m) => !knownNewsIdsRef.current.has(m.id));
    knownNewsIdsRef.current = new Set(latestMakala.map((m) => m.id));
    if (newlyPublished && newlyPublished.authorId !== user?.uid) {
      showToast(
        tr(`Habari Mpya: ${newlyPublished.title}`, `Breaking News: ${newlyPublished.title}`)
      );
    }
  }, [loadingTopics, latestMakala, user?.uid, showToast, tr]);

  const handleOpenNewTopic = () => {
    if (!user) {
      void handleSignIn();
      return;
    }
    const viewingInlineBoard =
      !selectedTopicId &&
      (activeTab === 'kijiweni' ||
        activeTab === 'fursa' ||
        activeTab === 'makala' ||
        (activeTab === 'all' &&
          (selectedCategory === 'Kijiweni' ||
            selectedCategory === 'Fursa' ||
            selectedCategory === 'Makala')));

    if (viewingInlineBoard) {
      setInlineExpandRequest((n) => n + 1);
      return;
    }
    setEditingTopic(null);
    setComposerOpen(true);
  };

  const handleSaveTopic = async (data: {
    title: string;
    body: string;
    category: TopicCategory;
    tags: string[];
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => {
    if (!user) return;
    if (editingTopic) {
      await editTopic(editingTopic.id, data);
      showToast(tr('Mabadiliko yamehifadhiwa.', 'Changes saved.'));
    } else {
      const newId = await createTopic(
        user,
        userProfile?.displayName || user.displayName || 'Mwanachama',
        data
      );
      setSelectedTopicId(newId);
      showToast(tr('Chapisho lako jipya limewekwa hewani!', 'Your new post is now live!'));
    }
  };

  const handleCreateKijiweniPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Kijiweni',
        tags: data.tags,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(tr('Chapisho lako limewekwa Kijiweni!', 'Your post is now live in Kijiweni!'));
  };

  const handleCreateFursaPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Fursa',
        tags: data.tags,
        company: data.company,
        location: data.location,
        jobType: data.jobType,
        deadline: data.deadline,
        applyInfo: data.applyInfo,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(tr('Tangazo lako la fursa limewekwa hewani!', 'Your opportunity listing is live!'));
  };

  const handleCreateMakalaPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => {
    if (!user) {
      await handleSignIn();
      return;
    }
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Makala',
        tags: data.tags,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(
      tr(
        'Makala yako imechapishwa kwenye chumba cha habari!',
        'Your article has been published to the newsroom!'
      )
    );
  };

  const handleToggleTopicVote = async (topic: Topic) => {
    if (!user) {
      showToast(
        tr('Ingia na Google ili kupenda chapisho.', 'Sign in with Google to like this post.'),
        'error'
      );
      return;
    }
    const hasVoted = votedTopicIds.has(topic.id);
    await toggleTopicVote(topic.id, user.uid, hasVoted);
  };

  const handleToggleLock = async (topic: Topic) => {
    const nextStatus = topic.status === 'locked' ? 'open' : 'locked';
    await updateTopicStatus(topic.id, nextStatus);
    showToast(
      nextStatus === 'locked'
        ? tr(
            'Mjadala umefungwa. Majibu mapya yamesitishwa.',
            'Discussion locked. New replies are disabled.'
          )
        : tr('Mjadala umefunguliwa tena.', 'Discussion reopened.')
    );
  };

  const handleTogglePin = async (topic: Topic) => {
    await toggleTopicPin(topic.id, !topic.isPinned);
    showToast(
      !topic.isPinned
        ? tr('Mada imebandikwa juu.', 'Post pinned to top.')
        : tr('Bandiko limeondolewa.', 'Post unpinned.')
    );
  };

  const handleDeleteTopic = (topic: Topic) => {
    setConfirmState({
      title: tr('Futa Mada Hii?', 'Delete This Post?'),
      message: tr(
        'Je, una uhakika unataka kufuta mada hii kabisa? Hatua hii haiwezi kubatilishwa.',
        'Are you sure you want to permanently delete this post? This action cannot be undone.'
      ),
      confirmLabel: tr('Ndiyo, Futa Mada', 'Yes, Delete Post'),
      destructive: true,
      action: async () => {
        await deleteTopic(topic.id);
        setSelectedTopicId(null);
        showToast(tr('Mada imefutwa.', 'Post deleted.'));
      },
    });
  };

  const handleSubmitReport = async (reason: ReportReason, details: string) => {
    if (!user || !reportTarget) return;
    await submitReport(
      user.uid,
      reportTarget.targetType,
      reportTarget.targetId,
      reportTarget.topicId,
      reason,
      details
    );
    showToast(
      tr(
        'Ripoti yako imepokelewa na itakaguliwa kwa usalama wa jukwaa.',
        'Your report was received and will be reviewed for community safety.'
      )
    );
  };

  const handleSeedStarterTopics = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await seedStarterTopics(
        user,
        userProfile?.displayName || user.displayName || 'Mwanachama'
      );
      showToast(
        tr(
          'Maudhui ya mfano ya Kijiweni, Fursa, na Makala yamepakiwa.',
          'Starter posts for Kijiweni, Opportunities, and Articles loaded.'
        )
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveProfile = async (displayName: string, bio: string) => {
    if (!user) return;
    await updateUserProfile(user.uid, displayName, bio);
  };

  const composerDefaultCategory: TopicCategory | 'all' =
    activeTab === 'kijiweni'
      ? 'Kijiweni'
      : activeTab === 'fursa'
        ? 'Fursa'
        : activeTab === 'makala'
          ? 'Makala'
          : selectedCategory;

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F4F8] text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenTopic={(id) => setSelectedTopicId(id)}
        topics={topics}
        userUid={user?.uid || null}
        userProfile={userProfile}
        userDisplayName={user?.displayName || 'Mwanachama'}
        userPhoto={user?.photoURL || ''}
        isAdmin={isAdmin}
        onOpenComposer={handleOpenNewTopic}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authBusy={authBusy}
      />

      <main className="flex-1">
        {selectedTopic ? (
          <TopicDetail
            topic={selectedTopic}
            latestMakala={latestMakala}
            onOpenTopic={(id) => setSelectedTopicId(id)}
            userUid={user?.uid || null}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            hasVotedTopic={votedTopicIds.has(selectedTopic.id)}
            onBack={() => setSelectedTopicId(null)}
            onSelectBoard={handleSelectBoard}
            onToggleTopicVote={handleToggleTopicVote}
            onShareTopic={(t) => {
              void shareTopic(t, (msg) => showToast(msg), lang);
            }}
            onEditTopic={(t) => {
              setEditingTopic(t);
              setComposerOpen(true);
            }}
            onToggleLock={handleToggleLock}
            onTogglePin={handleTogglePin}
            onDeleteTopic={handleDeleteTopic}
            onOpenReport={(targetType, targetId) => {
              setReportTarget({
                targetType,
                targetId,
                topicId: selectedTopic.id,
              });
            }}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : selectedTopicId && (loadingTopics || loadingSharedTopic) ? (
          <div className="mx-auto max-w-4xl px-3.5 py-6 sm:px-6 sm:py-8">
            <div className="rounded-xl border border-slate-200 bg-white p-6 animate-pulse sm:rounded-lg">
              <p className="text-xs font-semibold text-[#1D4E89]">
                {tr('Inafungua tangazo...', 'Loading post...')}
              </p>
              <div className="mt-3 h-6 w-3/4 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
              <div className="mt-5 space-y-2.5">
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="h-4 w-5/6 rounded bg-slate-100" />
                <div className="h-4 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
          </div>
        ) : selectedTopicId ? (
          <div className="mx-auto max-w-2xl px-3.5 py-10 sm:px-6">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center sm:rounded-lg">
              <h1 className="font-display text-xl font-bold text-slate-900">
                {tr('Tangazo hili halikupatikana', 'This post could not be found')}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {tr(
                  'Huenda tangazo au mada hii imeondolewa na mwandishi au kiungo si sahihi.',
                  'This post or listing may have been removed by the author, or the link is invalid.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setSelectedTopicId(null)}
                className="mt-5 inline-flex min-h-[42px] items-center rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F]"
              >
                {tr('Rudi Kwenye Jukwaa', 'Back to Forum')}
              </button>
            </div>
          </div>
        ) : activeTab === 'safety' ? (
          <SafetyGuidelinesView
            userUid={user?.uid || null}
            userEmail={user?.email || null}
            userProfile={userProfile}
            isAdmin={isAdmin}
            myReports={reports}
            onSaveProfile={handleSaveProfile}
            onSignIn={handleSignIn}
            onUpdateReportStatus={async (id, status) => {
              await updateReportStatus(id, status);
              showToast(tr('Hali ya ripoti imesasishwa.', 'Report status updated.'));
            }}
            onOpenTopic={(topicId) => {
              setSelectedTopicId(topicId);
            }}
            onToast={showToast}
          />
        ) : (
          <TopicList
            topics={topics}
            loading={loadingTopics}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            sortMode={sortMode}
            onChangeSort={setSortMode}
            searchQuery={searchQuery}
            onChangeSearch={setSearchQuery}
            onlyMine={onlyMine}
            onToggleOnlyMine={() => setOnlyMine((prev) => !prev)}
            userUid={user?.uid || null}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            votedTopicIds={votedTopicIds}
            onToggleVote={handleToggleTopicVote}
            onShareTopic={(t) => {
              void shareTopic(t, (msg) => showToast(msg), lang);
            }}
            onOpenTopic={(id) => setSelectedTopicId(id)}
            onOpenComposer={handleOpenNewTopic}
            onCreateKijiweniPost={handleCreateKijiweniPost}
            onCreateFursaPost={handleCreateFursaPost}
            onCreateMakalaPost={handleCreateMakalaPost}
            inlineExpandRequest={inlineExpandRequest}
            onEditTopic={(t) => {
              setEditingTopic(t);
              setComposerOpen(true);
            }}
            onDeleteTopic={handleDeleteTopic}
            onOpenReport={(targetType, targetId, topicId) => {
              setReportTarget({
                targetType,
                targetId,
                topicId,
              });
            }}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
            onSeedStarterTopics={handleSeedStarterTopics}
            seeding={seeding}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 pb-20 md:pb-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} Malosha Forums. Kijiweni ·{' '}
            {tr('Fursa', 'Opportunities')} · {tr('Makala', 'Articles')} ·{' '}
            {tr('Zilizovuma', 'Trending')}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => handleSelectTab('kijiweni')}
              className="hover:text-slate-900 hover:underline"
            >
              Kijiweni
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('fursa')}
              className="hover:text-slate-900 hover:underline"
            >
              {tr('Fursa', 'Opportunities')}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('makala')}
              className="hover:text-slate-900 hover:underline"
            >
              {tr('Makala', 'Articles')}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('safety')}
              className="hover:text-slate-900 hover:underline"
            >
              {tr('Kanuni za Usalama', 'Safety Guidelines')}
            </button>
          </div>
        </div>
      </footer>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {/* Modals */}
      <TopicComposerModal
        isOpen={composerOpen}
        editingTopic={editingTopic}
        defaultCategory={composerDefaultCategory}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleSaveTopic}
      />

      <ReportModal
        isOpen={reportTarget !== null}
        targetType={reportTarget?.targetType || 'topic'}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitReport}
      />

      <ConfirmDialog
        isOpen={confirmState !== null}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel || 'Thibitisha'}
        destructive={confirmState?.destructive}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (confirmState) {
            const fn = confirmState.action;
            setConfirmState(null);
            await fn();
          }
        }}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 bottom-20 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg md:bottom-4 ${
            toast.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-slate-200 bg-[#163A5F] text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <UserBadgesProvider>
          <ForumShell />
        </UserBadgesProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
