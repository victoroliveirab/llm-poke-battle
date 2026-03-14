import type { ToolController } from "../toolController";
import { getGameStateController } from "./getGameStateController";
import { joinRoomController } from "./joinRoomController";
import { playMoveController } from "./playMoveController";
import { selectPartyController } from "./selectPartyController";
import { startGameController } from "./startGameController";

export const toolControllers: ToolController[] = [
  joinRoomController,
  startGameController,
  selectPartyController,
  getGameStateController,
  playMoveController
];

export const toolControllerByName = new Map<string, ToolController>(
  toolControllers.map((controller) => [controller.name, controller])
);
