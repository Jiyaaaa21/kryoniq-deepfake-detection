import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Headphones, Zap, Trophy } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen gradient-bg overflow-hidden flex flex-col">
      <ParticleBackground />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          <span className="font-display text-xl font-bold tracking-tight">Kryoniq</span>
        </div>
        <button
          onClick={() => navigate('/leaderboard')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-semibold"
        >
          <Trophy className="w-4 h-4" />
          <span className="hidden sm:inline">Leaderboard</span>
        </button>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 mb-8 text-sm text-primary">
              <Zap className="w-4 h-4" />
              Powered by Kryoniq
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6">
              Can You Spot the{' '}
              <span className="gradient-text">Deepfake?</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10">
              Test your ears against AI voice clones of famous personalities.
              10 rounds. 2 audio clips. Only one is real.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <button
              onClick={() => navigate('/enroll')}
              className="relative px-10 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-lg pulse-glow hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Start the deepfake detection game"
            >
              Start Game
            </button>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            className="flex flex-wrap justify-center gap-4 mt-14"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            {[
              { icon: Headphones, text: 'Listen & Compare' },
              { icon: Shield, text: 'AI-Powered Fakes' },
              { icon: Zap, text: 'Instant Results' },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2 px-4 py-2 glass-card text-sm text-muted-foreground"
              >
                <Icon className="w-4 h-4 text-primary" />
                {text}
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-muted-foreground">
        Securing Audio Authenticity with AI — kryoniq.com
      </footer>
    </div>
  );
};

export default Index;
