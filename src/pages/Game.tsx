/**
 * Game.tsx — Production-grade Deepfake Detection Game
 *
 * KEY CHANGES FROM ORIGINAL:
 * ─────────────────────────────────────────────────────────────
 * 1. HOOK ORDER FIX: All hooks now appear before any conditional
 *    returns. The early `if (!userState.userId)` guard was moved
 *    into a useEffect, which stores a `shouldRedirect` flag so
 *    the render path never changes hook count.
 *
 * 2. AUDIO FALLBACK SYSTEM (useAudioFallback hook):
 *    - Detects errors via onError on both <audio> elements
 *    - Fetches a replacement file from /api/audio-files/:celebrity
 *    - Respects a MAX_RETRIES = 3 cap stored in a ref (no re-render)
 *    - Uses an `isFallbackActive` ref to prevent overlapping retries
 *    - Swaps src on the same audio element — no new DOM nodes
 *
 * 3. PRELOADING: A separate useEffect watches currentRound and
 *    prefetches the next round's audio into detached Audio objects.
 *    These are torn down on every round change and on unmount.
 *
 * 4. RACE CONDITION GUARD: A `playRequestId` ref increments on
 *    every play call. Async play() continuations check that the
 *    id still matches before updating state, preventing stale
 *    callbacks from flickering the UI.
 *
 * 5. BUFFERING STATE: `audioLeftBuffering` / `audioRightBuffering`
 *    useState flags are set on `waiting` and cleared on `canplay`.
 *    The play button shows a spinner when buffering.
 *
 * 6. INNER COMPONENT EXTRACTION: CardSide and ProgressDots are
 *    lifted out of Game's render scope and wrapped in React.memo
 *    so they don't recreate on every parent state change.
 *
 * 7. ROUND CLEANUP: The useEffect watching currentRound pauses
 *    and resets both audio elements before the new round starts,
 *    preventing bleed-over from the previous clip.
 *
 * All original logic (scoring, replay count, round progression,
 * result submission) is completely preserved.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
  type RefObject,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Shield,
  Mic2,
  CheckCircle,
  XCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import WaveformVisualizer from '@/components/WaveformVisualizer';
import type { RoundData } from '@/types/game';

// ─── Constants ────────────────────────────────────────────────
const TOTAL_ROUNDS = 10;
const MAX_AUDIO_RETRIES = 3;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── Types ────────────────────────────────────────────────────
interface BackendRound {
  roundNumber: number;
  celebrity: string;
  audioA: string;
  audioB: string;
  realPosition: 'A' | 'B';
}

interface RoundSetup {
  celebrity: {
    name: string;
    photoUrl: string;
  };
  realAudio: string;
  fakeAudio: string;
  realPosition: 'left' | 'right';
}

// ─── Celebrity image mapping ──────────────────────────────────
// Keys MUST exactly match folder names in /public/audio/Real/
// because /api/start-game returns the raw folder name as `celebrity`.
// Values are the image filenames in /public/images/.
const CELEBRITY_IMAGE_MAP: Record<string, string> = {
  'Amitabh Bachchan':    'Amitabh Bachchan',
  'Barack Obama':         'Barack Obama',
  'Dario Amodei':         'Dario Amodei',
  'Elon Musk':            'Elon Musk',
  'Emma Watson':          'Emma Watson',
  'Fei-Fei Li':           'Fei-Fei Li',        // disk: "Fei-Fei Li"
  'Leonardo DiCaprio':    'Leonardo DiCaprio',  // disk: "Leonardo DiCaprio"
  'Lex Fridman':          'Lex Fridman',
  'Mark ZuckerBerg':      'Mark ZuckerBerg',    // disk: "Mark ZuckerBerg"
  'Morgan Freeman':       'Morgan Freeman',
  'Neil deGrasse Tyson':  'Neil deGrasse Tyson',
  'Priyanka Chopra':      'Priyanka Chopra',
  'Sam Altman':           'Sam Altman',
  'Scarlett Johansson':   'Scarlett Johansson',
  'Shashi Tharoor':       'Shashi Tharoor',
};

const getImageFilename = (audioFolderName: string): string =>
  CELEBRITY_IMAGE_MAP[audioFolderName] ?? audioFolderName;

const getFallbackImage = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&size=200&background=6366f1&color=ffffff&bold=true&font-size=0.4`;

// ─────────────────────────────────────────────────────────────
// useAudioFallback
// ─────────────────────────────────────────────────────────────
/**
 * Attaches error listeners to two audio refs. On failure:
 *  1. Asks the backend for an alternate file for the same
 *     celebrity + category (Real/Cloned).
 *  2. Swaps `src` on the same element in place — no DOM changes.
 *  3. Retries playback if the audio was already playing.
 *  4. Bails out silently after MAX_AUDIO_RETRIES attempts.
 *
 * Uses only refs for retry bookkeeping so it never causes
 * extra re-renders.
 */
function useAudioFallback({
  audioLeftRef,
  audioRightRef,
  leftAudio,
  rightAudio,
  celebrity,
  playingLeft,
  playingRight,
  setPlayingLeft,
  setPlayingRight,
  disabled, // true while result is showing / transitioning
}: {
  audioLeftRef: RefObject<HTMLAudioElement | null>;
  audioRightRef: RefObject<HTMLAudioElement | null>;
  leftAudio: string;
  rightAudio: string;
  celebrity: string;
  playingLeft: boolean;
  playingRight: boolean;
  setPlayingLeft: (v: boolean) => void;
  setPlayingRight: (v: boolean) => void;
  disabled: boolean;
}) {
  // Per-side retry counters — stored in refs to avoid re-renders
  const retriesLeft = useRef(0);
  const retriesRight = useRef(0);

  // Prevent two simultaneous fallback fetches for the same side
  const fallbackActiveLeft = useRef(false);
  const fallbackActiveRight = useRef(false);

  // Reset counters whenever the audio sources change (new round)
  useEffect(() => {
    retriesLeft.current = 0;
    retriesRight.current = 0;
    fallbackActiveLeft.current = false;
    fallbackActiveRight.current = false;
  }, [leftAudio, rightAudio]);

  // ── Core fallback function ──────────────────────────────────
  const handleAudioError = useCallback(
    async (side: 'left' | 'right') => {
      if (disabled) return;

      const retriesRef = side === 'left' ? retriesLeft : retriesRight;
      const activeRef =
        side === 'left' ? fallbackActiveLeft : fallbackActiveRight;
      const audioRef = side === 'left' ? audioLeftRef : audioRightRef;
      const wasPlaying = side === 'left' ? playingLeft : playingRight;
      const setPlaying = side === 'left' ? setPlayingLeft : setPlayingRight;

      // Bail out if retries exhausted or already mid-fallback
      if (retriesRef.current >= MAX_AUDIO_RETRIES) {
        console.warn(
          `[AudioFallback] Max retries (${MAX_AUDIO_RETRIES}) reached for ${side} side.`,
        );
        return;
      }
      if (activeRef.current) return;

      activeRef.current = true;
      retriesRef.current += 1;

      console.warn(
        `[AudioFallback] Error on ${side} side — attempt ${retriesRef.current}/${MAX_AUDIO_RETRIES}. Fetching replacement…`,
      );

      // Determine which category this side is serving
      // The original src tells us: path contains /Real/ or /Cloned/
      // Capture the broken src before we touch the element.
      // The browser resolves relative paths to absolute, so
      // currentSrc looks like "http://localhost:5000/audio/Real/Obama/clip01.wav".
      // We extract just the pathname portion for the exclude param.
      const currentSrc = audioRef.current?.src ?? '';
      const category = currentSrc.includes('/Cloned/') ? 'Cloned' : 'Real';

      // Extract the URL pathname so the backend gets
      // "/audio/Real/Obama/clip01.wav" not the full absolute URL.
      let excludePath = '';
      try {
        excludePath = new URL(currentSrc).pathname;
      } catch {
        excludePath = currentSrc; // fallback: pass as-is
      }

      try {
        // Ask backend for a random replacement file, excluding the broken one.
        const params = new URLSearchParams({ category });
        if (excludePath) params.set('exclude', excludePath);

        const res = await fetch(
          `${API_BASE}/api/audio-files/${encodeURIComponent(celebrity)}?${params}`,
        );

        if (!res.ok) {
          throw new Error(`Backend returned ${res.status}`);
        }

        const { filePath } = (await res.json()) as { filePath: string };

        if (!filePath) {
          throw new Error('No filePath in response');
        }

        const el = audioRef.current;
        if (!el) return;

        // Swap source in-place — one DOM mutation, no new elements
        el.pause();
        el.src = filePath;
        el.load();

        if (wasPlaying) {
          // Wait for the element to be ready before resuming
          await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => {
              el.removeEventListener('canplay', onCanPlay);
              el.removeEventListener('error', onError);
              resolve();
            };
            const onError = () => {
              el.removeEventListener('canplay', onCanPlay);
              el.removeEventListener('error', onError);
              reject(new Error('Replacement also failed to load'));
            };
            el.addEventListener('canplay', onCanPlay, { once: true });
            el.addEventListener('error', onError, { once: true });
          });

          await el.play();
          setPlaying(true);
        }

        console.info(`[AudioFallback] Replacement loaded on ${side}: ${filePath}`);
      } catch (err) {
        console.error(`[AudioFallback] Replacement failed on ${side}:`, err);
        setPlaying(false);
      } finally {
        activeRef.current = false;
      }
    },
    // playingLeft / playingRight are captured at call time via the
    // side-specific wasPlaying local — safe to list both here.
    [
      disabled,
      celebrity,
      audioLeftRef,
      audioRightRef,
      playingLeft,
      playingRight,
      setPlayingLeft,
      setPlayingRight,
    ],
  );

  return { handleAudioError };
}

// ─────────────────────────────────────────────────────────────
// useNextRoundPreloader
// ─────────────────────────────────────────────────────────────
/**
 * Silently preloads the audio files for the upcoming round.
 * Creates detached Audio objects (never added to the DOM) and
 * sets preload="auto" so the browser buffers them in the
 * background while the user listens to the current round.
 *
 * Cleans up every time currentRound advances or the component
 * unmounts to avoid memory leaks.
 */
function useNextRoundPreloader(rounds: RoundSetup[], currentRound: number) {
  const preloadRefs = useRef<HTMLAudioElement[]>([]);

  useEffect(() => {
    // Tear down any previous preload objects
    preloadRefs.current.forEach((el) => {
      el.src = '';
      el.load();
    });
    preloadRefs.current = [];

    const nextIndex = currentRound + 1;
    if (nextIndex >= rounds.length) return;

    const next = rounds[nextIndex];
    const nextLeft =
      next.realPosition === 'left' ? next.realAudio : next.fakeAudio;
    const nextRight =
      next.realPosition === 'right' ? next.realAudio : next.fakeAudio;

    [nextLeft, nextRight].forEach((src) => {
      const el = new Audio();
      el.preload = 'auto';
      el.src = src;
      // Fire-and-forget; we don't need to wait
      preloadRefs.current.push(el);
    });

    return () => {
      preloadRefs.current.forEach((el) => {
        el.src = '';
        el.load();
      });
      preloadRefs.current = [];
    };
  }, [rounds, currentRound]);
}

// ─────────────────────────────────────────────────────────────
// ProgressDots  (memoised — only re-renders when props change)
// ─────────────────────────────────────────────────────────────
const ProgressDots = memo(function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? 'w-2 h-2 bg-primary'
              : i === current
                ? 'w-3 h-3 bg-primary ring-2 ring-primary/30'
                : 'w-2 h-2 bg-muted-foreground/30'
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.05 }}
        />
      ))}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// CardSide  (memoised — skips re-renders when unrelated state
//            changes in the parent)
// ─────────────────────────────────────────────────────────────
interface CardSideProps {
  side: 'left' | 'right';
  isPlaying: boolean;
  isBuffering: boolean;
  photoUrl: string;
  displayName: string;
  realPosition: 'left' | 'right';
  selected: 'left' | 'right' | null;
  showResult: boolean;
  isCorrect: boolean;
  onSelect: (side: 'left' | 'right') => void;
  onTogglePlay: (side: 'left' | 'right') => void;
  onReplay: (side: 'left' | 'right') => void;
}

const CardSide = memo(function CardSide({
  side,
  isPlaying,
  isBuffering,
  photoUrl,
  displayName,
  realPosition,
  selected,
  showResult,
  isCorrect,
  onSelect,
  onTogglePlay,
  onReplay,
}: CardSideProps) {
  const isLeft = side === 'left';
  const isSelected = selected === side;
  const isRightAnswer = realPosition === side && showResult;
  const isWrongAnswer = selected && !isSelected && showResult && !isRightAnswer;

  return (
    <motion.button
      onClick={() => onSelect(side)}
      disabled={!!selected}
      className={`relative glass-card p-8 flex flex-col items-center gap-6 cursor-pointer transition-all duration-500 w-full overflow-hidden ${
        isSelected && isCorrect && showResult
          ? 'ring-4 ring-green-500 bg-green-500/10'
          : isSelected && !isCorrect && showResult
            ? 'ring-4 ring-red-500 bg-red-500/10'
            : isRightAnswer
              ? 'ring-4 ring-green-500/50 bg-green-500/5'
              : selected
                ? 'opacity-60'
                : 'hover:glow-border hover:scale-[1.02]'
      }`}
      whileTap={!selected ? { scale: 0.98 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isLeft ? 0 : 0.1 }}
    >
      {/* Result Badges */}
      <AnimatePresence>
        {showResult && isRightAnswer && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-4 right-4 z-10"
          >
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-500 text-white text-xs font-bold">
              <CheckCircle className="w-4 h-4" />
              REAL
            </div>
          </motion.div>
        )}
        {showResult && isSelected && !isCorrect && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-4 right-4 z-10"
          >
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
              <XCircle className="w-4 h-4" />
              AI CLONE
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebrity Photo */}
      <div className="relative">
        <div
          className={`w-36 h-36 rounded-2xl overflow-hidden ring-4 ${
            isPlaying ? 'ring-primary animate-pulse' : 'ring-border'
          } transition-all duration-300`}
        >
          <img
            src={photoUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        {isPlaying && (
          <motion.div
            className="absolute inset-0 rounded-2xl bg-primary/20"
            animate={{ opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>

      {/* Waveform */}
      <div className="w-full">
        <WaveformVisualizer isPlaying={isPlaying} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Play / Pause — shows spinner while buffering */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay(side);
          }}
          disabled={!!selected}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
            isPlaying
              ? 'bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/50'
              : 'bg-primary/20 text-primary hover:bg-primary/30'
          } ${selected ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isBuffering ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-0.5" />
          )}
        </button>

        {/* Replay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReplay(side);
          }}
          disabled={!!selected}
          aria-label="Replay"
          className={`w-11 h-11 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-all ${
            selected ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <RotateCcw className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Side label */}
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Mic2 className="w-4 h-4" />
        Voice {isLeft ? 'A' : 'B'}
      </div>
    </motion.button>
  );
});

// ─────────────────────────────────────────────────────────────
// Game  (main component)
// ─────────────────────────────────────────────────────────────
const Game = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userState = (location.state as Record<string, unknown>) ?? {};

  // ── ALL HOOKS FIRST — no conditional returns before this line ──

  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [rounds, setRounds] = useState<RoundSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRound, setCurrentRound] = useState(0);
  const [selected, setSelected] = useState<'left' | 'right' | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundData[]>([]);
  const [playingLeft, setPlayingLeft] = useState(false);
  const [playingRight, setPlayingRight] = useState(false);
  const [replayLeft, setReplayLeft] = useState(0);
  const [replayRight, setReplayRight] = useState(0);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());
  const [transitioning, setTransitioning] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [audioLeftBuffering, setAudioLeftBuffering] = useState(false);
  const [audioRightBuffering, setAudioRightBuffering] = useState(false);

  const audioLeftRef = useRef<HTMLAudioElement | null>(null);
  const audioRightRef = useRef<HTMLAudioElement | null>(null);

  // Incrementing ID to guard against stale async-play continuations
  const playRequestId = useRef(0);

  // ── Redirect guard (hook-safe) ─────────────────────────────
  useEffect(() => {
    if (!userState.userId) {
      setShouldRedirect(true);
    }
  }, [userState.userId]);

  useEffect(() => {
    if (shouldRedirect) navigate('/');
  }, [shouldRedirect, navigate]);

  // ── Load rounds ───────────────────────────────────────────
  useEffect(() => {
    async function loadGame() {
      try {
        const res = await fetch(`${API_BASE}/api/start-game`);
        const data = await res.json();

        const mappedRounds: RoundSetup[] = data.rounds.map(
          (r: BackendRound) => {
            const imageFilename = getImageFilename(r.celebrity);
            return {
              celebrity: {
                name: r.celebrity,
                photoUrl: `/images/${imageFilename}.jpg`,
              },
              realAudio: r.realPosition === 'A' ? r.audioA : r.audioB,
              fakeAudio: r.realPosition === 'A' ? r.audioB : r.audioA,
              realPosition: r.realPosition === 'A' ? 'left' : 'right',
            };
          },
        );

        setRounds(mappedRounds);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load game:', err);
      }
    }

    loadGame();
  }, []);

  // ── Round change: pause + reset audio elements ────────────
  useEffect(() => {
    const left = audioLeftRef.current;
    const right = audioRightRef.current;
    if (left) {
      left.pause();
      left.currentTime = 0;
    }
    if (right) {
      right.pause();
      right.currentTime = 0;
    }
    setPlayingLeft(false);
    setPlayingRight(false);
    setAudioLeftBuffering(false);
    setAudioRightBuffering(false);
  }, [currentRound]);

  // ── Preload next round's audio ────────────────────────────
  useNextRoundPreloader(rounds, currentRound);

  // ── Derived audio paths (stable after round is resolved) ─
  const round = rounds[currentRound] ?? null;

  const leftAudio = round
    ? round.realPosition === 'left'
      ? round.realAudio
      : round.fakeAudio
    : '';

  const rightAudio = round
    ? round.realPosition === 'right'
      ? round.realAudio
      : round.fakeAudio
    : '';

  // ── Audio fallback hook ───────────────────────────────────
  const { handleAudioError } = useAudioFallback({
    audioLeftRef,
    audioRightRef,
    leftAudio,
    rightAudio,
    celebrity: round?.celebrity.name ?? '',
    playingLeft,
    playingRight,
    setPlayingLeft,
    setPlayingRight,
    disabled: !!selected || transitioning,
  });

  // ── Stop all audio ────────────────────────────────────────
  const stopAll = useCallback(() => {
    audioLeftRef.current?.pause();
    audioRightRef.current?.pause();
    setPlayingLeft(false);
    setPlayingRight(false);
  }, []);

  // ── Image error handling ──────────────────────────────────
  const handleImageError = useCallback((photoUrl: string) => {
    setImageErrors((prev) => new Set(prev).add(photoUrl));
  }, []);

  const getImageUrl = useCallback(
    (photoUrl: string, displayName: string) =>
      imageErrors.has(photoUrl) ? getFallbackImage(displayName) : photoUrl,
    [imageErrors],
  );

  // ── Play / Pause ──────────────────────────────────────────
  const togglePlay = useCallback(
    (side: 'left' | 'right') => {
      if (selected) return;

      const thisRef = side === 'left' ? audioLeftRef : audioRightRef;
      const otherRef = side === 'left' ? audioRightRef : audioLeftRef;
      const setThis = side === 'left' ? setPlayingLeft : setPlayingRight;
      const setOther = side === 'left' ? setPlayingRight : setPlayingLeft;

      if (thisRef.current?.paused) {
        // Stop the other side
        otherRef.current?.pause();
        setOther(false);

        // Guard against stale callbacks from a previous play() promise
        const id = ++playRequestId.current;

        thisRef.current
          .play()
          .then(() => {
            if (playRequestId.current === id) setThis(true);
          })
          .catch((err) => {
            // AbortError is expected when we pause before play() resolves
            if (err?.name !== 'AbortError') {
              console.error('[togglePlay] play() failed:', err);
            }
          });
      } else {
        thisRef.current?.pause();
        setThis(false);
      }
    },
    [selected],
  );

  // ── Replay ────────────────────────────────────────────────
  const replay = useCallback(
    (side: 'left' | 'right') => {
      if (selected) return;

      const thisRef = side === 'left' ? audioLeftRef : audioRightRef;
      const otherRef = side === 'left' ? audioRightRef : audioLeftRef;
      const setThis = side === 'left' ? setPlayingLeft : setPlayingRight;
      const setOther = side === 'left' ? setPlayingRight : setPlayingLeft;
      const setCount = side === 'left' ? setReplayLeft : setReplayRight;

      otherRef.current?.pause();
      setOther(false);

      if (thisRef.current) {
        thisRef.current.currentTime = 0;
        const id = ++playRequestId.current;
        thisRef.current
          .play()
          .then(() => {
            if (playRequestId.current === id) setThis(true);
          })
          .catch((err) => {
            if (err?.name !== 'AbortError') {
              console.error('[replay] play() failed:', err);
            }
          });
      }

      setCount((c) => c + 1);
    },
    [selected],
  );

  // ── Handle user selection ─────────────────────────────────
  const handleSelect = useCallback(
    async (side: 'left' | 'right') => {
      if (selected || transitioning || !round) return;

      setSelected(side);
      stopAll();

      const correct = side === round.realPosition;
      setIsCorrect(correct);
      setShowResult(true);

      const timeSpent = Math.round((Date.now() - roundStartTime) / 1000);

      const result: RoundData = {
        roundNum: currentRound + 1,
        celebrity: round.celebrity.name,
        realAudio: round.realAudio,
        fakeAudio: round.fakeAudio,
        realPosition: round.realPosition,
        userChoice: side,
        correct,
        replayCountLeft: replayLeft,
        replayCountRight: replayRight,
        timeSpent,
      };

      const updatedResults = [...roundResults, result];
      setRoundResults(updatedResults);

      setTimeout(async () => {
        if (currentRound + 1 >= TOTAL_ROUNDS) {
          try {
            const response = await fetch(`${API_BASE}/api/submit-game`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: userState.userId,
                rounds: updatedResults,
              }),
            });

            const data = await response.json();

            navigate('/results', {
              state: {
                score: data.score,
                leaderboardRank: data.leaderboardRank,
                globalHighScore: data.globalHighScore,
                totalGames: data.totalGames,
                rounds: updatedResults,
                totalReplays: updatedResults.reduce(
                  (s, r) => s + r.replayCountLeft + r.replayCountRight,
                  0,
                ),
                ...userState,
              },
            });
          } catch (err) {
            console.error('Submit failed:', err);
          }
        } else {
          setTransitioning(true);
          setTimeout(() => {
            setCurrentRound((r) => r + 1);
            setSelected(null);
            setShowResult(false);
            setReplayLeft(0);
            setReplayRight(0);
            setRoundStartTime(Date.now());
            setTransitioning(false);
          }, 1500);
        }
      }, 1200);
    },
    [
      selected,
      transitioning,
      round,
      currentRound,
      roundResults,
      roundStartTime,
      replayLeft,
      replayRight,
      userState,
      stopAll,
      navigate,
    ],
  );

  // ── Conditional renders (all hooks are above) ─────────────
  if (shouldRedirect) return null;

  if (loading || !rounds.length || !round) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-primary mb-4" />
          <p className="text-muted-foreground">Loading game…</p>
        </div>
      </div>
    );
  }

  const leftPhotoUrl = getImageUrl(
    round.celebrity.photoUrl,
    round.celebrity.name,
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold">Kryoniq</span>
        </div>
        <div className="flex items-center gap-4">
          <ProgressDots total={TOTAL_ROUNDS} current={currentRound} />
          <div className="font-display font-semibold text-sm px-3 py-1.5 rounded-full bg-muted/50">
            {currentRound + 1}/{TOTAL_ROUNDS}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-6xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {!transitioning && (
            <motion.div
              key={currentRound}
              className="w-full flex flex-col items-center gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Celebrity Banner */}
              <motion.div
                className="text-center"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 backdrop-blur-sm">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="font-display text-2xl md:text-3xl font-bold">
                    {round.celebrity.name}
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm mt-3">
                  One is real, one is AI. Can you tell the difference?
                </p>
              </motion.div>

              {/* Audio Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                <CardSide
                  side="left"
                  isPlaying={playingLeft}
                  isBuffering={audioLeftBuffering}
                  photoUrl={leftPhotoUrl}
                  displayName={round.celebrity.name}
                  realPosition={round.realPosition}
                  selected={selected}
                  showResult={showResult}
                  isCorrect={isCorrect}
                  onSelect={handleSelect}
                  onTogglePlay={togglePlay}
                  onReplay={replay}
                />
                <CardSide
                  side="right"
                  isPlaying={playingRight}
                  isBuffering={audioRightBuffering}
                  photoUrl={leftPhotoUrl}
                  displayName={round.celebrity.name}
                  realPosition={round.realPosition}
                  selected={selected}
                  showResult={showResult}
                  isCorrect={isCorrect}
                  onSelect={handleSelect}
                  onTogglePlay={togglePlay}
                  onReplay={replay}
                />
              </div>

              {/* Instruction pulse */}
              {!selected && (
                <motion.div
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/10 border border-primary/20"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <p className="text-sm font-medium">
                    Listen carefully, then tap the card you think is{' '}
                    <span className="text-primary font-bold">REAL</span>
                  </p>
                </motion.div>
              )}

              {/* Result banner */}
              <AnimatePresence>
                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`px-8 py-4 rounded-2xl font-display text-lg font-bold ${
                      isCorrect
                        ? 'bg-green-500/20 text-green-400 border-2 border-green-500/50'
                        : 'bg-red-500/20 text-red-400 border-2 border-red-500/50'
                    }`}
                  >
                    {isCorrect
                      ? '✓ Correct! Moving to next round…'
                      : '✗ Wrong! The real voice was on the other side'}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/*
         * ── Audio elements ──────────────────────────────────────
         * Kept at the bottom of <main> exactly as in the original.
         *
         * onError  → triggers the fallback system
         * onWaiting → sets buffering spinner
         * onCanPlay → clears buffering spinner
         * onEnded  → clears the playing state
         */}
        <audio
          ref={audioLeftRef}
          src={leftAudio}
          preload="auto"
          onError={() => handleAudioError('left')}
          onWaiting={() => setAudioLeftBuffering(true)}
          onCanPlay={() => setAudioLeftBuffering(false)}
          onEnded={() => setPlayingLeft(false)}
        />
        <audio
          ref={audioRightRef}
          src={rightAudio}
          preload="auto"
          onError={() => handleAudioError('right')}
          onWaiting={() => setAudioRightBuffering(true)}
          onCanPlay={() => setAudioRightBuffering(false)}
          onEnded={() => setPlayingRight(false)}
        />
      </main>
    </div>
  );
};

export default Game;
