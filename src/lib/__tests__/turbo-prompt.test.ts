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
			"# Как собирается безумие",
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

	test("идея и решения кадра разыгрываются через random, а не выбираются вкусом", () => {
		expect(system).toContain("Инструментов четыре");
		expect(system).toContain("random принимает список вариантов");
		const chance = system.slice(
			system.indexOf("## Решает случай"),
			system.indexOf("# Рабочий цикл"),
		);
		for (const part of [
			"Сначала сама идея: пять-восемь кардинально разных идей одним вызовом",
			"десять-двадцать решений кадра, каждое своим вызовом, все одним раундом",
			"Выпавшее не переигрывается и не подменяется",
			"Названное пользователем",
		]) {
			expect(chance).toContain(part);
		}
		// прогон A показывает и розыгрыш идеи, и десять с лишним решений кадра
		const runA = system.slice(
			system.indexOf("## Прогон A."),
			system.indexOf("## Прогон B."),
		);
		expect(runA.match(/random\(\{ options:/g)?.length ?? 0).toBeGreaterThan(10);
		// у прогона без библиотеки тоже есть розыгрыш идеи
		const runC = system.slice(
			system.indexOf("## Прогон C."),
			system.indexOf("# Самопроверка"),
		);
		expect(runC).toContain("random({ options: [");
	});

	test("описывает все инструменты и контракт generateImage", () => {
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
		expect(system).toContain("Это творческая задача, а не сборка по списку");
		expect(system).toContain("Начни с идеи");
		expect(system).toContain("пять-восемь идей, кардинально разных");
		expect(system).toContain("Приёмы, которыми сообщество ловит шутку");
		expect(system).toContain("Штамп.");
		expect(system).toContain(
			"Язык племени (дорогой громкий лоск, цепи, очки, крупный знак 42, хайп) штампом не считается",
		);
	});

	test("визуальный язык племени описан по эталонам, а не как шаблон частей", () => {
		const language = system.slice(
			system.indexOf("# Что такое 42"),
			system.indexOf("# Словарь 42"),
		);
		for (const part of [
			"Узнаваемое место, безумие в нём.",
			"Герой владыка по позе, а не по костюму.",
			"Братуха-лоск.",
			"42 крупно и по-спортивному.",
			"Хайп в лицах и телах.",
			"Блеск и зрелище.",
			"Крупно, а не много.",
			"Упаковка и реальные вещи.",
			"Свои шутки племени.",
			"это описание того, как выглядит 42, а не набор вещей для копирования",
		]) {
			expect(language.toLowerCase()).toContain(part.toLowerCase());
		}
		// на эталонах один образ размножен, а не «каждый отдельная идея»
		expect(language).not.toContain("Каждый в кадре отдельная идея");
		expect(system).not.toContain("из шести частей");
		expect(system).not.toContain("три-четыре из них");
	});

	test("проработка: счёт вещей по ролям и мешап из разных источников", () => {
		const work = system.slice(
			system.indexOf("## Проработка"),
			system.indexOf("## Реакция человека"),
		);
		expect(work).toContain("Счёт вещей жёсткий");
		expect(work).toContain("не меньше двенадцати отдельных вещей");
		expect(work).toContain("не меньше восьми");
		expect(work).toContain("не меньше четырёх");
		expect(work).toContain("**Мешап из разных вселенных.**");
		expect(work).toContain("минимум трёх разных узнаваемых источников");
		expect(system).toContain("Источники для мешапа.");
		// конкретные вселенные в примерах агент таскал во все кадры (самурай, визор, перчатка)
		expect(system).not.toContain("Тот же счёт с мешапом");
		expect(system).not.toContain("golden gauntlet with six");
	});

	test("лоск племени обязателен у своих, но это не форма: основ десятки", () => {
		const language = system.slice(
			system.indexOf("Братуха-лоск."),
			system.indexOf("42 крупно и по-спортивному."),
		);
		for (const word of [
			"У лоска десятки основ",
			"горностаевая мантия и корона, когда идея про коронацию",
			"пиджак сразу с монограммами",
			"Основу подсказывает идея, как на картинках сообщества",
			"меховая шуба",
			"тёмные очки",
			"Так одеты и звери",
			"это одна из основ, а не форма",
		]) {
			expect(language).toContain(word);
		}
	});

	test("цвет: сильный замысел, без пастели и ровного дневного света", () => {
		expect(system).toContain("Цвет картинок сообщества.");
		expect(system).toContain("**Цветовой замысел.**");
		expect(system).toContain("бледных пастельных фасадов");
		expect(system).toContain(
			"Ни одна палитра и ни одно время суток не повторяются из кадра в кадр",
		);
		expect(system).not.toContain("ясный день с чистым небом, дождь, туман");
		// день и ночь на эталонах примерно поровну; оба примера плотности не должны быть ночными
		expect(system).toContain("Примерно половина из них дневные");
		expect(system).toContain("Герой владыка по позе, а не по костюму.");
		const example5 = system.slice(
			system.indexOf("## Пример 5."),
			system.indexOf("## Пример 6."),
		);
		expect(example5).toContain("midday");
		// палитры примеров разные: красно-синие в примерах давали красно-синий каждый кадр
		const palettes = [...system.matchAll(/([a-z ,-]+) palette/g)].map(
			(match) => match[1] ?? "",
		);
		expect(palettes.length).toBeGreaterThanOrEqual(6);
		const reds = palettes.filter((p) =>
			/\bred\b|crimson|scarlet|burgundy/.test(p),
		);
		const blues = palettes.filter((p) => /\bblue\b|navy|cobalt/.test(p));
		expect(reds.length).toBeLessThanOrEqual(2);
		expect(blues.length).toBeLessThanOrEqual(2);
	});

	test("чистый кадр: инструкция не просит россыпь частиц и мусор", () => {
		expect(system).toContain("**Чистый кадр.**");
		expect(system).toContain("Пол и земля чистая цельная поверхность");
		expect(system).toContain("Мусора нет:");
		// из этих формулировок агент делал россыпь осколков, клавиш и искр по всему кадру
		for (const phrase of [
			"в воздухе фейерверки, лепестки, конфетти и искры",
			"Воздух показывает свет: пыль, пар, дым, конфетти",
			"обломки, дым, вмятины на земле, облака пыли",
		]) {
			expect(system).not.toContain(phrase);
		}
	});

	test("качество, а не количество: крупные объекты, без россыпи мелочи", () => {
		expect(system).toContain("Крупно, а не много.");
		expect(system).toContain("**Сколько всего в кадре.**");
		expect(system).toContain(
			"Пять крупных проработанных объектов насыщеннее пятидесяти мелких",
		);
		expect(system).not.toContain("четыре-шесть групп");
		expect(system).not.toContain("Размножение.");
	});

	test("мир строится по вопросу «что деталь делает для шутки», место и племя, персонажи", () => {
		expect(system).toContain("что она делает для этой шутки");
		expect(system).toContain("Теперь место и племя.");
		expect(system).toContain("Персонажи.");
		expect(system).toContain("не весь зоопарк сразу");
		expect(system).not.toContain("два-три вида существ");
	});

	test("словарь большой, но слова берутся по причине, а не по числу", () => {
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
		expect(dictionary).toContain("Меню здесь нет");
		expect(dictionary).toContain("каждое слово с причиной");
		expect(dictionary).toContain("Лоск племени");
		expect(dictionary).toContain("Складом становятся сюжетные вещи");
	});

	test("нет квот, фиксированных палитр и списков материалов: только творческая задача", () => {
		for (const phrase of [
			"Семьи палитр",
			"Штамп палитры",
			"Восемь слоёв",
			"Костюмный конструктор",
			"минимум три таких предмета",
			"не больше пятой части",
			"четыре-шесть слов",
			"число букв по модулю",
		]) {
			expect(system).not.toContain(phrase);
		}
	});

	test("примеры не делят одну коробку бытовых материалов и закатных цветов", () => {
		const examples = system.slice(
			system.indexOf("# Примеры"),
			system.indexOf("# Самопроверка"),
		);
		// из таких слов агент шил одежду во всех кадрах и красил небо одинаково
		for (const word of [
			"colander",
			"samovar",
			"oven mitt",
			"sponge",
			"foam",
			"towel",
			"pink",
			"violet",
			"purple",
			"turquoise",
		]) {
			expect(examples.toLowerCase()).not.toContain(word);
		}
	});

	test("примеры показывают язык племени: очки, цепи, крупный номер, открытый рот", () => {
		const examples = system.slice(
			system.indexOf("# Примеры"),
			system.indexOf("# Самопроверка"),
		);
		const outputs = examples
			.split("OUTPUT:")
			.slice(1)
			// пример может быть из нескольких абзацев: берём всё до следующего раздела
			.map((part) => part.split("\n## ")[0] ?? "");
		const withShades = outputs.filter((output) =>
			/shades|sunglasses|aviators/i.test(output),
		);
		const withChain = outputs.filter((output) => /gold chain/i.test(output));
		expect(withShades.length).toBeGreaterThanOrEqual(4);
		expect(withChain.length).toBeGreaterThanOrEqual(3);
		expect(examples).toMatch(/42 (as wide as|across the chest|on the back)/);
		// латунь и бархат не должны стать умолчанием в примерах
		for (const word of ["brass", "velvet", "porcelain", "terrazzo"]) {
			const count = outputs.filter((output) =>
				output.toLowerCase().includes(word),
			).length;
			expect(count).toBeLessThanOrEqual(1);
		}
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
			"## Решает случай",
			"У каждого своё несовместимое дело.",
			"Материал не тот.",
			"Каждая вещь фирменная.",
			"Цветовой замысел.",
			"Хайп в лицах и телах.",
			"Образ собран до мелочей.",
			"Одежда из характера и языка племени.",
			"Ездовая махина и предмет сюжета тоже образ.",
			"Нормисы не заполняют кадр.",
			"Армия и рой.",
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
			system.indexOf("**Уличный тест.**"),
		);
		expect(sheet).toContain("Плохо:");
		expect(sheet).toContain("Хорошо:");
		expect(sheet).not.toMatch(/\b(cat|tabby|fisherman|tram)\b/i);
	});

	test("безумие собирается наращиванием, а не набором", () => {
		const section = system.slice(
			system.indexOf("# Как собирается безумие"),
			system.indexOf("# Критерии готового кадра"),
		);
		for (const part of [
			"**Наращивание.**",
			"**Рекурсия.**",
			"**Всё сразу.**",
			"**Логика ломается.**",
			"**Каждая фигура это комбо.**",
			"**Всё служит идее.**",
			"Это ход, а не набор для повторения",
			"Порядок работы.",
		]) {
			expect(section).toContain(part);
		}
		// пример плотности не копирует предметы разобранной картинки
		const example = system.slice(
			system.indexOf("## Пример 6."),
			system.indexOf("## Прогон A."),
		);
		for (const word of ["turtle", "cactus", "cacti", "emoji", "G-class"]) {
			expect(example).not.toContain(word);
		}
		expect(example).toContain("Дерево.");
	});

	test("длина промпта: 550–800 слов, слова на проработку крупного, а не на перечень мелкого", () => {
		expect(system).toContain("550–800 слов");
		expect(system).not.toContain("650–950");
		expect(system).not.toContain("450–650");
		expect(system).not.toContain("260–450");
		expect(system).not.toContain("320–520");
		expect(system).not.toContain("360–560");
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
			"a castle forged from black glass",
		]) {
			expect(section).toContain(part);
		}
		expect(system).toContain(
			"7. Нет существительных без материала, цвета и странности",
		);
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
