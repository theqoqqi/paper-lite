# [RFC] Прогрессия сложности этажей и ребаланс мутаций

## 1. Резюме решений

* **Проблема:**
  * Сложность этажей росла недостаточно: старый множитель `depthMult = 1 + floor * 0.22 + room * 0.05` увеличивал HP врагов всего на +22% за этаж, а из-за сброса комнат на входе на Этаж 1 враги имели меньший множитель (1.27), чем в конце Этажа 0 (1.35).
  * Бонус к атаке `atkDepthBonus = Math.floor(floor * 1.2 + room / 4)` давал всего +1 к атаке за этаж, что полностью нивелировалось покупкой/находкой брони Тира 2 (DEF +2..+3).
  * Мутация врагов списывала 1 очко бюджета спавна, уменьшая количество врагов в паках, а на 0 этаже мутации были искусственно заблокированы до 6-й комнаты.
  * Элита на 0 и 1 этажах вообще не могла мутировать.

* **Согласованные решения:**
  * **Ступенчатый множитель HP:** фиксированные базовые коэффициенты по этажам без влияния комнат:
    * Этаж 0: `×1.00`
    * Этаж 1: `×1.50`
    * Этаж 2: `×2.15`
    * Этаж 3: `×3.00`
    (распространяется на всех врагов, включая боссов).
  * **Ступенчатый бонус к урону (`atkDepthBonus`):**
    * Этаж 0: `+0`
    * Этаж 1: `+2`
    * Этаж 2: `+4`
    * Этаж 3: `+7`
  * **Сетка шансов мутаций обычных врагов:**
    * Этаж 0: `10%` (с 1-й комнаты, без блокировок)
    * Этаж 1: `30%`
    * Этаж 2: `50%`
    * Этаж 3: `70%`
  * **Сетка шансов мутаций элитных врагов:**
    * Этаж 0: `0%`
    * Этаж 1: `30%`
    * Этаж 2: `60%`
    * Этаж 3: `90%`
  * **Отвязка мутаций от бюджета:** мутация больше не отнимает очко бюджета спавна (`budget -= template.weight`), сохраняя полноценные паки мобов.

---

## 2. Контракты и схема изменений

Все правки изолированы внутри одного файла: `src/engine/systems/battle.js`.

### Таблицы констант прогрессии

```javascript
const FLOOR_HP_MULTIPLIERS = [1.0, 1.5, 2.15, 3.0];
const FLOOR_ATK_BONUSES = [0, 2, 4, 7];
const MUTATION_CHANCE_NORMAL = [10, 30, 50, 70];
const MUTATION_CHANCE_ELITE = [0, 30, 60, 90];
```

### Изменения в `createEnemyInstance(game, enemyKey, applyMutation = false)`

* Вычисление индекса этажа с защитой от выхода за границы:

  ```javascript
  const floorIdx = Math.min(3, Math.max(0, game.floor || 0));
  const depthMult = FLOOR_HP_MULTIPLIERS[floorIdx];
  const atkDepthBonus = FLOOR_ATK_BONUSES[floorIdx];
  ```

* Здоровье и атака:

  ```javascript
  e.hp = Math.round(e.hp * depthMult);
  e.currentHp = e.hp;
  e.atkBonus = atkDepthBonus;
  ```

* Расчет бонуса HP мутации также использует ступенчатый `depthMult`:

  ```javascript
  e.hp += Math.round((mut.hpBonus || 0) * depthMult);
  ```

### Изменения в `setupBattle(game, mode = "normal")`

* **Элита (`mode === "elite"`):**

  ```javascript
  const eliteMutChance = MUTATION_CHANCE_ELITE[floorIdx];
  const mutateElite = RNG.chance(eliteMutChance);
  game.enemies.push(createEnemyInstance(game, eliteKey, mutateElite));
  ```

* **Обычные бои (`normal`):**

  ```javascript
  const mutChance = MUTATION_CHANCE_NORMAL[floorIdx];
  let budget = Math.min(7, 2 + Math.floor(game.room / 3) + game.floor);
  let attempts = 0;
  while (budget > 0 && game.enemies.length < 3 && attempts < 18) {
      attempts++;
      const enemyKey = RNG.choice(floorData.enemies);
      const template = GAME_DATA.enemies[enemyKey];
      if (template.weight <= budget) {
          const mutate = RNG.chance(mutChance);
          game.enemies.push(createEnemyInstance(game, enemyKey, mutate));
          budget -= template.weight;
      }
  }
  ```

---

## 3. Обработка краевых случаев и отказов

* **Индекс этажа вне диапазона:** `Math.min(3, Math.max(0, game.floor || 0))` исключает `undefined`, `NaN` или отрицательные значения.
* **Совместимость сохранений:** Модель данных противника не меняется. Поля `hp`, `currentHp`, `atkBonus`, `spikes`, `regen`, `poisonOnHit`, `bleedOnHit` сохраняются в том же виде. Сериализация в `src/engine/systems/save.js` остаётся на 100% валидной.
* **Инвариант боссов:** Условие `!e.isBoss` гарантирует, что боссы никогда не получают случайных мутаций, но их здоровье и атака корректно масштабируются по ступеням этажей.
* **Мимики:** Сохраняют гарантированную мутацию на этажах `game.floor >= 1`.

---

## 4. Пошаговый план реализации

1. [x] **Шаг 1: Константы прогрессии и ступенчатый скейлинг в `createEnemyInstance`**
   * Объявить константы `FLOOR_HP_MULTIPLIERS`, `FLOOR_ATK_BONUSES`, `MUTATION_CHANCE_NORMAL`, `MUTATION_CHANCE_ELITE` в `src/engine/systems/battle.js`.
   * Переписать формулу `depthMult` и `atkDepthBonus` на выборку из таблиц по `floorIdx`.
   * Убрать влияние `game.room` на базовые HP и урон мобов.

2. [x] **Шаг 2: Ребаланс шансов мутаций и отвязка от бюджета в `setupBattle`**
   * Перевести мутации элиты на сетку `MUTATION_CHANCE_ELITE`.
   * В цикле набора обычной группы мобов применить сетку `MUTATION_CHANCE_NORMAL`.
   * Убрать штраф `+ (mutate ? 1 : 0)` при списании бюджета и убрать блокирующее условие `budget - weight >= 1`.

3. [x] **Шаг 3: Верификация и проверка целостности**
   * Синтаксический аудит: `node -c src/engine/systems/battle.js`.
   * Консольный тест спавна: проверка статов мобов и боссов для этажей 0..3 через `game.createEnemyInstance(...)`.

---

## 5. Стратегия верификации

* **Синтаксическая проверка:**

  ```powershell
  node -c src/engine/systems/battle.js
  ```

* **Ручная верификация в браузере / консоли:**
  * На этапе инициализации проверить статы мобов:
    * `game.createEnemyInstance("rat")` на 0 этаже: 7 HP, +0 ATK.
    * `game.createEnemyInstance("sporeMushroom")` на 1 этаже: 18 HP (база 12 * 1.5), +2 ATK.
    * `game.createEnemyInstance("drone")` на 2 этаже: 32 HP (база 15 * 2.15), +4 ATK.
    * `game.createEnemyInstance("voidHound")` на 3 этаже: 60 HP (база 20 * 3.0), +7 ATK.
  * Боссы:
    * Ворт: 48 HP (+0 ATK)
    * Агарик: 102 HP (+2 ATK)
    * Вулкан: 204 HP (+4 ATK)
    * Малкор: 405 HP (+7 ATK)
