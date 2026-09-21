const STORAGE_KEY = "prudenceReflectEnabled";
const toggle = document.getElementById("toggle");

chrome.storage.local.get([STORAGE_KEY], (result) => {
  toggle.checked = result[STORAGE_KEY] !== false; // default ON
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ [STORAGE_KEY]: toggle.checked });
});
