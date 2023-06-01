<template>
  <div v-if="!loaded">
    <p>Select tune below:</p>
    <button @click="startModule('/a_piece_of_magicmix.mod')">
      Lizardking - A Piece of Magicmix (4-channel MOD)
    </button>
    <button @click="startModule('/strshine.s3m')">
      Purple Motion - Starshine (8-channel S3M)
    </button>
    <button @click="startModule('/dragonatlas.xm')">
      Radix - Dragon Atlas (16-channel XM)
    </button>
    <button @click="startModule('/FEATSOFV.XM')">
      Elwood - Feats of Valor (22-channel XM)
    </button>
    <button @click="startModule('/znm-believe.it')">
      Zanoma - Believe (30-channel IT, very laggy)
    </button>
    <p>This player is powered by chiptune2.js, libopenmpt, and Vue.</p>
  </div>

  <div v-else>
    <div class="mod-player-enabled">
      <div class="pattern-display">
        <div class="mod-pattern" ref="modPattern">
          <span
            v-for="(row, j) in patData[currentPattern]"
            ref="initRow"
            v-bind:class="{ modRowActive: isRowActive(j) }"
          >
            <span v-bind:class="{ modColQuarter: j % 4 === 0 }">{{
              indexText(j)
            }}</span>
            <span class="mod-col" v-for="n in nbChannels"
              >|{{ row.notes[n - 1]
              }}<span class="mod-col-inst">{{ row.insts[n - 1] }}</span
              ><span class="mod-col-vol">{{ row.vols[n - 1] }}</span
              ><span class="mod-col-fx">{{ row.fxs[n - 1] }}</span
              ><span class="mod-col-op">{{ row.ops[n - 1] }}</span>
            </span>
          </span>
        </div>
      </div>
      <div class="controls">
        <button class="play" @click="playPause()">
          <i v-if="playing">⏸️</i>
          <i v-else>▶️</i>
        </button>
        <button class="stop" @click="stop()">
          <i>⏹️</i>
        </button>
        <input
          class="progress"
          type="range"
          min="0"
          max="1"
          v-model="position"
          step="0.1"
          ref="progress"
          @mousedown="initSeek()"
          @mouseup="performSeek()"
        />
        <input
          type="range"
          min="0"
          max="1"
          v-model="player.context.gain.value"
          step="0.1"
        />
      </div>
    </div>
    <p>Reload to choose another module.</p>
  </div>
</template>

<script lang="ts" setup>
import { ref, shallowRef, onDeactivated } from "vue";
import { ChiptuneJsPlayer, ChiptuneJsConfig } from "./scripts/chiptune2";

interface ModRow {
  notes: string[];
  insts: string[];
  vols: string[];
  fxs: string[];
  ops: string[];
}

let playing = ref(false);
let patternShow = ref(false);
const initRow = ref<HTMLSpanElement>();
let modPattern = ref<HTMLDivElement>();
let progress = ref<HTMLProgressElement>();
let position = ref(0);
const player = shallowRef(new ChiptuneJsPlayer(new ChiptuneJsConfig()));
let patData = shallowRef([] as ModRow[][]);
let currentPattern = ref(0);
let nbChannels = ref(0);
let loaded = ref(false);

let currentRow = 0;
let rowHeight = 0;
let buffer: null = null;
let isSeeking = false;

function startModule(module: string) {
  player.value
    .load(module)
    .then((result: null) => {
      buffer = result;
      patternShow.value = !patternShow.value;
      loaded.value = true;
      try {
        player.value.play(buffer);
        display();
      } catch (e) {
        console.warn(e);
      }
      player.value.stop();
    })
    .catch((error: any) => {
      console.error(error);
    });
}

function playPause() {
  player.value.addHandler("onRowChange", (i: { index: number }) => {
    currentRow = i.index;
    currentPattern.value = player.value.getPattern();
    progress.value.max = player.value.duration();
    if (!isSeeking) {
      position.value = player.value.position() % player.value.duration();
    }
    requestAnimationFrame(display);
  });

  player.value.addHandler("onEnded", () => {
    stop();
  });

  if (player.value.currentPlayingNode === null) {
    player.value.play(buffer);
    player.value.seek(position.value);
    playing.value = true;
  } else {
    player.value.togglePause();
    playing.value = !player.value.currentPlayingNode.paused;
  }
}

function stop(noDisplayUpdate = false) {
  player.value.stop();
  playing.value = false;
  if (!noDisplayUpdate) {
    try {
      player.value.play(buffer);
      display();
    } catch (e) {
      console.warn(e);
    }
  }
  player.value.stop();
  position.value = 0;
  currentRow = 0;
  player.value.clearHandlers();
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
      requestAnimationFrame(() => {
        modPattern.value.scrollTop = currentRow * rowHeight;
      });
    }
    return true;
  }
  return;
}

function indexText(i: number) {
  let rowText = parseInt(i).toString(16);
  if (rowText.length === 1) {
    rowText = "0" + rowText;
  }
  return rowText;
}

function getRow(pattern: number, rowOffset: number) {
  let notes: string[] = [],
    insts: string[] = [],
    vols: string[] = [],
    fxs: string[] = [],
    ops: string[] = [];

  for (let channel = 0; channel < nbChannels.value; channel++) {
    const part = player.value.getPatternRowChannel(pattern, rowOffset, channel);

    notes.push(part.substring(0, 3));
    insts.push(part.substring(4, 6));
    vols.push(part.substring(6, 9));
    fxs.push(part.substring(10, 11));
    ops.push(part.substring(11, 13));
  }

  return {
    nbChannels: nbChannels.value,
    notes,
    insts,
    vols,
    fxs,
    ops,
  };
}

function display() {
  if (!patternShow.value) return;

  if (patData.value.length === 0) {
    const nbPatterns = player.value.getNumPatterns();
    const pattern = player.value.getPattern();

    currentPattern.value = pattern;

    if (player.value.currentPlayingNode) {
      nbChannels.value = player.value.currentPlayingNode.nbChannels;
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
    overflow-x: scroll;
    overflow-y: hidden;
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
      padding-top: 25%;
      padding-bottom: 25%;
      content-visibility: auto;

      > .modRowActive {
        opacity: 1;
      }

      > span {
        opacity: 0.5;

        > .modColQuarter {
          color: #ffff00;
        }

        > .mod-col {
          > .mod-col-inst {
            color: #80e0ff;
          }
          > .mod-col-vol {
            color: #80ff80;
          }
          > .mod-col-fx {
            color: #ff80e0;
          }
          > .mod-col-op {
            color: #ffe080;
          }
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
      cursor: pointer;

      &:hover {
        background-color: #fff;
      }
    }

    > input[type="range"] {
      height: 21px;
      -webkit-appearance: none;
      width: 90px;
      padding: 0;
      margin: 4px 8px;
      overflow-x: hidden;

      &:focus {
        outline: none;

        &::-webkit-slider-runnable-track {
          background: #000;
        }

        &::-ms-fill-lower,
        &::-ms-fill-upper {
          background: #000;
        }
      }

      &::-webkit-slider-runnable-track {
        width: 100%;
        height: 100%;
        cursor: pointer;
        border-radius: 0;
        animate: 0.2s;
        background: #000;
        border: 1px solid #fff;
        overflow-x: hidden;
      }

      &::-webkit-slider-thumb {
        border: none;
        height: 100%;
        width: 14px;
        border-radius: 0;
        background: #ccc;
        cursor: pointer;
        -webkit-appearance: none;
        box-shadow: calc(-100vw - 14px) 0 0 100vw #444;
        clip-path: polygon(
          1px 0,
          100% 0,
          100% 100%,
          1px 100%,
          1px calc(50% + 10.5px),
          -100vw calc(50% + 10.5px),
          -100vw calc(50% - 10.5px),
          0 calc(50% - 10.5px)
        );
        z-index: 1;
      }

      &::-moz-range-track {
        width: 100%;
        height: 100%;
        cursor: pointer;
        border-radius: 0;
        animate: 0.2s;
        background: #000;
        border: 1px solid #fff;
      }

      &::-moz-range-progress {
        cursor: pointer;
        height: 100%;
        background: #444;
      }

      &::-moz-range-thumb {
        border: none;
        height: 100%;
        border-radius: 0;
        width: 14px;
        background: #ccc;
        cursor: pointer;
      }

      &::-ms-track {
        width: 100%;
        height: 100%;
        cursor: pointer;
        border-radius: 0;
        animate: 0.2s;
        background: transparent;
        border-color: transparent;
        color: transparent;
      }

      &::-ms-fill-lower {
        background: #444;
        border: 1px solid #fff;
        border-radius: 0;
      }

      &::-ms-fill-upper {
        background: #000;
        border: 1px solid #fff;
        border-radius: 0;
      }

      &::-ms-thumb {
        margin-top: 1px;
        border: none;
        height: 100%;
        width: 14px;
        border-radius: 0;
        background: #ccc;
        cursor: pointer;
      }

      &.progress {
        flex-grow: 1;
        min-width: 0;
      }
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
