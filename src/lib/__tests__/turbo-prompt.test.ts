import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM } from "../prompts";
import { CANON_FIDELITY } from "../prompts/canon";
import { buildTurboSystem } from "../prompts/turbo.system";

/**
 * Позиция фразы в тексте. Отсутствующая фраза роняет тест: иначе `slice(-1, k)`
 * вернул бы пустую строку, и все проверки «не содержит» в таком срезе проходили бы
 * вхолостую после переименования заголовка.
 */
function indexIn(text: string, phrase: string): number {
	const index = text.indexOf(phrase);
	if (index < 0) throw new Error(`В тексте нет фразы «${phrase}»`);
	return index;
}

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
		const positions = headings.map((heading) => indexIn(system, heading));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	test("идея и решения кадра разыгрываются через random, а не выбираются вкусом", () => {
		expect(system).toContain("Инструментов четыре");
		expect(system).toContain("random принимает список вариантов");
		const chance = system.slice(
			indexIn(system, "## Решает случай"),
			indexIn(system, "# Рабочий цикл"),
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
			indexIn(system, "## Прогон A."),
			indexIn(system, "## Прогон B."),
		);
		expect(runA.match(/random\(\{ options:/g)?.length ?? 0).toBeGreaterThan(10);
		// у прогона без библиотеки тоже есть розыгрыш идеи
		const runC = system.slice(
			indexIn(system, "## Прогон C."),
			indexIn(system, "# Самопроверка"),
		);
		expect(runC).toContain("random({ options: [");
	});

	test("описывает все инструменты и контракт generateImage", () => {
		for (const part of [
			"listFolder показывает",
			"readFile читает",
			"generateImage принимает",
			"retryable: true",
			"после третьего отказа цикл останавливается сам",
		]) {
			expect(system).toContain(part);
		}
		// инструмент возвращает только retryable: true (CheckImageOutput), ветки
		// «retryable: false» в инструкции быть не должно
		expect(system).not.toContain("retryable: false");
	});

	test("библиотека не только про картинки: текст песни читается до идей и в images не идёт", () => {
		const library = system.slice(
			indexIn(system, "# Библиотека и входные изображения"),
			indexIn(system, "# Промпт для генератора"),
		);
		for (const part of [
			"Рядом с изображениями в папке могут лежать текстовые файлы",
			"в images он не попадает",
			"текст песни открывается до того, как придумываются идеи",
			"строки песни в промпт не переписываются",
		]) {
			expect(library).toContain(part);
		}
		const cycle = system.slice(
			indexIn(system, "# Рабочий цикл"),
			indexIn(system, "# Верность запросу"),
		);
		expect(cycle).toContain("первым раундом открой текст песни");
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
			indexIn(system, "# Что такое 42"),
			indexIn(system, "# Словарь 42"),
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

	test("проработка: вещей много и каждая «узнаваемое плюс поворот» в две-шесть слов, мешап из разных источников", () => {
		const work = system.slice(
			indexIn(system, "## Проработка"),
			indexIn(system, "## Реакция человека"),
		);
		expect(work).toContain("количество и глубина не спорят");
		expect(work).toContain("не меньше двенадцати вещей");
		expect(work).toContain("«узнаваемое плюс поворот» в две-шесть слов");
		expect(work).toContain("Вещь без поворота");
		expect(work).toContain("тыканье мусора");
		// владелец отверг компромисс «меньше вещей, но глубже»: нужны и больше вещей, и глубина
		expect(system).not.toContain("Числовой нормы вещей нет");
		expect(system).not.toContain("Лучше меньше вещей, прописанных глубже");
		expect(system).toContain("Восьмисот слов хватает на всё");
		// бюджет слов по смыслу и одна оговорка точности на всех людей
		expect(system).toContain(
			"герои, публика, названные предметы и недруг получают слов не меньше, чем площадка и свет",
		);
		expect(system).toContain("Если слов не хватает, сокращается площадка");
		expect(system).toContain("для людей один раз на всех в начале");
		expect(work).toContain("**Мешап из разных вселенных.**");
		expect(work).toContain("минимум трёх разных узнаваемых источников");
		expect(system).toContain("Источники для мешапа.");
		// конкретные вселенные в примерах агент таскал во все кадры (самурай, визор, перчатка)
		expect(system).not.toContain("Тот же счёт с мешапом");
		expect(system).not.toContain("golden gauntlet with six");
	});

	test("лоск племени обязателен у своих, но это не форма: основ десятки", () => {
		const language = system.slice(
			indexIn(system, "Братуха-лоск."),
			indexIn(system, "42 крупно и по-спортивному."),
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
			indexIn(system, "## Пример 5."),
			indexIn(system, "## Пример 6."),
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

	test("варианты розыгрыша различаются видом, а холод не тянется от темы", () => {
		// идея не несёт место и цвет: иначе выпавшая «снежная» идея красит весь кадр
		expect(system).toContain(
			"Место, время суток, цвет и носитель в идею не вшиты и разыгрываются отдельно",
		);
		expect(system).toContain("различаются видом, а не оттенком");
		expect(system).toContain("если два варианта можно назвать одним словом");
		expect(system).toContain("один-два варианта против этой тяги");
		expect(system).toContain(
			"Холод (синий, белый, серебро, лёд, стекло) без причины",
		);
		// слова, из которых агент выписывал только ледяные варианты
		expect(system).not.toContain("ледяная синева");
		expect(system).not.toContain("(глянец, лёд, асфальт, трава)");
		// в образце розыгрыша нет «ледяных» палитр
		const runA = system.slice(
			indexIn(system, "## Прогон A."),
			indexIn(system, "## Прогон B."),
		);
		expect(runA).not.toContain("ледяной голубой");
		expect(runA).not.toContain("снежно-белый");
	});

	test("носитель: половина вариантов нарисованные, тело промпта его словарём, люди перерисованы", () => {
		expect(system).toContain("половина вариантов в списке нарисованные");
		expect(system).toContain(
			"Двадцать слов фактуры и одно слово «comic» в конце дают фото",
		);
		expect(system).toContain("оговорка «exactly as in Image 1» не годится");
		expect(system).toContain("redrawn as a comic-book fighter");
		expect(system).toContain("15. Носитель выпал в random и выдержан");
		// образец розыгрыша носителя: нарисованных не меньше половины
		const runA = system.slice(
			indexIn(system, "## Прогон A."),
			indexIn(system, "## Прогон B."),
		);
		const mediumLine = runA
			.split("\n")
			.find((line) => line.includes("фото с церемонии премии"));
		expect(mediumLine).toContain("комикс");
		expect(mediumLine).toContain("аниме-постер");
		expect(mediumLine).toContain("цифровой живописи");
		// пример 7 нарисован словарём носителя, без фотографических микро-материалов
		const example7 = system.slice(
			indexIn(system, "## Пример 7."),
			indexIn(system, "## Прогон A."),
		);
		expect(example7).toContain("halftone");
		expect(example7).toContain("redrawn as a comic-book fighter");
		for (const word of ["scratched", "refract", "photorealistic", "physical"]) {
			expect(example7).not.toContain(word);
		}
	});

	test("публика проработана, безымянные люди не заменяются аватарами, вселенная предмета не растекается", () => {
		expect(system).toContain(
			"со спины, в профиль или в три четверти от камеры",
		);
		expect(system).toContain(
			"Заменять людей на пиксельных или кубических аватаров",
		);
		expect(system).toContain(
			"Публика сообщества это крупные люди на переднем плане",
		);
		expect(system).toContain(
			"Вселенная названного предмета или персонажа остаётся на нём",
		);
		expect(system).toContain("не меньше шестой части кадра");
		// старая формулировка толкала агента заменять публику нечеловеческими фигурами
		expect(system).not.toContain("безымянные фигуры в кадре либо не люди");
	});

	test("классика сообщества может выпасть, но не весь список; ключевое из запроса не мелкое; толпа братух проработана", () => {
		// бегемоты, самокаты, RGB и золотые цепи названы родным языком, а не подозрительным набором
		expect(system).toContain("Классика сообщества.");
		expect(system).toContain("должна стоять среди вариантов розыгрыша наравне");
		expect(system).toContain(
			"Её нельзя ни выкидывать из списков, ни делать ею весь список",
		);
		expect(system).toContain(
			"Штампом классика становится не сама по себе, а когда ею ограничиваются",
		);
		expect(system).toContain("RGB");
		const suspicious = system.slice(
			indexIn(system, "## Решает случай"),
			indexIn(system, "# Рабочий цикл"),
		);
		expect(suspicious).not.toContain("сюжетные вещи словаря (мопс, самокат");
		expect(suspicious).toContain("в эту группу не входит");
		// ключевое из запроса крупное
		expect(system).toContain("Ключевое из запроса не бывает мелким");
		expect(system).toContain(
			"герой не меньше трети кадра, названный предмет не меньше шестой части",
		);
		expect(system).toContain("Мелкое в кадре это то, что ты добавил от себя");
		// толпа 42-братух не из кубов и не одной фразой
		expect(system).toContain("Толпа 42-братух не бывает набором кубов");
		expect(system).toContain(
			"Каждый человек, которого видно в кадре, имеет свой отличающийся проработанный образ со знаками 42-стиля",
		);
		expect(system).toContain(
			"Лучше меньше людей, но у каждого образ прописан глубоко",
		);
		// число человек не задаётся квотой: решает глубина проработки
		expect(system).not.toContain("не меньше пяти человек");
	});

	test("обязательные решения «свита» и «зрелище и свет» несут классику; публика пишется по человеку", () => {
		expect(system).toContain("Среди решений обязательно есть два: «свита»");
		expect(system).toContain("«зрелище и свет»");
		expect(system).toContain("чтобы у классики был реальный шанс выпасть");
		expect(system).toContain(
			"а не один зритель с одним образом и не плотность",
		);
		expect(system).toContain(
			"Публика пишется в промпте отдельным абзацем, в котором у каждого видимого человека своя фраза",
		);
		expect(system).toContain("Одна фраза на всю публику");
		expect(system).toContain("до 950, если в кадре публика");
	});

	test("названное в запросе получает роскошный максимум, а не базовый минимум", () => {
		expect(system).toContain(
			"**Названное в запросе получает роскошный максимум, а не базовый минимум.**",
		);
		expect(system).toContain("свою отдельную творческую задумку");
		expect(system).toContain(
			"предмет, о котором можно ответить только «из чего он собран», не проработан",
		);
		expect(system).toContain("чем короче названо, тем больше придумываешь ты");
		expect(system).toContain(
			"для героя, махины, каждого названного в запросе предмета и существа",
		);
		expect(system).toContain("Крупное не значит базовое");
		expect(system).toContain(
			"а у каждого названного предмета, транспорта или существа свои отдельные вызовы",
		);
	});

	test("входные изображения не пересказываются, недруг крупный, фигуры занимают кадр, зал есть, слова по-русски", () => {
		// костюм с входного изображения не описывается, пишутся только изменения
		expect(system).toContain(
			"ты его не пересказываешь: ни силуэт, ни цвета, ни крылья, ни детали",
		);
		expect(system).toContain("his costume from Image 1 stays as it is; add:");
		expect(system).not.toContain(
			"костюм узнаётся по главным чертам (силуэт, цвета, крылья, знаки)",
		);
		expect(system).toContain(
			"Одежда и вид людей с входных изображений не пересказаны",
		);
		// недруг отделён, но не мелкий
		expect(system).toContain("Другой уровень не значит далеко и мелко");
		expect(system).toContain(
			"окно в дальней башне, балкон и дальний край кадра не годятся",
		);
		// фигуры занимают кадр
		expect(system).toContain(
			"Герои и названные предметы вместе занимают не меньше двух третей кадра",
		);
		expect(system).toContain(
			"приблизь её и увеличь фигуры, а не добавляй мелочи",
		);
		// зал есть, даже если запрос молчит
		expect(system).toContain(
			"он есть в кадре, даже если запрос про публику молчит",
		);
		// придуманные слова на языке запроса
		expect(system).toContain("Придуманные слова пишутся на языке запроса");
		expect(system).toContain("английские фразы в кадре сообщества не нужны");
	});

	test("слова придумывает агент, когда их требует сцена, без текста в запросе", () => {
		expect(system).toContain("Слова в кадре появляются в двух случаях");
		expect(system).toContain(
			"Во втором случае слов в запросе ждать не нужно, придумываешь их ты",
		);
		// пример в инструкции не совпадает с запросом набора проверки: агент копирует свой пример
		expect(system).toContain("Запрос «тётя Валя завидует соседу» значит");
		expect(system).not.toContain("Запрос «Генсуха завидует»");
		expect(system).toContain("Реплика конкретная");
		expect(system).toContain("Общее восклицание («опять он!»");
		expect(system).toContain(
			"если реплику можно поставить в любой другой кадр",
		);
		expect(system).toContain("каждая в голосе того, кто её говорит");
		expect(system).toContain(
			"12. Слова в кадре только когда их написал пользователь или требует сцена",
		);
		// старое правило «только по запросу» заменено
		expect(system).not.toContain("Слова в кадре появляются только по запросу");
	});

	test("малое становится миром, зал группа людей без силуэтов и без сжатия до одного зрителя", () => {
		expect(system).toContain("**Малое становится миром.**");
		expect(system).toContain(
			"«что здесь живёт и что с ней делает кто-то ещё?»",
		);
		expect(system).toContain("вещь несёт вещь, а та ещё одну");
		expect(system).toContain(
			"погон-трассу и самокаты эталона в свой кадр не переноси",
		);
		expect(system).toContain(
			"«малое становится миром»: для героя и каждого главного предмета",
		);
		expect(system).toContain("по одной малой детали героя и главного предмета");
		expect(system).toContain("Зал это группа людей, а не один зритель");
		expect(system).toContain("Тёмные силуэты, поднятые руки без людей");
		expect(system).toContain(
			"the audience is individually dressed people lit by the stage, not silhouettes",
		);
		expect(system).toContain("Решение о публике это тема образа всего зала");
		// лазейка «людей столько, сколько можно описать» позволяла сжать зал до одного зрителя
		expect(system).not.toContain(
			"либо каждый описан отдельно, либо людей в кадре столько, сколько можно описать",
		);
	});

	test("каждая деталь арт-объект, изменения костюма существенные, а не перекраска", () => {
		expect(system).toContain("Каждая деталь арт-объект.");
		expect(system).toContain("Служебных деталей нет");
		expect(system).toContain(
			"Перекраска и «то же самое, но в другом цвете» арт-объектом не считаются",
		);
		expect(system).toContain(
			"Изменения существенные: новые вещи, новая конструкция, мешап",
		);
		expect(system).toContain("Перекраска («чёрное стало серо-бурым»");
		expect(system).toContain(
			"не «оставить как есть» и не перекраска в другой цвет",
		);
		expect(system).toContain(
			"Каждая деталь арт-объект со своей формой, замыслом и знаком 42",
		);
	});

	test("слова в кадре крупные: облачко от шестой части ширины, плакат от трети", () => {
		expect(system).toContain("Слова в кадре крупные");
		expect(system).toContain("не меньше шестой части ширины кадра");
		expect(system).toContain("облачко в один процент кадра шутку не доносит");
		expect(system).toContain(
			"a large speech bubble about a sixth of the frame wide",
		);
		expect(system).toContain(
			"облачко от шестой части ширины кадра, плакат от трети",
		);
	});

	test("пустых мест нет: девять частей кадра заняты крупным, чистый кадр не значит пустой", () => {
		expect(system).toContain("В кадре нет ни одного пустого участка");
		expect(system).toContain("мысленно раздели кадр на девять частей");
		expect(system).toContain(
			"Фон тише героев» значит проще по деталям и приглушённее по цвету, а не пустой",
		);
		expect(system).toContain("чистая не значит пустая");
		expect(system).toContain("пустое место хуже мусора");
		expect(system).toContain(
			"в каждой из девяти частей кадра названо что-то крупное",
		);
		// старая проверка стирала всё вокруг героев и оставляла пустоту
		expect(system).not.toContain(
			"всё, что осталось вокруг и ничего не значит, вычеркни",
		);
	});

	test("недруги 42 злые, без знаков 42, на другом уровне кадра, богатство карикатурой", () => {
		expect(system).toContain("Недруги 42.");
		expect(system).toContain(
			"злой, угрюмый, брезгливый или перекошенный от обиды",
		);
		expect(system).toContain("а не поёт, не ведёт и не празднует");
		expect(system).toContain("Он на другом уровне кадра, чем сторона 42");
		expect(system).toContain("Знаков 42 на нём нет");
		expect(system).toContain("он зажрался и дуреет от собственного добра");
		expect(system).toContain("крупность не равенство");
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
			indexIn(system, "# Словарь 42"),
			indexIn(system, "# Как придумывать кадр"),
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
			indexIn(system, "# Примеры"),
			indexIn(system, "# Самопроверка"),
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
			indexIn(system, "# Примеры"),
			indexIn(system, "# Самопроверка"),
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
			indexIn(system, "# Критерии готового кадра"),
			indexIn(system, "# Рабочий цикл"),
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
			indexIn(system, "**Образ собран до мелочей.**"),
			indexIn(system, "**Уличный тест.**"),
		);
		expect(sheet).toContain("Плохо:");
		expect(sheet).toContain("Хорошо:");
		expect(sheet).not.toMatch(/\b(cat|tabby|fisherman|tram)\b/i);
	});

	test("безумие собирается наращиванием, а не набором", () => {
		const section = system.slice(
			indexIn(system, "# Как собирается безумие"),
			indexIn(system, "# Критерии готового кадра"),
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
			indexIn(system, "## Пример 6."),
			indexIn(system, "## Прогон A."),
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
			indexIn(system, "## Ничего по умолчанию"),
			indexIn(system, "## Несочетаемость"),
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
			indexIn(system, "# Примеры"),
			indexIn(system, "# Самопроверка"),
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
