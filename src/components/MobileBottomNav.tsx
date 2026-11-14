import React from 'react';
import { BookOpen, Briefcase, Coffee, Flame } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { NavTab } from '../types';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
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
    { id: 'trending', label: tr('Zilizovuma', 'Trending'), icon: Flame },
  ];

  return (
    <nav
      aria-label={tr('Urambazaji wa simu', 'Mobile navigation')}
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
    >
      <div className="grid h-14 grid-cols-4 items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-col items-center justify-center px-1 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1D4E89] ${
                active
                  ? 'font-semibold text-[#0E2640]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 h-0.5 w-8 rounded-b-full bg-[#D97706]"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={`h-5 w-5 ${active ? 'text-[#0E2640]' : 'text-slate-500'}`}
                aria-hidden="true"
              />
              <span className="mt-0.5 text-[11px] leading-none tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
