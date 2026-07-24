(() => {
  let lastPointerAt = 0;
  let applyingRemoteScroll = false;

  function send(type, payload) {
    window.parent.postMessage({ type: "MEETING_PLATFORM_PROJECT_EVENT", eventType: type, payload }, "*");
  }

  window.parent.postMessage({ type: "MEETING_PLATFORM_BRIDGE_READY" }, "*");

  window.addEventListener("pointermove", (event) => {
    const now = Date.now();
    if (now - lastPointerAt < 33) return;
    lastPointerAt = now;
    send("pointer", {
      x: Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
      y: Math.max(0, Math.min(1, event.clientY / window.innerHeight)),
    });
  });

  window.addEventListener("click", (event) => {
    send("click", {
      x: Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
      y: Math.max(0, Math.min(1, event.clientY / window.innerHeight)),
    });
  });

  window.addEventListener("scroll", () => {
    if (applyingRemoteScroll) return;
    const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    send("scroll", { y: Math.max(0, Math.min(1, window.scrollY / documentHeight)) });
  }, { passive: true });

  window.addEventListener("message", (message) => {
    const data = message.data;
    if (!data || data.type !== "MEETING_PLATFORM_REMOTE_EVENT") return;
    if (data.eventType === "scroll") {
      const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      applyingRemoteScroll = true;
      window.scrollTo({ top: documentHeight * data.payload.y, behavior: "auto" });
      window.setTimeout(() => { applyingRemoteScroll = false; }, 80);
    }
  });
})();
