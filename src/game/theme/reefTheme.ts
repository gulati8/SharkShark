import type { ThemeConfig } from './types';

export const reefTheme: ThemeConfig = {
  key: 'reef',
  name: 'Reef Rush',
  background: '#08243a',
  playerColor: 0xffcf4d,
  preyColor: 0x6fffd2,
  predatorColor: 0xff7f6a,
  apexColor: 0xf54545,
  hazardColor: 0xc18bff,
  sprites: {
    player: '/assets/reef/player.svg',
    prey: '/assets/reef/prey.svg',
    predator: '/assets/reef/predator.svg',
    apex: '/assets/reef/apex.svg',
    hazard: '/assets/reef/hazard.svg',
  },
};
