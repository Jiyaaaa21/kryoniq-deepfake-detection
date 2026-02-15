import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Trophy, Star, ThumbsUp, Dumbbell, RotateCcw, TrendingUp, Sparkles, Crown, Medal, Award } from 'lucide-react';
import confetti from 'canvas-confetti';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const scoreInfo = (score: number) => {
  if (score >= 9) return { emoji: '🏆', label: 'Outstanding!', message: 'You have exceptional AI detection skills!', color: 'from-yellow-500 to-amber-500' };
  if (score >= 7) return { emoji: '⭐', label: 'Great work!', message: 'You can spot most deepfakes!', color: 'from-blue-500 to-cyan-500' };
  if (score >= 5) return { emoji: '👍', label: 'Good effort!', message: 'Keep practicing to improve!', color: 'from-green-500 to-emerald-500' };
  return { emoji: '💪', label: 'Keep practicing!', message: 'AI detection is challenging but you can improve!', color: 'from-orange-500 to-red-500' };
};

interface LeaderboardEntry {
  rank: number;
  name: string;
  organization: string;
  best_score: number;
}

const Results = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as any) || {};
  
  // Redirect if no state
  useEffect(() => {
    if (!state.userId && !state.score) {
      navigate('/');
    }
  }, [state, navigate]);

  const score: number = state.score ?? 0;
  const rank: number = state.leaderboardRank ?? null;
  const globalHighScore: number = state.globalHighScore ?? 10;
  const info = scoreInfo(score);
  const firedRef = useRef(false);
  const [displayScore, setDisplayScore] = useState(0);
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  // Fetch top 3 players for preview
  useEffect(() => {
    const fetchTopPlayers = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/leaderboard`);
        if (response.ok) {
          const data = await response.json();
          setTopPlayers(data.leaderboard?.slice(0, 3) || []);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard preview:', err);
      } finally {
        setLoadingLeaderboard(false);
      }
    };
    
    fetchTopPlayers();
  }, []);

  // Count-up animation
  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current++;
      setDisplayScore(current);
      if (current >= score) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, [score]);

  // Confetti for high scores
  useEffect(() => {
    if (score >= 8 && !firedRef.current) {
      firedRef.current = true;
      const end = Date.now() + 2500;
      const fire = () => {
        confetti({ 
          particleCount: 40, 
          angle: 60, 
          spread: 70, 
          origin: { x: 0 }, 
          colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#fbbf24'] 
        });
        confetti({ 
          particleCount: 40, 
          angle: 120, 
          spread: 70, 
          origin: { x: 1 }, 
          colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#fbbf24'] 
        });
        if (Date.now() < end) requestAnimationFrame(fire);
      };
      fire();
    }
  }, [score]);

  const playAgain = () => {
    navigate('/game', { 
      state: { 
        userId: state.userId,
        userName: state.userName, 
        userEmail: state.userEmail, 
        userOrganization: state.userOrganization, 
        userPhone: state.userPhone 
      },
      replace: true
    });
  };

  const viewFullLeaderboard = () => {
    navigate('/leaderboard');
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-gray-300" />;
    if (rank === 3) return <Award className="w-4 h-4 text-amber-600" />;
    return <TrendingUp className="w-4 h-4 text-primary" />;
  };

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Header */}
      <header className="flex items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold">Kryoniq</span>
        </div>
      </header>

      {/* Main Content - Centered with proper spacing */}
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-2xl space-y-6">
          
          {/* Score Card */}
          <motion.div
            className="glass-card p-8 text-center glow-border"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            {/* Emoji with gradient glow */}
            <motion.div 
              className="text-7xl mb-4"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              {info.emoji}
            </motion.div>

            <h1 className="font-display text-4xl font-bold mb-2">{info.label}</h1>
            <p className="text-muted-foreground text-sm mb-6">{info.message}</p>

            {/* Score Display with Gradient */}
            <motion.div
              className="mb-6"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            >
              <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Your Score</p>
              <div className={`inline-block p-1 rounded-3xl bg-gradient-to-r ${info.color}`}>
                <div className="bg-background rounded-3xl px-8 py-4">
                  <p className="font-display text-7xl font-bold gradient-text">
                    {displayScore}
                  </p>
                  <p className="text-xl text-muted-foreground font-semibold">/10</p>
                </div>
              </div>
            </motion.div>

            {/* Stats Row */}
            <div className="flex items-center justify-center gap-6 mb-6">
              {/* Rank Badge */}
              {rank && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                    {getRankIcon(rank)}
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">Global Rank</p>
                      <p className="text-sm font-bold">#{rank}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* High Score */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/30">
                  <Trophy className="w-4 h-4 text-accent" />
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">Best Score</p>
                    <p className="text-sm font-bold">{globalHighScore}/10</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Action Buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <button
                onClick={playAgain}
                className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                <RotateCcw className="w-5 h-5" />
                Play Again
              </button>

              <button
                onClick={viewFullLeaderboard}
                className="flex-1 py-4 rounded-xl bg-muted hover:bg-muted/80 font-display font-semibold text-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                Leaderboard
              </button>
            </motion.div>
          </motion.div>

          {/* Top 3 Players Card */}
          <AnimatePresence>
            {!loadingLeaderboard && topPlayers.length > 0 && (
              <motion.div
                className="glass-card p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Top Players
                  </h3>
                  <button
                    onClick={viewFullLeaderboard}
                    className="text-sm text-primary hover:underline"
                  >
                    View All →
                  </button>
                </div>
                
                <div className="space-y-3">
                  {topPlayers.map((player, index) => (
                    <motion.div
                      key={`${player.name}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.9 + index * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        player.rank === 1 
                          ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20' 
                          : player.rank === 2
                          ? 'bg-gradient-to-r from-gray-400/10 to-slate-400/10 border border-gray-400/20'
                          : player.rank === 3
                          ? 'bg-gradient-to-r from-amber-600/10 to-orange-600/10 border border-amber-600/20'
                          : 'bg-muted/30'
                      }`}
                    >
                      {/* Rank Icon */}
                      <div className="flex items-center justify-center w-10 h-10 shrink-0">
                        {player.rank === 1 && <Crown className="w-6 h-6 text-yellow-400" />}
                        {player.rank === 2 && <Medal className="w-5 h-5 text-gray-300" />}
                        {player.rank === 3 && <Award className="w-5 h-5 text-amber-600" />}
                      </div>

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{player.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{player.organization}</p>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <p className="font-display text-2xl font-bold gradient-text">
                          {player.best_score}
                        </p>
                        <p className="text-xs text-muted-foreground">/10</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* Footer - Fixed at bottom, no overlap */}
      <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border/50">
        Securing Audio Authenticity with AI — kryoniq.com
      </footer>
    </div>
  );
};

export default Results;