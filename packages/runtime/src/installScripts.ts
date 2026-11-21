/**
 * Lets a minted piece draw its script layers: the artist's own code, running in the artist's
 * own page, like any generative piece. Built to dist/scripts.js, which reads every helper from
 * the engine's global; only pieces with script layers include it.
 */
import { setScriptRunner } from "../../core/src/script.ts";
import { scriptRunner } from "./compile.ts";

setScriptRunner(scriptRunner);
