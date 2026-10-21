import { describe, expect, it } from "vitest";
import { compileTemplate, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { DATE_ZONES, DATE_ZONE_RULE, formatBoundValue, renderToHtml } from "../../catalog/index.js";
import type { DateZone } from "../../catalog/index.js";

function render(template: WidgetTemplate, data: unknown): string {
  return renderToHtml(compileTemplate(template)({ kind: "x", data }));
}
const at = (zone?: DateZone): WidgetTemplate => ({
  tag: "p",
  children: [{ bind: "at", format: { type: "date", pattern: "HH:mm", ...(zone === undefined ? {} : { zone }) } }]
});

describe("date zones", () => {
  it("a date in the value's own offset", () => {
    expect(render(at("value"), { at: "2026-10-21T09:30:00-07:00" })).toBe("<p>09:30</p>");
    expect(render(at("value"), { at: "2026-10-21T09:30:00" })).toBe("<p>09:30</p>");
    expect(render(at("value"), { at: 1700000000 })).toBe("<p>22:13</p>");
    expect(render(at(), { at: "2026-10-21T09:30:00-07:00" })).toBe("<p>16:30</p>");
    expect(render(at("utc"), { at: "2026-10-21T09:30:00-07:00" })).toBe("<p>16:30</p>");
  });

  it("reads every offset form the ISO grammar admits", () => {
    const value = (input: unknown, pattern = "yyyy-MM-dd HH:mm:ss") =>
      formatBoundValue(input, { type: "date", pattern, zone: "value" });
    expect(value("2026-10-21T09:30:00Z")).toBe("2026-10-21 09:30:00");
    expect(value("2026-10-21T09:30:00+05:30")).toBe("2026-10-21 09:30:00");
    expect(value("2026-10-21T09:30:00+0530")).toBe("2026-10-21 09:30:00");
    expect(value("2026-10-21T23:45:10.987654-11:00")).toBe("2026-10-21 23:45:10");
    expect(value("2026-10-21 23:45")).toBe("2026-10-21 23:45:00");
    expect(value("2026-10-21")).toBe("2026-10-21 00:00:00");
    expect(value(1700000000000)).toBe("2023-11-14 22:13:20");
    expect(value("2026-01-01T00:30:00+14:00", "yyyy-MM-dd HH:mm")).toBe("2026-01-01 00:30");
    expect(formatBoundValue("2026-01-01T00:30:00+14:00", { type: "date", pattern: "yyyy-MM-dd HH:mm" })).toBe(
      "2025-12-31 10:30"
    );
  });

  it("a viewer-zone date carries its instant for the frame", () => {
    const template: WidgetTemplate = {
      tag: "p",
      children: [{ bind: "at", format: { type: "date", pattern: "dd-MM HH:mm", zone: "viewer" } }]
    };
    expect(render(template, { at: "2026-10-21T09:30:00-07:00" })).toBe(
      '<p><time datetime="2026-10-21T16:30:00.000Z" data-wg-date="dd-MM HH:mm">21-10 16:30</time></p>'
    );
    expect(render(template, { at: "soon" })).toBe("<p>soon</p>");
    expect(render(template, {})).toBe("<p></p>");
    // An epoch beyond the Date range parses as a number but names no instant.
    expect(render(template, { at: 1e300 })).not.toContain("<time");
  });

  it("a viewer-zone date's text equals the UTC rendering", () => {
    const utc: WidgetTemplate = { tag: "p", children: [{ bind: "at", format: { type: "date", pattern: "yyyy-MM-dd HH:mm" } }] };
    const viewer: WidgetTemplate = {
      tag: "p",
      children: [{ bind: "at", format: { type: "date", pattern: "yyyy-MM-dd HH:mm", zone: "viewer" } }]
    };
    for (const value of ["2026-10-21T09:30:00-07:00", "2026-10-21", 1700000000]) {
      const plain = render(utc, { at: value }).replace(/<\/?p>/g, "");
      expect(render(viewer, { at: value })).toContain(`>${plain}</time>`);
    }
  });
});

describe("date zone validation", () => {
  const attr = (format: unknown) => validateTemplate({ tag: "span", attrs: { title: { bind: "at", format } } });
  const text = (format: unknown) => validateTemplate({ tag: "span", children: [{ bind: "at", format }] });

  it("a viewer zone on an attribute value is refused", () => {
    const result = attr({ type: "date", pattern: "HH:mm", zone: "viewer" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
    expect(result.error.message).toContain("'format.zone'");
    expect(result.error.message).toContain("utc or value");
    expect(attr({ type: "date", pattern: "HH:mm", zone: "value" }).ok).toBe(true);
    expect(attr({ type: "date", pattern: "HH:mm", zone: "utc" }).ok).toBe(true);
  });

  it("accepts every zone on a text bind and refuses an unknown one", () => {
    for (const zone of DATE_ZONES) expect(text({ type: "date", pattern: "HH:mm", zone }).ok).toBe(true);
    for (const zone of ["local", "America/Bogota", 5, null]) {
      const result = text({ type: "date", pattern: "HH:mm", zone });
      expect(result.ok, String(zone)).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("utc, value, viewer");
    }
  });

  it("states the rule once, naming every zone", () => {
    for (const zone of DATE_ZONES) expect(DATE_ZONE_RULE).toContain(zone);
  });
});
