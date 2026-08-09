import type { WidgetDescriptorInput } from "widgentic/catalog";
import type { WidgetTemplate } from "widgentic/templates";
import { invoiceWidget } from "./invoice.js";
import { xPostWidget } from "./x-post.js";

/** A template-registered custom widget: kind + template + descriptor. */
export interface CustomWidget {
  kind: string;
  template: WidgetTemplate;
  descriptor: WidgetDescriptorInput;
}

/** All custom widgets the demo server registers at startup. */
export const customWidgets: CustomWidget[] = [invoiceWidget, xPostWidget];
