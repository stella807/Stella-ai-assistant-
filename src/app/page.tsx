'use client';

import { Card, Button, Badge } from '@/components/UI';
import { useApp } from '@/store/AppContext';
import Link from 'next/link';

export default function Home() {
  const { user, leagues, workouts } = useApp();
  const userLeagues = leagues.filter(l => l.participants.includes(user.id));

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}! 👋</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">You have {userLeagues.length} active challenges.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/workouts">
            <Button variant="primary">Log Workout</Button>
          </Link>
          <Link href="/leagues">
            <Button variant="secondary">Join League</Button>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Leagues */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold">Your Leagues</h2>
          <div className="grid grid-cols-1 gap-4">
            {userLeagues.length > 0 ? userLeagues.map(league => (
              <Link key={league.id} href={`/leagues/${league.id}`}>
                <Card className="hover:border-orange-500/50 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg">{league.name}</h3>
                        <Badge variant="info">{league.type}</Badge>
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-1">{league.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-orange-600">Pool: {league.prizePool} pts</div>
                      <div className="text-xs text-zinc-400 mt-1">{league.participants.length} participants</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-sm">
                    <span className="text-zinc-500">Ends {new Date(league.endDate).toLocaleDateString()}</span>
                    <span className="font-medium text-orange-600">View Leaderboard →</span>
                  </div>
                </Card>
              </Link>
            )) : (
              <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                <p className="text-zinc-500">You haven't joined any leagues yet.</p>
                <Link href="/leagues">
                  <Button variant="ghost" className="mt-4">Browse Leagues</Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar stats & Activity */}
        <div className="space-y-8">
          {/* Stats Card */}
          <Card title="Your Stats">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Total Credits</span>
                <span className="font-bold">{user.credits} pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Rankings</span>
                <span className="font-bold text-green-600">#1 (Top 5%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Streak</span>
                <span className="font-bold text-orange-600">🔥 5 Days</span>
              </div>
            </div>
          </Card>

          {/* Recent Activity */}
          <Card title="Recent Activity">
            <div className="space-y-4">
              {workouts.slice(0, 5).map(workout => (
                <div key={workout.id} className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 shrink-0">
                    🏋️
                  </div>
                  <div>
                    <p className="text-sm font-medium">Logged a workout at {leagues.find(l => l.id === workout.leagueId)?.homeGym.name || 'Gym'}</p>
                    <p className="text-xs text-zinc-400">{new Date(workout.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {workouts.length === 0 && <p className="text-xs text-zinc-500 text-center">No activity yet.</p>}
              <Link href="/workouts" className="block text-center text-sm text-orange-600 font-medium pt-2">
                View all history
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
