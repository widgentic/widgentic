import type { WidgetDescriptorInput } from "@widgentic/core";
import type { WidgetTemplate } from "@widgentic/core";
import type { ActionBinding } from "@widgentic/core";
import { invoiceWidget } from "./invoice.js";
import { xPostWidget } from "./x-post.js";
import { weatherWidget } from "./weather.js";

/**
 * A template-registered custom widget: kind + template + descriptor, plus
 * an optional `load` binding (an http GET action run once when the widget
 * first renders in an Apps host).
 */
export interface CustomWidget {
  kind: string;
  template: WidgetTemplate;
  descriptor: WidgetDescriptorInput;
  load?: ActionBinding;
}

/** All custom widgets the demo server registers at startup. */
export const customWidgets: CustomWidget[] = [invoiceWidget, xPostWidget, weatherWidget];

/** The individual example widgets, for hosts and tests that want one at a time. */
export { invoiceWidget, xPostWidget, weatherWidget };
