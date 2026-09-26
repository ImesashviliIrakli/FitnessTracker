// Side-effect module: human wording for Zod's built-in messages ("Too small: expected number to be >=0").
// Imported once from main.tsx (and from tests that render forms). Messages given in a schema still win.
import { z } from "zod";

const fmt = (v: unknown) => (typeof v === "number" || typeof v === "bigint" ? Number(v).toLocaleString() : String(v));

z.config({
  // No eval probe: the strict CSP (script-src 'self') reports it as a violation even though Zod catches it.
  jitless: true,
  customError: (iss) => {
    switch (iss.code) {
      case "invalid_type":
        if (iss.expected === "int") return "Must be a whole number";
        return iss.input === undefined || iss.input === null || iss.input === "" || Number.isNaN(iss.input) ? "Required" : "Enter a valid value";
      case "too_small":
        if (iss.origin === "string") return Number(iss.minimum) <= 1 ? "Required" : `Use at least ${fmt(iss.minimum)} characters`;
        if (iss.origin === "array") return Number(iss.minimum) <= 1 ? "Add at least one" : `Add at least ${fmt(iss.minimum)}`;
        return iss.inclusive ? `Must be ${fmt(iss.minimum)} or more` : `Must be more than ${fmt(iss.minimum)}`;
      case "too_big":
        if (iss.origin === "string") return `Use at most ${fmt(iss.maximum)} characters`;
        if (iss.origin === "array") return `Up to ${fmt(iss.maximum)} allowed`;
        return iss.inclusive ? `Must be at most ${fmt(iss.maximum)}` : `Must be less than ${fmt(iss.maximum)}`;
      case "not_multiple_of":
        return `Must be a multiple of ${fmt(iss.divisor)}`;
      case "invalid_format":
        return "Check the format";
      case "invalid_value":
        return "Choose one of the options";
      default:
        return "Check this value";
    }
  },
});
