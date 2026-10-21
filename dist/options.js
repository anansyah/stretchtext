(() => {
  // options.js
  var key = document.getElementById("key");
  var model = document.getElementById("model");
  var save = document.getElementById("save");
  var saved = document.getElementById("saved");
  async function load() {
    const { apiKey } = await chrome.storage.session.get("apiKey");
    if (apiKey) key.placeholder = "A key is connected for this session";
    const { model: chosen } = await chrome.storage.local.get("model");
    if (chosen) model.value = chosen;
  }
  save.addEventListener("click", async () => {
    const value = key.value.trim();
    if (value) await chrome.storage.session.set({ apiKey: value });
    await chrome.storage.local.set({ model: model.value });
    saved.textContent = "Saved.";
    setTimeout(() => {
      saved.textContent = "";
    }, 2e3);
  });
  load();
})();
