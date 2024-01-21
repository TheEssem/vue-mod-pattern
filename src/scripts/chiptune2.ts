// heavily modified ts port of https://github.com/deskjet/chiptune2.js

/**
 * Copyright © 2013-2017 The chiptune2.js contributers.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// @ts-ignore
import wasm from "libopenmpt-wasm";

const ChiptuneAudioContext = window.AudioContext;

export class ChiptuneJsConfig {
  repeatCount: number | undefined;
  context: AudioContext | undefined;

  constructor(repeatCount?: number, context?: AudioContext) {
    this.repeatCount = repeatCount;
	  this.context = context;
  }
}

type Context = {
  index?: number;
  type?: string;
};

type Handler = (ctx?: Context) => void;

type OpenMPT = {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;

  stringToUTF8(string: string, ptr: number, maxBytesToWrite?: number): void;
  UTF8ToString(ptr: number, maxBytesToRead?: number): string;

  _malloc(size: number): number;
  _free(ptr: number): void;

  _openmpt_module_create_from_memory(ptr: number, size: number, logfunc: number, loguser: number, ctls: number): number;
  _openmpt_module_destroy(ptr: number): void;

  _openmpt_module_format_pattern_row_channel(ptr: number, pattern: number, row: number, channel: number, width: number, pad: boolean): number;

  _openmpt_module_get_current_pattern(ptr: number): number;
  _openmpt_module_get_current_row(ptr: number): number;
  _openmpt_module_get_duration_seconds(ptr: number): number;
  _openmpt_module_get_metadata(ptr: number, key: number): number;
  _openmpt_module_get_metadata_keys(ptr: number): number;
  _openmpt_module_get_num_channels(ptr: number): number;
  _openmpt_module_get_num_patterns(ptr: number): number;
  _openmpt_module_get_pattern_num_rows(ptr: number, pattern: number): number;
  _openmpt_module_get_position_seconds(ptr: number): number;

  _openmpt_module_read_float_stereo(ptr: number, sampleRate: number, count: number, left: number, right: number): number;
  
  _openmpt_module_set_position_seconds(ptr: number, position: number): void;
  _openmpt_module_set_repeat_count(ptr: number, repeatCount: number): void;
};

type OpenMPTPlayerNode = {
  config: ChiptuneJsConfig;
  leftBufferPtr: number;
  modulePtr: number;
  nbChannels: number;
  patternIndex: number;
  paused: boolean;
  player: ChiptuneJsPlayer;
  rightBufferPtr: number;

  cleanup(): void;
  pause(): void;
  stop(): void;
  togglePause(): void;
  unpause(): void;
} & ScriptProcessorNode;

export class ChiptuneJsPlayer {
  config: ChiptuneJsConfig;
  audioContext: AudioContext;
  context: GainNode;
  currentPlayingNode: OpenMPTPlayerNode | null;
  handlers: { eventName: string, handler: Handler }[];
  libopenmpt: OpenMPT | null;
  touchLocked: boolean;
  volume: number;

  constructor(config: ChiptuneJsConfig) {
    this.libopenmpt = null;
	  this.config = config;
	  this.audioContext = config.context || new ChiptuneAudioContext();
	  this.context = this.audioContext.createGain();
	  this.currentPlayingNode = null;
	  this.handlers = [];
	  this.touchLocked = true;
	  this.volume = 1;
  }

  fireEvent(eventName: string, response?: Context) {
    const handlers = this.handlers;
    if (handlers.length > 0) {
      for (const handler of handlers) {
        if (handler.eventName === eventName) {
          handler.handler(response);
        }
      }
    }
  }

  addHandler(
    eventName: string,
    handler: Handler,
  ) {
    this.handlers.push({ eventName, handler });
  }

  clearHandlers() {
    this.handlers = [];
  }

  onEnded(handler: Handler) {
    this.addHandler("onEnded", handler);
  }

  onError(handler: Handler) {
    this.addHandler("onError", handler);
  }

  duration() {
    if (this.currentPlayingNode && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_duration_seconds(
        this.currentPlayingNode.modulePtr,
      );
    }
    return 0;
  }

  position() {
    if (this.currentPlayingNode && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_position_seconds(
        this.currentPlayingNode.modulePtr,
      );
    }
    return 0;
  }

  repeat(repeatCount: number) {
    if (this.currentPlayingNode && this.libopenmpt) {
      this.libopenmpt._openmpt_module_set_repeat_count(
        this.currentPlayingNode.modulePtr,
        repeatCount,
      );
    }
  }

  seek(position: number) {
    if (this.currentPlayingNode && this.libopenmpt) {
      this.libopenmpt._openmpt_module_set_position_seconds(
        this.currentPlayingNode.modulePtr,
        position,
      );
    }
  }

  metadata() {
    if (!this.currentPlayingNode || !this.libopenmpt) return;
    const data = {};
	  const keys = this.libopenmpt.UTF8ToString(
			this.libopenmpt._openmpt_module_get_metadata_keys(
				this.currentPlayingNode.modulePtr,
			),
		).split(";");
	  let keyNameBuffer = 0;
	  for (const key of keys) {
		  keyNameBuffer = this.libopenmpt._malloc(key.length + 1);
		  this.libopenmpt.stringToUTF8(key, keyNameBuffer);
      // @ts-ignore
		  data[key] = this.libopenmpt.UTF8ToString(
			  this.libopenmpt._openmpt_module_get_metadata(
				  this.currentPlayingNode?.modulePtr,
				  keyNameBuffer,
			  ),
		  );
		  this.libopenmpt._free(keyNameBuffer);
	  }
	  return data;
  }

  unlock() {
    const context = this.audioContext;
	  const buffer = context.createBuffer(1, 1, 22050);
	  const unlockSource = context.createBufferSource();
	  unlockSource.buffer = buffer;
	  unlockSource.connect(this.context);
	  this.context.connect(context.destination);
	  unlockSource.start(0);
	  this.touchLocked = false;
  }

  load(input: string | URL | File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (this.touchLocked) {
        this.unlock();
      }
      if (input instanceof File) {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result) resolve(reader.result as ArrayBuffer);
        };
        reader.onerror = (err) => {
          reject(err);
        };
        reader.readAsArrayBuffer(input);
      } else {
        window
          .fetch(input)
          .then((response) => {
            response
              .arrayBuffer()
              .then((arrayBuffer) => {
                resolve(arrayBuffer);
              })
              .catch((error) => {
                reject(error);
              });
          })
          .catch((error) => {
            reject(error);
          });
      }
    });
  }

  async play(buffer: ArrayBuffer) {
    this.unlock();
	  this.stop();
	  return this.createLibopenmptNode(buffer, this.config).then((processNode) => {
		  if (processNode === null || !this.libopenmpt) {
			  return;
		  }
		  this.libopenmpt._openmpt_module_set_repeat_count(
			  processNode.modulePtr,
			  this.config.repeatCount || 0,
		  );
		  this.currentPlayingNode = processNode;
		  processNode.connect(this.context);
		  this.context.connect(this.audioContext.destination);
	  });
  }

  stop() {
    if (this.currentPlayingNode != null) {
      this.currentPlayingNode.disconnect();
      this.currentPlayingNode.cleanup();
      this.currentPlayingNode = null;
    }
  }

  togglePause() {
    if (this.currentPlayingNode != null) {
      this.currentPlayingNode.togglePause?.();
    }
  }

  getPattern() {
    if (this.currentPlayingNode?.modulePtr && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_current_pattern(
        this.currentPlayingNode.modulePtr,
      );
    }
    return 0;
  }

  getRow() {
    if (this.currentPlayingNode?.modulePtr && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_current_row(
        this.currentPlayingNode.modulePtr,
      );
    }
    return 0;
  }

  getNumPatterns() {
    if (this.currentPlayingNode?.modulePtr && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_num_patterns(
        this.currentPlayingNode.modulePtr,
      );
    }
    return 0;
  }

  getPatternNumRows(pattern: number) {
    if (this.currentPlayingNode?.modulePtr && this.libopenmpt) {
      return this.libopenmpt._openmpt_module_get_pattern_num_rows(
        this.currentPlayingNode.modulePtr,
        pattern,
      );
    }
    return 0;
  }

  getPatternRowChannel(
    pattern: number,
    row: number,
    channel: number,
  ) {
    if (this.currentPlayingNode?.modulePtr && this.libopenmpt) {
      return this.libopenmpt.UTF8ToString(
        this.libopenmpt._openmpt_module_format_pattern_row_channel(
          this.currentPlayingNode.modulePtr,
          pattern,
          row,
          channel,
          0,
          true,
        ),
      );
    }
    return "";
  }

  async createLibopenmptNode(
    buffer: ArrayBuffer,
    config: ChiptuneJsConfig,
  ): Promise<OpenMPTPlayerNode> {
    const maxFramesPerChunk = 4096;
    const processNode = this.audioContext.createScriptProcessor(2048, 0, 2) as OpenMPTPlayerNode;
    processNode.config = config;
    processNode.player = this;
    if (!this.libopenmpt) this.libopenmpt = await wasm() as OpenMPT;
    const byteArray = new Int8Array(buffer);
    const ptrToFile = this.libopenmpt._malloc(byteArray.byteLength);
    this.libopenmpt.HEAPU8.set(byteArray, ptrToFile);
    processNode.modulePtr = this.libopenmpt._openmpt_module_create_from_memory(
      ptrToFile,
      byteArray.byteLength,
      0,
      0,
      0,
    );
    processNode.nbChannels = this.libopenmpt._openmpt_module_get_num_channels(
      processNode.modulePtr,
    );
    processNode.patternIndex = -1;
    processNode.paused = false;
    processNode.leftBufferPtr = this.libopenmpt._malloc(4 * maxFramesPerChunk);
    processNode.rightBufferPtr = this.libopenmpt._malloc(4 * maxFramesPerChunk);
    processNode.cleanup = function () {
      if (this.modulePtr !== 0) {
        processNode.player.libopenmpt?._openmpt_module_destroy(this.modulePtr);
        this.modulePtr = 0;
      }
      if (this.leftBufferPtr !== 0) {
        processNode.player.libopenmpt?._free(this.leftBufferPtr);
        this.leftBufferPtr = 0;
      }
      if (this.rightBufferPtr !== 0) {
        processNode.player.libopenmpt?._free(this.rightBufferPtr);
        this.rightBufferPtr = 0;
      }
    };
    processNode.stop = function () {
      this.disconnect();
      this.cleanup();
    };
    processNode.pause = function () {
      this.paused = true;
    };
    processNode.unpause = function () {
      this.paused = false;
    };
    processNode.togglePause = function () {
      this.paused = !this.paused;
    };
    // @ts-ignore
    processNode.onaudioprocess = function (this: OpenMPTPlayerNode, e) {
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      let framesToRender = outputL.length;
      if (this.modulePtr === 0) {
        for (let i = 0; i < framesToRender; ++i) {
          outputL[i] = 0;
          outputR[i] = 0;
        }
        this.disconnect();
        this.cleanup();
        return;
      }
      if (this.paused) {
        for (let i = 0; i < framesToRender; ++i) {
          outputL[i] = 0;
          outputR[i] = 0;
        }
        return;
      }
      let framesRendered = 0;
      let ended = false;
      let error = false;

      if (!processNode.player.libopenmpt) return;
  
      const currentPattern =
        processNode.player.libopenmpt._openmpt_module_get_current_pattern(
          this.modulePtr,
        );
      const currentRow =
        processNode.player.libopenmpt._openmpt_module_get_current_row(
          this.modulePtr,
        );
      if (currentPattern !== this.patternIndex) {
        processNode.player.fireEvent("onPatternChange");
      }
      processNode.player.fireEvent("onRowChange", { index: currentRow });
  
      while (framesToRender > 0) {
        const framesPerChunk = Math.min(framesToRender, maxFramesPerChunk);
        const actualFramesPerChunk =
          processNode.player.libopenmpt._openmpt_module_read_float_stereo(
            this.modulePtr,
            this.context.sampleRate,
            framesPerChunk,
            this.leftBufferPtr,
            this.rightBufferPtr,
          );
        if (actualFramesPerChunk === 0) {
          ended = true;
          // modulePtr will be 0 on openmpt: error: openmpt_module_read_float_stereo: ERROR: module * not valid or other openmpt error
          error = !this.modulePtr;
        }
        const rawAudioLeft = processNode.player.libopenmpt.HEAPF32.subarray(
          this.leftBufferPtr / 4,
          this.leftBufferPtr / 4 + actualFramesPerChunk,
        );
        const rawAudioRight = processNode.player.libopenmpt.HEAPF32.subarray(
          this.rightBufferPtr / 4,
          this.rightBufferPtr / 4 + actualFramesPerChunk,
        );
        for (let i = 0; i < actualFramesPerChunk; ++i) {
          outputL[framesRendered + i] = rawAudioLeft[i];
          outputR[framesRendered + i] = rawAudioRight[i];
        }
        for (let i = actualFramesPerChunk; i < framesPerChunk; ++i) {
          outputL[framesRendered + i] = 0;
          outputR[framesRendered + i] = 0;
        }
        framesToRender -= framesPerChunk;
        framesRendered += framesPerChunk;
      }
      if (ended) {
        this.disconnect();
        this.cleanup();
        error
          ? processNode.player.fireEvent("onError", { type: "openmpt" })
          : processNode.player.fireEvent("onEnded");
      }
    };
    return processNode;
  }
}