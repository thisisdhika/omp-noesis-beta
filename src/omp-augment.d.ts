import type {} from "@oh-my-pi/pi-coding-agent/memory-backend/types";

declare module "@oh-my-pi/pi-coding-agent/memory-backend/types" {
  interface MemoryBackendSearchItem {
    /** Context metadata stored at retain time. TODO: upstream PR to OMP SDK. */
    context?: string;
  }
}
