import assert from "node:assert/strict";
import { RealtimeMidiSynth } from "@client/engine/audio/music/realtime/RealtimeMidiSynth";
import { createScriptProcessorMusicNode } from "@client/engine/audio/music/realtime/ScriptProcessorMusicNode";

let disconnected = false;
const output: any = { connect() {}, disconnect() { disconnected = true; }, onaudioprocess: null };
const context: any = { sampleRate: 48000, createScriptProcessor: (size: number, inputs: number, channels: number) => {
    assert.deepEqual([size,inputs,channels],[2048,0,2]); return output;
} };
const source = (RealtimeMidiSynth.prototype as any).getWorkletProcessorCode();
const node = createScriptProcessorMusicNode(context, source);
const samples = Float32Array.from({length: 128}, (_,i) => Math.sin(i * Math.PI * 2 / 128) * 0.8);
node.port.postMessage({type:"loadSample",index:0,samples,sampleRate:48000,looped:true,loopStart:0,loopEnd:128});
node.port.postMessage({type:"noteOn",time:10,channel:0,key:60,velocity:100,sampleIndex:0,basePitch:0,
    patchVolume:32768,pan:64,exclusiveClass:-1,looped:true,loopStart:0,loopEnd:128,sampleRate:48000,
    decayRate:0,volumeEnvRate:0,releaseEnvRate:0,decayModifier:0,vibratoDepth:0,vibratoRate:0,vibratoDelay:0});
function render(time: number): Float32Array[] {
    const buffers = [new Float32Array(2048),new Float32Array(2048)];
    output.onaudioprocess({playbackTime:time,outputBuffer:{getChannelData:(i: number)=>buffers[i]}});
    for (const buffer of buffers) assert(buffer.every(Number.isFinite));
    return buffers;
}
assert(render(9).every(buffer=>buffer.every(v=>v===0)), "future MIDI events wait for their scheduled time");
assert(render(10).every(buffer=>buffer.some(v=>Math.abs(v)>0.001)), "the actual bundled DSP produces stereo audio without AudioWorklet");
node.port.postMessage({type:"setVolume",volume:0});
assert(render(10.1).every(buffer=>buffer.every(v=>v===0)), "music mute works in the fallback");
node.port.postMessage({type:"stopAll"});
assert(render(10.2).every(buffer=>buffer.every(v=>v===0)));
node.disconnect();
assert(disconnected);
assert.equal(output.onaudioprocess, null);
console.log("HTTP music DSP, scheduling, mute, and teardown passed");
