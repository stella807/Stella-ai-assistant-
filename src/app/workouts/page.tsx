'use client';

import { useState } from 'react';
import { Card, Button, Badge } from '@/components/UI';
import { useApp } from '@/store/AppContext';
import { isWithinGymRange } from '@/lib/logic';
import { useRouter } from 'next/navigation';

export default function WorkoutsPage() {
  const router = useRouter();
  const { user, leagues, workouts, logWorkout } = useApp();
  const userLeagues = leagues.filter(l => l.participants.includes(user.id));

  const [selectedLeagueId, setSelectedLeagueId] = useState(userLeagues[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);

  const handleVerifyLocation = () => {
    setIsVerifying(true);
    setVerificationStatus('idle');
    setErrorMessage('');

    if (!navigator.geolocation) {
      setVerificationStatus('error');
      setErrorMessage('Geolocation is not supported by your browser');
      setIsVerifying(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });

        if (selectedLeague) {
          const verified = isWithinGymRange(
            latitude, longitude,
            selectedLeague.homeGym.lat, selectedLeague.homeGym.lng
          );

          if (verified) {
            setVerificationStatus('success');
          } else {
            setVerificationStatus('error');
            setErrorMessage(`You are not at ${selectedLeague.homeGym.name}. Please check in at the gym.`);
          }
        }
        setIsVerifying(false);
      },
      (error) => {
        setVerificationStatus('error');
        setErrorMessage('Unable to retrieve your location. Please enable GPS.');
        setIsVerifying(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleLogWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationStatus !== 'success' || !location) return;

    logWorkout({
      leagueId: selectedLeagueId,
      notes,
      location,
      timestamp: new Date().toISOString()
    }, true);

    router.push('/');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Log Your Workout</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Verify your location to earn points for your league.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Card>
            <form onSubmit={handleLogWorkout} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Select League</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  value={selectedLeagueId}
                  onChange={e => {
                      setSelectedLeagueId(e.target.value);
                      setVerificationStatus('idle');
                      setErrorMessage('');
                  }}
                >
                  {userLeagues.length > 0 ? userLeagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  )) : (
                    <option value="">No active leagues</option>
                  )}
                </select>
              </div>

              {selectedLeague && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Required Location</span>
                    <Badge variant="info">Verification Active</Badge>
                  </div>
                  <p className="font-bold">{selectedLeague.homeGym.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">Latitude: {selectedLeague.homeGym.lat}, Longitude: {selectedLeague.homeGym.lng}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">GPS Verification</label>
                  {verificationStatus === 'success' && <Badge variant="success">✓ Verified</Badge>}
                  {verificationStatus === 'error' && <Badge variant="danger">Verification Failed</Badge>}
                </div>

                {verificationStatus !== 'success' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full h-12 relative overflow-hidden"
                    onClick={handleVerifyLocation}
                    disabled={isVerifying || !selectedLeague}
                  >
                    {isVerifying ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></span>
                        Checking GPS...
                      </span>
                    ) : 'Verify I am at the gym'}
                  </Button>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-4 rounded-xl text-center">
                    <p className="text-green-600 font-bold text-sm">Location Verified! You are at {selectedLeague?.homeGym.name}.</p>
                  </div>
                )}
                {errorMessage && <p className="text-xs text-red-500 text-center">{errorMessage}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Workout Notes (Optional)</label>
                <textarea
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 outline-none min-h-[100px]"
                  placeholder="What did you crush today?"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-12"
                disabled={verificationStatus !== 'success'}
              >
                Complete Workout & Log Progress
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold italic uppercase">Recent History</h2>
          <div className="space-y-4">
            {workouts.map(w => (
              <div key={w.id} className="relative pl-6 pb-6 border-l-2 border-zinc-100 dark:border-zinc-800 last:pb-0">
                <div className="absolute left-[-9px] top-0 h-4 w-4 rounded-full bg-orange-600 border-4 border-white dark:border-zinc-950"></div>
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-tighter mb-1">
                  {new Date(w.timestamp).toLocaleDateString()}
                </div>
                <div className="text-sm font-semibold mb-1">
                  {leagues.find(l => l.id === w.leagueId)?.name || 'Deleted League'}
                </div>
                <p className="text-xs text-zinc-500 italic">"{w.notes}"</p>
                <div className="mt-2">
                  <Badge variant={w.verified ? "success" : "neutral"}>{w.verified ? "Verified" : "Manual"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
