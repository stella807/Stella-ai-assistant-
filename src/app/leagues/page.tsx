'use client';

import { Card, Button, Badge } from '@/components/UI';
import { useApp } from '@/store/AppContext';
import Link from 'next/link';

export default function LeaguesPage() {
  const { user, leagues, joinLeague } = useApp();

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Explore Leagues</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Join a challenge and stake your claim.</p>
        </div>
        <Link href="/leagues/create">
          <Button variant="primary">Create League</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {leagues.map(league => {
          const isParticipant = league.participants.includes(user.id);
          return (
            <Card key={league.id} className="flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <Badge variant={league.type === 'consistency' ? 'info' : 'warning'}>
                    {league.type.toUpperCase()}
                  </Badge>
                  <h3 className="text-xl font-bold mt-2">{league.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-orange-600">{league.stake}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Stake (pts)</div>
                </div>
              </div>

              <p className="text-zinc-600 dark:text-zinc-400 mb-6 flex-grow">
                {league.description}
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Home Gym:</span>
                  {league.homeGym.name}
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Prize Pool:</span>
                  <span className="text-orange-600 font-bold">{league.prizePool} pts</span>
                </div>

                <div className="pt-4 flex gap-3">
                  <Link href={`/leagues/${league.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full">View Details</Button>
                  </Link>
                  {!isParticipant && (
                    <Button variant="primary" className="flex-1" onClick={() => joinLeague(league.id)}>Join Challenge</Button>
                  )}
                  {isParticipant && (
                    <div className="flex-1 flex items-center justify-center text-sm font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30">
                      Already Joined
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
