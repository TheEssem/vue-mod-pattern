<template>
  <div v-if="!loaded">
    <p>Upload a tune:</p>
    <input
      type="file"
      id="modfile"
      ref="modfile"
      @change="startModuleFromFile"
    />
    <p>Or select an example tune below:</p>
    <button @click="startModule(`${basePath}a_piece_of_magicmix.mod`)">
      Lizardking - A Piece of Magicmix (4-channel MOD)
    </button>
    <button @click="startModule(`${basePath}h0ffman_-_drop_the_panic.mod`)">
      Hoffman - Drop the Panic (4-channel MOD)
    </button>
    <button @click="startModule(`${basePath}strshine.s3m`)">
      Purple Motion - Starshine (8-channel S3M)
    </button>
    <button @click="startModule(`${basePath}dragonatlas.xm`)">
      Radix - Dragon Atlas (16-channel XM)
    </button>
    <button @click="startModule(`${basePath}FEATSOFV.XM`)">
      Elwood - Feats of Valor (22-channel XM)
    </button>
    <button @click="startModule(`${basePath}RANSUMAA.XM`)">
      !Cube - Ransumaasta Kajahtaa (24-channel XM)
    </button>
    <button @click="startModule(`${basePath}jet lag.xm`)">
      Nighthawk - Jet Lag (32-channel XM)
    </button>
    <button @click="startModule(`${basePath}znm-believe.it`)">
      Zanoma - Believe (30-channel IT)
    </button>
    <button @click="startModule(`${basePath}aeolus_x.it`)">
      Xaser - Aeolus (32-channel IT)
    </button>
    <p>This player is powered by chiptune2.js, libopenmpt, and Vue. All text, no canvas.</p>
    <p>
      Source can be found at
      <a href="https://github.com/TheEssem/vue-mod-pattern"
        >https://github.com/TheEssem/vue-mod-pattern</a
      >.
    </p>
    <p>A version of this player can be found in <a href="https://joinfirefish.org">Firefish</a>.</p>
  </div>

  <div v-else>
    <div class="mod-player-enabled">
      <div class="pattern-display">
			<div v-if="patternShow" ref="modPattern" class="mod-pattern">
				<span
					v-for="(row, i) in patData[currentPattern]"
					v-if="patData.length !== 0"
					ref="initRow"
					:class="{ modRowActive: isRowActive(i) }"
				>
					<span :class="{ modColQuarter: i % 4 === 0 }">{{
						indexText(i)
					}}</span>
					<span class="mod-row-inner">{{ getRowText(row) }}</span>
				</span>
				<!--MkLoading v-else /-->
			</div>
			<div v-else class="mod-pattern" @click="showPattern()">
				<span ref="initRow" class="modRowActive">
					<span class="modColQuarter">00</span>
					<span class="mod-row-inner">|F-12Ev10XEF</span>
				</span>
				<br />
				<p>Click to show mod patterns</p>
			</div>
		</div>
		<div class="controls">
			<button v-if="!loading" class="play" @click="playPause()">
				<i v-if="playing">⏸️</i>
				<i v-else>▶️</i>
			</button>
			<!--MkLoading v-else :em="true" /-->
			<button class="stop" @click="stop()">
				<i>⏹️</i>
			</button>
			<button class="loop" @click="toggleLoop()">
				<i v-if="loop === -1">🔁</i>
				<i v-else>🔂</i>
			</button>
			<input
          class="progress"
          type="range"
          min="0"
          :max="length"
          v-model="position"
          step="0.1"
          @mousedown="initSeek()"
          @mouseup="performSeek()"
      />
			<button class="mute" @click="toggleMute()">
				<i v-if="muted">🔇</i>
				<i v-else>🔊</i>
			</button>
			<!--FormRange
				v-model="player.context.gain.value"
				class="volume"
				:min="0"
				:max="1"
				:step="0.1"
				:background="false"
				:tooltips="false"
				:instant="true"
				@update:modelValue="updateMute()"
			></FormRange-->
      <input
          class="volume"
          type="range"
          min="0"
          max="1"
          v-model="player.context.gain.value"
          step="0.1"
          @update:modelValue="updateMute()"
      />
		</div>
    </div>
    <br />
    <button @click="stopModule()">Return to module selection</button>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onDeactivated, ref, shallowRef } from "vue";
import { ChiptuneJsPlayer, ChiptuneJsConfig } from "./scripts/chiptune2";

interface ModRow {
	notes: string[];
	insts: string[];
	vols: string[];
	fxs: string[];
	ops: string[];
}

const basePath = ref(import.meta.env.BASE_URL);
const initRow = shallowRef<HTMLSpanElement[]>();
const player = shallowRef(new ChiptuneJsPlayer(new ChiptuneJsConfig()));
const playing = ref(false);
const patternShow = ref(false);
const modfile = ref<HTMLInputElement>();
const modPattern = ref<HTMLDivElement>();
const position = ref(0);
const patData = shallowRef([] as readonly ModRow[][]);
const currentPattern = ref(0);
const length = ref(1);
const muted = ref(false);
const loop = ref(0);
const loading = ref(false);

function startModuleFromFile() {
  const file = modfile.value?.files?.[0];
  if (!file) return;
  startModule(file);
}

function startModule(module: string | File) {
	player.value
		.load(module)
		.then((result) => {
			buffer = result;
      loaded.value = true;
		})
		.catch((e: any) => {
			console.error(e);
		});
}

function stopModule() {
  stop();
  patternShow.value = !patternShow.value;
  loaded.value = false;
  patData.value = [];
}

let loaded = ref(false);

let currentRow = 0,
	rowHeight = 0,
  nbChannels = 0,
	buffer: ArrayBuffer | null = null,
	isSeeking = false;

function showPattern() {
	patternShow.value = !patternShow.value;
	nextTick(() => {
		if (playing.value) display();
		else stop();
	});
}

function getRowText(row: ModRow) {
	let text = "";
	for (let i = 0; i < row.notes.length; i++) {
		text = text.concat(
			"|",
			row.notes[i],
			row.insts[i],
			row.vols[i],
			row.fxs[i],
			row.ops[i],
		);
	}
	return text;
}

function playPause() {
	player.value.addHandler("onRowChange", (i) => {
		if (i?.index !== undefined) currentRow = i.index;
		currentPattern.value = player.value.getPattern();
		length.value = player.value.duration();
		if (!isSeeking) {
			position.value = player.value.position();
		}
		requestAnimationFrame(display);
	});

	player.value.addHandler("onEnded", () => {
		stop();
	});

	if (player.value.currentPlayingNode === null) {
    if (!buffer) return;
		loading.value = true;
		player.value.play(buffer).then(() => {
			player.value.seek(position.value);
			player.value.repeat(loop.value);
			playing.value = true;
			loading.value = false;
		});
	} else {
		player.value.togglePause();
		playing.value = !player.value.currentPlayingNode.paused;
	}
}

async function stop(noDisplayUpdate = false) {
	player.value.stop();
	playing.value = false;
	if (!noDisplayUpdate && buffer) {
		try {
			await player.value.play(buffer);
			display(0, true);
		} catch (e) {
			console.warn(e);
		}
	}
	player.value.stop();
	position.value = 0;
	currentRow = 0;
	player.value.clearHandlers();
}

function toggleLoop() {
	loop.value = loop.value === -1 ? 0 : -1;
	player.value.repeat(loop.value);
}

let savedVolume = 0;

function toggleMute() {
	if (muted.value) {
		player.value.context.gain.value = savedVolume;
		savedVolume = 0;
	} else {
		savedVolume = player.value.context.gain.value;
		player.value.context.gain.value = 0;
	}
	muted.value = !muted.value;
}

function updateMute() {
	muted.value = false;
	savedVolume = 0;
}

function initSeek() {
  isSeeking = true;
}

function performSeek() {
	player.value.seek(position.value);
	display();
  isSeeking = false;
}

function isRowActive(i: number) {
	if (i === currentRow) {
		if (modPattern.value) {
			if (rowHeight === 0 && initRow.value)
				rowHeight = initRow.value[0].getBoundingClientRect().height;
			modPattern.value.scrollTop = currentRow * rowHeight;
		}
		return true;
	}
}

function indexText(i: number) {
	let rowText = i.toString(16);
	if (rowText.length === 1) {
		rowText = "0" + rowText;
	}
	return rowText;
}

function getRow(pattern: number, rowOffset: number) {
	const notes: string[] = [];
	const insts: string[] = [];
	const vols: string[] = [];
	const fxs: string[] = [];
	const ops: string[] = [];

	for (let channel = 0; channel < nbChannels; channel++) {
		const part = player.value.getPatternRowChannel(
			pattern,
			rowOffset,
			channel,
		);

		notes.push(part.substring(0, 3));
		insts.push(part.substring(4, 6));
		vols.push(part.substring(6, 9));
		fxs.push(part.substring(10, 11));
		ops.push(part.substring(11, 13));
	}

	return {
		notes,
		insts,
		vols,
		fxs,
		ops,
	};
}

function display(_time = 0, reset = false) {
	if (!patternShow.value) return;

	if (reset) {
		const pattern = player.value.getPattern();
		currentPattern.value = pattern;
	}

	if (patData.value.length === 0) {
		const nbPatterns = player.value.getNumPatterns();
		const pattern = player.value.getPattern();

		currentPattern.value = pattern;

		if (player.value.currentPlayingNode) {
			nbChannels = player.value.currentPlayingNode.nbChannels;
		}

		const patternsArray: ModRow[][] = [];

		for (let patOffset = 0; patOffset < nbPatterns; patOffset++) {
			const rowsArray: ModRow[] = [];
			const nbRows = player.value.getPatternNumRows(patOffset);
			for (let rowOffset = 0; rowOffset < nbRows; rowOffset++) {
				rowsArray.push(getRow(patOffset, rowOffset));
			}
			patternsArray.push(rowsArray);
		}

		patData.value = Object.freeze(patternsArray);
	}
}

onDeactivated(() => {
	stop();
});
</script>

<style lang="scss" scoped>
.mod-player-enabled {
	position: relative;
	display: flex;
	flex-direction: column;
  width: 64em;

	> i {
		display: block;
		position: absolute;
		border-radius: 6px;
		background-color: #fff;
    color: #ccc;
		font-size: 14px;
		opacity: 0.5;
		padding: 3px 6px;
		text-align: center;
		cursor: pointer;
		top: 12px;
		right: 12px;
	}

	> .pattern-display {
		width: 100%;
		height: 100%;
		overflow: hidden;
		color: #ffffff;
    background-color: black;
		text-align: center;
		font: 12px monospace;
		white-space: pre;
		user-select: none;

		> .mod-pattern {
			display: grid;
			overflow-y: hidden;
			height: 0;
			padding-top: calc((56.25% - 48px) / 2);
			padding-bottom: calc((56.25% - 48px) / 2);
			content-visibility: auto;

			> .modRowActive {
				opacity: 1;
			}

			> span {
				opacity: 0.5;

				> .modColQuarter {
					color: #ffff00;
				}

				> .mod-row-inner {
					background: repeating-linear-gradient(
						to right,
						#fff 0 4ch,
						#80e0ff 4ch 6ch,
						#80ff80 6ch 9ch,
						#ff80e0 9ch 10ch,
						#ffe080 10ch 12ch
					);
					background-clip: text;
					-webkit-background-clip: text;
					-webkit-text-fill-color: transparent;
				}
			}
		}
	}

	> .controls {
		display: flex;
		width: 100%;
		background-color: #888;

		> * {
			padding: 4px 8px;
		}

		> button,
		a {
			border: none;
			background-color: transparent;
			//color: var(--navFg);
			cursor: pointer;
			margin: auto;

			&:hover {
				background-color: #fff;
				border-radius: 3px;
			}
		}

		> .progress {
			flex-grow: 1;
			min-width: 0;
		}

		> .volume {
			flex-shrink: 1;
			max-width: 128px;
		}
	}
}

.mod-player-disabled {
	display: flex;
	justify-content: center;
	align-items: center;
	background: #111;
  color: #fff;

	> div {
		display: table-cell;
		text-align: center;
		font-size: 12px;

		> b {
			display: block;
		}
	}
}
</style>
