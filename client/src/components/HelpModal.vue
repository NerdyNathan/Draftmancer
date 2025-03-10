<template>
	<div>
		<h2>FAQ</h2>
		<div class="faq">
			<strong>Can we play cube?</strong>
			<p>
				Yes! You can import custom list of cards in text format in the settings.
				<a href="cubeformat.html" target="_blank" rel="noopener nofollow">More information</a>.
			</p>
			<strong>Are custom cards supported?</strong>
			<p>
				Yes! Cubes support custom cards, see the
				<a href="cubeformat.html#custom-cards" target="_blank" rel="noopener nofollow"
					>Cube Format documentation</a
				>
				for more information.
			</p>
			<strong>Are Conspiracy draft matters cards supported?</strong>
			<p>
				Yes! Well, some of them at least. I tried to implement the most popular ones (Cogwork Librarian, Lore
				Seeker...). You can find the status of each card in
				<a
					href="https://github.com/Senryoku/Draftmancer/wiki/Conspiracy-cards-support"
					target="_blank"
					rel="noopener nofollow"
					>this page of the GitHub wiki</a
				>.
			</p>
			<strong>How do bots work?</strong>
			<p>There are multiple types of bots, depending on the card pool:</p>
			<ul>
				<li>
					Recent sets (~after 2021): For each official set drafts, I train a set-specific Machine Learning
					model on drafts conducted on Draftmancer, and
					<a href="https://www.17lands.com/public_datasets" target="_blank" rel="noopener nofollow"
						>17lands</a
					>
					data when available.
				</li>
				<li>
					Cube: Bots provided by
					<a href="https://www.cubecobra.com/" target="_blank" rel="noopener nofollow">Cube Cobra</a>.
				</li>
				<!--<li>
					Cube: Another Machine Learning model developed by
					<a href="https://www.patreon.com/cubeartisan" target="_blank" rel="noopener nofollow">ruler501</a>.
				</li>-->
				<li>
					If neither of the above models can be used, a simple fallback algorithm takes over. It will choose
					cards based on a fixed 0-5 score assigned to each card, and the colors of cards it already picked.
				</li>
			</ul>

			Your question isn't answered here? Head to the
			<a href="https://discord.gg/ZkMyKpPYSz" target="_blank" rel="noopener nofollow"
				>Help section of the Draftmancer Discord</a
			>!
		</div>
		<br />
		<h2>Settings Description</h2>
		<div class="help-options">
			<div style="width: 50%">
				<strong>Session settings</strong>
				(Only accessible to the session owner, shared by everyone in your session)
				<ul>
					<li>
						<span class="option-name">Restrict card pool to Player Collections</span>
						: When enabled, card pool will be limited to cards present in all player collections.
					</li>
					<li>
						<span class="option-name">Card Pool</span>
						: Select one or multiple sets to draft with. All chosen sets will form the card pool out of
						which mixed boosters will be generated for all players. If you want every player to receive
						certain pure set boosters in a particular order (e.g. for original block drafts) you have to use
						the "Individual Booster Set" option in settings instead!
					</li>
					<li>
						<span class="option-name">Bots</span>
						: Adds virtual players to your draft.
					</li>
					<li>
						<span class="option-name">Pick Timer</span>
						: Maximum time in seconds allowed to pick a card in each booster. "0" means the timer is
						disabled.
					</li>
				</ul>
				Click on
				<span @click="openSettings" class="clickable">
					<font-awesome-icon icon="fa-solid fa-cog"></font-awesome-icon>
					Settings
				</span>
				for some additional settings:
				<ul>
					<li>
						<span class="option-name">Public</span>
						: Flags your session as public. It will appear in the "Public Sessions" menu so anyone can join
						directly.
					</li>
					<li>
						<span class="option-name">Color Balance</span>
						: If set, the system will attempt to smooth out the color distribution in each pack, as opposed
						to being completely random. This also affects sealed and cube!
					</li>
					<li>
						<span class="option-name">Custom Card List</span>
						: Submit a custom card list (one English card name per line) to draft your own cube. Collections
						are ignored in this mode.
						<a href="cubeformat.html" target="_blank" rel="noopener nofollow">More information</a>
					</li>
					<li>
						<span class="option-name">Foil</span>
						: If enabled, each pack will have a chance to contain a shiny foil card of any rarity and
						replaces a common - like in paper.
					</li>
				</ul>
			</div>
			<div style="width: 50%">
				<strong>Personal settings</strong>
				<ul>
					<li>
						<span class="option-name">Language</span>
						: Adjusts the display language of cards (not the page UI!). Some cards are not available in all
						languages.
					</li>
					<li>
						<span class="option-name">Restrict to Collection</span>
						: If unchecked, your collection will not limit the cards available in the selected sets. If
						every players unchecks this, you will draft using all cards. This setting is ignored if "Ignore
						Collections" is enabled by the session owner, when using a Custom Card List or Pre-Determined
						Boosters.
					</li>
					<li>
						<span class="option-name">Pick on Double Click</span>
						: Allows you to double click on cards during draft to pick without having to confirm.
					</li>
					<li>
						<span class="option-name">Notifications</span>
						: Enable this to receive desktop notifications when a draft is starting or you receive a new
						pack to make a pick.
					</li>
					<li>
						<span class="option-name">Session ID</span>
						: A unique identifier for your session, you can use any name, just make sure to use the same as
						your friends to play with them!
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
	(e: "openSettings"): void;
}>();

const openSettings = () => {
	emit("openSettings");
};
</script>
