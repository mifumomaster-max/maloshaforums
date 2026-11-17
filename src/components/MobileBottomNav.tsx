import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { NavTab, NavUnreadCounts } from '../types';
import { NavIconSection, NavSectionIcon } from './NavIcons';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadCounts?: NavUnreadCounts;
  unreadChatCount?: number;
  hidden?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  unreadCounts,
  unreadChatCount = 0,
  hidden = false,
}) => {
  const { tr } = useLanguage();

  if (hidden) return null;

  const counts: NavUnreadCounts = unreadCounts || {
    kijiweni: 0,
    fursa: 0,
    makala: 0,
    chat: unreadChatCount,
  };

  const items: {
    id: NavTab;
    iconSection: NavIconSection;
    label: string;
    unread: number;
    badgeTone: 'crimson' | 'green';
  }[] = [
    {
      id: 'kijiweni',
      iconSection: 'kijiweni',
      label: 'Kijiweni',
      unread: counts.kijiweni,
      badgeTone: 'crimson',
    },
    {
      id: 'fursa',
      iconSection: 'fursa',
      label: tr('Fursa', 'Jobs'),
      unread: counts.fursa,
      badgeTone: 'crimson',
    },
    {
      id: 'makala',
      iconSection: 'makala',
      label: tr('Makala', 'News'),
      unread: counts.makala,
      badgeTone: 'crimson',
    },
    {
      id: 'chat',
      iconSection: 'chat',
      label: 'Mchart',
      unread: counts.chat,
      badgeTone: 'green',
    },
    {
      id: 'trending',
      iconSection: 'trending',
      label: tr('Vuma', 'Hot'),
      unread: 0,
      badgeTone: 'crimson',
    },
  ];

  return (
    <nav
      aria-label={tr('Urambazaji wa simu', 'Mobile navigation')}
      className="fixed right-0 bottom-0 left-0 z-40 transform-gpu border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] will-change-transform md:hidden"
    >
      <div className="grid h-[58px] grid-cols-5 items-center">
        {items.map((item) => {
          const active = activeTab === item.id;
          const showBadge = item.unread > 0 && !active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[48px] flex-col items-center justify-center px-0.5 py-1 transition-all focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1D4E89] ${
                active
                  ? 'bg-amber-50/55 font-bold text-[#0E2640]'
                  : 'text-slate-600 hover:bg-slate-50/80 hover:text-slate-900'
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gradient-to-r from-[#D97706] to-[#F59E0B]"
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative inline-flex items-center justify-center transition-transform duration-150 ${
                  active ? 'scale-110 drop-shadow-[0_2px_4px_rgba(14,38,64,0.18)]' : ''
                }`}
              >
                <NavSectionIcon section={item.iconSection} className="h-[23px] w-[23px]" />
                {showBadge && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[9px] font-extrabold leading-none ring-2 ring-white shadow-sm tabular-nums ${
                      item.badgeTone === 'green'
                        ? 'bg-[#25D366] text-[#052e27]'
                        : 'bg-[#E11D48] text-white'
                    }`}
                  >
                    {item.unread > 99 ? '99+' : item.unread}
                  </span>
                )}
              </span>
              <span
                className={`mt-1 text-[10px] leading-none tracking-tight ${
                  active ? 'font-bold text-[#0E2640]' : 'font-medium text-slate-600'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
