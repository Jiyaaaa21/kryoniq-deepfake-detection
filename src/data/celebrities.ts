export interface Celebrity {
  id: string;
  name: string;
  photoUrl: string;
  caricatureUrl: string;
  realAudios: string[];
  fakeAudios: string[];
}

const CDN_BASE = import.meta.env.VITE_AUDIO_CDN_BASE_URL || '';

const makeAudioUrls = (id: string, type: 'real' | 'fake', count = 15) =>
  Array.from({ length: count }, (_, i) =>
    CDN_BASE
      ? `${CDN_BASE}/${id}/${type}/${id}_${type}_${String(i + 1).padStart(2, '0')}.mp3`
      : `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 16) + 1}.mp3`
  );

const avatarUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=6366f1&color=fff&bold=true`;

const caricatureUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=8b5cf6&color=fff&rounded=true&bold=true`;

const CELEBRITY_NAMES = [
  'Narendra Modi', 'Amitabh Bachchan', 'Shah Rukh Khan', 'Virat Kohli',
  'Priyanka Chopra', 'AR Rahman', 'Sachin Tendulkar', 'Sundar Pichai',
  'Deepika Padukone', 'Ratan Tata', 'MS Dhoni', 'Alia Bhatt',
  'Ranveer Singh', 'Kareena Kapoor', 'Akshay Kumar',
];

export const CELEBRITIES: Celebrity[] = CELEBRITY_NAMES.map((name) => {
  const id = name.toLowerCase().replace(/\s+/g, '_');
  return {
    id,
    name,
    photoUrl: avatarUrl(name),
    caricatureUrl: caricatureUrl(name),
    realAudios: makeAudioUrls(id, 'real'),
    fakeAudios: makeAudioUrls(id, 'fake'),
  };
});
