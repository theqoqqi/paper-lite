import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { GAME_DATA } from "../../data/index.js";
import { renderStatsPanel } from "../components.js";

export function renderMapScreen(render) {
    const floorData = GAME_DATA.floors[game.floor];
    const roomTypes = {
        start: { icon: "🚪", name: "Вход" },
        battle: { icon: "⚔️", name: "Бой" },
        elite: { icon: "💀", name: "Элита" },
        event: { icon: "❓", name: "Событие" },
        shop: { icon: "⚖️", name: "Лавка" },
        campfire: { icon: "🔥", name: "Костёр" },
        fountain: { icon: "⛲", name: "Фонтан" },
        boss: { icon: "👑", name: "БОСС" },
        corridor: { icon: "🕯️", name: "Коридор" },
    };

    const px = game.playerPos.x;
    const py = game.playerPos.y;
    const currentKey = `${px},${py}`;
    const currentRoom = game.dungeonRooms[currentKey] || {
        doors: { up: false, down: false, left: false, right: false },
        type: "start",
        cleared: true,
    };

    const GAP = 10;
    const CORRIDOR_W = 16;

    const gridWrapper = el("div", {
        style: {
            position: "relative",
            marginBottom: "12px",
        },
    });

    const grid = el("div", {
        className: "map-grid",
    });
    gridWrapper.appendChild(grid);

    const corridorLayer = el("div", {
        style: {
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            zIndex: "0",
        },
    });
    gridWrapper.insertBefore(corridorLayer, grid);

    grid.style.position = "relative";
    grid.style.zIndex = "1";

    const cells = [];

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const rx = px + dx;
            const ry = py + dy;
            const rKey = `${rx},${ry}`;
            const room = game.dungeonRooms[rKey];
            const isCenter = dx === 0 && dy === 0;

            let isWalkable = false;
            if (room && (Math.abs(dx) + Math.abs(dy) === 1)) {
                if (dx === 1 && currentRoom.doors.right && room.doors.left) isWalkable = true;
                if (dx === -1 && currentRoom.doors.left && room.doors.right) isWalkable = true;
                if (dy === 1 && currentRoom.doors.down && room.doors.up) isWalkable = true;
                if (dy === -1 && currentRoom.doors.up && room.doors.down) isWalkable = true;
            }

            let cell;
            if (!room || (!room.visible && !room.visited)) {
                cell = el("div", {
                    className: "map-cell",
                    style: {
                        background: "#141414",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        opacity: "0.15",
                    },
                });
            } else if (!room.visited && !room.revealed) {
                let nodeClass = "map-node map-cell";
                let bg = "#181818";
                let border = "1px dashed #444444";
                let shadow = "none";

                if (isWalkable) {
                    border = "2px solid #81c784";
                    bg = "#1b281b";
                    shadow = "0 0 8px rgba(129, 199, 132, 0.45)";
                }

                cell = el("div", {
                    className: nodeClass,
                    style: {
                        background: bg,
                        border: border,
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        cursor: isWalkable ? "pointer" : "default",
                        boxShadow: shadow,
                    },
                    onClick: () => {
                        if (isWalkable) {
                            game.moveToRoom(rx, ry);
                            render();
                        }
                    },
                }, [
                    el("div", {
                        style: {
                            fontSize: "24px",
                            lineHeight: "1",
                            color: isWalkable ? "#81c784" : "#666666",
                        },
                        text: "❔",
                    }),
                ]);
            } else {
                const info = roomTypes[room.type] || { icon: "❓", name: room.type };

                let nodeClass = "map-node map-cell";
                let bg = "#252525";
                let border = "1px solid #444444";
                let shadow = "none";
                let opacity = "1";

                if (isCenter) {
                    nodeClass += " active";
                    bg = "#1a365d";
                    border = "2px solid #3182ce";
                    shadow = "0 0 8px rgba(49, 130, 206, 0.4)";
                    opacity = "0.8";
                } else if (isWalkable) {
                    bg = room.visited ? "#162816" : "#1b331b";
                    border = "2px solid #81c784";
                    shadow = "0 0 8px rgba(129, 199, 132, 0.45)";
                    if (room.visited) opacity = "0.25";
                } else if (room.visited) {
                    nodeClass += " done";
                    bg = "#1f1f1f";
                    border = "1px solid #333333";
                    opacity = "0.25";
                }

                cell = el("div", {
                    className: nodeClass,
                    style: {
                        background: bg,
                        border: border,
                        borderRadius: "6px",
                        opacity: opacity,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        cursor: isWalkable ? "pointer" : "default",
                        boxShadow: shadow,
                    },
                    onClick: () => {
                        if (isWalkable) {
                            game.moveToRoom(rx, ry);
                            render();
                        }
                    },
                }, [
                    el("div", {
                        style: {
                            fontSize: "20px",
                            lineHeight: "1.2",
                        },
                        text: info.icon,
                    }),
                    el("div", {
                        style: {
                            fontSize: "10px",
                            marginTop: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            fontWeight: isCenter ? "bold" : "normal",
                            color: isCenter ? "#90cdf4" : (room.visited ? "#888888" : "#f0f0f0"),
                        },
                        text: info.name,
                    }),
                ]);
            }

            cells.push({ cell, dx, dy, rx, ry, room });
            grid.appendChild(cell);
        }
    }

    requestAnimationFrame(() => {
        const gridRect = grid.getBoundingClientRect();
        cells.forEach(({ cell, dx, dy, rx, ry, room }) => {
            if (!room) return;
            const isCenter = dx === 0 && dy === 0;
            const cellRect = cell.getBoundingClientRect();
            const cellLeft = cellRect.left - gridRect.left;
            const cellTop = cellRect.top - gridRect.top;
            const cellW = cellRect.width;
            const cellH = cellRect.height;

            const shouldShowRight = dx < 2 && room.doors.right;
            if (shouldShowRight) {
                const rightRoom = game.dungeonRooms[`${rx + 1},${ry}`];
                if (rightRoom && rightRoom.doors.left && (room.visited || rightRoom.visited)) {
                    const isCorridorWalkable = (isCenter && currentRoom.doors.right) || (dx === -1 && dy === 0 && currentRoom.doors.left);
                    const targetX = isCenter ? rx + 1 : rx;
                    const targetY = ry;
                    const targetRoom = isCenter ? rightRoom : room;
                    const isHighlighted = isCorridorWalkable && !(targetRoom && targetRoom.visited);
                    const corridorEl = el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft + cellW}px`,
                            top: `${cellTop + (cellH - CORRIDOR_W) / 2}px`,
                            width: `${GAP}px`,
                            height: `${CORRIDOR_W}px`,
                            background: isHighlighted ? "#1b2e1e" : "#1a1a1a",
                            borderTop: isHighlighted ? "2px solid #81c784" : "1px solid #444444",
                            borderBottom: isHighlighted ? "2px solid #81c784" : "1px solid #444444",
                            boxSizing: "border-box",
                        },
                    });
                    if (isCorridorWalkable) {
                        corridorEl.style.pointerEvents = "auto";
                        corridorEl.style.cursor = "pointer";
                        corridorEl.addEventListener("click", () => {
                            game.moveToRoom(targetX, targetY);
                            render();
                        });
                    }
                    corridorLayer.appendChild(corridorEl);
                }
            }

            const shouldShowDown = dy < 2 && room.doors.down;
            if (shouldShowDown) {
                const downRoom = game.dungeonRooms[`${rx},${ry + 1}`];
                if (downRoom && downRoom.doors.up && (room.visited || downRoom.visited)) {
                    const isCorridorWalkable = (isCenter && currentRoom.doors.down) || (dx === 0 && dy === -1 && currentRoom.doors.up);
                    const targetX = rx;
                    const targetY = isCenter ? ry + 1 : ry;
                    const targetRoom = isCenter ? downRoom : room;
                    const isHighlighted = isCorridorWalkable && !(targetRoom && targetRoom.visited);
                    const corridorEl = el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft + (cellW - CORRIDOR_W) / 2}px`,
                            top: `${cellTop + cellH}px`,
                            width: `${CORRIDOR_W}px`,
                            height: `${GAP}px`,
                            background: isHighlighted ? "#1b2e1e" : "#1a1a1a",
                            borderLeft: isHighlighted ? "2px solid #81c784" : "1px solid #444444",
                            borderRight: isHighlighted ? "2px solid #81c784" : "1px solid #444444",
                            boxSizing: "border-box",
                        },
                    });
                    if (isCorridorWalkable) {
                        corridorEl.style.pointerEvents = "auto";
                        corridorEl.style.cursor = "pointer";
                        corridorEl.addEventListener("click", () => {
                            game.moveToRoom(targetX, targetY);
                            render();
                        });
                    }
                    corridorLayer.appendChild(corridorEl);
                }
            }

            if (dx === 2 && room.doors.right) {
                const outsideRoom = game.dungeonRooms[`${rx + 1},${ry}`];
                if (outsideRoom && outsideRoom.doors.left && (room.visited || (room.visible && outsideRoom.visited))) {
                    corridorLayer.appendChild(el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft + cellW}px`,
                            top: `${cellTop + (cellH - CORRIDOR_W) / 2}px`,
                            width: `${GAP}px`,
                            height: `${CORRIDOR_W}px`,
                            background: "#1a1a1a",
                            borderTop: "1px solid #444444",
                            borderBottom: "1px solid #444444",
                            maskImage: "linear-gradient(to right, #000 15%, transparent 85%)",
                            webkitMaskImage: "linear-gradient(to right, #000 15%, transparent 85%)",
                            boxSizing: "border-box",
                        },
                    }));
                }
            }

            if (dx === -2 && room.doors.left) {
                const outsideRoom = game.dungeonRooms[`${rx - 1},${ry}`];
                if (outsideRoom && outsideRoom.doors.right && (room.visited || (room.visible && outsideRoom.visited))) {
                    corridorLayer.appendChild(el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft - GAP}px`,
                            top: `${cellTop + (cellH - CORRIDOR_W) / 2}px`,
                            width: `${GAP}px`,
                            height: `${CORRIDOR_W}px`,
                            background: "#1a1a1a",
                            borderTop: "1px solid #444444",
                            borderBottom: "1px solid #444444",
                            maskImage: "linear-gradient(to left, #000 15%, transparent 85%)",
                            webkitMaskImage: "linear-gradient(to left, #000 15%, transparent 85%)",
                            boxSizing: "border-box",
                        },
                    }));
                }
            }

            if (dy === -2 && room.doors.up) {
                const outsideRoom = game.dungeonRooms[`${rx},${ry - 1}`];
                if (outsideRoom && outsideRoom.doors.down && (room.visited || (room.visible && outsideRoom.visited))) {
                    corridorLayer.appendChild(el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft + (cellW - CORRIDOR_W) / 2}px`,
                            top: `${cellTop - GAP}px`,
                            width: `${CORRIDOR_W}px`,
                            height: `${GAP}px`,
                            background: "#1a1a1a",
                            borderLeft: "1px solid #444444",
                            borderRight: "1px solid #444444",
                            maskImage: "linear-gradient(to top, #000 15%, transparent 85%)",
                            webkitMaskImage: "linear-gradient(to top, #000 15%, transparent 85%)",
                            boxSizing: "border-box",
                        },
                    }));
                }
            }

            if (dy === 2 && room.doors.down) {
                const outsideRoom = game.dungeonRooms[`${rx},${ry + 1}`];
                if (outsideRoom && outsideRoom.doors.up && (room.visited || (room.visible && outsideRoom.visited))) {
                    corridorLayer.appendChild(el("div", {
                        style: {
                            position: "absolute",
                            left: `${cellLeft + (cellW - CORRIDOR_W) / 2}px`,
                            top: `${cellTop + cellH}px`,
                            width: `${CORRIDOR_W}px`,
                            height: `${GAP}px`,
                            background: "#1a1a1a",
                            borderLeft: "1px solid #444444",
                            borderRight: "1px solid #444444",
                            maskImage: "linear-gradient(to bottom, #000 15%, transparent 85%)",
                            webkitMaskImage: "linear-gradient(to bottom, #000 15%, transparent 85%)",
                            boxSizing: "border-box",
                        },
                    }));
                }
            }
        });
    });

    const scoutStatus = game.getScoutStatus();
    let scoutBtnText = "🔍 Разведать окружение (1 ⚡ EN)";
    if (scoutStatus.reason === "all_revealed") {
        scoutBtnText = "🔍 Все соседние комнаты разведаны";
    } else if (scoutStatus.reason === "no_en") {
        scoutBtnText = "🔍 Разведка (недостаточно ⚡ EN)";
    } else if (scoutStatus.costType === "hp") {
        scoutBtnText = "🔍 Разведать окружение (3 ❤️ HP)";
    }

    const actionButtons = [];

    if (currentRoom.type === "boss" && currentRoom.cleared && game.floor < 3) {
        actionButtons.push(el("button", {
            className: "btn-center",
            style: {
                marginBottom: "6px",
                background: "#2e4c38",
                borderColor: "#4caf50",
                fontWeight: "bold",
            },
            text: `⬇️ Спуститься на Этаж ${game.floor + 2}`,
            onClick: () => {
                game.floor++;
                game.generateFloorMap();
                game.state = "MAP";
                game.saveGame("autosave");
                render();
            },
        }));
    }

    if (currentRoom.type === "shop" && currentRoom.cleared) {
        actionButtons.push(el("button", {
            className: "btn-center",
            style: {
                marginBottom: "6px",
                background: "#2b3a4a",
                borderColor: "#4a7a96",
                fontWeight: "bold",
            },
            text: "⚖️ Войти в Лавку Торговца",
            onClick: () => {
                game.state = "SHOP";
                render();
            },
        }));
    }

    actionButtons.push(el("button", {
        className: "btn-center btn-primary",
        style: {
            marginBottom: "6px",
        },
        disabled: !scoutStatus.canScout,
        text: scoutBtnText,
        onClick: () => {
            game.scoutSurroundings();
            render();
        },
    }));

    return el("div", {}, [
        el("h3", { text: `Этаж ${game.floor + 1}: ${floorData.name}` }),
        renderStatsPanel(),
        gridWrapper,
        ...actionButtons,
        el("div", {
            className: "panel text-center",
            style: {
                fontSize: "12px",
                padding: "8px",
                color: "#aaaaaa",
                margin: "4px 0",
            },
            text: "Нажмите на соседнюю комнату для перехода",
        }),
    ]);
}
