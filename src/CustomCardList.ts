import { ColorBalancedSlot } from "./BoosterFactory.js";
import { CardID, Card, SlotedCardPool, UniqueCard, CardPool } from "./CardTypes.js";
import { getCard } from "./Cards.js";
import { pickCard, pickPrintRun } from "./cardUtils.js";
import { MessageError } from "./Message.js";
import { isEmpty, random, weightedRandomIdx, shuffleArray } from "./utils.js";

export type SlotName = string;
export type SheetName = string;
export type LayoutName = string;

export type Sheet =
	| { collation?: Exclude<CollationType, "printRun">; cards: Record<CardID, number> }
	| { collation: "printRun"; printRun: CardID[]; groupSize: number };

export type Slot = {
	name: string;
	count: number;
	foil: boolean;
	sheets: { name: SheetName; weight: number }[];
};

export type PackLayout = {
	weight: number;
	slots: Slot[];
};

export type CCLSettings = {
	name?: string;
	cardBack?: string;
	cardTitleHeightFactor?: number;
	showSlots?: boolean;
	boosterSettings?: { picks: number[]; burns: number[] }[];
	predeterminedLayouts?: { name: LayoutName; weight: number }[][];
	layoutWithReplacement?: boolean;
	duplicateProtection?: boolean;
	// Default values for session settings when using this list. Can still be overridden by the user.
	boostersPerPlayer?: number;
	withReplacement?: boolean;
	colorBalance?: boolean;
};

export type CollationType = "random" | "printRun";

export type CustomCardList = {
	name?: string;
	sheets: Record<SheetName, Sheet>;
	layouts: Record<LayoutName, PackLayout> | false;
	customCards: Record<CardID, Card> | null;
	settings?: CCLSettings;
};

export function generateCustomGetCardFunction(customCardList: CustomCardList): (cid: CardID) => Card {
	if (!customCardList?.customCards) return getCard;
	return (cid: CardID) => {
		return customCardList.customCards && cid in customCardList.customCards
			? customCardList.customCards[cid]
			: getCard(cid);
	};
}

export function generateBoosterFromCustomCardList(
	customCardList: CustomCardList,
	boosterQuantity: number,
	options: {
		colorBalance?: boolean;
		cardsPerBooster?: number;
		withReplacement?: boolean;
		duplicateProtection?: boolean;
		playerCount?: number; // Allow correct ordering of boosters when using predetermined layouts
		removeFromCardPool?: CardID[]; // Used by LoreSeeker draft effect
	} = {}
): MessageError | Array<UniqueCard>[] {
	if (
		!customCardList.sheets ||
		Object.keys(customCardList.sheets).length === 0 ||
		Object.values(customCardList.sheets).every(
			(slot) =>
				(slot.collation === "printRun" && slot.printRun.length === 0) ||
				(slot.collation !== "printRun" && Object.keys(slot.cards).length === 0)
		)
	) {
		return new MessageError("Error generating boosters", "No custom card list provided.");
	}

	if (options.colorBalance === undefined) options.colorBalance = false;
	if (options.duplicateProtection === undefined) options.duplicateProtection = true;
	if (options.withReplacement === undefined) options.withReplacement = false;
	const pickOptions = {
		uniformAll: true,
		withReplacement: options.withReplacement,
		duplicateProtection: options.duplicateProtection,
		getCard: generateCustomGetCardFunction(customCardList),
	};

	// List is using custom layouts
	if (customCardList.layouts && !isEmpty(customCardList.layouts)) {
		const layouts = customCardList.layouts;
		const layoutsTotalWeights = Object.keys(layouts).reduce((acc, key) => acc + layouts[key].weight, 0);

		const cardsBySheet: SlotedCardPool = {};
		for (const [sheetName, sheet] of Object.entries(customCardList.sheets)) {
			if (sheet.collation !== "printRun") {
				cardsBySheet[sheetName] = new CardPool();
				for (const [cardID, count] of Object.entries(sheet.cards)) cardsBySheet[sheetName].set(cardID, count);
			}
		}

		// Workaround to handle the LoreSeeker draft effect with a limited number of cards
		if (!options.withReplacement && options.removeFromCardPool) {
			// We don't know from which slot the cards were picked, so we might remove them multiple times if they're shared between multiple slots,
			// however I don't have a better solution for now.
			for (const sheetName in cardsBySheet)
				for (const cardId of options.removeFromCardPool)
					if (cardsBySheet[sheetName].has(cardId)) cardsBySheet[sheetName].removeCard(cardId);
		}

		// Color balance the largest slot of each layout
		const colorBalancedSlots: { [layoutName: string]: number } = {};
		const colorBalancedGenerators: { [slotName: string]: ColorBalancedSlot } = {};
		if (options.colorBalance) {
			for (const layoutName in layouts) {
				colorBalancedSlots[layoutName] = 0;
				for (let i = 1; i < layouts[layoutName].slots.length; ++i) {
					if (layouts[layoutName].slots[i].count > colorBalancedSlots[layoutName]) {
						colorBalancedSlots[layoutName] = i;
					}
				}
			}
			for (const sheetName in customCardList.sheets) {
				if (customCardList.sheets[sheetName].collation !== "printRun") {
					colorBalancedGenerators[sheetName] = new ColorBalancedSlot(cardsBySheet[sheetName], pickOptions);
				}
			}
		}

		const predeterminedLayouts = customCardList.settings?.predeterminedLayouts;

		const nextLayout = predeterminedLayouts
			? customCardList.settings?.layoutWithReplacement === false
				? // Predetermined layouts, without replacement
					(() => {
						const bags: string[][] = predeterminedLayouts.map(() => []);
						const refill = (index: number) => {
							const bag = [];
							for (const layout of predeterminedLayouts[index])
								for (let i = 0; i < layout.weight; ++i) bag.push(layout.name);
							shuffleArray(bag);
							bags[index] = bag;
						};
						return (index: number): string => {
							if (bags[index % bags.length].length === 0) refill(index % bags.length);
							return bags[index % bags.length].pop()!;
						};
					})()
				: // Predetermined layouts, with replacement
					(index: number): string => {
						const choices = predeterminedLayouts[index % predeterminedLayouts.length]!;
						if (choices.length === 1) return choices[0].name;
						return choices[
							weightedRandomIdx(
								choices,
								choices.reduce((acc, curr) => acc + curr.weight, 0)
							)
						].name;
					}
			: customCardList.settings?.layoutWithReplacement === false
				? // Random layouts without replacement (until we have no other choice)
					(() => {
						let bag: string[] = [];
						const refill = () => {
							bag = [];
							for (const layoutName in layouts)
								for (let i = 0; i < layouts[layoutName].weight; ++i) bag.push(layoutName);
							shuffleArray(bag);
						};
						return (/*index: number*/): string => {
							if (bag.length === 0) refill();
							return bag.pop()!;
						};
					})()
				: // Random layouts
					(/*index: number*/): string => {
						let randomLayout = random.real(0, layoutsTotalWeights);
						for (const layoutName in layouts) {
							randomLayout -= layouts[layoutName].weight;
							if (randomLayout <= 0) return layoutName;
						}
						return Object.keys(layouts)[0]!;
					};

		// Generate Boosters
		const boosters: Array<UniqueCard>[] = [];
		for (let i = 0; i < boosterQuantity; ++i) {
			const booster: Array<UniqueCard> = [];

			// Pick a layout
			const pickedLayoutName = nextLayout(options.playerCount ? Math.floor(i / options.playerCount) : i);
			// Should be caught earlier, but just in case, check again.
			if (!(pickedLayoutName in layouts))
				return new MessageError("Error generating boosters", `Invalid layout '${pickedLayoutName}'.`);
			const pickedLayout = layouts[pickedLayoutName];

			for (const [index, slot] of pickedLayout.slots.entries()) {
				const sheetName =
					slot.sheets[
						weightedRandomIdx(
							slot.sheets,
							slot.sheets.reduce((acc, curr) => acc + curr.weight, 0)
						)
					].name;
				const useColorBalance =
					options.colorBalance &&
					index === colorBalancedSlots[pickedLayoutName] &&
					slot.count > ColorBalancedSlot.CardCountThreshold &&
					colorBalancedGenerators[sheetName];
				// Checking the card count beforehand is tricky, we'll rely on pickCard throwing an exception if we run out of cards to pick.
				try {
					let pickedCards: UniqueCard[] = [];

					if (customCardList.sheets[sheetName].collation === "printRun") {
						pickedCards = pickPrintRun(
							slot.count,
							customCardList.sheets[sheetName].printRun,
							customCardList.sheets[sheetName].groupSize,
							pickOptions
						);
					} else if (useColorBalance) {
						pickedCards = colorBalancedGenerators[sheetName].generate(slot.count, booster, pickOptions);
					} else {
						for (let i = 0; i < slot.count; ++i) {
							const pickedCard = pickCard(
								cardsBySheet[sheetName],
								booster.concat(pickedCards),
								pickOptions
							);
							pickedCards.push(pickedCard);
							if (colorBalancedGenerators[sheetName] && !pickOptions.withReplacement)
								colorBalancedGenerators[sheetName].cache.removeCard(pickedCard);
						}
					}

					if (customCardList.settings?.showSlots) {
						const displaySlotName = slot.name.split("##")[0]; // Remove potential 'hidden id' after '##' delimiter.
						for (const card of pickedCards) card.slot = displaySlotName;
					}
					if (slot.foil) pickedCards.forEach((card) => (card.foil = true));

					booster.push(...pickedCards);
				} catch (e) {
					console.error("generateBoosterFromCustomCardList error: ", e);
					return new MessageError(
						"Error generating boosters",
						"An error occured while generating boosters. Make sure there are enough cards in the list."
					);
				}
			}

			boosters.push(booster);
		}
		return boosters;
	} else {
		// In the absence of layouts, we expect the presence of a single slot.
		// Number of cards in pack is determined by the session settings.

		// These errors should have been caught during list parsing, double checking just in case.
		const slotsCount = Object.keys(customCardList.sheets).length;
		if (slotsCount === 0) {
			return new MessageError("Error generating boosters", `No slot defined.`);
		} else if (slotsCount !== 1) {
			return new MessageError(
				"Error generating boosters",
				`Multiple 'default' slots defined. Merge them into a single one, or use layouts (you can define a default layout by explicitly setting slot sizes).`
			);
		}

		const defaultSlot = Object.values(customCardList.sheets)[0];

		if (defaultSlot.collation === "printRun")
			return new MessageError(
				"Error generating boosters",
				`Print run collation is not supported when a single slot is defined.`
			);

		// Generate fully random 15-cards booster for cube (not considering rarity)
		// Getting custom card list
		const localCollection: CardPool = new CardPool();

		let cardCount = 0;
		for (const [cardID, count] of Object.entries(defaultSlot.cards)) {
			localCollection.set(cardID, count);
			cardCount += count;
		}
		const cardsPerBooster = options.cardsPerBooster ?? 15;

		const cardTarget = cardsPerBooster * boosterQuantity;
		if (!options.withReplacement && cardCount < cardTarget) {
			return new MessageError(
				"Error generating boosters",
				`Not enough cards (${cardCount}/${cardTarget}) in custom list.`
			);
		}
		// Workaround to handle the LoreSeeker draft effect with a limited number of cards
		if (!options.withReplacement && options.removeFromCardPool) {
			for (const cardId of options.removeFromCardPool)
				if (localCollection.has(cardId)) localCollection.removeCard(cardId);
		}

		const boosters = [];

		if (options.colorBalance && cardsPerBooster >= 5) {
			const colorBalancedSlotGenerator = new ColorBalancedSlot(localCollection, pickOptions);
			for (let i = 0; i < boosterQuantity; ++i)
				boosters.push(colorBalancedSlotGenerator.generate(cardsPerBooster, [], pickOptions));
		} else {
			for (let i = 0; i < boosterQuantity; ++i) {
				const booster: Array<UniqueCard> = [];
				for (let j = 0; j < cardsPerBooster; ++j) booster.push(pickCard(localCollection, booster, pickOptions));
				boosters.push(booster);
			}
		}
		return boosters;
	}
}
