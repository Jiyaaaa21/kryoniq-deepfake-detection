import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Award, Building2, ArrowLeft, Shield, Crown, Sparkles, TrendingUp, Users } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface LeaderboardEntry {
  rank: number;
  name: string;
  organization: string;
  best_score: number;
  latest_played: string;
}

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/leaderboard`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-7 h-7 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-300" />;
    if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
    return null;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return {
      gradient: 'from-yellow-500/20 via-amber-500/20 to-yellow-600/20',
      border: 'border-yellow-500/40',
      glow: 'shadow-xl shadow-yellow-500/20',
      scale: 'hover:scale-[1.02]',
    };
    if (rank === 2) return {
      gradient: 'from-gray-400/20 via-slate-400/20 to-gray-500/20',
      border: 'border-gray-400/40',
      glow: 'shadow-lg shadow-gray-400/20',
      scale: 'hover:scale-[1.02]',
    };
    if (rank === 3) return {
      gradient: 'from-amber-600/20 via-orange-600/20 to-amber-700/20',
      border: 'border-amber-600/40',
      glow: 'shadow-lg shadow-amber-600/20',
      scale: 'hover:scale-[1.02]',
    };
    return {
      gradient: 'from-muted/30 to-muted/20',
      border: 'border-border',
      glow: '',
      scale: 'hover:scale-[1.01]',
    };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) return 'Today';
    if (diffInHours < 48) return 'Yesterday';
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative min-h-screen gradient-bg flex flex-col">
      <ParticleBackground />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-lg">Kryoniq</span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Home</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <motion.div 
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 mb-4 relative"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Trophy className="w-10 h-10 text-primary" />
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
          
          <h1 className="font-display text-5xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Leaderboard
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Top players who can detect AI voice clones
          </p>
          
          {/* Stats Badge */}
          {leaderboard.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-muted/50 border border-border"
            >
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">{leaderboard.length} Players</span>
            </motion.div>
          )}
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card p-12 text-center"
            >
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Loading leaderboard...</p>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card p-12 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <p className="text-destructive mb-4 font-semibold">{error}</p>
              <button
                onClick={fetchLeaderboard}
                className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:scale-105 transition-transform"
              >
                Try Again
              </button>
            </motion.div>
          ) : leaderboard.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card p-16 text-center"
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Trophy className="w-24 h-24 mx-auto mb-6 text-muted-foreground opacity-30" />
              </motion.div>
              <h3 className="font-display text-2xl font-bold mb-2">No scores yet</h3>
              <p className="text-muted-foreground text-lg mb-6">Be the first to challenge AI!</p>
              <button
                onClick={() => navigate('/enroll')}
                className="px-10 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-lg hover:scale-105 transition-transform pulse-glow"
              >
                Start Game
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="leaderboard"
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              {leaderboard.map((entry, index) => {
                const style = getRankStyle(entry.rank);
                const isTopThree = entry.rank <= 3;
                
                return (
                  <motion.div
                    key={`${entry.name}-${entry.organization}-${index}`}
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: index * 0.05, 
                      duration: 0.4,
                      type: 'spring',
                      stiffness: 100
                    }}
                    className={`glass-card p-6 flex items-center gap-4 transition-all duration-300 bg-gradient-to-r ${style.gradient} border ${style.border} ${style.glow} ${style.scale} ${
                      isTopThree ? 'ring-1 ring-inset ring-white/10' : ''
                    }`}
                  >
                    {/* Rank Icon/Number */}
                    <div className="flex items-center justify-center w-16 h-16 shrink-0">
                      {getRankIcon(entry.rank) ? (
                        <motion.div
                          animate={isTopThree ? { 
                            rotate: [0, -5, 5, 0],
                            scale: [1, 1.1, 1]
                          } : {}}
                          transition={{ 
                            duration: 3, 
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        >
                          {getRankIcon(entry.rank)}
                        </motion.div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                          <span className="font-display text-xl font-bold text-muted-foreground">
                            {entry.rank}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-display font-bold text-xl truncate ${
                          isTopThree ? 'text-foreground' : 'text-foreground/90'
                        }`}>
                          {entry.name}
                        </h3>
                        {entry.rank === 1 && (
                          <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{entry.organization}</span>
                        </div>
                        <span className="text-xs">•</span>
                        <span className="text-xs whitespace-nowrap">
                          {formatDate(entry.latest_played)}
                        </span>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <motion.div 
                        className="font-display text-4xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: index * 0.05 + 0.3, type: 'spring' }}
                      >
                        {entry.best_score}
                      </motion.div>
                      <div className="text-xs text-muted-foreground font-semibold">/10</div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA Section */}
        {!loading && !error && leaderboard.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + leaderboard.length * 0.05, duration: 0.6 }}
            className="mt-12 text-center glass-card p-8"
          >
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="font-display text-2xl font-bold mb-2">
              Think you can make it to the top?
            </h3>
            <p className="text-muted-foreground mb-6">
              Test your AI detection skills and claim your spot on the leaderboard
            </p>
            <button
              onClick={() => navigate('/enroll')}
              className="px-12 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-lg hover:scale-105 transition-transform pulse-glow shadow-lg shadow-primary/30"
            >
              Play Now
            </button>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-muted-foreground border-t border-border/50">
        Securing Audio Authenticity with AI — kryoniq.com
      </footer>
    </div>
  );
};

export default Leaderboard;
