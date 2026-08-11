import { io, Socket } from "socket.io-client";
import type { ConnectionStatus, SensorPayload } from "./types";

export type ServerToClientEvents = {
  status: (s: ConnectionStatus) => void;
  sensor: (p: SensorPayload) => void;
  serialLine: (p: { ts: number; raw: string; parsed: boolean }) => void;
};

export type ClientToServerEvents = {
  ping: () => void;
};

export function createDashboardSocket() {
  const socketUrl =
    window.DashboardArduino?.socketUrl ??
    (import.meta.env.VITE_SOCKET_URL as string | undefined) ??
    "http://127.0.0.1:4317";

  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 5000
  });

  return socket;
}

