import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampusConnection } from "../lib/campusClient";

type Props = {
  connection: CampusConnection;
  interactableId: string;
  onClose: () => void;
};

export function WhiteboardModal({ connection, interactableId, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(2);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const drawLine = useCallback(
    (x0: number, y0: number, x1: number, y1: number, strokeColor: string, strokeWidth: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.closePath();
    },
    [],
  );

  useEffect(() => {
    const unsubscribeSync = connection.onWhiteboardSync((id, lines) => {
      if (id !== interactableId) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas before sync
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const line of lines) {
        drawLine(line.x0, line.y0, line.x1, line.y1, line.color, line.width);
      }
    });

    const unsubscribeDraw = connection.onWhiteboardDraw(
      (sessionId, id, x0, y0, x1, y1, strokeColor, strokeWidth) => {
        if (id !== interactableId) return;
        if (sessionId === connection.sessionId) return; // Ignore own echoes
        drawLine(x0, y0, x1, y1, strokeColor, strokeWidth);
      },
    );

    return () => {
      unsubscribeSync();
      unsubscribeDraw();
    };
  }, [connection, interactableId, drawLine]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    lastPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Force draw a dot
    drawLine(
      lastPos.current.x,
      lastPos.current.y,
      lastPos.current.x,
      lastPos.current.y,
      color,
      lineWidth,
    );
    connection.sendWhiteboardDraw(
      interactableId,
      lastPos.current.x,
      lastPos.current.y,
      lastPos.current.x,
      lastPos.current.y,
      color,
      lineWidth,
    );
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const currentPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    drawLine(lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, color, lineWidth);
    connection.sendWhiteboardDraw(
      interactableId,
      lastPos.current.x,
      lastPos.current.y,
      currentPos.x,
      currentPos.y,
      color,
      lineWidth,
    );

    lastPos.current = currentPos;
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#1e293b", // Slate 800
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          width: "900px",
          maxWidth: "95vw",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", color: "white" }}>
              Quadro Branco Colaborativo
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
              Todos no recinto podem desenhar simultaneamente
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
            title="Fechar (Esc)"
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ display: "flex", background: "#0f172a" }}>
          {/* Tools panel */}
          <div
            style={{
              width: "64px",
              borderRight: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "16px 0",
              gap: "16px",
            }}
          >
            {/* Colors */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                "#ffffff",
                "#ef4444",
                "#f59e0b",
                "#10b981",
                "#3b82f6",
                "#8b5cf6",
                "#ec4899",
                "#0f172a",
              ].map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  title={c === "#0f172a" ? "Borracha" : "Cor"}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: c,
                    border: color === c ? "2px solid white" : "2px solid transparent",
                    cursor: "pointer",
                    boxShadow: c === "#0f172a" ? "inset 0 0 0 1px rgba(255,255,255,0.2)" : "none",
                  }}
                />
              ))}
            </div>

            <div style={{ width: "32px", height: "1px", background: "rgba(255,255,255,0.1)" }} />

            {/* Thickness */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                alignItems: "center",
              }}
            >
              {[2, 6, 12].map((w) => (
                <button
                  type="button"
                  key={w}
                  onClick={() => setLineWidth(w)}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: lineWidth === w ? "rgba(255,255,255,0.1)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: `${w}px`,
                      height: `${w}px`,
                      background: "white",
                      borderRadius: "50%",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Canvas area */}
          <div style={{ position: "relative", cursor: "crosshair" }}>
            <canvas
              ref={canvasRef}
              width={836}
              height={500}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{
                display: "block",
                touchAction: "none", // Prevents scrolling on touch
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
