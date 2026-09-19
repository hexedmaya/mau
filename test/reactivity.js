import * as M from "../index.js";
import cases from "./runtime-cases.js";

const results = document.getElementById("results");
for (const [name, fn] of cases) {
  const el = document.createElement("li");
  try {
    fn(M);
    el.className = "ok";
    el.textContent = name;
  } catch (e) {
    el.className = "fail";
    el.textContent = `${name}: ${e.message}`;
  }
  results.append(el);
}
