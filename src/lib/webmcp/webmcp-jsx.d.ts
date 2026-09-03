/* eslint-disable @typescript-eslint/no-unused-vars -- generic params are required by the augmented interfaces */
/**
 * Declarative WebMCP attributes for JSX. The attribute names are unprefixed and all-lowercase
 * (`toolname`, not `data-tool-name`), which is what the current explainer and Chrome's
 * declarative-api doc specify; React passes unknown lowercase attributes straight to the DOM.
 */
import "react";

declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    /** Present only on forms an agent may submit without a human. We never set it. */
    toolautosubmit?: boolean | "";
  }
  interface HTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
