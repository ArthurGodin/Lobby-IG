import type { PlayerSnapshot, ProximityBand, ProximitySnapshot } from "@ig-campus/contracts";
import {
  ART_SCALE,
  CAMPUS_MAP,
  type CampusMapLayer,
  CLOSE_PROXIMITY_RADIUS,
  FOCUS_DESKS,
  getNearestFocusDesk,
  MAP_HEIGHT,
  MAP_WIDTH,
  PROXIMITY_RADIUS,
} from "@ig-campus/game-core";
import Phaser from "phaser";
import {
  AVATAR_FRAME_HEIGHT,
  AVATAR_FRAME_WIDTH,
  getAvatarFrame,
  PIXEL_ASSETS,
  TILE_FRAME_BY_ID,
} from "./assets";

export type CampusSceneData = {
  selfSessionId: string | null;
};

type PlayerDisplay = {
  authoritativeX: number;
  authoritativeY: number;
  base: Phaser.GameObjects.Image;
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  marker: Phaser.GameObjects.Arc;
  mask: Phaser.GameObjects.Image;
  maskFramesAvailable: boolean;
  moving: boolean;
  focusMode: boolean;
  focusDeskId: string | null;
  speaking: boolean;
  speakingHalo: Phaser.GameObjects.Arc;
  facing: PlayerSnapshot["facing"];
  baseFramesAvailable: boolean;
};

const PLAYER_DEPTH = 20;
const PLAYER_INTERPOLATION = 16;
const FOLLOW_ZOOM = 2;
const FOLLOW_LERP = 0.16;
const OVERVIEW_PADDING = 24;
const AVATAR_DISPLAY_SCALE = ART_SCALE;
const FALLBACK_TEXTURE_KEY = "pixel-avatar-placeholder";
const FALLBACK_TILESET_KEY = "pixel-tiles-placeholder";
const LABEL_STACK_STEP = 24;
const LABEL_STACK_DISTANCE = 48;

export class CampusScene extends Phaser.Scene {
  private players = new Map<string, PlayerDisplay>();
  private proximityBySessionId = new Map<string, ProximityBand>();
  private speakingIdentities = new Set<string>();
  private proximityGraphics: Phaser.GameObjects.Graphics | null = null;
  private focusGraphics: Phaser.GameObjects.Graphics | null = null;
  private focusDeskGraphics: Phaser.GameObjects.Graphics | null = null;
  private ready = false;
  private pendingSnapshot: {
    players: PlayerSnapshot[];
    proximity: ProximitySnapshot;
  } | null = null;
  private selfSessionId: string | null = null;
  private overviewEnabled = false;
  private followedSessionId: string | null = null;

  constructor(private readonly onReady?: (scene: CampusScene) => void) {
    super("CampusScene");
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string }) => {
      console.error(`[CampusScene] Falha ao carregar o asset ${file.key ?? "desconhecido"}.`);
    });

    this.load.spritesheet({
      key: PIXEL_ASSETS.campusTiles.key,
      url: PIXEL_ASSETS.campusTiles.url,
      frameConfig: {
        frameWidth: PIXEL_ASSETS.campusTiles.frameWidth,
        frameHeight: PIXEL_ASSETS.campusTiles.frameHeight,
      },
    });
    this.load.spritesheet({
      key: PIXEL_ASSETS.avatarBase.key,
      url: PIXEL_ASSETS.avatarBase.url,
      frameConfig: {
        frameWidth: PIXEL_ASSETS.avatarBase.frameWidth,
        frameHeight: PIXEL_ASSETS.avatarBase.frameHeight,
      },
    });
    this.load.spritesheet({
      key: PIXEL_ASSETS.avatarOutfitMask.key,
      url: PIXEL_ASSETS.avatarOutfitMask.url,
      frameConfig: {
        frameWidth: PIXEL_ASSETS.avatarOutfitMask.frameWidth,
        frameHeight: PIXEL_ASSETS.avatarOutfitMask.frameHeight,
      },
    });
  }

  create(data?: CampusSceneData): void {
    this.selfSessionId = data?.selfSessionId ?? this.selfSessionId;
    this.cameras.main.setBackgroundColor("#18261f");
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.roundPixels = true;

    this.ensureFallbackTexture();
    this.ensureFallbackTileset();
    this.applyNearestFiltering();
    this.drawCampus();
    this.proximityGraphics = this.add.graphics().setDepth(18);
    this.focusGraphics = this.add.graphics().setDepth(17);
    this.focusDeskGraphics = this.add.graphics().setDepth(16);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });

    this.ready = true;
    const pendingSnapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;

    if (pendingSnapshot) {
      this.syncPlayers(pendingSnapshot.players, pendingSnapshot.proximity);
    }

    this.applyCameraMode();
    this.onReady?.(this);
  }

  update(_time: number, delta: number): void {
    const interpolation = 1 - Math.exp((-PLAYER_INTERPOLATION * delta) / 1000);

    for (const display of this.players.values()) {
      display.container.x = Phaser.Math.Linear(
        display.container.x,
        display.authoritativeX,
        interpolation,
      );
      display.container.y = Phaser.Math.Linear(
        display.container.y,
        display.authoritativeY,
        interpolation,
      );

      const frame = getAvatarFrame(display.facing, display.moving, this.time.now);

      this.setAvatarFrame(
        display.base,
        PIXEL_ASSETS.avatarBase.key,
        frame,
        display.baseFramesAvailable,
      );
      this.setAvatarFrame(
        display.mask,
        PIXEL_ASSETS.avatarOutfitMask.key,
        frame,
        display.maskFramesAvailable,
      );
      display.container.setDepth(PLAYER_DEPTH + Math.round(display.container.y));

      if (display.speaking) {
        const pulse = (Math.sin(this.time.now / 115) + 1) / 2;
        display.speakingHalo.setAlpha(0.58 + pulse * 0.32).setScale(1 + pulse * 0.08);
      }
    }

    this.positionPlayerLabels();
    this.drawProximityRings();
    this.drawFocusBarriers();
    this.drawFocusDesks();
  }

  setSelfSessionId(sessionId: string | null): void {
    this.selfSessionId = sessionId;

    if (!this.ready) {
      return;
    }

    this.refreshPlayerStyles();
    this.applyCameraMode();
  }

  setOverview(enabled: boolean): void {
    this.overviewEnabled = enabled;

    if (!this.ready) {
      return;
    }

    this.applyCameraMode();
    this.refreshPlayerStyles();
  }

  setSpeakingIdentities(identities: readonly string[]): void {
    this.speakingIdentities = new Set(identities);

    if (this.ready) {
      this.refreshPlayerStyles();
    }
  }

  syncPlayers(players: PlayerSnapshot[], proximity: ProximitySnapshot): void {
    if (!this.ready) {
      this.pendingSnapshot = { players, proximity };
      return;
    }

    this.proximityBySessionId = new Map(proximity.peers.map((peer) => [peer.sessionId, peer.band]));
    const liveSessionIds = new Set(players.map((player) => player.sessionId));

    for (const player of players) {
      const display = this.players.get(player.sessionId) ?? this.createPlayer(player);
      display.authoritativeX = player.x;
      display.authoritativeY = player.y;
      display.facing = player.facing;
      display.moving = player.moving;
      display.focusMode = player.focusMode;
      display.focusDeskId = player.focusDeskId;
      display.mask.setTint(
        Phaser.Display.Color.HexStringToColor(player.appearance.outfitColor).color,
      );
      display.label.setText(player.name);
      this.stylePlayer(display, player.sessionId);
    }

    for (const [sessionId, display] of this.players) {
      if (!liveSessionIds.has(sessionId)) {
        display.container.destroy(true);
        this.players.delete(sessionId);
      }
    }

    this.applyCameraMode();
  }

  private drawCampus(): void {
    const layers = CAMPUS_MAP.layers;
    this.createTilemapLayer("ground", layers.ground, 0);
    this.createTilemapLayer("structures", layers.structures, 4);
    this.createTilemapLayer("decorations", layers.decorations, 8);
  }

  private createTilemapLayer(name: string, data: CampusMapLayer, depth: number): void {
    const tilesetKey = this.textures.exists(PIXEL_ASSETS.campusTiles.key)
      ? PIXEL_ASSETS.campusTiles.key
      : FALLBACK_TILESET_KEY;

    const rows = toTileFrameRows(data);
    const tilemap = this.make.tilemap({
      data: rows,
      tileWidth: PIXEL_ASSETS.campusTiles.frameWidth,
      tileHeight: PIXEL_ASSETS.campusTiles.frameHeight,
    });
    const tileset = tilemap.addTilesetImage(
      tilesetKey,
      tilesetKey,
      PIXEL_ASSETS.campusTiles.frameWidth,
      PIXEL_ASSETS.campusTiles.frameHeight,
      0,
      0,
      0,
    );
    const layer = tileset ? tilemap.createLayer(0, tileset, 0, 0) : null;

    if (!layer) {
      console.error(`[CampusScene] Não foi possível criar a camada ${name}.`);
      return;
    }

    layer.setScale(ART_SCALE).setDepth(depth);
  }

  private createPlayer(player: PlayerSnapshot): PlayerDisplay {
    const hasBase = this.textures.exists(PIXEL_ASSETS.avatarBase.key);
    const hasMask = this.textures.exists(PIXEL_ASSETS.avatarOutfitMask.key);
    const baseTextureKey = hasBase ? PIXEL_ASSETS.avatarBase.key : FALLBACK_TEXTURE_KEY;
    const maskTextureKey = hasMask ? PIXEL_ASSETS.avatarOutfitMask.key : FALLBACK_TEXTURE_KEY;
    const frame = hasBase ? getAvatarFrame(player.facing, player.moving, this.time.now) : 0;

    const marker = this.add
      .circle(0, -AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE * 0.48, 5, 0xffffff, 0)
      .setStrokeStyle(2, 0xffffff, 0);
    const speakingHalo = this.add
      .circle(0, -AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE * 0.5, 24, 0x5fe0a6, 0.08)
      .setStrokeStyle(3, 0x35d391, 0.92)
      .setVisible(false);
    const shadow = this.add.ellipse(0, -4, 26, 9, 0x132019, 0.28);
    const base = this.add
      .image(0, 0, baseTextureKey)
      .setOrigin(0.5, 1)
      .setScale(AVATAR_DISPLAY_SCALE);
    if (hasBase) {
      base.setFrame(this.getTextureFrame(baseTextureKey, frame));
    }
    const mask = hasMask
      ? this.add
          .image(0, 0, maskTextureKey)
          .setOrigin(0.5, 1)
          .setScale(AVATAR_DISPLAY_SCALE)
          .setTint(Phaser.Display.Color.HexStringToColor(player.appearance.outfitColor).color)
          .setTintMode(Phaser.TintModes.FILL)
      : this.add.image(0, 0, FALLBACK_TEXTURE_KEY).setOrigin(0.5, 1).setVisible(false);
    if (hasMask) {
      mask.setFrame(this.getTextureFrame(maskTextureKey, frame));
    }
    const label = this.add
      .text(0, -AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE - 8, player.name, {
        align: "center",
        backgroundColor: "rgba(247,249,243,0.9)",
        color: "#1f2c27",
        fixedWidth: 120,
        fontFamily: '"Aptos", "Segoe UI", sans-serif',
        fontSize: "12px",
        fontStyle: "bold",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5);
    const container = this.add.container(player.x, player.y, [
      marker,
      speakingHalo,
      shadow,
      base,
      mask,
      label,
    ]);
    container.setSize(AVATAR_FRAME_WIDTH * AVATAR_DISPLAY_SCALE, AVATAR_FRAME_HEIGHT * ART_SCALE);

    const display: PlayerDisplay = {
      authoritativeX: player.x,
      authoritativeY: player.y,
      base,
      baseFramesAvailable: hasBase,
      container,
      facing: player.facing,
      label,
      marker,
      mask,
      maskFramesAvailable: hasMask,
      moving: player.moving,
      focusMode: player.focusMode,
      focusDeskId: player.focusDeskId,
      speaking: false,
      speakingHalo,
    };
    this.players.set(player.sessionId, display);
    this.stylePlayer(display, player.sessionId);
    return display;
  }

  private drawProximityRings(): void {
    const graphics = this.proximityGraphics;
    graphics?.clear();

    if (!graphics || !this.selfSessionId) {
      return;
    }

    const self = this.players.get(this.selfSessionId);

    if (!self) {
      return;
    }

    graphics.fillStyle(0x2f7d5c, 0.035);
    graphics.fillCircle(self.container.x, self.container.y, PROXIMITY_RADIUS);
    graphics.lineStyle(2, 0x2f7d5c, 0.34);
    graphics.strokeCircle(self.container.x, self.container.y, PROXIMITY_RADIUS);
    graphics.fillStyle(0xc89b30, 0.045);
    graphics.fillCircle(self.container.x, self.container.y, CLOSE_PROXIMITY_RADIUS);
    graphics.lineStyle(2, 0xc89b30, 0.48);
    graphics.strokeCircle(self.container.x, self.container.y, CLOSE_PROXIMITY_RADIUS);
  }

  private drawFocusBarriers(): void {
    const graphics = this.focusGraphics;
    graphics?.clear();

    if (!graphics) {
      return;
    }

    for (const display of this.players.values()) {
      if (!display.focusMode) {
        continue;
      }

      graphics.fillStyle(0x7a5aa6, 0.12);
      graphics.fillCircle(display.container.x, display.container.y - 12, 64);
      graphics.lineStyle(3, 0xc8a8ff, 0.72);
      graphics.strokeCircle(display.container.x, display.container.y - 12, 64);
      graphics.lineStyle(1, 0xf2e9ff, 0.38);
      graphics.strokeCircle(display.container.x, display.container.y - 12, 70);
    }
  }

  private drawFocusDesks(): void {
    const graphics = this.focusDeskGraphics;
    graphics?.clear();

    if (!graphics) {
      return;
    }

    const occupiedDeskIds = new Set(
      [...this.players.values()]
        .map((display) => display.focusDeskId)
        .filter((deskId): deskId is string => deskId !== null),
    );
    const self = this.selfSessionId ? this.players.get(this.selfSessionId) : null;
    const nearbyDesk =
      self && !self.focusMode
        ? getNearestFocusDesk({ x: self.authoritativeX, y: self.authoritativeY })
        : null;

    for (const desk of FOCUS_DESKS) {
      const occupied = occupiedDeskIds.has(desk.id);
      const nearby = nearbyDesk?.id === desk.id;

      if (!occupied && !nearby) {
        continue;
      }

      const color = occupied ? 0x7a5aa6 : 0xc89b30;
      const alpha = occupied ? 0.62 : 0.86;
      graphics.fillStyle(color, occupied ? 0.12 : 0.1);
      graphics.fillRoundedRect(desk.seatPosition.x - 22, desk.seatPosition.y - 38, 44, 42, 8);
      graphics.lineStyle(3, color, alpha);
      graphics.strokeRoundedRect(desk.seatPosition.x - 22, desk.seatPosition.y - 38, 44, 42, 8);
    }
  }

  private refreshPlayerStyles(): void {
    for (const [sessionId, display] of this.players) {
      this.stylePlayer(display, sessionId);
    }
  }

  private stylePlayer(display: PlayerDisplay, sessionId: string): void {
    const isSpeaking = this.speakingIdentities.has(sessionId);
    display.speaking = isSpeaking;
    display.speakingHalo.setVisible(isSpeaking);
    display.label
      .setBackgroundColor(
        display.focusMode
          ? "rgba(240,226,255,0.98)"
          : isSpeaking
            ? "rgba(218,248,229,0.96)"
            : "rgba(247,249,243,0.9)",
      )
      .setColor(display.focusMode ? "#5a3d7e" : isSpeaking ? "#155f43" : "#1f2c27");
    display.label.setVisible(!this.overviewEnabled);
    display.marker.setVisible(this.overviewEnabled);

    if (sessionId === this.selfSessionId) {
      display.container.setAlpha(1);
      display.marker.setFillStyle(0xffffff, 1).setStrokeStyle(2, 0x1b3b2d, 1);
      return;
    }

    const band = this.proximityBySessionId.get(sessionId);
    display.marker.setFillStyle(display.mask.tintTopLeft, 1);

    if (band === "close") {
      display.container.setAlpha(1);
      display.marker.setStrokeStyle(2, 0xc89b30, 1);
      return;
    }

    if (band === "nearby") {
      display.container.setAlpha(0.94);
      display.marker.setStrokeStyle(2, 0x2f7d5c, 1);
      return;
    }

    display.container.setAlpha(0.66);
    display.marker.setStrokeStyle(1, 0xffffff, 0.9);
  }

  private applyCameraMode(): void {
    const camera = this.cameras.main;

    if (this.overviewEnabled) {
      if (camera.useBounds) {
        camera.removeBounds();
      }
      camera.stopFollow();
      this.followedSessionId = null;
      this.fitOverview();
      return;
    }

    if (!camera.useBounds) {
      camera.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }
    camera.setZoom(FOLLOW_ZOOM);
    const self = this.selfSessionId ? this.players.get(this.selfSessionId) : null;

    if (self && this.followedSessionId !== this.selfSessionId) {
      camera.startFollow(self.container, true, FOLLOW_LERP, FOLLOW_LERP);
      this.followedSessionId = this.selfSessionId;
    } else {
      if (!self) {
        camera.stopFollow();
        this.followedSessionId = null;
        camera.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
      }
    }
  }

  private fitOverview(): void {
    const camera = this.cameras.main;
    const availableWidth = Math.max(1, camera.width - OVERVIEW_PADDING * 2);
    const availableHeight = Math.max(1, camera.height - OVERVIEW_PADDING * 2);
    camera.setZoom(Math.min(availableWidth / MAP_WIDTH, availableHeight / MAP_HEIGHT));
    camera.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
  }

  private handleResize(): void {
    if (this.overviewEnabled) {
      this.fitOverview();
    }
  }

  private positionPlayerLabels(): void {
    const placedLabels: Array<{ x: number; y: number }> = [];
    const orderedDisplays = [...this.players.values()].sort(
      (first, second) => first.container.y - second.container.y,
    );

    for (const display of orderedDisplays) {
      const baseLabelY = -AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE - 8;
      const horizontalMargin = display.label.width / 2 + 6;
      const labelCenterX = Phaser.Math.Clamp(
        display.container.x,
        horizontalMargin,
        MAP_WIDTH - horizontalMargin,
      );
      let worldLabelY = display.container.y + baseLabelY;

      while (
        placedLabels.some(
          (placed) =>
            Math.abs(placed.x - labelCenterX) < LABEL_STACK_DISTANCE &&
            Math.abs(placed.y - worldLabelY) < LABEL_STACK_STEP,
        )
      ) {
        worldLabelY -= LABEL_STACK_STEP;
      }

      display.label.setPosition(
        labelCenterX - display.container.x,
        worldLabelY - display.container.y,
      );
      placedLabels.push({ x: labelCenterX, y: worldLabelY });
    }
  }

  private ensureFallbackTexture(): void {
    const textures = this.textures;

    if (textures.exists(FALLBACK_TEXTURE_KEY)) {
      return;
    }

    const fallback = textures.createCanvas(
      FALLBACK_TEXTURE_KEY,
      AVATAR_FRAME_WIDTH,
      AVATAR_FRAME_HEIGHT,
    );

    if (!fallback) {
      return;
    }

    const context = fallback.context;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#1f2c27";
    context.fillRect(5, 1, 6, 6);
    context.fillStyle = "#e5c49a";
    context.fillRect(4, 7, 8, 6);
    context.fillStyle = "#2f7d5c";
    context.fillRect(3, 13, 10, 7);
    context.fillStyle = "#25362f";
    context.fillRect(3, 20, 4, 4);
    context.fillRect(9, 20, 4, 4);
    fallback.refresh();
    fallback.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private ensureFallbackTileset(): void {
    const textures = this.textures;

    if (textures.exists(FALLBACK_TILESET_KEY)) {
      return;
    }

    const sheetWidth = 8 * PIXEL_ASSETS.campusTiles.frameWidth;
    const sheetHeight = 5 * PIXEL_ASSETS.campusTiles.frameHeight;
    const fallback = textures.createCanvas(FALLBACK_TILESET_KEY, sheetWidth, sheetHeight);

    if (!fallback) {
      return;
    }

    const context = fallback.context;
    context.imageSmoothingEnabled = false;

    for (let frame = 1; frame < 40; frame += 1) {
      const x = (frame % 8) * PIXEL_ASSETS.campusTiles.frameWidth;
      const y = Math.floor(frame / 8) * PIXEL_ASSETS.campusTiles.frameHeight;
      context.fillStyle = frame < 8 ? "#88a96d" : frame < 15 ? "#d7c8aa" : "#506657";
      context.fillRect(
        x,
        y,
        PIXEL_ASSETS.campusTiles.frameWidth,
        PIXEL_ASSETS.campusTiles.frameHeight,
      );
      context.strokeStyle = "rgba(31, 44, 39, 0.18)";
      context.strokeRect(
        x + 0.5,
        y + 0.5,
        PIXEL_ASSETS.campusTiles.frameWidth - 1,
        PIXEL_ASSETS.campusTiles.frameHeight - 1,
      );
    }

    for (let frame = 0; frame < 40; frame += 1) {
      fallback.add(
        frame,
        0,
        (frame % 8) * PIXEL_ASSETS.campusTiles.frameWidth,
        Math.floor(frame / 8) * PIXEL_ASSETS.campusTiles.frameHeight,
        PIXEL_ASSETS.campusTiles.frameWidth,
        PIXEL_ASSETS.campusTiles.frameHeight,
      );
    }

    fallback.refresh();
    fallback.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private applyNearestFiltering(): void {
    for (const asset of Object.values(PIXEL_ASSETS)) {
      if (this.textures.exists(asset.key)) {
        this.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  private getTextureFrame(textureKey: string, frame: number): Phaser.Textures.Frame {
    return this.textures.get(textureKey).get(String(frame));
  }

  private setAvatarFrame(
    image: Phaser.GameObjects.Image,
    textureKey: string,
    frame: number,
    available: boolean,
  ): void {
    if (!available || image.frame.name === String(frame)) {
      return;
    }

    image.setFrame(this.getTextureFrame(textureKey, frame));
  }
}

function toTileFrameRows(layer: CampusMapLayer): number[][] {
  return Array.from({ length: CAMPUS_MAP.rows }, (_, row) =>
    Array.from({ length: CAMPUS_MAP.columns }, (_, column) => {
      const tileId = layer[row * CAMPUS_MAP.columns + column];
      return tileId ? TILE_FRAME_BY_ID[tileId] : -1;
    }),
  );
}
