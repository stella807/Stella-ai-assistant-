'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, League, Workout, TrashTalk } from '@/types';
import { mockUsers, mockLeagues, mockWorkouts, mockTrashTalk, currentUser as initialUser } from '@/lib/mockData';
import { stakePoints, calculatePrizePool } from '@/lib/logic';

interface AppState {
  user: User;
  leagues: League[];
  workouts: Workout[];
  messages: TrashTalk[];
  joinLeague: (leagueId: string) => void;
  createLeague: (league: Omit<League, 'id' | 'participants' | 'prizePool'>) => void;
  logWorkout: (workout: Omit<Workout, 'id' | 'userId' | 'verified'>, isVerified: boolean) => void;
  addMessage: (leagueId: string, message: string) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(initialUser);
  const [leagues, setLeagues] = useState<League[]>(mockLeagues);
  const [workouts, setWorkouts] = useState<Workout[]>(mockWorkouts);
  const [messages, setMessages] = useState<TrashTalk[]>(mockTrashTalk);

  const joinLeague = (leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (!league) return;
    if (league.participants.includes(user.id)) return;

    try {
      const updatedUser = stakePoints(user, league.stake);
      setUser(updatedUser);

      setLeagues(prev => prev.map(l => {
        if (l.id === leagueId) {
          const newParticipants = [...l.participants, user.id];
          return {
            ...l,
            participants: newParticipants,
            prizePool: calculatePrizePool(newParticipants.length, l.stake)
          };
        }
        return l;
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to join league');
    }
  };

  const createLeague = (leagueData: Omit<League, 'id' | 'participants' | 'prizePool'>) => {
    try {
      const updatedUser = stakePoints(user, leagueData.stake);
      setUser(updatedUser);

      const newLeague: League = {
        ...leagueData,
        id: `l${leagues.length + 1}`,
        participants: [user.id],
        prizePool: calculatePrizePool(1, leagueData.stake)
      };

      setLeagues(prev => [...prev, newLeague]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create league');
    }
  };

  const logWorkout = (workoutData: Omit<Workout, 'id' | 'userId' | 'verified'>, isVerified: boolean) => {
    const newWorkout: Workout = {
      ...workoutData,
      id: `w${workouts.length + 1}`,
      userId: user.id,
      verified: isVerified,
    };
    setWorkouts(prev => [newWorkout, ...prev]);
  };

  const addMessage = (leagueId: string, message: string) => {
    const newMessage: TrashTalk = {
      id: `t${messages.length + 1}`,
      userId: user.id,
      leagueId,
      message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  return (
    <AppContext.Provider value={{
      user, leagues, workouts, messages,
      joinLeague, createLeague, logWorkout, addMessage
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
