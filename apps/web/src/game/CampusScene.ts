import type {
  PlayerSnapshot,
  ProximityBand,
  ProximitySnapshot,
  ScreenShareSnapshot,
} from "@ig-campus/contracts";
import {
  ART_SCALE,
  CAMPUS_MAP,
  type CampusMapLayer,
  type CampusTileId,
  CLOSE_PROXIMITY_RADIUS,
  INTERACTABLES,
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
  private screenStationGraphics: Phaser.GameObjects.Graphics | null = null;
  private ready = false;
  private pendingSnapshot: {
    players: PlayerSnapshot[];
    proximity: ProximitySnapshot;
  } | null = null;
  private selfSessionId: string | null = null;
  private overviewEnabled = false;
  private followedSessionId: string | null = null;
  private highlightedInteractableId: string | null = null;
  private screenShare: ScreenShareSnapshot | null = null;
  private presentingSessionIds = new Set<string>();
  private tilemapLayers: Record<string, Phaser.Tilemaps.TilemapLayer> = {};
  private builderState: {
    open: boolean;
    layer: "ground" | "structures" | "decorations" | "zones" | "spawns" | "interactables";
    tile: CampusTileId | null;
    tool: "pencil" | "rect" | "fill";
    showGrid: boolean;
  } | null = null;
  private builderPreviewSprite: Phaser.GameObjects.Sprite | null = null;
  private builderGridGraphics: Phaser.GameObjects.Graphics | null = null;
  private builderMetadataGraphics: Phaser.GameObjects.Graphics | null = null;
  private isPainting = false;
  private builderRectStart: { col: number; row: number } | null = null;
  private metadataDragStart: { x: number; y: number } | null = null;
  private metadataDragCurrent: { x: number; y: number } | null = null;
  private speechBubbles = new Map<string, Phaser.GameObjects.Container>();

  private draftMap: typeof CAMPUS_MAP | null = null;
  private mapHistory: (typeof CAMPUS_MAP)[] = [];
  private mapHistoryPointer = -1;

  private uiMutationListener = () => {
    this.initDraftMap(false);
    this.pushHistoryState();
  };

  public get activeMap(): typeof CAMPUS_MAP {
    return this.draftMap ?? CAMPUS_MAP;
  }

  public getDraftMap(): typeof CAMPUS_MAP | null {
    return this.draftMap;
  }

  public initDraftMap(forceNew = false): void {
    if (!forceNew) {
      const saved = localStorage.getItem("campus_map_draft");
      if (saved) {
        try {
          this.draftMap = JSON.parse(saved);
          this.rebuildTilemaps();
          this.drawBuilderMetadata();
          if (this.mapHistory.length === 0) this.pushHistoryState();
          return;
        } catch (e) {
          console.error("Failed to parse local draft map", e);
        }
      }
    }
    this.draftMap = JSON.parse(JSON.stringify(CAMPUS_MAP)); // deep clone
    this.rebuildTilemaps();
    this.drawBuilderMetadata();
    this.pushHistoryState();
  }

  public pushHistoryState(): void {
    if (!this.draftMap) return;
    this.mapHistory = this.mapHistory.slice(0, this.mapHistoryPointer + 1);
    this.mapHistory.push(JSON.parse(JSON.stringify(this.draftMap)));
    if (this.mapHistory.length > 50) {
      this.mapHistory.shift();
    } else {
      this.mapHistoryPointer++;
    }
  }

  public undoDraft(): void {
    if (this.mapHistoryPointer > 0) {
      this.mapHistoryPointer--;
      this.draftMap = JSON.parse(JSON.stringify(this.mapHistory[this.mapHistoryPointer]));
      this.rebuildTilemaps();
      this.drawBuilderMetadata();
      localStorage.setItem("campus_map_draft", JSON.stringify(this.draftMap));
      window.dispatchEvent(new CustomEvent("campus-metadata-changed"));
    }
  }

  public redoDraft(): void {
    if (this.mapHistoryPointer < this.mapHistory.length - 1) {
      this.mapHistoryPointer++;
      this.draftMap = JSON.parse(JSON.stringify(this.mapHistory[this.mapHistoryPointer]));
      this.rebuildTilemaps();
      this.drawBuilderMetadata();
      localStorage.setItem("campus_map_draft", JSON.stringify(this.draftMap));
      window.dispatchEvent(new CustomEvent("campus-metadata-changed"));
    }
  }

  public discardDraftMap(): void {
    this.draftMap = null;
    localStorage.removeItem("campus_map_draft");
    this.rebuildTilemaps();
    this.drawBuilderMetadata();
  }

  public setDraftMap(draft: typeof CAMPUS_MAP | null): void {
    this.draftMap = draft;
    this.rebuildTilemaps();
    this.drawBuilderMetadata();
  }

  private rebuildTilemaps(): void {
    if (!this.ready) return;
    for (const key in this.tilemapLayers) {
      this.tilemapLayers[key]?.destroy();
    }
    this.tilemapLayers = {};
    const layers = this.activeMap.layers;
    this.createTilemapLayer("ground", layers.ground, 0);
    this.createTilemapLayer("structures", layers.structures, 4);
    this.createTilemapLayer("decorations", layers.decorations, 8);
  }

  constructor(private readonly onReady?: (scene: CampusScene) => void) {
    super("CampusScene");
    window.addEventListener("campus-draft-mutated-by-ui", this.uiMutationListener);
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
    this.screenStationGraphics = this.add.graphics().setDepth(16);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.handleBuilderPointer(pointer);
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBuilderPointer(pointer);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.builderState?.open) {
        if (this.isPainting) {
          this.isPainting = false;
          this.pushHistoryState();
        }
        if (this.builderRectStart) {
          const col = Math.floor(pointer.worldX / 32);
          const row = Math.floor(pointer.worldY / 32);
          const minCol = Math.min(this.builderRectStart.col, col);
          const maxCol = Math.max(this.builderRectStart.col, col);
          const minRow = Math.min(this.builderRectStart.row, row);
          const maxRow = Math.max(this.builderRectStart.row, row);
          for (let c = minCol; c <= maxCol; c++) {
            for (let r = minRow; r <= maxRow; r++) {
              if (c >= 0 && c < this.activeMap.columns && r >= 0 && r < this.activeMap.rows) {
                this.paintTile(c, r, this.builderState.layer, this.builderState.tile);
              }
            }
          }
          this.builderRectStart = null;
          this.pushHistoryState();
        }
      }
    });

    this.input.keyboard?.on("keydown-Z", (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.shiftKey) {
          this.redoDraft();
        } else {
          this.undoDraft();
        }
      }
    });
    this.input.keyboard?.on("keydown-Y", (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        this.redoDraft();
      }
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    const onMetadataChange = () => this.drawBuilderMetadata();
    window.addEventListener("campus-metadata-changed", onMetadataChange);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      window.removeEventListener("campus-metadata-changed", onMetadataChange);
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
    this.positionSpeechBubbles();
    this.drawProximityRings();
    this.drawFocusBarriers();
    this.drawFocusDesks();
    this.drawScreenStations();
  }

  private positionSpeechBubbles(): void {
    for (const [sessionId, bubble] of this.speechBubbles.entries()) {
      const display = this.players.get(sessionId);
      if (display) {
        bubble.setPosition(
          display.container.x,
          display.container.y - AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE - 24,
        );
      }
    }
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

  setHighlightedInteractableId(interactableId: string | null): void {
    this.highlightedInteractableId = interactableId;

    if (this.ready) {
      this.drawFocusDesks();
      this.drawScreenStations();
    }
  }

  setScreenShare(screenShare: ScreenShareSnapshot | null): void {
    this.screenShare = screenShare;
    this.presentingSessionIds = new Set(
      screenShare?.presentations.map((presentation) => presentation.presenterSessionId) ?? [],
    );

    if (this.ready) {
      this.refreshPlayerStyles();
      this.drawScreenStations();
    }
  }

  setBuilderState(state: {
    open: boolean;
    layer: "ground" | "structures" | "decorations" | "zones" | "spawns" | "interactables";
    tile: CampusTileId | null;
    tool: "pencil" | "rect" | "fill";
    showGrid: boolean;
  }): void {
    // Cleanup state when changing tool or closing
    if (!state.open || (this.builderState && this.builderState.tool !== state.tool)) {
      this.isPainting = false;
      this.builderRectStart = null;
    }

    this.builderState = state;
    if (!state.open && this.builderPreviewSprite) {
      this.builderPreviewSprite.setVisible(false);
    }
    this.drawBuilderGrid();
    this.drawBuilderMetadata();
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
    const layers = this.activeMap.layers;
    this.createTilemapLayer("ground", layers.ground, 0);
    this.createTilemapLayer("structures", layers.structures, 4);
    this.createTilemapLayer("decorations", layers.decorations, 8);
  }

  private createTilemapLayer(name: string, data: CampusMapLayer, depth: number): void {
    const tilesetKey = this.textures.exists(PIXEL_ASSETS.campusTiles.key)
      ? PIXEL_ASSETS.campusTiles.key
      : FALLBACK_TILESET_KEY;

    const rows = toTileFrameRows(data, this.activeMap.columns, this.activeMap.rows);
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
    this.tilemapLayers[name] = layer as Phaser.Tilemaps.TilemapLayer;
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
      .circle(0, -AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE * 0.5, 24, 0x34d399, 0.15)
      .setStrokeStyle(3, 0x10b981, 0.95)
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
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        color: "#f8fafc",
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

    for (const desk of INTERACTABLES) {
      if (desk.kind !== "focus_desk") {
        continue;
      }

      const occupied = occupiedDeskIds.has(desk.id);
      const nearby = this.highlightedInteractableId === desk.id;

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

  private drawScreenStations(): void {
    const graphics = this.screenStationGraphics;
    graphics?.clear();

    if (!graphics) {
      return;
    }

    for (const station of INTERACTABLES) {
      if (station.kind !== "screen_station") {
        continue;
      }

      const active = this.screenShare?.presentations.some(
        (presentation) => presentation.stationId === station.id,
      );
      const nearby = this.highlightedInteractableId === station.id;

      if (!active && !nearby) {
        continue;
      }

      const color = active ? 0x44c5e8 : 0xc89b30;
      graphics.fillStyle(color, active ? 0.18 : 0.1);
      graphics.fillRoundedRect(
        station.interactionPosition.x - 29,
        station.interactionPosition.y - 47,
        58,
        38,
        6,
      );
      graphics.lineStyle(3, color, active ? 0.95 : 0.8);
      graphics.strokeRoundedRect(
        station.interactionPosition.x - 29,
        station.interactionPosition.y - 47,
        58,
        38,
        6,
      );

      if (active) {
        const pulse = (Math.sin(this.time.now / 180) + 1) / 2;
        graphics.lineStyle(1, 0xe5fbff, 0.45 + pulse * 0.32);
        graphics.strokeCircle(
          station.interactionPosition.x,
          station.interactionPosition.y - 27,
          28 + pulse * 3,
        );
      }
    }
  }

  private refreshPlayerStyles(): void {
    for (const [sessionId, display] of this.players) {
      this.stylePlayer(display, sessionId);
    }
  }

  private stylePlayer(display: PlayerDisplay, sessionId: string): void {
    const isSpeaking = this.speakingIdentities.has(sessionId);
    const isPresenting = this.presentingSessionIds.has(sessionId);
    display.speaking = isSpeaking;
    display.speakingHalo.setVisible(isSpeaking);
    display.label
      .setBackgroundColor(
        display.focusMode
          ? "rgba(88,28,135,0.85)"
          : isPresenting
            ? "rgba(12,74,110,0.85)"
            : isSpeaking
              ? "rgba(6,78,59,0.85)"
              : "rgba(15,23,42,0.85)",
      )
      .setColor(
        display.focusMode
          ? "#e9d5ff"
          : isPresenting
            ? "#bae6fd"
            : isSpeaking
              ? "#a7f3d0"
              : "#f8fafc",
      );
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

  showSpeechBubble(sessionId: string, message: string): void {
    const player = this.players.get(sessionId);
    if (!player) {
      return;
    }

    if (this.speechBubbles.has(sessionId)) {
      const existing = this.speechBubbles.get(sessionId);
      existing?.destroy();
      this.speechBubbles.delete(sessionId);
    }

    const bubble = this.add.container(0, 0).setDepth(200);

    const paddingX = 10;
    const paddingY = 8;
    const textObj = this.add.text(0, 0, message, {
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      color: "#18261f",
      align: "center",
      wordWrap: { width: 160, useAdvancedWrap: true },
    });

    textObj.setOrigin(0.5, 1);
    const bgWidth = textObj.width + paddingX * 2;
    const bgHeight = textObj.height + paddingY * 2;

    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 0.95);
    graphics.fillRoundedRect(-bgWidth / 2, -bgHeight - 6, bgWidth, bgHeight, 6);
    graphics.fillTriangle(-4, -6, 4, -6, 0, 0);

    textObj.setPosition(0, -paddingY - 6);
    bubble.add([graphics, textObj]);

    this.speechBubbles.set(sessionId, bubble);

    this.time.delayedCall(4000, () => {
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        y: bubble.y - 10,
        duration: 300,
        onComplete: () => {
          bubble.destroy();
          if (this.speechBubbles.get(sessionId) === bubble) {
            this.speechBubbles.delete(sessionId);
          }
        },
      });
    });
  }

  showEmojiReaction(sessionId: string, emoji: string): void {
    const player = this.players.get(sessionId);
    if (!player) {
      return;
    }

    const emojiText = this.add.text(
      player.container.x,
      player.container.y - AVATAR_FRAME_HEIGHT * AVATAR_DISPLAY_SCALE - 32,
      emoji,
      { fontSize: "28px" },
    );
    emojiText.setOrigin(0.5, 1).setDepth(250);

    this.tweens.add({
      targets: emojiText,
      y: emojiText.y - 48,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.5 },
      duration: 1200,
      ease: "Power2",
      onComplete: () => emojiText.destroy(),
    });
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

  private drawBuilderGrid(): void {
    if (!this.builderGridGraphics) {
      this.builderGridGraphics = this.add.graphics().setDepth(99);
    }
    const graphics = this.builderGridGraphics;
    graphics.clear();

    if (this.builderState?.open && this.builderState.showGrid) {
      graphics.lineStyle(1, 0xffffff, 0.2);
      const tileSize = 32; // ART_TILE_SIZE * ART_SCALE
      for (let x = 0; x <= MAP_WIDTH; x += tileSize) {
        graphics.moveTo(x, 0);
        graphics.lineTo(x, MAP_HEIGHT);
      }
      for (let y = 0; y <= MAP_HEIGHT; y += tileSize) {
        graphics.moveTo(0, y);
        graphics.lineTo(MAP_WIDTH, y);
      }
      graphics.strokePath();
    }
  }

  private drawBuilderMetadata(): void {
    if (!this.builderMetadataGraphics) {
      this.builderMetadataGraphics = this.add.graphics().setDepth(100);
    }
    const graphics = this.builderMetadataGraphics;
    graphics.clear();

    if (!this.builderState?.open) {
      return;
    }

    const tileSize = 32;

    if (this.builderState.layer === "zones") {
      for (const zone of this.activeMap.zones) {
        graphics.fillStyle(0x3b82f6, 0.4);
        graphics.lineStyle(2, 0x60a5fa, 0.8);
        graphics.fillRect(
          zone.rect.x * tileSize,
          zone.rect.y * tileSize,
          zone.rect.width * tileSize,
          zone.rect.height * tileSize,
        );
        graphics.strokeRect(
          zone.rect.x * tileSize,
          zone.rect.y * tileSize,
          zone.rect.width * tileSize,
          zone.rect.height * tileSize,
        );
      }
    } else if (this.builderState.layer === "spawns") {
      for (const spawn of this.activeMap.spawns) {
        graphics.fillStyle(0x10b981, 0.6);
        graphics.lineStyle(2, 0x34d399, 1);
        graphics.fillCircle(
          spawn.x * tileSize + tileSize / 2,
          spawn.y * tileSize + tileSize / 2,
          tileSize / 2,
        );
        graphics.strokeCircle(
          spawn.x * tileSize + tileSize / 2,
          spawn.y * tileSize + tileSize / 2,
          tileSize / 2,
        );
      }
    } else if (this.builderState.layer === "interactables") {
      for (const int of this.activeMap.interactables) {
        graphics.fillStyle(0xf59e0b, 0.5);
        graphics.lineStyle(2, 0xfbbf24, 0.9);
        graphics.fillCircle(
          int.interactionPosition.x,
          int.interactionPosition.y,
          int.interactionRadius,
        );
        graphics.strokeCircle(
          int.interactionPosition.x,
          int.interactionPosition.y,
          int.interactionRadius,
        );
      }
    }

    if (this.metadataDragStart && this.metadataDragCurrent) {
      const startX = Math.min(this.metadataDragStart.x, this.metadataDragCurrent.x);
      const startY = Math.min(this.metadataDragStart.y, this.metadataDragCurrent.y);
      const width = Math.abs(this.metadataDragStart.x - this.metadataDragCurrent.x) + 1;
      const height = Math.abs(this.metadataDragStart.y - this.metadataDragCurrent.y) + 1;

      graphics.fillStyle(0xffffff, 0.3);
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.fillRect(startX * tileSize, startY * tileSize, width * tileSize, height * tileSize);
      graphics.strokeRect(
        startX * tileSize,
        startY * tileSize,
        width * tileSize,
        height * tileSize,
      );
    }
  }

  private handleBuilderPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.builderState?.open) {
      return;
    }

    const x = pointer.worldX;
    const y = pointer.worldY;
    const tileSize = 32; // ART_TILE_SIZE * ART_SCALE
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    const snappedX = col * tileSize;
    const snappedY = row * tileSize;

    if (!this.builderPreviewSprite) {
      this.builderPreviewSprite = this.add
        .sprite(snappedX, snappedY, PIXEL_ASSETS.campusTiles.key)
        .setOrigin(0, 0)
        .setScale(ART_SCALE)
        .setAlpha(0.6)
        .setDepth(100);
    }

    this.builderPreviewSprite.setPosition(snappedX, snappedY);

    if (["zones", "spawns", "interactables"].includes(this.builderState.layer)) {
      this.builderPreviewSprite.setVisible(false);
      this.handleMetadataPointer(pointer, col, row);
      return;
    }

    this.builderPreviewSprite.setVisible(true);

    if (this.builderState.tile) {
      this.builderPreviewSprite.setFrame(TILE_FRAME_BY_ID[this.builderState.tile]);
      this.builderPreviewSprite.setTint(0xffffff);
    } else {
      // Eraser preview (using empty tile frame and red tint)
      this.builderPreviewSprite.setFrame(TILE_FRAME_BY_ID["empty"]);
      this.builderPreviewSprite.setTint(0xff0000);
    }

    if (this.builderState.tool === "fill") {
      if (pointer.isDown && !this.isPainting) {
        this.floodFill(col, row, this.builderState.layer, this.builderState.tile);
        this.isPainting = true;
      }
      return;
    }

    if (this.builderState.tool === "rect") {
      if (pointer.isDown) {
        if (!this.builderRectStart) {
          this.builderRectStart = { col, row };
        }
        this.builderPreviewSprite.setVisible(false);
        if (!this.builderMetadataGraphics) return;
        this.builderMetadataGraphics.clear();
        this.drawBuilderMetadata();

        const minCol = Math.min(this.builderRectStart.col, col);
        const maxCol = Math.max(this.builderRectStart.col, col);
        const minRow = Math.min(this.builderRectStart.row, row);
        const maxRow = Math.max(this.builderRectStart.row, row);

        this.builderMetadataGraphics.fillStyle(0xffffff, 0.4);
        this.builderMetadataGraphics.lineStyle(2, 0xffffff, 1);
        this.builderMetadataGraphics.fillRect(
          minCol * tileSize,
          minRow * tileSize,
          (maxCol - minCol + 1) * tileSize,
          (maxRow - minRow + 1) * tileSize,
        );
        this.builderMetadataGraphics.strokeRect(
          minCol * tileSize,
          minRow * tileSize,
          (maxCol - minCol + 1) * tileSize,
          (maxRow - minRow + 1) * tileSize,
        );
      }
      return;
    }

    if (pointer.isDown) {
      if (col >= 0 && col < this.activeMap.columns && row >= 0 && row < this.activeMap.rows) {
        this.paintTile(col, row, this.builderState.layer, this.builderState.tile);
        this.isPainting = true;
      }
    }
  }

  private handleMetadataPointer(pointer: Phaser.Input.Pointer, col: number, row: number): void {
    const tileSize = 32;
    if (this.builderState?.layer === "zones" || this.builderState?.layer === "interactables") {
      if (pointer.isDown) {
        if (!this.metadataDragStart) {
          this.metadataDragStart = { x: col, y: row };
        }
        this.metadataDragCurrent = { x: col, y: row };
        this.drawBuilderMetadata();
      } else if (!pointer.isDown && this.metadataDragStart) {
        const startX = Math.min(this.metadataDragStart.x, col);
        const startY = Math.min(this.metadataDragStart.y, row);
        const width = Math.abs(this.metadataDragStart.x - col) + 1;
        const height = Math.abs(this.metadataDragStart.y - row) + 1;

        if (this.builderState.layer === "zones") {
          const newZone = {
            id: `zone-${Date.now()}`,
            label: "Nova Zona",
            acousticMode: "open",
            rect: { x: startX, y: startY, width, height },
          };
          // biome-ignore lint/suspicious/noExplicitAny: Muting local draft map
          (this.activeMap.zones as any[]).push(newZone);
        } else if (this.builderState.layer === "interactables") {
          const newInt = {
            id: `int-${Date.now()}`,
            kind: "focus_desk",
            label: "Nova Interação",
            interactionPosition: {
              x: (startX + width / 2) * tileSize,
              y: (startY + height / 2) * tileSize,
            },
            interactionRadius: (Math.max(width, height) * tileSize) / 2,
            priority: 1,
            seatPosition: {
              x: (startX + width / 2) * tileSize,
              y: (startY + height / 2) * tileSize,
            },
            exitPosition: {
              x: (startX + width / 2) * tileSize,
              y: (startY + height / 2 + 1) * tileSize,
            },
            facing: "down",
          };
          // biome-ignore lint/suspicious/noExplicitAny: Muting local draft map
          (this.activeMap.interactables as any[]).push(newInt);
        }

        window.dispatchEvent(new CustomEvent("campus-metadata-changed"));
        localStorage.setItem("campus_map_draft", JSON.stringify(this.draftMap));
        this.pushHistoryState();
        this.metadataDragStart = null;
        this.metadataDragCurrent = null;
        this.drawBuilderMetadata();
      }
    } else if (this.builderState?.layer === "spawns") {
      if (pointer.isDown && !this.metadataDragStart) {
        this.metadataDragStart = { x: col, y: row };
      } else if (!pointer.isDown && this.metadataDragStart) {
        // biome-ignore lint/suspicious/noExplicitAny: Muting local draft map
        (this.activeMap.spawns as any[]).push({ x: col, y: row });
        window.dispatchEvent(new CustomEvent("campus-metadata-changed"));
        localStorage.setItem("campus_map_draft", JSON.stringify(this.draftMap));
        this.pushHistoryState();
        this.metadataDragStart = null;
        this.drawBuilderMetadata();
      }
    }
  }

  private floodFill(
    startCol: number,
    startRow: number,
    layerName: string,
    newTile: CampusTileId | null,
  ) {
    if (
      startCol < 0 ||
      startCol >= this.activeMap.columns ||
      startRow < 0 ||
      startRow >= this.activeMap.rows
    )
      return;

    const layerData = this.activeMap.layers[
      layerName as keyof typeof this.activeMap.layers
    ] as CampusTileId[];
    if (!layerData) return;

    const startIndex = startRow * this.activeMap.columns + startCol;
    const targetTile = layerData[startIndex] || "empty";
    const replacement = newTile || "empty";

    if (targetTile === replacement) return;

    const queue = [{ col: startCol, row: startRow }];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const { col, row } = item;
      const idx = row * this.activeMap.columns + col;

      if (visited.has(idx)) continue;
      visited.add(idx);

      const currentTile = layerData[idx] || "empty";
      if (currentTile === targetTile) {
        this.paintTile(col, row, layerName, newTile);

        if (col > 0) queue.push({ col: col - 1, row });
        if (col < this.activeMap.columns - 1) queue.push({ col: col + 1, row });
        if (row > 0) queue.push({ col, row: row - 1 });
        if (row < this.activeMap.rows - 1) queue.push({ col, row: row + 1 });
      }
    }
  }

  private paintTile(col: number, row: number, layerName: string, tile: CampusTileId | null): void {
    const tilemapLayer = this.tilemapLayers[layerName];
    if (tilemapLayer) {
      if (tile && tile !== "empty") {
        const frameIndex = TILE_FRAME_BY_ID[tile];
        tilemapLayer.putTileAt(frameIndex, col, row);
      } else {
        tilemapLayer.removeTileAt(col, row);
      }

      const layerData = this.activeMap.layers[
        layerName as keyof typeof this.activeMap.layers
      ] as CampusTileId[];
      const index = row * this.activeMap.columns + col;
      layerData[index] = tile ?? "empty";
      localStorage.setItem("campus_map_draft", JSON.stringify(this.draftMap));
    }
  }
}

function toTileFrameRows(layer: CampusMapLayer, columns: number, rows: number): number[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const tileId = layer[row * columns + column];
      return tileId ? TILE_FRAME_BY_ID[tileId] : -1;
    }),
  );
}
