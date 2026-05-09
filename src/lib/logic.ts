import { User } from '@/types';

/**
 * Calculates the prize pool based on participants and stake.
 * In a real app, this would also deduct the app's take rate (e.g. 10%).
 */
export const calculatePrizePool = (participantCount: number, stake: number, takeRate = 0.1): number => {
  const total = participantCount * stake;
  return total * (1 - takeRate);
};

/**
 * Simulates staking points from a user.
 */
export const stakePoints = (user: User, amount: number): User => {
  if (user.credits < amount) {
    throw new Error('Insufficient credits to join this league.');
  }
  return {
    ...user,
    credits: user.credits - amount
  };
};

/**
 * Simulates awarding the prize pool to a winner.
 */
export const awardPrize = (user: User, poolAmount: number): User => {
  return {
    ...user,
    credits: user.credits + poolAmount
  };
};

/**
 * GPS Distance calculation (Haversine formula) to verify proximity.
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};

export const isWithinGymRange = (userLat: number, userLng: number, gymLat: number, gymLng: number, rangeLimit = 200): boolean => {
  const distance = calculateDistance(userLat, userLng, gymLat, gymLng);
  return distance <= rangeLimit;
};
