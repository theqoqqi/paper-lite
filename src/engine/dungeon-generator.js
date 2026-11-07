import { RNG } from "../utils/rng.js";

export class DungeonGenerator {
    static generate(floor = 0) {
        const dirs = [
            { name: "up", opp: "down", dx: 0, dy: -1 },
            { name: "down", opp: "up", dx: 0, dy: 1 },
            { name: "left", opp: "right", dx: -1, dy: 0 },
            { name: "right", opp: "left", dx: 1, dy: 0 },
        ];

        const startKey = "0,0";
        const rooms = {};
        rooms[startKey] = {
            id: startKey,
            x: 0,
            y: 0,
            type: "start",
            doors: { up: false, down: false, left: false, right: false },
            visited: true,
            cleared: true,
            visible: true,
            revealed: true,
        };

        const majorCount = 10 + floor * 2;
        const corridorCount = 3 + floor;
        const targetCount = majorCount + corridorCount;
        const startDir = RNG.choice(dirs);
        const firstKey = `${startDir.dx},${startDir.dy}`;
        const firstRoom = {
            id: firstKey,
            x: startDir.dx,
            y: startDir.dy,
            type: "battle",
            doors: { up: false, down: false, left: false, right: false },
            visited: false,
            cleared: false,
            visible: true,
            revealed: false,
        };

        rooms[startKey].doors[startDir.name] = true;
        firstRoom.doors[startDir.opp] = true;
        rooms[firstKey] = firstRoom;

        const growthList = [firstRoom];

        let attempts = 0;
        while (Object.keys(rooms).length < targetCount && attempts < 1000) {
            attempts++;
            const current = RNG.choice(growthList);
            const shuffledDirs = RNG.shuffle(dirs);

            for (const dir of shuffledDirs) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;
                const nKey = `${nx},${ny}`;

                if (!rooms[nKey]) {
                    const newRoom = {
                        id: nKey,
                        x: nx,
                        y: ny,
                        type: "battle",
                        doors: { up: false, down: false, left: false, right: false },
                        visited: false,
                        cleared: false,
                        visible: false,
                        revealed: false,
                    };

                    current.doors[dir.name] = true;
                    newRoom.doors[dir.opp] = true;
                    rooms[nKey] = newRoom;
                    growthList.push(newRoom);

                    for (const otherDir of dirs) {
                        const adjX = nx + otherDir.dx;
                        const adjY = ny + otherDir.dy;
                        const adjKey = `${adjX},${adjY}`;
                        if (rooms[adjKey] && rooms[adjKey] !== current && adjKey !== startKey && RNG.chance(15)) {
                            newRoom.doors[otherDir.name] = true;
                            rooms[adjKey].doors[otherDir.opp] = true;
                        }
                    }
                    break;
                }
            }
        }

        const roomList = Object.values(rooms);

        const distances = { [startKey]: 0 };
        const queue = [rooms[startKey]];

        while (queue.length > 0) {
            const curr = queue.shift();
            const currDist = distances[curr.id];

            for (const dir of dirs) {
                if (curr.doors[dir.name]) {
                    const nextKey = `${curr.x + dir.dx},${curr.y + dir.dy}`;
                    if (rooms[nextKey] && distances[nextKey] === undefined) {
                        distances[nextKey] = currDist + 1;
                        queue.push(rooms[nextKey]);
                    }
                }
            }
        }

        const deadEnds = roomList.filter(r => {
            if (r.id === startKey) return false;
            const openDoors = Object.values(r.doors).filter(Boolean).length;
            return openDoors === 1;
        });

        let bossRoom;
        if (deadEnds.length > 0) {
            deadEnds.sort((a, b) => (distances[b.id] || 0) - (distances[a.id] || 0));
            bossRoom = deadEnds[0];
        } else {
            const sortedByDist = [...roomList].filter(r => r.id !== startKey);
            sortedByDist.sort((a, b) => (distances[b.id] || 0) - (distances[a.id] || 0));
            bossRoom = sortedByDist[0];
        }
        bossRoom.type = "boss";

        const pool = RNG.shuffle(roomList.filter(r => r.id !== startKey && r.id !== firstKey && r.id !== bossRoom.id));

        if (pool.length > 0) {
            pool.pop().type = "shop";
        }

        const campfiresCount = floor >= 2 ? 2 : 1;
        for (let i = 0; i < campfiresCount && pool.length > 0; i++) {
            pool.pop().type = "campfire";
        }

        const elitesCount = floor >= 1 ? 2 : 1;
        for (let i = 0; i < elitesCount && pool.length > 0; i++) {
            pool.pop().type = "elite";
        }

        for (let i = 0; i < corridorCount && pool.length > 0; i++) {
            pool.pop().type = "corridor";
        }

        while (pool.length > 0) {
            const r = pool.pop();
            r.type = RNG.chance(40) ? "event" : "battle";
        }

        for (const dir of dirs) {
            if (rooms[startKey].doors[dir.name]) {
                const adjKey = `${dir.dx},${dir.dy}`;
                if (rooms[adjKey]) {
                    rooms[adjKey].visible = true;
                }
            }
        }

        return {
            rooms: rooms,
            startPos: { x: 0, y: 0 },
            bossRoomId: bossRoom.id,
            totalRooms: roomList.length,
        };
    }
}
