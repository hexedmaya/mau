import { mount } from "../index.js";
import Counter from "./Counter.js";

mount(document.getElementById("app"), Counter, { title: "Hallo aus .mau" });
