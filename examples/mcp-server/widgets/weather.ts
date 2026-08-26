import type { CustomWidget } from "./index.js";

/**
 * The reference INTERACTIVE widget: a card with a `prompt` button (proposes
 * a follow-up message the user reviews and sends) and an `http` refresh
 * bound inline to Open-Meteo's public forecast API (no key needed), plus
 * a widget-level `load` that fetches the live temperature when the widget
 * first renders in an Apps host. Agents supply only the coordinates; the
 * action fills in the reading.
 */
const forecast = {
  kind: "http" as const,
  method: "GET" as const,
  url: "https://api.open-meteo.com/v1/forecast",
  input: {
    type: "object",
    properties: {
      latitude: { type: "number" },
      longitude: { type: "number" },
      current_weather: { type: "boolean" }
    },
    required: ["latitude", "longitude"]
  },
  output: {
    type: "object",
    properties: {
      current_weather: {
        type: "object",
        properties: { temperature: { type: "number" }, windspeed: { type: "number" } }
      }
    },
    required: ["current_weather"]
  }
};

const readingBinding = {
  definition: forecast,
  input: { latitude: "latitude", longitude: "longitude", current_weather: { const: true } },
  // The response's current_weather lands under `reading`; the rest stays.
  output: { mode: "patch" as const, path: "reading", map: { ".": "current_weather" } }
};

export const weatherWidget: CustomWidget = {
  kind: "weather",
  template: {
    tag: "div",
    attrs: { class: "wg-card wg-weather" },
    children: [
      { tag: "h2", children: [{ bind: "place" }] },
      {
        when: "reading",
        template: {
          tag: "p",
          children: [{ bind: "reading.temperature" }, " °C · wind ", { bind: "reading.windspeed" }, " km/h"]
        },
        else: { tag: "p", attrs: { class: "wg-muted" }, children: ["No reading yet."] }
      },
      {
        tag: "div",
        attrs: { class: "wg-weather-actions" },
        children: [
          { tag: "button", action: readingBinding, children: ["Refresh"] },
          {
            tag: "button",
            action: { definition: { kind: "prompt", text: ["What should I wear today in ", { bind: "place" }, "?"] } },
            children: ["Ask about today"]
          }
        ]
      }
    ]
  },
  descriptor: {
    description:
      "Current weather for a place (Open-Meteo). Provide the place name and coordinates; the widget loads and refreshes the live reading itself.",
    dataShape: "{ place: string, latitude: number, longitude: number, reading?: { temperature, windspeed } }",
    dataExample: { place: "Vancouver", latitude: 49.28, longitude: -123.12 },
    dataSchema: {
      type: "object",
      required: ["place", "latitude", "longitude"],
      properties: {
        place: { type: "string" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        reading: { type: "object" }
      }
    },
    styles: {
      ".wg-weather-actions": { display: "flex", gap: "8px", "margin-top": "8px" },
      ".wg-weather-actions button": {
        font: "inherit",
        padding: "4px 10px",
        border: "1px solid var(--wg-border)",
        "border-radius": "var(--wg-radius)",
        background: "var(--wg-surface, var(--wg-bg))",
        color: "var(--wg-fg)"
      }
    }
  },
  load: readingBinding
};
