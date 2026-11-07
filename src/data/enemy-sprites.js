export const REGULAR_SPRITESHEET_PATH = "assets/enemies/regular.png";
export const ELITES_SPRITESHEET_PATH = "assets/enemies/elites.png";
export const BOSSES_DIR_PATH = "assets/enemies/bosses";

export const enemySprites = {
    // Обычные враги (Этаж 1)
    rat: regular(0, 0),
    slime: regular(1, 0),
    spiderling: regular(2, 0),
    skeleton: regular(3, 0),
    goblin: regular(4, 0),
    bat: regular(5, 0),
    zombie: regular(6, 0),
    ghoul: regular(7, 0),
    cryptScarab: regular(8, 0),
    cultAcolyte: regular(9, 0),

    // Обычные враги (Этаж 2)
    sporeMushroom: regular(0, 1),
    leech: regular(1, 1),
    mosquito: regular(2, 1),
    myconid: regular(3, 1),
    witch: regular(4, 1),
    crawler: regular(5, 1),
    shambler: regular(6, 1),
    bogTroll: regular(7, 1),
    bogViper: regular(8, 1),
    mireLurker: regular(9, 1),

    // Обычные враги (Этаж 3)
    drone: regular(0, 2),
    fireImp: regular(1, 2),
    slagSlime: regular(2, 2),
    cultist: regular(3, 2),
    crossbowman: regular(4, 2),
    lavaElemental: regular(5, 2),
    pyromancer: regular(6, 2),
    ironGolem: regular(7, 2),
    forgeHound: regular(8, 2),
    magmaSapper: regular(9, 2),

    // Обычные враги (Этаж 4)
    voidHound: regular(0, 3),
    voidShard: regular(1, 3),
    eyeOfTerror: regular(2, 3),
    astralBlade: regular(3, 3),
    mindFlayer: regular(4, 3),
    shadowWeaver: regular(5, 3),
    darkKnight: regular(6, 3),
    riftArchon: regular(7, 3),
    abyssalWisp: regular(8, 3),
    voidSentry: regular(9, 3),

    // Элитные враги (Этаж 1)
    centurion: elite(0, 0),
    spiderQueen: elite(1, 0),
    gargoyle: elite(2, 0),

    // Элитные враги (Этаж 2)
    hydra: elite(0, 1),
    alchemist: elite(1, 1),
    sporeAbomination: elite(2, 1),

    // Элитные враги (Этаж 3)
    inquisitor: elite(0, 2),
    juggernaut: elite(1, 2),
    furnaceWarden: elite(2, 2),

    // Элитные враги (Этаж 4)
    valkyrie: elite(0, 3),
    chronosDemon: elite(1, 3),
    voidReaver: elite(2, 3),

    // Боссы
    kingVort: boss("king_vort.png"),
    agaric: boss("agaric.png"),
    vulkan: boss("vulkan.png"),
    malkor: boss("malkor.png"),
};

export function regular(col, row) {
    return createTileSprite(REGULAR_SPRITESHEET_PATH, col, row, 64);
}

export function elite(col, row) {
    return createTileSprite(ELITES_SPRITESHEET_PATH, col, row, 128);
}

export function boss(fileName) {
    return {
        src: `${BOSSES_DIR_PATH}/${fileName}`,
        isBanner: true,
    };
}

export function createTileSprite(src, col, row, width = 64, height = width) {
    return {
        src: src,
        x: col * width,
        y: row * height,
        width: width,
        height: height,
    };
}
