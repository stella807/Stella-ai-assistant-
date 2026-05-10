'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@/components/UI';
import { useApp } from '@/store/AppContext';

export default function CreateLeaguePage() {
  const router = useRouter();
  const { createLeague } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    stake: 50,
    type: 'consistency' as const,
    gymName: '',
    lat: 34.0522,
    lng: -118.2437,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLeague({
      name: formData.name,
      description: formData.description,
      stake: formData.stake,
      type: formData.type,
      homeGym: {
        name: formData.gymName,
        lat: formData.lat,
        lng: formData.lng,
      },
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    router.push('/leagues');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create a New League</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Set the rules, stake the points, and invite your rivals.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">League Name</label>
            <input
              required
              type="text"
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="e.g. 5 AM Warriors"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <textarea
              required
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none min-h-[100px]"
              placeholder="What are the rules of this challenge?"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Stake Amount (Points)</label>
              <input
                required
                type="number"
                min="10"
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.stake}
                onChange={e => setFormData({...formData, stake: parseInt(e.target.value)})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Challenge Type</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
              >
                <option value="consistency">Consistency</option>
                <option value="strength">Strength PRs</option>
                <option value="metrics">Body Metrics</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Home Gym Name</label>
            <input
              required
              type="text"
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="e.g. Iron Paradise LA"
              value={formData.gymName}
              onChange={e => setFormData({...formData, gymName: e.target.value})}
            />
            <p className="text-xs text-zinc-500 mt-1">Users must be near this location to verify workouts.</p>
          </div>

          <div className="pt-4 flex gap-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" className="flex-1">Create & Stake Points</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
