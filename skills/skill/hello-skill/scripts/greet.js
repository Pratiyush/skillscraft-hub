#!/usr/bin/env node

/**
 * greet.js — Generate greeting messages in multiple languages.
 *
 * Usage:
 *   node greet.js --lang <iso-639-1-code>
 *
 * Examples:
 *   node greet.js --lang en
 *   node greet.js --lang es
 *   node greet.js --lang ja
 */

const { parseArgs } = require("node:util");

const GREETINGS = {
  en: { greeting: "Hello, world!", formal: "Good day, dear user." },
  es: { greeting: "Hola, mundo!", formal: "Buenos dias, estimado usuario." },
  fr: { greeting: "Bonjour, le monde!", formal: "Bonjour, cher utilisateur." },
  de: { greeting: "Hallo, Welt!", formal: "Guten Tag, sehr geehrter Benutzer." },
  ja: { greeting: "\u3053\u3093\u306b\u3061\u306f\u4e16\u754c!", formal: "\u3053\u3093\u306b\u3061\u306f\u3001\u30e6\u30fc\u30b6\u30fc\u69d8\u3002" },
  zh: { greeting: "\u4f60\u597d\uff0c\u4e16\u754c\uff01", formal: null },
  ko: { greeting: "\uc548\ub155\ud558\uc138\uc694, \uc138\uacc4!", formal: null },
  pt: { greeting: "Ol\u00e1, mundo!", formal: null },
  ar: { greeting: "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645!", formal: null },
  hi: { greeting: "\u0928\u092e\u0938\u094d\u0924\u0947, \u0926\u0941\u0928\u093f\u092f\u0627!", formal: null },
};

const { values } = parseArgs({
  options: { lang: { type: "string", default: "en" } },
});

const lang = values.lang;
const supported = Object.prototype.hasOwnProperty.call(GREETINGS, lang);
const data = supported ? GREETINGS[lang] : GREETINGS.en;

console.log(
  JSON.stringify(
    {
      language: lang,
      greeting: data.greeting,
      formal: data.formal || null,
      fallback: !supported,
      supportedLanguages: Object.keys(GREETINGS),
    },
    null,
    2
  )
);
