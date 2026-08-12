import type { PlayerSnapshot } from "@ig-campus/contracts";
import { MAP_HEIGHT, MAP_WIDTH, OBSTACLES, TILE_SIZE, ZONES } from "@ig-campus/game-core";
import Phaser from "phaser";

export type CampusSceneData = {
  selfSessionId: string | null;
};

type PlayerDisplay = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
};

const PLAYER_DEPTH = 20;

export class CampusScene extends Phaser.Scene {
  private players = new Map<string, PlayerDisplay>();
  private selfSessionId: string | null = null;

  constructor() {
    super("CampusScene");
  }

  create(data?: CampusSceneData) {
    this.selfSessionId = data?.selfSessionId ?? null;
    this.cameras.main.setBackgroundColor("#eef2e8");
    this.drawCampus();
  }

  setSelfSessionId(sessionId: string | null): void {
    this.selfSessionId = sessionId;
    this.refreshPlayerDepths();
  }

  syncPlayers(players: PlayerSnapshot[]): void {
    const liveSessionIds = new Set(players.map((player) => player.sessionId));

    for (const player of players) {
      const display = this.players.get(player.sessionId) ?? this.createPlayer(player);
      display.container.setPosition(player.x, player.y);
      display.body.setFillStyle(Phaser.Display.Color.HexStringToColor(player.color).color);
      display.label.setText(player.name);
      display.container.setAlpha(player.sessionId === this.selfSessionId ? 1 : 0.88);
      display.container.setDepth(PLAYER_DEPTH + Math.round(player.y));

      if (player.moving) {
        display.shadow.setScale(1.08, 0.92);
      } else {
        display.shadow.setScale(1, 1);
      }
    }

    for (const [sessionId, display] of this.players) {
      if (!liveSessionIds.has(sessionId)) {
        display.container.destroy(true);
        this.players.delete(sessionId);
      }
    }
  }

  private drawCampus(): void {
    this.add
      .rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, 0xeef2e8)
      .setStrokeStyle(2, 0x25362f);

    this.drawGrid();
    this.drawZones();
    this.drawPaths();
    this.drawObstacles();
    this.drawLabels();
  }

  private drawGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0xd8ded2, 0.7);

    for (let x = 0; x <= MAP_WIDTH; x += TILE_SIZE) {
      graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    }

    for (let y = 0; y <= MAP_HEIGHT; y += TILE_SIZE) {
      graphics.lineBetween(0, y, MAP_WIDTH, y);
    }
  }

  private drawZones(): void {
    const zoneColors = [0xdbeedc, 0xdbe7f1, 0xf4e6c8];

    ZONES.forEach((zone, index) => {
      this.add
        .rectangle(
          zone.rect.x + zone.rect.width / 2,
          zone.rect.y + zone.rect.height / 2,
          zone.rect.width,
          zone.rect.height,
          zoneColors[index] ?? 0xffffff,
          0.78,
        )
        .setStrokeStyle(2, 0x9aa89a, 0.7);
    });
  }

  private drawPaths(): void {
    this.add.rectangle(MAP_WIDTH / 2, 288, MAP_WIDTH - 96, 48, 0xd7c8aa, 0.55);
    this.add.rectangle(336, MAP_HEIGHT / 2, 48, MAP_HEIGHT - 96, 0xd7c8aa, 0.45);
    this.add.rectangle(640, MAP_HEIGHT / 2, 48, MAP_HEIGHT - 96, 0xd7c8aa, 0.45);
  }

  private drawObstacles(): void {
    for (const obstacle of OBSTACLES) {
      this.add
        .rectangle(
          obstacle.x + obstacle.width / 2,
          obstacle.y + obstacle.height / 2,
          obstacle.width,
          obstacle.height,
          0x2f3d35,
          0.92,
        )
        .setStrokeStyle(1, 0x17211c, 0.65);
    }

    this.add.rectangle(480, 80, 180, 18, 0xc9b283, 1);
    this.add.rectangle(192, 368, 150, 16, 0xc9b283, 1);
    this.add.rectangle(192, 432, 150, 16, 0xc9b283, 1);
    this.add.rectangle(704, 176, 16, 58, 0xc9b283, 1);
    this.add.rectangle(800, 176, 16, 58, 0xc9b283, 1);
  }

  private drawLabels(): void {
    for (const zone of ZONES) {
      this.add
        .text(zone.rect.x + 16, zone.rect.y + 12, zone.label, {
          color: "#25362f",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold",
        })
        .setDepth(10);
    }

    this.add
      .text(56, MAP_HEIGHT - 60, "Use WASD ou setas", {
        color: "#47594f",
        fontFamily: "ui-monospace, Consolas, monospace",
        fontSize: "14px",
      })
      .setDepth(10);
  }

  private createPlayer(player: PlayerSnapshot): PlayerDisplay {
    const shadow = this.add.ellipse(0, 16, 34, 12, 0x111111, 0.16);
    const body = this.add.circle(
      0,
      0,
      14,
      Phaser.Display.Color.HexStringToColor(player.color).color,
    );
    const face = this.add.circle(5, -4, 3, 0xffffff, 0.85);
    const label = this.add
      .text(0, -34, player.name, {
        align: "center",
        backgroundColor: "rgba(255,255,255,0.78)",
        color: "#1f2c27",
        fixedWidth: 96,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "12px",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5);

    const container = this.add.container(player.x, player.y, [shadow, body, face, label]);
    container.setSize(34, 46);

    const display = { container, body, label, shadow };
    this.players.set(player.sessionId, display);
    return display;
  }

  private refreshPlayerDepths(): void {
    for (const display of this.players.values()) {
      display.container.setAlpha(0.88);
    }
  }
}
