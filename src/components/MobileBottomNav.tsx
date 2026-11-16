import React from 'react';
import { BookOpen, Briefcase, Coffee, Flame, MessageCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { NavTab } from '../types';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadChatCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  unreadChatCount = 0,
}) => {
  const { tr } = useLanguage();

  const items: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'kijiweni', label: 'Kijiweni', icon: Coffee },
    { id: 'fursa', label: tr('Fursa', 'Jobs'), icon: Briefcase },
    { id: 'makala', label: tr('Makala', 'News'), icon: BookOpen },
    { id: 'chat', label: 'Mchart', icon: MessageCircle },
    { id: 'trending', label: tr('Vuma', 'Hot'), icon: Flame },
  ];

  return (
    <nav
      aria-label={tr('Urambazaji wa simu', 'Mobile navigation')}
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid h-14 grid-cols-5 items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const showBadge = item.id === 'chat' && unreadChatCount > 0 && !active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-col items-center justify-center px-0.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1D4E89] ${
                active
                  ? 'font-semibold text-[#0E2640]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 h-0.5 w-7 rounded-b-full bg-[#D97706]"
                  aria-hidden="true"
                />
              )}
              <span className="relative inline-flex">
                <Icon
                  className={`h-5 w-5 ${active ? 'text-[#0E2640]' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[9px] font-extrabold leading-none text-[#073D35] ring-2 ring-white tabular-nums">
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
              </span>
              <span className="mt-0.5 text-[10px] leading-none tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
