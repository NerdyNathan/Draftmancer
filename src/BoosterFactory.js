"use strict";

import { Cards, getUnique } from "./Cards.js";
import { isEmpty, shuffleArray, randomInt } from "./utils.js";
import { removeCardFromDict, pickCard, countCards } from "./cardUtils.js";
import constants from "../client/src/data/constants.json";

// Generates booster for regular MtG Sets

const mythicRate = 1.0 / 8.0;
const foilRate = 15.0 / 63.0;
// 1/16 chances of a foil basic land added to the common slot. Mythic to common
const foilRarityRates = {
	mythic: 1.0 / 128,
	rare: 1.0 / 128 + 7.0 / 128,
	uncommon: 1.0 / 16 + 3.0 / 16,
	common: 1.0,
};

/*
 Provides color balancing for the supplied cardPool
*/
export function ColorBalancedSlot(_cardPool) {
	this.cardPool = _cardPool;
	this.cache = { byColor: {} };
	for (let cid in this.cardPool) {
		if (!(Cards[cid].colors in this.cache.byColor)) this.cache.byColor[Cards[cid].colors] = {};
		this.cache.byColor[Cards[cid].colors][cid] = this.cardPool[cid];
	}
	this.cache.monocolored = Object.keys(this.cache.byColor)
		.filter(k => k.length === 1)
		.map(k => this.cache.byColor[k])
		.reduce((acc, val) => Object.assign(acc, val), {});
	this.cache.monocoloredCount = countCards(this.cache.monocolored);
	this.cache.others = Object.keys(this.cache.byColor)
		.filter(k => k.length !== 1)
		.map(k => this.cache.byColor[k])
		.reduce((acc, val) => Object.assign(acc, val), {});
	this.cache.othersCount = countCards(this.cache.others);

	this.syncCache = function(pickedCard) {
		removeCardFromDict(pickedCard.id, this.cache.byColor[pickedCard.colors]);
		if (pickedCard.colors.length === 1) {
			removeCardFromDict(pickedCard.id, this.cache.monocolored);
			--this.cache.monocoloredCount;
		} else {
			removeCardFromDict(pickedCard.id, this.cache.others);
			--this.cache.othersCount;
		}
	};

	// Returns cardCount color balanced cards picked from cardPool.
	// pickedCards can contain pre-selected cards for this slot.
	this.generate = function(cardCount, pickedCards = []) {
		for (let c of "WUBRG") {
			if (this.cache.byColor[c] && !isEmpty(this.cache.byColor[c])) {
				let pickedCard = pickCard(this.cache.byColor[c], pickedCards);
				removeCardFromDict(pickedCard.id, this.cardPool);
				if (pickedCard.colors.length === 1) {
					removeCardFromDict(pickedCard.id, this.cache.monocolored);
					--this.cache.monocoloredCount;
				} else {
					removeCardFromDict(pickedCard.id, this.cache.others);
					--this.cache.othersCount;
				}
				pickedCards.push(pickedCard);
			}
		}
		// a is the number of non-monocolor commons (often artifacts)
		// c is the number of monocolored commons including the ones seeded already
		// s is the number of commons seeded by color balancing
		// r is the remaining commons to pick
		// We want to maintain normal expected number of monocolored cards from not color balanciing:
		// (r+s) * c / (c+a)
		// We have s already and will take the remaining r with p(monocolored) = x
		// s + r * x = (r+s) * c / (c + a)
		// x = (cr - as) / (r * (c + a))
		// If cr < as, x = 0 is the best we can do.
		// If c or a are small, we need to ignore x and use remaning cards. Negative x acts like 0.
		const seededMonocolors = pickedCards.length; // s
		const c = this.cache.monocoloredCount + seededMonocolors;
		const a = this.cache.othersCount;
		let remainingCards = cardCount - seededMonocolors; // r
		const x = (c * remainingCards - a * seededMonocolors) / (remainingCards * (c + a));
		for (let i = pickedCards.length; i < cardCount; ++i) {
			const type = (Math.random() < x && this.cache.monocoloredCount !== 0) || this.cache.othersCount === 0;
			let pickedCard = pickCard(type ? this.cache.monocolored : this.cache.others, pickedCards);
			if (type) --this.cache.monocoloredCount;
			else --this.cache.othersCount;
			pickedCards.push(pickedCard);
			removeCardFromDict(pickedCard.id, this.cardPool);
			removeCardFromDict(pickedCard.id, this.cache.byColor[pickedCard.colors]);
		}
		// Shuffle to avoid obvious signals to other players
		shuffleArray(pickedCards);
		return pickedCards;
	};
}

export function BoosterFactory(cardPool, landSlot, options) {
	this.cardPool = cardPool;
	this.landSlot = landSlot;
	if (this.landSlot && this.landSlot.setup) this.landSlot.setup(this.cardPool["common"]);
	this.options = options;
	if (this.options.colorBalance) this.colorBalancedSlot = new ColorBalancedSlot(this.cardPool["common"]);

	this.onError = function(...args) {
		if (this.options.onError) this.options.onError(...args);
	};

	/* Returns a standard draft booster
	 *   targets: Card count for each slot (e.g. {common:10, uncommon:3, rare:1})
	 */
	this.generateBooster = function(targets) {
		let booster = [];

		let addedFoils = 0;
		if (this.options.foil && Math.random() <= foilRate) {
			const rarityCheck = Math.random();
			for (let r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && !isEmpty(this.cardPool[r])) {
					let pickedCard = pickCard(this.cardPool[r]);
					// Synchronize color balancing dictionary
					if (this.options.colorBalance && pickedCard.rarity == "common")
						this.colorBalancedSlot.syncCache(pickedCard);
					pickedCard.foil = true;
					booster.push(pickedCard);
					addedFoils += 1;
					break;
				}
		}

		for (let i = 0; i < targets["rare"]; ++i) {
			// 1 Rare/Mythic
			if (isEmpty(this.cardPool["mythic"]) && isEmpty(this.cardPool["rare"])) {
				const msg = `Not enough rare or mythic cards in collection.`;
				this.onError("Error generating boosters", msg);
				console.error(msg);
				return false;
			} else if (isEmpty(this.cardPool["mythic"])) {
				booster.push(pickCard(this.cardPool["rare"]));
			} else if (this.options.mythicPromotion && isEmpty(this.cardPool["rare"])) {
				booster.push(pickCard(this.cardPool["mythic"]));
			} else {
				if (this.options.mythicPromotion && Math.random() <= mythicRate)
					booster.push(pickCard(this.cardPool["mythic"]));
				else booster.push(pickCard(this.cardPool["rare"]));
			}
		}

		for (let i = 0; i < targets["uncommon"]; ++i) booster.push(pickCard(this.cardPool["uncommon"], booster));

		// Color balance the booster by adding one common of each color if possible
		let pickedCommons = [];
		if (this.options.colorBalance && targets["common"] - addedFoils >= 5) {
			pickedCommons = this.colorBalancedSlot.generate(targets["common"] - addedFoils);
		} else {
			for (let i = pickedCommons.length; i < targets["common"] - addedFoils; ++i) {
				let pickedCard = pickCard(this.cardPool["common"], pickedCommons);
				pickedCommons.push(pickedCard);
			}
		}
		booster = booster.concat(pickedCommons);

		if (this.landSlot) booster.push(this.landSlot.pick());

		// Last resort safety check
		if (booster.some(v => typeof v === "undefined" || v === null)) {
			const msg = `Unspecified error.`;
			this.onError("Error generating boosters", msg);
			console.error(msg, booster);
			return false;
		}

		return booster;
	};
}

function filterCardPool(cardPool, predicate) {
	const specialCards = {};
	const filteredCardPool = {};
	for (let slot in cardPool) {
		specialCards[slot] = {};
		filteredCardPool[slot] = {};
		for (let cid in cardPool[slot]) {
			if (predicate(cid)) specialCards[slot][cid] = cardPool[slot][cid];
			else filteredCardPool[slot][cid] = cardPool[slot][cid];
		}
	}
	return [specialCards, filteredCardPool];
}

function rollSpecialCardRarity(cardCounts, targets, options) {
	let pickedRarity = "uncommon";
	if (
		cardCounts["uncommon"] === 0 ||
		(cardCounts["rare"] + cardCounts["mythic"] > 0 &&
			Math.random() < targets.rare / (targets.rare + targets.uncommon))
	) {
		if (
			cardCounts["rare"] === 0 ||
			(cardCounts["mythic"] > 0 && options.mythicPromotion && Math.random() <= mythicRate)
		)
			pickedRarity = "mythic";
		else pickedRarity = "rare";
	}
	return pickedRarity;
}

function countBySlot(cardPool) {
	const counts = {};
	for (let slot in cardPool) counts[slot] = Object.values(cardPool[slot]).reduce((acc, c) => acc + c, 0);
	return counts;
}

// Set specific rules.
// Neither DOM, WAR or ZNR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
export const SetSpecificFactories = {
	// Exactly one Planeswalker per booster
	war: (cardPool, landSlot, options) => {
		const [planeswalkers, filteredCardPool] = filterCardPool(cardPool, cid =>
			Cards[cid].type.includes("Planeswalker")
		);
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.planeswalkers = planeswalkers;
		factory.originalGenBooster = factory.generateBooster;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const plwCounts = countBySlot(this.planeswalkers);
			// Ignore the rule if suitable rarities are ignored, or there's no planeswalker left
			if (
				((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
					(!("rare" in targets) || targets["rare"] <= 0)) ||
				Object.values(plwCounts).every(c => c === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				const pickedRarity = rollSpecialCardRarity(plwCounts, targets, options);
				const pickedCID = pickCard(this.planeswalkers[pickedRarity], []);

				const updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				const booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot (FIXME: Not perfect if there's a foil...)
				if (pickedRarity === "rare" || pickedRarity === "mythic") booster.unshift(pickedCID);
				else
					booster.splice(
						booster.findIndex(c => c.rarity === pickedRarity),
						0,
						pickedCID
					);
				return booster;
			}
		};
		return factory;
	},
	// At least one Legendary Creature per booster
	// https://www.lethe.xyz/mtg/collation/dom.html
	dom: (cardPool, landSlot, options) => {
		const regex = /Legendary.*Creature/;
		const [legendaryCreatures, filteredCardPool] = filterCardPool(cardPool, cid => Cards[cid].type.match(regex));
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.originalGenBooster = factory.generateBooster;
		factory.legendaryCreatures = legendaryCreatures;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const legendaryCounts = countBySlot(this.legendaryCreatures);
			// Ignore the rule if there's no legendary creatures left
			if (Object.values(legendaryCounts).every(c => c === 0)) {
				return this.originalGenBooster(targets);
			} else {
				// Roll for legendary rarity
				const pickedRarity = rollSpecialCardRarity(legendaryCounts, targets, options);
				const pickedCard = pickCard(this.legendaryCreatures[pickedRarity], []);
				removeCardFromDict(pickedCard.id, this.cardPool[pickedCard.rarity]);

				const updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				const booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot, for Dominaria, the added Legendary is always the last card
				booster.unshift(pickedCard);
				return booster;
			}
		};
		return factory;
	},
	// Exactly one MDFC per booster
	znr: (cardPool, landSlot, options) => {
		const [mdfcByRarity, filteredCardPool] = filterCardPool(cardPool, cid => Cards[cid].name.includes("//"));
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.mdfcByRarity = mdfcByRarity;
		factory.originalGenBooster = factory.generateBooster;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const mdfcCounts = countBySlot(this.mdfcByRarity);
			// Ignore the rule if suitable rarities are ignored, or there's no mdfc left
			if (
				((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
					(!("rare" in targets) || targets["rare"] <= 0)) ||
				Object.values(mdfcCounts).every(c => c === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				// Roll for MDFC rarity
				const pickedRarity = rollSpecialCardRarity(mdfcCounts, targets, options);
				const pickedCID = pickCard(this.mdfcByRarity[pickedRarity], []);

				let updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				let booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot (FIXME: Not perfect if there's a foil...)
				if (pickedRarity === "rare" || pickedRarity === "mythic") booster.unshift(pickedCID);
				else
					booster.splice(
						booster.findIndex(c => c.rarity === pickedRarity),
						0,
						pickedCID
					);
				return booster;
			}
		};
		return factory;
	},
};

/*
 * Another collation method using data from https://github.com/taw/magic-sealed-data
 */

import PaperBoosterData from "../data/sealed_extended_data.json";

function weightedRandomPick(arr, totalWeight, picked = []) {
	let pick = randomInt(0, totalWeight);
	let idx = 0;
	let acc = arr[idx].weight;
	while(acc < pick) {
		++idx;
		acc += arr[idx].weight;
	}
	if(arr[idx] in picked) return weightedRandomPick(arr, totalWeight, picked);
	return arr[idx];
}

const CardsBySetAndCollectorNumber = {}
for(let cid in Cards) {
	CardsBySetAndCollectorNumber[`${Cards[cid].set}:${Cards[cid].collector_number}`] = cid;
}

export const PaperBoosterFactories = {};
// For some sets, this description is incomplete (One MDFC per pack isn't inforced for ZNR for example.)
for(let set of PaperBoosterData.filter(s => !['znr'].includes(s.code))) {
	if(!constants.PrimarySets.includes(set.code)) {
		console.log(`PaperBoosterFactories: Found '${set.code}' collation data but set is not in PrimarySets, skippink it.`);
		continue;
	}

	for(let sheetName in set.sheets) {
		for(let card of set.sheets[sheetName].cards) {
			let num = card.number;
			card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			if(!card.id) { // Special case for double faced cards
				if(['a', '★'].includes(num[num.length - 1])) num = num.substr(0, num.length - 1)
				card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			}
			if(!card.id) console.log("Error! Could not find corresponding card:", card);
		}
	}
	PaperBoosterFactories[set.code] = function(options = {}) {
		let possibleContent = set.boosters;
		if(!options.foil) { // (Attempt to) Filter out sheets with foils if option is disabled.
			let nonFoil = set.boosters.filter(e => !Object.keys(e.sheets).some(s => s.includes("foil")));
			if(nonFoil.length > 0) possibleContent = nonFoil;
		}
		return {
			set: set,
			options: options,
			possibleContent: possibleContent,
			generateBooster: function() {
				const booster = [];
				const boosterContent = weightedRandomPick(this.possibleContent, this.possibleContent.reduce((acc, val) => acc += val.weight, 0));
				for(let sheetName in boosterContent.sheets) {
					if(this.set.sheets.balance_colors) {
						// TODO
						let cardsToPick = boosterContent.sheets[sheetName];
						for(let i = 0; i < cardsToPick; ++i) {
							booster.push(weightedRandomPick(this.set.sheets[sheetName].cards, this.set.sheets[sheetName].total_weight, booster));
						}
					} else {
						for(let i = 0; i < boosterContent.sheets[sheetName]; ++i) {
							booster.push(weightedRandomPick(this.set.sheets[sheetName].cards, this.set.sheets[sheetName].total_weight, booster));
						}
					}
				}
				return booster.map(c => c.foil ? Object.assign({foil: true}, getUnique(c.id)) : getUnique(c.id)).reverse();
			}
		};
	}
}
