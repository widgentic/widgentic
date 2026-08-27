/**
 * Browser bundle entry (`@widgentic/designer/browser`): loading this module
 * from a <script type="module"> registers the designer custom elements, so a
 * page without a bundler can host the designers. Bundler users import the
 * package root instead.
 */
import { defineActionDesignerElement, defineDesignerElement, defineSchemaDesignerElement, defineThemeDesignerElement } from "./index.js";

defineActionDesignerElement();
defineDesignerElement();
defineSchemaDesignerElement();
defineThemeDesignerElement();

export {};
