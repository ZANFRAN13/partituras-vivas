declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    renderToSVG(page?: number): string;
    renderToTimemap(options?: Record<string, unknown>): unknown;
    getMIDIValuesForElement(id: string): unknown;
    getElementAttr(id: string): unknown;
    getPageCount(): number;
  }
}
