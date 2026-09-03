import assert from "node:assert/strict";

import { CacheFiles } from "@august/osrs-engine/cache/CacheFiles";
import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import { HSL_RGB_MAP } from "@august/osrs-engine/graphics/color/OsrsColor";
import { Rasterizer3D } from "@august/osrs-engine/graphics/Rasterizer3D";
import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { SkeletalBone } from "@august/osrs-engine/model/skeletal/SkeletalBone";
import { RasterizerOperation } from "@august/osrs-engine/texture/procedural/operation/RasterizerOperation";
import { UnsupportedOperationError } from "@august/osrs-engine/util/UnsupportedOperationError";

function blend(source: number, destination: number, sourceAlpha: number): number {
    const destinationAlpha = 256 - sourceAlpha;
    const weightedSource =
        (((destinationAlpha * (source & 0xff00)) >> 8) & 0xff00) +
        (((destinationAlpha * (source & 0xff00ff)) >> 8) & 0xff00ff);
    return (
        ((((destination & 0xff00ff) * sourceAlpha) >> 8) & 0xff00ff) +
        (((sourceAlpha * (destination & 0xff00)) >> 8) & 0xff00) +
        weightedSource
    );
}

function testLowResolutionGouraudScanlines(): void {
    const previousLowResolution = Rasterizer3D.rasterGouraudLowRes;
    const previousAlpha = Rasterizer3D.rasterAlpha;
    const previousClip = Rasterizer3D.rasterClipEnable;
    try {
        Rasterizer3D.rasterGouraudLowRes = true;
        Rasterizer3D.rasterClipEnable = false;
        Rasterizer3D.rasterAlpha = 0;

        const opaque = new Int32Array(10).fill(-1);
        Rasterizer3D.rasterGouraudLine(opaque, 0, 1, 10, 0, 256);
        assert.deepEqual([...opaque], [
            -1,
            ...new Array(4).fill(HSL_RGB_MAP[1]),
            ...new Array(4).fill(HSL_RGB_MAP[5]),
            HSL_RGB_MAP[9],
        ]);

        Rasterizer3D.rasterAlpha = 64;
        const destination = 0x204060;
        const alpha = new Int32Array(5).fill(destination);
        Rasterizer3D.rasterGouraudLine(alpha, 0, 0, 5, 16 << 8, 256);
        assert.deepEqual([...alpha], [
            ...new Array(4).fill(blend(HSL_RGB_MAP[16], destination, 64)),
            blend(HSL_RGB_MAP[20], destination, 64),
        ]);
    } finally {
        Rasterizer3D.rasterGouraudLowRes = previousLowResolution;
        Rasterizer3D.rasterAlpha = previousAlpha;
        Rasterizer3D.rasterClipEnable = previousClip;
    }
}

function testUnsupportedEngineContracts(): void {
    const classicInfo: CacheInfo = {
        name: "classic-test",
        game: "classic",
        environment: "live",
        revision: 1,
        timestamp: "1970-01-01T00:00:00.000Z",
        size: 0,
    };
    const files = new CacheFiles(new Map());

    assert.throws(
        () => CacheFiles.fetchFiles("classic", "/cache/", classicInfo.name),
        UnsupportedOperationError,
    );
    assert.throws(() => CacheSystem.fromFiles("classic", files), UnsupportedOperationError);
    assert.throws(
        () => getCacheLoaderFactory(classicInfo, new CacheSystem([])),
        UnsupportedOperationError,
    );
    assert.throws(
        () => SkeletalBone.readMat4(new ByteBuffer(new Int8Array()), true),
        UnsupportedOperationError,
    );

    const rasterizer = new RasterizerOperation();
    assert.throws(
        () => rasterizer.decode(0, new ByteBuffer(new Int8Array([1, 4]))),
        UnsupportedOperationError,
    );
}

testLowResolutionGouraudScanlines();
testUnsupportedEngineContracts();
console.log("OSRS engine stub contract tests passed");
