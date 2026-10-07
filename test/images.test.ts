import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promptSession } from "../src/server/client";
import { ToolShuttle } from "../src/provider/tools";
import {
  capImages,
  dataUriFor,
  isValidDataUri,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_TURN,
  MAX_TURN_IMAGE_BYTES,
  toolFileForImage,
  type ImageBytes,
} from "../src/provider/images";

function image(size: number, mime = "image/png", fill = 7): ImageBytes {
  return { data: Buffer.alloc(size, fill), mimeType: mime };
}

function fakeImage(byteLength: number, mime = "image/png"): ImageBytes {
  return { data: { byteLength } as unknown as Uint8Array, mimeType: mime };
}

describe("capImages (T-0023 Q2 caps)", () => {
  it("keeps small images", () => {
    const { kept, droppedPlaceholders } = capImages([image(3), image(4, "image/jpeg")]);
    assert.equal(kept.length, 2);
    assert.deepEqual(droppedPlaceholders, []);
  });

  it("drops a single image over 15 MB with a placeholder", () => {
    const { kept, droppedPlaceholders } = capImages([fakeImage(MAX_IMAGE_BYTES + 1)]);
    assert.equal(kept.length, 0);
    assert.equal(droppedPlaceholders.length, 1);
    assert.ok(droppedPlaceholders[0].includes("exceeds"));
  });

  it(`caps at ${MAX_IMAGES_PER_TURN} images per turn`, () => {
    const images = [];
    for (let i = 0; i < MAX_IMAGES_PER_TURN + 1; i++) {
      images.push(image(10));
    }
    const { kept, droppedPlaceholders } = capImages(images);
    assert.equal(kept.length, MAX_IMAGES_PER_TURN);
    assert.equal(droppedPlaceholders.length, 1);
    assert.ok(droppedPlaceholders[0].includes("per-turn image cap"));
  });

  it(`caps total bytes at ${MAX_TURN_IMAGE_BYTES}`, () => {
    const each = 15 * 1024 * 1024; // passes the per-image cap, trips the turn total on #3
    // Fake sizes only (capImages reads byteLength, no allocation).
    const { kept, droppedPlaceholders } = capImages([fakeImage(each), fakeImage(each), fakeImage(each)]);
    assert.equal(kept.length, 2);
    assert.equal(droppedPlaceholders.length, 1);
  });
});

describe("dataUriFor (round-trip)", () => {
  it("encodes bytes the engine decodeDataURL can read back", () => {
    const original = Buffer.from([1, 2, 3, 250, 0, 255]);
    const uri = dataUriFor({ data: original, mimeType: "image/png" });
    assert.ok(uri.startsWith("data:image/png;base64,"));
    assert.deepEqual(Buffer.from(uri.split(",")[1], "base64"), original);
  });
});

describe("toolFileForImage (executor file parts)", () => {
  it("inlines bytes as data: URIs (provider requires data:, never file://)", () => {
    const file = toolFileForImage({ data: Buffer.from([5]), mimeType: "image/gif" });
    assert.ok(file?.uri.startsWith("data:image/gif;base64,"));
    assert.equal(file?.mime, "image/gif");
    assert.ok(isValidDataUri(file!.uri));
  });

  it("keeps the given name when present", () => {
    const file = toolFileForImage({ data: Buffer.from([5]), mimeType: "image/png", name: "erro1.png" });
    assert.equal(file?.name, "erro1.png");
  });

  it("ignores non-image mime types", () => {
    assert.equal(toolFileForImage({ data: Buffer.from([5]), mimeType: "application/pdf" }), undefined);
  });

  it("rejects malformed base64 rather than poisoning the provider", () => {
    assert.equal(isValidDataUri("data:image/png;base64,!!!"), false);
    assert.equal(isValidDataUri("file:///tmp/erro1.png"), false);
  });
});

describe("promptSession files (T-0023 prompt transport)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function captureFetch() {
    const seen: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
      seen.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ data: { id: "ses_x" } }), { status: 200 });
    }) as unknown as typeof fetch;
    return seen;
  }

  it("sends files alongside text when present", async () => {
    const seen = captureFetch();
    await promptSession("http://127.0.0.1:9", "", "ses_x", {
      text: "explain attached image [Image 1: image/png (3 bytes)]",
      files: [{ uri: "data:image/png;base64,AQID", name: "image-1.png" }],
    });
    assert.equal(seen.length, 1);
    const body = seen[0].body as { text: string; files?: Array<{ uri: string; name?: string }> };
    assert.ok(body.text.includes("explain attached image"));
    assert.equal(body.files?.length, 1);
    assert.equal(body.files?.[0].uri, "data:image/png;base64,AQID");
  });

  it("omits files for text-only turns (byte-identical admission)", async () => {
    const seen = captureFetch();
    await promptSession("http://127.0.0.1:9", "", "ses_x", { text: "hello" });
    const body = seen[0].body as { text: string; files?: unknown };
    assert.equal(body.text, "hello");
    assert.ok(!("files" in body));
  });
});

describe("shuttle resolve carries files (T-0023 Q3)", () => {
  it("delivers text + files to the held executor reply", async () => {
    const shuttle = new ToolShuttle();
    const url = await shuttle.start("test-token-t23");
    try {
      const sid = "ses_img";
      const replyPromise = fetch(`${url}/oct/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-oct-token": "test-token-t23" },
        body: JSON.stringify({ sessionID: sid, id: "eng1", tool: "oct__view_image", input: {} }),
      }).then(async (r) => (await r.json()) as { ok: boolean; text: string; files?: unknown[] });
      const deadline = Date.now() + 2000;
      while (shuttle.blockedFor(sid).length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(shuttle.blockedFor(sid).length, 1);
      const files = [{ uri: "data:image/png;base64,AQID", mime: "image/png" }];
      assert.equal(shuttle.resolve(sid, "eng1", "[Image 1: image/png (3 bytes)]", files), true);
      const reply = await replyPromise;
      assert.equal(reply.ok, true);
      assert.ok(reply.text.includes("[Image 1:"));
      assert.equal(reply.files?.length, 1);
    } finally {
      await shuttle.dispose("test done");
    }
  });

  it("returns false for unknown calls", async () => {
    const shuttle = new ToolShuttle();
    await shuttle.start("test-token-t23b");
    try {
      assert.equal(shuttle.resolve("ses_none", "eng_nope", "x"), false);
    } finally {
      await shuttle.dispose("test done");
    }
  });
});
