import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM } from "../prompts";
import { CANON_FIDELITY } from "../prompts/canon";
import { buildTurboSystem } from "../prompts/turbo.system";

describe("общие блоки канона", () => {
	// Инструкция Турбо пишет «Верность запросу» сама, блок канона нужен только
	// обогащению для Krea и Ideogram.
	test("CANON_FIDELITY входит в инструкцию обогащения дословно", () => {
		expect(CANON_FIDELITY.length).toBeGreaterThan(100);
		expect(STYLE_SYSTEM).toContain(CANON_FIDELITY);
	});

	test("в инструкции Турбо нет пронумерованных правил канона", () => {
		expect(buildTurboSystem("")).not.toContain(CANON_FIDELITY);
	});
});

describe("инструкция агента Турбо", () => {
	const tree = "пятерка/ — 2 изображения";
	const system = buildTurboSystem(tree);

	test("содержит разделы в порядке: роль, направление, цикл, правила, библиотека, промпт, инструменты, примеры, самопроверка, дерево", () => {
		const headings = [
			"# Роль",
			"# Что такое 42",
			"# Словарь 42",
			"# Как придумывать кадр",
			"# Критерии готового кадра",
			"# Рабочий цикл",
			"# Верность запросу",
			"# Библиотека и входные изображения",
			"# Промпт для генератора",
			"# Инструменты",
			"# Особые запросы",
			"# Примеры",
			"# Самопроверка",
			"# Дерево библиотеки",
		];
		const positions = headings.map((heading) => system.indexOf(heading));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	test("описывает все три инструмента и контракт generateImage", () => {
		for (const part of [
			"listFolder показывает",
			"readFile читает",
			"generateImage принимает",
			"retryable: true",
			"retryable: false",
		]) {
			expect(system).toContain(part);
		}
	});

	test("дерево библиотеки стоит в самом конце и подставляется в блок <library>", () => {
		expect(system).toContain(`<library>\n${tree}\n</library>`);
		expect(system.trimEnd().endsWith("</library>")).toBe(true);
		expect(system).not.toContain("{tree}");
	});

	test("дерево — единственная изменчивая часть: версия считается по пустому дереву", () => {
		const withoutTree = system.replace(
			`<library>\n${tree}\n</library>`,
			"<library>\n\n</library>",
		);
		expect(withoutTree).toBe(buildTurboSystem(""));
	});

	test("запретов не ради качества в инструкции нет", () => {
		expect(system).not.toContain("реальные государственные флаги");
		expect(system).not.toContain("заменяет любые реальные лица");
	});

	test("стиль описан направлением: квот на предметы и обязательных каталогов нет", () => {
		for (const quota of [
			"не меньше семи",
			"не меньше шести предметов",
			"≥6 предметов роскоши",
			"≥3 сюрприза",
			"меньше десяти различимых",
			"на квадратный метр кадра",
			"ALWAYS используй переданные якоря",
		]) {
			expect(system).not.toContain(quota);
		}
		expect(system).not.toContain("ANCHORS");
	});

	test("написана прозой без выкриков ALWAYS и NEVER", () => {
		expect(system).not.toMatch(/\b(ALWAYS|NEVER)\b/);
	});

	test("работа начинается с идеи, а штамп назван и не запрещён", () => {
		expect(system).toContain("Начинай с идеи");
		expect(system).toContain("три идеи");
		expect(system).toContain("Приёмы, которыми сообщество ловит шутку");
		expect(system).toContain("Штамп.");
		expect(system).toContain(
			"только если её просит запрос или в ней сама шутка",
		);
		expect(system).toContain("Проверка на узнаваемость");
	});

	test("мир строится по вопросу «что деталь делает для шутки», состав — два-три вида", () => {
		expect(system).toContain("что она делает для этой шутки");
		expect(system).toContain("два-три вида существ");
	});

	test("словарь большой, но кадр берёт свою выборку, а не всё сразу", () => {
		const dictionary = system.slice(
			system.indexOf("# Словарь 42"),
			system.indexOf("# Как придумывать кадр"),
		);
		// знаки из разных групп, которые владелец назвал атрибутами 42
		for (const word of [
			"цепи",
			"дроны",
			"средневековье",
			"киберпанк",
			"диско-шары",
			"мопсы",
			"самокаты",
			"число 42",
		]) {
			expect(dictionary).toContain(word);
		}
		expect(dictionary).toContain("своя выборка");
		expect(dictionary).toContain("Не складывай всё сразу");
	});

	test("планка безумия: невозможное зрелище крупно, просьба об обычном её не снижает", () => {
		expect(system).toContain("Планка безумия");
		expect(system).toContain("невозможное зрелище крупно");
		expect(system).toContain("Просьба об обычном планку не снижает");
	});

	test("критерии готового кадра: насыщенность, проработка, реакция зрителя, повтор", () => {
		const criteria = system.slice(
			system.indexOf("# Критерии готового кадра"),
			system.indexOf("# Рабочий цикл"),
		);
		for (const part of [
			"## Несочетаемость",
			"## Эпатаж",
			"## Насыщенность",
			"## Проработка",
			"## Реакция человека",
			"## Первое пришедшее не берётся",
			"У каждого своё несовместимое дело.",
			"Материал не тот.",
			"Знаки сообщества на героях.",
			"Герои позируют.",
			"Образ собран до мелочей.",
			"Предмет сюжета тоже образ.",
			"Нормисы не заполняют кадр.",
			"Три плана.",
			"Облик, действие, место.",
			"Первая секунда.",
		]) {
			expect(criteria).toContain(part);
		}
	});

	test("у агента нет памяти между запросами: ссылок на прошлые картинки нет", () => {
		for (const phrase of [
			"прошлой картинки",
			"прошлых кадрах",
			"предыдущей",
			"в разных кадрах",
			"следующая твоя",
		]) {
			expect(system).not.toContain(phrase);
		}
	});

	test("пример карточки персонажа не повторяет сюжеты запросов набора проверки", () => {
		// агент копирует примеры инструкции: пример «хорошо» не про кота и не про рыбака
		const sheet = system.slice(
			system.indexOf("**Образ собран до мелочей.**"),
			system.indexOf("**Предмет сюжета тоже образ.**"),
		);
		expect(sheet).toContain("Плохо:");
		expect(sheet).toContain("Хорошо:");
		expect(sheet).not.toMatch(/\b(cat|tabby|fisherman|tram)\b/i);
	});

	test("длина промпта: 360–560 слов, карточки героев и описанный фон требуют места", () => {
		expect(system).toContain("360–560 слов");
		expect(system).not.toContain("260–450");
		expect(system).not.toContain("320–520");
	});

	test("ничего по умолчанию: у каждого существительного материал, цвет и странность", () => {
		const section = system.slice(
			system.indexOf("## Ничего по умолчанию"),
			system.indexOf("## Несочетаемость"),
		);
		for (const part of [
			"У каждого существительного три вещи.",
			"Фон тоже.",
			"Проверка по существительным.",
			"a castle built from stacked wedding cakes",
		]) {
			expect(section).toContain(part);
		}
		expect(system).toContain("3c. Ничего по умолчанию");
	});

	test("мопс по-английски pug", () => {
		expect(system).toContain("Мопс по-английски всегда pug");
	});

	test("примеры не повторяют один и тот же зоопарк", () => {
		const examples = system.slice(
			system.indexOf("# Примеры"),
			system.indexOf("# Самопроверка"),
		);
		// каждый из пяти пёстрых героев прошлой версии встречается не во всех примерах
		for (const animal of ["pug", "rooster", "hippopotamus", "opossum"]) {
			const outputs = examples
				.split("OUTPUT:")
				.slice(1)
				.map((part) => part.split("\n\n")[0] ?? "");
			const withAnimal = outputs.filter((output) => output.includes(animal));
			expect(withAnimal.length).toBeLessThan(outputs.length);
		}
	});
});
