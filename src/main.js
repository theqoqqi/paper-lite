import { game } from "./engine/game.js";
import {
    renderGlobalNav,
    renderMenuScreen,
    renderMetaShopScreen,
    renderClassSelectScreen,
    renderMapScreen,
    renderBattleScreen,
    renderLevelUpScreen,
    renderEventScreen,
    renderEventRewardsScreen,
    renderCampfireScreen,
    renderCorridorScreen,
    renderShopScreen,
    renderEndScreen,
} from "./ui/game-ui.js";

export function render() {
    const container = document.getElementById("screen-container");
    container.replaceChildren();
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
    } else if (game.state === "SHOP") {
        container.appendChild(renderShopScreen(render));
    } else if (game.state === "GAMEOVER" || game.state === "VICTORY") {
        container.appendChild(renderEndScreen(render));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    render();
});
