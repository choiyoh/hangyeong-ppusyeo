(() => {
  const parts = ["style.b64.0","style.b64.1","style.b64.2","style.b64.3"];
  Promise.all(parts.map(p => fetch(p + "?v=1").then(r => r.text())))
    .then(async chunks => {
      const b64 = chunks.join("");
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([bin]).stream().pipeThrough(ds);
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const css = new TextDecoder().decode(bytes);
      const s = document.createElement("style");
      s.id = "hp-style";
      s.textContent = css;
      document.head.appendChild(s);
    })
    .catch(e => console.error("style load failed", e));
})();
