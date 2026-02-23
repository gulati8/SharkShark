export type ThemeKey = 'reef';

export type ThemeConfig = {
  key: ThemeKey;
  name: string;
  background: string;
  playerColor: number;
  preyColor: number;
  predatorColor: number;
  apexColor: number;
  hazardColor: number;
  sprites: {
    player: string;
    prey: string;
    predator: string;
    apex: string;
    hazard: string;
  };
};
