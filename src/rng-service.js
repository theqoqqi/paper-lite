// ============================================================================
// RNG-SERVICE.JS — Продвинутый генератор случайных чисел и Pity-система критов
// ============================================================================

class RNG {
    // Случайное целое число в произвольном диапазоне [min, max] включительно
    static range(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Проверка процентного шанса (0..100)
    static chance(percent) {
        return Math.random() * 100 < percent;
    }

    // Разброс значения вокруг базы (например, spread(10, 0.2) вернет от 8 до 12)
    static spread(base, variance = 0.2) {
        const delta = Math.max(1, Math.round(base * variance));
        return this.range(base - delta, base + delta);
    }

    // Случайный элемент массива
    static choice(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Взвешенный выбор: принимает массив объектов с полем weight [{id: 'a', weight: 70}, ...]
    static weightedChoice(items) {
        const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
        let roll = Math.random() * totalWeight;
        for (const item of items) {
            roll -= (item.weight || 1);
            if (roll <= 0) return item;
        }
        return items[items.length - 1];
    }

    // Перемешивание массива (алгоритм Фишера-Йетса)
    static shuffle(arr) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
}
