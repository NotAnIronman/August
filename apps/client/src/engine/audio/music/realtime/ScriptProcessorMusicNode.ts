export type MusicOutputNode = Pick<AudioNode, "connect" | "disconnect"> & {
    port: Pick<MessagePort, "postMessage">;
};

/** Compatibility path for HTTP origins without AudioWorklet. Uses the SAME bundled DSP. */
export function createScriptProcessorMusicNode(context: AudioContext, processorSource: string): MusicOutputNode {
    let Processor: any;
    class ProcessorBase {
        port = { onmessage: null as ((event: { data: unknown }) => void) | null };
    }
    // Source is our bundled processor implementation, never network/cache/user code.
    // Keep currentTime mutable so scheduled MIDI events use each output block's time.
    // eslint-disable-next-line no-new-func -- Evaluates only the fixed, bundled DSP implementation.
    const create = new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", `
        let currentTime = 0;
        ${processorSource}
        return (processor, time, output) => {
            currentTime = time;
            return processor.process([], [output], {});
        };
    `);
    const render = create(ProcessorBase, (_name: string, ctor: any) => { Processor = ctor; }, context.sampleRate);
    const processor = new Processor();
    const node = context.createScriptProcessor(2048, 0, 2);
    node.onaudioprocess = event => render(processor, event.playbackTime, [
        event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1),
    ]);
    return {
        port: { postMessage: (data: unknown) => processor.port.onmessage?.({ data }) },
        connect: node.connect.bind(node),
        disconnect: (() => { node.onaudioprocess = null; node.disconnect(); }) as AudioNode["disconnect"],
    };
}
