import { Navbar } from '@/components/Navigation';
import { AppProvider } from '@/store/AppContext';
import './globals.css';

export const metadata = {
  title: 'Gym Bet - Social Fitness Competition',
  description: 'Stake points, compete with friends, and hit your fitness goals.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-900 dark:text-zinc-100">
        <AppProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
