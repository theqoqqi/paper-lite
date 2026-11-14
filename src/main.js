import { game } from "./engine/game.js";
import { playSound } from "./utils/audio.js";
import { DATA_CORRIDOR_ROOMS } from "./data/corridors.js";
import {
    REGULAR_SPRITESHEET_PATH,
    ELITES_SPRITESHEET_PATH,
    enemySprites,
} from "./data/enemy-sprites.js";
import { renderGlobalNav } from "./ui/components.js";
import {
    renderMenuScreen,
    renderMetaShopScreen,
    renderClassSelectScreen,
    renderAbyssChoiceScreen,
    renderEndScreen,
} from "./ui/screens/menu.js";
import { renderMapScreen } from "./ui/screens/map.js";
import { renderBattleScreen, clearActiveFxRows } from "./ui/screens/battle.js";
import {
    renderLevelUpScreen,
    renderEventScreen,
    renderEventRewardsScreen,
    renderCampfireScreen,
    renderCorridorScreen,
    renderFountainScreen,
    renderShopScreen,
} from "./ui/screens/rooms.js";

export function render() {
    const container = document.getElementById("screen-container");
    container.replaceChildren();
    if (game.state !== "BATTLE") {
        const overlay = document.getElementById("fx-overlay");
        if (overlay) overlay.replaceChildren();
        clearActiveFxRows();
    }
    renderGlobalNav(render);

    if (game.state === "MENU") {
        container.appendChild(renderMenuScreen(render));
    } else if (game.state === "META_SHOP") {
        container.appendChild(renderMetaShopScreen(render));
    } else if (game.state === "CLASS_SELECT") {
        container.appendChild(renderClassSelectScreen(render));
    } else if (game.state === "MAP") {
        container.appendChild(renderMapScreen(render));
    } else if (game.state === "BATTLE") {
        container.appendChild(renderBattleScreen(render));
    } else if (game.state === "LEVELUP") {
        container.appendChild(renderLevelUpScreen(render));
    } else if (game.state === "EVENT") {
        container.appendChild(renderEventScreen(render));
    } else if (game.state === "EVENT_REWARDS") {
        container.appendChild(renderEventRewardsScreen(render));
    } else if (game.state === "CAMPFIRE") {
        container.appendChild(renderCampfireScreen(render));
    } else if (game.state === "CORRIDOR") {
        container.appendChild(renderCorridorScreen(render));
    } else if (game.state === "FOUNTAIN") {
        container.appendChild(renderFountainScreen(render));
    } else if (game.state === "SHOP") {
        container.appendChild(renderShopScreen(render));
    } else if (game.state === "ABYSS_CHOICE") {
        container.appendChild(renderAbyssChoiceScreen(render));
    } else if (game.state === "GAMEOVER" || game.state === "VICTORY") {
        container.appendChild(renderEndScreen(render));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    history.pushState({ screen: "game" }, "");
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", (e) => {
        if (e.target.closest("button:not(:disabled)")) {
            playSound("click");
        }
    });
    render();
    setTimeout(warmImageCache, 800);
});

function handlePopState() {
    history.pushState({ screen: "game" }, "");

    const modal = document.querySelector(".modal-overlay");
    if (modal) {
        modal.remove();
        return;
    }

    if (game.state === "CLASS_SELECT" || game.state === "META_SHOP") {
        game.state = "MENU";
        render();
        return;
    }

    if (game.state === "SHOP") {
        if (game.previewShopOfferIndex !== null) {
            game.previewShopOfferIndex = null;
        } else {
            game.finishRoom();
        }
        render();
        return;
    }

    if (game.state === "EVENT_REWARDS") {
        if (!game.pendingEquipment && !game.pendingArtifact) {
            game.eventRewards = null;
            game.checkLevelUpOrFinishRoom();
            render();
        }
        return;
    }
}

function warmImageCache() {
    const urls = [
        REGULAR_SPRITESHEET_PATH,
        ELITES_SPRITESHEET_PATH,
        ...Object.values(enemySprites).filter((s) => s.isBanner).map((s) => s.src),
        ...DATA_CORRIDOR_ROOMS.map((r) => r.image),
    ];
    urls.forEach((src) => {
        fetch(src).catch(() => {});
    });
}
