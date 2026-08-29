declare module "bzip2" {
    interface Bzip2Api {
        array(input: Uint8Array): number[];
        simple(input: number[]): Uint8Array;
    }

    const bzip2: Bzip2Api;
    export default bzip2;
}
