'use client';

import { use, useState } from 'react';
import { mockLeagues, mockUsers, mockTrashTalk, currentUser } from '@/lib/mockData';
import { Card, Button, Badge } from '@/components/UI';
import Link from 'next/link';

export default function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const league = mockLeagues.find(l => l.id === id);
  const [messages, setMessages] = useState(mockTrashTalk.filter(t => t.leagueId === id));
  const [newMessage, setNewMessage] = useState('');

  if (!league) return <div>League not found</div>;

  const participants = mockUsers.filter(u => league.participants.includes(u.id));

  // Mock leaderboard calculation
  const leaderboard = participants.map((u, i) => ({
    userId: u.id,
    userName: u.name,
    score: 10 - i * 2 + (u.id === currentUser.id ? 5 : 0), // Randomish scores
    rank: i + 1,
  })).sort((a, b) => b.score - a.score);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg = {
      id: Date.now().toString(),
      userId: currentUser.id,
      leagueId: league.id,
      message: newMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, msg]);
    setNewMessage('');
  };

  return (
    <div className="space-y-8">
      {/* League Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="info">{league.type.toUpperCase()}</Badge>
            <span className="text-sm text-zinc-500 font-medium">Ends {new Date(league.endDate).toLocaleDateString()}</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight uppercase italic text-zinc-900 dark:text-white leading-none">
            {league.name}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-4 max-w-2xl">{league.description}</p>
        </div>
        <div className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 p-6 rounded-2xl flex flex-col items-center justify-center min-w-[200px]">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Total Prize Pool</span>
          <span className="text-4xl font-black mt-1">{league.prizePool} pts</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leaderboard */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            🏆 Leaderboard
          </h2>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Rank</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Athlete</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {leaderboard.map((entry, index) => (
                  <tr key={entry.userId} className={entry.userId === currentUser.id ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}>
                    <td className="px-6 py-4">
                      <span className={`
                        inline-flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm
                        ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                          index === 1 ? 'bg-zinc-200 text-zinc-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' : 'text-zinc-500'}
                      `}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold">
                          {entry.userName.charAt(0)}
                        </div>
                        <span className="font-semibold">{entry.userName} {entry.userId === currentUser.id && '(You)'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-lg">{entry.score}</span>
                      <span className="text-xs text-zinc-400 ml-1">pts</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Trash Talk Feed */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            💬 Trash Talk
          </h2>
          <Card className="flex flex-col h-[500px]">
            <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
              {messages.map((msg) => {
                const user = mockUsers.find(u => u.id === msg.userId);
                const isMe = msg.userId === currentUser.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {user?.name}
                      </span>
                    </div>
                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] ${
                      isMe
                        ? 'bg-orange-600 text-white rounded-tr-none'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Talk some trash..."
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 h-8 w-8 bg-orange-600 text-white rounded-lg flex items-center justify-center hover:bg-orange-700 transition-colors"
                >
                  ↑
                </button>
              </div>
            </form>
          </Card>

          <Card title="League Rules" className="bg-zinc-50 dark:bg-zinc-900/30 border-dashed">
            <ul className="text-xs space-y-2 text-zinc-500">
              <li className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">•</span>
                Must check-in at <strong>{league.homeGym.name}</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">•</span>
                Verification requires GPS proximity (within 200m)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">•</span>
                Maximum 1 verified workout per day
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
