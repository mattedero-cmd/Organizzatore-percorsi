// Entry point Vercel (v5.080): funzione serverless NATIVA.
// Prima il progetto esportava un intero http.Server (server/index.js) tramite la
// config legacy "builds": il runtime doveva intercettare listen() e fare da proxy
// a ogni richiesta — ed era lì che le richieste restavano appese all'infinito.
// Ora Vercel invoca direttamente il nostro handler (req, res): niente bridge,
// niente porta, comportamento standard e prevedibile.
// Il routing interno (/api/*, /share/*) resta tutto in requestHandler; i file in
// /public sono serviti da Vercel come statici (vedi vercel.json → rewrites).
import { requestHandler } from "../server/index.js";

export default requestHandler;
