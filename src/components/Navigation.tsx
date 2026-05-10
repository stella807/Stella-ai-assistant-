'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/store/AppContext';

export const Navbar: React.FC = () => {
  const { user } = useApp();

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                GYMBET
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">Dashboard</Link>
              <Link href="/leagues" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">Leagues</Link>
              <Link href="/workouts" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">Workouts</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Credits</span>
              <span className="text-sm font-bold text-orange-600">{user.credits} pts</span>
            </div>
            <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-bold border border-zinc-300 dark:border-zinc-700">
              {user.name.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
