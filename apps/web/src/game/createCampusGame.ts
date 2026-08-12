import { MAP_HEIGHT, MAP_WIDTH } from "@ig-campus/game-core";
import Phaser from "phaser";
import { CampusScene } from "./CampusScene";

export function createCampusGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    backgroundColor: "#eef2e8",
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: CampusScene,
  });
}
