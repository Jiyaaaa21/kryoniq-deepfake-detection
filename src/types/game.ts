export interface RoundData {
  roundNum: number;
  celebrity: string;
  realAudio: string;
  fakeAudio: string;
  realPosition: 'left' | 'right';
  userChoice: 'left' | 'right';
  correct: boolean;
  replayCountLeft: number;
  replayCountRight: number;
  timeSpent: number;
}

export interface GameState {
  userName: string;
  userEmail: string;
  userOrganization: string;
  userPhone: string;
}
