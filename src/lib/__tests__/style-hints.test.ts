import { describe, expect, test } from "bun:test";
import {
	detectUserMedium,
	detectUserPalette,
	detectUserSetting,
	ensureClosingFormula,
	extractCapsPhrases,
	extractNamedTexts,
	extractQuotedTexts,
	hasMediumPhrase,
	hijackedOpening,
	maskUnrequestedTexts,
	missingDetails,
	openingSpan,
	quoteUserCyrillic,
	requestsText,
	toGeneratorQuotes,
} from "../prompts/style-hints";

describe("requestsText", () => {
	test("текстовые запросы распознаются", () => {
		expect(requestsText("плакат с надписью «СЛАВА 42»")).toBe(true);
		expect(requestsText("напиши на баннере СЛАВА БОССУ")).toBe(true);
		expect(requestsText("poster with the text HELLO")).toBe(true);
		expect(requestsText("неоновая вывеска с лозунгом")).toBe(true);
	});

	test("обычные запросы текста не требуют", () => {
		expect(requestsText("кот")).toBe(false);
		expect(requestsText("человек стреляет лазерами из глаз")).toBe(false);
		expect(requestsText("свадьба в средневековом замке")).toBe(false);
	});
});

describe("missingDetails", () => {
	test("находит потерянные экшен-детали", () => {
		const user = "человек с крыльями стреляет лазерами из глаз";
		const output =
			"A winged figure stands proudly on a rooftop while pugs cheer around.";
		const missing = missingDetails(user, output);
		expect(missing).toEqual(expect.arrayContaining(["laser", "shoot", "eye"]));
		expect(missing).not.toContain("wing");
	});

	test("ничего не теряется, когда детали на месте", () => {
		const user = "человек с крыльями стреляет лазерами из глаз";
		const output =
			"A winged humanoid figure fires bright laser beams from both eyes, the beams cutting the air while feather wings spread wide.";
		expect(missingDetails(user, output)).toEqual([]);
	});

	test("без экшен-слов в запросе проверять нечего", () => {
		expect(missingDetails("кот", "A cat sleeps on a diamond throne.")).toEqual(
			[],
		);
	});
});

describe("detectUserMedium", () => {
	test("распознаёт явные стили пользователя", () => {
		expect(detectUserMedium("тигр в джунглях, фотореализм")).toContain(
			"photograph",
		);
		expect(detectUserMedium("аниме-девочка с катаной")).toContain("anime");
		expect(detectUserMedium("детский рисунок домика")).toContain("crayon");
		expect(detectUserMedium("портрет в стиле ренессанс")).toContain(
			"Renaissance",
		);
		expect(detectUserMedium("pixel art of a cat")).toContain("pixel-art");
	});

	test("обычные запросы не дают подсказки", () => {
		expect(detectUserMedium("кот")).toBeNull();
		expect(detectUserMedium("свадьба в замке")).toBeNull();
		expect(detectUserMedium("42 бегемота играют в шахматы")).toBeNull();
		expect(detectUserMedium("шашлык на мангале")).toBeNull();
	});
});

describe("ensureClosingFormula", () => {
	test("добавляет формулу, если медиума нет", () => {
		const text =
			"A colossal pug rides a neon scooter through a cyberpunk city while pugs cheer.";
		const withFormula = ensureClosingFormula(
			text,
			"hyper-detailed cinematic photograph",
		);
		expect(withFormula).toContain("hyper-detailed cinematic photograph");
		expect(withFormula).toContain("no watermarks, no signature");
		expect(withFormula.startsWith(text)).toBe(true);
	});

	test("не дублирует формулу, если медиум уже назван", () => {
		const text =
			"A colossal pug rides a neon scooter. Thick oil painting with canvas texture, wide-angle poster composition.";
		expect(
			ensureClosingFormula(text, "hyper-detailed cinematic photograph"),
		).toBe(text);
		expect(hasMediumPhrase(text)).toBe(true);
	});

	test("узнаёт перефразированный медиум по маркеру", () => {
		const text =
			"A majestic Bengal tiger prowling through a jungle. Hyper-detailed wildlife photograph, telephoto composition, shallow depth of field.";
		expect(hasMediumPhrase(text)).toBe(true);
		expect(
			ensureClosingFormula(text, "thick oil painting with canvas texture"),
		).toBe(text);
	});

	test("не дописывает формулу, если есть no watermarks", () => {
		const text =
			"A neon city with 42 fireworks, absurd triumphant kitsch, no watermarks, no signature.";
		expect(ensureClosingFormula(text, "anime poster with speed lines")).toBe(
			text,
		);
	});
});

describe("extractQuotedTexts и maskUnrequestedTexts", () => {
	test("извлекает точный текст из кавычек", () => {
		expect(extractQuotedTexts("плакат с надписью «СЛАВА 42»")).toEqual([
			"СЛАВА 42",
		]);
		expect(extractQuotedTexts('poster with the text "HELLO WORLD"')).toEqual([
			"HELLO WORLD",
		]);
		expect(extractQuotedTexts("кот")).toEqual([]);
	});

	test("маскирует незапрошенный текст числом 42", () => {
		const text =
			"Anime girl on a roof. A billboard reads «42 — ПРАВИЛЬНЫЙ ВЫБОР» above.";
		expect(maskUnrequestedTexts(text)).toBe(
			"Anime girl on a roof. A billboard reads 42 above.",
		);
	});
});

describe("ложные срабатывания (регрессия ревью)", () => {
	test("апострофы и «текстура» не включают текстовый режим", () => {
		expect(requestsText("a wolf's howl at the moon")).toBe(false);
		expect(requestsText("фотореализм, текстура кожи")).toBe(false);
		expect(requestsText("подписчик рассылки")).toBe(false);
		expect(requestsText("90's style")).toBe(false);
	});

	test("курчавые кавычки распознаются", () => {
		expect(extractQuotedTexts("плакат “ЖИВИ ГРОМКО”")).toEqual(["ЖИВИ ГРОМКО"]);
		expect(requestsText("постер “СЛАВА 42”")).toBe(true);
	});

	test("крылья гардятся, а не проходят по инерции", () => {
		expect(missingDetails("человек с крыльями", "A humanoid figure.")).toEqual([
			"wing",
		]);
		expect(
			missingDetails("человек с крыльями", "A winged humanoid hovers."),
		).toEqual([]);
	});

	test("посторонние слова не дают ложных потерь", () => {
		expect(missingDetails("нарисуй пейзаж", "A drawing of a hill.")).toEqual(
			[],
		);
		expect(
			missingDetails("человек со щитом", "A heroic screenshot of a fighter."),
		).toEqual([]);
	});

	test("маска чистит синтаксис и не оставляет висящих знаков", () => {
		const dirty =
			"A sign reading «ХАЙП» ! and a banner “42 — ПРАВИЛЬНЫЙ ВЫБОР”.";
		const clean = maskUnrequestedTexts(dirty);
		expect(clean).not.toContain("«");
		expect(clean).not.toContain("“");
		expect(clean).not.toContain(" !");
		expect(clean).not.toContain("  ");
	});
});

describe("границы русских стемов (регрессия ревью)", () => {
	test("огнетушитель и ударник не считаются огнём и ударом", () => {
		expect(missingDetails("огнетушитель", "A red tank.")).toEqual([]);
		expect(missingDetails("ударник оркестра", "A drummer on stage.")).toEqual(
			[],
		);
	});

	test("огонь и удар в обычных формах ловятся", () => {
		expect(missingDetails("человек в огне", "A calm portrait.")).toEqual([
			"flame",
		]);
		expect(missingDetails("герой наносит удар", "A calm portrait.")).toEqual([
			"impact",
		]);
	});

	test("покрыло/накрыл не считаются крыльями", () => {
		expect(missingDetails("одеяло покрыло диван", "A cozy room.")).toEqual([]);
		expect(missingDetails("человек с крыльями", "A calm portrait.")).toEqual([
			"wing",
		]);
	});
});

describe("текст из запросов сообщества", () => {
	test("агитация и лозунг капсом — текстовый запрос", () => {
		expect(
			requestsText("Покажи как бы выглядела агитация с таким содержанием"),
		).toBe(true);
		expect(requestsText("СЛАВА 1 ВЗВОДУ 1 РОТЫ 🙏🔥")).toBe(true);
		expect(requestsText("здание под названием SLAY")).toBe(true);
	});

	test("одиночные слова капсом лозунгом не считаются", () => {
		expect(extractCapsPhrases("байкеры слушают VPN и MAGNUM")).toEqual([]);
		expect(requestsText("байкеры слушают VPN")).toBe(false);
	});

	test("лозунг капсом извлекается целиком, с числами", () => {
		expect(
			extractCapsPhrases(
				"агитация где СЛАВА 1 ВЗВОДУ 1 РОТЫ 1 БАТАЛЬОНА 42 ПРОПАГАНДЫ 🙏🔥",
			),
		).toEqual(["СЛАВА 1 ВЗВОДУ 1 РОТЫ 1 БАТАЛЬОНА 42 ПРОПАГАНДЫ"]);
		expect(extractCapsPhrases("Пятёрку в SLAY KING 2026! 🏆")).toEqual([
			"SLAY KING 2026",
		]);
	});

	test("название после «под названием» — до первого обычного слова", () => {
		expect(
			extractNamedTexts(
				"42 братухи нападают на здание под названием SLAY темные цвета",
			),
		).toEqual(["SLAY"]);
		expect(extractNamedTexts("кафе с названием Золотой Мопс, ночь")).toEqual([
			"Золотой Мопс",
		]);
		expect(extractNamedTexts("кот на диване")).toEqual([]);
	});
});

describe("место и палитра запроса", () => {
	test("место из запроса распознаётся", () => {
		expect(detectUserSetting("джакузи в клубе с пачками денег")).toBe(true);
		expect(detectUserSetting("опоссум-шериф, дикий запад")).toBe(true);
		expect(detectUserSetting("кот")).toBe(false);
		expect(detectUserSetting("всё горит, война")).toBe(false);
	});

	test("цвета и настроение из запроса распознаются", () => {
		expect(
			detectUserPalette("темные цвета песок желтые оттенки все горит"),
		).toBe(true);
		expect(detectUserPalette("кот")).toBe(false);
	});
});

describe("свита не открывает промпт", () => {
	test("подлежащее первого предложения — до предлога", () => {
		expect(
			openingSpan("A colossal cat on a diamond throne, pugs around."),
		).toBe("A colossal cat");
	});

	test("свита из канона вместо героя ловится", () => {
		expect(
			hijackedOpening(
				"42 братухи нападают на здание",
				"A colossal army of golden-armored rhinos in suits storms the building.",
			),
		).toEqual(["rhinoceros"]);
		expect(
			hijackedOpening(
				"агитация СЛАВА 1 ВЗВОДУ",
				"A battle-scarred armored turtle tank rumbles onto the stage.",
			),
		).toEqual(["turtle", "tank"]);
	});

	test("герой пользователя и декор после предлога не считаются подменой", () => {
		expect(
			hijackedOpening("кот", "A colossal cat on a diamond throne with pugs."),
		).toEqual([]);
		expect(
			hijackedOpening("мопс в короне", "A pug in a crown on a golden throne."),
		).toEqual([]);
		expect(
			hijackedOpening(
				"человек, правая половина белая, а левая черная",
				"A lion-hearted winged figure splits in two.",
			),
		).toEqual([]);
	});
});

describe("кириллица из запроса", () => {
	test("названия из запроса берутся в кавычки, остальное не трогается", () => {
		expect(
			quoteUserCyrillic(
				"boars blast ГОРОДСКИЕ and ТУСА МЕДУЗА under «OPUS всем нашим», Привет",
				"из саббуферов играет MAGNUM, ГОРОДСКИЕ, ТУСА МЕДУЗА",
			),
		).toBe(
			"boars blast «ГОРОДСКИЕ» and «ТУСА МЕДУЗА» under «OPUS всем нашим», Привет",
		);
	});
});

describe("слушают", () => {
	test("потеря прослушивания ловится", () => {
		expect(
			missingDetails("Все слушают альбом", "A golden 42 jumps over a wall."),
		).toEqual(["listen"]);
		expect(
			missingDetails(
				"Все слушают альбом",
				"A crowd in glowing headphones listens to giant speakers.",
			),
		).toEqual([]);
	});
});

describe("названный герой не подменяется", () => {
	test("мопс не становится корги, президент — не пропадает", () => {
		expect(missingDetails("мопс", "A regal corgi on a stage.")).toEqual([
			"pug",
		]);
		expect(
			missingDetails(
				"президент верхом на медведе",
				"A golden bear on an elephant.",
			),
		).toEqual(["boss"]);
		expect(
			missingDetails(
				"президент верхом на медведе",
				"The Boss in a crown rides a bear.",
			),
		).toEqual([]);
	});

	test("«который», «защищён» и опечатки не считаются котом и щенком", () => {
		expect(
			missingDetails("человек, у котоьрого плащ, который защищен", "A man."),
		).toEqual([]);
		expect(missingDetails("кошка на диване", "A cat on a sofa.")).toEqual([]);
		expect(missingDetails("неоновый кот-программист", "A dog.")).toEqual([
			"cat",
		]);
	});
});

describe("имя из запроса без текстового запроса", () => {
	test("транслитерируется, а не маскируется в 42", () => {
		const quoted = quoteUserCyrillic(
			"A regal cat named Барсик naps on a throne.",
			"кот барсик спит на диване",
			false,
		);
		expect(quoted).toBe("A regal cat named Barsik naps on a throne.");
		expect(maskUnrequestedTexts(quoted)).toContain("Barsik");
	});
});

describe("кавычки для генератора", () => {
	test("типографские кавычки тоже становятся прямыми", () => {
		expect(toGeneratorQuotes("a banner “СЛАВА 42” here")).toBe(
			'a banner "СЛАВА 42" here',
		);
	});

	test("ёлочки становятся прямыми кавычками", () => {
		expect(toGeneratorQuotes("a neon sign «SLAY» and «УЖЕ ВЫШЕЛ»")).toBe(
			'a neon sign "SLAY" and "УЖЕ ВЫШЕЛ"',
		);
	});
});

describe("альбомы и треки", () => {
	test("название альбома — точный текст, даже с опечаткой и дефисом", () => {
		expect(
			extractNamedTexts("42 братухи на самокатах слушают альбоом Magnum"),
		).toEqual(["Magnum"]);
		expect(extractNamedTexts("Все слушают альбом 5opka - Magnum")).toEqual([
			"5opka - Magnum",
		]);
		expect(extractNamedTexts("слушают новый альбом")).toEqual([]);
	});

	test("колонок без наушников мало для «слушают»", () => {
		expect(
			missingDetails("Все слушают альбом", "A crowd near giant speakers."),
		).toEqual(["listen"]);
	});
});

describe("герой-животное в первом предложении", () => {
	test("мопсы из свиты в конце не заменяют героя", () => {
		expect(
			missingDetails(
				"мопс на самокате",
				"A fluffy dog rides a scooter. Pugs in fur coats dance around.",
			),
		).toEqual(["pug"]);
		expect(
			missingDetails(
				"мопс на самокате",
				"A pug in a rainbow coat rides a scooter.",
			),
		).toEqual([]);
	});
});

describe("ест", () => {
	test("потеря еды ловится, «есть» в смысле «имеется» — нет", () => {
		expect(
			missingDetails("свинья ест попкорн", "A pig holds gold bars."),
		).toEqual(["eat"]);
		expect(
			missingDetails("свинья ест попкорн", "A pig eats popcorn from a bucket."),
		).toEqual([]);
		expect(missingDetails("у кота есть корона", "A cat in a crown.")).toEqual(
			[],
		);
	});
});

describe("пейзаж без выдуманного героя", () => {
	test("фигура в начале пейзажа ловится, в запросе про людей — нет", () => {
		expect(
			hijackedOpening(
				"закат",
				"A colossal figure in a leopard coat stands at sunset.",
			),
		).toEqual(["invented figure"]);
		expect(
			hijackedOpening(
				"Человек в костюме с крыльями",
				"A winged humanoid figure splits down the middle.",
			),
		).toEqual([]);
		expect(
			hijackedOpening("дождь", "A torrential downpour drenches the plaza."),
		).toEqual([]);
	});
});
