import Phaser from "phaser";
import { CampusScene } from "./CampusScene";

export function createCampusGame(
  parent: HTMLElement,
  onSceneReady?: (scene: CampusScene) => void,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#18261f",
    render: {
      antialias: false,
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    scene: new CampusScene(onSceneReady),
  });
}
