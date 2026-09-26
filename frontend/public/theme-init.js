// Applied before first paint to avoid a light/dark flash. Dark is the default look.
try {
  var t = localStorage.getItem("theme");
  if (t === "dark" || t === null || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches))
    document.documentElement.classList.add("dark");
} catch (e) {
  document.documentElement.classList.add("dark");
}
