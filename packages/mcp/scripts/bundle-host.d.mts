// Types for the host bundle script, for the tests that build and evaluate the bundle.
import type { BuildOptions, BuildResult } from "esbuild";

export function hostBundleOptions(overrides?: BuildOptions): BuildOptions & { outfile: string };
export function hostBundleProblems(result: BuildResult, text: string): string[];
export function buildHostBundleText(): Promise<string>;
export function hostBundleAsExpression(moduleText: string): Promise<string>;
