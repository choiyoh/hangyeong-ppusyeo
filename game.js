(() => {
  const parts = ["game.b64.0", "game.b64.1"];
  Promise.all(parts.map(p => fetch(p + "?v=1").then(r => r.text())))
    .then(async chunks => {
      const b64 = chunks.join("");
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([bin]).stream().pipeThrough(ds);
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const code = new TextDecoder().decode(bytes);
      (0, eval)(code);
    })
    .catch(e => console.error("행성뿌셔 load failed", e));
})();
